"""Select complete corrected families while retaining every unrelated payload."""
import copy
import hashlib
import json
import shutil
from pathlib import Path


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


root = Path('.artifacts/m2-4/continuous-art-correction-r1-20261018')
prior = read(root / 'prior-environment-newurban.json')
contract_file = Path('desktop/environment-newurban-hd-contract.json')
assert read(contract_file) == prior
base = Path('.local/environment-packs') / prior['selectedPack']['revision']
candidate = Path('.local/environment-packs/newurban-environment-facilities-continuous-r2')
verification = read(root / 'facilities-verification.json')
assert verification['status'] == 'PASS' and verification['counts']['families'] == 19
assert verification['sha256'] == sha(candidate / 'manifest.json')
old, new = read(base / 'manifest.json'), read(candidate / 'manifest.json')
assert len(old['families']) == 111 and len(new['families']) == 19
result = copy.deepcopy(old)
result['revision'] = 'newurban-environment-continuous-r1-combined'
destination = Path('.local/environment-packs') / result['revision']
destination.mkdir(exist_ok=False)
preserved, replaced, hashes = [], [], {}
for family in sorted(result['families']):
    source = candidate if family in new['families'] else base
    chosen = new['families'][family] if source == candidate else old['families'][family]
    assert chosen['familyHash'] == prior['families'][family]['familyHash']
    assert [member['member'] for member in chosen['members']] == [member['member'] for member in old['families'][family]['members']]
    result['families'][family] = chosen
    (replaced if source == candidate else preserved).append(family)
    for member in chosen['members']:
        file = source / member['path']
        assert sha(file) == member['sha256']
        for payload in sorted(file.parent.rglob('*')):
            if not payload.is_file():
                continue
            relative = payload.relative_to(source)
            target, digest = destination / relative, sha(payload)
            if str(relative) in hashes:
                assert hashes[str(relative)] == digest
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(payload, target)
            assert sha(target) == digest
            hashes[str(relative)] = digest
assert len(preserved) == 92 and len(replaced) == 19
with (destination / 'manifest.json').open('x') as stream:
    stream.write(json.dumps(result, separators=(',', ':')) + '\n')
pointer = dict(schemaVersion=1, revision=result['revision'], sha256=sha(destination / 'manifest.json'))
selected = copy.deepcopy(prior)
selected['selectedPack'] = pointer
selected['extensions'] = dict(milestone='M2.4', correction='CONTINUOUS_ART_R1',
    state='STATIC_PASS_NATIVE_AND_VISUAL_PENDING', priorPack=prior['selectedPack'])
receipt = dict(status='STATIC_CORRECTED_COMPLETE_FAMILIES_PASS_NATIVE_PENDING',
    environment=pointer, preservedFamilies=preserved, replacedFamilies=replaced, payloadHashes=hashes,
    priorContractSha256=sha(root / 'prior-environment-newurban.json'), terrain={})
theater_file = Path('desktop/terrain-theater-hd-contracts.json')
theaters = read(theater_file)
for name, batch in [('newurban', 74), ('desert', 75)]:
    assert read(Path(f'.local/terrain-{name}-selection.json')) == read(root / f'prior-terrain-{name}.json')
    author = Path(f'.artifacts/m2-4/{name}-coast-authoring-batch{batch}-v1')
    verified = read(author / f'{name}-m2-4-coast-continuous-r2/validation.json')
    assert verified['status'] == 'PASS_NEW_COMPLETE_GROUPS_NATIVE_METADATA_ALPHA_GUTTERS_AND_ACCEPTED_REUSE'
    assert verified['newMembers'] == 92
    theaters[name.upper()] = verified['pack']
    receipt['terrain'][name] = verified['pack']
    Path(f'.local/terrain-{name}-selection.json').write_text(json.dumps(verified['pack'], indent=2) + '\n')
with (root / 'selection.json').open('x') as stream:
    stream.write(json.dumps(receipt, indent=2) + '\n')
contract_file.write_text(json.dumps(selected, indent=2) + '\n')
Path('.local/environment-newurban-selection.json').write_text(json.dumps(pointer, indent=2) + '\n')
theater_file.write_text(json.dumps(theaters, indent=2) + '\n')
print(json.dumps(dict(environment=pointer, terrain=receipt['terrain'], preservedFamilies=92, correctedFamilies=26)))
