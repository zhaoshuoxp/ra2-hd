"""Archive a selected review folder without metadata, preserving every file and link."""
import hashlib
import json
import os
import stat
import subprocess
import sys
import zipfile
from pathlib import Path

out = Path(sys.argv[1]).resolve()
receipt = json.loads((out / 'package-receipt.json').read_text())
folder = Path(receipt['folder'])
archive = out / (folder.name + '-macOS-arm64.zip')
assert not archive.exists()
assert not any((folder / name).exists() for name in ['Yuri-Review-Profile', 'UserData', 'Review-Profile'])
subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', receipt['app']], check=True)
subprocess.run(['/usr/bin/ditto', '-c', '-k', '--norsrc', '--noextattr', '--noqtn', '--keepParent',
                str(folder), str(archive)], check=True)
checked = 0
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert not any(name.startswith('__MACOSX/') for name in z.namelist())
    assert not any('/Yuri-Review-Profile/' in name or '/UserData/' in name for name in z.namelist())
    for directory, dirs, files in os.walk(folder, followlinks=False):
        paths = [Path(directory) / name for name in files]
        paths += [Path(directory) / name for name in dirs if (Path(directory) / name).is_symlink()]
        for file in paths:
            entry = z.getinfo(folder.name + '/' + file.relative_to(folder).as_posix())
            mode = entry.external_attr >> 16
            with z.open(entry) as stream:
                if file.is_symlink():
                    assert stat.S_ISLNK(mode) and stream.read().decode() == os.readlink(file)
                else:
                    with file.open('rb') as source:
                        assert hashlib.file_digest(source, 'sha256').digest() == hashlib.file_digest(stream, 'sha256').digest(), file
                    assert bool(mode & stat.S_IXUSR) == bool(file.stat().st_mode & stat.S_IXUSR), file
            checked += 1
with archive.open('rb') as source:
    digest = hashlib.file_digest(source, 'sha256').hexdigest()
result = {'status': 'PASS_ARCHIVE_BYTES_LINKS_MODES_NO_PROFILES', 'archive': str(archive),
          'sha256': digest, 'bytes': archive.stat().st_size, 'checkedFiles': checked,
          'resourceFiles': receipt['resourceFiles'], 'runtimeSourceHead': receipt['runtimeSourceHead'],
          'extendedAttributes': False, 'resourceForks': False}
(out / 'archive-receipt.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
