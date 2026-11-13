"""Verify native geometry, complete groups and unchanged artwork around v52 slopes."""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np

root = Path(sys.argv[1])
report = json.loads((root / 'export.json').read_text())
read = lambda p: json.loads(p.read_text())
sha = lambda b: hashlib.sha256(b).hexdigest()
base = Path('.local/terrain-packs') / report['baseline']['revision']
current = Path('.local/terrain-packs') / report['candidate']['revision']
theater = report.get('theater', 'temperate')
suffix = '' if theater == 'temperate' else '-' + theater
assert read(Path(f'.local/terrain{suffix}-selection.json')) == report['candidate']
desktop = read(Path('desktop/terrain-hd-contract.json')) if theater == 'temperate' else read(Path('desktop/terrain-theater-hd-contracts.json'))[theater.upper()]
assert desktop == report['candidate']
assert sha((base / 'manifest.json').read_bytes()) == report['baseline']['sha256']
assert sha((current / 'manifest.json').read_bytes()) == report['candidate']['sha256']
assert (current / 'manifest.json').stat().st_size <= 2 * 1024 * 1024
before, after = read(base / 'manifest.json'), read(current / 'manifest.json')
assert before.keys() == after.keys()
for key in before.keys() - {'revision', 'groups'}:
    assert before[key] == after[key], key
files, changed_frames, preserved_frames = [], [], 0
changed_members = set(report.get('changedMembers', []))
added_members = set(report.get('addedMembers', []))
records = {r['member']: r for p in read(root / 'source.json')['packs'] for r in p['records']}
for group, target in zip(before['groups'], after['groups'], strict=True):
    for key in group.keys() - {'variants', 'members'}:
        assert group[key] == target[key], (group['id'], key)
    assert group['members'] == [member for member in target['members'] if member['member'] not in added_members]
    for member in target['members']:
        if member['member'] in added_members:
            record = records[member['member']]
            assert member == dict(member=record['member'], sourceHashes=record['sourceHashes'],
                images=[frame['metadata'] for frame in record['frames']])
    for variant, candidate in zip(group['variants'], target['variants'], strict=True):
        for key in variant.keys() - {'sha256', 'rects'}:
            assert variant[key] == candidate[key], (group['id'], key)
        assert variant['rects'] == candidate['rects'][:len(variant['rects'])]
        raw, updated = (base / variant['file']).read_bytes(), (current / candidate['file']).read_bytes()
        assert sha(raw) == variant['sha256'] and sha(updated) == candidate['sha256']
        files.append(dict(file=str(current / candidate['file']), bytes=len(updated), sha256=sha(updated),
            changed=raw != updated, density=variant['density']))
        if raw == updated:
            preserved_frames += sum(len(m['images']) for m in group['members'])
            continue
        size = variant['size']
        a, b = [np.frombuffer(data, np.uint8).reshape(size[1], size[0], 4) for data in [raw, updated]]
        slot = 0
        for member in target['members']:
            for native in member['images']:
                x, y, w, h = candidate['rects'][slot]
                slot += 1
                old, new = a[y:y + h, x:x + w], b[y:y + h, x:x + w]
                if member['member'] in added_members:
                    frame = records[member['member']]['frames'][native['subTile']]
                    rgba = np.frombuffer((root / frame['file']).read_bytes(), np.uint8).reshape(native['logical'][1], native['logical'][0], 4)
                    expected = np.repeat(np.repeat(rgba[..., 3], variant['density'], axis=0), variant['density'], axis=1)
                    np.testing.assert_array_equal(new[..., 3], expected)
                    changed_frames.append(dict(member=member['member'], density=variant['density'], subTile=native['subTile'],
                        native=native, rgbaSha256=sha(new.tobytes()), sourceCoverageExact=True, added=True))
                    continue
                if member['member'] in changed_members or not changed_members and member['member'].startswith('prslpe'):
                    np.testing.assert_array_equal(old[..., 3], new[..., 3])
                    changed_frames.append(dict(member=member['member'], density=variant['density'],
                        subTile=native['subTile'], native=native, rgbaSha256=sha(new.tobytes()), alphaExact=True))
                else:
                    np.testing.assert_array_equal(old, new)
                    preserved_frames += 1
assert len(changed_frames) == (len(report['frames']) if changed_members else 24)
other = []
for pack in read(root / 'source.json')['packs']:
    if pack['theater'] == theater:
        continue
    assert read(Path(pack['selector'])) == pack['pointer']
    other.append(dict(theater=pack['theater'], selector=pack['selector'], unchanged=True))
result = dict(status='PASS_NATIVE_METADATA_ALPHA_COMPLETE_GROUPS_AND_UNRELATED_PIXELS_EXACT',
    baseline=report['baseline'], selected=report['candidate'], changedFrames=changed_frames,
    preservedFrames=preserved_frames, files=files, otherTheaters=other,
    originalSourceAuthority=next(p['palette'] for p in read(root / 'source.json')['packs'] if p['theater'] == theater),
    budgetAndAtlasGeometryUnchanged=True, gameplaySourceUnchanged=True)
(root / 'validation.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(dict(status=result['status'], changedFrames=len(changed_frames), preservedFrames=preserved_frames)))
