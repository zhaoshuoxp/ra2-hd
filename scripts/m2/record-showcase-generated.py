"""Preserve exact built-in tool originals and per-board source provenance."""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('root', type=Path)
parser.add_argument('name')
parser.add_argument('original', type=Path)
parser.add_argument('--style', type=Path, action='append', default=[])
parser.add_argument('--prompt', type=Path)
parser.add_argument('--reference', type=Path)
args = parser.parse_args()
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
target = args.root / f'{args.name}-master.png'
original_hash = sha(args.original)
if target.exists():
    assert sha(target) == original_hash, 'Existing master differs; use a fresh revision'
else:
    with target.open('xb') as stream:
        stream.write(args.original.read_bytes())
record = dict(schema='m2-2-generated-board-provenance-v1', tool='image_gen',
    original=str(args.original), master=str(target), sha256=original_hash,
    size=list(Image.open(target).size), name=args.name,
    references=[dict(file=str(path), sha256=sha(path)) for path in
                [args.reference or args.root / f'{args.name}-reference.png', *args.style]],
    prompt=dict(file=str(args.prompt or args.root / f'{args.name}-prompt.txt'),
                sha256=sha(args.prompt or args.root / f'{args.name}-prompt.txt')),
    acceptance='User-approved category direction; registered native geometry and runtime review remain required.')
receipt = args.root / f'{args.name}-provenance.json'
raw = json.dumps(record, indent=2) + '\n'
if receipt.exists():
    assert receipt.read_text() == raw, 'Immutable provenance differs'
else:
    receipt.write_text(raw)
print(json.dumps(dict(master=str(target), sha256=original_hash, size=record['size'])))
