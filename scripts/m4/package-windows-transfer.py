"""Stage and verify a portable Windows game/development transfer without old history."""
import argparse
import ctypes
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import struct
import subprocess
import zipfile

REPO = Path(__file__).resolve().parents[2]


def sha(p):
    with p.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def save(p, value):
    p.write_text(json.dumps(value, indent=2) + '\n')


def copy(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    assert not target.exists(), target
    if os.uname().sysname == 'Darwin':
        clone = ctypes.CDLL('/usr/lib/libSystem.B.dylib', use_errno=True).clonefile
        clone.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int]
        if clone(os.fsencode(source), os.fsencode(target), 0) == 0:
            return
    shutil.copy2(source, target)


def files(root):
    return sorted(p for p in root.rglob('*') if p.is_file())


def extract(archive, out, strip_prefix=None):
    with zipfile.ZipFile(archive) as z:
        for item in z.infolist():
            p = Path(item.filename)
            assert not p.is_absolute() and '..' not in p.parts and '\\' not in item.filename
            assert not stat.S_ISLNK(item.external_attr >> 16)
            if item.is_dir():
                continue
            if strip_prefix:
                assert p.parts[0] == strip_prefix
                p = Path(*p.parts[1:])
            target = out / p
            target.parent.mkdir(parents=True, exist_ok=True)
            with z.open(item) as src, target.open('xb') as dst:
                shutil.copyfileobj(src, dst, 4 * 1024 * 1024)


def pe_x64(p):
    with p.open('rb') as f:
        assert f.read(2) == b'MZ'
        f.seek(0x3c)
        offset = struct.unpack('<I', f.read(4))[0]
        f.seek(offset)
        assert f.read(4) == b'PE\0\0'
        assert struct.unpack('<H', f.read(2))[0] == 0x8664


def cmd(out, name, action):
    text = '@echo off\nsetlocal\ncd /d "%~dp0"\n'
    text += 'set "PATH=%~dp0tools\\node;%~dp0tools\\bun;%PATH%"\n'
    text += f'"%~dp0tools\\node\\node.exe" "%~dp0source\\scripts\\m4\\windows-transfer.mjs" {action} %*\n'
    text += 'set "RA2_EXIT=%ERRORLEVEL%"\necho.\nif not "%RA2_EXIT%"=="0" echo Operation failed. Read the error above.\npause\nexit /b %RA2_EXIT%\n'
    (out / name).write_bytes(text.replace('\n', '\r\n').encode())


def stage(args):
    out = args.output.resolve()
    assert not out.exists()
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, text=True).strip()
    assert not subprocess.check_output(['git', 'diff', 'HEAD', '--', 'src', 'desktop', 'public'], cwd=REPO)
    out.mkdir(parents=True)
    downloads = json.loads((args.downloads / 'verified-downloads.json').read_text())
    for row in downloads:
        p = args.downloads / row['file']
        assert p.stat().st_size == row['bytes'] and sha(p) == row['sha256']
    extract(args.downloads / 'electron-v44.4.0-win32-x64.zip', out)
    electron_rows = []
    for p in files(out):
        original = p.relative_to(out).as_posix()
        renamed = {'electron.exe': 'Red Alert 2 HD.exe', 'electron_wer.dll': 'Red Alert 2 HD_wer.dll'}.get(original, original)
        if renamed != original:
            p.rename(out / renamed)
            p = out / renamed
        electron_rows.append(dict(original=original, path=renamed, sha256=sha(p)))
    extract(args.downloads / 'node-v26.13.0-win-x64.zip', out / 'tools/node', 'node-v26.13.0-win-x64')
    extract(args.downloads / 'bun-windows-x64.zip', out / 'tools/bun', 'bun-windows-x64')
    for name in ['Red Alert 2 HD.exe', 'tools/node/node.exe', 'tools/bun/bun.exe']:
        pe_x64(out / name)
    for p in files(args.app / 'Contents/Resources/app'):
        assert not p.is_symlink()
        relative = p.relative_to(args.app / 'Contents/Resources/app')
        if str(relative) == 'desktop/restore-cursor':
            continue
        copy(p, out / 'resources/app' / relative)
    payload = out / 'resources/app'
    package = json.loads((payload / 'package.json').read_text())
    assert package['sourceHead'] == '32c0f11b4118a0f0dac091afff909cc3ec17afaa'
    package.update(main='desktop/windows-transfer-main.mjs', distributionKind='m4.2-windows-x64-transfer',
                   transferSourceHead=head)
    save(payload / 'package.json', package)
    (payload / 'desktop/windows-transfer-main.mjs').write_text(
        "import { app } from 'electron';\nimport path from 'node:path';\n"
        "process.env.RA2_DESKTOP_USER_DATA ??= path.resolve(process.resourcesPath, '../UserData');\n"
        "process.env.RA2_CAMPAIGN_FROZEN_TERRAIN = '0';\n"
        "await import('./distribution-main.mjs');\n")
    print('Windows binaries and frozen application payload staged', flush=True)
    # A shallow export retains the exact prerequisite commit without old source history.
    subprocess.run(['git', 'clone', '--quiet', '--depth', '1', '--single-branch', '--branch', 'main',
                    REPO.as_uri(), str(out / 'source')], check=True)
    for command in [['remote', 'remove', 'origin'], ['config', 'core.autocrlf', 'false'],
                    ['config', 'core.filemode', 'false'], ['config', 'core.longpaths', 'true']]:
        subprocess.run(['git', *command], cwd=out / 'source', check=True)
    shutil.rmtree(out / 'source/.git/logs', ignore_errors=True)
    assert subprocess.check_output(['git', 'rev-list', '--count', 'HEAD'], cwd=out / 'source', text=True).strip() == '1'
    assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=out / 'source')
    (out / 'manifests').mkdir()
    save(out / 'manifests/electron-files.json', electron_rows)
    save(out / 'manifests/downloads.json', downloads)
    for p in args.downloads.glob('*SHASUMS256.txt'):
        copy(p, out / 'manifests' / p.name)
    selected = json.loads(args.hashes.read_text())
    assert len(selected) == 16444
    for i, row in enumerate(selected):
        p = Path(row['path'])
        assert not p.is_absolute() and '..' not in p.parts and '\\' not in row['path']
        target = out / 'GameResources' / p
        copy(REPO / '.local' / p, target)
        assert target.stat().st_size == row['bytes'] and sha(target) == row['sha256'], p
        if i % 4000 == 0:
            print(f'Resources copied and verified: {i}/{len(selected)}', flush=True)
    save(out / 'manifests/resources.json', selected)
    # Carry compact numerical evidence; no profiles, images, runtime copies or credentials.
    evidence_root = REPO / '.artifacts/m4-performance-20261112'
    evidence = ['zip-sustained/report.json', 'zip-sustained/samples.json',
                'zip-sustained-repeat/report.json', 'zip-sustained-repeat/samples.json',
                'zip-check-runtime/report.json', 'zip-check-runtime/samples.json',
                'pixel-parity.json', 'host-final/summary.json']
    for name in evidence:
        p = evidence_root / name
        assert p.is_file(), p
        copy(p, out / 'evidence/mac-m4.1' / name)
    (out / 'evidence/windows').mkdir(parents=True)
    copy(REPO / 'scripts/m4/windows-transfer-prompt.txt', out / 'M4.2-Windows-Codex-Prompt.txt')
    copy(REPO / 'scripts/m4/windows-transfer-readme.txt', out / 'README-FIRST.txt')
    (out / 'AGENTS.md').write_text(
        '# Windows transfer workspace\n\n'
        'Read M4.2-Windows-Codex-Prompt.txt and TRANSFER.json. Develop in source/ on its local main. '
        'Use paths relative to this root and its single GameResources directory. Historical Mac paths '
        'are provenance. Existing unrelated Mac working changes are deliberately absent. '
        'The ready portable app is a frozen baseline until Refresh-Portable.cmd updates it. '
        'Keep user-facing responses in Chinese and newly saved artifacts in English. '
        'Do not push, publish, alter other installations or overwrite real user profiles.\n')
    for name, action in [('Verify-Package.cmd', 'verify'), ('Verify-Resources.cmd', 'verify-resources'),
                         ('Setup-Development.cmd', 'setup'), ('Refresh-Portable.cmd', 'refresh'),
                         ('Run-Benchmark.cmd', 'benchmark'), ('Create-Return.cmd', 'return')]:
        cmd(out, name, action)
    (out / 'Start-Game.cmd').write_bytes(
        b'@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\n'
        b'set "RA2_DESKTOP_USER_DATA=%~dp0UserData"\r\nstart "" "%~dp0Red Alert 2 HD.exe"\r\n')
    (out / 'Collect-System.cmd').write_bytes(
        b'@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\n'
        b'if not exist "evidence\\windows" mkdir "evidence\\windows"\r\n'
        b'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "source\\desktop\\diagnostic-machine.ps1" > "evidence\\windows\\system.json"\r\n'
        b'type "evidence\\windows\\system.json"\r\npause\r\n')
    save(out / 'TRANSFER.json', dict(schema='m4-windows-transfer-v1', sourceHead=head,
         acceptedRuntimeSourceHead=package['sourceHead'], frozenSourceDigest=package['sourceDigest'],
         versions=dict(electron='44.4.0', node='26.13.0', bun='1.3.14'),
         resources=len(selected), resourceBytes=sum(row['bytes'] for row in selected),
         resourceManifestSha256=sha(out / 'manifests/resources.json'),
         originalResourceLedgerSha256=sha(args.hashes), sourceHistory='ONE_SHALLOW_BASE_COMMIT_NO_REMOTE',
         uncommittedMacFilesExported=False, windowsNativeValidation='NOT_RUN_ON_THIS_MAC',
         macStable60Fps='NOT_PASSED', macSustainedCallbackFps=[50.49, 51.36],
         developmentSetup='Bundled Node/Bun, Git required, frozen dependency install needs network once',
         gameResourceCopies=1))
    inventory = []
    seen = set()
    for p in files(out):
        assert not p.is_symlink(), p
        relative = p.relative_to(out).as_posix()
        assert relative.casefold() not in seen, relative
        seen.add(relative.casefold())
        assert all(not any(c in part for c in '<>:"|?*') and not part.endswith(('.', ' ')) for part in Path(relative).parts)
        inventory.append(dict(path=relative, bytes=p.stat().st_size, sha256=sha(p)))
    save(out / 'FILES.json', inventory)
    save(args.receipt, dict(status='PASS_STAGED_STATIC_WINDOWS_NOT_RUN', folder=str(out), sourceHead=head,
         files=len(inventory), bytes=sum(row['bytes'] for row in inventory),
         manifestSha256=sha(out / 'FILES.json'), resources=len(selected)))
    print(json.dumps(json.loads(args.receipt.read_text())), flush=True)


def archive(args):
    out = args.output.resolve()
    rows = json.loads((out / 'FILES.json').read_text())
    rows += [dict(path='FILES.json', bytes=(out / 'FILES.json').stat().st_size, sha256=sha(out / 'FILES.json'))]
    assert not args.zip.exists()
    with zipfile.ZipFile(args.zip, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=1,
                         allowZip64=True, strict_timestamps=False) as z:
        for i, row in enumerate(rows):
            z.write(out / row['path'], out.name + '/' + row['path'])
            if i % 5000 == 0:
                print(f'Archived {i}/{len(rows)}', flush=True)
    # Actually extract the complete archive, then verify each byte against the inventory.
    assert not args.extract.exists()
    args.extract.mkdir(parents=True)
    with zipfile.ZipFile(args.zip) as z:
        assert len(z.infolist()) == len(rows)
        assert len(z.namelist()) == len(set(z.namelist()))
        for row in rows:
            name = out.name + '/' + row['path']
            assert z.getinfo(name).file_size == row['bytes']
            z.extract(name, args.extract)
    extracted = args.extract / out.name
    for i, row in enumerate(rows):
        assert sha(extracted / row['path']) == row['sha256'], row['path']
        if i % 5000 == 0:
            print(f'Extracted bytes verified: {i}/{len(rows)}', flush=True)
    assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=extracted / 'source')
    receipt = dict(status='PASS_ZIP_FULL_EXTRACTION_AND_HASHES_WINDOWS_NOT_RUN', file=str(args.zip),
                   bytes=args.zip.stat().st_size, sha256=sha(args.zip), entries=len(rows),
                   sourceHead=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=extracted / 'source', text=True).strip())
    save(args.receipt, receipt)
    print(json.dumps(receipt), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=['stage', 'archive'])
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--receipt', type=Path, required=True)
    parser.add_argument('--downloads', type=Path)
    parser.add_argument('--app', type=Path)
    parser.add_argument('--hashes', type=Path)
    parser.add_argument('--zip', type=Path)
    parser.add_argument('--extract', type=Path)
    args = parser.parse_args()
    (stage if args.phase == 'stage' else archive)(args)
