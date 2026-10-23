"""Select fourteen verified Urban families, preserving all accepted payloads and two source blockers."""
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


batch, prior_count = 59, 246
root = Path(f'.artifacts/m2-4/urban-buildings-native-batch{batch}-v1')
art = Path(f'.artifacts/m2-4/urban-buildings-authoring-batch{batch}-v1')
contract_file = Path('desktop/environment-urban-hd-contract.json')
selector = Path('.local/environment-urban-selection.json')
old, patch = read(contract_file), read(root / 'contract.json')
verified_file = art / 'verification-v1.json'
verified = read(verified_file)
assert verified['status'] == 'PASS' and verified['counts']['densityFrames'] == 86
assert verified['counts']['members'] == verified['counts']['families'] == 14
patch_root = Path(verified['pack'])
assert sha(patch_root / 'manifest.json') == verified['sha256']
assert sha(root / 'source.json') == patch['preparedSourceSha256']
assert read(selector) == old['selectedPack'] and len(old['families']) == prior_count
if batch == 59:
    accepted = read(Path('docs/m2-4-urban-edition-buildings-batch58-20261016.json'))
    assert accepted['visual'] == 'USER_ACCEPTED' and accepted['selectedEnvironment'] == old['selectedPack']
assert len(patch['families']) == len(patch['sources']) == 14
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
    policy=f'Fourteen complete single-member families, original body/shadow slots, geometry, rules and palettes. All {prior_count} prior family payloads preserved.')
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
    ('yr', 'hillbtwn.map', ['CAPARK04', 'CAPARK05', 'CAPARK06', 'CALA07', 'CALA08', 'CALA14'], 'CALA08', True),
    ('yr', 'xpowdrkeg.map', ['CARUS02A', 'CARUS02B', 'CARUS02G'], 'CARUS02G', False),
    ('yr', 'xpotomac.map', ['CAMISC06'], 'CAMISC06', False),
    ('ra2', 'mp29u2.map', ['CATEXS02'], 'CATEXS02', False),
    ('ra2', 'mp33u4.map', ['CAPARS04', 'CAPARS05', 'CAPARS12'], 'CAPARS12', True),
]
cases = []
for number, (edition, name, identities, capture_name, release) in enumerate(case_specs, 1):
    assert all(any(b['edition'] == edition and f'{edition}:{name}' in b['mapIds']
        for b in by_identity[identity]['bindings']) for identity in identities)
    cases.append(dict(id=str(number), edition=edition, runtimeName=name, identities=identities,
        families=[patch['identities'][edition][identity] for identity in identities], captureName=capture_name,
        checkRelease=release, output=f'.artifacts/m2-4/urban-buildings-batch59-v1/native-group{number}'))
assert {identity for case in cases for identity in case['identities']} == set(by_identity)
write(root / 'native-plan-v1.json', dict(schema='m2-4-urban-buildings-native-plan-v1',
    sourceContractSha256=sha(root / 'contract.json'), cases=cases,
    deduplication='Five unchanged official original maps cover all fourteen exact source families at both densities. State fixtures use native orders and legal foundations; same-source placements on other maps share the same loader path. All source-specific frames, rules and original metadata remain intact; no full-match-per-map claim.'))
print(json.dumps(dict(selectedPack=assembly['pack'], families=len(full['families']),
    files=len(assembly['payloadHashes']) + 1, newFamilies=14, deferredPlaceholders=2)))
