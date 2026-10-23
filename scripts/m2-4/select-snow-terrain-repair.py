"""Select validated complete Snow repairs without increasing coverage or changing native identity."""
import argparse
import hashlib
import json
from pathlib import Path


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--stage', type=Path, action='append', required=True)
parser.add_argument('--checkpoint', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
prior = read(args.checkpoint)
inventory_path = Path(prior['baseInventory'])
assert sha(inventory_path) == prior['baseInventorySha256']
inventory = read(inventory_path)
selector = Path('.local/terrain-snow-selection.json')
contracts_path = Path('desktop/terrain-theater-hd-contracts.json')
contracts = read(contracts_path)
selected = read(selector)
assert selected == prior['selectedTerrain'] == contracts['SNOW']
assert read(Path('.local/environment-snow-selection.json')) == prior['selectedEnvironment']
assert not args.output.exists()
current = selected
revised, preserved, stages = {}, [], []
for root in args.stage:
    recipe, validation = read(root / 'recipe.json'), read(root / 'validation.json')
    assert recipe['acceptedBase'] == current
    assert validation['status'] == 'PASS_NEW_COMPLETE_GROUPS_NATIVE_METADATA_ALPHA_GUTTERS_AND_ACCEPTED_REUSE'
    candidate = recipe['pack']
    assert validation['pack'] == candidate
    old_root = Path('.local/terrain-packs') / current['revision']
    new_root = Path('.local/terrain-packs') / candidate['revision']
    assert sha(old_root / 'manifest.json') == current['sha256']
    assert sha(new_root / 'manifest.json') == candidate['sha256']
    old, new = read(old_root / 'manifest.json'), read(new_root / 'manifest.json')
    assert old['theater'] == new['theater'] == 'SNOW'
    replaced = recipe['authorizedReplacementGroups']
    assert replaced and validation['replacedCompleteGroups'] == len(replaced)
    old_groups = {group['id']: group for group in old['groups']}
    # Source names and both immutable atlas declarations pin each replaced closure.
    assert all(dict(id=old_groups[group['id']]['id'],
                    members=[member['member'] for member in old_groups[group['id']]['members']],
                    variants=old_groups[group['id']]['variants']) == group for group in replaced)
    removed = {group['id'] for group in replaced}
    unaffected = [group for group in old['groups'] if group['id'] not in removed]
    assert new['groups'][:len(unaffected)] == unaffected
    added = new['groups'][len(unaffected):]
    assert len(added) == len(replaced) and len(new['groups']) == len(old['groups']) <= 64
    old_members = {member['member']: member for group in replaced
                   for member in old_groups[group['id']]['members']}
    new_members = {member['member']: member for group in added for member in group['members']}
    assert old_members.keys() == new_members.keys()
    for name, member in new_members.items():
        assert member == old_members[name], name
        pins = set(member['sourceHashes'].values())
        rows = [row for row in inventory['resourceGroups'] if row.get('kind') == 'tmp'
                and row.get('theater') == 'SNOW' and row.get('member') == name
                and row.get('sha256') in pins]
        assert len(rows) == 1 and pins == {rows[0]['sha256']}
        revised[name] = dict(member=name, sourceSha256=rows[0]['sha256'], maps=sorted(rows[0]['maps']))
    for group in new['groups']:
        assert {variant['density'] for variant in group['variants']} == {2, 4}
        for variant in group['variants']:
            file = new_root / variant['file']
            assert sha(file) == variant['sha256']
            assert file.stat().st_size == variant['size'][0] * variant['size'][1] * 4
            if group in unaffected:
                assert sha(old_root / variant['file']) == variant['sha256']
    preserved.append(dict(base=current, candidate=candidate, replacedGroups=sorted(removed),
                          exactUnaffectedGroups=len(unaffected), unchangedNativeMembers=len(new_members)))
    stages.append(dict(root=str(root), recipeSha256=sha(root / 'recipe.json'),
                       validationSha256=sha(root / 'validation.json')))
    current = candidate
receipt = dict(schema='m2-4-source-pinned-snow-terrain-repair-selection-v1',
    status='PASS_COMPLETE_GROUPS_NATIVE_IDENTITY_SOURCE_PINS_AND_UNAFFECTED_BYTES',
    baseInventory=str(inventory_path), baseInventorySha256=sha(inventory_path),
    priorCheckpoint=str(args.checkpoint), priorCheckpointSha256=sha(args.checkpoint),
    selectedTerrain=current, selectedEnvironment=prior['selectedEnvironment'],
    revisedMembers=len(revised), revised=sorted(revised.values(), key=lambda row: row['member']),
    affectedDirectoryIdentities=len({name for row in revised.values() for name in row['maps']}),
    newSourceGroups=0, covered=[], remainingSnow=prior['remainingSnow'],
    stages=stages, preservation=preserved,
    visualStatus='SURFACE_FEEDBACK_REPAIR_PENDING_NATIVE_AND_USER_REVIEW', userAccepted=False)
with args.output.open('x') as stream:
    stream.write(json.dumps(receipt, indent=2) + '\n')
contracts['SNOW'] = current
selector.write_text(json.dumps(current, indent=2) + '\n')
contracts_path.write_text(json.dumps(contracts, indent=2) + '\n')
print(json.dumps(dict(selectedTerrain=current, revisedMembers=len(revised),
    affectedDirectoryIdentities=receipt['affectedDirectoryIdentities'], remainingSnow=receipt['remainingSnow'])))
