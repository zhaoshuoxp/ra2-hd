"""Restore one retained accepted Mac package into a new, empty destination."""
import argparse
import hashlib
import json
import os
import shutil
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('audit', type=Path)
parser.add_argument('package_name', help='Original package folder basename from allowlist.json')
parser.add_argument('output', type=Path)
args = parser.parse_args()
audit, output = args.audit.resolve(), args.output.resolve()
assert not output.exists(), 'Restore to a new destination; never overwrite a current package'
allowed = json.loads((audit / 'allowlist.json').read_text())['targets']
target, = [row for row in allowed if Path(row['packageFolder']).name == args.package_name]
retention = json.loads((audit / 'retention.json').read_text())
index = audit / 'retained-files.jsonl'
assert hashlib.sha256(index.read_bytes()).hexdigest() == retention['indexSha256']
rows = [json.loads(line) for line in index.open() if json.loads(line)['packageFolder'] == target['packageFolder']]
assert rows
output.mkdir(parents=True)
count = total = 0
for row in rows:
    path = output / row['file']
    assert path.is_relative_to(output)
    path.parent.mkdir(parents=True, exist_ok=True)
    if row['kind'] == 'directory':
        path.mkdir(exist_ok=True)
        os.chmod(path, row['mode'])
    elif row['kind'] == 'symlink':
        os.symlink(row['target'], path)
    else:
        source = audit / row['retained']
        assert source.is_relative_to(audit / 'objects') and source.stat().st_size == row['bytes']
        with source.open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        assert digest == row['sha256']
        shutil.copyfile(source, path)
        os.chmod(path, row['mode'])
        with path.open('rb') as stream:
            assert hashlib.file_digest(stream, 'sha256').hexdigest() == digest
        count += 1
        total += row['bytes']
print(json.dumps(dict(status='PASS_EXACT_RETIRED_MAC_PACKAGE_RESTORED', original=target['packageFolder'],
    output=str(output), files=count, bytes=total,
    note='The original private profile may name its historical resource root. Use a new review profile and register the restored RA2-HD-Editions-Resources directory if restoring elsewhere.')))
