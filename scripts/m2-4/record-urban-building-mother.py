"""Retain a built-in mother and audit actual cell capacity before any export."""
import argparse
import hashlib
import json
import shutil
import sys
import re
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_registration import capacity, register

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('root', type=Path)
parser.add_argument('jobs', type=Path)
parser.add_argument('number', type=int)
parser.add_argument('raw', type=Path)
parser.add_argument('--receipt-tag', default='', help='Retain retries without replacing an earlier numbered receipt')
args = parser.parse_args()
assert not args.receipt_tag or re.fullmatch(r'[a-z0-9-]+', args.receipt_tag)
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
job = read(args.jobs)['jobs'][args.number - 1]
work = read(args.root / 'worklist.json')
override_file = args.root / 'slot-overrides.json'
overrides = read(override_file) if override_file.exists() else {}
assert sha(Path(job['reference'])) == job['referenceSha256']
master = Path(job['destination'])
assert not master.exists() and args.raw.is_file()
shutil.copyfile(args.raw, master)
image = Image.open(master).convert('RGBA')
alpha = np.array(image)[:, :, 3] > 240
width, height = image.size
columns, rows = job['cellLayout']
cut_x = [round(i * width / columns) for i in range(1, columns)]
cut_y = ([round(job['rowBoundary'] * height / job['boardSize'][1])] if 'rowBoundary' in job
         else [round(i * height / rows) for i in range(1, rows)])
edge = int(alpha[:, [0, width - 1]].sum() + alpha[[0, height - 1], :].sum())
boundary = int(sum(alpha[:, [x - 1, x]].sum() for x in cut_x)
               + sum(alpha[[y - 1, y], :].sum() for y in cut_y))
slots = []
for key in job['slots']:
    info = {**work['slots'][key], **overrides.get(key, {})}
    rect, _ = register(image, info, job['boardSize'])
    slots.append(dict(key=key, rect=rect, capacity=capacity(rect, info['nativeBounds'])))
passed = edge == boundary == 0 and min(s['capacity'] for s in slots) >= 4
receipt = dict(tool='built-in image_gen', status='PASS' if passed else 'REWORK_REQUIRED',
    rawFile=str(args.raw), rawSha256=sha(args.raw), workspaceFile=str(master), workspaceSha256=sha(master),
    jobId=job['id'], jobsFile=str(args.jobs), jobsSha256=sha(args.jobs), prompt=job['prompt'],
    referenceSha256=job['referenceSha256'], actualSize=[width, height], slots=slots,
    opaqueOuterEdgePixels=edge, opaqueCellBoundaryPixels=boundary,
    policy='Input inspection only; no interpolation, raster repair or native/selected resource changes')
tag = '-' + args.receipt_tag if args.receipt_tag else ''
file = args.root / f'imagegen-receipt-{args.number:02d}{tag}.json'
with file.open('x') as stream:
    stream.write(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(dict(number=args.number, status=receipt['status'], size=image.size,
    minimumDensity=min(s['capacity'] for s in slots), edge=edge, boundary=boundary)))
raise SystemExit(0 if passed else 1)
