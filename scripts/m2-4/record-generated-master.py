"""Copy one builtin mother output and preserve its exact generation provenance."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('jobs', type=Path)
parser.add_argument('id')
parser.add_argument('raw', type=Path)
parser.add_argument('--prompt', type=Path)
parser.add_argument('--native-only', action='store_true')
args = parser.parse_args()
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
job = next(job for job in json.loads(args.jobs.read_text())['jobs'] if job['id'] == args.id)
reference = Path(job['reference'])
assert sha(reference) == job['referenceSha256']
if args.native_only:
    job.pop('style', None)
    job.pop('styleSha256', None)
else:
    assert sha(Path(job['style'])) == job['styleSha256']
if args.prompt:
    job['prompt'] = args.prompt.read_text()
target = Path(job['destination'])
receipt = target.with_name(job['id'] + '-imagegen.json')
assert not target.exists() and not receipt.exists()
shutil.copyfile(args.raw, target)
assert sha(args.raw) == sha(target)
job.update(tool='Builtin imagegen', rawOriginal=str(args.raw.resolve()), masterSha256=sha(target),
           size=list(Image.open(target).size), status='GENERATED; EXPORT_AND_RUNTIME_PENDING')
with receipt.open('x') as stream:
    stream.write(json.dumps(job, indent=2) + '\n')
print(json.dumps(dict(id=job['id'], size=job['size'], sha256=job['masterSha256'])))
