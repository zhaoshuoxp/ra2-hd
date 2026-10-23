"""Preserve built-in imagegen output and its exact production reference chain."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('root', type=Path)
parser.add_argument('name')
parser.add_argument('tool_original', type=Path)
args = parser.parse_args()
root = args.root
plan = next(p for p in json.loads((root / 'generation-plan.json').read_text()) if p['name'] == args.name)
target = Path(plan['master'])
assert not target.exists() and args.tool_original.is_file()
shutil.copyfile(args.tool_original, target)
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
record = dict(name=args.name, master=dict(file=str(target), sha256=sha(target)),
              toolOriginal=str(args.tool_original), size=list(Image.open(target).size),
              prompt=dict(file=plan['prompt'], sha256=sha(plan['prompt'])),
              references=[dict(file=p, sha256=sha(p), role=plan['referenceRoles'][i]
                               if 'referenceRoles' in plan else 'EDIT_TARGET_ORIGINAL_AUTHORITY' if i == 0
                               else 'ACCEPTED_HD_DETAIL_GUIDE') for i, p in enumerate(plan['references'])])
file = root / 'generation-provenance.json'
provenance = json.loads(file.read_text()) if file.exists() else dict(
    tool='BUILT_IN_IMAGEGEN', intent='COMPLETE_AUTHORIZED_M2_1_TERRAIN_PRODUCTION',
    acceptedBase=json.loads((root / 'source.json').read_text())['acceptedBase'], entries=[])
assert not any(e['name'] == args.name for e in provenance['entries'])
provenance['entries'].append(record)
provenance['status'] = 'ALL_REQUESTED_BOARDS_GENERATED' if len(provenance['entries']) == 41 else 'IN_PROGRESS'
file.write_text(json.dumps(provenance, indent=2) + '\n')
print(json.dumps(dict(recorded=args.name, completed=len(provenance['entries']), expected=41,
                     file=str(target), sha256=record['master']['sha256'])))
