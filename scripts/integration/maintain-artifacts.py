#!/usr/bin/env python3
"""Preserve and retire explicitly inventoried obsolete integration outputs."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess

SPEC = importlib.util.spec_from_file_location('consolidation', Path(__file__).with_name('consolidate.py'))
STORE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(STORE)
BASE, MAIN, ARCHIVE = STORE.BASE, STORE.MAIN, STORE.ARCHIVE
RUN = ARCHIVE / 'maintenance-control-final-v1'
CURRENT = MAIN / '.artifacts/mind-control-final-20261005'


def save(name, value):
    STORE.save(RUN / name, value)


def state():
    assert STORE.git('branch', '--show-current') == 'main'
    assert not STORE.git('status', '--porcelain=v1'), 'Commit main before maintenance.'


def check_processes(roots, label):
    commands = subprocess.check_output(['ps', '-axo', 'pid=,command='], text=True)
    opened = subprocess.run(['lsof', '-nP', '-F', 'pn'], text=True, capture_output=True, check=True)
    (RUN / f'{label}-processes.txt').write_text(commands)
    (RUN / f'{label}-open-files.txt').write_text(opened.stdout)
    (RUN / f'{label}-open-files-warnings.txt').write_text(opened.stderr)
    # lsof may warn about unavailable external mounted filesystems. Our roots
    # must be locally readable; a referenced retirement root is always held.
    return [root for root in roots if str(root) in commands or str(root) in opened.stdout]


def allowed(root):
    if root.is_symlink() or root.resolve() != root:
        return False
    relative = root.relative_to(MAIN) if root.is_relative_to(MAIN) else None
    if relative:
        if not relative.parts or relative.parts[0] != '.artifacts':
            return False
        if subprocess.check_output(['git', 'ls-files', '--', str(relative)], cwd=MAIN):
            return False
    else:
        if root.parent != BASE / 'deliveries':
            return False
    return '.git' not in root.parts and root != CURRENT


def plan():
    RUN.mkdir(exist_ok=False)
    roots = []
    for task in sorted((MAIN / '.artifacts').glob('*20261005')):
        for root in sorted(task.iterdir()):
            if root.is_dir() and root.name.startswith(('build', 'package', 'desktop-extracted')):
                roots.append(root)
            elif root.is_file() and root.suffix == '.zip' and (task != CURRENT or '-a532750-' in root.name):
                roots.append(root)
    previous = BASE / 'deliveries/RA2-HD-Main-CD-20261005-ba7a6d2-macOS-arm64'
    if previous.exists():
        roots.append(previous)
    old_extraction = MAIN / '.artifacts/main-integration-20261005/desktop-zip-v1/extraction'
    if old_extraction.exists():
        roots.append(old_extraction)
    assert all(allowed(root) for root in roots)
    held = check_processes(roots, 'before')
    rows = []
    for root in roots:
        counts = {'file': 0, 'directory': 0, 'symlink': 0}
        logical = allocated = 0
        for path, kind in STORE.entries(root):
            counts[kind] += 1
            allocated += path.lstat().st_blocks * 512
            if kind == 'file': logical += path.stat().st_size
        rows.append({'path': str(root), 'id': root.relative_to(BASE).as_posix().replace('/', '__'),
                     'classification': 'HOLD_ACTIVE' if root in held else 'ARCHIVE_THEN_REMOVE',
                     'logicalBytes': logical, 'allocatedBytes': allocated, 'counts': counts,
                     'reason': 'Superseded build, package, ZIP or extracted test copy; preserve unique contents and profiles.'})
    save('plan.json', {'status': 'INVENTORIED_BEFORE_MUTATION', 'mainHead': STORE.git('rev-parse', 'HEAD'),
        'volumeBefore': STORE.volume(), 'roots': rows, 'held': list(map(str, held)),
        'protected': ['Current Main-Control-Fix deliveries and Desktop ZIPs', '.local', 'retail data',
                      'source and tracked documentation', 'all native evidence outside listed outputs',
                      'existing archives and exact rollback ZIPs'],
        'desktopAction': 'NONE', 'trashAction': 'NONE'})
    print(json.dumps({'status': 'PLAN_READY', 'roots': len(rows), 'held': len(held),
        'logicalBytes': sum(r['logicalBytes'] for r in rows)}), flush=True)


def archive():
    state()
    plan = json.loads((RUN / 'plan.json').read_text())
    manifests, objects = [], {}
    for item in plan['roots']:
        if item['classification'] != 'ARCHIVE_THEN_REMOVE': continue
        root = Path(item['path'])
        assert allowed(root)
        manifest = RUN / (item['id'] + '.jsonl')
        with manifest.open('x') as stream:
            for path, kind in STORE.entries(root):
                before = STORE.stamp(path)
                row = {'path': path.relative_to(root).as_posix(), 'kind': kind, **before}
                if kind == 'file':
                    sha = STORE.digest(path)
                    row['sha256'] = sha
                    row['xattrs'] = STORE.xattrs(path)
                    if path.suffix == '.zip' and (path.name.startswith('RA2-HD-') or 'desktop-candidate' in path.name):
                        row['kind'] = 'expandedZip'
                        row['zipManifest'] = STORE.archive_zip(path, sha, objects)
                        row['zipManifestSha256'] = STORE.digest(ARCHIVE / row['zipManifest'])
                        for member in map(json.loads, (ARCHIVE / row['zipManifest']).read_text().splitlines()):
                            if member['kind'] == 'file': objects[member['sha256']] = member['bytes']
                    else:
                        STORE.store_file(path, sha)
                        objects[sha] = before['bytes']
                elif kind == 'symlink': row['target'] = os.readlink(path)
                assert STORE.stamp(path) == before, f'Changed during preservation: {path}'
                stream.write(json.dumps(row) + '\n')
        manifests.append({'root': str(root), 'id': item['id'], 'manifest': str(manifest.relative_to(ARCHIVE)),
                          'sha256': STORE.digest(manifest)})
        print(json.dumps({'preserved': root.name, 'roots': len(manifests), 'objects': len(objects)}), flush=True)
    bundle = RUN / 'main-before-maintenance.bundle'
    subprocess.run(['git', 'bundle', 'create', str(bundle), '--all'], cwd=MAIN, check=True)
    result = subprocess.run(['git', 'bundle', 'verify', str(bundle)], cwd=MAIN, capture_output=True, text=True, check=True)
    (RUN / 'bundle-verification.txt').write_text(result.stdout + result.stderr)
    save('preservation.json', {'status': 'PRESERVED_PENDING_VERIFICATION', 'manifests': manifests,
                             'objects': objects, 'bundleSha256': STORE.digest(bundle)})


def verify():
    receipt = json.loads((RUN / 'preservation.json').read_text())
    for i, (sha, size) in enumerate(receipt['objects'].items()):
        obj = STORE.object_path(sha)
        assert obj.stat().st_size == size and STORE.digest(obj) == sha, obj
        if i and i % 5000 == 0: print(json.dumps({'verifiedObjects': i}), flush=True)
    samples, temp = [], RUN / 'restoration-checks'
    temp.mkdir(exist_ok=False)
    for item in receipt['manifests']:
        manifest = ARCHIVE / item['manifest']
        assert STORE.digest(manifest) == item['sha256']
        selected, links = {}, []
        for row in map(json.loads, manifest.read_text().splitlines()):
            if row['kind'] == 'symlink' and not links: links.append(row)
            if row['kind'] == 'file' and row['bytes'] <= 1024 * 1024:
                selected.setdefault(Path(row['path']).suffix, row)
            if row['kind'] == 'expandedZip':
                z = ARCHIVE / row['zipManifest']
                assert STORE.digest(z) == row['zipManifestSha256']
                for member in map(json.loads, z.read_text().splitlines()):
                    if member['kind'] == 'file' and member['bytes'] <= 1024 * 1024:
                        selected.setdefault('zip-member', member)
                        break
        for row in list(selected.values())[:4] + links:
            destination = temp / str(len(samples))
            STORE.restore_entry(row, destination)
            if row['kind'] == 'file':
                assert STORE.digest(destination) == row['sha256']
                assert stat.S_IMODE(destination.stat().st_mode) == (row['mode'] or 0o644)
                actual_attrs, expected_attrs = STORE.xattrs(destination), row.get('xattrs', {})
                # macOS assigns provenance to newly restored files. Its original
                # value remains in the manifest; it is not a portable file identity.
                changed_attrs = {key for key in set(actual_attrs) | set(expected_attrs)
                                 if actual_attrs.get(key) != expected_attrs.get(key)}
                assert changed_attrs <= {'com.apple.provenance'}, changed_attrs
            else: assert os.readlink(destination) == row['target']
            samples.append({'root': item['root'], 'path': row['path'], 'kind': row['kind'], 'status': 'PASS',
                            'generatedAttributeExceptions': sorted(changed_attrs) if row['kind'] == 'file' else []})
            destination.unlink()
    temp.rmdir()
    save('verification.json', {'status': 'PASS_ALL_REFERENCED_OBJECT_HASHES_AND_BOUNDED_RESTORATION',
                              'objects': len(receipt['objects']), 'samples': samples,
                              'attributePolicy': 'Exact stored attributes except OS-generated com.apple.provenance; original values remain archived.'})
    print(json.dumps({'verifiedObjects': len(receipt['objects']), 'restorationSamples': len(samples)}), flush=True)


def retire():
    state()
    plan = json.loads((RUN / 'plan.json').read_text())
    receipt = json.loads((RUN / 'preservation.json').read_text())
    verification = json.loads((RUN / 'verification.json').read_text())
    assert verification['status'].startswith('PASS_')
    roots = [Path(item['root']) for item in receipt['manifests']]
    held = check_processes(roots, 'retirement')
    ledger = []
    for item in receipt['manifests']:
        root = Path(item['root'])
        assert allowed(root)
        if root in held:
            ledger.append({'path': str(root), 'status': 'HOLD_ACTIVE'}); continue
        manifest = ARCHIVE / item['manifest']
        assert STORE.digest(manifest) == item['sha256']
        rows = list(map(json.loads, manifest.read_text().splitlines()))
        actual = {path.relative_to(root).as_posix(): (path, kind) for path, kind in STORE.entries(root)}
        assert set(actual) == {row['path'] for row in rows}, f'Root changed: {root}'
        for row in rows:
            path, kind = actual[row['path']]
            expected = {key: row[key] for key in STORE.stamp(path)}
            assert STORE.stamp(path) == expected, f'Entry changed: {path}'
            if kind == 'symlink': assert os.readlink(path) == row['target']
        if root.is_dir(): shutil.rmtree(root)
        else: root.unlink()
        assert not root.exists()
        ledger.append({'path': str(root), 'status': 'REMOVED_AFTER_VERIFIED_PRESERVATION', 'manifest': item['manifest']})
    save('retirement.json', {'status': 'COMPLETE_WITH_HOLDS' if held else 'COMPLETE', 'ledger': ledger,
         'volumeBefore': plan['volumeBefore'], 'volumeAfter': STORE.volume(), 'held': list(map(str, held)),
         'spaceMeaning': 'Directory and volume measurements include APFS sharing and background changes.'})
    print(json.dumps({'status': 'RETIRED', 'removedRoots': len(ledger) - len(held), 'heldRoots': len(held)}), flush=True)


def restore(root_id, destination):
    receipt = json.loads((RUN / 'preservation.json').read_text())
    item = next(item for item in receipt['manifests'] if item['id'] == root_id)
    assert destination.is_absolute() and not destination.exists()
    manifest = ARCHIVE / item['manifest']
    assert STORE.digest(manifest) == item['sha256']
    destination.mkdir(parents=True)
    directories = []
    for row in map(json.loads, manifest.read_text().splitlines()):
        target = destination / row['path']
        if row['path'] == '.' and row['kind'] != 'directory': target = destination / Path(item['root']).name
        if row['kind'] == 'expandedZip':
            for member in map(json.loads, (ARCHIVE / row['zipManifest']).read_text().splitlines()):
                STORE.restore_entry(member, target.with_name(target.name + '.restored-contents') / member['path'])
        else:
            STORE.restore_entry(row, target)
            if row['kind'] == 'directory': directories.append((target, row))
    for target, row in reversed(directories):
        target.chmod(row['mode']); os.utime(target, ns=(row['mtimeNs'], row['mtimeNs']))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['plan', 'archive', 'verify', 'retire', 'restore'])
    parser.add_argument('--root-id')
    parser.add_argument('--destination', type=Path)
    args = parser.parse_args()
    if args.action == 'restore': restore(args.root_id, args.destination)
    else: globals()[args.action]()
