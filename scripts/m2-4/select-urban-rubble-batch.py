"""Append a complete Urban civilian rubble batch while retaining every accepted payload."""
import argparse
import copy
import hashlib
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--batch', type=int, default=49)
parser.add_argument('--verified', default='verify-r3.json')
parser.add_argument('--revision', default='urban-environment-m2-4-civilian-rubble-v1')
parser.add_argument('--linked', action='store_true', help='Require complete associated-member verification')
args = parser.parse_args()
assert args.batch >= 49 and args.revision.startswith('urban-environment-m2-4-')
root = Path(f'.artifacts/m2-4/urban-building-rubble-native-batch{args.batch}-v1')
authoring = Path(f'.artifacts/m2-4/urban-building-rubble-authoring-batch{args.batch}-v1')
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
encode = lambda value: json.dumps(value, indent=2) + '\n'
contract_file = Path('desktop/environment-urban-hd-contract.json')
selector = Path('.local/environment-urban-selection.json')
old, patch = read(contract_file), read(root / 'contract.json')
verify_file = authoring / args.verified
verified = read(verify_file)
count = len(patch['families'])
assert verified['counts']['families'] == count
if args.linked:
    assert verified['status'] == 'PASS_COMPLETE_LINKED_BODY_AND_ACCEPTED_ANIMATION_FAMILIES'
    assert verified['contractSha256'] == sha(root / 'contract.json')
    assert verified['sourceSha256'] == sha(root / 'source.json')
    assert verified['assemblySha256'] == sha(root / 'linked-assembly-v1.json')
    assert verified['counts']['members'] == len(patch['sources'])
    assert verified['counts']['densityFrames'] == sum(s['bodyFrames'] * 2 for s in patch['sources'].values())
else:
    assert verified['status'] == 'PASS'
    assert verified['counts']['members'] == count and verified['counts']['densityFrames'] == count * 8
assert old['selectedPack'] == read(selector)
prior_count = len(old['families'])
assert len(patch['families']) == count
assert len(patch['sources']) == len({n for f in patch['families'].values() for n in f['members']})
if not args.linked:
    assert len(patch['sources']) == count
full = copy.deepcopy(old)
for key in ['sources', 'families']:
    assert not set(patch[key]) & set(old[key])
    full[key].update(patch[key])
for edition, bindings in patch['identities'].items():
    assert not set(bindings) & set(old['identities'][edition])
    full['identities'][edition].update(bindings)
full['preparedSourceSha256'] = patch['preparedSourceSha256']
full['extensions'] = dict(milestone='M2.4', batch=args.batch, newFamilies=sorted(patch['families']),
    baselineSelectedPack=old['selectedPack'], baselineContractSha256=sha(contract_file),
    omittedInvisibleSystemMarkers=old['extensions']['omittedInvisibleSystemMarkers'],
    state='STATIC_COMPLETE_MAC_NATIVE_AND_VISUAL_PENDING',
    policy='Complete Urban civilian families with exact accepted body reuse, newly authored visible rubble and source-identical unreachable slot preservation. Every prior family retains exact payloads.')
full_file = root / 'contract-full-v1.json'
with full_file.open('x') as stream: stream.write(encode(full))
assembly_file = root / 'assembly-v1.json'
subprocess.run(['python3', 'scripts/m2/official-maps/combine-environment.py', args.revision,
    '--contract', str(full_file), '--base-pointer', str(selector), '--append', verified['pack'],
    '--receipt', str(assembly_file)], check=True)
assembly = read(assembly_file)
assert set(assembly['appendedFamilies']) == set(patch['families'])
assert len(assembly['preservedFamilies']) == prior_count
assert sha(Path(verified['pack']) / 'manifest.json') == verified['sha256']
new_root = Path('.local/environment-packs') / assembly['pack']['revision']
assert sha(new_root / 'manifest.json') == assembly['pack']['sha256']
for name, digest in assembly['payloadHashes'].items(): assert sha(new_root / name) == digest
full['selectedPack'] = assembly['pack']
receipt = dict(status='STATIC_COMPLETE_MAC_NATIVE_AND_VISUAL_PENDING', selectedPack=assembly['pack'],
    priorContract=old, priorContractSha256=sha(contract_file), patchContractSha256=sha(root / 'contract.json'),
    verificationFile=str(verify_file), verificationSha256=sha(verify_file), assemblyFile=str(assembly_file),
    assemblySha256=sha(assembly_file), newFamilies=sorted(patch['families']),
    acceptedFamiliesPreserved=prior_count, payloadFiles=len(assembly['payloadHashes']), windows='NOT_RUN', m24Complete=False)
with (root / 'selection-v1.json').open('x') as stream: stream.write(encode(receipt))
contract_file.write_text(encode(full))
selector.write_text(encode(assembly['pack']))
print(json.dumps(dict(selectedPack=assembly['pack'], families=len(full['families']), files=len(assembly['payloadHashes']) + 1)))
