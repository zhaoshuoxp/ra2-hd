"""Append ten independently verified Desert building families without replacing prior payloads."""
import copy
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path('.artifacts/m2-4/desert-morocco-native-batch85-v1')
ART = Path('.artifacts/m2-4/desert-morocco-authoring-batch85-v1')
CONTRACT = Path('desktop/environment-desert-hd-contract.json')
SELECTOR = Path('.local/environment-desert-selection.json')
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()


def write(path, value):
    with path.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


old, patch = read(CONTRACT), read(ROOT / 'contract.json')
verified_file = ART / 'verification-v1.json'
verified = read(verified_file)
assert verified['status'] == 'PASS'
assert verified['counts']['families'] == verified['counts']['members'] == 10
assert verified['counts']['densityFrames'] == 80
assert read(ART / 'mother-capacity-qa-v7.json')['status'] == 'ALL_40_SOURCE_STATES_HAVE_4X_CAPACITY'
assert len(old['families']) == 80 and read(SELECTOR) == old['selectedPack']
assert old['selectedPack']['sha256'] == 'd602892583ab115f05a06548048bee81ddb03178d3dcbed50fa169463f5e3e08'
assert read(Path('docs/m2-4-desert-ore-batch83-20261020.json'))['visualAcceptance'] == 'ACCEPTED_ALL_12_NEW_ORE_MEMBERS'
assert sha(ROOT / 'source.json') == patch['preparedSourceSha256']
assert sha(Path(verified['pack']) / 'manifest.json') == verified['sha256']
assert len(patch['families']) == len(patch['sources']) == 10
assert not patch['identities']['ra2'] and len(patch['identities']['yr']) == 10
guide = read(ROOT / 'source.json')
assert all(any('yr:saharami.map' in binding['mapIds'] for binding in source['bindings'])
           and not source.get('dependencies') for source in guide['sources'])
full = copy.deepcopy(old)
for key in ['families', 'sources']:
    assert not set(patch[key]) & set(old[key])
    full[key].update(patch[key])
for edition, bindings in patch['identities'].items():
    assert not set(bindings) & set(old['identities'][edition])
    full['identities'][edition].update(bindings)
full['preparedSourceSha256'] = patch['preparedSourceSha256']
full['extensions'] = dict(milestone='M2.4', batch=85, newFamilies=sorted(patch['families']),
    baselineSelectedPack=old['selectedPack'], baselineContractSha256=sha(CONTRACT),
    state='STATIC_COMPLETE_NATIVE_AND_VISUAL_PENDING',
    policy='Ten complete original Desert building sources; four body states, original shadow dependencies, logical geometry, palettes and owner indices. Every prior payload is hash preserved. Core prepared data has no changed input.')
full_file = ROOT / 'contract-full-v1.json'
write(full_file, full)
assembly_file = ROOT / 'assembly-v1.json'
subprocess.run(['python3', 'scripts/m2/official-maps/combine-environment.py',
    'desert-environment-morocco-batch85-v1-combined', '--contract', str(full_file),
    '--base-pointer', str(SELECTOR), '--append', verified['pack'], '--receipt', str(assembly_file)], check=True)
assembly = read(assembly_file)
assert len(assembly['preservedFamilies']) == 80
assert set(assembly['appendedFamilies']) == set(patch['families'])
selected = Path('.local/environment-packs') / assembly['pack']['revision']
assert sha(selected / 'manifest.json') == assembly['pack']['sha256']
for name, digest in assembly['payloadHashes'].items():
    assert sha(selected / name) == digest
write(ROOT / 'selection-v1.json', dict(status='STATIC_COMPLETE_NATIVE_AND_VISUAL_PENDING',
    priorContract=old, priorContractSha256=sha(CONTRACT), selectedPack=assembly['pack'],
    verification=dict(file=str(verified_file), sha256=sha(verified_file)),
    assembly=dict(file=str(assembly_file), sha256=sha(assembly_file)),
    preservedFamilies=80, newFamilies=sorted(patch['families']),
    payloadFiles=len(assembly['payloadHashes']), windows='NOT_RUN'))
full['selectedPack'] = assembly['pack']
CONTRACT.write_text(json.dumps(full, indent=2) + '\n')
SELECTOR.write_text(json.dumps(assembly['pack'], indent=2) + '\n')
write(ROOT / 'native-plan-v1.json', dict(schema='m2-4-desert-morocco-native-plan-v1',
    sourceContractSha256=sha(ROOT / 'contract.json'),
    originalMap='yr:saharami.map', families=sorted(patch['families']),
    identities=sorted(patch['identities']['yr']), densities=[2, 4],
    deduplication='All ten exact source groups share the Desert YR building path and are placed on saharami.map. pcofdune.map uses four of the same source groups; saharamimw.map uses the same ten under the already verified unified skirmish rules. No new map eligibility or rule adaptation.'))
print(json.dumps(dict(selectedPack=assembly['pack'], families=len(full['families']),
                      payloadFiles=len(assembly['payloadHashes']))))
