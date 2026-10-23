"""Restore one indexed authoring source or compact record to an explicit new file."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('index', type=Path)
parser.add_argument('origin', choices=['main', 'task'])
parser.add_argument('file')
parser.add_argument('destination', type=Path)
args = parser.parse_args()
row = next(value for value in map(json.loads, args.index.read_text().splitlines())
    if value['origin'] == args.origin and value['file'] == args.file)
source = (args.index.parent / row['retained']).resolve()
assert source.is_relative_to(args.index.parent.resolve())
data = source.read_bytes()
if row['compression'] == 'gzip':
    data = gzip.decompress(data)
assert len(data) == row['bytes'] and hashlib.sha256(data).hexdigest() == row['sha256']
args.destination.parent.mkdir(parents=True, exist_ok=True)
with args.destination.open('xb') as stream:
    stream.write(data)
print(json.dumps(dict(status='RESTORED_ONE_HASH_VERIFIED_SOURCE', destination=str(args.destination), sha256=row['sha256'])))
