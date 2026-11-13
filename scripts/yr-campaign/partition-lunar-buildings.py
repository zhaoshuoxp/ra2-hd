"""Bind each Lunar building to its own complete native sprite family."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('root', type=Path)
parser.add_argument('revision')
args = parser.parse_args()
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
write = lambda p, v: p.write_text(json.dumps(v, indent=2) + '\n')
contract_file = Path('desktop/environment-lunar-hd-contract.json')
pointer_file = Path('.local/environment-lunar-selection.json')
contract, pointer = read(contract_file), read(pointer_file)
assert contract['selectedPack'] == pointer and contract['theater'] == 'LUNAR'
assert read(Path('docs/campaign-art/yr-v1/lunar-environment.json'))['userVisualAcceptance'] == 'PENDING'
old_root = Path('.local/environment-packs') / pointer['revision']
assert sha(old_root / 'manifest.json') == pointer['sha256']
pack = read(old_root / 'manifest.json')
parent = contract['families'].pop('yr-sov06-lunar-buildings-v1')
original = pack['families'].pop('yr-sov06-lunar-buildings-v1')
source = read(args.root / 'prepared/source.json')
lookup = {row['member']: row for row in source['sources']}
assert parent['members'] == sorted(member['member'] for member in original['members'])
for member in original['members']:
    native = lookup[member['member']]
    identity, = [binding['identity'] for binding in native['bindings']]
    family = 'yr-sov06-lunar-' + identity.lower() + '-v1'
    declared = copy.deepcopy(parent)
    declared['members'], declared['identities'] = [member['member']], [identity]
    basis = dict(theater='LUNAR', members={member['member']: contract['sources'][member['member']]}, identities=[identity])
    family_hash = hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    declared['familyHash'] = family_hash
    contract['families'][family] = declared
    contract['identities']['yr'][identity] = family
    pack['families'][family] = dict(familyHash=family_hash, members=[member])
assert len(contract['families']) == 5
new_root = Path('.local/environment-packs') / args.revision
new_root.mkdir(exist_ok=False)
files = []
for file in old_root.rglob('*'):
    if not file.is_file() or file.name == 'manifest.json' and file.parent == old_root:
        continue
    assert not file.is_symlink()
    target = new_root / file.relative_to(old_root)
    target.parent.mkdir(parents=True, exist_ok=True)
    os.link(file, target)
    files.append(dict(path=str(file.relative_to(old_root)), sha256=sha(file)))
pack['revision'] = args.revision
write(new_root / 'manifest.json', pack)
selected = dict(schemaVersion=1, revision=args.revision, sha256=sha(new_root / 'manifest.json'))
contract['selectedPack'] = selected
write(args.root / 'contract-render-bindings-v2.json', contract)
write(contract_file, contract)
write(pointer_file, selected)
receipt = dict(schema='yr-lunar-environment-registration-v2', status='INDEPENDENT_BUILDING_GROUPS_REGISTERED_NATIVE_STATES_PENDING',
    source=str(args.root), mission=source['mission'], sourceSha256=source['missionSha256'], pack=selected,
    families=list(contract['families']), members=36, independentDensities=[2, 4],
    payloadFiles=len(files), copiedPayloads=0, acceptedPayloadsReplaced=0, userVisualAcceptance='PENDING',
    windows='NOT_RUN_ON_THIS_MAC', policy='Each building binds only its own body and states. Rock and smudge groups keep complete atomic fallback.')
write(Path('docs/campaign-art/yr-v1/lunar-environment.json'), receipt)
write(args.root / 'building-partition-v2.json', dict(before=pointer, after=selected, immutablePayloads=files,
    status='EXACT_PAYLOADS_PARTITIONED_INTO_COMPLETE_INDIVIDUAL_BUILDING_FAMILIES'))
print(json.dumps(receipt))
