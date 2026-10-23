"""Select an additive, complete and byte-exact accepted NewTheater reuse batch."""
import argparse
import copy
import hashlib
import json
from pathlib import Path


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def encode(value):
    return json.dumps(value, indent=2) + '\n'


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--prepared', type=Path, required=True)
parser.add_argument('--assembly', type=Path, required=True)
parser.add_argument('--loading', type=Path, required=True)
parser.add_argument('--prior-delta', type=Path, required=True)
parser.add_argument('--batch', type=int, required=True)
args = parser.parse_args()
root = Path('.artifacts/m2-4')
contract_path = args.prepared / 'contract.json'
contract, native = read(contract_path), read(args.prepared / 'source.json')
reuse_path = args.prepared / 'reuse-receipt.json'
reuse, assembly, loading = read(reuse_path), read(args.assembly), read(args.loading)
prior = read(args.prior_delta)
inventory_path = Path(prior['baseInventory'])
assert sha(inventory_path) == prior['baseInventorySha256'] == native['inventorySha256']
inventory = read(inventory_path)
selector = Path('.local/environment-snow-selection.json')
baseline = read(Path('desktop/environment-snow-hd-contract.json'))
base, pointer = assembly['acceptedBase'], assembly['pack']
assert read(selector) == base == prior['selectedEnvironment'] == contract['selectedPack']
assert read(Path('.local/terrain-snow-selection.json')) == prior['selectedTerrain']
assert reuse['status'] == 'PASS_COMPLETE_ACCEPTED_BUILDING_FAMILY_REUSE_STATIC'
kind = reuse.get('kind', 'building')
assert kind in ('building', 'overlay') and native.get('kind', 'building') == kind
assert loading['status'] == 'PASS_COMPLETE_FAMILIES_DENSITIES_ALLOCATION_FALLBACK_DISPOSAL'
assert loading['theater'] == contract['theater'] == native['theater'] == 'SNOW'
families = set(contract['extensions']['newFamilies'])
assert families == set(assembly['appendedFamilies'])
assert {(row['identity'], row['density']) for row in loading['families']} == {
    (family, density) for family in families for density in (2, 4)}
accepted_path = Path('desktop/environment-hd-contract.json')
accepted = read(accepted_path)
assert sha(accepted_path) == reuse['acceptedContractSha256']
assert accepted['selectedPack'] == reuse['donorSelectedPack']
donor_root = Path('.local/environment-packs') / accepted['selectedPack']['revision']
assert sha(donor_root / 'manifest.json') == accepted['selectedPack']['sha256']
donor = read(donor_root / 'manifest.json')
pack_root = Path('.local/environment-packs') / pointer['revision']
base_root = Path('.local/environment-packs') / base['revision']
assert sha(pack_root / 'manifest.json') == pointer['sha256']
assert sha(base_root / 'manifest.json') == base['sha256']
pack, old = read(pack_root / 'manifest.json'), read(base_root / 'manifest.json')
for section in ['sources', 'families']:
    assert all(contract[section][name] == value for name, value in baseline[section].items())
for edition, identities in baseline['identities'].items():
    assert all(contract['identities'][edition][name] == family for name, family in identities.items())
assert all(pack['families'][name] == family for name, family in old['families'].items())
preserved = 0
for file in base_root.rglob('*'):
    if file.is_file() and file != base_root / 'manifest.json':
        assert sha(file) == sha(pack_root / file.relative_to(base_root))
        preserved += 1
covered, linked_only, exact_pngs = [], [], 0
for record in reuse['families']:
    name, family = record['member'], record['family']
    source, = [row for row in native['sources'] if row['member'] == name]
    assert family in families
    assert source['sha256'] == record['sourceSha256'] == sha(args.prepared / 'native' / source['nativeFile'])
    declared = contract['families'][family]
    basis = dict(theater='SNOW', members={member: contract['sources'][member] for member in declared['members']},
                 identities=declared['identities'])
    assert hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest() == declared['familyHash']
    entry, = [member for member in pack['families'][family]['members'] if member['member'] == name]
    donor_entries = [member for item in donor['families'].values() for member in item['members']
                     if member['member'] == record['donorMember']]
    donor_entry, = donor_entries
    file, old_file = pack_root / entry['path'], donor_root / donor_entry['path']
    assert sha(file) == entry['sha256'] and sha(old_file) == record['donorMetadataSha256']
    expected = copy.deepcopy(read(old_file))
    expected['source']['member'], expected['source']['theater'] = name, 'SNOW'
    expected['packId'], expected['packRevision'] = family, reuse['patch']['revision']
    assert read(file) == expected, 'Only reviewed source identity and pack metadata may change'
    for original in old_file.parent.rglob('*.png'):
        assert sha(original) == sha(file.parent / original.relative_to(old_file.parent))
        exact_pngs += 1
    rows = [row for row in inventory['resourceGroups'] if row.get('theater') == 'SNOW'
            and row.get('kind') == kind and row.get('member') == name and row.get('sha256') == source['sha256']]
    if rows:
        row, = rows
        assert row['decisions'] == ['MISSING_AUTHORED_FAMILY']
        covered.append(row)
    else:
        assert name == 'camsc06a.shp', 'Only the audited related animation is outside top-level groups'
        linked_only.append(name)
expected_families, expected_pngs = (1, 10) if kind == 'overlay' else (7, 32)
assert len(covered) == len(families) == expected_families
assert exact_pngs == reuse['copiedPages'] == expected_pngs
assert kind != 'overlay' or {record['member'] for record in reuse['families']} == {'cafncp.shp'}
remaining = dict(total=prior['remainingSnow']['total'] - len(covered), tmp=prior['remainingSnow']['tmp'])
delta = dict(schema='m2-4-source-pinned-environment-coverage-delta-v1', baseInventory=str(inventory_path),
    baseInventorySha256=sha(inventory_path), priorDelta=str(args.prior_delta), priorDeltaSha256=sha(args.prior_delta),
    selectedTerrain=prior['selectedTerrain'], selectedEnvironment=pointer, covered=covered, newSourceGroups=len(covered),
    additionalRelatedMembers=linked_only, remainingSnow=remaining,
    verifiedDensityFrames=sum(record['verifiedDensityFrames'] for record in reuse['families']),
    reuseReceipt=dict(path=str(reuse_path), sha256=sha(reuse_path)),
    unusedNotHdCovered=prior.get('unusedNotHdCovered'),
    additionalUnusedNotHdCovered=prior.get('additionalUnusedNotHdCovered', []),
    status='PASS_STATIC_COMPLETE_ACCEPTED_BUILDING_REUSE; MAC_NATIVE_PENDING')
preservation = dict(status='PASS', inheritedFamilies=len(old['families']), inheritedFiles=preserved,
    acceptedExactPngs=exact_pngs, policy='Inherited Snow payloads and accepted donor PNGs are byte-exact. New metadata is prepared normally.')
contract['selectedPack'] = pointer
contract['extensions']['state'] = 'STATIC_EXACT_REUSE_VERIFIED_MAC_NATIVE_PENDING'
for path, value in [(root / f'snow-batch{args.batch}-coverage-delta-v1.json', delta),
                    (root / f'snow-batch{args.batch}-base-preservation-v1.json', preservation),
                    (args.prepared / 'contract-selected-v1.json', contract)]:
    with path.open('x') as stream:
        stream.write(encode(value))
Path('desktop/environment-snow-hd-contract.json').write_text(encode(contract))
selector.write_text(encode(pointer))
print(json.dumps(dict(selectedEnvironment=pointer, newFamilies=len(families), members=len(reuse['families']),
    remainingSnow=remaining, preservedFiles=preserved, affectedDirectoryIdentities=len({name for row in covered for name in row['maps']}))))
