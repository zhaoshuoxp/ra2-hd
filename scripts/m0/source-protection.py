"""Compare the installation's read-only metadata snapshot and imported hashes."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--source', required=True, type=Path)
args = parser.parse_args()
root = args.source.resolve()
entries = []
for item in sorted(root.rglob('*')):
    stat = item.lstat()
    entries.append(dict(path=str(item.relative_to(root)), size=stat.st_size,
                        mtime_ns=stat.st_mtime_ns, mode=stat.st_mode, symlink=item.is_symlink()))
before = json.loads(Path('.artifacts/source-before.json').read_text())
Path('.artifacts/source-after.json').write_text(json.dumps(entries, indent=2) + '\n')
hashes = []
for profile in ('ra2-core', 'ra2-campaign'):
    manifest = json.loads(Path(f'.local/{profile}-manifest.json').read_text())
    for item in manifest['files']:
        source = root / item['originalName']
        digest = hashlib.file_digest(source.open('rb'), 'sha256').hexdigest()
        destination = Path(item['destination'])
        copied = hashlib.file_digest(destination.open('rb'), 'sha256').hexdigest()
        hashes.append(dict(name=item['originalName'], sha256=digest,
                           source_unchanged=digest == item['sha256'], destination_matches=copied == digest))
report = dict(metadata_unchanged=before == entries, entries=len(entries),
              regular_files=sum((e['mode'] & 0o170000) == 0o100000 for e in entries),
              hashes=hashes, parent_git_absent=not Path('../.git').exists(),
              source_git_absent=not (root / '.git').exists(), excludes_access_time=True)
Path('.artifacts/source-protection.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
assert report['metadata_unchanged'] and all(x['source_unchanged'] and x['destination_matches'] for x in hashes)
assert report['parent_git_absent'] and report['source_git_absent']
