"""Build a byte-pinned manual-camera companion for the preserved C7 kit."""
import hashlib
import json
import pathlib
import subprocess
import sys
import zipfile

root = pathlib.Path.cwd()
output = pathlib.Path(sys.argv[1]).resolve()
assert not output.exists(), 'Preserve earlier artifacts; use a new output directory'
assert not subprocess.check_output(['git', 'status', '--porcelain'], text=True).strip()
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
output.mkdir(parents=True)
folder = output / 'C7-Manual-Capture-M1'
folder.mkdir()
for name in ['manual-capture-bootstrap.mjs', 'manual-capture-entry.mjs']:
    (folder / name).write_bytes((root / 'scripts/windows-hd' / name).read_bytes())
launcher = r'''@echo off
setlocal
cd /d "%~dp0.."
if not exist "Red Alert 2 HD.exe" (
    echo Extract C7-Manual-Capture-M1 inside the complete C7 game folder first.
    pause
    exit /b 1
)
set "ELECTRON_RUN_AS_NODE=1"
"%cd%\Red Alert 2 HD.exe" "%~dp0manual-capture-bootstrap.mjs"
if errorlevel 1 echo Capture failed. Preserve the folder and reports; do not edit C7.
echo Close the completed game, then use the original C7 Export-Reports.cmd.
pause
'''
(folder / 'Capture-Manual-Play.cmd').write_bytes(launcher.replace('\n', '\r\n').encode('ascii'))
(folder / 'START-HERE.txt').write_bytes((root / 'docs/windows-hd-c7-manual-capture-start-here-20261009.txt').read_bytes())
files = [{'file': p.name, 'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
    for p in sorted(folder.iterdir())]
manifest = {'schemaVersion': 1, 'companionId': 'WINHD-20261008-D38F136-C7-MANUAL-M1', 'sourceHead': head,
    'baseDiagnosticCommit': '3ab266e3b0b2c755f33ac65ca0866b1055f019d0',
    'baseManifestSha256': '1133beff253fc177d8b4a007077560a0a3a6de3aeb65f833464085dd65485458',
    'role': 'Manual-play diagnostic tooling only; no new game candidate or performance fix.', 'files': files}
(folder / 'companion-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
archive = output / f'RA2-HD-C7-Manual-Capture-M1-{head[:7]}.zip'
with zipfile.ZipFile(archive, 'x', compression=zipfile.ZIP_DEFLATED) as z:
    for p in sorted(folder.iterdir()):
        z.write(p, 'C7-Manual-Capture-M1/' + p.name)
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    for p in folder.iterdir():
        assert z.read('C7-Manual-Capture-M1/' + p.name) == p.read_bytes()
receipt = {'status': 'PASS_COMPANION_ARCHIVE_CRC_AND_BYTES', 'sourceHead': head, 'archive': str(archive),
    'bytes': archive.stat().st_size, 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
    'folder': str(folder), 'manifestSha256': hashlib.sha256((folder / 'companion-manifest.json').read_bytes()).hexdigest(),
    'files': files, 'windowsExecution': 'NOT_RUN', 'nativeCompanionQA': 'PENDING'}
(output / 'build-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt, indent=2))
