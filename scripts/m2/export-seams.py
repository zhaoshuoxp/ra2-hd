"""Correct grassy slope rims and dirt-road joins while preserving accepted V12C frames."""
import argparse
import copy
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('revision')
parser.add_argument('--root', type=Path, default=Path('.artifacts/m2-1/authoring-seams-v13'))
args = parser.parse_args()
root = args.root
production = Path('.artifacts/m2-1/authoring-production-v3')
read = lambda p: json.loads(Path(p).read_text())
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
generation = read(root / 'generation-provenance.json')
parent_root = Path(generation['parent']['root'])
assert sha(parent_root / 'manifest.json') == generation['parent']['sha256']
parent = read(parent_root / 'manifest.json')
source = read(production / 'source.json')
layout = read(production / 'layout.json')
registration = read(production / parent['revision'] / 'registration.json')
members = {m['member']: m for g in source['groups'] for m in g['members']}
roads = [f'proad{i:02}.tem' for i in range(16, 22)]
slopes = [m['member'] for m in members.values() if m['setIndex'] == 9]
fixups = [m['member'] for m in members.values() if m['setIndex'] == 43]
surfaces = slopes + fixups
affected = set(roads + surfaces)
assert len(slopes) == 68 and len(fixups) == 48 and len(affected) == 122
for entry in generation['entries']:
    for item in [entry['master'], entry['prompt'], *entry['references']]:
        assert sha(item['file']) == item['sha256']
grass_file = root / 'grass-material-master.png'
grass = np.asarray(Image.open(grass_file).convert('RGB'), dtype=np.float32)
assert min(grass.shape[:2]) >= 1000


def enlarge(array, size, method=Image.Resampling.LANCZOS):
    if array.ndim == 2:
        return np.asarray(Image.fromarray(array.astype(np.float32)).resize(size, method))
    return np.stack([enlarge(array[:, :, i], size, method) for i in range(array.shape[2])], axis=2)


def extrude(rgb, valid):
    indices = ndimage.distance_transform_edt(~valid, return_distances=False, return_indices=True)
    result = rgb.copy()
    result[~valid] = rgb[tuple(indices[:, ~valid])]
    return result


def native_frame(member, image):
    file = Path('.artifacts/m2-1/inventory/native') / f"{member['nativeName']}-{image['subTile']}.rgba"
    return Image.frombytes('RGBA', tuple(image['logical']), file.read_bytes())


def atlas_frames(document, directory):
    result = {}
    for group in document['groups']:
        for variant in group['variants']:
            file = directory / variant['file']
            assert sha(file) == variant['sha256']
            atlas = np.asarray(Image.frombytes('RGBA', tuple(variant['size']), file.read_bytes()))
            rows = [(m, i) for m in group['members'] for i in m['images']]
            for (member, image), (x, y, w, h) in zip(rows, variant['rects']):
                result[(member['member'], image['subTile'], variant['density'])] = atlas[y:y + h, x:x + w].copy()
    return result


accepted = atlas_frames(parent, parent_root)
native = {name: np.asarray(Image.open(production / f'{name}-native.png').convert('RGBA'))
          for name in affected}
recipe = dict(parent=generation['parent'], affectedMembers=sorted(affected), independentDensities=[2, 4],
              generation=dict(file=str(root / 'generation-provenance.json'),
                              sha256=sha(root / 'generation-provenance.json')),
              preservation='Every unaffected V12C frame and gutter copied exactly; unchanged atlas layout and native metadata',
              slopes='Continuous authored diffuse material; native low-frequency palette/orientation calibration; no authored polygon rim',
              roads='Accepted straight-road pavement registration under existing authored earth details; aligned continuous curbs and lane paint',
              nativeGeometry='Exact native logical alpha, offsets, heights, ramp types and zero-offset placeholders',
              grassMaster=dict(file=str(grass_file), sha256=sha(grass_file), size=list(grass.shape[1::-1])),
              projections=[], roadCalibration=[], retainedStonePixels=[])
output = root / args.revision
output.mkdir(exist_ok=False)
destination = Path('.local/terrain-packs') / args.revision
destination.mkdir(exist_ok=False)


def slope_rgb(name, density):
    original = native[name]
    info = layout[name]
    width, height = info['bounds'][2:]
    valid = original[:, :, 3] > 0
    guide = extrude(original[:, :, :3].astype(np.float32), valid)
    # This is palette registration to the retail surface, not a reconstruction
    # of detail from low-resolution pixels. Fine detail comes from the master.
    field = ndimage.gaussian_filter(guide, (1.2, 1.2, 0))
    index = surfaces.index(name)
    x = (index * 107) % (grass.shape[1] - 300)
    y = (index * 173) % (grass.shape[0] - height * 5)
    plate = grass[y:y + height * 5, x:x + width * 5]
    assert plate.shape[:2] == (height * 5, width * 5)
    detail = plate - ndimage.gaussian_filter(plate, (7, 7, 0))
    size = (width * density, height * density)
    rgb = enlarge(field, size, Image.Resampling.BICUBIC) + enlarge(detail, size) * .85
    # Preserve the native contact pixel and smoothly fade into the calibrated
    # continuous interior. There is no contrast stroke or rim in this source.
    distance = ndimage.distance_transform_edt(np.pad(valid, 1))[1:-1, 1:-1]
    weight = np.clip((3 - distance) / 2, 0, 1).astype(np.float32)
    blend = np.clip(enlarge(weight, size, Image.Resampling.BILINEAR), 0, 1)
    exact = enlarge(weight, size, Image.Resampling.NEAREST) == 1
    blend[exact] = 1
    contact = enlarge(guide, size, Image.Resampling.NEAREST)
    rgb = rgb * (1 - blend[:, :, None]) + contact * blend[:, :, None]
    if density == 4:
        recipe['projections'].append(dict(member=name, materialRect=[x, y, width * 5, height * 5],
                                          densityCapacity=5, nativeBounds=info['bounds']))
    return np.clip(rgb, 0, 255).astype(np.uint8)


def straight_assembly(name, density, retail=False):
    member = members[name]
    grid = member['images'][0]['grid']
    bounds = [-60, 0, 120, 60] if grid[0] == 1 else [0, 0, 120, 60]
    atlas = Image.new('RGBA', (120 * density, 60 * density))
    for image in member['images']:
        i = image['subTile']
        u, v = i % grid[0], i // grid[0]
        frame = (native_frame(member, image).resize(tuple(n * density for n in image['logical']),
                                                   Image.Resampling.NEAREST)
                 if retail else Image.fromarray(accepted[(name, i, density)]))
        atlas.alpha_composite(frame, ((30 * (u - v) - bounds[0]) * density, 15 * (u + v) * density))
    return atlas, bounds


def repeated_road(name, density, offset, retail=False):
    positive = name in ['proad16.tem', 'proad17.tem', 'proad18.tem']
    guide_name = 'proad01.tem' if positive else 'proad02.tem'
    plate, bounds = straight_assembly(guide_name, density, retail)
    target = Image.new('RGBA', (layout[name]['bounds'][2] * density, layout[name]['bounds'][3] * density))
    bx, by = layout[name]['bounds'][:2]
    for k in range(-2, 8):
        u, v = (k, offset) if positive else (offset, k)
        x = (30 * (u - v) + bounds[0] - bx) * density
        y = (15 * (u + v) + bounds[1] - by) * density
        target.alpha_composite(plate, (x, y))
    return np.asarray(target)


def asphalt(rgb):
    rgb = rgb.astype(float)
    return (rgb.max(2) < 105) & (rgb.min(2) > 10) & (np.ptp(rgb, axis=2) < 18)


road_plates, road_offsets = {}, {}
for name in roads:
    item = next(p for p in registration['masters'] if p['member'] == name)
    assert sha(item['file']) == item['sha256']
    x, y, w, h = item['sourceRect']
    crop = np.asarray(Image.open(item['file']).convert('RGBA').crop((x, y, x + w, y + h)))
    plate = extrude(crop[:, :, :3].astype(np.float32), crop[:, :, 3] > 180)
    plate += np.array(registration['paletteOffsets'][name], dtype=np.float32)
    mask = asphalt(plate) & (crop[:, :, 3] > 180)
    positive = name in ['proad16.tem', 'proad17.tem', 'proad18.tem']
    guide_name = 'proad01.tem' if positive else 'proad02.tem'
    guide, _ = straight_assembly(guide_name, 4)
    colors = np.asarray(guide)
    target = colors[asphalt(colors[:, :, :3]) & (colors[:, :, 3] > 0), :3].mean(0)
    delta = target - plate[mask].mean(0)
    # A soft material mask leaves dirt, turf, white curbs and yellow paint intact.
    neutral = np.clip((27 - np.ptp(plate, axis=2)) / 12, 0, 1)
    dark = np.clip((125 - plate.max(2)) / 30, 0, 1)
    plate += delta * (neutral * dark)[:, :, None]
    road_plates[name] = np.clip(plate, 0, 255)
    original = native[name]
    candidates = []
    pure = asphalt(original[:, :, :3]) & (original[:, :, 3] > 0)
    for offset in range(-1, 4):
        tiled = repeated_road(name, 1, offset, retail=True)
        valid = pure & (tiled[:, :, 3] > 0)
        error = np.mean((tiled[valid, :3].astype(float) - original[valid, :3]) ** 2) if valid.any() else 1e9
        error += 400 * (1 - valid.sum() / max(pure.sum(), 1))
        candidates.append((error, offset))
    offset = min(candidates)[1]
    road_offsets[name] = offset
    recipe['roadCalibration'].append(dict(member=name, source=item, asphaltMeanBefore=target - delta,
                                          acceptedAsphaltTarget=target, asphaltOffset=delta, crossRoadOffset=offset,
                                          nativeAlignmentCandidates=candidates))


def road_rgb(name, density):
    info = layout[name]
    a = info['nativeAlphaBounds']
    width, height = info['bounds'][2:]
    full = np.zeros((height * density, width * density, 3), dtype=np.float32)
    full[a[1] * density:a[3] * density, a[0] * density:a[2] * density] = enlarge(
        road_plates[name], ((a[2] - a[0]) * density, (a[3] - a[1]) * density))
    original = native[name]
    inside = original[:, :, 3] > 0
    distance = ndimage.distance_transform_edt(np.pad(inside, 1))[1:-1, 1:-1]
    contact = np.clip((2 - distance), 0, 1).astype(np.float32)
    guide = extrude(original[:, :, :3].astype(np.float32), inside)
    blend = np.clip(enlarge(contact, (width * density, height * density), Image.Resampling.BILINEAR), 0, 1)
    exact = enlarge(contact, (width * density, height * density), Image.Resampling.NEAREST) == 1
    blend[exact] = 1
    full = full * (1 - blend[:, :, None]) + enlarge(guide, (width * density, height * density),
                                                 Image.Resampling.NEAREST) * blend[:, :, None]
    tiled = repeated_road(name, density, road_offsets[name])
    yy, xx = np.indices(full.shape[:2], dtype=float)
    bx, by = info['bounds'][:2]
    u = (xx / density + bx - 30) / 60 + (yy / density + by) / 30
    v = (yy / density + by) / 30 - (xx / density + bx - 30) / 60
    positive = name in ['proad16.tem', 'proad17.tem', 'proad18.tem']
    axis = u if positive else v
    length = members[name]['images'][0]['grid'][0 if positive else 1]
    # Register the accepted continuous pavement beneath the authored earth.
    # A full-assembly bounding box alone cannot align lane paint on a crossing
    # whose grass extension changes the artist's pavement proportions.
    join = np.clip((.38 - np.minimum(axis, length - axis)) / .25, 0, 1)
    earth = np.clip((full[:, :, 0] - full[:, :, 1] - 5) / 16, 0, 1)
    earth *= np.clip((full[:, :, 1] - full[:, :, 2] - 12) / 22, 0, 1)
    paint = (full[:, :, 0] > 165) & (full[:, :, 1] > 145) & (full[:, :, 2] < 130)
    earth[paint] = 0
    # Native coverage remains authoritative, including grass extensions and
    # dirt outside the roadway. Only the road material is registered here.
    paving = tiled[:, :, 3] / 255
    weight = paving * (1 - earth * (1 - join))
    full = full * (1 - weight[:, :, None]) + tiled[:, :, :3] * weight[:, :, None]
    return np.clip(full, 0, 255).astype(np.uint8)


manifest = copy.deepcopy(parent)
manifest['revision'] = args.revision
changed_pairs = preserved_pairs = 0
inspection = Image.new('RGBA', (1600, 980), (25, 30, 25, 255))
for group in manifest['groups']:
    for variant in group['variants']:
        atlas = np.array(Image.frombytes('RGBA', tuple(variant['size']), (parent_root / variant['file']).read_bytes()), copy=True)
        density = variant['density']
        index = 0
        for member in group['members']:
            name = member['member']
            assembly = (slope_rgb(name, density) if name in surfaces else road_rgb(name, density)) if name in affected else None
            for image in member['images']:
                x, y, w, h = variant['rects'][index]
                index += 1
                if name not in affected or members[name]['nativeOffsets'][image['subTile']] <= 0:
                    preserved_pairs += 1
                    continue
                expected = np.asarray(native_frame(members[name], image).resize((w, h), Image.Resampling.NEAREST))
                px, py, pw, ph = next(p['rect'] for p in layout[name]['parts'] if p['subTile'] == image['subTile'])
                rgb = assembly[py * density:(py + ph) * density, px * density:(px + pw) * density]
                rgb = extrude(rgb, expected[:, :, 3] > 0)
                frame = np.dstack([rgb, expected[:, :, 3]])
                if name in fixups:
                    prior = accepted[(name, image['subTile'], density)]
                    native_colors = native[name][:, :, :3].astype(float)
                    native_stone = ((native_colors[:, :, 1] - native_colors[:, :, 2] < 22)
                                    & (np.abs(native_colors[:, :, 0] - native_colors[:, :, 1]) < 22)
                                    & (native[name][:, :, 3] > 0))
                    support = ndimage.binary_dilation(native_stone, iterations=4)
                    support = enlarge(support.astype(np.float32), (w, h), Image.Resampling.NEAREST) > 0
                    old_colors = prior[:, :, :3].astype(float)
                    stone = ((old_colors[:, :, 1] - old_colors[:, :, 2] < 25)
                             & (np.abs(old_colors[:, :, 0] - old_colors[:, :, 1]) < 25)
                             & (expected[:, :, 3] > 0) & support)
                    # Preserve the already accepted stone marks exactly; only
                    # turf rims and diffuse turf detail receive the correction.
                    frame[stone] = prior[stone]
                    recipe['retainedStonePixels'].append(dict(member=name, density=density,
                                                              exactPixels=int(stone.sum())))
                # Retail Slope13 variants have only a four-pixel contact strip.
                if not ndimage.binary_erosion(native[name][:, :, 3] > 0).any():
                    frame = accepted[(name, image['subTile'], density)]
                if np.array_equal(frame, accepted[(name, image['subTile'], density)]):
                    preserved_pairs += 1
                    continue
                atlas[y - 2:y + h + 2, x - 2:x + w + 2] = np.pad(frame, ((2, 2), (2, 2), (0, 0)), mode='edge')
                changed_pairs += 1
            if density == 4 and name in ['proad19.tem', 'proad17.tem', 'slope06.tem', 'slope10.tem', 'slope14.tem']:
                rgba = np.dstack([assembly, enlarge(native[name][:, :, 3], assembly.shape[1::-1], Image.Resampling.NEAREST).astype(np.uint8)])
                file = output / f'{name}-assembly-4x.png'
                Image.fromarray(rgba).save(file)
                pos = {'proad19.tem': (40, 30), 'proad17.tem': (40, 500),
                       'slope06.tem': (1050, 30), 'slope10.tem': (1050, 290), 'slope14.tem': (1050, 550)}[name]
                inspection.alpha_composite(Image.fromarray(rgba), pos)
        raw = atlas.tobytes()
        (destination / variant['file']).write_bytes(raw)
        variant['sha256'] = hashlib.sha256(raw).hexdigest()
        if any(m['member'] in affected for m in group['members']):
            Image.fromarray(atlas).save(output / f"{group['id']}-{density}x-atlas.png")
raw = (json.dumps(manifest, separators=(',', ':')) + '\n').encode()
(destination / 'manifest.json').write_bytes(raw)
pointer = dict(schemaVersion=1, revision=args.revision, sha256=hashlib.sha256(raw).hexdigest())
recipe.update(pack=pointer, changedPairs=changed_pairs, exactPreservedPairs=preserved_pairs,
              atlasBytes={str(d): sum(np.prod(v['size']).item() * 4 for g in manifest['groups']
                                     for v in g['variants'] if v['density'] == d) for d in [2, 4]})
inspection.save(output / 'assembly-inspection.png')
(output / 'recipe.json').write_text(json.dumps(recipe, indent=2, default=lambda a: a.tolist()) + '\n')
print(json.dumps(dict(pack=pointer, changedPairs=changed_pairs, exactPreservedPairs=preserved_pairs,
                      atlasBytes=recipe['atlasBytes']), indent=2))
