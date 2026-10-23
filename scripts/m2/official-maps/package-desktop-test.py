"""Copy the immutable R5 runtime and create a verified complete Mac test ZIP."""
import argparse
import hashlib
import json
import os
import shutil
import stat
import subprocess
import zipfile
from pathlib import Path


def digest(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def save(file, value):
    with file.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


def entries(folder):
    for directory, dirs, files in os.walk(folder, followlinks=False):
        for name in sorted(files + [name for name in dirs if (Path(directory) / name).is_symlink()]):
            file = Path(directory) / name
            row = {'file': file.relative_to(folder).as_posix(), 'mode': stat.S_IMODE(file.lstat().st_mode)}
            if file.is_symlink():
                row.update(type='symlink', target=os.readlink(file))
            else:
                row.update(type='file', bytes=file.stat().st_size, sha256=digest(file))
            yield row


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
parser.add_argument('lists', type=Path)
parser.add_argument('acceptance', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
source = args.source.resolve()
out = args.output.resolve()
assert not out.exists(), 'Preserve previous outputs'
out.mkdir()
folder = out / 'RA2-HD-M2.3-R5-Desktop-Test'
folder.mkdir()
app_name = 'Red Alert 2 HD M2.3 Temperate Review R5.app'
runtime_names = [app_name, 'RA2-HD-Editions-Resources', 'RA2-HD-UI-Resources']
source_manifest_file = source / 'M2.3-R5-DELIVERY-MANIFEST.json'
source_manifest = json.loads(source_manifest_file.read_text())
source_rows = [row for row in source_manifest['files'] if row['file'].split('/')[0] in runtime_names]
assert source_rows, 'Pinned runtime inventory is required'
for name in runtime_names:
    subprocess.run(['/usr/bin/ditto', '--norsrc', '--noextattr', '--noqtn', str(source / name), str(folder / name)], check=True)
    print(f'COPIED {name}', flush=True)
copied = {row['file']: row for row in entries(folder)}
assert set(copied) == {row['file'] for row in source_rows}, 'No missing or extra runtime payload'
for row in source_rows:
    actual = copied[row['file']]
    assert actual['type'] == row['type'], row['file']
    for key in ['sha256', 'bytes'] if row['type'] == 'file' else ['target']:
        assert actual[key] == row[key], row['file']
    assert actual['mode'] == stat.S_IMODE((source / row['file']).lstat().st_mode), row['file']
for file in sorted(args.lists.glob('M2.3-R5-Temperate-Map-Test-List.*')):
    assert file.is_file()
    shutil.copyfile(file, folder / file.name)
shutil.copyfile(args.acceptance, folder / 'M2.3-R5-USER-VISUAL-ACCEPTANCE.json')
shutil.copyfile(source / 'M2.3-R5-RESOURCE-HANDOFF.json', folder / 'M2.3-R5-RESOURCE-HANDOFF.json')
launcher = folder / 'Launch-M2.3-R5-Test.command'
launcher.write_text('''#!/bin/bash
set -euo pipefail
test_folder="$(cd -- "$(dirname -- "$0")" && pwd)"
export RA2_DESKTOP_USER_DATA="$test_folder/M2.3-R5-Test-Profile"
export RA2_UI_RESOURCE_ROOT="$test_folder/RA2-HD-UI-Resources"
export RA2_DESKTOP_NO_DISCOVERY=1
test_executable="$test_folder/Red Alert 2 HD M2.3 Temperate Review R5.app/Contents/MacOS/RA2 HD Editions"
ELECTRON_RUN_AS_NODE=1 "$test_executable" "$test_folder/Register-M2.3-R5-Resources.cjs"
exec "$test_executable" "$@"
''')
launcher.chmod(0o755)
(folder / 'Register-M2.3-R5-Resources.cjs').write_text('''// Register only the sibling R5 resources in this package's private test profile.
const fs = require('node:fs');
const path = require('node:path');
const directory = path.join(__dirname, 'RA2-HD-Editions-Resources');
const profile = path.join(__dirname, 'M2.3-R5-Test-Profile');
if (process.env.RA2_DESKTOP_USER_DATA !== profile) throw Error('Unexpected test profile');
for (const name of ['ra2-core-manifest.json', 'yr-core-manifest.json', 'environment-selection.json', 'terrain-selection.json']) {
    if (!fs.statSync(path.join(directory, name)).isFile()) throw Error('Keep the complete resources beside the app');
}
fs.mkdirSync(profile, { recursive: true });
const registration = path.join(profile, 'resource-registration.json');
fs.writeFileSync(registration + '.tmp', JSON.stringify({ schemaVersion: 1, directory }, null, 2) + '\\n');
fs.renameSync(registration + '.tmp', registration);
''')
(folder / 'START-HERE.txt').write_text('''M2.3 R5 - Complete Mac Gameplay Test Package

Target: macOS Apple Silicon. Runtime source: b8fed46e6d88820e1508f59203d9868c1527f0c5.
This package contains the complete unchanged R5 app, independent world/retail resources,
independent UI resources, and the complete selectable TEMPERATE map test list.

1. Extract the entire ZIP to a writable folder.
2. Keep the app and both RA2-HD resource folders together in this folder.
3. Double-click Launch-M2.3-R5-Test.command. It registers the sibling resources in a private profile here.
4. Choose Red Alert 2 or Yuri's Revenge, then Skirmish and Standard mode.
5. Enable HD graphics and choose 2X or 4X before starting a new match.
6. Follow M2.3-R5-Temperate-Map-Test-List.txt; use the CSV to record results and notes.

The list contains 61 edition/map entries (RA2 17, Yuri's Revenge 44).
Map names reproduce the shipped game's localized titles. Same-name maps in different
editions are separate entries. Existing R5 focused native checks covered 12 maps at both
densities; full-match gameplay acceptance for every entry remains for this user test.
The declared reusable TEMPERATE artwork is complete. Other theaters keep prior coverage
and Original fallback. Native resource-budget fallback remains available.

User visual acceptance was recorded on 2026-10-09. Main integration remains pending.
No profile, saved game, or historical review package is included in this ZIP.
The separate image-review ZIP remains available as previously delivered.
''')
receipt = {'schemaVersion': 1, 'status': 'COPIED_RUNTIME_SOURCE_PARITY_VERIFIED',
    'folder': str(folder), 'app': str(folder / app_name),
    'resources': str(folder / 'RA2-HD-Editions-Resources'), 'uiRoot': str(folder / 'RA2-HD-UI-Resources'),
    'launcher': str(launcher), 'target': 'darwin-arm64', 'resourceStorage': 'independent copies',
    'sourceFolder': str(source), 'sourceManifestSha256': digest(source_manifest_file),
    'runtimeSourceHead': 'b8fed46e6d88820e1508f59203d9868c1527f0c5',
    'checkedRuntimeEntries': len(source_rows), 'checkedRuntimeBytes': sum(row.get('bytes', 0) for row in source_rows),
    'excludedReviewData': ['M2.3-R5-Feedback-Review', 'M2.3-R5-Evidence', 'M2.3-Inventory', 'M2.3-R5-Authoring'],
    'userVisualAcceptance': True, 'userGameplayAcceptance': 'NOT_RECORDED', 'mainIntegration': False}
save(out / 'package-receipt.json', receipt)
inventory = list(entries(folder))
manifest_name = 'M2.3-R5-TEST-PACKAGE-MANIFEST.json'
manifest = {**receipt, 'files': inventory, 'manifestExcludedFromSelfInventory': manifest_name}
save(folder / manifest_name, manifest)
subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(folder / app_name)], check=True)
archive = out / 'M2.3-R5-Desktop-Mac-Test-20261009.zip'
assert not archive.exists()
print('ARCHIVING complete runtime and map lists', flush=True)
subprocess.run(['/usr/bin/ditto', '-c', '-k', '--norsrc', '--noextattr', '--noqtn', '--keepParent',
    str(folder), str(archive)], check=True)
expected = inventory + [dict(file=manifest_name, type='file', bytes=(folder / manifest_name).stat().st_size,
    sha256=digest(folder / manifest_name), mode=stat.S_IMODE((folder / manifest_name).stat().st_mode))]
print('VERIFYING every ZIP file, symbolic link and permission against the staged inventory', flush=True)
with zipfile.ZipFile(archive) as zipped:
    items = [entry for entry in zipped.infolist() if not entry.is_dir()]
    assert len(items) == len(expected)
    assert len({entry.filename for entry in items}) == len(items)
    assert not any(name.startswith('__MACOSX/') or '-Profile/' in name or '/UserData/' in name for name in zipped.namelist())
    assert {entry.filename for entry in items} == {folder.name + '/' + row['file'] for row in expected}
    for row in expected:
        entry = zipped.getinfo(folder.name + '/' + row['file'])
        mode = entry.external_attr >> 16
        assert stat.S_IMODE(mode) == row['mode'], row['file']
        with zipped.open(entry) as stream:
            if row['type'] == 'symlink':
                assert stat.S_ISLNK(mode) and stream.read().decode() == row['target'], row['file']
            else:
                assert stat.S_ISREG(mode) and entry.file_size == row['bytes'], row['file']
                assert hashlib.file_digest(stream, 'sha256').hexdigest() == row['sha256'], row['file']
result = {**receipt, 'status': 'PASS_COMPLETE_MAC_TEST_ARCHIVE_BYTES_LINKS_MODES_NO_PROFILES',
    'archive': str(archive), 'sha256': digest(archive), 'bytes': archive.stat().st_size,
    'checkedArchiveEntries': len(expected), 'manifestSha256': digest(folder / manifest_name),
    'symlinks': sum(row['type'] == 'symlink' for row in expected), 'codesign': 'PASS'}
save(out / 'archive-receipt.json', result)
print(json.dumps({key: result[key] for key in ['status', 'archive', 'sha256', 'bytes', 'checkedArchiveEntries', 'symlinks']}), flush=True)
