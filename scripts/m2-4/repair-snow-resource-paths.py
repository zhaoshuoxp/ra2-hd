"""Repair only the new ore/gem member directories in a versioned Snow pack."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(path, value):
    with path.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('prepared', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--revision', required=True)
args = parser.parse_args()
assert args.revision.startswith('snow-environment-m2-4-') and args.revision.replace('-', '').isalnum()
recipe = read(args.prepared / 'recipe.json')
old_pointer = read(Path('.local/environment-snow-selection.json'))
contract = read(Path('desktop/environment-snow-hd-contract.json'))
assert old_pointer == contract['selectedPack'] == recipe['selectedEnvironment']
root = Path('.local/environment-packs')
old_root, new_root = root / old_pointer['revision'], root / args.revision
assert sha(old_root / 'manifest.json') == old_pointer['sha256']
pack = read(old_root / 'manifest.json')
assert set(recipe['newFamilies']) == {'snow-ore', 'snow-gem'}
assert sha(Path(read(args.prepared / 'source.json')['inventoryFile'])) == read(args.prepared / 'source.json')['inventorySha256']
args.output.mkdir(exist_ok=False)
new_root.mkdir(exist_ok=False)
renames = {}
for identity in recipe['newFamilies']:
    for member in pack['families'][identity]['members']:
        name = member['member']
        assert member['path'] == f'members/{name}/manifest.json'
        assert sha(old_root / member['path']) == member['sha256']
        renames[f'members/{name}/'] = f'members/{name.replace(".", "-")}/'
assert len(renames) == 24
files, unchanged = [], 0
for source in sorted(old_root.rglob('*')):
    if not source.is_file() or source == old_root / 'manifest.json':
        continue
    relative = source.relative_to(old_root).as_posix()
    target_name = next((new + relative[len(old):] for old, new in renames.items()
                        if relative.startswith(old)), relative)
    target = new_root / target_name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    assert sha(source) == sha(target)
    files.append(dict(old=relative, new=target_name, sha256=sha(target), bytes=target.stat().st_size))
    unchanged += int(relative == target_name)
assert unchanged == recipe['preservedBaseFiles'] == 270
for identity in recipe['newFamilies']:
    for member in pack['families'][identity]['members']:
        member['path'] = f'members/{member["member"].replace(".", "-")}/manifest.json'
        assert sha(new_root / member['path']) == member['sha256']
pack['revision'] = args.revision
save(new_root / 'manifest.json', pack)
pointer = dict(schemaVersion=1, revision=args.revision, sha256=sha(new_root / 'manifest.json'))
save(args.output / 'path-repair.json', dict(schema='m2-4-resource-path-repair-v1',
    old=old_pointer, candidate=pointer, families=recipe['newFamilies'], renamedMembers=len(renames),
    payloads=len(files), unchangedInheritedFiles=unchanged, files=files,
    recipeFile=str(args.prepared / 'recipe.json'), recipeSha256=sha(args.prepared / 'recipe.json'),
    policy='Only pack revision and member paths change. All member metadata and PNGs remain byte-exact.',
    status='PASS_PATH_REPAIR_PAYLOAD_IDENTITY; REGISTRATION_AND_SELECTION_PENDING'))
contract['selectedPack'] = pointer
save(args.output / 'contract.json', contract)
print(json.dumps(dict(candidate=pointer, renamedMembers=len(renames), payloads=len(files), inherited=unchanged)))
