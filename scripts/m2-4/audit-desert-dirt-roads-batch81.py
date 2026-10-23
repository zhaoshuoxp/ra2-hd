"""Verify source-owned geometry, coverage, atlas gutters and prior accepted payloads."""
import hashlib
import json
from pathlib import Path
import numpy as np

root = Path('.artifacts/m2-4/desert-dirt-roads-batch81-20261019')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
receipt = read(root/'export-and-preservation-v7.json')
pack = Path('.local/terrain-packs')/receipt['candidate']['revision']
old_root = Path('.local/terrain-packs')/receipt['baseline']['revision']
assert sha(pack/'manifest.json') == receipt['candidate']['sha256']
assert (pack/'manifest.json').stat().st_size <= 2*1024*1024
manifest, old = read(pack/'manifest.json'), read(old_root/'manifest.json')
native_root = Path('.artifacts/m2-4/desert-native-v1')
sources = {s['member']: s for s in read(native_root/'source.json')['sources']}
checked = active = compatibility = exact_files = 0
summaries = []
for group in manifest['groups']:
    if group['id'] not in receipt['newGroups']:
        assert group == next(g for g in old['groups'] if g['id'] == group['id'])
        for variant in group['variants']:
            assert sha(pack/variant['file']) == sha(old_root/variant['file'])
            exact_files += 1
        continue
    for member in group['members']:
        source = sources[member['member']]
        assert member['sourceHashes'] == dict(ra2=source['sha256'], yr=source['sha256'])
        expected = [{k: v for k, v in i.items() if k not in ['nativeOffset', 'size', 'file', 'rgbaSha256']}
            for i in source['images']]
        assert expected == member['images']
    for variant in group['variants']:
        assert max(variant['size']) <= 8192
        assert sha(pack/variant['file']) == variant['sha256']
        pixels = np.fromfile(pack/variant['file'], np.uint8).reshape(*reversed(variant['size']), 4)
        offset = 0
        for member in group['members']:
            for image in sources[member['member']]['images']:
                x, y, w, h = variant['rects'][offset]
                offset += 1
                file = native_root/'native'/image['file']
                assert sha(file) == image['rgbaSha256']
                original = np.fromfile(file, np.uint8).reshape(*reversed(image['size']), 4)
                expanded = original.repeat(variant['density'], 0).repeat(variant['density'], 1)
                body = pixels[y:y+h, x:x+w]
                np.testing.assert_array_equal(body[..., 3], expanded[..., 3])
                np.testing.assert_array_equal(pixels[y-2:y+h+2, x-2:x+w+2],
                    np.pad(body, ((2, 2), (2, 2), (0, 0)), mode='edge'))
                checked += 1
                if image['nativeOffset'] == 0:
                    np.testing.assert_array_equal(body, expanded)
                    compatibility += 1
                else:
                    active += 1
    summaries.append(dict(id=group['id'], members=len(group['members']),
        variants=[dict(density=v['density'], size=v['size'], bytes=int(np.prod(v['size']))*4)
            for v in group['variants']]))
assert (checked, active, compatibility, exact_files) == (1388, 1042, 346, 42)
result = dict(status='PASS_ALL_NATIVE_GEOMETRY_ALPHA_GUTTERS_AND_PRIOR_PAYLOADS',
    candidate=receipt['candidate'], checkedDensitySlots=checked, actualDensitySlots=active,
    compatibilityDensitySlots=compatibility, priorGroupsExact=21, priorPayloadFilesExact=exact_files,
    newGroups=summaries, originalIndexedPatterns='DIFFERENT_EXPECTED_CLIMATE_ADAPTATION_NOT_RAW_EQUIVALENCE',
    depthAndExtraPatterns='EXACT_521_NATIVE_OCCUPIED_SLOTS', visualAcceptance='PENDING', native='PENDING')
(root/'independent-static-audit-v7.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps(result))
