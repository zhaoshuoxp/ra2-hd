"""Preserve a builtin SHP mother and verify every occupied slot before export."""
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_registration import capacity, register

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('jobs', type=Path)
parser.add_argument('identity')
parser.add_argument('raw', type=Path)
args = parser.parse_args()
root = args.jobs.parent
jobs = json.loads(args.jobs.read_text())
job = next(row for row in jobs['jobs'] if row['id'] == args.identity)
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
work_file = root / 'worklist.json'
assert sha(work_file) == jobs['worklistSha256']
work = json.loads(work_file.read_text())
assert sha(Path(job['reference'])) == job['referenceSha256']
destination = Path(job['destination'])
assert destination.parent == root.resolve() and not destination.exists()
shutil.copyfile(args.raw, destination)
image = Image.open(destination).convert('RGBA')
receipt = dict(job, tool='Builtin imagegen', rawOriginal=str(args.raw.resolve()),
    masterSha256=sha(destination), size=list(image.size), status='GENERATED_EXPORT_AND_RUNTIME_PENDING')
with (root / (job['id'] + '-imagegen.json')).open('x') as stream:
    stream.write(json.dumps(receipt, indent=2) + '\n')
qa_file = root / (job['id'] + '-qa-v1.json')
result = subprocess.run([sys.executable, 'scripts/m2-4/audit-bridge-mother-cells.py',
    str(args.jobs), job['id'], str(destination), str(qa_file)], check=False)
slots = []
for key in job['members']:
    info = work['slots'][key]
    rect, _ = register(image, info, job['boardSize'], isolated=len(job['members']) == 1)
    slots.append(dict(key=key, rect=rect, capacity=capacity(rect, info['nativeBounds'])))
passed = result.returncode == 0 and all(row['capacity'] >= 4 for row in slots)
record = dict(status='PASS' if passed else 'REJECT_CELL_OR_CAPACITY', masterSha256=sha(destination),
    qaFile=str(qa_file), qaSha256=sha(qa_file), slots=slots,
    boundary='Cell containment and actual detail capacity only; visual, export and runtime remain separate.')
with (root / (job['id'] + '-capacity-v1.json')).open('x') as stream:
    stream.write(json.dumps(record, indent=2) + '\n')
print(json.dumps(dict(id=job['id'], status=record['status'], minimumCapacity=min(row['capacity'] for row in slots))))
raise SystemExit(0 if passed else 1)
