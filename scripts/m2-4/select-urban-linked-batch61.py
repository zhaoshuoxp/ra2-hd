"""Append six verified linked Urban families without replacing accepted payloads."""
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


base = Path('.artifacts/m2-4')
native = base / 'urban-linked-native-batch61-v1'
art = base / 'urban-linked-authoring-batch61-v1'
root = base / 'urban-linked-batch61-v1'
root.mkdir()
contract_file = Path('desktop/environment-urban-hd-contract.json')
selector = Path('.local/environment-urban-selection.json')
old, patch = read(contract_file), read(native / 'contract.json')
verified_file = art / 'verification-v1.json'
verified = read(verified_file)
assert verified['status'] == 'PASS'
assert {key: verified['counts'][key] for key in ['families', 'members', 'densityFrames', 'exactAcceptedBodyFrames']} == dict(
    families=6, members=13, densityFrames=446, exactAcceptedBodyFrames=18)
assert read(art / 'actual-authoring-capacity-v1.json')['status'] == 'PASS'
assert read(art / 'accepted-animation-reuse-guards-v1.json')['status'] == 'PASS'
assert len(old['families']) == 278 and read(selector) == old['selectedPack']
assert old['selectedPack']['sha256'] == 'fe36835c76c49d205973e1b9937c419dd4f422df54bdb40d85339a9171f39ffe'
patch_root = Path(verified['pack'])
assert sha(patch_root / 'manifest.json') == verified['sha256']
assert sha(native / 'source.json') == patch['preparedSourceSha256']
full = copy.deepcopy(old)
for key in ['families', 'sources']:
    assert not set(patch[key]) & set(old[key])
    full[key].update(patch[key])
for edition, bindings in patch['identities'].items():
    assert not set(bindings) & set(old['identities'][edition])
    full['identities'][edition].update(bindings)
full['preparedSourceSha256'] = patch['preparedSourceSha256']
full['extensions'] = dict(milestone='M2.4', batch=61, newFamilies=sorted(patch['families']),
    baselineSelectedPack=old['selectedPack'], baselineContractSha256=sha(contract_file),
    omittedInvisibleSystemMarkers=old['extensions']['omittedInvisibleSystemMarkers'],
    state='STATIC_COMPLETE_NATIVE_AND_VISUAL_PENDING',
    policy='Six complete linked families; all original body, active, buildup, reverse and shadow dependencies retained. All 278 prior families preserved.')
full_file = native / 'contract-full-v1.json'
write(full_file, full)
assembly_file = native / 'assembly-v1.json'
subprocess.run(['python3', 'scripts/m2/official-maps/combine-environment.py',
    'urban-environment-m2-4-linked-batch61-v1', '--contract', str(full_file),
    '--base-pointer', str(selector), '--append', str(patch_root), '--receipt', str(assembly_file)], check=True)
assembly = read(assembly_file)
assert len(assembly['preservedFamilies']) == 278
assert set(assembly['appendedFamilies']) == set(patch['families'])
selected = Path('.local/environment-packs') / assembly['pack']['revision']
assert sha(selected / 'manifest.json') == assembly['pack']['sha256']
for name, digest in assembly['payloadHashes'].items():
    assert sha(selected / name) == digest
write(native / 'selection-v1.json', dict(status='STATIC_COMPLETE_NATIVE_AND_VISUAL_PENDING',
    priorContract=old, priorContractSha256=sha(contract_file), selectedPack=assembly['pack'],
    verification=dict(file=str(verified_file), sha256=sha(verified_file)),
    assembly=dict(file=str(assembly_file), sha256=sha(assembly_file)), preservedFamilies=278,
    newFamilies=sorted(patch['families']), payloadFiles=len(assembly['payloadHashes']), windows='NOT_RUN'))
full['selectedPack'] = assembly['pack']
contract_file.write_text(json.dumps(full, indent=2) + '\n')
selector.write_text(json.dumps(assembly['pack'], indent=2) + '\n')
sources = read(native / 'source.json')['sources']
bodies = {s['bindings'][0]['id']: s for s in sources if all(b['role'] == 'body' for b in s['bindings'])}
specs = [
    ('ra2', 'mp28u4.map@d871241b686b', ['CAGARD01'], 'CAGARD01', False),
    ('yr', 'xeb1.map', ['CAGARD01', 'NAPSYA', 'NAPSYB'], 'NAPSYA', True),
    ('yr', 'hillbtwn.map', ['CAMOV02', 'CAMOV01', 'CALA10'], 'CAMOV01', True),
]
cases = []
for number, (edition, name, identities, capture_name, release) in enumerate(specs, 1):
    assert all(any(b['edition'] == edition and f'{edition}:{name}' in b['mapIds']
        for b in bodies[identity]['bindings']) for identity in identities)
    cycles = [s['member'] for s in sources if any(b['role'] == 'ACTIVE' and b['id'] in identities
        and b['edition'] == edition for b in s['bindings'])]
    cases.append(dict(id=str(number), edition=edition,
        runtimeName='official-d871241b686b7a1a5d453410.map' if '@' in name else name,
        sourceMapId=f'{edition}:{name}', identities=identities,
        families=[patch['identities'][edition][identity] for identity in identities],
        captureName=capture_name, checkRelease=release, linkedMembers=cycles, cycleMembers=cycles,
        cycleSource=str(native / 'source.json'), output=str(root / f'native-group{number}')))
assert {identity for case in cases for identity in case['identities']} == set(bodies)
write(native / 'native-plan-v1.json', dict(schema='m2-4-urban-linked-native-plan-v1',
    sourceContractSha256=sha(native / 'contract.json'), cases=cases,
    deduplication='Three unchanged official maps cover all six exact family source sets and both editions of the shared guard shack. Every original active loop, applicable damaged loop and native state is checked at 2X and 4X. Other placements with identical source hashes, Art, Rules, palette and complete dependency sets share the same loading path; existing unified-mode lightweight-map evidence is reused.'))
print(json.dumps(dict(selectedPack=assembly['pack'], families=len(full['families']),
    files=len(assembly['payloadHashes']) + 1, newFamilies=6)))
