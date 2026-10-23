"""Independently check corrected atlas alpha, native metadata and accepted preservation."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--select', action='store_true')
args = parser.parse_args()
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
evidence = Path('.artifacts/m2-4/structures-material-seams-r1-20261019')
feedback = read(evidence / 'feedback.json')
contract_file = Path('desktop/terrain-theater-hd-contracts.json')
contract = read(contract_file)
assert sha(contract_file) == feedback['terrainContractSha256']
records = []
for theater in ['NEWURBAN', 'DESERT']:
    name = theater.lower()
    before = feedback['baselineSelections'][name]
    pointer_file = Path(f'.local/terrain-{name}-selection.json')
    assert read(pointer_file) == contract[theater] == before
    old_root = Path('.local/terrain-packs') / before['revision']
    new_root = Path('.local/terrain-packs') / f'{name}-m2-4-structures-material-contacts-r1'
    old, new = read(old_root / 'manifest.json'), read(new_root / 'manifest.json')
    assert sha(old_root / 'manifest.json') == before['sha256']
    assert len(old['groups']) == len(new['groups'])
    old_groups = {row['id']: row for row in old['groups']}
    assert old_groups.keys() == {row['id'] for row in new['groups']}
    author = Path(f'.artifacts/m2-4/{name}-structures-contact-r1-authoring-20261019')
    recipe = read(author / new['revision'] / 'recipe.json')
    validation = read(author / new['revision'] / 'validation.json')
    assert validation['status'] == 'PASS_NEW_COMPLETE_GROUPS_NATIVE_METADATA_ALPHA_GUTTERS_AND_ACCEPTED_REUSE'
    assert validation['pack']['sha256'] == sha(new_root / 'manifest.json')
    corrected = set(recipe['materialProfile']['nativeContinuousStructureContacts'])
    assert 'ovrps02.ubn' not in corrected
    changed, preserved, density_pairs, good_bridge_pairs = set(), 0, 0, 0
    for group in new['groups']:
        prior = old_groups[group['id']]
        assert {key: value for key, value in group.items() if key != 'variants'} == {
            key: value for key, value in prior.items() if key != 'variants'}
        if not any(member['member'] in corrected for member in group['members']):
            assert group == prior
            for variant in group['variants']:
                assert sha(new_root / variant['file']) == sha(old_root / variant['file']) == variant['sha256']
            preserved += 1
            continue
        for variant in group['variants']:
            previous = next(row for row in prior['variants'] if row['density'] == variant['density'])
            assert variant['size'] == previous['size'] and variant['rects'] == previous['rects']
            assert sha(new_root / variant['file']) == variant['sha256']
            assert sha(old_root / previous['file']) == previous['sha256']
            width, height = variant['size']
            current = np.frombuffer((new_root / variant['file']).read_bytes(), np.uint8).reshape(height, width, 4)
            original = np.frombuffer((old_root / previous['file']).read_bytes(), np.uint8).reshape(height, width, 4)
            frames = iter(variant['rects'])
            for member in group['members']:
                for image in member['images']:
                    x, y, w, h = next(frames)
                    a, b = current[y:y+h, x:x+w], original[y:y+h, x:x+w]
                    np.testing.assert_array_equal(a[..., 3], b[..., 3])
                    if member['member'] == 'ovrps02.ubn':
                        np.testing.assert_array_equal(a, b)
                        good_bridge_pairs += 1
                    elif not np.array_equal(a, b):
                        changed.add(member['member'])
                    density_pairs += 1
    assert changed == corrected, 'Every declared contact correction must actually change its source member'
    if name == 'newurban':
        assert good_bridge_pairs > 0
    metrics = []
    for member in corrected:
        values = recipe['nativeMaterialCorrections'][member]['continuousStructureContacts']
        assert set(values) == {'2', '4'}
        for density, value in values.items():
            assert not value['alphaChanged'] and value['afterP95EdgeDarkening'] <= 19
            metrics.append(dict(member=member, density=int(density), **value))
    records.append(dict(theater=theater, baseline=before, selected=validation['pack'],
        correctedMembers=sorted(corrected), preservedGroups=preserved, exactAlphaFramePairs=density_pairs,
        goodBridgeExactFramePairs=good_bridge_pairs, contactMetrics=metrics,
        validation=dict(file=str(author / new['revision'] / 'validation.json'),
            sha256=sha(author / new['revision'] / 'validation.json'))))
    contract[theater] = validation['pack']
receipt = dict(status='PASS_NATIVE_METADATA_ALPHA_AND_GOOD_REFERENCE_PRESERVATION', records=records,
    sourceMapsEdited=False, alphaEdited=False, nativeRuntime='PENDING_AFFECTED_CONTEXTS',
    visualAcceptance='PENDING_USER', windows='NOT_RUN', m24Complete=False)
with (evidence / 'preservation-and-contact-audit-v1.json').open('x') as stream:
    stream.write(json.dumps(receipt, indent=2) + '\n')
if args.select:
    for row in records:
        Path(f'.local/terrain-{row["theater"].lower()}-selection.json').write_text(
            json.dumps(row['selected'], indent=2) + '\n')
    contract_file.write_text(json.dumps(contract, indent=2) + '\n')
print(json.dumps(dict(status=receipt['status'], selected=args.select,
    correctedMembers=sum(len(row['correctedMembers']) for row in records),
    goodBridgeExactFramePairs=sum(row['goodBridgeExactFramePairs'] for row in records))))
