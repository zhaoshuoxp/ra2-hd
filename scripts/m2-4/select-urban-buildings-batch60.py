"""Select sixteen verified Urban buildings after the two authorized facility repairs."""
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


batch, prior_count = 60, 262
root = Path(f'.artifacts/m2-4/urban-buildings-native-batch{batch}-v1')
art = Path(f'.artifacts/m2-4/urban-buildings-authoring-batch{batch}-v1')
contract_file = Path('desktop/environment-urban-hd-contract.json')
selector = Path('.local/environment-urban-selection.json')
old, patch = read(contract_file), read(root / 'contract.json')
verified_file = art / 'verification-v1.json'
verified = read(verified_file)
assert verified['status'] == 'PASS' and verified['counts']['densityFrames'] == 128
assert verified['counts']['members'] == verified['counts']['families'] == 16
patch_root = Path(verified['pack'])
assert sha(patch_root / 'manifest.json') == verified['sha256']
assert sha(root / 'source.json') == patch['preparedSourceSha256']
assert read(selector) == old['selectedPack'] and len(old['families']) == prior_count
assert old['selectedPack']['sha256'] == 'f03cac978fbb790108334df18c63cd7d0961a6ee7a0d644d5687c510a511c913'
assert read(Path('.artifacts/m2-4/urban-placeholder-hd-repair-v1/native-closure.json'))['status'] == 'PASS_TWO_AUTHORIZED_FACILITY_REPAIRS_MAC_NATIVE_STATES_ORIGINAL_AND_RELEASE'
assert len(patch['families']) == len(patch['sources']) == 16
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
    policy=f'Sixteen complete single-member families, original body/shadow slots, geometry, rules and palettes. All {prior_count} prior family payloads preserved.')
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
by_identity = {s['bindings'][0]['id']: s for s in guide['sources']}
case_specs = [
    ('ra2', 'mp33u4.map', ['CAPARS09', 'CAPRS03', 'CAPARS01'], 'CAPARS09', True),
    ('ra2', 'mp34u4.map', ['CAWSH12', 'CANEWY01', 'CAWASH17', 'CAWASH16'], 'CAWASH17', False),
    ('ra2', 'mp28u4.map@d871241b686b', ['CAWA2D', 'CAWA2C'], 'CAWA2D', False),
    ('yr', 'xarena.map', ['CARUS06', 'CAWASH06', 'CANEWY13', 'CARUS05'], 'CANEWY13', False),
    ('yr', 'xpowdrkeg.map', ['CAWASH09', 'CALAB'], 'CALAB', True),
    ('yr', 'xkaliforn.map', ['CANWY05'], 'CANWY05', False),
]
cases = []
for number, (edition, name, identities, capture_name, release) in enumerate(case_specs, 1):
    assert all(any(b['edition'] == edition and f'{edition}:{name}' in b['mapIds']
        for b in by_identity[identity]['bindings']) for identity in identities)
    cases.append(dict(id=str(number), edition=edition, runtimeName=('official-d871241b686b7a1a5d453410.map' if '@' in name else name), sourceMapId=f'{edition}:{name}', identities=identities,
        families=[patch['identities'][edition][identity] for identity in identities], captureName=capture_name,
        checkRelease=release, output=f'.artifacts/m2-4/urban-buildings-batch60-v1/native-group{number}'))
assert {identity for case in cases for identity in case['identities']} == set(by_identity)
write(root / 'native-plan-v1.json', dict(schema='m2-4-urban-buildings-native-plan-v1',
    sourceContractSha256=sha(root / 'contract.json'), cases=cases,
    deduplication='Six unchanged official original maps cover all sixteen exact source families at both densities. State fixtures use native orders and legal foundations; same-source placements on other maps share the same loader path. All source-specific frames, rules and original metadata remain intact; no full-match-per-map claim.'))
print(json.dumps(dict(selectedPack=assembly['pack'], families=len(full['families']),
    files=len(assembly['payloadHashes']) + 1, newFamilies=16, retainedAuthorizedFacilityRepairs=2)))
