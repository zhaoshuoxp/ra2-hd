"""Project accepted same-theater road artwork into four native slope planes."""
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
from continuous_road_markings import fit_member, plane

root = Path(sys.argv[1])
source = json.loads((root / 'source.json').read_text())
theater = sys.argv[2] if len(sys.argv) > 2 else 'temperate'
pack = next(p for p in source['packs'] if p['theater'] == theater)
base = Path('.local/terrain-packs') / pack['pointer']['revision']
sha = lambda b: hashlib.sha256(b).hexdigest()
assert sha((base / 'manifest.json').read_bytes()) == pack['pointer']['sha256']
manifest = json.loads((base / 'manifest.json').read_text())
revision = sys.argv[3] if len(sys.argv) > 3 else 'temperate-native-road-slopes-v52-r2'
assert revision.startswith(theater + '-')
destination = base.parent / revision
destination.mkdir(exist_ok=False)
manifest['revision'] = revision
records = {r['member']: r for r in pack['records']}
changed_groups = {r['group'] for r in pack['records'] if r['member'].startswith('prslpe')}
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


def native(record):
    return assemble(record['frames'], [np.frombuffer((root / f['file']).read_bytes(), np.uint8)
        .reshape(f['metadata']['logical'][1], f['metadata']['logical'][0], 4) for f in record['frames']], 1)


models = {name: fit_member(*native(r), name, r['frames'][0]['metadata']['rampType']) for name, r in records.items()}
locations, page_cache = {}, {}
for group in manifest['groups']:
    cursor = 0
    for member in group['members']:
        locations[member['member']] = (group, cursor)
        cursor += len(member['images'])


def accepted_member(name, density):
    group, cursor = locations[name]
    variant = next(v for v in group['variants'] if v['density'] == density)
    key = variant['file']
    if key not in page_cache:
        data = (base / key).read_bytes()
        assert sha(data) == variant['sha256']
        page_cache[key] = np.frombuffer(data, np.uint8).reshape(variant['size'][1], variant['size'][0], 4)
    frames = records[name]['frames']
    rects = variant['rects'][cursor:cursor + len(frames)]
    return assemble(frames, [page_cache[key][y:y + h, x:x + w] for x, y, w, h in rects], density)


report = dict(schema='native-road-slopes-v52', baseline=pack['pointer'], preserved=preserved,
    theater=theater,
    policy='Reuse accepted HD asphalt, paint and curbs through native slope-plane coordinates. Preserve source hashes, all TMP metadata, alpha, atlas geometry and complete group closure. No gameplay or budget changes.', frames=[])
for group in manifest['groups']:
    if group['id'] not in changed_groups:
        continue
    indices, cursor = {}, 0
    for member in group['members']:
        indices[member['member']] = cursor
        cursor += len(member['images'])
    for variant in group['variants']:
        density = variant['density']
        data = (base / variant['file']).read_bytes()
        assert sha(data) == variant['sha256']
        before = np.frombuffer(data, np.uint8).reshape(variant['size'][1], variant['size'][0], 4)
        atlas = before.copy()
        for member in group['members']:
            name = member['member']
            if not name.startswith('prslpe'):
                continue
            r, model = records[name], models[name]
            extension = name.split('.')[-1]
            donor_name = ('proad01.' if model['sign'] == -1 else 'proad02.') + extension
            donor, origin = accepted_member(donor_name, density)
            nearest = ndimage.distance_transform_edt(donor[..., 3] == 0, return_distances=False, return_indices=True)
            donor_rgb = donor[tuple(nearest)][..., :3].astype(float)
            for slot, frame in enumerate(r['frames']):
                x, y, w, h = variant['rects'][indices[name] + slot]
                old = before[y:y + h, x:x + w]
                md = frame['metadata']
                yy, xx = (np.indices((h, w)) + .5) / density
                gx, gy = xx + md['origin'][0] + md['offset'][0], yy + md['origin'][1] + md['offset'][1]
                qx, qy = plane(gx, gy, md['rampType'])
                cross = qx + model['sign'] * 2 * qy - model['center'] + models[donor_name]['center']
                if model['sign'] == -1:
                    v = (30 - cross) / 60
                    u = (qx / 60 + qy / 30 - .5) % 1
                else:
                    u = (cross - 30) / 60
                    v = (-qx / 60 + qy / 30 + .5) % 1
                sx, sy = 30 + 30 * (u - v), 15 * (u + v)
                samples = [(sy - origin[1]) * density - .5, (sx - origin[0]) * density - .5]
                rgb = np.stack([ndimage.map_coordinates(donor_rgb[..., c], samples, order=1, mode='nearest') for c in range(3)], axis=2)
                repaired = old.copy()
                repaired[..., :3] = np.rint(np.clip(rgb, 0, 255)).astype(np.uint8)
                np.testing.assert_array_equal(repaired[..., 3], old[..., 3])
                atlas[y:y + h, x:x + w] = repaired
                # Existing atlas gutters follow the corrected edge samples.
                atlas[y - 2:y + h + 2, x - 2:x + w + 2] = np.pad(repaired, ((2, 2), (2, 2), (0, 0)), mode='edge')
                Image.fromarray(repaired).save(root / f'{name}-{slot}-{density}x-fixed.png')
                report['frames'].append(dict(member=name, sourceHashes=r['sourceHashes'], slot=slot, density=density,
                    donor=donor_name, nativeCenter=model['center'], donorCenter=models[donor_name]['center'],
                    alphaExact=True, beforeSha256=sha(old.tobytes()), afterSha256=sha(repaired.tobytes())))
        payload = atlas.tobytes()
        (destination / variant['file']).write_bytes(payload)
        variant.update(sha256=sha(payload), bytes=len(payload))
metadata = (json.dumps(manifest, separators=(',', ':')) + '\n').encode()
(destination / 'manifest.json').write_bytes(metadata)
report['candidate'] = dict(schemaVersion=1, revision=revision, sha256=sha(metadata))
(root / 'export.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(dict(candidate=report['candidate'], frames=len(report['frames']), preservedFiles=len(preserved))))
