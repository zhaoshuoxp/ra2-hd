"""Add the existing Yuri pause fallbacks to the unaccepted M3.2 candidate."""
from pathlib import Path
import hashlib
import json
import os
import plistlib
import shutil
import stat
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
folder = Path(sys.argv[1]).resolve()
receipt_file = folder / 'package-receipt.json'
receipt = json.loads(receipt_file.read_text())
app = Path(receipt['app']); payload = app / 'Contents/Resources/app'
assert plistlib.loads((app / 'Contents/Info.plist').read_bytes())['CFBundleIdentifier'] == 'local.ra2hd.m32.review'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
files = json.loads((payload / 'desktop/app-files.json').read_text())
additions = []
for name in ['yuri-pause-emblem.png', 'yuri-pause-emblem-original.png']:
    source = root / 'public/res/ui' / name
    relative = 'dist/res/ui/' + name
    target = payload / relative
    assert not target.exists()
    shutil.copyfile(source, target)
    assert sha(target) == sha(source)
    files.append(relative)
    additions.append(dict(file=relative, sha256=sha(target), bytes=target.stat().st_size))
(payload / 'desktop/app-files.json').write_text(json.dumps(sorted(files), indent=2) + '\n')
info = app / 'Contents/Resources/M3.2-Info.json'
value = json.loads(info.read_text()); value['packagingAmendment'] = additions
info.write_text(json.dumps(value, indent=2) + '\n')
subprocess.run(['xattr', '-cr', str(app)], check=True)
subprocess.run(['codesign', '--force', '--deep', '--sign', '-', str(app)], check=True)
subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app)], check=True)
rows = []
for file in sorted(app.rglob('*')):
    if file.is_symlink():
        assert file.resolve().is_relative_to(app)
        rows.append(dict(file=str(file.relative_to(app)), mode=stat.S_IMODE(file.lstat().st_mode), link=os.readlink(file)))
    elif file.is_file():
        rows.append(dict(file=str(file.relative_to(app)), mode=stat.S_IMODE(file.stat().st_mode), bytes=file.stat().st_size, sha256=sha(file)))
inventory = folder / 'app-inventory.json'
inventory.write_text(json.dumps(rows, indent=2) + '\n')
receipt.update(files=len(rows), appInventorySha256=sha(inventory), resourceFiles=receipt['selectedResourceFiles'], packagingAmendment=additions)
receipt_file.write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(dict(files=len(rows), additions=additions)))
