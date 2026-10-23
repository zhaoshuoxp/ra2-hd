"""Export all native Desert ore slots from new coherent mineral material mothers."""
import copy
import hashlib
import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_contours import register_contours

root = Path('.artifacts/m2-4/desert-ore-batch83-20261020')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
write = lambda p, value: p.write_text(json.dumps(value, indent=2) + '\n')
contract = read(root / 'baseline-contract.json')
base = Path('.local/environment-packs') / contract['selectedPack']['revision']
assert sha(base / 'manifest.json') == contract['selectedPack']['sha256']
manifest = read(base / 'manifest.json')
guide_file = Path('.artifacts/m2-4/desert-native-v1/source.json')
sources = {s['member']: s for s in read(guide_file)['sources']}
inventory_file = Path('.artifacts/m2-4/accepted-faction-routing-batches79-80-20261019/inventory-current-v1/inventory.json')
inventory = read(inventory_file)
family, revision = 'desert-ore', 'desert-environment-ore-batch83-v1-combined'
assert family not in contract['families']
destination = Path('.local/environment-packs') / revision
destination.mkdir(exist_ok=False)
preserved = {}
for file in base.rglob('*'):
    if not file.is_file() or file == base / 'manifest.json':
        continue
    target = destination / file.relative_to(base)
    target.parent.mkdir(parents=True, exist_ok=True)
    os.link(file, target)
    assert sha(target) == sha(file)
    preserved[str(file.relative_to(base))] = sha(file)


def warm(rgb):
    red, green, blue = np.moveaxis(rgb.astype(float), -1, 0)
    return (red > 35) & (green > red * .5) & (blue > green * .16) & (blue < green * 1.12) & (red > green * .9)


masters, native_samples, painted_samples = {}, [], []
for panel in read(root / 'mother-inputs.json')['panels']:
    file = root / f'ore-panel{panel["panel"]}-mother-v1.png'
    rgba = np.array(Image.open(file).convert('RGBA'))
    height, width = rgba.shape[:2]
    assert height % 2 == width % 2 == 0
    for record in panel['records']:
        col, row = record['quadrant']
        piece = rgba[row * height // 2:(row + 1) * height // 2,
                     col * width // 2:(col + 1) * width // 2].copy()
        valid = (piece[..., 3] >= 128) & warm(piece[..., :3])
        labels, _ = ndimage.label(valid)
        sizes = np.bincount(labels.ravel())
        keep = np.flatnonzero(sizes >= 64)
        valid = np.isin(labels, keep[keep != 0])
        assert valid.sum() > 1000
        ys, xs = np.where(valid)
        box = [int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)]
        x0, y0, x1, y1 = box
        rgb, valid = piece[y0:y1, x0:x1, :3].copy(), valid[y0:y1, x0:x1]
        painted_samples.append(rgb[valid])
        nearest = ndimage.distance_transform_edt(~valid, return_distances=False, return_indices=True)
        rgb[~valid] = rgb[tuple(nearest[:, ~valid])]
        source = sources[record['member']]
        native = source['frames'][record['nativeFrame']]
        assert record['nativeFrame'] == source['totalFrames'] // 2 - 1
        original_file = guide_file.parent / 'native' / native['file']
        assert sha(original_file) == native['rgbaSha256']
        original = np.fromfile(original_file, np.uint8).reshape(*native['size'][::-1], 4)
        interior = ndimage.binary_erosion(original[..., 3] > 0) & warm(original[..., :3])
        assert interior.any()
        native_samples.append(original[..., :3][interior])
        masters[record['member']] = dict(rgb=rgb, box=box, mother=str(file), motherSha256=sha(file),
            quadrant=record['quadrant'], nativeOrigin=native['origin'], nativeSize=native['size'])

# One non-spatial family color anchor preserves the source palette relationship
# without repeating the original pixel colors, noisy edges or highlight grid.
native_mean = np.concatenate(native_samples).mean(0)
painted_mean = np.concatenate(painted_samples).mean(0)
gain = np.clip(native_mean / painted_mean, .6, 1.8)
records, entries, extra_slots = [], [], []
for number in range(1, 13):
    name = f'tib{number:02d}.des'
    source, master = sources[name], masters[name]
    assert source['format'] == 'shp' and source['hasShadow'] and not source['remapable']
    assert source['canvas'] == [60, 60]
    assert sha(guide_file.parent / 'native' / source['nativeFile']) == source['sha256']
    count = source['totalFrames'] // 2
    assert count in [12, 13]
    if count == 13:
        extra_slots.append(dict(member=name, nativeFrame=12, status='PRESERVED_ORIGINAL_SOURCE_SLOT_NOT_REACHED_BY_STANDARD_RULES'))
    logical = [dict(nativeFrame=f['slot'], trimOrigin=f['origin'], trimSize=f['size'],
        legacyRenderSize=[n + n % 2 for n in f['size']], empty=f['empty']) for f in source['frames'][:count]]
    metadata = dict(schemaVersion=2, packId=family, packRevision=revision,
        source=dict(member=name, sha256=source['sha256'], theater='DESERT', kind='resolved-shp-member'),
        logical=dict(canvas=[60, 60], frames=logical), color=dict(representation='authored-sRGB-RGBA8-plus-RGBA8-data',
            structuralCoverage=dict(schema='native-structural-subpixel-coverage-v1', toleranceNativePixels=.7,
                maximumContourAreaChangeFraction=.025)), variants=[],
        authored=dict(desertOreBatch83=dict(mother=master['mother'], motherSha256=master['motherSha256'],
            material='NEW_CONTINUOUS_MINERAL_FACETS', nativeRgbCopiedPixels=0, nativeColorStatisticsOnly=True,
            sourceShadow='UNCHANGED_NATIVE_SOURCE', completeOriginalBodyFrames=count)))
    directory = destination / 'members' / name.replace('.', '-')
    frame_records = []
    for density in [2, 4]:
        width, cursor_x, cursor_y, row_height = 128 * density, 2, 2, 0
        frames, pieces = [], []
        for native in source['frames'][:count]:
            assert not native['empty']
            w, h = native['size']
            sw, sh = (w + w % 2) * density, (h + h % 2) * density
            if cursor_x + sw + 2 > width:
                cursor_x, cursor_y, row_height = 2, cursor_y + row_height + 4, 0
            frames.append(dict(nativeFrame=native['slot'], page='p0', sampleRect=[cursor_x, cursor_y, sw, sh],
                contentRect=[cursor_x, cursor_y, w * density, h * density]))
            cursor_x += sw + 4
            row_height = max(row_height, sh)
            index_file = guide_file.parent / 'native' / native['indexFile']
            assert sha(index_file) == native['indexSha256']
            indices = np.fromfile(index_file, np.uint8).reshape(h, w)
            yy, xx = np.indices((h * density, w * density), dtype=float)
            ox, oy = native['origin']
            mx, my = master['nativeOrigin']
            mw, mh = master['nativeSize']
            sx = (ox + (xx + .5) / density - mx) / mw * master['rgb'].shape[1] - .5
            sy = (oy + (yy + .5) / density - my) / mh * master['rgb'].shape[0] - .5
            rgb = np.stack([ndimage.map_coordinates(master['rgb'][..., c].astype(float),
                [sy, sx], order=1, mode='nearest') for c in range(3)], -1)
            pixels = np.zeros((h * density, w * density, 4), np.uint8)
            pixels[..., :3] = np.uint8(np.clip(np.rint(rgb * gain), 0, 255))
            pixels[..., 3] = (indices != 0).repeat(density, 0).repeat(density, 1) * 255
            data = np.zeros_like(pixels)
            data[..., 3] = 255
            pixels, data = register_contours(pixels, data, indices, density, False)
            pieces.append((pixels, data))
            frame_records.append(dict(density=density, nativeFrame=native['slot'], indexSha256=native['indexSha256'],
                nativeRgbCopiedPixels=0, sourceRegistration='UNCHANGED_ABSOLUTE_NATIVE_CANVAS'))
        height = cursor_y + row_height + 2
        pages = [np.zeros((height, width, 4), np.uint8), np.zeros((height, width, 4), np.uint8)]
        pages[1][..., 3] = 255
        for frame, (pixels, data) in zip(frames, pieces, strict=True):
            x, y, sw, sh = frame['sampleRect']
            _, _, w, h = frame['contentRect']
            for atlas, content, base_alpha in [(pages[0], pixels, True), (pages[1], data, False)]:
                padded = np.pad(content, ((2, sh - h + 2), (2, sw - w + 2), (0, 0)), mode='edge')
                if base_alpha:
                    padded[..., 3] = 0
                    padded[2:2 + h, 2:2 + w] = content
                atlas[y - 2:y + sh + 2, x - 2:x + sw + 2] = padded
        folder = directory / str(density) / 'p0'
        folder.mkdir(parents=True)
        page = dict(id='p0', size=[width, height])
        for role, pixels in zip(['base', 'data'], pages, strict=True):
            file = folder / (role + '.png')
            Image.fromarray(pixels).save(file)
            page.update({role: f'{density}-p0-{role}.png', role + 'Sha256': sha(file), role + 'Bytes': file.stat().st_size})
        metadata['variants'].append(dict(density=density, pages=[page], frames=frames))
    write(directory / 'manifest.json', metadata)
    entries.append(dict(member=name, path=str((directory / 'manifest.json').relative_to(destination)),
        sha256=sha(directory / 'manifest.json')))
    assert name not in contract['sources']
    descriptor = {k: copy.deepcopy(source[k]) for k in ['sha256', 'canvas', 'totalFrames', 'palette', 'hasShadow', 'remapable']}
    descriptor['bodyFrames'] = count
    contract['sources'][name] = descriptor
    records.append(dict(member=name, sourceSha256=source['sha256'], bodyFrames=count, originalShadowFrames=count,
        metadataSha256=sha(directory / 'manifest.json'), frames=frame_records))
names = [r['member'] for r in records]
rows = [r for r in inventory['rows'] if r['theater'] == 'DESERT' and r['kind'] == 'overlay'
        and r.get('source', {}).get('member') in names]
assert len(rows) == 24 and all(not r['dependencies'] for r in rows)
identities = sorted({r['id'] for r in rows})
assert set(identities) == {f'TIB{i:02d}' for i in range(1, 13)} | {f'TIB2_{i:02d}' for i in range(1, 13)}
for row in rows:
    assert row['edition'] == 'yr'
    assert row['source']['sha256'] == contract['sources'][row['source']['member']]['sha256']
    assert all(value <= 11 for u in row['usage'].values() for value in u['values'])
    assert row['id'] not in contract['identities']['yr']
    contract['identities']['yr'][row['id']] = family
basis = dict(theater='DESERT', members={n: contract['sources'][n] for n in names}, identities=identities)
family_hash = hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
contract['families'][family] = dict(members=names, identities=identities, editions=['yr'], kinds=['overlay'], familyHash=family_hash)
manifest['families'][family] = dict(familyHash=family_hash, members=entries)
manifest['revision'] = revision
write(destination / 'manifest.json', manifest)
pointer = dict(schemaVersion=1, revision=revision, sha256=sha(destination / 'manifest.json'))
contract['selectedPack'] = pointer
contract['extensions'] = dict(milestone='M2.4', baselineSelectedPack=read(root / 'baseline-contract.json')['selectedPack'],
    newFamilies=[family], state='COMPLETE_ORIGINAL_ORE_RANGE_EXPORTED_STATIC_NATIVE_VISUAL_PENDING')
write(root / 'contract-candidate-v1.json', contract)
write(root / 'export-and-preservation-v1.json', dict(status='COMPLETE_ORE_RANGE_EXPORTED_VALIDATION_PENDING',
    candidate=pointer, baseline=read(root / 'baseline-contract.json')['selectedPack'], memberRecords=records,
    preservedPayloadHashes=preserved, originalBodyFrames=148, originalShadowFrames=148, densityFrames=296,
    originalExtraBodySlots=extra_slots, originalStandardMaxFrame=11, initialMapMaximumFrame=11,
    familyColorAnchor=dict(nativeMean=native_mean.tolist(), paintedMean=painted_mean.tolist(), gain=gain.tolist(),
        nativeRgbPixelCopy=False, policy='ONE_NONSPATIAL_FAMILY_COLOR_GAIN_ONLY'),
    motherEvidence=[{k: v for k, v in master.items() if k != 'rgb'} | dict(member=name) for name, master in masters.items()],
    sourceMapsChanged=False, gameplayChanged=False, corePreparedChanged=False, native='NOT_RUN', visual='PENDING', windows='NOT_RUN', m24Complete=False))
print(json.dumps(dict(candidate=pointer, members=12, originalBodyFrames=148, densityFrames=296,
    preservedFiles=len(preserved), colorGain=gain.tolist(), selected=False)))
