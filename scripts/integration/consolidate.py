#!/usr/bin/env python3
"""Inventory, preserve and retire the explicitly selected completed worktrees."""
import argparse
import base64
import ctypes
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import time
import zipfile

BASE = Path('/Users/Aone/RA2remaster')
MAIN = BASE / 'ra2-hd'
ARCHIVE = BASE / 'archives/2026-10-05-final-cd'
NAMES = [
    'ra2-hd-allied-corrections', 'ra2-hd-allied-loading-integration',
    'ra2-hd-lunar-infantry-20261004', 'ra2-hd-shared-cameos-20261004',
    'ra2-hd-skirmish-loading', 'ra2-hd-yagntc-arc-20261001',
    'ra2-hd-yuri-cameos', 'ra2-hd-yuri-feedback-r4-20261001',
    'ra2-hd-yuri-feedback-r5-20261001', 'ra2-hd-yuri-units',
]
TASK = MAIN / '.artifacts/main-integration-20261005'
EXTRA = [TASK / name for name in ['build-v1', 'build-v2', 'package-v1', 'package-v2']]
EXTRA += [BASE / 'deliveries/RA2-HD-Main-CD-20261005-e65bda4-macOS-arm64']
ROLLBACKS = [
    BASE / NAMES[2] / '.artifacts/lunar-infantry/archive-v1/RA2-HD-Main-Lunar-Infantry-R1-20261004-c048f6f-macOS-arm64.zip',
    BASE / NAMES[-1] / '.artifacts/yuri-units/feedback-r12/package-v1/RA2-HD-Yuri-Units-D-R12-macOS-arm64.zip',
]
LIBC = ctypes.CDLL('/usr/lib/libSystem.B.dylib', use_errno=True)
LIBC.clonefile.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int]
LIBC.listxattr.argtypes = [ctypes.c_char_p, ctypes.c_void_p, ctypes.c_size_t, ctypes.c_int]
LIBC.getxattr.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_void_p,
                         ctypes.c_size_t, ctypes.c_uint32, ctypes.c_int]
LIBC.setxattr.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_void_p,
                         ctypes.c_size_t, ctypes.c_uint32, ctypes.c_int]
LIBC.listxattr.restype = LIBC.getxattr.restype = ctypes.c_ssize_t


def git(*args, cwd=MAIN):
    return subprocess.check_output(['git', *args], cwd=cwd, text=True).strip()


def save(path, data):
    with path.open('x') as stream:
        json.dump(data, stream, indent=2)
        stream.write('\n')


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def stamp(path):
    s = path.lstat()
    return {'bytes': s.st_size, 'allocatedBytes': s.st_blocks * 512,
            'mode': stat.S_IMODE(s.st_mode), 'inode': s.st_ino,
            'mtimeNs': s.st_mtime_ns, 'device': s.st_dev}


def volume():
    s = os.statvfs(BASE)
    return {'time': time.time(), 'availableBytes': s.f_bavail * s.f_frsize,
            'freeBytes': s.f_bfree * s.f_frsize, 'totalBytes': s.f_blocks * s.f_frsize}


def entries(root):
    stack = [root]
    while stack:
        p = stack.pop()
        if p == root / '.git':
            continue
        s = p.lstat()
        if stat.S_ISDIR(s.st_mode):
            yield p, 'directory'
            stack.extend(sorted(p.iterdir(), reverse=True))
        elif stat.S_ISLNK(s.st_mode):
            yield p, 'symlink'
        elif stat.S_ISREG(s.st_mode):
            yield p, 'file'
        else:
            raise RuntimeError(f'Unknown file type: {p}')


def copy_exclusive(source, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    if LIBC.clonefile(os.fsencode(source), os.fsencode(destination), 0) != 0:
        if destination.exists():
            raise FileExistsError(destination)
        with source.open('rb') as src, destination.open('xb') as dst:
            shutil.copyfileobj(src, dst, 4 * 1024 * 1024)


def object_path(sha):
    return ARCHIVE / 'objects' / sha[:2] / sha


def store_file(source, sha):
    target = object_path(sha)
    if not target.exists():
        copy_exclusive(source, target)
        assert digest(target) == sha, source
        target.chmod(0o444)


def xattrs(path):
    encoded = os.fsencode(path)
    size = LIBC.listxattr(encoded, None, 0, 1)
    if size < 0:
        raise OSError(ctypes.get_errno(), str(path))
    buffer = ctypes.create_string_buffer(size)
    count = LIBC.listxattr(encoded, buffer, size, 1)
    if count < 0:
        raise OSError(ctypes.get_errno(), str(path))
    result = {}
    for name in buffer.raw[:count].split(b'\0'):
        if not name:
            continue
        length = LIBC.getxattr(encoded, name, None, 0, 0, 1)
        if length < 0:
            raise OSError(ctypes.get_errno(), str(path))
        value = ctypes.create_string_buffer(length)
        read = LIBC.getxattr(encoded, name, value, length, 0, 1)
        if read < 0:
            raise OSError(ctypes.get_errno(), str(path))
        result[name.decode()] = base64.b64encode(value.raw[:read]).decode()
    return result


def set_xattr(path, name, data):
    value = ctypes.create_string_buffer(data)
    if LIBC.setxattr(os.fsencode(path), name.encode(), value, len(data), 0, 1) != 0:
        raise OSError(ctypes.get_errno(), str(path))


def archive_zip(source, sha, index):
    """Preserve obsolete portable ZIP contents once, without recompressing media."""
    destination = ARCHIVE / 'zip-manifests' / (sha + '.jsonl')
    if destination.exists():
        return str(destination.relative_to(ARCHIVE))
    rows = []
    with zipfile.ZipFile(source) as z:
        for info in z.infolist():
            p = Path(info.filename)
            assert not p.is_absolute() and '..' not in p.parts, info.filename
            mode = info.external_attr >> 16
            kind = 'directory' if info.is_dir() else 'symlink' if stat.S_ISLNK(mode) else 'file'
            row = {'path': info.filename, 'kind': kind, 'mode': stat.S_IMODE(mode),
                   'dateTime': info.date_time, 'bytes': info.file_size, 'crc32': info.CRC,
                   'externalAttr': info.external_attr, 'extra': base64.b64encode(info.extra).decode()}
            if kind != 'directory':
                h = hashlib.sha256()
                with z.open(info) as stream:
                    for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
                        h.update(block)
                row['sha256'] = h.hexdigest()
                if kind == 'symlink':
                    row['target'] = z.read(info).decode()
                elif not object_path(row['sha256']).exists():
                    target = object_path(row['sha256'])
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with z.open(info) as src, target.open('xb') as dst:
                        shutil.copyfileobj(src, dst, 4 * 1024 * 1024)
                    assert digest(target) == row['sha256']
                    target.chmod(0o444)
                if kind == 'file':
                    index[row['sha256']] = row['bytes']
            rows.append(row)
    destination.parent.mkdir(exist_ok=True)
    with destination.open('x') as stream:
        for row in rows:
            stream.write(json.dumps(row) + '\n')
    return str(destination.relative_to(ARCHIVE))


def inventory():
    assert not ARCHIVE.exists(), 'Archive must be new; never overwrite prior evidence.'
    ARCHIVE.mkdir(parents=True, mode=0o700)
    rows = []
    for root in [BASE / n for n in NAMES] + EXTRA:
        tracked = root.name in NAMES
        status = git('status', '--porcelain=v1', cwd=root) if tracked else None
        assert not status, (root, status)
        head = git('rev-parse', 'HEAD', cwd=root) if tracked else None
        if tracked:
            subprocess.run(['git', 'merge-base', '--is-ancestor', head, 'main'], cwd=MAIN, check=True)
        counts = {'file': 0, 'directory': 0, 'symlink': 0}
        logical = allocated = 0
        for p, kind in entries(root):
            counts[kind] += 1
            s = p.lstat()
            allocated += s.st_blocks * 512
            if kind == 'file':
                logical += s.st_size
        rows.append({'path': str(root), 'id': root.relative_to(BASE).as_posix().replace('/', '__'),
                     'classification': 'ARCHIVE', 'worktree': tracked, 'head': head,
                     'gitStatus': status, 'includedInMain': tracked,
                     'logicalBytes': logical, 'allocatedBytes': allocated, 'counts': counts,
                     'reason': 'Completed integrated work or superseded task-local package; preserve all unique contents before retirement.'})
        print(json.dumps({'inventory': root.name, 'allocatedBytes': allocated}), flush=True)
    keep = [
        {'path': str(MAIN), 'classification': 'KEEP_ACTIVE', 'reason': 'Canonical main, selected resources, imports, user data and current evidence.'},
        {'path': str(BASE / 'Resource'), 'classification': 'KEEP_ACTIVE', 'reason': 'Read-only original retail installation.'},
        {'path': str(BASE / 'archives/2026-09-24-accepted-integration'), 'classification': 'KEEP_ROLLBACK', 'reason': 'Existing verified historical archive; untouched.'},
        {'path': str(BASE / 'deliveries/RA2-HD-Main-CD-20261005-ba7a6d2-macOS-arm64'), 'classification': 'KEEP_ACTIVE', 'reason': 'Current copied combined delivery with independent resources and profile.'},
        {'path': str(BASE / 'rollback'), 'classification': 'KEEP_ROLLBACK', 'reason': 'Exact last-known-good C/LUNR ZIP and accepted D/R12 ZIP.'},
    ]
    save(ARCHIVE / 'inventory.json', {'schemaVersion': 1, 'status': 'INVENTORIED_BEFORE_MUTATION',
        'mainHead': git('rev-parse', 'main'), 'volumeBefore': volume(), 'roots': rows, 'retained': keep,
        'allocatedSpaceMeaning': 'Sum of st_blocks, including shared APFS extents; not private physical allocation.',
        'desktop': {'path': '/Users/Aone/Desktop', 'ra2Entries': [], 'action': 'NONE'},
        'holds': [], 'sourceDeletionAuthorized': False})


def archive():
    inv = json.loads((ARCHIVE / 'inventory.json').read_text())
    assert not git('status', '--porcelain=v1'), 'Promote and commit main before archival.'
    assert git('branch', '--show-current') == 'main'
    (ARCHIVE / 'manifests').mkdir(exist_ok=True)
    (BASE / 'rollback').mkdir(exist_ok=True)
    retained = {}
    for source in ROLLBACKS:
        destination = BASE / 'rollback' / source.name
        sha = digest(source)
        if not destination.exists():
            copy_exclusive(source, destination)
        assert digest(destination) == sha
        retained[str(source)] = {'file': str(destination), 'sha256': sha, 'bytes': source.stat().st_size}
    rollback_receipt = ARCHIVE / 'rollback.json'
    if rollback_receipt.exists():
        assert json.loads(rollback_receipt.read_text()) == retained
    else:
        save(rollback_receipt, retained)
    bundle = ARCHIVE / 'source-before-cleanup.bundle'
    if not bundle.exists():
        subprocess.run(['git', 'bundle', 'create', str(bundle), '--all'], cwd=MAIN, check=True)
    result = subprocess.run(['git', 'bundle', 'verify', str(ARCHIVE / 'source-before-cleanup.bundle')], cwd=MAIN, text=True, capture_output=True, check=True)
    (ARCHIVE / 'bundle-verification.txt').write_text(result.stdout + result.stderr)
    (ARCHIVE / 'refs.txt').write_text(git('show-ref') + '\n')
    objects = {p.name: p.stat().st_size for p in (ARCHIVE / 'objects').glob('*/*')}
    manifests = []
    for item in inv['roots']:
        root = Path(item['path'])
        target = ARCHIVE / 'manifests' / (item['id'] + '.jsonl')
        done = ARCHIVE / ('archived-' + item['id'] + '.json')
        if done.exists():
            completed = json.loads(done.read_text())
            assert digest(target) == completed['sha256']
            manifests.append(completed)
            continue
        if target.exists():
            failures = ARCHIVE / 'failed-attempts'
            failures.mkdir(exist_ok=True)
            target.rename(failures / (target.name + '.' + str(time.time_ns())))
        count = 0
        with target.open('x') as stream:
            for p, kind in entries(root):
                before = stamp(p)
                row = {'path': p.relative_to(root).as_posix(), 'kind': kind,
                       'classification': 'ARCHIVE', **before}
                if kind == 'file':
                    sha = digest(p)
                    row['sha256'] = sha
                    if str(p) in retained:
                        row['retainedFile'] = retained[str(p)]['file']
                        row['classification'] = 'KEEP_ROLLBACK'
                    elif p.suffix == '.zip' and p.name.startswith('RA2-HD-'):
                        row['kind'] = 'expandedZip'
                        row['classification'] = 'REMOVE_REDUNDANT'
                        row['zipManifest'] = archive_zip(p, sha, objects)
                        row['zipManifestSha256'] = digest(ARCHIVE / row['zipManifest'])
                    else:
                        if object_path(sha).exists():
                            row['classification'] = 'REMOVE_REDUNDANT'
                        store_file(p, sha)
                        objects[sha] = before['bytes']
                    row['xattrs'] = xattrs(p)
                    assert before == stamp(p), f'Changed during archival: {p}'
                elif kind == 'symlink':
                    row['target'] = os.readlink(p)
                stream.write(json.dumps(row) + '\n')
                count += 1
                if count % 10000 == 0:
                    print(json.dumps({'root': root.name, 'entries': count, 'objects': len(objects)}), flush=True)
        completed = {'root': str(root), 'manifest': str(target.relative_to(ARCHIVE)), 'sha256': digest(target), 'entries': count}
        save(done, completed)
        manifests.append(completed)
        print(json.dumps({'archived': str(root), 'entries': count, 'objects': len(objects)}), flush=True)
    receipt_path = ARCHIVE / 'archive-receipt.json'
    if receipt_path.exists():
        receipt_path.rename(ARCHIVE / ('archive-receipt-' + str(time.time_ns()) + '.json'))
    save(receipt_path, {'status': 'ARCHIVED_PENDING_VERIFY', 'manifests': manifests,
        'objects': len(objects), 'uniqueObjectBytes': sum(objects.values()), 'volumeAfterArchive': volume(),
        'portableZipPolicy': 'Superseded portable ZIP containers are replaced by exact member contents, hashes, modes, symlinks and ZIP metadata. Original compressed byte identity is recorded but not reconstructible. Rollback ZIPs and trace/source archives retain original bytes.'})


def restore_entry(row, destination):
    assert row['kind'] in ['file', 'symlink', 'directory']
    destination.parent.mkdir(parents=True, exist_ok=True)
    if row['kind'] == 'directory':
        destination.mkdir(exist_ok=True)
    elif row['kind'] == 'symlink':
        os.symlink(row['target'], destination)
    else:
        source = Path(row['retainedFile']) if row.get('retainedFile') else object_path(row['sha256'])
        with source.open('rb') as src, destination.open('xb') as dst:
            shutil.copyfileobj(src, dst, 4 * 1024 * 1024)
        assert digest(destination) == row['sha256']
        for name, value in row.get('xattrs', {}).items():
            set_xattr(destination, name, base64.b64decode(value))
    if row['kind'] != 'symlink':
        destination.chmod(row['mode'] or (0o755 if row['kind'] == 'directory' else 0o644))
    if row.get('mtimeNs') is not None:
        os.utime(destination, ns=(row['mtimeNs'], row['mtimeNs']), follow_symlinks=False)


def verify():
    receipt = json.loads((ARCHIVE / 'archive-receipt.json').read_text())
    verified = 0
    for p in (ARCHIVE / 'objects').glob('*/*'):
        assert digest(p) == p.name, p
        verified += 1
        if verified % 10000 == 0:
            print(json.dumps({'verifiedObjects': verified}), flush=True)
    samples = []
    for item in receipt['manifests']:
        manifest = ARCHIVE / item['manifest']
        assert digest(manifest) == item['sha256']
        selected = {}
        with manifest.open() as stream:
            for line in stream:
                row = json.loads(line)
                if row['kind'] == 'file':
                    source = Path(row['retainedFile']) if row.get('retainedFile') else object_path(row['sha256'])
                    assert source.stat().st_size == row['bytes']
                    if row.get('retainedFile'):
                        assert digest(source) == row['sha256']
                    suffix = Path(row['path']).suffix
                    if suffix in ['.png', '.webm', '.json', '.md', '.py', '.mjs']:
                        selected.setdefault(suffix, row)
                    if row['mode'] & 0o111:
                        selected.setdefault('executable', row)
                elif row['kind'] == 'expandedZip':
                    assert digest(ARCHIVE / row['zipManifest']) == row['zipManifestSha256']
                    with (ARCHIVE / row['zipManifest']).open() as z:
                        for entry in map(json.loads, z):
                            if entry['kind'] == 'file':
                                assert object_path(entry['sha256']).stat().st_size == entry['bytes']
                                selected.setdefault('zip-member', entry)
                                if entry['mode'] & 0o111:
                                    selected.setdefault('zip-executable', entry)
                            elif entry['kind'] == 'symlink':
                                selected.setdefault('zip-symlink', entry)
                elif row['kind'] == 'symlink':
                    selected.setdefault('symlink', row)
        for label, row in selected.items():
            dst = ARCHIVE / 'restore-check' / Path(item['manifest']).stem / label
            restore_entry(row, dst)
            if row['kind'] == 'symlink':
                assert os.readlink(dst) == row['target']
            else:
                assert stat.S_IMODE(dst.stat().st_mode) == row['mode']
                if row.get('xattrs'):
                    assert xattrs(dst) == row['xattrs']
            samples.append({'sourceRoot': item['root'], 'path': row['path'], 'restored': str(dst), 'kind': row['kind']})
    for source, row in json.loads((ARCHIVE / 'rollback.json').read_text()).items():
        with zipfile.ZipFile(row['file']) as z:
            choices = [i for i in z.infolist() if i.filename.endswith('/Contents/Info.plist') or i.filename.endswith('/ui-selection.json')]
            assert choices
            for i in choices[:2]:
                data = z.read(i)
                dst = ARCHIVE / 'restore-check' / Path(row['file']).stem / 'zip-members' / i.filename
                dst.parent.mkdir(parents=True, exist_ok=True)
                with dst.open('xb') as s:
                    s.write(data)
                assert digest(dst) == hashlib.sha256(data).hexdigest()
                samples.append({'rollback': row['file'], 'member': i.filename, 'restored': str(dst)})
    save(ARCHIVE / 'verification.json', {'status': 'PASS_ALL_OBJECT_HASHES_MANIFESTS_AND_BOUNDED_RESTORE',
        'verifiedObjects': verified, 'samples': samples, 'volume': volume()})


def retire():
    inv = json.loads((ARCHIVE / 'inventory.json').read_text())
    proof = json.loads((ARCHIVE / 'verification.json').read_text())
    assert proof['status'].startswith('PASS_')
    acceptance = json.loads((TASK / 'technical-acceptance.json').read_text())
    ownership = json.loads((ARCHIVE / 'ownership.json').read_text())
    assert acceptance['status'] == 'PASS_FOCUSED_COMBINED_MACOS_ARM64'
    assert ownership['status'] == 'NO_ACTIVE_PROCESS_REFERENCES_TO_RETIREMENT_ROOTS'
    assert git('branch', '--show-current') == 'main' and not git('status', '--porcelain=v1')
    records = []
    before = volume()
    for item in inv['roots']:
        root = Path(item['path'])
        manifest = ARCHIVE / 'manifests' / (item['id'] + '.jsonl')
        rows = [json.loads(line) for line in manifest.open()]
        expected = {r['path'] for r in rows}
        assert {p.relative_to(root).as_posix() for p, _ in entries(root)} == expected, f'New files: {root}'
        for row in rows:
            p = root / row['path']
            if row['kind'] != 'directory':
                assert stamp(p) == {key: row[key] for key in stamp(p)}, f'Changed: {p}'
        tracked = set()
        if item['worktree']:
            assert not git('status', '--porcelain=v1', cwd=root)
            assert git('rev-parse', 'HEAD', cwd=root) == item['head']
            subprocess.run(['git', 'merge-base', '--is-ancestor', item['head'], 'main'], cwd=MAIN, check=True)
            tracked = set(git('ls-files', '-z', cwd=root).split('\0'))
        removed = 0
        for row in reversed(rows):
            if (row['path'] == '.' and row['kind'] == 'directory') or row['path'] in tracked:
                continue
            p = root / row['path']
            if row['kind'] == 'directory':
                if not any(p.iterdir()):
                    p.rmdir()
            else:
                p.unlink()
                removed += 1
        if item['worktree']:
            assert not git('status', '--porcelain=v1', cwd=root)
            subprocess.run(['git', 'worktree', 'remove', str(root)], cwd=MAIN, check=True)
        elif root.exists():
            root.rmdir()
        record = {'path': str(root), 'status': 'RETIRED_AFTER_VERIFIED_ARCHIVAL', 'head': item['head'],
                  'manifest': str(manifest), 'sourceFilesRemoved': removed,
                  'formerAllocatedBytes': item['allocatedBytes']}
        records.append(record)
        save(ARCHIVE / ('retired-' + item['id'] + '.json'), record)
        print(json.dumps(record), flush=True)
    save(ARCHIVE / 'cleanup-ledger.json', {'status': 'COMPLETE', 'beforeDeletion': before,
        'afterDeletion': volume(), 'removed': records, 'retained': inv['retained'], 'holds': inv['holds'],
        'branches': 'ALL_RETAINED', 'historyBundle': str(ARCHIVE / 'source-before-cleanup.bundle'),
        'archiveAllocatedBytes': sum(p.lstat().st_blocks * 512 for p, _ in entries(ARCHIVE)),
        'measurementLimits': 'Volume availability can include unrelated activity and APFS purgeable/snapshot effects. st_blocks counts shared extents; no private-extent or Trash claim.'})


def restore(root_id, destination, prefix):
    manifest = ARCHIVE / 'manifests' / (root_id + '.jsonl')
    assert manifest.is_file() and destination.is_absolute() and not destination.exists()
    destination.mkdir(parents=True)
    receipt = json.loads((ARCHIVE / 'archive-receipt.json').read_text())
    source_root = next(Path(item['root']) for item in receipt['manifests']
                       if item['manifest'] == str(manifest.relative_to(ARCHIVE)))
    directories = []
    with manifest.open() as stream:
        for line in stream:
            row = json.loads(line)
            if prefix and not (row['path'] == prefix or row['path'].startswith(prefix.rstrip('/') + '/')):
                continue
            target = destination / row['path']
            if row['path'] == '.' and row['kind'] != 'directory':
                target = destination / source_root.name
            if row['kind'] == 'expandedZip':
                contents = target.with_name(target.name + '.restored-contents')
                with (ARCHIVE / row['zipManifest']).open() as z:
                    for member in map(json.loads, z):
                        restore_entry(member, contents / member['path'])
                continue
            restore_entry(row, target)
            if row['kind'] == 'directory':
                directories.append((target, row))
    for p, row in reversed(directories):
        p.chmod(row['mode'])
        os.utime(p, ns=(row['mtimeNs'], row['mtimeNs']))
    print(json.dumps({'status': 'RESTORED', 'manifest': str(manifest), 'destination': str(destination), 'prefix': prefix}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['inventory', 'archive', 'verify', 'retire', 'restore'])
    parser.add_argument('--root-id')
    parser.add_argument('--destination', type=Path)
    parser.add_argument('--prefix', default='')
    args = parser.parse_args()
    if args.action == 'restore':
        assert args.root_id and args.destination
        restore(args.root_id, args.destination, args.prefix)
    else:
        globals()[args.action]()


if __name__ == '__main__':
    main()
