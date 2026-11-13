"""Build current-main complete/program packages and shared resource parts."""
import argparse
import ctypes
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


def sha(p):
    with p.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def save(p, value):
    p.write_text(json.dumps(value, indent=2) + '\n')


def clone(a, b):
    assert not b.exists(), b
    b.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['/bin/cp', '-cR', str(a), str(b)], check=True)


def copy_file(a, b):
    assert not b.exists(), b
    b.parent.mkdir(parents=True, exist_ok=True)
    fn = ctypes.CDLL('/usr/lib/libSystem.B.dylib', use_errno=True).clonefile
    fn.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int]
    if fn(os.fsencode(a), os.fsencode(b), 0):
        shutil.copy2(a, b)


def inventory(root):
    rows = []
    for p in sorted(root.rglob('*')):
        relative = p.relative_to(root).as_posix()
        if p.is_symlink():
            assert p.resolve().is_relative_to(root.resolve()), p
            rows.append(dict(file=relative, link=os.readlink(p), mode=stat.S_IMODE(p.lstat().st_mode)))
        elif p.is_file():
            rows.append(dict(file=relative, bytes=p.stat().st_size, sha256=sha(p), mode=stat.S_IMODE(p.stat().st_mode)))
    return rows


def sign(app):
    for cmd in [['xattr', '-cr', str(app)], ['codesign', '--force', '--deep', '--sign', '-', str(app)],
                ['codesign', '--verify', '--deep', '--strict', str(app)]]:
        subprocess.run(cmd, check=True)


def stage(args):
    out = args.output.resolve(); out.mkdir(parents=True, exist_ok=False)
    runtime = args.runtime.resolve()
    frozen = json.loads(Path(str(runtime) + '.json').read_text())
    for row in frozen['sourceFiles']:
        assert sha(ROOT / row['path']) == row['sha256'], row['path']
    assert not subprocess.check_output(['git', 'diff', 'HEAD', '--', 'src', 'desktop', 'public'], cwd=ROOT)
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    source_digest = hashlib.sha256(json.dumps(frozen['sourceFiles'], separators=(',', ':')).encode()).hexdigest()
    mac = out / 'Red Alert 2 HD.app'
    clone(ROOT / 'node_modules/electron/dist/Electron.app', mac)
    (mac / 'Contents/MacOS/Electron').rename(mac / 'Contents/MacOS/RA2 HD Editions')
    payload = mac / 'Contents/Resources/app'; payload.mkdir()
    for name in ['dist', 'desktop', 'LICENSE']:
        clone(runtime / name, payload / name)
    for name in ['README.md', 'README.zh-CN.md']:
        if (ROOT / name).exists(): copy_file(ROOT / name, payload / name)
    copy_file(ROOT / 'node_modules/electron/LICENSE', payload / 'ELECTRON-LICENSE')
    metadata = dict(name='ra2-hd-unified-desktop', version='0.5.0', private=True, type='module',
                    main='desktop/distribution-main.mjs', sourceHead=head,
                    sourceDigest=source_digest, frozenSourceHead=frozen['sourceHead'],
                    distributionKind='complete-macos-arm64')
    save(payload / 'package.json', metadata)
    resources = mac / 'Contents/Resources/GameResources'
    rows = json.loads(args.hashes.read_text())
    for i, row in enumerate(rows):
        relative = Path(row['path']); assert not relative.is_absolute() and '..' not in relative.parts
        target = resources / relative; copy_file(ROOT / '.local' / relative, target)
        assert target.stat().st_size == row['bytes'] and sha(target) == row['sha256'], relative
        if i % 5000 == 0: print('Verified resources', i, '/', len(rows), flush=True)
    save(out / 'resource-inventory.json', rows)
    copy_file(ROOT / 'desktop/icons/app-icon.icns', mac / 'Contents/Resources/app-icon.icns')
    plist_path = mac / 'Contents/Info.plist'; plist = plistlib.loads(plist_path.read_bytes())
    plist.update(CFBundleName='Red Alert 2 HD', CFBundleDisplayName='Red Alert 2 HD',
                 CFBundleExecutable='RA2 HD Editions', CFBundleIdentifier='local.ra2hd.desktop',
                 CFBundleShortVersionString='0.5.0', CFBundleVersion=time.strftime('%Y%m%d%H%M'),
                 CFBundleIconFile='app-icon.icns', LSApplicationCategoryType='public.app-category.games')
    plist_path.write_bytes(plistlib.dumps(plist)); sign(mac)
    mac_program = out / 'RA2-HD-v0.5-macOS-arm64-program'; mac_program.mkdir()
    clone(mac, mac_program / mac.name)
    shutil.rmtree(mac_program / mac.name / 'Contents/Resources/GameResources')
    value = dict(metadata, distributionKind='program-macos-arm64')
    save(mac_program / mac.name / 'Contents/Resources/app/package.json', value)
    sign(mac_program / mac.name)
    archive = args.downloads / 'electron-v44.4.0-win32-x64.zip'
    checksums = {s.split()[1].lstrip('*'): s.split()[0] for s in (args.downloads / 'electron-SHASUMS256.txt').read_text().splitlines() if s.strip()}
    assert sha(archive) == checksums[archive.name]
    win = out / 'RA2-HD-v0.5-Windows-x64-full'; win.mkdir()
    with zipfile.ZipFile(archive) as z:
        for entry in z.infolist():
            p = Path(entry.filename)
            assert not p.is_absolute() and '..' not in p.parts and '\\' not in entry.filename
            assert not stat.S_ISLNK(entry.external_attr >> 16)
        z.extractall(win)
    (win / 'electron.exe').rename(win / 'Red Alert 2 HD.exe')
    if (win / 'electron_wer.dll').exists(): (win / 'electron_wer.dll').rename(win / 'Red Alert 2 HD_wer.dll')
    subprocess.run(['node', str(ROOT / 'scripts/distribution/windows-icon.mjs'), str(win / 'Red Alert 2 HD.exe'), str(ROOT / 'desktop/icons/app-icon.ico')], check=True)
    clone(payload, win / 'resources/app')
    save(win / 'resources/app/package.json', dict(metadata, distributionKind='complete-windows-x64'))
    (win / 'resources/app/desktop/restore-cursor').unlink(missing_ok=True)
    clone(resources, win / 'GameResources')
    win_program = out / 'RA2-HD-v0.5-Windows-x64-program'; win_program.mkdir()
    for p in win.iterdir():
        if p.name != 'GameResources': clone(p, win_program / p.name)
    save(win_program / 'resources/app/package.json', dict(metadata, distributionKind='program-windows-x64'))
    for folder in [win, win_program]:
        for p in folder.rglob('*'):
            if p.suffix.lower() not in ['.exe', '.dll']: continue
            with p.open('rb') as f:
                assert f.read(2) == b'MZ'; f.seek(0x3c); offset = struct.unpack('<I', f.read(4))[0]; f.seek(offset)
                assert f.read(6) == b'PE\0\0d\x86', p
        names = [p.relative_to(folder).as_posix().casefold() for p in folder.rglob('*') if p.is_file()]
        assert len(names) == len(set(names))
    for folder in [mac_program, win_program]: copy_file(ROOT / 'scripts/distribution/PROGRAM.txt', folder / 'START-HERE.txt')
    copy_file(ROOT / 'scripts/distribution/WINDOWS-FULL.txt', win / 'START-HERE.txt')
    copy_file(ROOT / 'scripts/distribution/INSTALL.txt', out / 'INSTALL.txt')
    save(out / 'stage.json', dict(status='STAGED_PENDING_NATIVE_MAC_AND_ARCHIVE_CHECKS', packagingSourceHead=head,
        runtimeSourceHead=head, frozenSourceHead=frozen['sourceHead'], sourceDigest=source_digest,
        mac=str(mac), windows=str(win), resources=len(rows), resourceBytes=sum(r['bytes'] for r in rows),
        windowsRuntime='NOT_RUN_ON_THIS_MAC', shadowInstancing='OFF_BY_DEFAULT', stable60Fps='NOT_PASSED',
        electronArchiveSha256=checksums[archive.name]))
    print('STAGED', out, flush=True)


def archive_one(root, target, rows):
    assert not target.exists()
    with zipfile.ZipFile(target, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=1, allowZip64=True, strict_timestamps=False) as z:
        for row in rows:
            name = root.name + '/' + row['file']; p = root / row['file']
            if 'link' in row:
                info = zipfile.ZipInfo(name); info.create_system = 3
                info.external_attr = (stat.S_IFLNK | row['mode']) << 16; z.writestr(info, row['link'].encode())
            else: z.write(p, name)
    with zipfile.ZipFile(target) as z:
        assert len(z.namelist()) == len(set(z.namelist())) == len(rows)
        for row in rows:
            info = z.getinfo(root.name + '/' + row['file'])
            if 'link' in row:
                assert z.read(info).decode() == row['link'] and stat.S_ISLNK(info.external_attr >> 16)
            else:
                assert info.file_size == row['bytes']
                with z.open(info) as f: assert hashlib.file_digest(f, 'sha256').hexdigest() == row['sha256'], row['file']
                assert stat.S_IMODE(info.external_attr >> 16) == row['mode']
    return dict(file=target.name, bytes=target.stat().st_size, sha256=sha(target), entries=len(rows))


def archives(args):
    out = args.output.resolve(); stage = json.loads((out / 'stage.json').read_text()); results = []
    cache_path = out / 'archive-cache.json'
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    def cached_archive(root, target, rows):
        identity = hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()
        cache.update(json.loads(cache_path.read_text()) if cache_path.exists() else {})
        prior = cache.get(target.name)
        if target.exists():
            assert prior and prior['inventory'] == identity and sha(target) == prior['receipt']['sha256']
            return prior['receipt']
        receipt = archive_one(root, target, rows)
        cache.update(json.loads(cache_path.read_text()) if cache_path.exists() else {})
        cache[target.name] = dict(inventory=identity, receipt=receipt)
        save(cache_path, cache)
        return receipt
    folders = ['Red Alert 2 HD.app', 'RA2-HD-v0.5-Windows-x64-full', 'RA2-HD-v0.5-macOS-arm64-program', 'RA2-HD-v0.5-Windows-x64-program']
    for name in folders:
        if args.only == 'windows' and name != 'RA2-HD-v0.5-Windows-x64-full': continue
        root = out / name; rows = inventory(root)
        save(out / (name.replace('.app', '') + '-inventory.json'), rows)
        zip_name = 'RA2-HD-v0.5-macOS-arm64-full.zip' if name.endswith('.app') else name + '.zip'
        results.append(cached_archive(root, out / zip_name, rows)); print('VERIFIED', zip_name, flush=True)
    if args.only == 'windows': return
    root = out / 'Red Alert 2 HD.app/Contents/Resources/GameResources'
    source = json.loads((out / 'resource-inventory.json').read_text()); groups = []; group = []; size = 0
    for row in source:
        assert row['bytes'] < 1500 * 1024**2
        if group and size + row['bytes'] > 1500 * 1024**2: groups.append(group); group = []; size = 0
        p = root / row['path']; group.append(dict(file=row['path'], bytes=row['bytes'], sha256=row['sha256'], mode=stat.S_IMODE(p.stat().st_mode))); size += row['bytes']
    if group: groups.append(group)
    for i, group in enumerate(groups, 1):
        target = out / f'RA2-HD-v0.5-private-resources-part{i:02d}-of-{len(groups):02d}.zip'
        results.append(cached_archive(root, target, group)); print('VERIFIED', target.name, flush=True)
    save(out / 'archives.json', dict(status='ALL_ARCHIVE_PAYLOAD_HASHES_AND_CRC_VERIFIED', files=results,
        packagingSourceHead=stage['packagingSourceHead'], resourceParts=len(groups), windowsRuntime='NOT_RUN_ON_THIS_MAC', userProfilesExcluded=True))
    (out / 'SHA256SUMS.txt').write_text(''.join(f'{r["sha256"]}  {r["file"]}\n' for r in results))


def verify_extraction(args):
    out = args.output.resolve(); destination = args.extract.resolve()
    destination.mkdir(parents=True, exist_ok=False)
    verified = []
    pairs = [('Red Alert 2 HD.app', 'RA2-HD-v0.5-macOS-arm64-full.zip'),
             ('RA2-HD-v0.5-Windows-x64-full', 'RA2-HD-v0.5-Windows-x64-full.zip')]
    for folder, name in pairs:
        rows = json.loads((out / (folder.replace('.app', '') + '-inventory.json')).read_text())
        with zipfile.ZipFile(out / name) as z:
            for row in rows:
                relative = Path(row['file']); assert not relative.is_absolute() and '..' not in relative.parts
                info = z.getinfo(folder + '/' + row['file']); target = destination / folder / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                if 'link' in row:
                    assert z.read(info).decode() == row['link'] and stat.S_ISLNK(info.external_attr >> 16)
                    target.symlink_to(row['link'])
                    assert target.resolve().is_relative_to((destination / folder).resolve())
                else:
                    with z.open(info) as src, target.open('xb') as dst: shutil.copyfileobj(src, dst, 4 * 1024 * 1024)
                    os.chmod(target, row['mode'])
                    assert target.stat().st_size == row['bytes'] and sha(target) == row['sha256'], target
        if folder.endswith('.app'):
            subprocess.run(['codesign', '--verify', '--deep', '--strict', str(destination / folder)], check=True)
        verified.append(dict(archive=name, entries=len(rows)))
        print('EXTRACTION_VERIFIED', name, flush=True)
    save(out / 'extraction.json', dict(status='PASS_FULL_ZIP_EXTRACTION_HASHES_AND_MAC_SIGNATURE',
        root=str(destination), archives=verified, windowsRuntime='NOT_RUN_ON_THIS_MAC'))


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__); p.add_argument('phase', choices=['stage', 'archive', 'verify'])
    p.add_argument('--only', choices=['all', 'windows'], default='all')
    for name in ['output', 'runtime', 'hashes', 'downloads', 'extract']: p.add_argument('--' + name, type=Path, required=name == 'output')
    args = p.parse_args(); {'stage': stage, 'archive': archives, 'verify': verify_extraction}[args.phase](args)
