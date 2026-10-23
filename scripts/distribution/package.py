"""Build private complete archives and small platform packages from accepted M2 bytes."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import shutil
import stat
import struct
import subprocess
import time
import zipfile

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('phase', choices=['stage', 'archive'])
parser.add_argument('--accepted', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--downloads', type=Path)
parser.add_argument('--reuse-resource-parts-from', type=Path)
args = parser.parse_args()
OUT = args.output.resolve()
WORLD = 'RA2-HD-Editions-Resources'
UI = 'RA2-HD-UI-Resources'

def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def save(file, value):
    file.write_text(json.dumps(value, indent=2) + '\n')

def clone(source, target):
    assert not target.exists(), str(target)
    subprocess.run(['cp', '-cR', str(source), str(target)], check=True)

def inventory(folder):
    rows = []
    for file in sorted(folder.rglob('*')):
        if file.is_symlink():
            assert file.resolve().is_relative_to(folder), str(file)
            rows.append(dict(file=str(file.relative_to(folder)), link=os.readlink(file)))
        elif file.is_file():
            rows.append(dict(file=str(file.relative_to(folder)), bytes=file.stat().st_size, sha256=sha(file)))
    return rows

def configure(payload, kind, head):
    metadata = json.loads((payload / 'package.json').read_text())
    metadata.update(main='desktop/distribution-main.mjs', distributionKind=kind,
                    packagingSourceHead=head, acceptedRuntimeSourceHead=metadata['sourceHead'])
    save(payload / 'package.json', metadata)
    for name in ['distribution-main.mjs', 'distribution-layout.mjs']:
        shutil.copyfile(ROOT / 'desktop' / name, payload / 'desktop' / name)
    icon_dir = payload / 'desktop/icons'
    icon_dir.mkdir(exist_ok=True)
    shutil.copyfile(ROOT / 'desktop/icons/app-icon.png', icon_dir / 'app-icon.png')
    for name in ['README.md', 'LICENSE']:
        shutil.copyfile(ROOT / name, payload / name)
    (payload / 'desktop/packaged-review-main.mjs').unlink(missing_ok=True)

def sign(app):
    subprocess.run(['xattr', '-cr', str(app)], check=True)
    subprocess.run(['codesign', '--force', '--deep', '--sign', '-', str(app)], check=True)
    subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app)], check=True)

def archive(folder, target, rows):
    assert not target.exists(), str(target)
    with zipfile.ZipFile(target, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=1,
                         allowZip64=True, strict_timestamps=False) as z:
        for row in rows:
            file = folder / row['file']
            name = folder.name + '/' + row['file']
            if 'link' in row:
                info = zipfile.ZipInfo(name)
                info.create_system = 3
                info.external_attr = file.lstat().st_mode << 16
                z.writestr(info, row['link'].encode())
            else:
                z.write(file, name)
    with zipfile.ZipFile(target) as z:
        assert len(z.namelist()) == len(set(z.namelist())) == len(rows)
        for row in rows:
            info = z.getinfo(folder.name + '/' + row['file'])
            if 'link' in row:
                assert stat.S_ISLNK(info.external_attr >> 16)
                assert z.read(info).decode() == row['link']
            else:
                assert info.file_size == row['bytes']
                with z.open(info) as stream:
                    assert hashlib.file_digest(stream, 'sha256').hexdigest() == row['sha256'], row['file']
                assert stat.S_IMODE(info.external_attr >> 16) == stat.S_IMODE((folder / row['file']).stat().st_mode)
    return dict(file=target.name, bytes=target.stat().st_size, sha256=sha(target), entries=len(rows))

if args.phase == 'stage':
    OUT.mkdir(parents=True, exist_ok=False)
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT)
    # Reuse exact accepted game bytes; only the distribution bootstrap changes.
    subprocess.run(['git', 'diff', '--exit-code', 'fbaac0f5', '--', 'src', 'public'], cwd=ROOT, check=True)
    accepted = args.accepted.resolve()
    ledger = json.loads((accepted / 'Delivery-Inventory.json').read_text())
    app_source, = accepted.glob('*.app')
    mac = OUT / 'Red Alert 2 HD.app'
    clone(app_source, mac)
    resources = mac / 'Contents/Resources/GameResources'
    clone(accepted / WORLD, resources)
    for source in (accepted / UI).iterdir():
        assert not (resources / source.name).exists(), source.name
        clone(source, resources / source.name)
    protected = []
    for row in ledger['files']:
        relative = Path(row['file'])
        if relative.parts[0] not in [WORLD, UI]:
            continue
        file = resources.joinpath(*relative.parts[1:])
        assert file.stat().st_size == row['bytes'] and sha(file) == row['sha256'], str(file)
        protected.append(dict(file=str(Path(*relative.parts[1:])), bytes=row['bytes'], sha256=row['sha256']))
    assert len(protected) == 13978
    save(OUT / 'resource-inventory.json', protected)
    payload = mac / 'Contents/Resources/app'
    configure(payload, 'complete-macos-arm64', head)
    plist_file = mac / 'Contents/Info.plist'
    plist = plistlib.loads(plist_file.read_bytes())
    plist.update(CFBundleName='Red Alert 2 HD', CFBundleDisplayName='Red Alert 2 HD',
                 CFBundleIdentifier='local.ra2hd.desktop', CFBundleVersion='25',
                 CFBundleIconFile='app-icon.icns',
                 LSApplicationCategoryType='public.app-category.games')
    plist_file.write_bytes(plistlib.dumps(plist))
    shutil.copyfile(ROOT / 'desktop/icons/app-icon.icns', mac / 'Contents/Resources/app-icon.icns')
    sign(mac)
    # Small Mac application has identical game bytes, with no external game data.
    lite_dir = OUT / 'RA2-HD-v0.2-macOS-arm64-program'
    lite_dir.mkdir()
    lite = lite_dir / mac.name
    clone(mac, lite)
    shutil.rmtree(lite / 'Contents/Resources/GameResources')
    configure(lite / 'Contents/Resources/app', 'program-macos-arm64', head)
    sign(lite)
    win = OUT / 'RA2-HD-v0.2-Windows-x64-full'
    win.mkdir()
    electron_version = json.loads((ROOT / 'node_modules/electron/package.json').read_text())['version']
    runtime = args.downloads / f'electron-v{electron_version}-win32-x64.zip'
    checksums = {s.split()[1].lstrip('*'): s.split()[0] for s in (args.downloads / 'SHASUMS256.txt').read_text().splitlines() if s.strip()}
    assert sha(runtime) == checksums[runtime.name]
    with zipfile.ZipFile(runtime) as z:
        assert z.testzip() is None
        for entry in z.infolist():
            p = Path(entry.filename)
            assert not p.is_absolute() and '..' not in p.parts and '\\' not in entry.filename
            assert not stat.S_ISLNK(entry.external_attr >> 16)
        z.extractall(win)
    (win / 'electron.exe').rename(win / 'Red Alert 2 HD.exe')
    subprocess.run(['node', str(ROOT / 'scripts/distribution/windows-icon.mjs'),
                    str(win / 'Red Alert 2 HD.exe'), str(ROOT / 'desktop/icons/app-icon.ico')], check=True)
    if (win / 'electron_wer.dll').exists():
        (win / 'electron_wer.dll').rename(win / 'Red Alert 2 HD_wer.dll')
    clone(payload, win / 'resources/app')
    configure(win / 'resources/app', 'complete-windows-x64', head)
    (win / 'resources/app/desktop/restore-cursor').unlink(missing_ok=True)
    clone(resources, win / 'GameResources')
    # Small Windows program uses the same root layout, without bundled resources.
    win_lite = OUT / 'RA2-HD-v0.2-Windows-x64-program'
    win_lite.mkdir()
    for file in win.iterdir():
        if file.name != 'GameResources':
            clone(file, win_lite / file.name)
    configure(win_lite / 'resources/app', 'program-windows-x64', head)
    instructions = ROOT / 'scripts/distribution'
    for folder in [lite_dir, win_lite]:
        shutil.copyfile(instructions / 'PROGRAM.txt', folder / 'START-HERE.txt')
    shutil.copyfile(instructions / 'WINDOWS-FULL.txt', win / 'START-HERE.txt')
    shutil.copyfile(instructions / 'INSTALL.txt', OUT / 'INSTALL.txt')
    for folder in [win, win_lite]:
        for file in folder.rglob('*'):
            if file.suffix.lower() not in ['.exe', '.dll']:
                continue
            with file.open('rb') as stream:
                assert stream.read(2) == b'MZ'
                stream.seek(0x3c)
                offset = struct.unpack('<I', stream.read(4))[0]
                stream.seek(offset)
                assert stream.read(6) == b'PE\0\0d\x86', str(file)
        assert not list((folder / 'resources/app').rglob('*.node'))
        names = [str(f.relative_to(folder)).casefold() for f in folder.rglob('*') if f.is_file()]
        assert len(names) == len(set(names)), 'Case-insensitive collision'
    save(OUT / 'stage.json', dict(status='STAGED_PENDING_NATIVE_MAC_AND_ARCHIVE_VERIFICATION',
        packagingSourceHead=head, acceptedRuntimeSourceHead='fbaac0f53fc6f0a93b570d8fcf26b2658e68a69b',
        resources=len(protected), mac=str(mac), windows=str(win), electron=electron_version,
        electronArchiveSha256=checksums[runtime.name], windowsRuntime='NOT_RUN_ON_THIS_MAC',
        macSigning='AD_HOC_LOCAL_ONLY_NOT_NOTARIZED', sharedResources='PRIVATE_IMPORT_DATA_INCLUDED'))
    print(json.dumps(dict(phase='STAGED', output=str(OUT))), flush=True)
else:
    stage = json.loads((OUT / 'stage.json').read_text())
    rows = []
    for folder_name, zip_name in [
        ('Red Alert 2 HD.app', 'RA2-HD-v0.2-macOS-arm64-full.zip'),
        ('RA2-HD-v0.2-Windows-x64-full', 'RA2-HD-v0.2-Windows-x64-full.zip'),
        ('RA2-HD-v0.2-macOS-arm64-program', 'RA2-HD-v0.2-macOS-arm64-program.zip'),
        ('RA2-HD-v0.2-Windows-x64-program', 'RA2-HD-v0.2-Windows-x64-program.zip')]:
        folder = OUT / folder_name
        files = inventory(folder)
        save(OUT / (folder_name.replace('.app', '') + '-inventory.json'), files)
        rows.append(archive(folder, OUT / zip_name, files))
        print(json.dumps(dict(phase='ARCHIVE_VERIFIED', **rows[-1])), flush=True)
    # Independent ZIP parts: extract all into the same destination; no join tool needed.
    resource_root = OUT / 'Red Alert 2 HD.app/Contents/Resources/GameResources'
    resource_rows = json.loads((OUT / 'resource-inventory.json').read_text())
    groups, current, size = [], [], 0
    for row in resource_rows:
        assert row['bytes'] < 1500 * 1024**2
        if current and size + row['bytes'] > 1500 * 1024**2:
            groups.append(current)
            current, size = [], 0
        current.append(row)
        size += row['bytes']
    if current:
        groups.append(current)
    reused = {}
    if args.reuse_resource_parts_from:
        previous = json.loads((args.reuse_resource_parts_from / 'archives.json').read_text())
        reused = {row['file']: row for row in previous['files'] if '-private-resources-part' in row['file']}
        assert len(reused) == len(groups)
    for i, group in enumerate(groups, 1):
        target = OUT / f'RA2-HD-v0.2-private-resources-part{i:02d}-of-{len(groups):02d}.zip'
        if reused:
            row = reused[target.name]
            source = args.reuse_resource_parts_from / target.name
            assert source.stat().st_size == row['bytes'] and sha(source) == row['sha256']
            # Reuse only when the archive contains exactly the selected resource bytes.
            with zipfile.ZipFile(source) as z:
                assert set(z.namelist()) == {resource_root.name + '/' + item['file'] for item in group}
                for item in group:
                    with z.open(resource_root.name + '/' + item['file']) as stream:
                        assert hashlib.file_digest(stream, 'sha256').hexdigest() == item['sha256']
            clone(source, target)
        else:
            row = archive(resource_root, target, group)
        assert row['bytes'] < 2 * 1024**3
        rows.append(row)
        print(json.dumps(dict(phase='RESOURCE_PART_VERIFIED', **row)), flush=True)
    save(OUT / 'archives.json', dict(status='ALL_ARCHIVE_PAYLOAD_HASHES_AND_CRC_VERIFIED', files=rows,
        packagingSourceHead=stage['packagingSourceHead'], resourceParts=len(groups),
        windowsRuntime='NOT_RUN_ON_THIS_MAC', userProfilesExcluded=True))
    (OUT / 'SHA256SUMS.txt').write_text(''.join(f'{row["sha256"]}  {row["file"]}\n' for row in rows))
