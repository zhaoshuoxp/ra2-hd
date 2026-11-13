"""Verify the final formal increment against retained accepted source identities."""
import hashlib
import json
from pathlib import Path
import sys

import numpy as np

output = Path(sys.argv[1])
history = Path('../project-history/ra2-campaign-completion-20261026')
read = lambda file: json.loads(file.read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()
source = read(history / 'Art/V53/UrbanSlopes/source.json')
original = next(pack for pack in source['packs'] if pack['theater'] == 'urban')['pointer']
selected = read(Path('.local/terrain-urban-selection.json'))
assert read(Path('desktop/terrain-theater-hd-contracts.json'))['URBAN'] == selected
before_root = Path('.local/terrain-packs') / original['revision']
after_root = Path('.local/terrain-packs') / selected['revision']
before_bytes, after_bytes = [(root / 'manifest.json').read_bytes() for root in [before_root, after_root]]
assert sha(before_bytes) == original['sha256'] and sha(after_bytes) == selected['sha256']
before, after = map(json.loads, [before_bytes, after_bytes])
assert len(before['groups']) == len(after['groups'])
unchanged, revised, added, atlas_files, members = 0, 0, 0, [], []
for group, target in zip(before['groups'], after['groups'], strict=True):
    assert group['id'] == target['id']
    previous_members = {member['member']: member for member in group['members']}
    for member in target['members']:
        if member['member'] in previous_members:
            assert member == previous_members[member['member']]
        else:
            assert member['member'] == 'drslpe04.urb' and member['sourceHashes']['ra2'] == member['sourceHashes']['yr']
        if member['member'].startswith(('prslpe', 'drslpe')):
            members.append(dict(member=member['member'], sourceHashes=member['sourceHashes'], frames=len(member['images'])))
    for old, current in zip(group['variants'], target['variants'], strict=True):
        assert old['density'] == current['density'] and old['size'] == current['size']
        assert old['rects'] == current['rects'][:len(old['rects'])]
        a, b = [(root / variant['file']).read_bytes() for root, variant in [(before_root, old), (after_root, current)]]
        assert len(a) == len(b) == old.get('bytes', len(a)) == current.get('bytes', len(b))
        assert sha(a) == old['sha256'] and sha(b) == current['sha256']
        shape = (old['size'][1], old['size'][0], 4)
        a, b = np.frombuffer(a, np.uint8).reshape(shape), np.frombuffer(b, np.uint8).reshape(shape)
        slot = 0
        for member in target['members']:
            for metadata in member['images']:
                x, y, w, h = current['rects'][slot]; slot += 1
                if member['member'] not in previous_members:
                    added += 1; continue
                original_frame, final_frame = a[y:y + h, x:x + w], b[y:y + h, x:x + w]
                if member['member'].startswith(('prslpe', 'drslpe')):
                    np.testing.assert_array_equal(original_frame[..., 3], final_frame[..., 3]); revised += 1
                else:
                    np.testing.assert_array_equal(original_frame, final_frame); unchanged += 1
        if old['sha256'] != current['sha256']:
            atlas_files.append(dict(file=str(after_root / current['file']), density=current['density'],
                bytes=current['bytes'], sha256=current['sha256'], atlasSize=current['size']))
assert (revised, added, unchanged) == (52, 4, 4554), (revised, added, unchanged)
worlds = []
for stem in ['all01t', 'all02s', 'all03u', 'all04u']:
    root = Path('.local/campaign/ra2') / stem
    baseline = read(history / 'Art/V53/LoadingWorlds' / stem / 'previous-manifest.json')
    manifest = read(root / 'manifest.json'); entries = {entry['name']: entry for entry in manifest['files']}
    preserved = []
    for entry in baseline['files']:
        if entry['name'] == 'interface-hd.json': continue
        assert entries[entry['name']] == entry
        route = entry.get('route', '')
        file = Path('.local/campaign') / route.removeprefix('/local-campaign/') if route.startswith('/local-campaign/') else root / entry['name']
        assert sha(file.read_bytes()) == entry['sha256']; preserved.append(entry['name'])
    spec = read(root / 'interface-hd.json'); world = spec['loading']['world']; asset = entries[world['file']]
    assert sha((root / world['file']).read_bytes()) == asset['sha256']
    assert all(sha((root / variant['file']).read_bytes()) == entries[variant['file']]['sha256'] for variant in spec['loading']['variants'])
    worlds.append(dict(mission=stem + '.map', interfaceRevision=spec['revision'], world=asset, binding=world,
        preservedSourceMediaAndForegroundFiles=len(preserved), foregroundVariantsExact=True))
result = dict(status='PASS_FINAL_FORMAL_SOURCE_IDENTITIES_UNRELATED_FRAMES_AND_BUDGETS',
    urban=dict(baseline=original, selected=selected, members=members, revisedDensityFrames=revised,
        addedDensityFrames=added, unrelatedDensityFramesExact=unchanged, atlasFiles=atlas_files,
        nativeAlphaAndAtlasGeometryUnchanged=True), loadingWorlds=worlds,
    budgets=dict(density2=536870912, density4=1610612736, interface=16777216, changed=False),
    maintenance='Prepare from current canonical formal resources, project accepted donors using native source geometry, validate both editions and independent densities, and publish a new immutable revision. Source recipes and failed-attempt evidence remain under Art/V53.',
    userVisualAcceptance='PENDING_CONSOLIDATED_REVIEW', windows='NOT_RUN_ON_THIS_MAC')
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(dict(status=result['status'], revised=revised, added=added, unchanged=unchanged, worlds=len(worlds))))
