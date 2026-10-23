"""Select eight verified complete Urban families through an additive assembly."""
import argparse
import copy
import hashlib
import json
import subprocess
from pathlib import Path

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def write(path, value):
    with path.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--batch', type=int, choices=[54, 55, 56], default=54)
args = parser.parse_args()
batch = args.batch
prior_count = {54: 206, 55: 214, 56: 222}[batch]
root = Path(f'.artifacts/m2-4/urban-buildings-native-batch{batch}-v1')
art = Path(f'.artifacts/m2-4/urban-buildings-authoring-batch{batch}-v1')
contract_file = Path('desktop/environment-urban-hd-contract.json')
selector = Path('.local/environment-urban-selection.json')
old, patch = read(contract_file), read(root / 'contract.json')
verified_file = art / 'verification-v1.json'
verified = read(verified_file)
assert verified['status'] == 'PASS' and verified['counts']['densityFrames'] == (48 if batch == 54 else 64)
assert verified['counts']['members'] == verified['counts']['families'] == 8
patch_root = Path(verified['pack'])
assert sha(patch_root / 'manifest.json') == verified['sha256']
assert sha(root / 'source.json') == patch['preparedSourceSha256']
assert read(selector) == old['selectedPack'] and len(old['families']) == prior_count
if batch in [55, 56]:
    accepted = read(Path(f'docs/m2-4-urban-buildings-batch{batch - 1}-20261016.json'))
    assert accepted['visual'] == 'USER_ACCEPTED' and accepted['selectedEnvironment'] == old['selectedPack']
assert len(patch['families']) == len(patch['sources']) == 8
full = copy.deepcopy(old)
for key in ['families', 'sources']:
    assert not set(patch[key]) & set(old[key])
    full[key].update(patch[key])
for edition, bindings in patch['identities'].items():
    assert not set(bindings) & set(old['identities'][edition])
    full['identities'][edition].update(bindings)
full['preparedSourceSha256'] = patch['preparedSourceSha256']
full['extensions'] = dict(milestone='M2.4', batch=batch, newFamilies=sorted(patch['families']),
    baselineSelectedPack=old['selectedPack'], baselineContractSha256=sha(contract_file),
    omittedInvisibleSystemMarkers=old['extensions']['omittedInvisibleSystemMarkers'],
    state='STATIC_COMPLETE_NATIVE_AND_VISUAL_PENDING',
    policy=f'Eight complete single-member families, original body/shadow slots, geometry, rules and palettes. All {prior_count} prior family payloads preserved.')
full_file = root / 'contract-full-v1.json'
write(full_file, full)
assembly_file = root / 'assembly-v1.json'
subprocess.run(['python3', 'scripts/m2/official-maps/combine-environment.py',
    f'urban-environment-m2-4-buildings-batch{batch}-v1', '--contract', str(full_file),
    '--base-pointer', str(selector), '--append', str(patch_root), '--receipt', str(assembly_file)], check=True)
assembly = read(assembly_file)
assert len(assembly['preservedFamilies']) == prior_count and set(assembly['appendedFamilies']) == set(patch['families'])
selected = Path('.local/environment-packs') / assembly['pack']['revision']
assert sha(selected / 'manifest.json') == assembly['pack']['sha256']
for name, digest in assembly['payloadHashes'].items():
    assert sha(selected / name) == digest
write(root / 'selection-v1.json', dict(status='STATIC_COMPLETE_NATIVE_AND_VISUAL_PENDING',
    priorContract=old, priorContractSha256=sha(contract_file), selectedPack=assembly['pack'],
    verification=dict(file=str(verified_file), sha256=sha(verified_file)),
    assembly=dict(file=str(assembly_file), sha256=sha(assembly_file)), preservedFamilies=prior_count,
    newFamilies=sorted(patch['families']), payloadFiles=len(assembly['payloadHashes']), windows='NOT_RUN'))
full['selectedPack'] = assembly['pack']
contract_file.write_text(json.dumps(full, indent=2) + '\n')
selector.write_text(json.dumps(assembly['pack'], indent=2) + '\n')
guide = read(root / 'source.json')
identities = [group['identities'][0] for group in patch['families'].values()]
edition, map_name, capture_name = {
    54: ('yr', 'hillbtwn.map', 'CALA09'),
    55: ('ra2', 'mp34u4.map', 'CAWASH04'),
    56: ('yr', 'xarena.map', 'CASTL05A'),
}[batch]
assert all(any(f'{edition}:{map_name}' in b['mapIds'] for b in s['bindings']) for s in guide['sources'])
write(root / 'native-plan-v1.json', dict(schema='m2-4-urban-buildings-native-plan-v1',
    sourceContractSha256=sha(root / 'contract.json'), cases=[dict(id='1', edition=edition,
        runtimeName=map_name, mapId=f'{edition}:{map_name}', identities=identities,
        families=list(patch['families']), members=list(patch['sources']), captureName=capture_name,
        checkRelease=True, output=f'.artifacts/m2-4/urban-buildings-batch{batch}-v1/native-group1')]))
print(json.dumps(dict(selectedPack=assembly['pack'], families=len(full['families']),
                      files=len(assembly['payloadHashes']) + 1)))
