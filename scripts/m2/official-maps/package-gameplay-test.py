"""Create an independent gameplay test archive from a pinned package receipt."""
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
        for name in sorted(files + [n for n in dirs if (Path(directory)/n).is_symlink()]):
            file = Path(directory)/name
            row = dict(file=file.relative_to(folder).as_posix(), mode=stat.S_IMODE(file.lstat().st_mode))
            if file.is_symlink():
                row.update(type='symlink', target=os.readlink(file))
            else:
                row.update(type='file', bytes=file.stat().st_size, sha256=digest(file))
            yield row


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('receipt', type=Path)
parser.add_argument('lists', type=Path)
parser.add_argument('review', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--revision', choices=['R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12', 'R13', 'R14', 'R15', 'R16'], default='R6')
args = parser.parse_args()
revision = args.revision
source_receipt = json.loads(args.receipt.read_text())
source = Path(source_receipt['folder'])
out = args.output.resolve()
assert not out.exists(), 'Preserve all previous deliveries'
out.mkdir()
folder = out/f'RA2-HD-M2.3-{revision}-Desktop-Test'
folder.mkdir()
app_name = Path(source_receipt['app']).name
runtime_names = [app_name, 'RA2-HD-Editions-Resources', 'RA2-HD-UI-Resources']
source_rows = [r for r in source_receipt['files'] if r['file'].split('/')[0] in runtime_names]
assert source_rows
for name in runtime_names:
    subprocess.run(['/usr/bin/ditto', '--norsrc', '--noextattr', '--noqtn', str(source/name), str(folder/name)], check=True)
    print('COPIED ' + name, flush=True)
copied = {r['file']: r for r in entries(folder)}
assert set(copied) == {r['file'] for r in source_rows}
for row in source_rows:
    actual = copied[row['file']]
    if 'link' in row:
        assert actual['type']=='symlink' and actual['target']==row['link'], row['file']
    else:
        assert actual['type']=='file' and actual['sha256']==row['sha256'] and actual['bytes']==row['bytes'], row['file']
    assert actual['mode']==stat.S_IMODE((source/row['file']).lstat().st_mode), row['file']
for file in sorted(args.lists.glob('M2.3-R5-Temperate-Map-Test-List.*')):
    shutil.copyfile(file, folder/file.name.replace('R5',revision))
assert (folder/f'M2.3-{revision}-Temperate-Map-Test-List.json').is_file()
list_text = folder/f'M2.3-{revision}-Temperate-Map-Test-List.txt'
list_text.write_text(list_text.read_text().replace('M2.3 R5 - Complete', f'M2.3 {revision} - Complete', 1))
shutil.copytree(args.review, folder/f'M2.3-{revision}-Offline-Review')
launcher = folder/f'Launch-M2.3-{revision}-Test.command'
launcher.write_text('#!/bin/bash\nset -euo pipefail\ntest_folder="$(cd -- "$(dirname -- "$0")" && pwd)"\n'
    f'exec "$test_folder/{app_name}/Contents/MacOS/RA2 HD Editions" "$@"\n')
launcher.chmod(0o755)
(folder/'START-HERE.txt').write_text('''M2.3 R6 - Complete Mac Gameplay Test Package

Target: macOS Apple Silicon. Keep the app and both resource folders together.
Extract the entire ZIP to a writable folder, then open the app or Launch-M2.3-R6-Test.command.
The app registers its sibling resources in a new package-local M2.3-Review-Profile.
Choose Red Alert 2 or Yuri's Revenge, Skirmish, Standard mode, and HD 2X or 4X before a match.

R6 corrects shared airport/oil animation artwork, concrete bridge road/water contact
materials, and retail decimal-comma light tints. Original map layout, gameplay,
animation timing, geometry, owner data and accepted lamp blending are preserved.

M2.3-R6-Temperate-Map-Test-List.txt contains all 61 edition/map entries (RA2 17, YR 44).
Localized map titles are copied from the previously verified native game catalog.
Use the CSV for your results. The declared reusable TEMPERATE artwork is complete;
this does not establish a full-match test of every map. Other theaters retain prior
coverage and complete Original fallback. Resource-budget fallback remains available.

Open M2.3-R6-Offline-Review/Review.html for embedded native before/after comparisons.
Pictures are embedded and shown at their captured size; no network is required.
R6 user visual/gameplay acceptance and coordinated main integration remain pending.
Windows execution and physical-input testing are not established by this Mac package.
No existing user profile, saves, earlier package or historical receipt is replaced.
''')
if revision in ['R7', 'R8', 'R9', 'R10', 'R11', 'R12', 'R13', 'R14', 'R15', 'R16']:
    start = folder/'START-HERE.txt'
    text = start.read_text().replace('R6', revision)
    text = text.replace('Target: macOS Apple Silicon.',
        'R7 fixes the native uppercase building footprints that prevented Hell Hills from loading,\n'
        'and restores crisp oil pump motion. User-accepted R6 airport, lights and bridge contacts remain intact.\n\n'
        'Target: macOS Apple Silicon.')
    start.write_text(text)
    if revision in ['R8', 'R9', 'R10', 'R11', 'R12', 'R13', 'R14', 'R15', 'R16']:
        text = text.replace('R7 fixes the native uppercase building footprints that prevented Hell Hills from loading,\n'
            'and restores crisp oil pump motion. User-accepted R6 airport, lights and bridge contacts remain intact.',
            ('R8 keeps the oil tank fixed and aligned through animation, and includes intact occupied motion review.\n'
             if revision == 'R8' else ('R9 rebuilds the oil mechanism using Original motion and a clean fixed background.\n'
             if revision == 'R9' else ('R10 fills omitted oil walking-beam edge materials while preserving user-accepted R9 alignment.\n' if revision == 'R10' else 'R11 restores complete Original beam anatomy and occlusion with a rigid metal surface.\n'))) +
            'R7 Hell Hills loading and the earlier airport, lights and bridge contacts remain intact.')
        text = text.replace(f'{revision} corrects shared airport/oil animation artwork, concrete bridge road/water contact\n'
            'materials, and retail decimal-comma light tints.',
            ('R8 corrects the oil animation stationary-tank material and isolates the moving walking beam.'
             if revision == 'R8' else ('R9 corrects oil component registration, duplicated mechanisms and rigid linkage materials.'
             if revision == 'R9' else ('R10 corrects only omitted walking-beam edge RGB. Accepted body, linkage and native masks remain exact.' if revision == 'R10' else 'R11 corrects beam surface coverage and edge sampling. Accepted R9 alignment and native masks remain exact.'))))
        start.write_text(text)
    if revision == 'R12':
        text = start.read_text().replace(
            'R11 restores complete Original beam anatomy and occlusion with a rigid metal surface.',
            'R12 restores the pictured R8 oil appearance and removes only its extra stationary walking beam.')
        text = text.replace(
            'R11 corrects beam surface coverage and edge sampling. Accepted R9 alignment and native masks remain exact.',
            'R12 changes only the duplicated beam background. R8 moving beam, drive, body, flag and native masks remain exact.')
        start.write_text(text)
    if revision == 'R13':
        text = start.read_text().replace(
            'R11 restores complete Original beam anatomy and occlusion with a rigid metal surface.',
            'R13 restores complete moving oil components with smooth HD coverage and a clean fixed background.')
        text = text.replace(
            'R11 corrects beam surface coverage and edge sampling. Accepted R9 alignment and native masks remain exact.',
            'R13 repairs walking-beam, rod and crank edges. Logical registration, ownership, native shadows and timing remain unchanged.')
        start.write_text(text)
    if revision == 'R14':
        text = text.replace('R11 restores complete Original beam anatomy and occlusion with a rigid metal surface.',
            'R14 preserves the accepted walking beam and corrects the rear crank to rotate around a fixed shaft without scaling.')
        text = text.replace('R11 corrects beam surface coverage and edge sampling. Accepted R9 alignment and native masks remain exact.',
            'R14 corrects rear crank and connecting-rod motion using Original anatomy. R13 beam, body, ownership and native timing remain unchanged.')
        start.write_text(text)
    if revision == 'R15':
        text = text.replace('R11 restores complete Original beam anatomy and occlusion with a rigid metal surface.',
            'R15 adds the large eccentric counterweight rotating with the crank and rear rod, preserving the accepted R13 walking beam.')
        text = text.replace('R11 corrects beam surface coverage and edge sampling. Accepted R9 alignment and native masks remain exact.',
            'R15 restores the missing large rotating counterweight. Body, ownership, native geometry and timing remain unchanged.')
        start.write_text(text)
    if revision == 'R16':
        text = text.replace('R11 restores complete Original beam anatomy and occlusion with a rigid metal surface.',
            'R16 restores paired rotors and substantial connecting rods on both sides of the fixed housing, preserving the accepted R13 beam.')
        text = text.replace('R11 corrects beam surface coverage and edge sampling. Accepted R9 alignment and native masks remain exact.',
            'R16 corrects rear mechanism size, rigid perspective and near/far occlusion against the Original cycle. Body, ownership, native geometry and timing remain unchanged.')
        start.write_text(text)
receipt = dict(schemaVersion=1, status='COPIED_RUNTIME_SOURCE_PARITY_VERIFIED', folder=str(folder),
    app=str(folder/app_name), resources=str(folder/'RA2-HD-Editions-Resources'),
    uiRoot=str(folder/'RA2-HD-UI-Resources'), executable='RA2 HD Editions', launcher=str(launcher),
    runtimeSourceHead=source_receipt['runtimeSourceHead'], sourceReceiptSha256=digest(args.receipt),
    sourceFolder=str(source), target='darwin-arm64', resourceStorage='independent copies',
    checkedRuntimeEntries=len(source_rows), userVisualAcceptance=f'PENDING_{revision}',
    userGameplayAcceptance='NOT_RECORDED', mainIntegration=False)
save(out/'package-receipt.json',receipt)
inventory = list(entries(folder))
manifest_name = f'M2.3-{revision}-TEST-PACKAGE-MANIFEST.json'
save(folder/manifest_name,{**receipt, 'files':inventory, 'manifestExcludedFromSelfInventory':manifest_name})
subprocess.run(['/usr/bin/codesign','--verify','--deep','--strict',str(folder/app_name)],check=True)
delivery_date = '20261010' if revision in ['R8', 'R9', 'R10', 'R11', 'R12', 'R13', 'R14', 'R15', 'R16'] else '20261009'
archive = out/f'M2.3-{revision}-Desktop-Mac-Test-{delivery_date}.zip'
print('ARCHIVING complete runtime, map checklist and embedded review',flush=True)
subprocess.run(['/usr/bin/ditto','-c','-k','--norsrc','--noextattr','--noqtn','--keepParent',str(folder),str(archive)],check=True)
expected = inventory+[dict(file=manifest_name,type='file',bytes=(folder/manifest_name).stat().st_size,
    sha256=digest(folder/manifest_name),mode=stat.S_IMODE((folder/manifest_name).stat().st_mode))]
print('VERIFYING every archived byte, link and mode',flush=True)
with zipfile.ZipFile(archive) as zipped:
    items=[e for e in zipped.infolist() if not e.is_dir()]
    assert len(items)==len(expected) and len({e.filename for e in items})==len(items)
    assert not any(n.startswith('__MACOSX/') or '-Profile/' in n or '/UserData/' in n for n in zipped.namelist())
    assert {e.filename for e in items}=={folder.name+'/'+r['file'] for r in expected}
    for row in expected:
        entry=zipped.getinfo(folder.name+'/'+row['file']);mode=entry.external_attr>>16
        assert stat.S_IMODE(mode)==row['mode'],row['file']
        with zipped.open(entry) as stream:
            if row['type']=='symlink':
                assert stat.S_ISLNK(mode) and stream.read().decode()==row['target'],row['file']
            else:
                assert stat.S_ISREG(mode) and entry.file_size==row['bytes'],row['file']
                assert hashlib.file_digest(stream,'sha256').hexdigest()==row['sha256'],row['file']
result={**receipt,'status':'PASS_COMPLETE_MAC_ARCHIVE_BYTES_LINKS_MODES_NO_PROFILES',
    'archive':str(archive),'sha256':digest(archive),'bytes':archive.stat().st_size,
    'checkedArchiveEntries':len(expected),'manifestSha256':digest(folder/manifest_name),'codesign':'PASS'}
save(out/'archive-receipt.json',result)
print(json.dumps({k:result[k] for k in ['status','archive','sha256','bytes']}),flush=True)
