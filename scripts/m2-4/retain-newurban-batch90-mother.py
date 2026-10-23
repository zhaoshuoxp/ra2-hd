"""Retain one exact built-in rock/crate output and its palette-pinned request."""
import shutil
import sys
from pathlib import Path

from PIL import Image
from newurban_batch89_io import pin, read, write

ROOT = Path('.artifacts/m2-4/newurban-rock-crates-batch90-20261020')
index, raw = int(sys.argv[1]), Path(sys.argv[2])
job = read(ROOT / 'imagegen-jobs-v2.json')['jobs'][index]
destination = Path(job['destination'])
assert not destination.exists() and pin(Path(job['originalReference']['file'])) == job['originalReference']
with Image.open(raw) as image:
    assert image.mode == 'RGBA' and image.getchannel('A').getextrema() == (0, 255)
    size = list(image.size)
with destination.open('xb') as target:
    with raw.open('rb') as source:
        shutil.copyfileobj(source, target)
write(ROOT / job['receiptFile'], dict(status='RETAINED_BUILT_IN_OUTPUT_NOT_RUNTIME_ACCEPTANCE',
    mode='BUILT_IN_IMAGEGEN', rawOutput=pin(raw), **pin(destination), size=size, request=job['request'],
    originalReference=job['originalReference'], members=job['members'], transparent=True))
print(job['id'])
