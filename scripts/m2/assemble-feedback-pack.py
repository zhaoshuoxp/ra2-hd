"""Replace complete feedback families in a new pack, preserving accepted siblings exactly."""
import argparse
import copy
import json
import shutil
from pathlib import Path
from showcase_registration import sha

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('kind', choices=['terrain', 'environment'])
parser.add_argument('base', type=Path)
parser.add_argument('patch', type=Path)
parser.add_argument('destination', type=Path)
parser.add_argument('receipt', type=Path)
args = parser.parse_args()
base = json.loads((args.base / 'manifest.json').read_text())
patch = json.loads((args.patch / 'manifest.json').read_text())
result = copy.deepcopy(base)
result['revision'] = args.destination.name
args.destination.mkdir(parents=True, exist_ok=False)
preserved, changed = [], []
if args.kind == 'terrain':
    updates = {g['id']: g for g in patch['groups'][3:]}
    for index, group in enumerate(base['groups']):
        replacement = updates.get(group['id'])
        selected, folder = (replacement, args.patch) if replacement else (group, args.base)
        result['groups'][index] = selected
        for variant in selected['variants']:
            source = folder / variant['file']
            assert sha(source) == variant['sha256']
            shutil.copy2(source, args.destination / variant['file'])
        (changed if replacement else preserved).append(group['id'])
    assert set(updates) == set(changed) and len(result['groups']) == 8
else:
    for family, record in base['families'].items():
        replacement = patch['families'].get(family)
        selected, folder = (replacement, args.patch) if replacement else (record, args.base)
        result['families'][family] = selected
        for member in selected['members']:
            source = folder / member['path']
            assert sha(source) == member['sha256']
            target = args.destination / Path(member['path']).parent
            if not target.exists():
                shutil.copytree(source.parent, target)
        (changed if replacement else preserved).append(family)
    assert set(patch['families']) == set(changed) and len(result['families']) == 98
(args.destination / 'manifest.json').write_text(json.dumps(result, separators=(',', ':')) + '\n')
receipt = dict(schema='m2-2-feedback-pack-assembly-v1', kind=args.kind,
               base=dict(path=str(args.base), sha256=sha(args.base / 'manifest.json')),
               patch=dict(path=str(args.patch), sha256=sha(args.patch / 'manifest.json')),
               pack=dict(schemaVersion=1, revision=args.destination.name, sha256=sha(args.destination / 'manifest.json')),
               changed=changed, exactPreserved=preserved, policy='Complete groups/families only; prior files remain immutable')
args.receipt.write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
