"""Archive one signed campaign app and verify every decompressed inventory entry."""
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import zipfile

package, archive, receipt_file = map(lambda value: Path(value).resolve(), sys.argv[1:4])
receipt = json.loads((package / 'package-receipt.json').read_text())
app = Path(receipt['app'])
inventory_file = package / 'app-inventory.json'
inventory = json.loads(inventory_file.read_text())
assert app.parent == package and app.suffix == '.app'
assert not archive.exists() and not receipt_file.exists()
subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app)], check=True)
subprocess.run(['/usr/bin/ditto', '-c', '-k', '--norsrc', '--keepParent', str(app), str(archive)], check=True)
prefix = app.name + '/'
with zipfile.ZipFile(archive) as contents:
    actual = {entry.filename for entry in contents.infolist() if not entry.is_dir()}
    assert actual == {prefix + row['file'] for row in inventory}
    for row in inventory:
        entry = contents.getinfo(prefix + row['file'])
        mode = entry.external_attr >> 16
        assert stat.S_IMODE(mode) == row['mode'], row['file']
        with contents.open(entry) as stream:
            if 'link' in row:
                assert stat.S_ISLNK(mode)
                assert stream.read().decode() == row['link'] == os.readlink(app / row['file'])
            else:
                assert stat.S_ISREG(mode) and entry.file_size == row['bytes'], row['file']
                assert hashlib.file_digest(stream, 'sha256').hexdigest() == row['sha256'], row['file']
with archive.open('rb') as stream:
    archive_sha = hashlib.file_digest(stream, 'sha256').hexdigest()
with inventory_file.open('rb') as stream:
    inventory_sha = hashlib.file_digest(stream, 'sha256').hexdigest()
result = {
    'status': 'PASS_COMPLETE_MAC_ZIP_ALL_DECOMPRESSED_BYTES_MODES_SYMLINKS',
    'file': str(archive), 'app': app.name, 'bytes': archive.stat().st_size,
    'sha256': archive_sha, 'appInventorySha256': inventory_sha, 'entries': len(inventory),
    'sourceHead': receipt['sourceHead'], 'sourceDigest': receipt['sourceDigest'],
    'policy': 'Single complete app; no real user profiles, extra build directory or resource fork entries.'
}
receipt_file.parent.mkdir(parents=True, exist_ok=True)
receipt_file.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
