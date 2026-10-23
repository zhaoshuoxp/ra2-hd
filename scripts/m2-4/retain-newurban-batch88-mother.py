"""Retain an exact built-in mother request and project copy for batch 88."""
import hashlib
import json
import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path('.artifacts/m2-4/newurban-buildings-batch88-20261020')
index, raw = int(sys.argv[1]), Path(sys.argv[2])
plan = sys.argv[3] if len(sys.argv) > 3 else 'imagegen-jobs-v1.json'
job = json.loads((ROOT / plan).read_text())['jobs'][index]
target = Path(job['destination'])
with raw.open('rb') as source, target.open('xb') as destination:
    shutil.copyfileobj(source, destination)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(raw) == sha(target)
with Image.open(target) as image:
    size, alpha = list(image.size), list(image.convert('RGBA').getchannel('A').getextrema())
receipt = dict(mode='BUILT_IN_IMAGEGEN', id=job['id'], request=job['request'],
    rawOutput=str(raw), projectFile=str(target), sha256=sha(target), bytes=target.stat().st_size,
    actualSize=size, alphaExtrema=alpha, originalReference=job['originalReference'])
with (ROOT / job['receiptFile']).open('x') as stream:
    stream.write(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(dict(file=str(target), sha256=sha(target), size=size, alphaExtrema=alpha)))
