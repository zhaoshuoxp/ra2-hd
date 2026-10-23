"""Retain M2.4 authoring sources and compact records before retiring derived task copies."""
import argparse
import gzip
import hashlib
import json
import os
import re
import shutil
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
task = root.parent / 'ra2-hd-m2-4-theaters'
output = args.output.resolve()
output.mkdir(parents=True, exist_ok=False)
origins = [('main', root, root / '.artifacts/m2-4'), ('task', task, task / '.artifacts'),
    ('main', root, root / '.local/source-art/m2-4-result-banners-v1')]
records = {'.json', '.jsonl', '.md', '.txt', '.log', '.csv', '.ini', '.yaml', '.yml'}
native_guides = {'.tmp', '.tem', '.sno', '.urb', '.ubn', '.des', '.shp', '.pal'}
images = {'.png', '.jpg', '.jpeg', '.webp'}
source_marker = re.compile(r'author|master|mother|imagegen|prompt|provenance|material.profile|worklist|source.preparation', re.I)
excluded = {'node_modules', 'Default', 'Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache',
    'RA2-HD-Editions-Resources', 'RA2-HD-UI-Resources', 'M2.4-Review-Profile', 'Review-Profile'}
rows, references, captured = [], set(), set()
totals = {'sourceBytes': 0, 'objectBytes': 0, 'records': 0, 'masters': 0, 'nativeGuides': 0}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def capture(origin, project, file, kind):
    identity = (origin, str(file.relative_to(project)))
    if identity in captured:
        return
    assert file.is_file() and not file.is_symlink()
    data = file.read_bytes()
    checksum = digest(data)
    compressed = kind != 'masters'
    relative = Path('Objects') / checksum[:2] / (checksum + ('.gz' if compressed else file.suffix.lower()))
    target = output / relative
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        if compressed:
            target.write_bytes(gzip.compress(data, compresslevel=6, mtime=0))
        else:
            shutil.copyfile(file, target)
        totals['objectBytes'] += target.stat().st_size
    stored = gzip.decompress(target.read_bytes()) if compressed else target.read_bytes()
    assert digest(stored) == checksum and len(stored) == len(data)
    rows.append(dict(origin=origin, file=identity[1], kind=kind, bytes=len(data), sha256=checksum,
        retained=str(relative), compression='gzip' if compressed else 'none'))
    captured.add(identity)
    totals[kind] += 1
    totals['sourceBytes'] += len(data)
    if kind == 'records' and file.suffix.lower() == '.json' and source_marker.search(str(file.relative_to(project))):
        for match in re.finditer(r'"[^"\n]*\.(?:png|jpe?g|webp)"', data.decode('utf8', errors='ignore'), re.I):
            try:
                value = json.loads(match[0])
            except json.JSONDecodeError:
                continue
            path = Path(value)
            for candidate in ([path] if path.is_absolute() else [project / path, file.parent / path]):
                if candidate.is_file() and not candidate.is_symlink() and candidate.resolve().is_relative_to(project):
                    references.add((origin, project, candidate.resolve()))
                    break
    if len(rows) % 2000 == 0:
        print(json.dumps(dict(phase='RETAIN_AND_VERIFY_SOURCE_OBJECTS', files=len(rows), **totals)), flush=True)


for origin, project, base in origins:
    if not base.exists():
        continue
    for folder, directories, files in os.walk(base, followlinks=False):
        directories[:] = [name for name in directories if name not in excluded and not name.endswith('.app')
            and not name.startswith(('profile-', 'build-', 'build_', 'node_modules'))]
        for name in sorted(files):
            file = Path(folder) / name
            if file.is_symlink():
                continue
            suffix = file.suffix.lower()
            relative = str(file.relative_to(project))
            if suffix in records:
                capture(origin, project, file, 'records')
            elif suffix in native_guides:
                capture(origin, project, file, 'nativeGuides')
            elif suffix in images and (source_marker.search(relative) or '.local/source-art/' in relative):
                capture(origin, project, file, 'masters')

for origin, project, file in sorted(references, key=lambda item: (item[0], str(item[2]))):
    capture(origin, project, file, 'masters')
index = output / 'Source-Index.jsonl'
with index.open('x') as stream:
    for row in sorted(rows, key=lambda value: (value['origin'], value['file'])):
        stream.write(json.dumps(row) + '\n')
receipt = dict(schema='m2-4-compact-authoring-provenance-v1', status='PASS_ALL_RETAINED_SOURCE_OBJECTS_DECODED_AND_HASH_VERIFIED',
    sourceRoots={'main': str(root), 'task': str(task)}, sourceIndex='Source-Index.jsonl',
    sourceIndexSha256=digest(index.read_bytes()), fileCount=len(rows), **totals,
    policy='Retain authoring masters/references, extracted native guides and compressed final/failed records. '
        'Derived game packages, world exports, prepared copies, browser caches and full native capture matrices are not recovery archives.',
    runtimeArt='The complete active layer remains in canonical main and the independent final Mac delivery.',
    sourceGitHistory='Retained in main; integrated task branch retirement does not delete reachable commits.',
    originalSourcesModified=False, cleanupPerformed=False)
(output / 'Retention-Receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt), flush=True)
