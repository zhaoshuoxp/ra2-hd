"""Retain one exact built-in output, request and source-guide identity in the project."""
import shutil
import sys
from pathlib import Path

from PIL import Image

from newurban_batch89_io import ROOT, pin, read, write

index, raw = int(sys.argv[1]), Path(sys.argv[2])
job = read(ROOT / 'imagegen-jobs-v2.json')['jobs'][index]
destination = Path(job['destination'])
assert not destination.exists() and pin(Path(job['originalReference']['file'])) == job['originalReference']
with Image.open(raw) as image:
    assert image.mode == 'RGBA' and image.getchannel('A').getextrema() == (0, 255)
    size = list(image.size)
with destination.open('xb') as stream:
    with raw.open('rb') as source:
        shutil.copyfileobj(source, stream)
write(ROOT / job['receiptFile'], dict(status='RETAINED_BUILT_IN_GENERATION_OUTPUT_NOT_RUNTIME_ACCEPTANCE',
    mode='BUILT_IN_IMAGEGEN', rawOutput=pin(raw), **pin(destination), size=size, request=job['request'],
    originalReference=job['originalReference'], members=job['members'], transparent=True))
print(job['id'])
