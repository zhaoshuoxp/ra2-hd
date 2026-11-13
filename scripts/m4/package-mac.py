"""Create one independent Mac app and one verified complete-app ZIP."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import shutil
import stat
import subprocess
import time
import zipfile

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('phase', choices=['stage', 'archive'])
parser.add_argument('--source-app', type=Path)
parser.add_argument('--runtime', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--hashes', type=Path, required=True)
parser.add_argument('--evidence', type=Path, required=True)
parser.add_argument('--zip', type=Path)
parser.add_argument('--extract', type=Path)
args = parser.parse_args()
OUT = args.output.resolve()
EVIDENCE = args.evidence.resolve()
APP = OUT / 'Red Alert 2 HD.app'

def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def save(file, data):
    file.write_text(json.dumps(data, indent=2) + '\n')

def run(command):
    subprocess.run(command, check=True)

def inventory(directory):
    rows = []
    for file in sorted(directory.rglob('*')):
        relative = str(file.relative_to(directory))
        if file.is_symlink():
            assert file.resolve().is_relative_to(directory), relative
            rows.append(dict(file=relative, link=os.readlink(file), mode=stat.S_IMODE(file.lstat().st_mode)))
        elif file.is_file():
            rows.append(dict(file=relative, bytes=file.stat().st_size, sha256=sha(file), mode=stat.S_IMODE(file.stat().st_mode)))
    return rows

if args.phase == 'stage':
    assert args.source_app and args.source_app.is_dir()
    assert not OUT.exists() and not EVIDENCE.exists()
    runtime = args.runtime.resolve()
    frozen = json.loads(Path(str(runtime) + '.json').read_text())
    for row in frozen['sourceFiles']:
        assert sha(ROOT / row['path']) == row['sha256'], 'Frozen source mismatch: ' + row['path']
    OUT.mkdir(parents=True)
    EVIDENCE.mkdir(parents=True)
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    assert not subprocess.check_output(['git', 'diff', 'HEAD', '--', 'src', 'desktop', 'public'], cwd=ROOT)
    assert not subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', 'src', 'desktop', 'public'], cwd=ROOT)
    protection = json.loads((ROOT / '.artifacts/m4-performance-20261112/workspace-before.json').read_text())
    for row in protection['workingFiles']:
        assert sha(ROOT / row['path']) == row['sha256'], row['path']
    source = args.source_app.resolve()
    run(['cp', '-cR', str(source), str(APP)])
    payload = APP / 'Contents/Resources/app'
    metadata = json.loads((payload / 'package.json').read_text())
    shutil.rmtree(payload / 'dist')
    shutil.copytree(runtime / 'dist', payload / 'dist')
    shutil.copytree(runtime / 'desktop', payload / 'desktop', dirs_exist_ok=True)
    shutil.copyfile(runtime / 'LICENSE', payload / 'LICENSE')
    source_digest = hashlib.sha256()
    tracked = subprocess.check_output(['git', 'ls-files', '-z', 'src', 'desktop', 'public'], cwd=ROOT).decode().split('\0')
    for name in sorted(filter(None, tracked)):
        source_digest.update(name.encode() + b'\0' + bytes.fromhex(sha(ROOT / name)))
    metadata.update(main='desktop/m4-review-main.mjs', sourceHead=head, sourceDigest=source_digest.hexdigest(),
                    distributionKind='complete-macos-arm64-m4.1', version='0.5.0')
    save(payload / 'package.json', metadata)
    for row in frozen['files']:
        if row['path'] == 'package.json':
            continue
        assert sha(payload / row['path']) == row['sha256'], row['path']
    resources = APP / 'Contents/Resources/GameResources'
    expected = json.loads(args.hashes.read_text())
    actual_names = sorted(str(p.relative_to(resources)) for p in resources.rglob('*') if p.is_file())
    assert actual_names == sorted(row['path'] for row in expected)
    portable = {'ra2-core-manifest.json', 'yr-core-manifest.json', 'upstream-support/manifest.json'}
    portable_differences = []
    resource_rows = []
    for row in expected:
        file = resources / row['path']
        digest = sha(file)
        if digest != row['sha256']:
            assert row['path'] in portable, row['path']
            # Reuse accepted portable metadata exactly; runtime payloads stay exact.
            assert digest == sha(source / 'Contents/Resources/GameResources' / row['path'])
            portable_differences.append(dict(path=row['path'], canonical=row['sha256'], packaged=digest))
        resource_rows.append(dict(path=row['path'], bytes=file.stat().st_size, sha256=digest))
    save(EVIDENCE / 'resources.json', resource_rows)
    checkpoint = dict(schema='m4-mac-checkpoint-v1', runtimeSourceHead=head, priorAcceptedRuntime='88ac426b84723bc4a0451c221e6a43b35704791b',
                      resourceManifestSha256=sha(EVIDENCE / 'resources.json'), selectedFiles=len(expected),
                      performanceTarget='NOT_PASSED_60_FPS', userAcceptance='PENDING', windows='NOT_RUN_ON_THIS_MAC',
                      defaultProfile='RA2 HD M4.1 Review 20261112', publicVersion='0.5', packageVersion='0.5.0')
    save(APP / 'Contents/Resources/M4.1-Checkpoint.json', checkpoint)
    plist_file = APP / 'Contents/Info.plist'
    plist = plistlib.loads(plist_file.read_bytes())
    plist.update(CFBundleName='Red Alert 2 HD', CFBundleDisplayName='Red Alert 2 HD', CFBundleIdentifier='local.ra2hd.desktop.m41',
                 CFBundleVersion=time.strftime('%Y%m%d%H%M'), CFBundleShortVersionString='0.5.0')
    plist_file.write_bytes(plistlib.dumps(plist))
    run(['xattr', '-cr', str(APP)])
    run(['codesign', '--force', '--deep', '--sign', '-', str(APP)])
    run(['codesign', '--verify', '--deep', '--strict', str(APP)])
    rows = inventory(APP)
    forbidden = {'.git', '.local', '.artifacts', 'IndexedDB', 'Local Storage', 'GPUCache'}
    assert not any(forbidden.intersection(Path(row['file']).parts) for row in rows)
    save(EVIDENCE / 'inventory.json', rows)
    receipt = dict(schema='m4-mac-delivery-v1', status='STAGED_SIGNED', app=str(APP), sourceHead=head, sourceDigest=metadata['sourceDigest'],
                   runtime=str(runtime), resources=str(resources), resourceCount=len(resource_rows), portableMetadataDifferences=portable_differences,
                   inventorySha256=sha(EVIDENCE / 'inventory.json'), files=len(rows), logicalBytes=sum(row.get('bytes', 0) for row in rows),
                   checkpoint=checkpoint)
    save(EVIDENCE / 'receipt.json', receipt)
    print(json.dumps({key: receipt[key] for key in ['status', 'app', 'sourceHead', 'resourceCount', 'files', 'logicalBytes']}))
else:
    assert args.zip and args.extract and not args.zip.exists() and not args.extract.exists()
    receipt = json.loads((EVIDENCE / 'receipt.json').read_text())
    rows = json.loads((EVIDENCE / 'inventory.json').read_text())
    assert sha(EVIDENCE / 'inventory.json') == receipt['inventorySha256']
    args.extract.mkdir(parents=True)
    with zipfile.ZipFile(args.zip, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=1, allowZip64=True, strict_timestamps=False) as archive:
        for row in rows:
            file = APP / row['file']
            name = APP.name + '/' + row['file']
            if 'link' in row:
                info = zipfile.ZipInfo(name)
                info.create_system = 3
                info.external_attr = (stat.S_IFLNK | row['mode']) << 16
                archive.writestr(info, row['link'].encode())
            else:
                assert sha(file) == row['sha256']
                archive.write(file, name)
    with zipfile.ZipFile(args.zip) as archive:
        assert len(archive.namelist()) == len(set(archive.namelist())) == len(rows)
        for row in rows:
            info = archive.getinfo(APP.name + '/' + row['file'])
            target = args.extract / APP.name / row['file']
            assert not Path(row['file']).is_absolute() and '..' not in Path(row['file']).parts
            target.parent.mkdir(parents=True, exist_ok=True)
            if 'link' in row:
                assert stat.S_ISLNK(info.external_attr >> 16)
                assert archive.read(info).decode() == row['link']
                target.symlink_to(row['link'])
            else:
                with archive.open(info) as stream, target.open('xb') as output:
                    shutil.copyfileobj(stream, output, length=1024 * 1024)
                os.chmod(target, row['mode'])
                assert target.stat().st_size == row['bytes'] and sha(target) == row['sha256'], row['file']
                assert stat.S_IMODE(info.external_attr >> 16) == row['mode']
    extracted = args.extract / APP.name
    for row in rows:
        if 'link' in row:
            file = extracted / row['file']
            assert file.resolve().is_relative_to(extracted.resolve()) and os.readlink(file) == row['link']
    run(['codesign', '--verify', '--deep', '--strict', str(extracted)])
    receipt.update(status='ZIP_EXTRACTED_BYTES_MODES_LINKS_SIGNATURE_PASS', zip=dict(path=str(args.zip.resolve()),
                   bytes=args.zip.stat().st_size, sha256=sha(args.zip), entries=len(rows)), extractedApp=str(extracted))
    save(EVIDENCE / 'receipt.json', receipt)
    print(json.dumps({key: receipt[key] for key in ['status', 'zip', 'extractedApp']}))
