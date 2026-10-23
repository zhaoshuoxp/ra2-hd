"""Bind built-in output and exact request to an exclusive project-bound mother."""
import argparse
import shutil
from pathlib import Path

from PIL import Image
from newurban_batch89_io import pin, read, sha, write

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('job', type=int)
parser.add_argument('raw', type=Path)
args = parser.parse_args()
ROOT = Path('.artifacts/m2-4/newurban-anchored-buildings-batch91-20261020')
job = read(ROOT / 'imagegen-jobs-v2.json')['jobs'][args.job - 1]
destination = Path(job['destination'])
assert not destination.exists() and args.raw.is_file()
assert str(args.raw).startswith('/Users/Aone/.codex/generated_images/')
with args.raw.open('rb') as source, destination.open('xb') as target:
    shutil.copyfileobj(source, target)
assert sha(destination) == sha(args.raw)
with Image.open(destination) as image:
    image.load()
    size = list(image.size)
write(ROOT / job['receiptFile'], dict(mode='BUILT_IN_IMAGEGEN', request=job['request'],
    originalReference=job['originalReference'], rawOutput=str(args.raw), output=pin(destination),
    sha256=sha(destination), size=size, subjects=job['subjects'], destinationExclusive=True,
    native='NOT_RUN', userVisualAcceptance='PENDING'))
print(dict(job=args.job, destination=str(destination), size=size, sha256=sha(destination)))
