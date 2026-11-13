"""Validate a reopened road increment against every prior terrain pixel."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('export', type=Path)
args = parser.parse_args()
report = json.loads(args.export.read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()
base = Path('.local/terrain-packs') / report['baseline']['revision']
current = Path('.local/terrain-packs') / report['candidate']['revision']
assert sha((base / 'manifest.json').read_bytes()) == report['baseline']['sha256']
assert sha((current / 'manifest.json').read_bytes()) == report['candidate']['sha256']
before, after = [json.loads((root / 'manifest.json').read_text()) for root in [base, current]]
assert {key: value for key, value in before.items() if key not in ['revision', 'groups']} == {
    key: value for key, value in after.items() if key not in ['revision', 'groups']}
assert len(after['groups']) == len(before['groups']) + len(report['addedMembers'])
source_file = Path(report['source']['file']); assert sha(source_file.read_bytes()) == report['source']['sha256']
pack, = [pack for pack in json.loads(source_file.read_text())['packs'] if pack['theater'] == report['theater']]
records = {record['member']: record for record in pack['records']}
changed, added, preserved, preserved_groups, files = 0, 0, 0, 0, []
for old_group, new_group in zip(before['groups'], after['groups'][:len(before['groups'])], strict=True):
    assert {key: value for key, value in old_group.items() if key != 'variants'} == {
        key: value for key, value in new_group.items() if key != 'variants'}
    same = True
    for old, new in zip(old_group['variants'], new_group['variants'], strict=True):
        assert {key: value for key, value in old.items() if key != 'sha256'} == {
            key: value for key, value in new.items() if key != 'sha256'}
        a_raw, b_raw = (base / old['file']).read_bytes(), (current / new['file']).read_bytes()
        assert sha(a_raw) == old['sha256'] and sha(b_raw) == new['sha256']
        files.append(dict(file=new['file'], sha256=new['sha256'], bytes=len(b_raw)))
        if a_raw == b_raw:
            preserved += sum(len(member['images']) for member in old_group['members']); continue
        same = False; assert old_group['id'] in report['changedGroups']
        shape = (old['size'][1], old['size'][0], 4)
        a, b = np.frombuffer(a_raw, np.uint8).reshape(shape), np.frombuffer(b_raw, np.uint8).reshape(shape)
        allowed = np.zeros(shape[:2], bool); cursor = 0
        for member in old_group['members']:
            for image in member['images']:
                x, y, width, height = old['rects'][cursor]; cursor += 1
                original, revised = a[y:y+height, x:x+width], b[y:y+height, x:x+width]
                if member['member'] in report['members']:
                    np.testing.assert_array_equal(original[..., 3], revised[..., 3]); changed += 1
                    allowed[y-2:y+height+2, x-2:x+width+2] = True
                else:
                    np.testing.assert_array_equal(original, revised); preserved += 1
        np.testing.assert_array_equal(a[~allowed], b[~allowed])
    if same: preserved_groups += 1
for group in after['groups'][len(before['groups']):]:
    assert len(group['members']) == 1
    member, = group['members']; assert member['member'] in report['addedMembers']
    record = records[member['member']]
    assert member == dict(member=record['member'], sourceHashes=record['sourceHashes'],
        images=[frame['metadata'] for frame in record['frames']])
    assert [variant['density'] for variant in group['variants']] == [2, 4]
    for variant in group['variants']:
        density = variant['density']; raw = (current / variant['file']).read_bytes()
        assert sha(raw) == variant['sha256'] and len(raw) == variant['bytes'] == np.prod(variant['size']) * 4
        atlas = np.frombuffer(raw, np.uint8).reshape(variant['size'][1], variant['size'][0], 4)
        assert len(variant['rects']) == len(record['frames'])
        for frame, (x, y, width, height) in zip(record['frames'], variant['rects'], strict=True):
            native_width, native_height = frame['metadata']['logical']
            assert [width, height] == [native_width * density, native_height * density]
            native = np.frombuffer((source_file.parent / frame['file']).read_bytes(), np.uint8).reshape(
                native_height, native_width, 4)
            expected = np.repeat(np.repeat(native[..., 3], density, axis=0), density, axis=1)
            np.testing.assert_array_equal(atlas[y:y+height, x:x+width, 3], expected); added += 1
        files.append(dict(file=variant['file'], sha256=variant['sha256'], bytes=len(raw)))
assert changed + added == len(report['frames'])
result = dict(schema='reopened-road-slope-increment-validation-v1',
    status='PASS_ALL_NATIVE_GEOMETRY_ALPHA_AND_UNRELATED_TERRAIN_PIXELS', baseline=report['baseline'],
    candidate=report['candidate'], changedDensityFrames=changed, addedDensityFrames=added,
    preservedDensityFrames=preserved, preservedGroups=preserved_groups,
    originalMapsAndRulesUnchanged=True, allPriorNativeMetadataAndAtlasLayoutExact=True,
    allUnrelatedPixelsAndGroupsExact=True, files=files, worldCapsChanged=False,
    visualQualification='PENDING_NATIVE_MAP_CONTACT_INSPECTION')
target = args.export.parent / 'validation.json'; assert not target.exists()
target.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: value for key, value in result.items() if key not in ['files', 'baseline', 'candidate']}))
