"""Copy complete authored civilian inputs and original native state dependencies."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('root', type=Path)
parser.add_argument('--prepared', type=Path, required=True)
parser.add_argument('--authoring', nargs='+', type=Path, required=True)
parser.add_argument('--candidate-packs', nargs='+', type=Path, required=True)
args = parser.parse_args()
root = args.root.resolve()
assert (root / 'package-receipt.json').is_file()
rows, relocations = [], {}


def copy(source, relative):
    target = root / relative
    assert source.is_file() and target.is_relative_to(root) and not target.exists()
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    assert sha(source) == sha(target)
    rows.append(dict(source=str(source.resolve()), file=relative,
        bytes=target.stat().st_size, sha256=sha(target)))
    relocations[str(source.resolve())] = relative


for folder in args.authoring:
    for file in sorted(folder.rglob('*')):
        if file.is_file():
            copy(file, 'Authoring/' + folder.name + '/' + str(file.relative_to(folder)))
for folder in args.candidate_packs:
    for file in sorted(folder.rglob('*')):
        if file.is_file():
            copy(file, 'Authoring/Candidate-Packs/' + folder.name + '/' + str(file.relative_to(folder)))
source = read(args.prepared / 'source.json')
native = set()
for member in source['sources']:
    native.add(member['nativeFile'])
    native.add(member['palette']['sha256'] + '.pal')
    assert sha(args.prepared / 'native' / member['nativeFile']) == member['sha256']
    for frame in member['frames']:
        native.update([frame['file'], frame['indexFile']])
        assert sha(args.prepared / 'native' / frame['file']) == frame['rgbaSha256']
        assert sha(args.prepared / 'native' / frame['indexFile']) == frame['indexSha256']
native.add('9f411f95251d7e62fbdef34b37a9b8361ea15941621a88010d4e2c06486e67aa.pal')
for name in sorted(native):
    copy(args.prepared / 'native' / name, 'Native-Civilian-Buildings/' + name)
copy(args.prepared / 'source.json', 'Native-Civilian-Buildings/source.json')
copy(Path('desktop/environment-snow-hd-contract.json'), 'Authoring/selected-contract.json')
manifest = dict(schema='m2-4-source-pinned-snow-civilian-building-handoff-v1', files=rows,
    policy='All selected mothers, prompts, original/native guides, failed attempts, complete candidate exports, original state bytes and runtime palettes are retained independently. Original indices, maps, archives and previous deliveries are unchanged.')
with (root / 'batch20-artwork-source-handoff.json').open('x') as stream:
    json.dump(manifest, stream, indent=2)
    stream.write('\n')
with (root / 'batch20-source-relocations.json').open('x') as stream:
    json.dump(dict(schema='m2-4-independent-source-relocations-v1', paths=relocations), stream, indent=2)
    stream.write('\n')
print(json.dumps(dict(newSourceFiles=len(rows), bytes=sum(row['bytes'] for row in rows))))
