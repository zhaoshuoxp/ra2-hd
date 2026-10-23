"""Preserve one builtin terrain mother and check cell containment and true capacity."""
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
job = next(row for row in json.loads(args.jobs.read_text())['jobs'] if row['id'] == args.identity)
root = args.jobs.parent
reference, destination = Path(job['reference']), Path(job['destination'])
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
assert sha(reference) == job['referenceSha256']
for supporting in job.get('supportingReferences', []):
    assert sha(Path(supporting['file'])) == supporting['sha256']
assert args.raw.is_file() and not destination.exists()
assert destination.parent == root.resolve()
shutil.copyfile(args.raw, destination)
image = Image.open(destination).convert('RGBA')
receipt = dict(job, tool='Builtin imagegen', rawOriginal=str(args.raw.resolve()),
               masterSha256=sha(destination), size=list(image.size), status='GENERATED_EXPORT_AND_RUNTIME_PENDING')
with (root / (job['id'] + '-imagegen.json')).open('x') as stream:
    stream.write(json.dumps(receipt, indent=2) + '\n')
qa_file = root / (job['id'] + '-qa-v1.json')
result = subprocess.run([sys.executable, 'scripts/m2-4/audit-bridge-mother-cells.py', str(args.jobs),
                         job['id'], str(destination), str(qa_file)], check=False)
layout = json.loads((root / 'layout.json').read_text())
rows = []
for name in job['members']:
    rect, _ = register(image, layout[name], job['boardSize'], isolated=len(job['members']) == 1)
    rows.append(dict(member=name, rect=rect, capacity=capacity(rect, layout[name]['nativeAlphaBounds'])))
passed = result.returncode == 0 and all(row['capacity'] >= 4 for row in rows)
record = dict(status='PASS' if passed else 'REJECT_CELL_OR_CAPACITY', masterSha256=sha(destination),
              qaFile=str(qa_file), qaSha256=sha(qa_file), members=rows,
              boundary='Capacity and cell containment only; visual direction and actual export remain separate.')
with (root / (job['id'] + '-capacity-v1.json')).open('x') as stream:
    stream.write(json.dumps(record, indent=2) + '\n')
print(json.dumps(dict(id=job['id'], status=record['status'],
                      minimumCapacity=min(row['capacity'] for row in rows))))
raise SystemExit(0 if passed else 1)
