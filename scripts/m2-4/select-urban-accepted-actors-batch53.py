"""Select two complete source-proven Urban families while preserving all accepted payloads."""
import copy
import hashlib
import json
import subprocess
from pathlib import Path

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
encode = lambda d: json.dumps(d, indent=2) + '\n'
root = Path('.artifacts/m2-4/urban-accepted-actors-export-batch53-v2')
contract_file = Path('desktop/environment-urban-hd-contract.json')
selector = Path('.local/environment-urban-selection.json')
old, patch = read(contract_file), read(root / 'contract.json')
verified_file = root / 'verification-v1.json'; verified = read(verified_file)
assert verified['status'] == 'PASS_COMPLETE_ACCEPTED_ACTORS_AND_BOUNDED_NATIVE_PALETTE_ADAPTATION'
assert verified['contractSha256'] == sha(root / 'contract.json')
assert verified['sourceSha256'] == patch['preparedSourceSha256']
assert verified['reuseReceiptSha256'] == sha(root / 'reuse-receipt.json')
assert read(selector) == old['selectedPack'] and len(old['families']) == 204
assert len(patch['families']) == len(patch['sources']) == 2
full = copy.deepcopy(old)
for key in ['families', 'sources']:
    assert not set(patch[key]) & set(old[key]); full[key].update(patch[key])
for edition, bindings in patch['identities'].items():
    assert not set(bindings) & set(old['identities'][edition])
    full['identities'][edition].update(bindings)
full['preparedSourceSha256'] = patch['preparedSourceSha256']
full['extensions'] = dict(milestone='M2.4', batch=53, newFamilies=sorted(patch['families']),
    baselineSelectedPack=old['selectedPack'], baselineContractSha256=sha(contract_file),
    omittedInvisibleSystemMarkers=old['extensions']['omittedInvisibleSystemMarkers'],
    state='STATIC_COMPLETE_NATIVE_PENDING_NO_NEW_ART',
    policy='Complete accepted gate and civilian actor; only five original fixed palette cells adapt to Urban. No new detail or artwork claim.')
full_file = root / 'contract-full-v1.json'
with full_file.open('x') as stream: stream.write(encode(full))
assembly_file = root / 'assembly-v1.json'
subprocess.run(['python3', 'scripts/m2/official-maps/combine-environment.py',
    'urban-environment-m2-4-accepted-actors-batch53-v1', '--contract', str(full_file),
    '--base-pointer', str(selector), '--append', verified['pack'], '--receipt', str(assembly_file)], check=True)
assembly = read(assembly_file)
assert len(assembly['preservedFamilies']) == 204 and set(assembly['appendedFamilies']) == set(patch['families'])
selected = Path('.local/environment-packs') / assembly['pack']['revision']
assert sha(selected / 'manifest.json') == assembly['pack']['sha256']
for name, digest in assembly['payloadHashes'].items(): assert sha(selected / name) == digest
receipt = dict(status='STATIC_COMPLETE_NATIVE_PENDING', priorContract=old, priorContractSha256=sha(contract_file),
    selectedPack=assembly['pack'], verification=dict(file=str(verified_file), sha256=sha(verified_file)),
    assembly=dict(file=str(assembly_file), sha256=sha(assembly_file)), preservedFamilies=204,
    newFamilies=sorted(patch['families']), payloadFiles=len(assembly['payloadHashes']), windows='NOT_RUN')
with (root / 'selection-v1.json').open('x') as stream: stream.write(encode(receipt))
full['selectedPack'] = assembly['pack']
contract_file.write_text(encode(full)); selector.write_text(encode(assembly['pack']))
print(json.dumps(dict(selectedPack=assembly['pack'], families=len(full['families']),
    files=len(assembly['payloadHashes']) + 1)))
