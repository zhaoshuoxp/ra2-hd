"""Select verified complete resource families and record the source-pinned Snow coverage delta."""
import argparse
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
parser.add_argument('prepared', type=Path)
parser.add_argument('--loading', type=Path, required=True)
parser.add_argument('--prior-delta', type=Path, required=True)
parser.add_argument('--batch', type=int, required=True)
args = parser.parse_args()
recipe, contract = read(args.prepared / 'recipe.json'), read(args.prepared / 'contract.json')
native, prior = read(args.prepared / 'source.json'), read(args.prior_delta)
loading, preservation = read(args.loading), read(args.prepared / 'base-preservation-v2.json')
assert loading['status'] == 'PASS_COMPLETE_FAMILIES_DENSITIES_ALLOCATION_FALLBACK_DISPOSAL'
assert {(row['identity'], row['density']) for row in loading['families']} == {
    (family, density) for family in recipe['newFamilies'] for density in (2, 4)}
assert preservation['status'] == 'PASS_ALL_INHERITED_MEMBER_MANIFESTS_AND_PNGS_EXACT'
assert preservation['priorRecipeSha256'] == sha(args.prepared / 'recipe.json')
selector, contract_path = Path('.local/environment-snow-selection.json'), Path('desktop/environment-snow-hd-contract.json')
assert read(selector) == recipe['base'] == prior['selectedEnvironment'] == contract['selectedPack']
assert read(contract_path) == contract
assert read(Path('.local/terrain-snow-selection.json')) == prior['selectedTerrain']
inventory_path = Path(prior['baseInventory'])
assert sha(inventory_path) == prior['baseInventorySha256'] == native['inventorySha256']
inventory, pointer = read(inventory_path), recipe['selectedEnvironment']
pack_root = Path('.local/environment-packs') / pointer['revision']
assert sha(pack_root / 'manifest.json') == pointer['sha256']
for row in preservation['files']:
    assert sha(pack_root / row['file']) == row['sha256']
covered = []
for source in native['sources']:
    row, = [row for row in inventory['resourceGroups'] if row.get('theater') == 'SNOW'
            and row.get('kind') == 'overlay' and row.get('member') == source['member']
            and row.get('sha256') == source['sha256']]
    assert row['decisions'] == ['MISSING_AUTHORED_FAMILY']
    covered.append(row)
assert len(covered) == recipe['nativeSourceMembers'] == 32
remaining = dict(total=prior['remainingSnow']['total'] - len(covered), tmp=prior['remainingSnow']['tmp'])
delta = dict(schema='m2-4-source-pinned-environment-coverage-delta-v1', baseInventory=str(inventory_path),
    baseInventorySha256=sha(inventory_path), priorDelta=str(args.prior_delta), priorDeltaSha256=sha(args.prior_delta),
    selectedTerrain=prior['selectedTerrain'], selectedEnvironment=pointer, covered=covered,
    newSourceGroups=len(covered), remainingSnow=remaining, newFamilies=recipe['newFamilies'],
    canonicalMembers=recipe['canonicalMembers'], nativeBodyFrames=recipe['nativeBodyFrames'],
    verifiedDensityFrames=recipe['verifiedDensityFrames'], aliasMembers=8,
    status='PASS_STATIC_COMPLETE_ACCEPTED_FAMILIES_SOURCE_PALETTE_ALPHA_OWNER_AND_INHERITED_BYTES; MAC_NATIVE_PENDING')
root = Path('.artifacts/m2-4')
for name, value in [(f'snow-batch{args.batch}-coverage-delta-v1.json', delta),
                    (f'snow-batch{args.batch}-base-preservation-v1.json', preservation)]:
    with (root / name).open('x') as stream:
        stream.write(encode(value))
contract['selectedPack'] = pointer
contract['extensions']['state'] = 'STATIC_COMPLETE_ACCEPTED_FAMILIES_VERIFIED_MAC_NATIVE_PENDING'
(args.prepared / 'contract-selected-v1.json').write_text(encode(contract))
contract_path.write_text(encode(contract))
selector.write_text(encode(pointer))
print(json.dumps(dict(selectedEnvironment=pointer, families=len(recipe['newFamilies']),
    sources=len(covered), preservedFiles=preservation['inheritedFiles'], remainingSnow=remaining,
    affectedDirectoryIdentities=len({name for row in covered for name in row['maps']}))))
