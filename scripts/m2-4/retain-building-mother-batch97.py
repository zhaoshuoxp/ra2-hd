"""Copy a built-in generation and its exact invocation into the isolated workspace."""
import hashlib
import json
import shutil
import sys
from pathlib import Path
from PIL import Image

root = Path('.artifacts/m2-4/newurban-remaining-actors-batch97-20261021')
identity, source, arguments = sys.argv[1:]
source = Path(source)
destination = root / (identity + '-mother-v1.png')
assert not destination.exists()
shutil.copyfile(source, destination)
record = dict(mode='BUILT_IN_IMAGEGEN', request=json.loads(arguments), source=str(source),
    destination=str(destination), sha256=hashlib.sha256(destination.read_bytes()).hexdigest(),
    bytes=destination.stat().st_size, size=list(Image.open(destination).size))
with (root / (identity + '-mother-receipt-v1.json')).open('x') as stream:
    stream.write(json.dumps(record, indent=2) + '\n')
print({k: v for k, v in record.items() if k != 'request'})
