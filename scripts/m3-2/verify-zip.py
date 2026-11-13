"""Extract the final single-app ZIP and verify its bytes, links, modes and signature."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import zipfile

receipt_file, inventory_file, output = map(Path, sys.argv[1:4])
receipt = json.loads(receipt_file.read_text())
sha = lambda file: hashlib.file_digest(file.open('rb'), 'sha256').hexdigest()
assert receipt['status'] == 'PASS_COMPLETE_MAC_ZIP_ALL_DECOMPRESSED_BYTES_MODES_SYMLINKS'
assert sha(Path(receipt['file'])) == receipt['sha256']
assert sha(inventory_file) == receipt['appInventorySha256']
rows = json.loads(inventory_file.read_text())
output = output.resolve(); output.mkdir(parents=True, exist_ok=False)
app = output / receipt['app']; app.mkdir()
prefix = receipt['app'] + '/'
with zipfile.ZipFile(receipt['file']) as archive:
    for info in archive.infolist():
        assert info.filename.startswith(prefix) and '..' not in Path(info.filename).parts
        if info.is_dir():
            target = output / info.filename
            target.mkdir(parents=True, exist_ok=True); target.chmod(stat.S_IMODE(info.external_attr >> 16))
    for row in rows:
        relative = Path(row['file']); assert not relative.is_absolute() and '..' not in relative.parts
        if 'link' in row:
            continue
        target = app / relative; target.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(prefix + row['file']) as source, target.open('xb') as destination:
            shutil.copyfileobj(source, destination, 1024 * 1024)
        target.chmod(row['mode'])
        assert target.stat().st_size == row['bytes'] and sha(target) == row['sha256'], row['file']
    for row in rows:
        if 'link' not in row:
            continue
        target = app / row['file']; target.parent.mkdir(parents=True, exist_ok=True)
        assert not os.path.isabs(row['link'])
        target.symlink_to(row['link']); assert target.resolve().is_relative_to(app)
        assert os.readlink(target) == row['link'] and stat.S_IMODE(target.lstat().st_mode) == row['mode']
assert {str(file.relative_to(app)) for file in app.rglob('*') if file.is_file() or file.is_symlink()} == {row['file'] for row in rows}
subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app)], check=True)
result = dict(status='PASS_ACTUAL_DESKTOP_ZIP_EXTRACTED_BYTES_LINKS_MODES_AND_SIGNATURE', app=str(app),
              executable='RA2 HD Editions', resources=str(app / 'Contents/Resources/GameResources'),
              zipSha256=receipt['sha256'], verifiedEntries=len(rows))
(output / 'extracted.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
