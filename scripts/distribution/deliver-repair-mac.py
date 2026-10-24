"""Copy a verified single-app repair to a new destination and verify every entry."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('receipt', type=Path)
parser.add_argument('destination', type=Path)
parser.add_argument('evidence', type=Path)
args = parser.parse_args()
receipt = json.loads(args.receipt.read_text())
source = Path(receipt['app'])
target = args.destination.resolve()
out = args.evidence.resolve()
assert source.is_dir() and source.suffix == '.app'
assert target.suffix == '.app' and not target.exists()
staging = target
out.mkdir(parents=True, exist_ok=False)
inventory_file = args.receipt.parent / 'app-inventory.json'
assert hashlib.file_digest(inventory_file.open('rb'), 'sha256').hexdigest() == receipt['appInventorySha256']
rows = json.loads(inventory_file.read_text())
subprocess.run(['/usr/bin/ditto', '--clone', '--noqtn', '--noextattr', '--noacl', '--norsrc',
    str(source), str(staging)], check=True)
seen = set()
for row in rows:
    file = staging / row['file']
    assert stat.S_IMODE(file.lstat().st_mode) == row['mode'], row['file']
    if 'link' in row:
        assert file.is_symlink() and os.readlink(file) == row['link'] and file.resolve().is_relative_to(staging), row['file']
    else:
        assert file.is_file() and not file.is_symlink() and file.stat().st_size == row['bytes'], row['file']
        with file.open('rb') as stream:
            assert hashlib.file_digest(stream, 'sha256').hexdigest() == row['sha256'], row['file']
    seen.add(row['file'])
actual = {str(file.relative_to(staging)) for file in staging.rglob('*') if file.is_file() or file.is_symlink()}
assert actual == seen
signature = subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(target)], text=True, capture_output=True)
attributes = subprocess.run(['/usr/bin/xattr', '-l', str(target)], text=True, capture_output=True)
diagnostic = dict(returncode=signature.returncode, stdout=signature.stdout, stderr=signature.stderr,
    rootAttributes=attributes.stdout, cleanSourceSignature=receipt['signing'])
(out / 'signature-diagnostic.json').write_text(json.dumps(diagnostic, indent=2) + '\n')
receipt.update(app=str(target), resources=str(target / 'Contents/Resources/GameResources'),
    status='PASS_DESKTOP_APP_BYTES_MODES_SYMLINKS_PENDING_NATIVE_STARTUP', copiedFrom=str(source),
    verifiedEntries=len(rows), signatureDiagnostic=str(out / 'signature-diagnostic.json'))
(out / 'desktop-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({key: receipt[key] for key in ['status', 'app', 'resourceFiles', 'verifiedEntries']}), flush=True)
