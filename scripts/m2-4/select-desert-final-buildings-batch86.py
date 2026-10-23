"""Append the four verified final Desert building groups while preserving all ninety prior families."""
import copy
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path('.artifacts/m2-4/desert-final-buildings-native-batch86-v1')
ART = Path('.artifacts/m2-4/desert-final-buildings-authoring-batch86-v1')
CONTRACT = Path('desktop/environment-desert-hd-contract.json')
SELECTOR = Path('.local/environment-desert-selection.json')
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()


def write(path, value):
    with path.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


old, patch = read(CONTRACT), read(ROOT / 'contract.json')
verification = read(ART / 'verification-v2.json')
assert verification['status'] == 'PASS'
assert verification['counts']['families'] == 4 and verification['counts']['members'] == 6
assert verification['counts']['densityFrames'] == 98 and verification['counts']['exactAcceptedBodyFrames'] == 38
assert read(ART / 'temporal-and-reuse-verification-v1.json')['status'] == 'PASS_ACCEPTED_REUSE_AND_NATIVE_AIRPORT_TEMPORAL_INVARIANTS'
accepted = Path('.artifacts/m2-4/desert-morocco-batch85-20261020/user-acceptance-20261020.json')
assert sha(accepted) == 'f126d0fcb6a70510d4c93bc9628b6becef141a6a81c9a22acec457806fe7eb5f'
assert read(accepted)['status'] == 'USER_ACCEPTED_ALL_10_DESERT_MOROCCAN_FAMILIES_40_STATES'
assert len(old['families']) == 90 and read(SELECTOR) == old['selectedPack']
assert old['selectedPack']['sha256'] == '8c6d37400123c9bceda680ec921d7cb691b38b62499bf7a88908f32a810b387c'
assert sha(ROOT / 'source.json') == patch['preparedSourceSha256']
assert sha(Path(verification['pack']) / 'manifest.json') == verification['sha256']
full = copy.deepcopy(old)
for key in ['families', 'sources']:
    assert not set(patch[key]) & set(old[key])
    full[key].update(patch[key])
for edition, bindings in patch['identities'].items():
    assert not set(bindings) & set(old['identities'][edition])
    full['identities'][edition].update(bindings)
full['preparedSourceSha256'] = patch['preparedSourceSha256']
full['extensions'] = dict(milestone='M2.4', batch=86, newFamilies=sorted(patch['families']),
    baselineSelectedPack=old['selectedPack'], baselineContractSha256=sha(CONTRACT),
    state='STATIC_COMPLETE_NATIVE_AND_NEW_ART_REVIEW_PENDING',
    policy='Four complete source groups, six original members, 49 logical body slots and 29 original shadows. Exact accepted bench/flag/house states reused at each density; dedicated airport, pyramid and differing house material. Prior ninety families remain byte-identical. Core prepared inputs unchanged.')
write(ROOT / 'contract-full-v1.json', full)
assembly_file = ROOT / 'assembly-v1.json'
subprocess.run(['python3', 'scripts/m2/official-maps/combine-environment.py',
    'desert-environment-final-buildings-batch86-v1-combined', '--contract', str(ROOT / 'contract-full-v1.json'),
    '--base-pointer', str(SELECTOR), '--append', verification['pack'], '--receipt', str(assembly_file)], check=True)
assembly = read(assembly_file)
assert len(assembly['preservedFamilies']) == 90 and set(assembly['appendedFamilies']) == set(patch['families'])
selected = Path('.local/environment-packs') / assembly['pack']['revision']
assert sha(selected / 'manifest.json') == assembly['pack']['sha256']
for name, digest in assembly['payloadHashes'].items():
    assert sha(selected / name) == digest
write(ROOT / 'selection-v1.json', dict(status='STATIC_COMPLETE_NATIVE_AND_NEW_ART_REVIEW_PENDING',
    priorContract=old, priorContractSha256=sha(CONTRACT), selectedPack=assembly['pack'],
    verification=dict(file=str(ART / 'verification-v2.json'), sha256=sha(ART / 'verification-v2.json')),
    temporalVerification=dict(file=str(ART / 'temporal-and-reuse-verification-v1.json'),
                              sha256=sha(ART / 'temporal-and-reuse-verification-v1.json')),
    assembly=dict(file=str(assembly_file), sha256=sha(assembly_file)), preservedFamilies=90,
    newFamilies=sorted(patch['families']), payloadFiles=len(assembly['payloadHashes']), windows='NOT_RUN'))
full['selectedPack'] = assembly['pack']
CONTRACT.write_text(json.dumps(full, indent=2) + '\n')
SELECTOR.write_text(json.dumps(assembly['pack'], indent=2) + '\n')
write(ROOT / 'native-plan-v1.json', dict(schema='m2-4-final-desert-buildings-native-plan-v1',
    cases=[dict(map='yr:saharami.map', families=['desert-caairp', 'desert-capark06']),
           dict(map='yr:sedonapass.map', families=['desert-cahse06']),
           dict(map='yr:tourofegypt.map', families=['desert-caegyp02'])], densities=[2, 4],
    linkedMotion='Airport: complete normal radar/light loop and sixteen flag phases; native damaged marker/empty semantics; capture and repair.',
    deduplication='Three official maps cover all six actual Desert source members once at each density. Other airport maps and megawealth variants resolve the same source hashes and unchanged unified skirmish rules already proven. Bench has one original state; airport has no garrison state; unused body/animation slots are statically retained without fabricated gameplay.'))
print(json.dumps(dict(selectedPack=assembly['pack'], families=len(full['families']),
                      payloadFiles=len(assembly['payloadHashes']))))
