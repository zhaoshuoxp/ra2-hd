"""Archive the validated Mac app and stage a Windows x64 folder build for personal testing."""
import argparse
import hashlib
import json
import shutil
import stat
import struct
import subprocess
import zipfile
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--artifact', type=Path, required=True)
parser.add_argument('--electron-zip', type=Path, required=True)
parser.add_argument('--checksums', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
repo = Path(__file__).resolve().parents[2]
output = args.output.resolve()
output.mkdir(parents=True, exist_ok=False)
artifact = json.loads(args.artifact.read_text())
mac = Path(artifact['artifact'])
assert artifact['electron'] == '44.4.0'


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


def verify_mac():
    actual = {str(p.relative_to(mac)) for p in mac.rglob('*') if p.is_file() or p.is_symlink()}
    assert actual == {row['file'] for row in artifact['bundle']}, 'Unexpected Mac bundle entries'
    for row in artifact['bundle']:
        file = mac / row['file']
        if 'link' in row:
            assert str(file.readlink()) == row['link'], row['file']
        else:
            assert sha(file) == row['sha256'], row['file']


def archive(folder, target):
    with zipfile.ZipFile(target, 'x', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for file in sorted(folder.rglob('*')):
            assert not file.is_symlink(), file
            if file.is_file():
                z.write(file, str(file.relative_to(folder.parent)))
    with zipfile.ZipFile(target) as z:
        assert z.testzip() is None
        for file in sorted(folder.rglob('*')):
            if file.is_file():
                assert hashlib.sha256(z.read(str(file.relative_to(folder.parent)))).hexdigest() == sha(file)


def resource_plan(root):
    script = """
import fs from 'node:fs/promises';
import path from 'node:path';
import { validateProfile } from './desktop/profile.mjs';
import { registerHdResources } from './desktop/hd-profile.mjs';
const root = process.argv[1], profile = await validateProfile(root), hd = await registerHdResources(root);
if (Object.values(hd.availability).some(value => value !== 'HD available')) throw Error('Incomplete accepted HD resources');
const files = new Set([...profile.routes.values(), ...hd.routes.values()].map(file => path.relative(root, file)));
files.add('hd-packs/power-plant-authored/1/family.json');
console.log(JSON.stringify({ files: [...files].sort(), availability: hd.availability }));
"""
    return json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script, str(root)], cwd=repo, text=True))


verify_mac()
mac_zip = output / 'RA2-HD-M1.5-macOS-arm64.zip'
subprocess.run(['/usr/bin/ditto', '-c', '-k', '--sequesterRsrc', '--keepParent', str(mac), str(mac_zip)], check=True)
with zipfile.ZipFile(mac_zip) as z:
    assert z.testzip() is None
    for row in artifact['bundle']:
        entry = z.getinfo(f"{mac.name}/{row['file']}")
        data = z.read(entry)
        if 'link' in row:
            assert stat.S_ISLNK(entry.external_attr >> 16)
            assert data.decode() == row['link']
        else:
            assert hashlib.sha256(data).hexdigest() == row['sha256']
    assert z.getinfo(f'{mac.name}/Contents/MacOS/Electron').external_attr >> 16 & stat.S_IXUSR
print('PASS Mac ZIP integrity, symlinks and executable permission', flush=True)

runtime = args.electron_zip.resolve()
assert runtime.name == 'electron-v44.4.0-win32-x64.zip'
checksums = dict((line.split()[1].lstrip('*'), line.split()[0]) for line in args.checksums.read_text().splitlines() if line.strip())
assert sha(runtime) == checksums[runtime.name], 'Official Electron checksum mismatch'
windows = output / 'RA2-HD-M1.5-Windows-x64'
windows.mkdir()
with zipfile.ZipFile(runtime) as z:
    assert z.testzip() is None
    for info in z.infolist():
        target = windows / info.filename
        assert target.resolve().is_relative_to(windows) and '\\' not in info.filename
        assert not stat.S_ISLNK(info.external_attr >> 16)
    z.extractall(windows)
exe = windows / 'Red Alert 2 HD M1.5.exe'
(windows / 'electron.exe').rename(exe)
with exe.open('rb') as stream:
    assert stream.read(2) == b'MZ'
    stream.seek(0x3c)
    offset = struct.unpack('<I', stream.read(4))[0]
    stream.seek(offset)
    assert stream.read(4) == b'PE\0\0'
    assert struct.unpack('<H', stream.read(2))[0] == 0x8664, 'Not x64'
app = windows / 'resources/app'
shutil.copytree(mac / 'Contents/Resources/app', app)
for row in artifact['payload']:
    assert sha(app / row['file']) == row['sha256'], row['file']
shutil.copyfile(repo / 'desktop/portable.mjs', app / 'desktop/portable.mjs')
package = json.loads((app / 'package.json').read_text())
package['main'] = 'desktop/portable.mjs'
write_json(app / 'package.json', package)
assert not list(app.rglob('*.mix')) and not (app / '.local').exists()
(windows / 'START-HERE.txt').write_text('''Red Alert 2 HD M1.5 - Windows x64 portable test build

1. Extract this entire ZIP into a writable folder. Do not run the EXE inside a ZIP.
2. Extract RA2-HD-M1.5-Local-Resources.zip separately, if using another computer.
3. Double-click Red Alert 2 HD M1.5.exe. No installer, Node, Bun or browser is required.
4. At first launch, choose the extracted RA2-HD-M1.5-Local-Resources folder.
5. In Options, set Conscript, Power Plant (temperate) and Rhino to HD as desired.
   Conscript/Power Plant apply next match; Rhino can change live.

Keep all DLLs, resources and locales with the EXE. UserData beside the EXE contains
settings and the local resource registration; moving the resources may require
choosing them again. Keep this folder writable; administrator privileges are not
required by the application. Profiles from the Mac are not included.

Status: PACKAGED_STATIC_CHECKS_PASS / WINDOWS_RUNTIME_NOT_RUN.
This package was assembled on macOS using official Electron 44.4.0 win32-x64.
It has not been launched on Windows. It is not an installer or signed public release.
Please test startup, HD appearance, selection, pointer lock, fullscreen and sound.
If startup fails, retain UserData/last-session.json if present and report the error.
''')
windows_zip = output / 'RA2-HD-M1.5-Windows-x64-portable.zip'
archive(windows, windows_zip)
print('PASS Windows ZIP integrity and PE x64; Windows runtime NOT RUN', flush=True)

source = repo / '.local'
plan = resource_plan(source)
resources = output / 'RA2-HD-M1.5-Local-Resources'
resources.mkdir()
resource_hashes = []
for relative in plan['files']:
    original, target = source / relative, resources / relative
    assert original.resolve() == original and original.is_file()
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(original, target)
    digest = sha(original)
    assert sha(target) == digest
    resource_hashes.append({'file': relative, 'sha256': digest})
# Only these manifest fields are consumed by the desktop loader. Omit old host paths.
core = json.loads((source / 'ra2-core-manifest.json').read_text())
write_json(resources / 'ra2-core-manifest.json', {'schemaVersion': 1, 'files': [
    {key: row[key] for key in ('virtualName', 'bytes', 'sha256', 'validation')} for row in core['files']]})
support = json.loads((source / 'upstream-support/manifest.json').read_text())
write_json(resources / 'upstream-support/manifest.json', [
    {key: row[key] for key in ('original', 'commit', 'sha256', 'bytes')}
    for row in support if Path(row['original']).name in ('general.csf', 'ra2cd.mix')])
assert resource_plan(resources) == plan
resources_zip = output / 'RA2-HD-M1.5-Local-Resources.zip'
archive(resources, resources_zip)
verify_mac()
for row in resource_hashes:
    assert sha(source / row['file']) == row['sha256'], 'Source resource changed'
print('PASS separate external resources; all three accepted HD families available', flush=True)
report = {'status': 'ARCHIVES_VERIFIED', 'windowsRuntime': 'NOT_RUN', 'sourceArtifact': str(args.artifact.resolve()),
          'runtimeUrl': 'https://github.com/electron/electron/releases/download/v44.4.0/' + runtime.name,
          'runtimeSha256': sha(runtime), 'windowsPayloadChanges': ['package.json main', 'desktop/portable.mjs'],
          'portableEntrySha256': sha(app / 'desktop/portable.mjs'), 'resourceFiles': resource_hashes,
          'resourceAvailability': plan['availability'], 'archives': [
              {'file': str(p), 'bytes': p.stat().st_size, 'sha256': sha(p)} for p in (mac_zip, windows_zip, resources_zip)]}
write_json(output / 'transfer.json', report)
print(json.dumps(report['archives'], indent=2))
