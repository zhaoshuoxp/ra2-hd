"""Replace explicit complete color-only families and preserve every other payload."""
import argparse
import copy
import hashlib
import json
import shutil
from pathlib import Path
import numpy as np
from PIL import Image


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('revision')
parser.add_argument('--base-pointer', type=Path, required=True)
parser.add_argument('--patch', type=Path, required=True)
parser.add_argument('--families', nargs='+', required=True)
parser.add_argument('--receipt', type=Path, required=True)
args = parser.parse_args()
pointer = read(args.base_pointer)
base_root = Path('.local/environment-packs') / pointer['revision']
assert sha(base_root / 'manifest.json') == pointer['sha256']
base, patch = read(base_root / 'manifest.json'), read(args.patch / 'manifest.json')
assert base['theater'] == patch['theater'] and base['schema'] == patch['schema']
assert len(set(args.families)) == len(args.families) and set(args.families) == set(patch['families'])
result = copy.deepcopy(base)
result['revision'] = args.revision
files, replaced = {}, []
for identity, family in base['families'].items():
    root = args.patch if identity in args.families else base_root
    chosen = patch['families'][identity] if identity in args.families else family
    assert chosen['familyHash'] == family['familyHash']
    assert sorted(m['member'] for m in chosen['members']) == sorted(m['member'] for m in family['members'])
    for member in chosen['members']:
        path = root / member['path']
        assert sha(path) == member['sha256']
        if identity in args.families:
            old_entry, = [m for m in family['members'] if m['member'] == member['member']]
            old_path = base_root / old_entry['path']
            assert sha(old_path) == old_entry['sha256']
            old, hd = read(old_path), read(path)
            assert old['source'] == hd['source'] and old['logical'] == hd['logical']
            assert old['color'] == hd['color']
            assert [v['density'] for v in old['variants']] == [2, 4] == [v['density'] for v in hd['variants']]
            for a, b in zip(old['variants'], hd['variants']):
                assert a['frames'] == b['frames'] and len(a['pages']) == len(b['pages'])
                for op, npg in zip(a['pages'], b['pages']):
                    assert op['id'] == npg['id'] and op['size'] == npg['size']
                    old_page = old_path.parent / str(a['density']) / op['id']
                    new_page = path.parent / str(b['density']) / npg['id']
                    for role in ('base', 'data'):
                        assert sha(old_page / (role + '.png')) == op[role + 'Sha256']
                        assert sha(new_page / (role + '.png')) == npg[role + 'Sha256']
                    assert op['dataSha256'] == npg['dataSha256'], 'Color repair must preserve all categorical data'
                    old_rgba = np.asarray(Image.open(old_page / 'base.png').convert('RGBA'))
                    new_rgba = np.asarray(Image.open(new_page / 'base.png').convert('RGBA'))
                    assert np.array_equal(old_rgba[..., 3], new_rgba[..., 3]), 'Native and atlas alpha must remain exact'
            replaced.append(dict(family=identity, member=member['member'],
                previousMetadataSha256=old_entry['sha256'], replacementMetadataSha256=member['sha256']))
        for file in sorted(path.parent.rglob('*')):
            if file.is_file():
                relative = file.relative_to(root)
                assert relative not in files
                files[relative] = file
    result['families'][identity] = chosen
destination = Path('.local/environment-packs') / args.revision
destination.mkdir(exist_ok=False)
for relative, source in files.items():
    target = destination / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    assert sha(source) == sha(target)
with (destination / 'manifest.json').open('x') as stream:
    stream.write(json.dumps(result, separators=(',', ':')) + '\n')
selected = dict(schemaVersion=1, revision=args.revision, sha256=sha(destination / 'manifest.json'))
receipt = dict(status='PASS_COMPLETE_COLOR_ONLY_REPLACEMENT_AND_INHERITED_BYTES',
    acceptedBase=pointer, pack=selected, replaced=replaced,
    preservedFamilies=sorted(set(base['families']) - set(args.families)),
    files=len(files), nativeStatus='NOT_RUN', visualStatus='PENDING_USER_REVIEW', windowsStatus='NOT_RUN')
with args.receipt.open('x') as stream:
    stream.write(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(dict(pack=selected, preservedFamilies=len(receipt['preservedFamilies']), replaced=len(replaced))))
