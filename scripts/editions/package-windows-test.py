"""Stage the verified combined game and resources with a pinned Windows x64 Electron runtime."""
import argparse
import hashlib
import json
import pathlib
import re
import shutil
import stat
import struct
import subprocess
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--mac-receipt', type=pathlib.Path, required=True)
parser.add_argument('--electron-zip', type=pathlib.Path, required=True)
parser.add_argument('--checksums', type=pathlib.Path, required=True)
parser.add_argument('--output', type=pathlib.Path, required=True)
parser.add_argument('--name', default='RA2-HD-Main-Disk-Fix-20261005-Windows-x64-portable')
args = parser.parse_args()
assert re.fullmatch(r'[A-Za-z0-9.-]+', args.name), 'Use a plain package folder name'
repo = pathlib.Path(__file__).resolve().parents[2]
source = json.loads(args.mac_receipt.read_text())
output = args.output.resolve()
output.mkdir(parents=True, exist_ok=False)
folder = output / args.name
folder.mkdir()


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def save(file, value):
    file.write_text(json.dumps(value, indent=2) + '\n')


version = json.loads((repo / 'node_modules/electron/package.json').read_text())['version']
assert args.electron_zip.name == f'electron-v{version}-win32-x64.zip'
checksums = {line.split()[1].lstrip('*'): line.split()[0] for line in args.checksums.read_text().splitlines() if line.strip()}
assert sha(args.electron_zip) == checksums[args.electron_zip.name]
with zipfile.ZipFile(args.electron_zip) as archive:
    names = archive.namelist()
    assert len(names) == len(set(names))
    for entry in archive.infolist():
        name = pathlib.PurePosixPath(entry.filename)
        assert not name.is_absolute() and '..' not in name.parts and '\\' not in entry.filename
        assert not stat.S_ISLNK(entry.external_attr >> 16)
    assert archive.testzip() is None
    archive.extractall(folder)
exe = folder / 'Red Alert 2 HD.exe'
(folder / 'electron.exe').rename(exe)
assert (folder / 'version').read_text().strip() == version

source_folder = pathlib.Path(source['folder'])
source_payload = pathlib.Path(source['app']).relative_to(source_folder) / 'Contents/Resources/app'
skipped = {'desktop/restore-cursor', 'desktop/packaged-review-main.mjs', 'package.json'}
world_name, ui_name = 'RA2-HD-Editions-Resources', 'RA2-HD-UI-Resources'
copied = []
for row in source['files']:
    relative = pathlib.Path(row['file'])
    if relative.is_relative_to(source_payload):
        payload_relative = relative.relative_to(source_payload)
        if payload_relative.as_posix() in skipped:
            continue
        destination = pathlib.Path('resources/app') / payload_relative
    elif relative.parts[0] in [world_name, ui_name]:
        destination = relative
    else:
        continue
    assert 'link' not in row
    original = source_folder / relative
    assert original.stat().st_size == row['bytes'] and sha(original) == row['sha256'], str(relative)
    target = folder / destination
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(original, target)
    assert sha(target) == row['sha256'], str(destination)
    copied.append({'file': destination.as_posix(), 'source': row['file'], 'sha256': row['sha256']})

# Only platform entry and sibling discovery differ from the verified Mac game payload.
payload = folder / 'resources/app'
for name in ['main.mjs', 'bundled-layout.mjs', 'editions-portable.mjs', 'portable-registration.mjs']:
    shutil.copyfile(repo / 'desktop' / name, payload / 'desktop' / name)
metadata = json.loads((source_folder / source_payload / 'package.json').read_text())
metadata['main'] = 'desktop/editions-portable.mjs'
save(payload / 'package.json', metadata)
launcher = '@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\nstart "" "%~dp0Red Alert 2 HD.exe" %*\r\n'
(folder / 'Launch-Isolated-Review.cmd').write_bytes(launcher.encode('ascii'))
(folder / 'START-HERE.txt').write_text('''Red Alert 2 HD - Windows x86-64 portable test build

Extract the entire ZIP into a writable folder, then run Red Alert 2 HD.exe
or Launch-Isolated-Review.cmd. No Node, Bun or separate browser is required.
Keep all DLLs, locales, resources, RA2-HD-Editions-Resources and
RA2-HD-UI-Resources together. Do not run from inside the ZIP.
The game creates Review-Profile here; no existing Mac profile is included.

Includes the verified combined C/D content and DISK drain fixes: continuous
refinery payments, original looping rings, and centered overhead hovering.
Also includes startup-unit and no-scroll trainer sidebar repairs, streamlined
startup validation, queued building/unit preparation, background VXL pixel work,
and Windows menu cursor restoration. Original, 2X and 4X remain available.

Status: PACKAGED_STATIC_CHECKS_PASS / WINDOWS_RUNTIME_NOT_RUN.
Assembled on macOS with the checksum-verified official Electron x64 runtime.
This is a portable test folder, not a Windows installer or signed release.
Please test launch-to-menu time, initial match smoothness, new construction,
trainer menu cursor handoff, both editions, sound, fullscreen and DISK drains. Keep Review-Profile/last-session.json if reporting issues.
''')
for name in ['LICENSE', 'ELECTRON-LICENSE']:
    assert (payload / name).is_file()
pe_files = []
for file in folder.rglob('*'):
    if file.suffix.lower() not in ['.exe', '.dll']:
        continue
    with file.open('rb') as stream:
        assert stream.read(2) == b'MZ', str(file)
        stream.seek(0x3c)
        offset = struct.unpack('<I', stream.read(4))[0]
        stream.seek(offset)
        assert stream.read(4) == b'PE\0\0', str(file)
        assert struct.unpack('<H', stream.read(2))[0] == 0x8664, str(file)
    pe_files.append(file.relative_to(folder).as_posix())
assert not (folder / 'Review-Profile').exists()
assert not list(payload.rglob('*.node'))
assert not (payload / 'desktop/restore-cursor').exists()
files = []
for file in sorted(folder.rglob('*')):
    assert not file.is_symlink()
    if file.is_file():
        files.append({'file': file.relative_to(folder).as_posix(), 'bytes': file.stat().st_size, 'sha256': sha(file)})
assert len({row['file'].casefold() for row in files}) == len(files), 'Windows case-insensitive collision'
receipt = dict(status='PASS_STATIC_PACKAGE_WINDOWS_RUNTIME_NOT_RUN', target='win32-x64', folder=str(folder),
               app=str(exe), resources=str(folder / world_name), uiRoot=str(folder / ui_name),
               launcher=str(folder / 'Launch-Isolated-Review.cmd'), profile=str(folder / 'Review-Profile'),
               electron=version, electronArchive=str(args.electron_zip.resolve()),
               electronSha256=checksums[args.electron_zip.name], checksumsSha256=sha(args.checksums),
               gameplaySourceHead=source['runtimeSourceHead'],
               desktopSourceHead=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip(),
               sourceDirty=subprocess.check_output(['git', 'status', '--porcelain'], cwd=repo, text=True),
               sourceMacReceipt=str(args.mac_receipt.resolve()), files=files, copiedFiles=len(copied),
               unchangedWorldFiles=source['resourceFiles'], unchangedUIFiles=source['uiResourceFiles'],
               uiEntries=source['uiEntries'], preparedRegistration=source['preparedRegistration'],
               verifiedX64PE=pe_files, windowsRuntime='NOT_RUN', signing='NO_APPLICATION_SIGNING',
               excludedUserData=['Review-Profile', 'UserData'])
save(output / 'package-receipt.json', receipt)
print(json.dumps({key: receipt[key] for key in ['status', 'folder', 'gameplaySourceHead', 'desktopSourceHead', 'verifiedX64PE']}))
