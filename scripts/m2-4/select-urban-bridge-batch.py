"""Select a complete Urban bridge or smudge extension without changing accepted bytes."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('contract', type=Path)
parser.add_argument('assembly', type=Path)
parser.add_argument('verification', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--smudges', action='store_true')
parser.add_argument('--overlays', action='store_true')
args = parser.parse_args()
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
encode = lambda value: json.dumps(value, indent=2) + '\n'
selector = Path('.local/environment-urban-selection.json')
selected_file = Path('desktop/environment-urban-hd-contract.json')
old, contract, assembly, verified = map(read, [selected_file, args.contract, args.assembly, args.verification])
assert contract['theater'] == old['theater'] == assembly['theater'] == 'URBAN'
assert read(selector) == old['selectedPack'] == contract['selectedPack'] == assembly['acceptedBase']
expected = {'urban-bridge-high-concrete', 'urban-bridge-low-wood'}
if args.smudges:
    expected = {f'urban-{stem}{i:02d}' for stem in ['burnt', 'crater'] for i in range(1, 13)}
if args.overlays:
    assert not args.smudges
    expected = {'urban-crate', 'urban-wcrate', 'urban-gusand', 'urban-srock01',
                *[f'urban-trock0{i}' for i in range(1, 6)]}
assert set(assembly['appendedFamilies']) == set(contract['extensions']['newFamilies']) == expected
assert set(contract['families']) - set(old['families']) == expected
assert all(contract['families'][key] == value for key, value in old['families'].items())
assert all(contract['sources'][key] == value for key, value in old['sources'].items())
for edition, identities in old['identities'].items():
    assert all(contract['identities'][edition][key] == value for key, value in identities.items())
assert verified['status'] == 'PASS' and verified['counts']['members'] == (9 if args.overlays else 24 if args.smudges else 27)
patch = Path(verified['pack'])
assert sha(patch / 'manifest.json') == verified['sha256']
assert set(read(patch / 'manifest.json')['families']) == expected
root = Path('.local/environment-packs') / assembly['pack']['revision']
assert sha(root / 'manifest.json') == assembly['pack']['sha256']
for relative, digest in assembly['payloadHashes'].items():
    assert sha(root / relative) == digest
base = Path('.local/environment-packs') / assembly['acceptedBase']['revision']
preserved = 0
for file in base.rglob('*'):
    if file.is_file() and file != base / 'manifest.json':
        assert sha(file) == sha(root / file.relative_to(base))
        preserved += 1
assert not args.output.exists()
contract['selectedPack'] = assembly['pack']
contract['extensions']['state'] = 'STATIC_COMPLETE_SOURCE_AND_ACCEPTED_BYTES_VERIFIED_MAC_NATIVE_PENDING'
receipt = dict(schema='m2-4-urban-object-selection-v1', kind='overlay' if args.overlays else 'smudge' if args.smudges else 'bridge',
    status=contract['extensions']['state'],
    priorContract=old, priorContractSha256=sha(selected_file), selectedPack=assembly['pack'],
    assembly=str(args.assembly), assemblySha256=sha(args.assembly),
    verification=str(args.verification), verificationSha256=sha(args.verification),
    preservedFiles=preserved, newFamilies=sorted(expected), native='PENDING', visual='PENDING',
    windows='NOT_RUN', m24Complete=False)
args.output.write_text(encode(receipt))
selected_file.write_text(encode(contract))
selector.write_text(encode(assembly['pack']))
print(json.dumps(dict(selectedPack=assembly['pack'], preservedFiles=preserved)))
