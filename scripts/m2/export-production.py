"""Register authored assemblies and export the authorized complete terrain ledger."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('revision')
parser.add_argument('--root', type=Path, default=Path('.artifacts/m2-1/authoring-production-v3'))
parser.add_argument('--registration-only', action='store_true')
args = parser.parse_args()
root = args.root
source = json.loads((root / 'source.json').read_text())
layout = json.loads((root / 'layout.json').read_text())
generation = json.loads((root / 'generation-provenance.json').read_text())
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
assert len(generation['entries']) == 41
for entry in generation['entries']:
    for record in [entry['master'], entry['prompt'], *entry['references']]:
        assert sha(record['file']) == record['sha256'], record['file']
base_root = Path(source['acceptedBase']['root'])
assert sha(base_root / 'manifest.json') == source['acceptedBase']['sha256']
base = json.loads((base_root / 'manifest.json').read_text())
members = [m for g in source['groups'] for m in g['members']]
assert len(members) == 305 and sum(len(m['images']) for m in members) == 742
assert sum(m['accepted'] for m in members) == 69 and len(layout) == 236


def matte(rgb):
    """Identify non-art fluorescent registration debris in the preserved tool output."""
    red = (rgb[:, :, 0] > 230) & (rgb[:, :, 1] < 30)
    yellow = (rgb[:, :, 0] > 240) & (rgb[:, :, 1] > 240) & (rgb[:, :, 2] < 16)
    green = (rgb[:, :, 0] < 40) & (rgb[:, :, 1] > 240) & (rgb[:, :, 2] < 40)
    return red | yellow | green


def extrude(rgb, valid):
    """Fill transparent sampling RGB from its nearest covered authored pixel."""
    assert valid.any()
    if valid.all():
        return rgb
    indices = ndimage.distance_transform_edt(~valid, return_distances=False, return_indices=True)
    result = rgb.copy()
    result[~valid] = rgb[tuple(indices[:, ~valid])]
    return result


def register(master, info):
    sx, sy = master.width / 1254, master.height / 1254
    x, y, w, h = info['slotRect']
    x0, y0, x1, y1 = round(x * sx), round(y * sy), round((x + w) * sx), round((y + h) * sy)
    pixels = np.asarray(master.crop((x0, y0, x1, y1)))
    candidate = (pixels[:, :, 3] > 180) & ~matte(pixels[:, :, :3])
    labels, count = ndimage.label(candidate)
    assert count > 0
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    largest = int(sizes.argmax())
    connected = labels == largest
    # Small external flecks do not enlarge the registered sprite rectangle.
    # Native coverage remains authoritative after independent RGB sampling.
    ys, xs = np.where(connected)
    assert len(xs) > 1000
    rect = [x0 + int(xs.min()), y0 + int(ys.min()), int(xs.max() - xs.min() + 1),
            int(ys.max() - ys.min() + 1)]
    return rect


plates, originals, provenance, masters = {}, {}, [], {}
for member in members:
    if member['accepted']:
        continue
    name, info = member['member'], layout[member['member']]
    file = root / info['board']
    if file not in masters:
        masters[file] = Image.open(file).convert('RGBA')
    master = masters[file]
    x, y, w, h = register(master, info)
    crop = np.asarray(master.crop((x, y, x + w, y + h)))
    native = np.asarray(Image.open(root / f'{name}-native.png').convert('RGBA'))
    a = info['nativeAlphaBounds']
    capacity = min(w / (a[2] - a[0]), h / (a[3] - a[1]))
    assert capacity >= 4, (name, capacity, [x, y, w, h])
    native_mask = Image.fromarray(native[a[1]:a[3], a[0]:a[2], 3]).resize((w, h), Image.Resampling.NEAREST)
    covered = (np.asarray(native_mask) > 0) & (crop[:, :, 3] > 180) & ~matte(crop[:, :, :3])
    assert covered.any(), name
    plates[name] = extrude(crop[:, :, :3], covered)
    originals[name] = native
    provenance.append(dict(member=name, file=str(file), sha256=sha(file), masterSize=list(master.size),
                           sourceRect=[x, y, w, h], densityCapacity=capacity))

# Ground uses one coordinated material-family anchor. Structures use one anchor
# per complete assembly, retaining their original directional illumination.
anchors = {}
for member in members:
    if member['accepted']:
        continue
    key = f"set-{member['setIndex']}" if member['setIndex'] in [33, 34] else member['member']
    anchors.setdefault(key, []).append(member['member'])
for key, names in anchors.items():
    native_colors, authored_colors = [], []
    for name in names:
        a = layout[name]['nativeAlphaBounds']
        native = originals[name][a[1]:a[3], a[0]:a[2]]
        mask = native[:, :, 3] > 0
        projected = np.asarray(Image.fromarray(plates[name]).resize((a[2] - a[0], a[3] - a[1]), Image.Resampling.LANCZOS))
        native_colors.append(native[mask, :3])
        authored_colors.append(projected[mask])
    delta = np.concatenate(native_colors).mean(0) - np.concatenate(authored_colors).mean(0)
    anchors[key] = delta.tolist()
    for name in names:
        plates[name] = np.clip(plates[name].astype(float) + delta, 0, 255).astype(np.uint8)

export = root / args.revision
export.mkdir(exist_ok=False)
recipe = dict(acceptedBase=source['acceptedBase'], masters=provenance, generation=sha(root / 'generation-provenance.json'),
              paletteOffsets=anchors, sourceRegistration='ACTUAL_CONNECTED_SPRITE_EXTENT',
              method='Whole authored assemblies sampled independently at 2X and 4X; exact native metadata and alpha',
              contact='Exact native outer pixel and second-pixel fade; structural olive grass contacts use accepted V10 repair',
              placeholders='Exact native decoder output for zero-offset slots; no newly authored placeholder art',
              acceptedFrames='Exact accepted V4 road, V10 structure and V11B ground RGBA copied before atlas repacking',
              ledgerHashCorrections=source['ledgerHashCorrections'])
(export / 'registration.json').write_text(json.dumps(recipe, indent=2) + '\n')
if args.registration_only:
    print(json.dumps(dict(status='REGISTERED', members=len(provenance), minimumCapacity=min(p['densityCapacity'] for p in provenance))))
    raise SystemExit()


def native_image(member, image):
    file = Path('.artifacts/m2-1/inventory/native') / f"{member['nativeName']}-{image['subTile']}.rgba"
    return Image.frombytes('RGBA', tuple(image['logical']), file.read_bytes())


accepted = {}
for group in base['groups']:
    for variant in group['variants']:
        file = base_root / variant['file']
        assert sha(file) == variant['sha256']
        atlas = Image.frombytes('RGBA', tuple(variant['size']), file.read_bytes())
        index = 0
        for member in group['members']:
            for image in member['images']:
                x, y, w, h = variant['rects'][index]
                accepted[(member['member'], image['subTile'], variant['density'])] = atlas.crop((x, y, x + w, y + h))
                index += 1


def project_assembly(member, density):
    name, info = member['member'], layout[member['member']]
    a = info['nativeAlphaBounds']
    full = Image.new('RGB', (info['bounds'][2] * density, info['bounds'][3] * density))
    full.paste(Image.fromarray(plates[name]).resize(((a[2] - a[0]) * density, (a[3] - a[1]) * density),
               Image.Resampling.LANCZOS), (a[0] * density, a[1] * density))
    original = originals[name]
    inside = original[:, :, 3] > 0
    colors = original[:, :, :3].astype(float)
    grass = (colors[:, :, 1] >= colors[:, :, 0] - 30) & (colors[:, :, 1] > colors[:, :, 2] + 20)
    weight = np.zeros(inside.shape, dtype=np.float32)
    structural = member['setIndex'] in [10, 25]
    for step in range(9 if structural else 2):
        eroded = ndimage.binary_erosion(inside)
        ring = inside & ~eroded
        weight[ring] = max(0, 1 - step / 2)
        if structural:
            weight[ring] = np.maximum(weight[ring], grass[ring] * min(1, max(0, (8 - step) / 4)))
        inside = eroded
    target = full.size
    enlarged = np.array(Image.fromarray(weight).resize(target, Image.Resampling.BILINEAR), copy=True)
    nearest = np.asarray(Image.fromarray(weight).resize(target, Image.Resampling.NEAREST))
    enlarged[nearest == 1] = 1
    rgb = np.asarray(full).astype(float)
    native_rgb = np.asarray(Image.fromarray(original[:, :, :3]).resize(target, Image.Resampling.NEAREST))
    return np.clip(rgb * (1 - enlarged[:, :, None]) + native_rgb * enlarged[:, :, None], 0, 255).astype(np.uint8)


def frame(member, image, density, assembly):
    native = native_image(member, image)
    expected = np.asarray(native.resize(tuple(n * density for n in native.size), Image.Resampling.NEAREST))
    if member['accepted']:
        return accepted[(member['member'], image['subTile'], density)]
    if member['nativeOffsets'][image['subTile']] <= 0:
        return Image.fromarray(expected)
    info = layout[member['member']]
    rect = next(p['rect'] for p in info['parts'] if p['subTile'] == image['subTile'])
    x, y, w, h = [n * density for n in rect]
    rgb = assembly[y:y + h, x:x + w].copy()
    assert rgb.shape == expected[:, :, :3].shape
    rgb = extrude(rgb, expected[:, :, 3] > 0)
    debris = matte(rgb) & (expected[:, :, 3] > 0)
    # Ramp09 has native yellow marker pixels in its outer contact. Preserve
    # those exact original pixels while rejecting newly introduced matte.
    assert np.array_equal(rgb[debris], expected[:, :, :3][debris]), (member['member'], image['subTile'])
    return Image.fromarray(np.dstack([rgb, expected[:, :, 3]]))


destination = Path('.local/terrain-packs') / args.revision
destination.mkdir(parents=True, exist_ok=False)
groups, atlas_bytes, pair_count = [], {}, 0
for source_group in source['groups']:
    group = dict(id=source_group['id'], scope='COMPLETE_AUTHORIZED_M2_1_LEDGER',
                 members=[{k: m[k] for k in ['member', 'sourceHashes', 'images']} for m in source_group['members']], variants=[])
    for density in [2, 4]:
        frames = []
        for member in source_group['members']:
            assembly = None if member['accepted'] else project_assembly(member, density)
            frames.extend(frame(member, i, density, assembly) for i in member['images'])
        width = 2048 if density == 2 else 4096
        rects, x, y, row = [], 2, 2, 0
        for f in frames:
            if x + f.width + 2 > width:
                x, y, row = 2, y + row + 4, 0
            rects.append([x, y, *f.size])
            x += f.width + 4
            row = max(row, f.height)
        assert y + row + 2 <= 8192
        atlas = Image.new('RGBA', (width, y + row + 2))
        for f, (x, y, w, h) in zip(frames, rects):
            atlas.paste(f, (x, y))
            # Complete two-pixel extrusion, including all four corner gutters.
            padded = np.pad(np.asarray(f), ((2, 2), (2, 2), (0, 0)), mode='edge')
            atlas.paste(Image.fromarray(padded), (x - 2, y - 2))
        file = f"{group['id']}-{density}x.rgba"
        raw = atlas.tobytes()
        (destination / file).write_bytes(raw)
        atlas.save(export / f"{group['id']}-{density}x-atlas.png")
        group['variants'].append(dict(density=density, file=file, size=list(atlas.size), rects=rects,
                                     sha256=hashlib.sha256(raw).hexdigest()))
        atlas_bytes[str(density)] = atlas_bytes.get(str(density), 0) + len(raw)
        pair_count += len(frames)
    groups.append(group)
manifest = dict(schema='tmp-terrain-hd-v1', revision=args.revision, theater='TEMPERATE', editions=['ra2', 'yr'],
                scope='COMPLETE_AUTHORIZED_M2_1_LEDGER_305_MEMBERS_742_IMAGES', groups=groups)
raw = (json.dumps(manifest, separators=(',', ':')) + '\n').encode()
(destination / 'manifest.json').write_bytes(raw)
pointer = dict(schemaVersion=1, revision=args.revision, sha256=hashlib.sha256(raw).hexdigest())
recipe.update(pack=pointer, independentDensities=[2, 4], imageDensityPairs=pair_count, atlasBytes=atlas_bytes)
(export / 'recipe.json').write_text(json.dumps(recipe, indent=2) + '\n')
print(json.dumps(dict(pack=pointer, members=305, images=742, imageDensityPairs=pair_count, atlasBytes=atlas_bytes), indent=2))
