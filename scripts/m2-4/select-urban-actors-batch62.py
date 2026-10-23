"""Select nine complete actor families, preserving every prior Urban payload."""
import copy
import hashlib
import json
import subprocess
from pathlib import Path

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def write(file, value):
    with file.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


root = Path('.artifacts/m2-4/urban-actors-native-batch62-v1')
art = Path('.artifacts/m2-4/urban-actors-authoring-batch62-v1')
voxel = Path('.artifacts/m2-4/urban-actors-voxel-authoring-batch62-v2')
contract_file = Path('desktop/environment-urban-hd-contract.json')
selector = Path('.local/environment-urban-selection.json')
old, patch = read(contract_file), read(root / 'infantry-contract.json')
assert len(old['families']) == 284 and read(selector) == old['selectedPack']
assert old['selectedPack']['sha256'] == '78fe1133aca925ff4c1f09d7703b9311a06310ce9f632e9724faa9e443c2f81f'
verified = read(art / 'verification-v1.json')
assert verified['status'] == 'PASS' and verified['counts']['densityFrames'] == 1204
assert read(art / 'subpixel-verification-v1.json')['verifiedDensityPixels'] == 2920
vxl_verified = read(voxel / 'verification-v1.json')
assert vxl_verified['status'] == 'PASS_SOURCES_BEARINGS_DENSITIES_FIXED_COLORS'
assert vxl_verified['authoredIdentities'] == 6 and vxl_verified['densityBearings'] == 96
full = copy.deepcopy(old)
for key in ['families', 'sources']:
    assert not set(patch[key]) & set(full[key])
    full[key].update(patch[key])
for edition, identities in patch['identities'].items():
    assert not set(identities) & set(full['identities'][edition])
    full['identities'][edition].update(identities)
prior_vxl = read(Path('desktop/environment-snow-hd-contract.json'))['vxl']
assert set(prior_vxl) == {'WINI', 'TRUCKB'}
assert all('URBAN' in entry['theaters'] for entry in prior_vxl.values())
assert not old.get('vxl')
full['vxl'] = copy.deepcopy(prior_vxl)
for identity, entry in read(voxel / 'vxl-contract-v1.json')['vxl'].items():
    assert identity not in full['vxl']
    full['vxl'][identity] = dict(entry, edition='yr', authoringTheater='URBAN', theaters=['URBAN'])
full['preparedSourceSha256'] = patch['preparedSourceSha256']
full['extensions'] = dict(milestone='M2.4', batch=62, baselineSelectedPack=old['selectedPack'],
    baselineContractSha256=sha(contract_file), newFamilies=sorted(patch['families']),
    newVoxelFamilies=sorted(set(full['vxl']) - set(prior_vxl)),
    omittedInvisibleSystemMarkers=old['extensions']['omittedInvisibleSystemMarkers'],
    state='STATIC_COMPLETE_NATIVE_AND_VISUAL_PENDING',
    policy='Three complete native SHP actors and six complete VXL/HVA body families. All 284 prior SHP families and both accepted Snow-authored Urban VXL descriptors remain unchanged. No map, rule, original archive or main resource changes.')
full_file = root / 'contract-full-v1.json'
write(full_file, full)
assembly_file = root / 'assembly-v1.json'
subprocess.run(['python3', 'scripts/m2/official-maps/combine-environment.py',
    'urban-environment-m2-4-actors-batch62-v1-combined', '--contract', str(full_file),
    '--base-pointer', str(selector), '--append', verified['pack'], '--receipt', str(assembly_file)], check=True)
assembly = read(assembly_file)
assert len(assembly['preservedFamilies']) == 284 and len(assembly['appendedFamilies']) == 3
combined = Path('.local/environment-packs') / assembly['pack']['revision']
assert sha(combined / 'manifest.json') == assembly['pack']['sha256']
assert all(sha(combined / file) == digest for file, digest in assembly['payloadHashes'].items())
write(root / 'selection-v1.json', dict(status='STATIC_COMPLETE_NATIVE_AND_VISUAL_PENDING',
    priorContract=old, priorContractSha256=sha(contract_file), selectedPack=assembly['pack'],
    preservedFamilies=284, newShpFamilies=3, newVxlFamilies=6, sourcePreparedSha256=sha(root / 'source.json')))
full['selectedPack'] = assembly['pack']
contract_file.write_text(json.dumps(full, indent=2) + '\n')
selector.write_text(json.dumps(assembly['pack'], indent=2) + '\n')
print(json.dumps(dict(selectedPack=assembly['pack'], families=len(full['families']),
    newVoxelFamilies=6, acceptedVoxelDescriptorsPreserved=2, selectedForNativeReviewOnly=True)))
