"""Select an additive SNOW batch after preserving bytes and auditing native source pins."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('revision')
parser.add_argument('--batch', type=int, required=True)
parser.add_argument('--base-pointer', type=Path, required=True)
parser.add_argument('--prior-delta', type=Path, required=True)
parser.add_argument('--inventory', type=Path, default=Path('.artifacts/m2-4/inventory-v6/inventory.json'))
args = parser.parse_args()
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
read = lambda path: json.loads(path.read_text())
encode = lambda value: json.dumps(value, indent=2) + '\n'
base = read(args.base_pointer)
selector = Path('.local/terrain-snow-selection.json')
assert read(selector) == base, 'The selected base changed during production.'
root = Path('.local/terrain-packs')
base_root, new_root = root / base['revision'], root / args.revision
assert sha(base_root / 'manifest.json') == base['sha256']
old, new = read(base_root / 'manifest.json'), read(new_root / 'manifest.json')
assert old['theater'] == new['theater'] == 'SNOW'
assert new['revision'] == args.revision and len(new['groups']) <= 64
assert old['groups'] == new['groups'][:len(old['groups'])]
for group in old['groups']:
    for variant in group['variants']:
        assert sha(base_root / variant['file']) == sha(new_root / variant['file']) == variant['sha256']
added = new['groups'][len(old['groups']):]
assert added and all(group['id'].startswith(f'm2-4-snow-batch{args.batch}-') for group in added)
old_names = {member['member'] for group in old['groups'] for member in group['members']}
members = [member for group in added for member in group['members']]
names = {member['member'] for member in members}
assert len(names) == len(members) and not old_names.intersection(names)
for group in added:
    assert {variant['density'] for variant in group['variants']} == {2, 4}
    for variant in group['variants']:
        assert sha(new_root / variant['file']) == variant['sha256']
inventory = read(args.inventory)
covered = []
for member in members:
    pins = set(member['sourceHashes'].values())
    rows = [row for row in inventory['resourceGroups'] if row.get('theater') == 'SNOW'
            and row.get('kind') == 'tmp' and row.get('member') == member['member']
            and row.get('sha256') in pins]
    assert len(rows) == 1 and pins == {rows[0]['sha256']}
    assert rows[0]['decisions'] == ['MISSING_AUTHORED_FAMILY']
    covered.append(dict(member=member['member'], sourceSha256=rows[0]['sha256'],
                        maps=sorted(rows[0]['maps'])))
prior = read(args.prior_delta)
assert prior['selectedTerrain'] == base
assert prior['baseInventorySha256'] == sha(args.inventory)
remaining = {key: value - len(members) for key, value in prior['remainingSnow'].items()}
assert all(value >= 0 for value in remaining.values())
pointer = dict(schemaVersion=1, revision=args.revision, sha256=sha(new_root / 'manifest.json'))
delta = dict(schema='m2-4-source-pinned-coverage-delta-v1', baseInventory=str(args.inventory),
    baseInventorySha256=sha(args.inventory), priorDelta=str(args.prior_delta),
    priorDeltaSha256=sha(args.prior_delta), selectedTerrain=pointer,
    newSourceGroups=len(members), newSubtiles=sum(len(member['images']) for member in members),
    covered=covered, remainingSnow=remaining)
preservation = dict(status='PASS', baseRevision=base['revision'], newRevision=args.revision,
    inheritedGroups=len(old['groups']), inheritedMembers=len(old_names),
    policy='All inherited declarations and immutable atlases are exact.')
output = Path('.artifacts/m2-4')
delta_path = output / f'snow-batch{args.batch}-coverage-delta-v1.json'
preservation_path = output / f'snow-batch{args.batch}-base-preservation.json'
assert not delta_path.exists() and not preservation_path.exists()
contracts = Path('desktop/terrain-theater-hd-contracts.json')
contract = read(contracts)
assert contract['SNOW'] == base
contract['SNOW'] = pointer
with delta_path.open('x') as stream:
    stream.write(encode(delta))
with preservation_path.open('x') as stream:
    stream.write(encode(preservation))
selector.write_text(encode(pointer))
contracts.write_text(encode(contract))
print(json.dumps(dict(selectedTerrain=pointer, addedFiles=len(members),
    addedSubtiles=delta['newSubtiles'], remainingSnow=remaining,
    affectedDirectoryIdentities=len({name for row in covered for name in row['maps']}))))
