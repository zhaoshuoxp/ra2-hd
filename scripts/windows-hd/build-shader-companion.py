"""Build a small, byte-pinned shader-identity companion for the unchanged C6 kit."""
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
folder = output / 'C6-Shader-Identity-S1'
folder.mkdir()
for name in ['shader-identity-bootstrap.mjs', 'shader-identity-entry.mjs', 'shader-identity-probe.mjs']:
    (folder / name).write_bytes((root / 'scripts/windows-hd' / name).read_bytes())
launcher = r'''@echo off
setlocal
cd /d "%~dp0.."
if not exist "Red Alert 2 HD.exe" (
    echo Extract C6-Shader-Identity-S1 inside the complete C6 game folder first.
    pause
    exit /b 1
)
set "ELECTRON_RUN_AS_NODE=1"
"%cd%\Red Alert 2 HD.exe" "%~dp0shader-identity-bootstrap.mjs"
if errorlevel 1 echo Capture failed. Preserve this folder and any reports; do not edit the game.
echo Close the completed game, then use the original C6 Export-Reports.cmd.
pause
'''
(folder / 'Capture-Shader-Identity.cmd').write_bytes(launcher.replace('\n', '\r\n').encode('ascii'))
(folder / 'START-HERE.txt').write_bytes((root / 'docs/windows-hd-c6-shader-identity-start-here-20261009.txt').read_bytes())
files = [{'file': p.name, 'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
    for p in sorted(folder.iterdir())]
manifest = {'schemaVersion': 1, 'companionId': 'WINHD-20261008-D38F136-C6-SHADER-IDENTITY-S1',
    'sourceHead': head, 'baseDiagnosticCommit': '4d3e41f5ffe2746ada9bc765a407f00638cb4705',
    'baseManifestSha256': 'f7bdd2665e180d4aa7528c3520bea9af45bfa2b4f00b26418eb27ab471bf526a',
    'role': 'Opt-in identity capture only; not a new game candidate or a performance fix.', 'files': files}
(folder / 'companion-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
archive = output / f'RA2-HD-C6-Shader-Identity-S1-{head[:7]}.zip'
with zipfile.ZipFile(archive, 'x', compression=zipfile.ZIP_DEFLATED) as z:
    for p in sorted(folder.iterdir()):
        z.write(p, 'C6-Shader-Identity-S1/' + p.name)
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    for p in folder.iterdir():
        assert z.read('C6-Shader-Identity-S1/' + p.name) == p.read_bytes()
receipt = {'status': 'PASS_COMPANION_ARCHIVE_CRC_AND_BYTES', 'sourceHead': head,
    'archive': str(archive), 'bytes': archive.stat().st_size, 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
    'folder': str(folder), 'manifestSha256': hashlib.sha256((folder / 'companion-manifest.json').read_bytes()).hexdigest(),
    'files': files, 'windowsExecution': 'NOT_RUN', 'nativeCompanionQA': 'PENDING'}
(output / 'build-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt, indent=2))
