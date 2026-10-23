"""Measure clear row gutters without changing generated pixels or native geometry."""
import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_registration import capacity, register, sha

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('root', type=Path)
parser.add_argument('identity')
args = parser.parse_args()
root = args.root
read = lambda path: json.loads(path.read_text())
job = next(row for row in read(root / 'remake-jobs.json')['jobs'] if row['id'] == args.identity)
columns, rows = job['cellLayout']
assert columns == 1 and rows > 1, 'This measured repair supports explicit single-column row boards only'
master = Path(job['destination'])
image = Image.open(master).convert('RGBA')
clear = ~(np.asarray(image)[..., 3] > 180).any(1)
starts = np.flatnonzero(np.diff(np.pad(clear.astype(int), 1)) == 1)
ends = np.flatnonzero(np.diff(np.pad(clear.astype(int), 1)) == -1)
bands = [(int(start), int(end)) for start, end in zip(starts, ends) if end-start >= 1]
cuts = []
for row in range(1, rows):
    expected = row * image.height / rows
    band = min(bands, key=lambda pair: abs(sum(pair)/2 - expected))
    cut = sum(band)//2
    assert abs(cut-expected) < image.height / rows / 4
    cuts.append(cut)
assert len(set(cuts)) == rows-1
qa = root / (args.identity + '-qa-measured-v2.json')
subprocess.run(['python3', 'scripts/m2-4/audit-bridge-mother-cells.py', str(root / 'remake-jobs.json'),
    args.identity, str(master), str(qa), '--cuts-y', *map(str, cuts)], check=True)
layout = read(root / 'layout.json')
overrides_file = root / 'slot-overrides.json'
overrides = read(overrides_file) if overrides_file.exists() else {}
edges = [0, *cuts, image.height]
records = []
for row, member in enumerate(job['members']):
    scale = job['boardSize'][1] / image.height
    top, bottom = round(edges[row]*scale), round(edges[row+1]*scale)
    info = dict(layout[member], board=master.name, boardSize=job['boardSize'], occupied=rows,
        slotRect=[0, top, job['boardSize'][0], bottom-top], rejectFluorescentFringe=True)
    rect, _ = register(image, info, job['boardSize'])
    available = capacity(rect, info['nativeAlphaBounds'])
    assert available >= 4, f'Measured capacity insufficient: {member}: {available}'
    overrides[member] = info
    records.append(dict(member=member, capacity=available, sourceRect=rect))
receipt = dict(status='PASS_MEASURED_CLEAR_GUTTERS_AND_CAPACITY', masterSha256=sha(master),
    qaFile=str(qa), qaSha256=sha(qa), cutsY=cuts, clearBands=bands, members=records,
    registrationAlphaThreshold=180, opaqueContainmentThreshold=240,
    policy='Only authoring slot registration changes. Generated pixels and all native geometry remain unchanged.')
with (root / (args.identity + '-gutter-v2.json')).open('x') as stream:
    stream.write(json.dumps(receipt, indent=2) + '\n')
overrides_file.write_text(json.dumps(overrides, indent=2) + '\n')
print(json.dumps(receipt))
