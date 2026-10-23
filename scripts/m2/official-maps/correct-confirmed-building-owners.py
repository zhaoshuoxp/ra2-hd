"""Restore native-supported owner paint in confirmed complete building families."""
import argparse
import hashlib
import json
import math
import shutil
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from selected_building_pixels import frame_pixels, read_page


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def corrected_data(base, data, indices, density, family, origin):
    if not base.size:
        return data.copy(), np.zeros(base.shape[:2], dtype=bool)
    red, green, blue = np.moveaxis(base[..., :3].astype(float), 2, 0)
    paint = ((base[..., 3] > 0) & (red > 35) & (red > green * 1.5)
        & (red > blue * 1.5) & (green - blue < (red - blue) * .25))
    native_owner = (indices >= 16) & (indices <= 31)
    seed = paint & native_owner & (data[..., 0] == 0)
    labels, count = ndimage.label(paint, np.ones((3, 3)))
    sizes = np.bincount(labels.ravel(), minlength=count + 1)
    supports = np.bincount(labels.ravel(), weights=seed.ravel(), minlength=count + 1)
    approved = (supports >= max(3, density * density / 4)) & (supports >= sizes * .15)
    if family == 'YAGNTC':
        # All eight retail plaza controls remap in matched native captures.
        # Two authored controls shifted beyond the original pixel mask. Recover
        # their complete small red components in the unchanged native plaza.
        for label, slices in enumerate(ndimage.find_objects(labels), 1):
            if slices is None:
                continue
            ys, xs = slices
            center_x = (xs.start + xs.stop) / (2 * density) + origin[0]
            center_y = (ys.start + ys.stop) / (2 * density) + origin[1]
            fixture = (65 <= center_x <= 205 and 158 <= center_y <= 198
                and xs.stop - xs.start <= 10 * density and ys.stop - ys.start <= 8 * density
                and density * density <= sizes[label] <= 32 * density * density)
            approved[label] |= fixture
    approved[0] = False
    added = paint & approved[labels] & (data[..., 0] == 0)
    result = data.copy()
    ramp = np.asarray([63, 59, 55, 52, 48, 44, 41, 37, 33, 30, 26, 22, 19, 15, 11, 8]) * 4
    shades = abs(red[..., None] - ramp).argmin(axis=2)
    result[..., 0][added] = 255
    result[..., 1][added] = shades[added]
    # Fixed purple/white electricity, neutral metal and existing owner pixels stay exact.
    assert np.array_equal(result[~added], data[~added])
    return result, added


def patch_pool(arrays, changes, page):
    columns = arrays['base'].shape[1] // 4
    def tiles(array):
        return array.reshape(-1, 4, columns, 4, 4).transpose(0, 2, 1, 3, 4).reshape(-1, 4, 4, 4)
    count = page['tileCount']
    color, data = [list(tiles(arrays[role])[:count]) for role in ['base', 'data']]
    lookup = arrays['map'].copy()
    updated = {}
    for rect, values, mask in changes:
        x, y, _, _ = rect
        py, px = np.where(mask)
        for local_y, local_x in zip(py, px):
            gx, gy = x + int(local_x), y + int(local_y)
            tile = gy // 4, gx // 4
            if tile not in updated:
                code = lookup[tile].astype(np.uint32)
                index = int(code[0] + code[1] * 256 + code[2] * 65536)
                updated[tile] = color[index], data[index].copy()
            updated[tile][1][gy % 4, gx % 4] = values[local_y, local_x]
    known = {c.tobytes() + d.tobytes(): i for i, (c, d) in enumerate(zip(color, data))}
    for tile, (c, d) in updated.items():
        key = c.tobytes() + d.tobytes()
        if key not in known:
            known[key] = len(color)
            color.append(c)
            data.append(d)
        index = known[key]
        lookup[tile] = [index & 255, (index >> 8) & 255, (index >> 16) & 255, 255]
    rows = math.ceil(len(color) / columns)
    assert columns <= 512 and rows <= 512, 'Retain the physical page limit.'
    result = {'map': lookup}
    for role, entries in [('base', color), ('data', data)]:
        padded = np.zeros((rows * columns, 4, 4, 4), np.uint8)
        if role == 'data':
            padded[..., 3] = 255
        padded[:len(entries)] = entries
        result[role] = padded.reshape(rows, columns, 4, 4, 4).transpose(0, 2, 1, 3, 4).reshape(rows * 4, columns * 4, 4)
    page['tileCount'] = len(color)
    page['size'] = [columns * 4, rows * 4]
    page['gpuBytes'] = columns * rows * 16 * 6 + lookup.shape[0] * lookup.shape[1] * 4
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('selection', type=Path)
    parser.add_argument('native', type=Path)
    parser.add_argument('revision')
    parser.add_argument('output', type=Path)
    parser.add_argument('--catalog', type=Path, required=True)
    parser.add_argument('--family', choices=['YAGNTC', 'ATESLA'], required=True)
    args = parser.parse_args()
    assert not args.output.exists()
    args.output.mkdir(parents=True)
    selection = json.loads(args.selection.read_text())
    selected = {row['sha256']: Path(row['file']) for row in selection['members']}
    native = json.loads((args.native / 'source.json').read_text())
    assert not native['failures']
    sources = {row['key']: row for row in native['sources']}
    catalog = json.loads(args.catalog.read_text())
    records = []
    for identity, declaration in catalog.items():
        if declaration['family'] != args.family:
            continue
        original_family = Path('.local') / declaration['familyPath']
        assert sha(original_family) == declaration['familyHash']
        family = json.loads(original_family.read_text())
        target_family = original_family.parent.parent / args.revision / 'family.json'
        assert not target_family.parent.exists()
        target_family.parent.mkdir()
        assert len(family['members']) == len(declaration['members'])
        for member in family['members']:
            original = selected[member['sha256']]
            manifest = json.loads(original.read_text())
            source = sources[f"{manifest['source']['member']}:{manifest['source']['sha256']}"]
            logical = {frame['nativeFrame']: frame for frame in manifest['logical']['frames']}
            target = original.parent.parent / args.revision
            assert not target.exists()
            shutil.copytree(original.parent, target)
            changes_count = 0
            frames = []
            for variant in manifest['variants']:
                density = variant['density']
                for page in variant['pages']:
                    arrays = read_page(original.parent, page)
                    changes, comparisons = [], []
                    for frame in variant['frames']:
                        if frame['page'] != page['id']:
                            continue
                        number = frame['nativeFrame']
                        native_frame = source['frames'][number]
                        file = args.native / native_frame['file']
                        assert sha(file) == native_frame['sha256']
                        indices = np.frombuffer(file.read_bytes(), np.uint8).reshape(*reversed(native_frame['size']))
                        indices = indices.repeat(density, 0).repeat(density, 1)
                        base, data = frame_pixels(arrays, frame['contentRect'])
                        values, added = corrected_data(base, data, indices, density,
                            args.family, logical[number]['trimOrigin'])
                        if added.any():
                            changes.append((frame['contentRect'], values, added))
                        comparisons.append((frame['contentRect'], base, values, added, frame))
                        total = int(added.sum())
                        changes_count += total
                        frames.append(dict(density=density, frame=number, addedOwnerPixels=total))
                    if not changes:
                        continue
                    # Explicit shared frames reuse one authored image. Native
                    # support from either declared state validates that image's
                    # paint component; preserve the existing alias with its union.
                    shared = {}
                    for rect, base, values, added, frame in comparisons:
                        key = tuple(rect)
                        if key not in shared:
                            shared[key] = (base, values.copy(), added.copy())
                        else:
                            assert 'sharedWith' in frame
                            previous_base, previous_values, previous_added = shared[key]
                            assert np.array_equal(base, previous_base)
                            previous_values[added] = values[added]
                            previous_added |= added
                    changes = [(list(rect), values, added) for rect, (_, values, added) in shared.items() if added.any()]
                    if 'map' in arrays:
                        updated = patch_pool(arrays, changes, page)
                    else:
                        updated = {role: values.copy() for role, values in arrays.items()}
                        for rect, values, mask in changes:
                            x, y, w, h = rect
                            updated['data'][y:y+h, x:x+w][mask] = values[mask]
                    for rect, base, _, _, frame in comparisons:
                        expected_data = shared[tuple(rect)][1]
                        actual_base, actual_data = frame_pixels(updated, rect)
                        assert np.array_equal(actual_base, base), 'Preserve every authored RGBA pixel.'
                        assert np.array_equal(actual_data, expected_data), 'Do not mutate shared tile aliases.'
                        original_data = frame_pixels(arrays, rect)[1]
                        row = next(row for row in frames if row['density'] == density
                            and row['frame'] == frame['nativeFrame'])
                        row['nativeSupportedPaintPixels'] = row['addedOwnerPixels']
                        row['addedOwnerPixels'] = int(((actual_data[..., 0] > 0)
                            & (original_data[..., 0] == 0)).sum())
                    for role, values in updated.items():
                        file = target / page[role]
                        Image.fromarray(values).save(file)
                        page[role + 'Sha256'] = sha(file)
                        page[role + 'Bytes'] = file.stat().st_size
            changes_count = sum(row['addedOwnerPixels'] for row in frames)
            manifest['packRevision'] = args.revision
            manifest['color']['nativeSupportedOwnerCorrection'] = dict(family=args.family,
                baseManifestSha256=member['sha256'], addedPixels=changes_count,
                mechanism='Native-supported red components and confirmed retail plaza controls; authored RGBA and fixed electricity preserved.')
            file = target / 'manifest.json'
            file.write_text(json.dumps(manifest, indent=2) + '\n')
            records.append(dict(member=member['member'], previous=str(original), previousSha256=member['sha256'],
                file=str(file.resolve()), sha256=sha(file), addedOwnerPixels=changes_count, frames=frames))
            member.update(revision=args.revision, sha256=sha(file))
        family['ownerCorrection'] = dict(baseFamilySha256=declaration['familyHash'],
            mechanism='Confirmed native owner controls retain complete family publication and unchanged artwork.')
        target_family.write_text(json.dumps(family, indent=2) + '\n')
        declaration.update(familyPath=str(target_family.relative_to('.local')), familyHash=sha(target_family))
    assert records and sum(row['addedOwnerPixels'] for row in records) > 0
    (args.output / args.catalog.name).write_text(json.dumps(catalog, indent=2) + '\n')
    (args.output / 'report.json').write_text(json.dumps(dict(schema='m2-3-confirmed-owner-correction-v1',
        family=args.family, records=records, catalogFile=str(args.catalog), originalCatalogSha256=sha(args.catalog),
        status='PASS_EXACT_ARTWORK_AND_FIXED_DATA_PRESERVATION_PENDING_NATIVE_QA'), indent=2) + '\n')
    print(json.dumps(dict(family=args.family, members=len(records), addedOwnerPixels=sum(row['addedOwnerPixels'] for row in records))))


if __name__ == '__main__':
    main()
