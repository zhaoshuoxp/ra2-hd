"""Append two independently verified and explicitly authorized visual repairs to the isolated selection."""
import copy
import hashlib
import json
import subprocess
from pathlib import Path

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def write(p, value):
    with p.open('x') as f:
        f.write(json.dumps(value, indent=2) + '\n')


root = Path('.artifacts/m2-4/urban-placeholder-hd-repair-v1')
verification = read(root / 'verification-v1.json')
assert verification['status'] == 'PASS_TWO_EXACT_USER_AUTHORIZED_FACILITY_REPAIRS'
patch_root = Path(verification['pack'])
assert sha(patch_root / 'manifest.json') == verification['packSha256']
contract_file = Path('desktop/environment-urban-hd-contract.json')
selector = Path('.local/environment-urban-selection.json')
old, patch = read(contract_file), read(root / 'prepared/contract.json')
old_sha = sha(contract_file)
assert len(old['families']) == 260 and read(selector) == old['selectedPack']
assert read(root / 'user-authorization.json')['status'] == 'USER_AUTHORIZED_HD_ONLY_PLACEHOLDER_REMOVAL_AND_FACILITY_RECONSTRUCTION'
full = copy.deepcopy(old)
for key in ['families', 'sources']:
    assert not set(old[key]) & set(patch[key])
    full[key].update(patch[key])
for edition in ['ra2', 'yr']:
    assert not set(old['identities'][edition]) & set(patch['identities'][edition])
    full['identities'][edition].update(patch['identities'][edition])
full['preparedSourceSha256'] = patch['preparedSourceSha256']
full['extensions'] = dict(milestone='M2.4', scope='Two user-authorized source-pinned HD placeholder repairs',
    newFamilies=list(patch['families']), baselineSelectedPack=old['selectedPack'], baselineContractSha256=old_sha,
    omittedInvisibleSystemMarkers=old['extensions']['omittedInvisibleSystemMarkers'],
    userAuthorizationSha256=sha(root / 'user-authorization.json'), state='STATIC_COMPLETE_NATIVE_AND_VISUAL_PENDING',
    policy='Only two exact original facility hashes receive authorized HD visual masks. All original files, geometry metadata, shadow dependencies and gameplay remain unchanged; preserve every earlier family.')
write(root / 'contract-full-v1.json', full)
subprocess.run(['python3', 'scripts/m2/official-maps/combine-environment.py',
    'urban-environment-m2-4-facilities-repaired-v1', '--contract', str(root / 'contract-full-v1.json'),
    '--base-pointer', str(selector), '--append', str(patch_root), '--receipt', str(root / 'assembly-v1.json')], check=True)
assembly = read(root / 'assembly-v1.json')
assert len(assembly['preservedFamilies']) == 260 and len(assembly['appendedFamilies']) == 2
selected = Path('.local/environment-packs') / assembly['pack']['revision']
for name, digest in assembly['payloadHashes'].items():
    assert sha(selected / name) == digest
full['selectedPack'] = assembly['pack']
contract_file.write_text(json.dumps(full, indent=2) + '\n')
selector.write_text(json.dumps(assembly['pack'], indent=2) + '\n')
write(root / 'selection-v1.json', dict(status='STATIC_COMPLETE_NATIVE_AND_VISUAL_PENDING', priorContract=old,
    priorContractSha256=old_sha, selectedPack=assembly['pack'], priorFamiliesPreserved=260,
    selectedFiles=len(assembly['payloadHashes']) + 1, newFamilies=list(patch['families']),
    scope='Two authorized HD visual masks; Original and all source files untouched', windows='NOT_RUN', m24Complete=False))
# Distinct edition map variants exercise the same two raw files under each real map/edition route.
cases = []
for number, (edition, digest) in enumerate([('ra2', 'd871241b686b7a1a5d4534109725f1c23bdcded3379c4290a5ecd45ce619f9b2'),
    ('yr', 'e0b74cfb3cc15566a55732f29c52e6f30195dedb2d2428ca421dd5b508757cbc')], 1):
    cases.append(dict(id=edition, edition=edition, runtimeName='official-' + digest[:24] + '.map',
        identities=['CALIT01E', 'CAPOL01S'], families=list(patch['families']), captureName='CALIT01E',
        checkRelease=True, output=str(root / f'native-{edition}')))
write(root / 'native-plan-v1.json', dict(schema='m2-4-source-pinned-facility-repair-native-plan-v1', cases=cases,
    deduplication='The RA2 and YR source map variants use the same exact two SHP/palette/slot/shadow sources. Both actual edition maps are exercised at both densities, with native damage/destruction and separate Original controls. The YR duplicate archived RA2 map shares the already tested original map hash. No new spawn, source or mode rule is introduced.'))
print(json.dumps(dict(selectedPack=assembly['pack'], families=262, files=len(assembly['payloadHashes']) + 1)))
