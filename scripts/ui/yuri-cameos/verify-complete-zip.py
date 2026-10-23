"""Verify every payload hash, executable mode and contained framework symlink in a ZIP."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import stat
import sys
import zipfile

archive = Path(sys.argv[1])
with zipfile.ZipFile(archive) as zipped:
    names = zipped.namelist()
    inventories = [name for name in names if name.endswith('/PACKAGE-INVENTORY.json') and not name.startswith('__MACOSX/')]
    assert len(inventories) == 1
    prefix = inventories[0].removesuffix('PACKAGE-INVENTORY.json')
    inventory = json.loads(zipped.read(inventories[0]))['files']
    expected = {prefix + row['file'] for row in inventory} | {inventories[0]}
    actual = {info.filename for info in zipped.infolist() if not info.is_dir() and not info.filename.startswith('__MACOSX/')}
    assert actual == expected, (actual - expected, expected - actual)
    for name in names:
        path = PurePosixPath(name)
        assert not path.is_absolute() and '..' not in path.parts
    for row in inventory:
        name = prefix + row['file']
        info = zipped.getinfo(name)
        mode = info.external_attr >> 16
        if 'link' in row:
            assert stat.S_ISLNK(mode), name
            assert zipped.read(name).decode() == row['link'], name
        else:
            assert info.file_size == row['bytes'], name
            assert mode & 0o111 == row['mode'] & 0o111, name
            digest = hashlib.sha256()
            with zipped.open(name) as stream:
                for data in iter(lambda: stream.read(1024 * 1024), b''):
                    digest.update(data)
            assert digest.hexdigest() == row['sha256'], name
    assert not any(part in {'UserData', 'Yuri-Cameos-Review-Profile', 'resource-registration.json', 'Cookies', 'Cache', '.DS_Store'}
                   for name in actual for part in PurePosixPath(name).parts)
digest = hashlib.sha256()
with archive.open('rb') as stream:
    for data in iter(lambda: stream.read(1024 * 1024), b''):
        digest.update(data)
result = dict(status='PASS_COMPLETE_ZIP_HASHES_MODES_SYMLINKS_NO_PROFILES', zip=str(archive),
              zipBytes=archive.stat().st_size, zipSha256=digest.hexdigest(), inventoryEntries=len(inventory))
if len(sys.argv) > 2:
    Path(sys.argv[2]).write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
