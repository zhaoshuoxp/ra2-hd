"""Check generated bridge subjects for canvas or cell-boundary clipping."""
import argparse
import hashlib
import json
import re
from pathlib import Path
import numpy as np
from PIL import Image


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('jobs', type=Path)
parser.add_argument('id')
parser.add_argument('raw', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--cuts-y', type=int, nargs='+',
                    help='Explicit raw-pixel row boundaries for a measured transparent gutter')
parser.add_argument('--cuts-x', type=int, nargs='+',
                    help='Explicit raw-pixel column boundaries for a measured transparent gutter')
parser.add_argument('--opaque-threshold', type=int, default=240)
args = parser.parse_args()
job = next(row for row in json.loads(args.jobs.read_text())['jobs'] if row['id'] == args.id)
image = Image.open(args.raw).convert('RGBA')
assert 0 <= args.opaque_threshold <= 240
alpha = np.asarray(image)[:, :, 3] > args.opaque_threshold
width, height = image.size
match = re.search(r'-(\d+)x(\d+)-', args.id)
if 'cellLayout' in job:
    columns, rows = job['cellLayout']
elif len(job['members']) > 1:
    assert match, 'Multi-cell jobs require explicit cellLayout or a grid in their identifier'
    columns, rows = map(int, match.groups())
else:
    columns, rows = 1, 1
assert columns > 0 and rows > 0
assert len(job['members']) <= columns * rows
cuts_x = [round(index * width / columns) for index in range(1, columns)]
cuts_y = [round(index * height / rows) for index in range(1, rows)]
if args.cuts_x is not None:
    assert len(args.cuts_x) == columns - 1
    assert args.cuts_x == sorted(set(args.cuts_x))
    assert all(0 < cut < width for cut in args.cuts_x)
    cuts_x = args.cuts_x
if args.cuts_y is not None:
    assert len(args.cuts_y) == rows - 1
    assert args.cuts_y == sorted(set(args.cuts_y))
    assert all(0 < cut < height for cut in args.cuts_y)
    cuts_y = args.cuts_y
x_edges, y_edges = [0, *cuts_x, width], [0, *cuts_y, height]
edge_pixels = int(alpha[:, [0, width - 1]].sum() + alpha[[0, height - 1], :].sum())
boundary_pixels = int(sum(alpha[:, [cut - 1, cut]].sum() for cut in cuts_x) +
                      sum(alpha[[cut - 1, cut], :].sum() for cut in cuts_y))
cells = []
for index in range(columns * rows):
    column, row = index % columns, index // columns
    left, right = x_edges[column:column + 2]
    top, bottom = y_edges[row:row + 2]
    y, x = np.where(alpha[top:bottom, left:right])
    cells.append(dict(index=index, occupied=bool(len(x)), bounds=[int(x.min() + left),
        int(y.min() + top), int(x.max() + left + 1), int(y.max() + top + 1)] if len(x) else None))
passed = not edge_pixels and not boundary_pixels and all(
    cell['occupied'] == (cell['index'] < len(job['members'])) for cell in cells)
receipt = dict(schema='m2-4-bridge-mother-cell-audit-v1', status='PASS' if passed else 'REJECT_CLIPPING_OR_LAYOUT',
    id=args.id, raw=str(args.raw), rawSha256=hashlib.sha256(args.raw.read_bytes()).hexdigest(),
    size=[width, height], cellLayout=[columns, rows], opaqueThreshold=args.opaque_threshold,
    cutsX=cuts_x, cutsY=cuts_y,
    edgePixels=edge_pixels, boundaryPixels=boundary_pixels,
    cells=cells, policy='Input inspection only. Native export masks and reference capacity are verified separately.')
with args.output.open('x') as stream:
    stream.write(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(dict(id=args.id, status=receipt['status'], edgePixels=edge_pixels, boundaryPixels=boundary_pixels)))
raise SystemExit(0 if passed else 1)
