"""Reflow wide native poses into sixteen-cell guides; retain rejected masters."""
import copy
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image

root = Path('.artifacts/m2-4/urban-actors-authoring-batch62-v1')
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--numbers', type=int, nargs='+', default=[24, 25])
parser.add_argument('--revision', choices=['r1', 'r2'], default='r1')
args = parser.parse_args()
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
work = read(root / 'worklist.json')
jobs = read(root / 'imagegen-jobs-recordable-v1.json')['jobs']
overrides_file = root / 'slot-overrides.json'
overrides = read(overrides_file) if overrides_file.exists() else {}
retries = []
for number in args.numbers:
    parent = jobs[number - 1]
    for part, start in enumerate(range(0, len(parent['slots']), 16), 1):
        slots = parent['slots'][start:start + 16]
        stem = f'urban-actors-batch62-{number}-{args.revision}-{part}'
        board = Image.new('RGBA', (1536, 1536))
        for cell, key in enumerate(slots):
            original = Image.open(root / (key + '-native.png')).convert('RGBA')
            scale = min(336 / original.width, 336 / original.height)
            width, height = (round(n * scale) for n in original.size)
            x, y = cell % 4 * 384, cell // 4 * 384
            board.alpha_composite(original.resize((width, height), Image.Resampling.NEAREST),
                                  (x + (384 - width) // 2, y + (384 - height) // 2))
            overrides[key] = dict(board=stem + '-master.png', boardSize=[1536, 1536],
                occupied=len(slots), slotRect=[x, y, 384, 384])
        reference = root / (stem + '-reference.png')
        board.save(reference)
        job = copy.deepcopy(parent)
        job.update(id=stem, reference=str(reference.resolve()), referenceSha256=sha(reference),
            destination=str((root / (stem + '-master.png')).resolve()), slots=slots, members=slots,
            columns=4, rows=4, cellLayout=[4, 4], occupied=len(slots))
        job['prompt'] = parent['prompt'].replace('5-column by 5-row native guide, 25 occupied cells',
            f'4-column by 4-row native guide, {len(slots)} occupied cells')
        job['prompt'] += (' Keep the wider layout and all transparent gutters. Preserve each exact native pose '
            'and briefcase location; preserve source shell fragments only within their own cell. '
            'Do not substitute standing, walking or kneeling for a prone pose. Unoccupied cells stay transparent.')
        retries.append(job)
with (root / f'imagegen-jobs-wide-retries-{args.revision}.json').open('x') as stream:
    stream.write(json.dumps(dict(jobs=retries), indent=2) + '\n')
overrides_file.write_text(json.dumps(overrides, indent=2) + '\n')
print(json.dumps(dict(rejectedMothersPreserved=args.numbers, newMothers=len(retries),
    nativePoses=sum(len(j['slots']) for j in retries))))
