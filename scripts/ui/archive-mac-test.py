"""Archive and verify every byte, executable bit and symlink of a tested Mac folder."""
from pathlib import Path
import hashlib
import json
import stat
import subprocess
import sys
import zipfile

out = Path(sys.argv[1]).resolve()
receipt = json.loads((out / 'package-receipt.json').read_text())
runtime = json.loads((out / 'runtime/result.json').read_text())
assert runtime['status'] == 'PASS_PACKAGED_MAC_START_GAME_HD_SWITCH_RESTART'
folder = Path(receipt['folder'])
archive = out / (folder.name + '.zip')
assert not archive.exists()
subprocess.run(['/usr/bin/ditto', '-c', '-k', '--sequesterRsrc', '--keepParent', str(folder), str(archive)], check=True)
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    for row in receipt['files']:
        item = z.getinfo(folder.name + '/' + row['file'])
        with z.open(item) as stream:
            if 'link' in row:
                assert stat.S_ISLNK(item.external_attr >> 16)
                assert stream.read().decode() == row['link']
            else:
                assert hashlib.file_digest(stream, 'sha256').hexdigest() == row['sha256']
    app = Path(receipt['app']).name
    for executable in ['Contents/MacOS/RA2 HD UI', 'Contents/Resources/app/desktop/restore-cursor']:
        assert z.getinfo(f'{folder.name}/{app}/{executable}').external_attr >> 16 & stat.S_IXUSR
    assert not any('/profile/' in name or '/UserData/' in name for name in z.namelist())
with archive.open('rb') as stream:
    digest = hashlib.file_digest(stream, 'sha256').hexdigest()
report = dict(status='PASS_MAC_ARCHIVE', archive=str(archive), bytes=archive.stat().st_size,
              sha256=digest, checkedEntries=len(receipt['files']), resourceFiles=receipt['resourceFiles'],
              runtime=runtime['status'], uiRevision=receipt['uiRevision'])
(out / 'archive-receipt.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
