"""Copy complete authoring inputs and named evidence with independent hash checks."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('delivery', type=Path)
parser.add_argument('--authoring', type=Path, required=True)
parser.add_argument('--prepared', type=Path, required=True)
parser.add_argument('--additional-authoring', type=Path, nargs='*', default=[])
parser.add_argument('--additional-prepared', type=Path, nargs='*', default=[])
parser.add_argument('--evidence', type=Path, nargs='+', required=True)
parser.add_argument('--batch', type=int, required=True)
parser.add_argument('--include-generation-references', action='store_true')
args = parser.parse_args()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
rows = []


def copy(source, relative):
    target = args.delivery / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        assert sha(target) == sha(source), f'Conflicting handoff file: {target}'
    else:
        shutil.copyfile(source, target)
    assert sha(source) == sha(target)
    rows.append(dict(source=str(source.resolve()), file=str(relative),
                     bytes=target.stat().st_size, sha256=sha(target)))


for folder in [args.authoring, *args.additional_authoring]:
    for source in sorted(folder.rglob('*')):
        if source.is_file():
            copy(source, Path('Authoring') / folder.name / source.relative_to(folder))
for folder in [args.prepared, *args.additional_prepared]:
    copy(folder / 'source.json', Path('Authoring') / folder.name / 'source.json')
    prepared = json.loads((folder / 'source.json').read_text())
    native_paths = set()
    for source in prepared['sources']:
        native_paths.add(source['nativeFile'])
        assert sha(folder / 'native' / source['nativeFile']) == source['sha256']
        for image in source.get('images', source.get('frames', [])):
            native_paths.add(image['file'])
            assert sha(folder / 'native' / image['file']) == image['rgbaSha256']
            if image.get('indexFile'):
                native_paths.add(image['indexFile'])
                assert sha(folder / 'native' / image['indexFile']) == image['indexSha256']
    for relative in sorted(native_paths):
        copy(folder / 'native' / relative, Path('Authoring') / folder.name / 'native' / relative)
    assert len(native_paths) == prepared['verifiedNativeFiles']
    for palette_sha in sorted({source['palette']['sha256'] for source in prepared['sources']
                               if source.get('palette')}):
        relative = palette_sha + '.pal'
        assert sha(folder / 'native' / relative) == palette_sha
        copy(folder / 'native' / relative, Path('Authoring') / folder.name / 'native' / relative)
if args.include_generation_references:
    provided = {row['sha256']: row['file'] for row in rows}
    references = []
    for row in list(rows):
        if not row['file'].endswith('-imagegen.json'):
            continue
        generation = json.loads((args.delivery / row['file']).read_text())
        if generation.get('tool') != 'Builtin imagegen':
            continue
        for role in ('reference', 'style'):
            if not generation.get(role):
                continue
            original = Path(generation[role])
            digest = generation[role + 'Sha256']
            assert original.resolve().is_relative_to(Path.cwd().parent), 'Reference outside project workspace'
            assert sha(original) == digest
            relative = provided.get(digest)
            if relative is None:
                relative = str(Path('Authoring/Referenced-Generation-Inputs') / (digest + '-' + original.name))
                copy(original, Path(relative))
                provided[digest] = relative
            references.append(dict(receipt=row['file'], role=role, original=str(original),
                                   sha256=digest, provided=relative))
    metadata = Path('Authoring/generation-reference-relocation.json')
    target = args.delivery / metadata
    with target.open('x') as stream:
        stream.write(json.dumps(dict(status='PASS_ALL_GENERATION_REFERENCES_PROVIDED', references=references), indent=2) + '\n')
    rows.append(dict(source=str(target.resolve()), file=str(metadata), bytes=target.stat().st_size, sha256=sha(target)))
artifact_root = Path('.artifacts/m2-4')
for source in args.evidence:
    copy(source, Path('Evidence') / source.relative_to(artifact_root))
manifest = dict(schema=f'm2-4-snow-batch{args.batch}-source-handoff-v1', files=rows,
    notes=['Copied source inputs are independent files; provenance paths identify the original workspace.',
           'Rejected masters and receipts are retained. Existing inherited art remains in runtime resources.'])
with (args.delivery / 'artwork-source-handoff.json').open('x') as stream:
    stream.write(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(dict(files=len(rows), bytes=sum(row['bytes'] for row in rows),
                     sha256=sha(args.delivery / 'artwork-source-handoff.json'))))
