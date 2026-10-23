"""Add eight complete city and flag families while retaining all accepted Urban payloads."""
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


root = Path('.artifacts/m2-4/urban-city-flags-native-batch57-v1')
art = Path('.artifacts/m2-4/urban-city-flags-authoring-batch57-v1')
contract_file = Path('desktop/environment-urban-hd-contract.json')
selector = Path('.local/environment-urban-selection.json')
old, patch = read(contract_file), read(root / 'contract.json')
accepted = read(Path('docs/m2-4-urban-buildings-batch56-20261016.json'))
assert accepted['visual'] == 'USER_ACCEPTED' and accepted['selectedEnvironment'] == old['selectedPack']
assert read(selector) == old['selectedPack'] and len(old['families']) == 230
verified_file = art / 'verification-v1.json'
verified = read(verified_file)
assert verified['status'] == 'PASS'
assert all(verified['counts'][key] == value for key, value in
           dict(families=8, members=12, densityFrames=176, exactAcceptedBodyFrames=48).items())
patch_root = Path(verified['pack'])
assert sha(patch_root / 'manifest.json') == verified['sha256']
assert sha(root / 'source.json') == patch['preparedSourceSha256']
full = copy.deepcopy(old)
for key in ['families', 'sources']:
    assert not set(old[key]) & set(patch[key])
    full[key].update(patch[key])
for edition, bindings in patch['identities'].items():
    assert not set(old['identities'][edition]) & set(bindings)
    full['identities'][edition].update(bindings)
full['preparedSourceSha256'] = patch['preparedSourceSha256']
full['extensions'] = dict(milestone='M2.4', batch=57, newFamilies=sorted(patch['families']),
    baselineSelectedPack=old['selectedPack'], baselineContractSha256=sha(contract_file),
    omittedInvisibleSystemMarkers=old['extensions']['omittedInvisibleSystemMarkers'],
    state='STATIC_COMPLETE_NATIVE_AND_VISUAL_PENDING',
    policy='Eight complete families, 12 source members. Reuse 24 accepted body states exactly; author all 64 flag phases. Preserve 230 prior families, native geometry, shadows, timing and rules.')
full_file = root / 'contract-full-v1.json'
write(full_file, full)
assembly_file = root / 'assembly-v1.json'
subprocess.run(['python3', 'scripts/m2/official-maps/combine-environment.py',
    'urban-environment-m2-4-city-flags-batch57-v1', '--contract', str(full_file),
    '--base-pointer', str(selector), '--append', str(patch_root), '--receipt', str(assembly_file)], check=True)
assembly = read(assembly_file)
assert len(assembly['preservedFamilies']) == 230 and set(assembly['appendedFamilies']) == set(patch['families'])
selected = Path('.local/environment-packs') / assembly['pack']['revision']
assert sha(selected / 'manifest.json') == assembly['pack']['sha256']
for name, digest in assembly['payloadHashes'].items():
    assert sha(selected / name) == digest
write(root / 'selection-v1.json', dict(status='STATIC_COMPLETE_NATIVE_AND_VISUAL_PENDING',
    priorContract=old, priorContractSha256=sha(contract_file), selectedPack=assembly['pack'],
    verification=dict(file=str(verified_file), sha256=sha(verified_file)),
    assembly=dict(file=str(assembly_file), sha256=sha(assembly_file)), preservedFamilies=230,
    newFamilies=sorted(patch['families']), payloadFiles=len(assembly['payloadHashes']), windows='NOT_RUN'))
full['selectedPack'] = assembly['pack']
contract_file.write_text(json.dumps(full, indent=2) + '\n')
selector.write_text(json.dumps(assembly['pack'], indent=2) + '\n')
cases = []
for group, edition, runtime, names in [
    ('city', 'ra2', 'official-c3f4f1c670fe69ba74e35aee.map', [f'CACITY{i:02d}' for i in range(1, 5)]),
    ('flags', 'yr', 'xhailmary.map', ['CAFRFGL', 'CAUKFGL', 'CASKFGL', 'CALBFGL']),
]:
    families = ['urban-' + name.lower() for name in names]
    entry = dict(id=group, edition=edition, runtimeName=runtime, identities=names,
        families=families, members=[m for f in families for m in patch['families'][f]['members']],
        captureName=names[0], checkRelease=True,
        output=f'.artifacts/m2-4/urban-city-flags-batch57-v1/native-{group}')
    if group == 'flags':
        entry.update(linkedMembers=[m for m in entry['members'] if m.endswith('_a.shp')],
            cycleSource=str(root / 'source.json'))
        entry['cycleMembers'] = entry['linkedMembers']
    cases.append(entry)
write(root / 'native-plan-v1.json', dict(schema='m2-4-complete-city-flags-native-plan-v1',
    sourceContractSha256=sha(root / 'contract.json'), cases=cases,
    deduplication='City raw SHP, map SHA, library palette and rules are identical across editions; RA2 full-state cases plus a YR exact-map load guard. All four YR flag cycles have distinct SHP hashes and receive separate loop observations.'))
print(json.dumps(dict(selectedPack=assembly['pack'], families=len(full['families']),
    files=len(assembly['payloadHashes']) + 1)))
