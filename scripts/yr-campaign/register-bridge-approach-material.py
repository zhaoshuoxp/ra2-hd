"""Normalize bridge-approach asphalt to the selected Newurban road material."""
import copy
import hashlib
import json
import os
from pathlib import Path

import numpy as np

root = Path(__file__).resolve().parents[2]
read = lambda p: json.loads(p.read_text())
encode = lambda value: (json.dumps(value, indent=2) + '\n').encode()
sha = lambda data: hashlib.sha256(data).hexdigest()
pointer_file = root / '.local/terrain-newurban-selection.json'
selected_before = read(pointer_file)
prior = {'schemaVersion': 1, 'revision': 'yr-newurban-paved-roads-r3',
    'sha256': '99838da0ce98a344cc15e64041a65c39bddf11b31b902478c7b17763ec9df886'}
source = root / '.local/terrain-packs' / prior['revision']
assert sha((source / 'manifest.json').read_bytes()) == prior['sha256']
manifest = copy.deepcopy(read(source / 'manifest.json'))
revision = 'yr-newurban-bridge-approach-material-r9'
destination = root / '.local/terrain-packs' / revision
destination.mkdir()
road_means, bridge_means = {}, {}
changed = []
records = []

def material(rgb):
    return np.clip((140-rgb.max(2))/25, 0, 1) * np.clip((50-np.ptp(rgb, axis=2))/20, 0, 1) * np.clip((rgb.mean(2)-20)/20, 0, 1)


def frame_entries(group, variant):
    cursor = 0
    for member in group['members']:
        for image, rect in zip(member['images'], variant['rects'][cursor:cursor+len(member['images'])]):
            yield member['member'], image, rect
        cursor += len(member['images'])


for density in [2, 4]:
    road_samples, bridge_samples = [], []
    for group in manifest['groups']:
        v, = [v for v in group['variants'] if v['density'] == density]
        relevant = any(m['member'] in ['proad01.ubn', 'proad02.ubn'] or m['member'].startswith('ovrps') for m in group['members'])
        if not relevant:
            continue
        payload = (source / v['file']).read_bytes()
        assert sha(payload) == v['sha256']
        atlas = np.frombuffer(payload, np.uint8).reshape(*v['size'][::-1], 4)
        for name, image, rect in frame_entries(group, v):
            is_bridge = name.startswith('ovrps') and image['terrainType'] == 11
            is_road = name in ['proad01.ubn', 'proad02.ubn']
            if not (is_bridge or is_road):
                continue
            x, y, w, h = rect
            ox, oy = [-value*density for value in image['offset']]
            pixels = atlas[y+oy:y+oy+30*density, x+ox:x+ox+60*density]
            rgb = pixels[..., :3].astype(float)
            mask = (pixels[..., 3] > 0) & (material(rgb) > .99) & (rgb.max(2) < 100)
            (bridge_samples if is_bridge else road_samples).extend(rgb[mask])
    road_means[density] = np.mean(road_samples, axis=0)
    bridge_means[density] = np.mean(bridge_samples, axis=0)
    assert np.isfinite(road_means[density]).all() and np.isfinite(bridge_means[density]).all()
for group in manifest['groups']:
    relevant = any(m['member'].startswith('ovrps') and any(i['terrainType'] == 11 for i in m['images']) for m in group['members'])
    for variant in group['variants']:
        file = source / variant['file']
        assert sha(file.read_bytes()) == variant['sha256']
        target = destination / variant['file']
        if not relevant:
            os.link(file, target)
            continue
        density = variant['density']
        original = np.frombuffer(file.read_bytes(), np.uint8).reshape(*variant['size'][::-1], 4)
        atlas = original.copy()
        delta = road_means[density] - bridge_means[density]
        for name, image, rect in frame_entries(group, variant):
            if not name.startswith('ovrps') or image['terrainType'] != 11:
                continue
            x, y, w, h = rect
            ox, oy = [-value*density for value in image['offset']]
            main = atlas[y+oy:y+oy+30*density, x+ox:x+ox+60*density]
            previous = main.copy()
            rgb = main[..., :3].astype(float)
            weight = material(rgb) * (main[..., 3] > 0)
            main[..., :3] = np.uint8(np.clip(rgb + weight[..., None]*delta, 0, 255))
            np.testing.assert_array_equal(previous[..., 3], main[..., 3])
            np.testing.assert_array_equal(previous[weight == 0], main[weight == 0])
            records.append({'member': name, 'frame': image['subTile'], 'density': density,
                'colorOffset': delta.tolist(), 'changedPixels': int(np.any(main != previous, axis=2).sum()),
                'alphaAndNonAsphaltExact': True})
        np.testing.assert_array_equal(original[..., 3], atlas[..., 3])
        target.open('xb').write(atlas.tobytes())
        variant['sha256'] = sha(target.read_bytes())
        changed.append(variant['file'])
manifest['revision'] = revision
manifest_bytes = (json.dumps(manifest, separators=(',', ':')) + '\n').encode()
assert len(manifest_bytes) <= 2 * 1024 * 1024
(destination / 'manifest.json').write_bytes(manifest_bytes)
after = {'schemaVersion': 1, 'revision': revision, 'sha256': sha(manifest_bytes)}
contract_file = root / 'desktop/terrain-theater-hd-contracts.json'
contract = read(contract_file)
assert contract['NEWURBAN'] == selected_before
contract['NEWURBAN'] = after
contract_file.write_bytes(encode(contract))
pointer_file.write_bytes(encode(after))
receipt = {'schema': 'yr-bridge-approach-common-road-material-v1', 'status': 'SELECTED_NATIVE_REVIEW_PENDING',
    'before': prior, 'replacesUnacceptedSelection': selected_before, 'after': after, 'manifestBytes': len(manifest_bytes), 'changedFiles': changed, 'frames': records,
    'roadMeans': {str(k): v.tolist() for k, v in road_means.items()},
    'bridgeMeansBefore': {str(k): v.tolist() for k, v in bridge_means.items()},
    'newRasterArtwork': 0, 'originalMapsGeometryAlphaShadowsAndTimingChanged': 0,
    'oldPackFilesChanged': 0, 'otherTerrainGroupsChanged': 0, 'userVisualAcceptance': 'PENDING'}
(root / 'docs/yr-campaign-bridge-approach-material-20261108-r9.json').open('xb').write(encode(receipt))
print(json.dumps({'selected': after, 'frames': len(records), 'offsets': {str(k): (road_means[k]-bridge_means[k]).tolist() for k in road_means}}))
