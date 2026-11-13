"""Project accepted HD roads through complete source-pinned slope planes."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from continuous_road_markings import fit_member, plane

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
parser.add_argument('theater', choices=['NEWURBAN', 'URBAN'])
parser.add_argument('revision')
parser.add_argument('--kind', choices=['all', 'narrow', 'wide'], default='all')
parser.add_argument('--continuous-wide-paint', action='store_true',
    help='Reconstruct the accepted wide-road paint in the shared source plane.')
args = parser.parse_args()
root = args.source.resolve()
source = json.loads((root / 'source.json').read_text())
pack, = [pack for pack in source['packs'] if pack['theater'] == args.theater]
sha = lambda data: hashlib.sha256(data).hexdigest()
base = Path('.local/terrain-packs') / pack['pointer']['revision']
assert sha((base / 'manifest.json').read_bytes()) == pack['pointer']['sha256']
manifest = json.loads((base / 'manifest.json').read_text())
assert args.revision.startswith(args.theater.lower() + '-')
destination = base.parent / args.revision
assert not destination.exists()
records = {row['member']: row for row in pack['records']}
slopes = {name for name in records if name.startswith(('prslpe', 'drslpe'))}
assert len(slopes) == 12
if args.kind != 'all':
    slopes = {name for name in slopes if name.startswith('drslpe' if args.kind == 'narrow' else 'prslpe')}
    assert len(slopes) == (8 if args.kind == 'narrow' else 4)
extension = next(iter(slopes)).split('.')[-1]


def assemble(record, samples, density):
    frames = record['frames']
    low = np.min([np.array(f['metadata']['origin']) + f['metadata']['offset'] for f in frames], axis=0)
    high = np.max([np.array(f['metadata']['origin']) + f['metadata']['offset'] + f['metadata']['logical']
        for f in frames], axis=0)
    image = np.zeros(((high[1] - low[1]) * density, (high[0] - low[0]) * density, 4), np.uint8)
    for frame, sample in zip(frames, samples, strict=True):
        x, y = (np.array(frame['metadata']['origin']) + frame['metadata']['offset'] - low) * density
        h, w = sample.shape[:2]
        region = image[y:y+h, x:x+w]
        region[sample[..., 3] > 0] = sample[sample[..., 3] > 0]
    return image, low


def native(name):
    record = records[name]
    samples = []
    for frame in record['frames']:
        raw = (root / frame['file']).read_bytes()
        assert sha(raw) == frame['sha256']
        width, height = frame['metadata']['logical']
        samples.append(np.frombuffer(raw, np.uint8).reshape(height, width, 4))
    return assemble(record, samples, 1)


def orientation(record):
    """The original composite axis disambiguates NewUrban's repeated ramp flags."""
    frames = record['frames']
    sign = -1 if frames[-1]['metadata']['origin'][0] < 0 else 1
    maximum = max(frame['metadata']['logical'][1] for frame in frames)
    assert maximum in [30, 31, 45]
    ramp = (1 if sign < 0 else 2) if maximum <= 31 else (3 if sign < 0 else 4)
    return sign, ramp


def narrow_center(name, sign, ramp):
    image, origin = native(name)
    rgb = image[..., :3].astype(float)
    paint = (image[..., 3] > 0) & (rgb[..., 0] > 65) & (rgb[..., 1] > 55) & (rgb[..., 2] < 90)
    paint &= (rgb[..., 0] - rgb[..., 2] > 35) & (abs(rgb[..., 0] - rgb[..., 1]) < 20)
    yy, xx = np.indices(paint.shape)
    x, y = plane(xx + .5 + origin[0], yy + .5 + origin[1], ramp)
    values = (x + sign * 2 * y)[paint]
    assert len(values) > 5, name
    histogram, edges = np.histogram(values, bins=np.arange(-512, 512.5, .5))
    peak = edges[int(histogram.argmax())] + .25
    core = values[np.abs(values - peak) < 3]
    assert len(core) >= 5, name
    return float(np.mean(core))


locations, pages = {}, {}
for group in manifest['groups']:
    cursor = 0
    for member in group['members']:
        locations[member['member']] = (group, cursor)
        cursor += len(member['images'])


def accepted(name, density):
    group, cursor = locations[name]
    variant, = [variant for variant in group['variants'] if variant['density'] == density]
    key = variant['file']
    if key not in pages:
        raw = (base / key).read_bytes()
        assert sha(raw) == variant['sha256']
        pages[key] = np.frombuffer(raw, np.uint8).reshape(variant['size'][1], variant['size'][0], 4)
    samples = [pages[key][y:y+h, x:x+w] for x, y, w, h
        in variant['rects'][cursor:cursor + len(records[name]['frames'])]]
    image, origin = assemble(records[name], samples, density)
    nearest = ndimage.distance_transform_edt(image[..., 3] == 0, return_distances=False, return_indices=True)
    return image[tuple(nearest)][..., :3].astype(float), origin, variant['sha256']


def sample(rgb, origin, sx, sy, density):
    coordinates = [(sy - origin[1]) * density - .5, (sx - origin[0]) * density - .5]
    return np.stack([ndimage.map_coordinates(rgb[..., channel], coordinates, order=1, mode='nearest')
        for channel in range(3)], axis=2)


def narrow_paint(material, origin, density, center):
    yy, xx = (np.indices(material.shape[:2]) + .5) / density
    x, y = xx + origin[0], yy + origin[1]
    cross, along = x - 2 * y, x / 60 + y / 30 - .5
    paint = (abs(cross - center) < 8) & (along > .02) & (along < .98)
    paint &= (material[..., 0] - material[..., 2] > 45)
    paint &= (material[..., 1] - material[..., 2] > 35) & (material[..., 2] < 120)
    assert paint.sum() > 30
    positions = np.quantile(cross[paint], [.05, .5, .95])
    width = float(positions[2] - positions[0])
    assert 2 <= width <= 5
    clean = (cross >= -20) & (cross < -12) & (along > .02) & (along < .98)
    assert clean.sum() > 100 and not paint[clean].any()
    return float(positions[1]), width, np.median(material[paint], axis=0)


def wide_paint_colors(material, origin, density, center, sign):
    yy, xx = (np.indices(material.shape[:2]) + .5) / density
    distance = (xx + origin[0] + sign * 2 * (yy + origin[1]) - center) / np.sqrt(2)
    yellow = (abs(distance) < 53) & (material[..., 0] - material[..., 2] > 45)
    yellow &= (material[..., 1] - material[..., 2] > 35) & (material[..., 2] < 120)
    white = (abs(abs(distance) - 25.45) < 3) & (material.mean(2) > 150)
    white &= np.ptp(material, axis=2) < 45
    assert yellow.sum() > 30 and white.sum() > 30
    return np.median(material[yellow], axis=0), np.median(material[white], axis=0)


def project(name, frame, density):
    md = frame['metadata']
    width, height = md['logical']
    yy, xx = (np.indices((height * density, width * density)) + .5) / density
    gx, gy = xx + md['origin'][0] + md['offset'][0], yy + md['origin'][1] + md['offset'][1]
    sign, ramp = orientation(records[name])
    qx, qy = plane(gx, gy, ramp)
    narrow = name.startswith('drslpe')
    donor = ('droads24.' if narrow else 'proad01.' if sign < 0 else 'proad02.') + extension
    material, origin, donor_hash = accepted(donor, density)
    if narrow:
        center = narrow_center(name, sign, ramp)
        donor_center = narrow_center(donor, -1, 0)
    else:
        center = fit_member(*native(name), name, ramp)['center']
        donor_center = fit_member(*native(donor), donor, 0)['center']
    cross = qx + sign * 2 * qy - center + donor_center
    if narrow or sign < 0:
        v = (30 - cross) / 60
        u = ((qx if sign < 0 else -qx) / 60 + qy / 30 + (-.5 if sign < 0 else .5)) % 1
    else:
        u = (cross - 30) / 60
        v = (-qx / 60 + qy / 30 + .5) % 1
    sx, sy = 30 + 30 * (u - v), 15 * (u + v)
    rgb = sample(material, origin, sx, sy, density)
    paint_proof = {}
    if narrow:
        paint_center, paint_width, paint_color = narrow_paint(material, origin, density, donor_center)
        # Compose the road from an unchanged accepted asphalt lane region and
        # one continuous analytic paint band. Wrapping a baked paint crop would
        # repeat its endpoint irregularities at every longitudinal tile seam.
        clean_cross = -20 + cross % 8
        clean_v = (30 - clean_cross) / 60
        rgb = sample(material, origin, 30 + 30 * (u - clean_v), 15 * (u + clean_v), density)
        pavement, pavement_origin, pavement_hash = accepted('pave01.' + extension, density)
        ground_u, ground_v = (qx / 60 + qy / 30 - .5) % 1, (-qx / 60 + qy / 30 + .5) % 1
        background = sample(pavement, pavement_origin, 30 + 30 * (ground_u - ground_v),
            15 * (ground_u + ground_v), density)
        gradient = 2 ** .5 if ramp in [1, 2] else (10 / 9) ** .5
        coverage = np.clip((30 - np.abs(cross + 30)) * density / gradient + .5, 0, 1)
        rgb = rgb * coverage[..., None] + background * (1 - coverage[..., None])
        _, step_y = plane(gx, gy + 1, ramp)
        step_x, step_xy = plane(gx + 1, gy, ramp)
        gradient = np.hypot((step_x - qx) + sign * 2 * (step_xy - qy), 2 * (step_y - qy))
        paint = np.clip((paint_width / 2 - abs(cross - paint_center)) * density / gradient + .5, 0, 1)
        rgb = rgb * (1 - paint[..., None]) + paint_color * paint[..., None]
        paint_proof = dict(paint=dict(kind='continuous-source-registered-analytic-band', center=paint_center,
            width=paint_width, acceptedColor=paint_color.tolist()),
            acceptedAsphaltRegion=dict(cross=[-20, -12], sourceDensity=density, paintContamination=0),
            pavementDonor='pave01.' + extension, pavementAtlasSha256=pavement_hash)
    elif args.continuous_wide_paint:
        distance = (cross - donor_center) / np.sqrt(2)
        clean_cross = donor_center + np.sqrt(2) * (8 + (distance + 8) % 8)
        if sign < 0:
            clean_v = (30 - clean_cross) / 60
            clean_sx, clean_sy = 30 + 30 * (u - clean_v), 15 * (u + clean_v)
        else:
            clean_u = (clean_cross - 30) / 60
            clean_sx, clean_sy = 30 + 30 * (clean_u - v), 15 * (clean_u + v)
        asphalt = sample(material, origin, clean_sx, clean_sy, density)
        _, step_y = plane(gx, gy + 1, ramp)
        step_x, step_xy = plane(gx + 1, gy, ramp)
        gradient = np.hypot((step_x - qx) + sign * 2 * (step_xy - qy),
            2 * (step_y - qy)) / np.sqrt(2)
        aa = gradient / density
        gate = np.clip((53.8 - abs(distance)) / aa + .5, 0, 1)
        rgb = rgb * (1 - gate[..., None]) + asphalt * gate[..., None]
        band = lambda field, width: np.clip((width / 2 - abs(field)) / aa + .5, 0, 1)
        yellow = np.maximum(band(distance - 2.12, 1.35), band(distance + 2.12, 1.35))
        yellow = np.maximum(yellow, np.maximum(band(distance - 51, 1.05), band(distance + 51, 1.05)))
        along = (qx - sign * 2 * qy) / np.sqrt(2)
        phase = along % (10 * np.sqrt(2))
        dash = np.clip(np.minimum(phase, 8.3 - phase) / aa + .5, 0, 1)
        white = np.maximum(band(distance - 25.45, 1.25), band(distance + 25.45, 1.25)) * dash
        yellow_color, white_color = wide_paint_colors(material, origin, density, donor_center, sign)
        rgb = rgb * (1 - yellow[..., None]) + yellow_color * yellow[..., None]
        rgb = rgb * (1 - white[..., None]) + white_color * white[..., None]
        paint_proof = dict(paint=dict(kind='continuous-source-registered-wide-road-markings',
            geometryAuthority='scripts/m2/continuous_road_markings.py', centerPair=[-2.12, 2.12],
            centerWidth=1.35, edges=[-51, 51], edgeWidth=1.05,
            whiteLanes=[-25.45, 25.45], whiteWidth=1.25, dashPeriod=10 * np.sqrt(2), dashLength=8.3,
            acceptedYellow=yellow_color.tolist(), acceptedWhite=white_color.tolist()),
            acceptedAsphaltRegion=dict(normal=[8, 16], sourceDensity=density, paintContamination=0),
            acceptedCurbsPreservedOutsideNormal=53.8)
    return np.rint(np.clip(rgb, 0, 255)).astype(np.uint8), dict(donor=donor, donorAtlasSha256=donor_hash,
        authoringPlaneRamp=ramp, sourceRampTypes=sorted({f['metadata']['rampType'] for f in records[name]['frames']}),
        sign=sign, nativeCenter=center, donorCenter=donor_center, nativeRgbUsedAsOutputTexture=False, **paint_proof)


destination.mkdir()
changed = {group['id'] for name, (group, _) in locations.items() if name in slopes}
changed_files = {variant['file'] for group in manifest['groups'] if group['id'] in changed for variant in group['variants']}
preserved = []
for file in base.iterdir():
    if file.is_file() and file.name != 'manifest.json' and file.name not in changed_files:
        os.link(file, destination / file.name)
        preserved.append(dict(file=file.name, sha256=sha(file.read_bytes())))
report = dict(schema='source-pinned-whole-road-slope-projection-v1', baseline=pack['pointer'],
    theater=args.theater, source=dict(file=str(root / 'source.json'), sha256=sha((root / 'source.json').read_bytes())),
    changedGroups=sorted(changed), preserved=preserved, frames=[], addedMembers=[], sourceMapsChanged=0,
    policy='Project independent accepted 2X/4X road and ground pixels in one original whole-member plane. Source palette pixels identify paint geometry only. Preserve native clipping, all source metadata, gameplay, accepted neighboring tiles, world caps and original payload history.')
review = root / (args.revision + '-exports'); review.mkdir()
for group in manifest['groups']:
    if group['id'] not in changed:
        continue
    for variant in group['variants']:
        density = variant['density']
        raw = (base / variant['file']).read_bytes(); assert sha(raw) == variant['sha256']
        atlas = np.frombuffer(raw, np.uint8).reshape(variant['size'][1], variant['size'][0], 4).copy()
        cursor = 0
        for member in group['members']:
            name = member['member']
            if name in slopes:
                for slot, frame in enumerate(records[name]['frames']):
                    x, y, width, height = variant['rects'][cursor + slot]
                    before = atlas[y:y+height, x:x+width].copy()
                    rgb, proof = project(name, frame, density)
                    assert rgb.shape == before[..., :3].shape
                    repaired = before.copy(); repaired[..., :3] = rgb
                    np.testing.assert_array_equal(repaired[..., 3], before[..., 3])
                    atlas[y-2:y+height+2, x-2:x+width+2] = np.pad(repaired, ((2, 2), (2, 2), (0, 0)), mode='edge')
                    Image.fromarray(repaired).save(review / f'{name}-{slot}-{density}x.png')
                    report['frames'].append(dict(member=name, slot=slot, density=density, **proof,
                        alphaExact=True, beforeSha256=sha(before.tobytes()), afterSha256=sha(repaired.tobytes())))
            cursor += len(member['images'])
        payload = atlas.tobytes(); (destination / variant['file']).write_bytes(payload)
        variant['sha256'] = sha(payload)
        if 'bytes' in variant:
            variant['bytes'] = len(payload)

for name in sorted(slopes - locations.keys()):
    record = records[name]; assert record['newMember']
    assert name == 'drslpe02.ubn'
    group = dict(id=args.revision + '-drslpe02', kind='ground',
        members=[dict(member=name, sourceHashes=record['sourceHashes'],
            images=[frame['metadata'] for frame in record['frames']])], variants=[])
    for density in [2, 4]:
        width = 256 if density == 2 else 512; height = 128
        atlas = np.zeros((height, width, 4), np.uint8); rects = []; cursor = 2
        for slot, frame in enumerate(record['frames']):
            w, h = [value * density for value in frame['metadata']['logical']]
            rgb, proof = project(name, frame, density)
            native_pixels = np.frombuffer((root / frame['file']).read_bytes(), np.uint8).reshape(
                frame['metadata']['logical'][1], frame['metadata']['logical'][0], 4)
            alpha = np.repeat(np.repeat(native_pixels[..., 3], density, axis=0), density, axis=1)
            repaired = np.dstack([rgb, alpha]); assert cursor + w + 2 <= width and h + 4 <= height
            atlas[:h+4, cursor-2:cursor+w+2] = np.pad(repaired, ((2, 2), (2, 2), (0, 0)), mode='edge')
            rects.append([cursor, 2, w, h]); cursor += w + 4
            Image.fromarray(repaired).save(review / f'{name}-{slot}-{density}x.png')
            report['frames'].append(dict(member=name, slot=slot, density=density, **proof,
                newSourceScopedMember=True, nativeAlphaExact=True, afterSha256=sha(repaired.tobytes())))
        payload = atlas.tobytes(); file = f'{args.revision}-drslpe02-{density}x.rgba'
        (destination / file).write_bytes(payload)
        group['variants'].append(dict(density=density, file=file, size=[width, height], rects=rects,
            bytes=len(payload), sha256=sha(payload)))
    manifest['groups'].append(group); report['addedMembers'].append(name)

manifest['revision'] = args.revision
metadata = (json.dumps(manifest, separators=(',', ':')) + '\n').encode()
(destination / 'manifest.json').write_bytes(metadata)
report['candidate'] = dict(schemaVersion=1, revision=args.revision, sha256=sha(metadata))
report['members'] = sorted(slopes)
report['sourceGeometryAndAllAlphaUnchanged'] = True
(review / 'export.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(dict(candidate=report['candidate'], frames=len(report['frames']), changedGroups=len(changed),
    addedMembers=report['addedMembers'], output=str(review))))
