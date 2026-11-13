"""Project the accepted two-lane Urban road into its original narrow slope planes."""
import hashlib
import json
import os
from pathlib import Path
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from continuous_road_markings import plane

root = Path(sys.argv[1])
source = json.loads((root / 'source.json').read_text())
pack = next(p for p in source['packs'] if p['theater'] == 'urban')
base = Path('.local/terrain-packs') / pack['pointer']['revision']
sha = lambda data: hashlib.sha256(data).hexdigest()
assert sha((base / 'manifest.json').read_bytes()) == pack['pointer']['sha256']
manifest = json.loads((base / 'manifest.json').read_text())
revision = sys.argv[2]
destination = base.parent / revision
destination.mkdir(exist_ok=False)
records = {r['member']: r for r in pack['records']}
members = {name for name in records if name.startswith('drslpe')}
additions = [record for record in records.values() if record.get('newMember')]
for record in additions:
    group = next(group for group in manifest['groups'] if group['id'] == record['group'])
    assert not any(member['member'] == record['member'] for member in group['members'])
    group['members'].append(dict(member=record['member'], sourceHashes=record['sourceHashes'],
        images=[frame['metadata'] for frame in record['frames']]))
    for variant in group['variants']:
        density = variant['density']
        cursor = max(x + w + 4 for x, y, w, h in variant['rects'])
        for frame in record['frames']:
            width, height = [int(value * density) for value in frame['metadata']['logical']]
            assert cursor + width + 2 <= variant['size'][0] and height + 4 <= variant['size'][1]
            variant['rects'].append([cursor, 2, int(width), int(height)])
            cursor += width + 4
changed_groups = {r['group'] for name, r in records.items() if name in members}
changed_files = {v['file'] for g in manifest['groups'] if g['id'] in changed_groups for v in g['variants']}
preserved = []
for file in base.iterdir():
    if file.is_file() and file.name != 'manifest.json' and file.name not in changed_files:
        os.link(file, destination / file.name)
        preserved.append(dict(file=file.name, sha256=sha(file.read_bytes())))


def assemble(frames, samples, density):
    low = np.min([np.array(f['metadata']['origin']) + f['metadata']['offset'] for f in frames], axis=0)
    high = np.max([np.array(f['metadata']['origin']) + f['metadata']['offset'] + f['metadata']['logical'] for f in frames], axis=0)
    result = np.zeros(((high[1] - low[1]) * density, (high[0] - low[0]) * density, 4), np.uint8)
    for frame, sample in zip(frames, samples, strict=True):
        x, y = (np.array(frame['metadata']['origin']) + frame['metadata']['offset'] - low) * density
        h, w = sample.shape[:2]
        region = result[y:y + h, x:x + w]
        region[sample[..., 3] > 0] = sample[sample[..., 3] > 0]
    return result, low


def source_center(name, sign):
    frames = records[name]['frames']
    native, origin = assemble(frames, [np.frombuffer((root / f['file']).read_bytes(), np.uint8)
        .reshape(f['metadata']['logical'][1], f['metadata']['logical'][0], 4) for f in frames], 1)
    rgb = native[..., :3].astype(float)
    yellow = (native[..., 3] > 0) & (rgb[..., 0] > 65) & (rgb[..., 1] > 55) & (rgb[..., 2] < 90)
    yellow &= (rgb[..., 0] - rgb[..., 2] > 35) & (abs(rgb[..., 0] - rgb[..., 1]) < 50)
    yy, xx = np.indices(yellow.shape)
    x, y = plane(xx + .5 + origin[0], yy + .5 + origin[1], frames[0]['metadata']['rampType'])
    anchors = (x + sign * 2 * y)[yellow]
    assert len(anchors) > 5, (name, len(anchors))
    return float(np.mean(np.quantile(anchors, [.15, .85])))


locations = {}
for group in manifest['groups']:
    cursor = 0
    for member in group['members']:
        locations[member['member']] = (group, cursor)
        cursor += len(member['images'])
donor_name = 'droads24.urb'
donor_center = source_center(donor_name, -1)
report = dict(schema='native-road-slopes-v53-side-roads', baseline=pack['pointer'], theater='urban',
    preserved=preserved, changedMembers=sorted(members), frames=[],
    addedMembers=[record['member'] for record in additions],
    policy='Reuse the accepted adjacent droads24 Urban asphalt, single centre marking and pavement through native whole-member slope planes. Source metadata, alpha, depth, atlas layout, source maps and budgets remain exact.')
for group in manifest['groups']:
    if group['id'] not in changed_groups:
        continue
    indices, cursor = {}, 0
    for member in group['members']:
        indices[member['member']] = cursor
        cursor += len(member['images'])
    for variant in group['variants']:
        density = variant['density']
        raw = (base / variant['file']).read_bytes()
        assert sha(raw) == variant['sha256']
        atlas = np.frombuffer(raw, np.uint8).reshape(variant['size'][1], variant['size'][0], 4).copy()
        donor_group, start = locations[donor_name]
        donor_variant = next(v for v in donor_group['variants'] if v['density'] == density)
        donor_bytes = (base / donor_variant['file']).read_bytes()
        assert sha(donor_bytes) == donor_variant['sha256']
        page = np.frombuffer(donor_bytes, np.uint8).reshape(donor_variant['size'][1], donor_variant['size'][0], 4)
        frames = records[donor_name]['frames']
        donor, origin = assemble(frames, [page[y:y + h, x:x + w]
            for x, y, w, h in donor_variant['rects'][start:start + len(frames)]], density)
        nearest = ndimage.distance_transform_edt(donor[..., 3] == 0, return_distances=False, return_indices=True)
        material = donor[tuple(nearest)][..., :3].astype(float)
        for name in sorted(members):
            record = records[name]
            ramp = record['frames'][0]['metadata']['rampType']
            sign = -1 if ramp in (1, 3) else 1
            center = source_center(name, sign)
            pavement_name, pavement_slot = 'pave01.urb', 0
            pavement_group, pavement_start = locations[pavement_name]
            pavement_variant = next(v for v in pavement_group['variants'] if v['density'] == density)
            pavement_bytes = (base / pavement_variant['file']).read_bytes()
            assert sha(pavement_bytes) == pavement_variant['sha256']
            pavement_page = np.frombuffer(pavement_bytes, np.uint8).reshape(pavement_variant['size'][1], pavement_variant['size'][0], 4)
            px, py, pw, ph = pavement_variant['rects'][pavement_start + pavement_slot]
            pavement = pavement_page[py:py + ph, px:px + pw]
            nearest = ndimage.distance_transform_edt(pavement[..., 3] == 0, return_distances=False, return_indices=True)
            pavement_rgb = pavement[tuple(nearest)][..., :3].astype(float)
            pavement_md = records[pavement_name]['frames'][pavement_slot]['metadata']
            for slot, frame in enumerate(record['frames']):
                md = frame['metadata']
                x, y, w, h = variant['rects'][indices[name] + slot]
                before = atlas[y:y + h, x:x + w].copy()
                if record.get('newMember'):
                    native = np.frombuffer((root / frame['file']).read_bytes(), np.uint8).reshape(md['logical'][1], md['logical'][0], 4)
                    before[..., 3] = np.repeat(np.repeat(native[..., 3], density, axis=0), density, axis=1)
                yy, xx = (np.indices((h, w)) + .5) / density
                qx, qy = plane(xx + md['origin'][0] + md['offset'][0], yy + md['origin'][1] + md['offset'][1], ramp)
                cross = qx + sign * 2 * qy - center + donor_center
                v = (30 - cross) / 60
                u = (qx / 60 + qy / 30 - .5) % 1 if sign == -1 else (-qx / 60 + qy / 30 + .5) % 1
                sx, sy = 30 + 30 * (u - v), 15 * (u + v)
                samples = [(sy - origin[1]) * density - .5, (sx - origin[0]) * density - .5]
                rgb = np.stack([ndimage.map_coordinates(material[..., c], samples, order=1, mode='nearest') for c in range(3)], axis=2)
                # Reuse the adjacent native pavement plane outside the road.
                # Old road fragments and donor edge clamping must not survive
                # there as dark triangles or stretched vertical curtains.
                ground_u = (qx / 60 + qy / 30 - .5) % 1
                ground_v = (-qx / 60 + qy / 30 + .5) % 1
                ground_x, ground_y = 30 + 30 * (ground_u - ground_v), 15 * (ground_u + ground_v)
                pavement_samples = [(ground_y - pavement_md['offset'][1]) * density - .5,
                    (ground_x - pavement_md['offset'][0]) * density - .5]
                background = np.stack([ndimage.map_coordinates(pavement_rgb[..., c], pavement_samples,
                    order=1, mode='nearest') for c in range(3)], axis=2)
                gradient = 2 ** .5 if ramp in (1, 2) else (10 / 9) ** .5
                coverage = np.clip((30 - np.abs(cross - donor_center)) * density / gradient + .5, 0, 1)
                rgb = rgb * coverage[..., None] + background * (1 - coverage[..., None])
                repaired = before.copy(); repaired[..., :3] = np.rint(np.clip(rgb, 0, 255)).astype(np.uint8)
                np.testing.assert_array_equal(repaired[..., 3], before[..., 3])
                atlas[y - 2:y + h + 2, x - 2:x + w + 2] = np.pad(repaired, ((2, 2), (2, 2), (0, 0)), mode='edge')
                Image.fromarray(repaired).save(root / f'{name}-{slot}-{density}x-fixed.png')
                report['frames'].append(dict(member=name, slot=slot, density=density, sourceHashes=record['sourceHashes'],
                    donor=donor_name, nativeCenter=center, donorCenter=donor_center, alphaExact=True,
                    pavementDonor=pavement_name, pavementSlot=pavement_slot,
                    beforeSha256=sha(before.tobytes()), afterSha256=sha(repaired.tobytes())))
        payload = atlas.tobytes(); (destination / variant['file']).write_bytes(payload)
        variant.update(sha256=sha(payload), bytes=len(payload))
manifest['revision'] = revision
metadata = (json.dumps(manifest, separators=(',', ':')) + '\n').encode()
(destination / 'manifest.json').write_bytes(metadata)
report['candidate'] = dict(schemaVersion=1, revision=revision, sha256=sha(metadata))
(root / 'export.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(dict(candidate=report['candidate'], frames=len(report['frames']))))
