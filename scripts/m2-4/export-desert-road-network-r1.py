"""Repair the complete Desert curve/slope asphalt network and TMP sample gutters."""
import copy
import hashlib
import json
import os
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'m2'))
from shared_road_network import asphalt_pixels, periodic_material, project_road_material

root = Path('.artifacts/m2-4/desert-road-network-r1-20261019')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
feedback = read(root/'feedback.json')
baseline = read(Path('.local/terrain-desert-selection.json'))
assert baseline == feedback['baseline']
old_root = Path('.local/terrain-packs')/baseline['revision']
assert sha(old_root/'manifest.json') == baseline['sha256']
manifest = read(old_root/'manifest.json')
native_root = Path('.artifacts/m2-4/desert-native-v1')
native = {s['member']: s for s in read(native_root/'source.json')['sources']}
revision = 'desert-m2-4-road-network-contacts-r1-v3'
destination = Path('.local/terrain-packs')/revision
destination.mkdir(exist_ok=False)
cache = {}


def pixels(member, slot, density):
    group = next(g for g in manifest['groups'] if any(m['member'] == member for m in g['members']))
    variant = next(v for v in group['variants'] if v['density'] == density)
    file = old_root/variant['file']
    if file not in cache:
        assert sha(file) == variant['sha256']
        cache[file] = np.fromfile(file, np.uint8).reshape(*reversed(variant['size']), 4)
    offset = 0
    for source in group['members']:
        if source['member'] == member:
            break
        offset += len(source['images'])
    x, y, w, h = variant['rects'][offset+slot]
    return cache[file][y:y+h, x:x+w].copy()


def native_pixels(image):
    file = native_root/'native'/image['file']
    assert sha(file) == image['rgbaSha256']
    return np.fromfile(file, np.uint8).reshape(*reversed(image['size']), 4)


flat_light = np.concatenate([native_pixels(i)[..., :3][asphalt_pixels(native_pixels(i))]
    for name in ['proad01.des', 'proad02.des'] for i in native[name]['images']]).mean()
changed_groups = {'m2-4-desert-hybrid-roads-set20', 'm2-4-desert-equivalent-set47'}
records, preserved = [], []
for group in manifest['groups']:
    if group['id'] not in changed_groups:
        for variant in group['variants']:
            file = old_root/variant['file']
            assert sha(file) == variant['sha256']
            os.link(file, destination/variant['file'])
            preserved.append(dict(file=variant['file'], sha256=variant['sha256']))
        continue
    for variant in group['variants']:
        density = variant['density']
        file = old_root/variant['file']
        assert sha(file) == variant['sha256']
        original = np.fromfile(file, np.uint8).reshape(*reversed(variant['size']), 4)
        atlas = original.copy()
        reference = pixels('proad01.des', 1, density)
        road_reference = np.concatenate([pixels(name, slot, density)[..., :3][asphalt_pixels(pixels(name, slot, density))]
            for name in ['proad01.des', 'proad02.des'] for slot in range(3)])
        target_mean = road_reference.mean(0)
        material = periodic_material(reference, density, target_mean)
        material_file = root/f'shared-asphalt-{density}x-v3.npy'
        if material_file.exists():
            np.testing.assert_array_equal(np.load(material_file), material)
        else:
            np.save(material_file, material)
        offset = 0
        for member in group['members']:
            source = native[member['member']]
            assert sha(native_root/'native'/source['nativeFile']) == source['sha256'] == member['sourceHashes']['yr']
            slope = member['member'].startswith('prslpe')
            straight = member['member'].split('.')[0] in ['proad01', 'proad01a', 'proad01b', 'proad01c',
                'proad02', 'proad02a', 'proad02b', 'proad02c']
            if slope:
                plane = np.concatenate([native_pixels(i)[..., :3][asphalt_pixels(native_pixels(i))]
                    for i in source['images']]).mean()/flat_light
            else:
                plane = 1
            for image in source['images']:
                x, y, w, h = variant['rects'][offset]
                offset += 1
                before = original[y:y+h, x:x+w].copy()
                if straight or image['nativeOffset'] == 0:
                    result = before.copy()
                    record = dict(changedPixels=0, status='EXACT_BODY_PRESERVED')
                else:
                    result, record = project_road_material(before, native_pixels(image), image, density, material, plane)
                np.testing.assert_array_equal(result[..., 3], before[..., 3])
                # Match accepted Temperate TMP packing. This is a terrain atlas,
                # whose two-pixel sampling gutter is separate from native coverage.
                atlas[y-2:y+h+2, x-2:x+w+2] = np.pad(result, ((2, 2), (2, 2), (0, 0)), mode='edge')
                records.append(dict(member=member['member'], subTile=image['subTile'], density=density,
                    nativePointer=image['nativeOffset'], bodySha256=hashlib.sha256(result.tobytes()).hexdigest(),
                    **record))
        (destination/variant['file']).write_bytes(atlas.tobytes())
        variant['sha256'] = sha(destination/variant['file'])
manifest['revision'] = revision
(destination/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
candidate = dict(schemaVersion=1, revision=revision, sha256=sha(destination/'manifest.json'))
receipt = dict(status='EXPORTED_SHARED_ASPHALT_AND_ACCEPTED_TMP_GUTTERS_NATIVE_PENDING', baseline=baseline,
    candidate=candidate, changedGroups=sorted(changed_groups), changedAsphaltMembers=16,
    exactStraightBodies=8, otherPayloadFilesExact=preserved, records=records,
    nativeGeometryAndAlpha='EXACT', nativeMapsOrRulesModified=False, corePreparedChanged=False,
    native='PENDING', visualAcceptance='PENDING', windows='NOT_RUN', m24Complete=False)
(root/'export-and-preservation-v3.json').write_text(json.dumps(receipt, indent=2)+'\n')
print(json.dumps(dict(candidate=candidate, changedMembers=16, otherPayloadFilesExact=len(preserved))))
