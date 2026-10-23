"""Select complete NewUrban samples while preserving every existing theater payload."""
import hashlib
import json
import subprocess
from pathlib import Path

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
encode = lambda value: json.dumps(value, indent=2) + '\n'
root = Path('.artifacts/m2-4/newurban-representative-native-batch64-v1')
tree = Path('.artifacts/m2-4/newurban-tree-native-batch64-v1')
tmp = Path('.artifacts/m2-4/newurban-representative-tmp-batch64-v1')
shp = Path('.artifacts/m2-4/newurban-representative-shp-batch64-v1')
terrain_revision = 'newurban-m2-4-representative-batch64-v1'
environment_revision = 'newurban-environment-m2-4-representative-batch64-v1'
terrain = read(tmp / terrain_revision / 'validation.json')
objects = read(shp / 'verification-v1.json')
assert terrain['status'] == 'PASS_NEW_COMPLETE_GROUPS_NATIVE_METADATA_ALPHA_GUTTERS_AND_ACCEPTED_REUSE'
assert terrain['newMembers'] == 114 and terrain['independentDensityPairs'] == 228
assert objects['status'] == 'PASS' and objects['counts']['families'] == 3
assert objects['counts']['densityFrames'] == 6
for folder in [tmp, shp]:
    for job in read(folder / 'imagegen-jobs.json')['jobs']:
        capacity = read(folder / (job['id'] + '-capacity-v1.json'))
        assert capacity['status'] == 'PASS'
        assert sha(Path(job['destination'])) == capacity['masterSha256']
contract_file = Path('desktop/environment-newurban-hd-contract.json')
selector = Path('.local/environment-newurban-selection.json')
prior = read(contract_file)
full = read(tree / 'contract-full.json')
assert prior['selectedPack'] == full['selectedPack'] == read(selector)
assert len(prior['families']) == 39 and len(full['families']) == 42
assert all(full['families'][key] == value for key, value in prior['families'].items())
assert all(full['sources'][key] == value for key, value in prior['sources'].items())
assert full['vxl'] == prior['vxl']
assembly_file = root / 'environment-assembly-v1.json'
subprocess.run(['python3', 'scripts/m2/official-maps/combine-environment.py',
    'newurban-environment-m2-4-representative-batch64-v1-combined',
    '--contract', str(tree / 'contract-full.json'), '--base-pointer', str(selector),
    '--append', objects['pack'], '--receipt', str(assembly_file)], check=True)
assembly = read(assembly_file)
assert len(assembly['preservedFamilies']) == 39 and len(assembly['appendedFamilies']) == 3
pack = Path('.local/environment-packs') / assembly['pack']['revision']
assert sha(pack / 'manifest.json') == assembly['pack']['sha256']
assert all(sha(pack / file) == digest for file, digest in assembly['payloadHashes'].items())
terrain_file = Path('desktop/terrain-theater-hd-contracts.json')
old_theaters = read(terrain_file)
assert 'NEWURBAN' not in old_theaters
terrain_selector = Path('.local/terrain-newurban-selection.json')
assert not terrain_selector.exists()
terrain_root = Path('.local/terrain-packs') / terrain_revision
assert sha(terrain_root / 'manifest.json') == terrain['pack']['sha256']
full['selectedPack'] = assembly['pack']
full['extensions']['state'] = 'STATIC_PASS_NATIVE_AND_VISUAL_REVIEW_PENDING'
full['extensions']['batch'] = 64
receipt = dict(status='STATIC_PASS_COMPLETE_NEWURBAN_REPRESENTATIVES_NATIVE_PENDING', batch=64,
    priorContract=prior, priorTerrainTheaters=old_theaters,
    selectedTerrain=terrain['pack'], selectedEnvironment=assembly['pack'],
    newTerrainMembers=114, newTreeFamilies=3, acceptedEnvironmentFamiliesPreserved=39,
    voxelDescriptorsPreserved=8, environmentPayloadFiles=len(assembly['payloadHashes']),
    verification=[dict(file=str(p), sha256=sha(p)) for p in
        [tmp / terrain_revision / 'validation.json', shp / 'verification-v1.json', assembly_file]],
    windows='NOT_RUN', visual='PENDING_NEW_ART_ONLY', m24Complete=False)
with (root / 'selection-v1.json').open('x') as stream:
    stream.write(encode(receipt))
contract_file.write_text(encode(full))
selector.write_text(encode(assembly['pack']))
terrain_selector.write_text(encode(terrain['pack']))
terrain_file.write_text(encode(dict(old_theaters, NEWURBAN=terrain['pack'])))
print(json.dumps(dict(selectedTerrain=terrain['pack'], selectedEnvironment=assembly['pack'],
    families=len(full['families']), newTerrainMembers=114)))
