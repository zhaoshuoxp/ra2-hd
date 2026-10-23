"""Append a complete Urban tree batch while retaining every accepted payload."""
import copy
import hashlib
import json
import subprocess
from pathlib import Path

root = Path('.artifacts/m2-4/urban-tree-native-batch46-v1')
authoring = Path('.artifacts/m2-4/urban-tree-authoring-batch46-v1')
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
encode = lambda value: json.dumps(value, indent=2) + '\n'
contract_file = Path('desktop/environment-urban-hd-contract.json')
selector = Path('.local/environment-urban-selection.json')
old, patch = read(contract_file), read(root / 'contract.json')
verify_file = authoring / 'verify-r3.json'
verified = read(verify_file)
assert verified['status'] == 'PASS' and verified['counts']['families'] == 23
assert verified['counts']['members'] == 23 and verified['counts']['densityFrames'] == 46
assert old['selectedPack'] == read(selector) and len(old['families']) == 87
assert set(patch['families']) == {f'urban-tree{i:02d}' for i in range(2, 28) if i not in (5, 11, 24)}
full = copy.deepcopy(old)
for key in ['sources', 'families']:
    assert not set(patch[key]) & set(old[key])
    full[key].update(patch[key])
for edition, bindings in patch['identities'].items():
    assert not set(bindings) & set(old['identities'][edition])
    full['identities'][edition].update(bindings)
full['preparedSourceSha256'] = patch['preparedSourceSha256']
full['extensions'] = dict(milestone='M2.4', batch=46, newFamilies=sorted(patch['families']),
    baselineSelectedPack=old['selectedPack'], baselineContractSha256=sha(contract_file),
    omittedInvisibleSystemMarkers=old['extensions']['omittedInvisibleSystemMarkers'],
    state='STATIC_COMPLETE_MAC_NATIVE_AND_VISUAL_PENDING',
    policy='All 23 remaining Urban TREE identities. Accepted TREE01/05/11 and every prior family retain exact payloads.')
full_file = root / 'contract-full-v1.json'
with full_file.open('x') as stream: stream.write(encode(full))
assembly_file = root / 'assembly-v1.json'
subprocess.run(['python3', 'scripts/m2/official-maps/combine-environment.py', 'urban-environment-m2-4-trees-v1',
    '--contract', str(full_file), '--base-pointer', str(selector), '--append', verified['pack'],
    '--receipt', str(assembly_file)], check=True)
assembly = read(assembly_file)
assert set(assembly['appendedFamilies']) == set(patch['families'])
assert len(assembly['preservedFamilies']) == 87
assert sha(Path(verified['pack']) / 'manifest.json') == verified['sha256']
new_root = Path('.local/environment-packs') / assembly['pack']['revision']
assert sha(new_root / 'manifest.json') == assembly['pack']['sha256']
for name, digest in assembly['payloadHashes'].items(): assert sha(new_root / name) == digest
full['selectedPack'] = assembly['pack']
receipt = dict(status='STATIC_COMPLETE_MAC_NATIVE_AND_VISUAL_PENDING', selectedPack=assembly['pack'],
    priorContract=old, priorContractSha256=sha(contract_file), patchContractSha256=sha(root / 'contract.json'),
    verificationFile=str(verify_file), verificationSha256=sha(verify_file), assemblyFile=str(assembly_file),
    assemblySha256=sha(assembly_file), newFamilies=sorted(patch['families']),
    acceptedFamiliesPreserved=87, payloadFiles=len(assembly['payloadHashes']), windows='NOT_RUN', m24Complete=False)
with (root / 'selection-v1.json').open('x') as stream: stream.write(encode(receipt))
contract_file.write_text(encode(full))
selector.write_text(encode(assembly['pack']))
print(json.dumps(dict(selectedPack=assembly['pack'], families=len(full['families']), files=len(assembly['payloadHashes']) + 1)))
