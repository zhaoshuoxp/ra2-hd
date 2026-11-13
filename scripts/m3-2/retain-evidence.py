"""Retain compact M3.2 evidence before retiring task-owned rebuildable output."""
from pathlib import Path
import gzip
import hashlib
import json

root = Path(__file__).resolve().parents[2]
source = root / '.artifacts/m3-2'
output = root.parent / 'project-history/m3-2-first-batch-20261025/Evidence'
if not source.is_dir():
    raise SystemExit('Task artifacts are absent; preserve the existing retained evidence index.')
objects = output / 'objects'
objects.mkdir(parents=True, exist_ok=True)
rows = []
named = {
    'report.json', 'summary.json', 'checkpoint.json', 'extracted.json',
    'applied-command-journal.json', 'commit-scope.json', 'vlad-density-repair.json',
    'M3.2-Review.json', 'frozen-receipt.json', 'main-receipt.json',
    'resource-plan.json', 'soviet01-victory-commands.json',
}
for file in sorted(source.rglob('*')):
    if not file.is_file() or file.is_symlink():
        continue
    relative = file.relative_to(source)
    if 'package-setup-failure' in relative.parts or file.name == 'retention.log':
        continue
    if relative.parts[0] == 'zip-extracted' and relative != Path('zip-extracted/extracted.json'):
        continue
    if 'profile' in relative.parts and file.name not in {'game-error-latest.json', 'resource-registration.json'}:
        continue
    pose = relative.parts[0] in {'native-art-r2-2x', 'native-art-r2-4x'} and file.suffix == '.png'
    if not (pose or file.suffix in {'.log', '.txt'} or file.name in named
            or file.name in {'game-error-latest.json', 'resource-registration.json'}):
        continue
    data = file.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    name = digest + ('.png' if pose else '.gz')
    target = objects / name
    if not target.exists():
        target.write_bytes(data if pose else gzip.compress(data, compresslevel=9, mtime=0))
    restored = target.read_bytes() if pose else gzip.decompress(target.read_bytes())
    assert hashlib.sha256(restored).hexdigest() == digest
    rows.append(dict(file=str(relative), bytes=len(data), sha256=digest, object='objects/' + name,
                     encoding='identity' if pose else 'gzip', storedBytes=target.stat().st_size))
for name in ['package-receipt.json', 'source.json', 'copied-files.json', 'selected-resources.json']:
    file = root.parent / 'RA2-HD-M3.2-Mac' / name
    data = file.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    name = digest + '.gz'
    target = objects / name
    if not target.exists():
        target.write_bytes(gzip.compress(data, compresslevel=9, mtime=0))
    assert hashlib.sha256(gzip.decompress(target.read_bytes())).hexdigest() == digest
    rows.append(dict(file='delivery/' + file.name, bytes=len(data), sha256=digest, object='objects/' + name,
                     encoding='gzip', storedBytes=target.stat().st_size))
manifest = dict(status='PASS_COMPACT_RAW_EVIDENCE_HASHES', source=str(source), files=rows,
                records=len(rows), uniqueObjects=len({row['object'] for row in rows}),
                storedBytes=sum((output / name).stat().st_size for name in {row['object'] for row in rows}))
(output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({key: value for key, value in manifest.items() if key != 'files'}))
