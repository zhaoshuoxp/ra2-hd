"""Copy verified distribution files into a new Desktop delivery without replacing old apps."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('stage', type=Path)
parser.add_argument('destination', type=Path)
args = parser.parse_args()
stage, destination = args.stage.resolve(), args.destination.resolve()
manifest = json.loads((stage / 'archives.json').read_text())
assert manifest['status'] == 'ALL_ARCHIVE_PAYLOAD_HASHES_AND_CRC_VERIFIED'
destination.mkdir(parents=True, exist_ok=False)

def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

app = destination / 'Red Alert 2 HD.app'
subprocess.run(['cp', '-cR', str(stage / app.name), str(app)], check=True)
for row in json.loads((stage / 'Red Alert 2 HD-inventory.json').read_text()):
    file = app / row['file']
    if 'link' in row:
        assert file.is_symlink() and os.readlink(file) == row['link']
    else:
        assert file.stat().st_size == row['bytes'] and sha(file) == row['sha256'], row['file']
subprocess.run(['xattr', '-cr', str(app)], check=True)
subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app)], check=True)
for row in manifest['files']:
    file = destination / row['file']
    subprocess.run(['cp', '-c', str(stage / row['file']), str(file)], check=True)
    assert file.stat().st_size == row['bytes'] and sha(file) == row['sha256'], row['file']
    print(json.dumps(dict(delivered=row['file'], bytes=row['bytes'])), flush=True)
for name in ['INSTALL.txt', 'SHA256SUMS.txt', 'archives.json', 'stage.json']:
    shutil.copyfile(stage / name, destination / name)
receipt = dict(status='PASS_DESKTOP_APP_AND_ALL_ARCHIVES_BYTE_VERIFIED', destination=str(destination),
    app=str(app), files=manifest['files'], packagingSourceHead=manifest['packagingSourceHead'],
    signing='AD_HOC_VALID_NOT_NOTARIZED', windowsRuntime='NOT_RUN_ON_THIS_MAC',
    oldApplicationsOverwritten=False, userProfilesCopied=False,
    publicReleaseCreated=False, driveUploadPerformed=False)
(destination / 'DELIVERY.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(dict(status=receipt['status'], destination=str(destination))), flush=True)
