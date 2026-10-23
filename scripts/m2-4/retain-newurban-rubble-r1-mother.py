"""Retain a built-in repaint and its exact request without changing earlier artwork."""
import hashlib
import json
import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path('.artifacts/m2-4/newurban-rubble-continuous-r1-20261020')
index, raw = int(sys.argv[1]), Path(sys.argv[2])
plan = sys.argv[3] if len(sys.argv) > 3 else 'imagegen-jobs-v1.json'
job = json.loads((ROOT / plan).read_text())['jobs'][index]
target = Path(job['destination'])
assert raw.is_file() and not target.exists()
with raw.open('rb') as source, target.open('xb') as destination:
    shutil.copyfileobj(source, destination)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(raw) == sha(target)
with Image.open(target) as image:
    size = list(image.size)
    alpha = list(image.convert('RGBA').getchannel('A').getextrema())
receipt = dict(mode='BUILT_IN_IMAGEGEN', id=job['id'], request=job['request'], rawOutput=str(raw),
    projectFile=str(target), sha256=sha(target), bytes=target.stat().st_size, actualSize=size,
    alphaExtrema=alpha, oldMaster=job['oldMaster'], originalReference=job['originalReference'],
    policy='New material repaint. Earlier files and source guides are retained unchanged.')
with (ROOT / job.get('receiptFile', job['id'] + '-output-v1.json')).open('x') as stream:
    stream.write(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(dict(file=str(target), sha256=sha(target), size=size, alphaExtrema=alpha)))
