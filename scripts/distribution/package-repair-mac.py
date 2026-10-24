"""Embed a verified repair runtime and its selected resources in one Mac app."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import stat
import subprocess

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('stage', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--title', default='Red Alert 2 HD Repairs 20261022')
parser.add_argument('--revision', default='long-play-ui-road-markings-v5')
parser.add_argument('--bundle-id', default='local.ra2hd.repairs.20261022')
parser.add_argument('--bundle-version', default='26')
parser.add_argument('--fix', action='append')
args = parser.parse_args()
stage = json.loads((args.stage / 'package-receipt.json').read_text())
output = args.output.resolve()
output.mkdir(parents=True, exist_ok=False)
title = args.title
assert re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9 ._-]{0,100}', title), title
assert re.fullmatch(r'[A-Za-z0-9.-]+', args.bundle_id), args.bundle_id
app = output / (title + '.app')


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def save(file, value):
    file.write_text(json.dumps(value, indent=2) + '\n')


def clone(source, target):
    assert not target.exists(), target
    subprocess.run(['/bin/cp', '-cR', str(source), str(target)], check=True)


def inventory(folder):
    rows = []
    for file in sorted(folder.rglob('*')):
        relative = str(file.relative_to(folder))
        if file.is_symlink():
            assert file.resolve().is_relative_to(folder), file
            rows.append(dict(file=relative, link=os.readlink(file), mode=stat.S_IMODE(file.lstat().st_mode)))
        elif file.is_file():
            rows.append(dict(file=relative, bytes=file.stat().st_size, sha256=sha(file),
                mode=stat.S_IMODE(file.stat().st_mode)))
    return rows


clone(Path(stage['app']), app)
resources = app / 'Contents/Resources/GameResources'
clone(Path(stage['resources']), resources)
for source in Path(stage['uiRoot']).iterdir():
    clone(source, resources / source.name)
expected = {}
for row in stage['files']:
    for original in [Path(stage['resources']), Path(stage['uiRoot'])]:
        prefix = str(original.relative_to(stage['folder'])) + '/'
        if not row['file'].startswith(prefix):
            continue
        assert 'link' not in row
        relative = row['file'][len(prefix):]
        assert relative not in expected, relative
        expected[relative] = dict(file=relative, bytes=row['bytes'], sha256=row['sha256'])
actual = inventory(resources)
assert {row['file'] for row in actual} == set(expected)
for row in actual:
    assert {key: row[key] for key in ['file', 'bytes', 'sha256']} == expected[row['file']], row['file']
save(output / 'resource-inventory.json', list(expected.values()))
print(json.dumps(dict(phase='EMBEDDED_RESOURCES_VERIFIED', files=len(actual),
    bytes=sum(row['bytes'] for row in actual))), flush=True)

payload = app / 'Contents/Resources/app'
for name in ['distribution-main.mjs', 'distribution-layout.mjs']:
    shutil.copyfile(ROOT / 'desktop' / name, payload / 'desktop' / name)
(payload / 'desktop/packaged-review-main.mjs').unlink(missing_ok=True)
wrapper = payload / 'desktop/repair-mac-main.mjs'
wrapper.write_text("""import { app } from 'electron';
import path from 'node:path';

process.env.RA2_DESKTOP_USER_DATA ??= path.join(app.getPath('appData'), PROFILE_TITLE);
await import('./distribution-main.mjs');
""".replace('PROFILE_TITLE', json.dumps(title)))
metadata = json.loads((payload / 'package.json').read_text())
assert metadata['name'] == 'ra2-hd-unified-desktop'
metadata.update(main='desktop/repair-mac-main.mjs', distributionKind='complete-macos-arm64-repair-test',
    repairRevision=args.revision, sourceStatus='UNCOMMITTED_LOCAL_REPAIR_SNAPSHOT')
save(payload / 'package.json', metadata)
icon_dir = payload / 'desktop/icons'
icon_dir.mkdir(exist_ok=True)
shutil.copyfile(ROOT / 'desktop/icons/app-icon.png', icon_dir / 'app-icon.png')
shutil.copyfile(ROOT / 'desktop/icons/app-icon.icns', app / 'Contents/Resources/app-icon.icns')
plist_file = app / 'Contents/Info.plist'
plist = plistlib.loads(plist_file.read_bytes())
plist.update(CFBundleIdentifier=args.bundle_id, CFBundleName=title,
    CFBundleDisplayName=title, CFBundleIconFile='app-icon.icns', CFBundleShortVersionString='0.2.0',
    CFBundleVersion=args.bundle_version, LSApplicationCategoryType='public.app-category.games')
plist_file.write_bytes(plistlib.dumps(plist))
assert (app / 'Contents/MacOS' / plist['CFBundleExecutable']).is_file()
identity_file = Path(stage['build']) / 'identity.json'
identity = json.loads(identity_file.read_text())
unchanged = 0
for row in identity['files']:
    if row['file'] in ['package.json', 'desktop/packaged-review-main.mjs']:
        continue
    file = payload / row['file']
    assert sha(file) == row['sha256'], row['file']
    unchanged += 1
repair = dict(schemaVersion=1, title=title, repairRevision=metadata['repairRevision'],
    sourceHead=stage['runtimeSourceHead'], sourceStatus=metadata['sourceStatus'],
    frozenIdentitySha256=sha(identity_file), visualAcceptance='PENDING',
    target='darwin-arm64', resources='GameResources', userData='~/Library/Application Support/' + title,
    fixes=args.fix or ['Fallback construction-clock transparency', 'Result background under UI memory pressure',
        'Urban HD road routing', 'Intersection and crosswalk markings', 'City lane and slope markings',
        'Urban parking pavement and bay markings'])
save(app / 'Contents/Resources/Repair-Info.json', repair)
subprocess.run(['/usr/bin/xattr', '-cr', str(app)], check=True)
subprocess.run(['/usr/bin/codesign', '--force', '--deep', '--sign', '-', str(app)], check=True)
subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(app)], check=True)
rows = inventory(app)
save(output / 'app-inventory.json', rows)
receipt = dict(status='PASS_SINGLE_APP_ASSEMBLY_PENDING_NATIVE_DESKTOP_CHECK', app=str(app),
    resources=str(resources), executable=plist['CFBundleExecutable'], target='darwin-arm64',
    runtimeSourceHead=stage['runtimeSourceHead'], sourceDirty=stage['sourceDirty'],
    frozenRuntimeFilesUnchanged=unchanged, resourceFiles=len(expected), entries=len(rows),
    logicalBytes=sum(row.get('bytes', 0) for row in rows), sourceStage=str(args.stage.resolve()),
    identity=repair, signing='AD_HOC_DEEP_STRICT_PASS_NOT_NOTARIZED',
    resourceInventorySha256=sha(output / 'resource-inventory.json'), appInventorySha256=sha(output / 'app-inventory.json'))
save(output / 'package-receipt.json', receipt)
print(json.dumps({key: receipt[key] for key in ['status', 'app', 'resourceFiles', 'entries', 'logicalBytes']}), flush=True)
