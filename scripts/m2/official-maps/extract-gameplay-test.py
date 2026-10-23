"""Extract the delivered ZIP and verify all bytes, links, modes and app signature."""
import argparse
import hashlib
import json
import os
import stat
import subprocess
import zipfile
from pathlib import Path


def digest(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('archive', type=Path)
parser.add_argument('archive_receipt', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--revision', default='R8', choices=['R8', 'R9', 'R10', 'R11', 'R12', 'R13', 'R14', 'R15', 'R16'])
args = parser.parse_args()
pin = json.loads(args.archive_receipt.read_text())
assert digest(args.archive) == pin['sha256'] and args.archive.stat().st_size == pin['bytes']
assert not args.output.exists(), 'Preserve earlier extractions and profiles'
args.output.mkdir()
destination = args.output/'fresh-extraction'
destination.mkdir()
with zipfile.ZipFile(args.archive) as zipped:
    assert all(not Path(n).is_absolute() and '..' not in Path(n).parts for n in zipped.namelist())
subprocess.run(['/usr/bin/ditto', '-x', '-k', str(args.archive), str(destination)], check=True)
folder = destination/f'RA2-HD-M2.3-{args.revision}-Desktop-Test'
manifest_file = folder/f'M2.3-{args.revision}-TEST-PACKAGE-MANIFEST.json'
assert digest(manifest_file) == pin['manifestSha256']
manifest = json.loads(manifest_file.read_text())
expected = manifest['files']+[dict(file=manifest_file.name, type='file',
    bytes=manifest_file.stat().st_size, sha256=digest(manifest_file),
    mode=stat.S_IMODE(manifest_file.stat().st_mode))]
found = set()
for directory, dirs, files in os.walk(folder, followlinks=False):
    for name in files+[n for n in dirs if (Path(directory)/n).is_symlink()]:
        found.add((Path(directory)/name).relative_to(folder).as_posix())
assert found == {r['file'] for r in expected}
for row in expected:
    file = folder/row['file']
    assert stat.S_IMODE(file.lstat().st_mode) == row['mode'], row['file']
    if row['type'] == 'symlink':
        assert file.is_symlink() and os.readlink(file) == row['target'], row['file']
    else:
        assert file.is_file() and not file.is_symlink(), row['file']
        assert file.stat().st_size == row['bytes'] and digest(file) == row['sha256'], row['file']
app = folder/Path(manifest['app']).name
subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(app)], check=True)
receipt = dict(schemaVersion=1, status='PASS_ACTUAL_DESKTOP_ZIP_EXTRACTED_BYTES_LINKS_MODES',
    archive=str(args.archive.resolve()), archiveSha256=pin['sha256'],
    manifestSha256=pin['manifestSha256'], checkedEntries=len(expected), codesign='PASS',
    folder=str(folder.resolve()), app=str(app.resolve()),
    resources=str((folder/'RA2-HD-Editions-Resources').resolve()),
    uiRoot=str((folder/'RA2-HD-UI-Resources').resolve()), executable='RA2 HD Editions',
    launcher=str((folder/f'Launch-M2.3-{args.revision}-Test.command').resolve()),
    runtimeSourceHead=manifest['runtimeSourceHead'], target='darwin-arm64')
(args.output/'extracted-package-receipt.json').write_text(json.dumps(receipt, indent=2)+'\n')
print(json.dumps(receipt))
