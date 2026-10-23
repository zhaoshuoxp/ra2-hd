"""Measure nearby fully transparent atlas gutters without changing generated artwork."""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_registration import capacity, register

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('jobs', type=Path)
parser.add_argument('identity')
args = parser.parse_args()
root = args.jobs.parent
job = next(row for row in json.loads(args.jobs.read_text())['jobs'] if row['id'] == args.identity)
file = Path(job['destination'])
image = Image.open(file).convert('RGBA')
alpha = np.asarray(image)[..., 3] > 240
width, height = image.size
columns, rows = job['cellLayout']
cuts = []
for count, size, axis in [(columns, width, 0), (rows, height, 1)]:
    selected = []
    for index in range(1, count):
        center, span = round(index * size / count), round(size / count * .12)
        choices = [(int(alpha[:, cut - 1:cut + 1].sum() if axis == 0 else
                        alpha[cut - 1:cut + 1, :].sum()), abs(cut - center), cut)
                   for cut in range(max(1, center - span), min(size - 1, center + span))]
        score, _, cut = min(choices)
        assert score == 0, 'No fully transparent nearby gutter; regenerate the clipped mother'
        selected.append(cut)
    cuts.append(selected)
qa = root / (job['id'] + '-qa-v2.json')
command = [sys.executable, 'scripts/m2-4/audit-bridge-mother-cells.py', str(args.jobs),
           job['id'], str(file), str(qa)]
for label, values in zip(['--cuts-x', '--cuts-y'], cuts):
    if values:
        command += [label, *map(str, values)]
subprocess.run(command, check=True)
layout = json.loads((root / 'layout.json').read_text())
xs, ys = [0, *cuts[0], width], [0, *cuts[1], height]
overrides, records = {}, []
for index, name in enumerate(job['members']):
    x, y = index % columns, index // columns
    info = dict(layout[name], board=str(file.resolve()), boardSize=[width, height],
                occupied=len(job['members']), slotRect=[xs[x], ys[y], xs[x + 1] - xs[x], ys[y + 1] - ys[y]])
    rect, _ = register(image, info, [width, height], isolated=len(job['members']) == 1)
    actual = capacity(rect, info['nativeAlphaBounds'])
    assert actual >= 4, 'Measured gutter cannot repair insufficient authored detail'
    overrides[name] = info
    records.append(dict(member=name, sourceRect=rect, capacity=actual))
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
record = dict(status='PASS_MEASURED_TRANSPARENT_GUTTERS_AND_4X_CAPACITY', master=str(file),
              masterSha256=sha(file), qa=str(qa), qaSha256=sha(qa), cutsX=cuts[0], cutsY=cuts[1],
              members=records, overrides=overrides,
              policy='Unchanged raw pixels. Nearby two-pixel fully transparent cuts only; exact occupancy and native registration revalidated. Earlier failed equal-grid receipt retained.')
with (root / (job['id'] + '-gutter-registration-v2.json')).open('x') as stream:
    stream.write(json.dumps(record, indent=2) + '\n')
print(json.dumps(dict(id=job['id'], status=record['status'],
                      minimumCapacity=min(row['capacity'] for row in records))))
