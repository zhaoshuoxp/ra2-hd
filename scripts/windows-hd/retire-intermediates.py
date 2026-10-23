"""Retire explicitly audited investigation copies after content-addressed retention."""
import argparse
import hashlib
import json
import os
import shutil
import stat
import subprocess
from pathlib import Path

ROOT = Path('/Users/Aone/RA2remaster/ra2-hd-windows-perf/.artifacts/windows-hd-diagnostic')
DELIVERIES = Path('/Users/Aone/RA2remaster/deliveries')
MAIN = Path('/Users/Aone/RA2remaster/ra2-hd')
RESOURCE_DIRS = {'RA2-HD-Editions-Resources', 'RA2-HD-UI-Resources'}
KEEP_DIRS = {'candidate-c9-assembly-v2', 'candidate-c9-native-kit-v1', 'candidate-c9-build-v2'}
KEEP_ZIPS = {
    'RA2-HD-WINHD-20261008-D38F136-A1-da085fa-Windows-x64.zip',
    'RA2-HD-WINHD-20261008-D38F136-C8-5721aa5-Windows-x64.zip',
    'RA2-HD-WINHD-20261008-D38F136-C9-69c132d-Windows-x64.zip',
}


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def census(root):
    rows = []
    paths = [root] if root.is_file() else sorted(root.rglob('*'))
    for p in paths:
        s = p.lstat()
        if stat.S_ISDIR(s.st_mode):
            continue
        assert stat.S_ISREG(s.st_mode) or stat.S_ISLNK(s.st_mode), p
        rows.append({'file': str(p.relative_to(root)) if p != root else '.', 'bytes': s.st_size,
                     'mode': stat.S_IMODE(s.st_mode), 'mtimeNs': s.st_mtime_ns, 'inode': s.st_ino,
                     'allocatedBytes': s.st_blocks * 512,
                     'link': os.readlink(p) if p.is_symlink() else None})
    return rows


def disk():
    s = os.statvfs(ROOT)
    return {'availableBytes': s.f_bavail * s.f_frsize, 'freeBytes': s.f_bfree * s.f_frsize}


def main_ready():
    x = json.loads((MAIN / 'docs/windows-hd-main-integration-20261010.json').read_text())
    assert x['status'] == 'PASS_LOCAL_MAIN_INTEGRATION'
    assert subprocess.run(['git', '-C', str(MAIN), 'merge-base', '--is-ancestor',
                           x['mainMerged'], 'HEAD'], check=False).returncode == 0


def plan(output):
    assert not output.exists()
    output.mkdir()
    main_ready()
    extras = {'assembly-v1', 'assembly-asar', 'assembly-final', 'fresh-asar', 'fresh-final',
              'qa-kit-v1', 'mapped-dist', 'c7-manual-kit-v1',
              'c6-shader-identity-kit-v1', 'c6-shader-identity-kit-v2',
              'c6-shader-identity-kit-v3', 'c6-shader-identity-kit-v4'}
    targets = sorted(p for p in ROOT.iterdir() if p.is_dir() and not p.is_symlink()
                     and ((p.name.startswith('candidate-') and p.name not in KEEP_DIRS) or p.name in extras))
    targets += sorted(p for p in DELIVERIES.glob('RA2-HD-WINHD-20261008-D38F136-*-Windows-x64.zip')
                      if p.name not in KEEP_ZIPS)
    rows = []
    for p in targets:
        assert p.parent in [ROOT, DELIVERIES] and not p.is_symlink()
        entries = census(p)
        rows.append({'path': str(p), 'kind': 'directory' if p.is_dir() else 'zip', 'entries': entries,
                     'logicalBytes': sum(e['bytes'] for e in entries),
                     'allocatedBytes': sum(e['allocatedBytes'] for e in entries)})
    receipt = {'schema': 'windows-hd-intermediate-retirement-v1', 'status': 'AUDITED_NOT_DELETED',
               'authorization': 'User request 2026-10-10: merge validated fixes, delete unneeded intermediates from this conversation, continue dense rendering repair.',
               'mainMerge': json.loads((MAIN / 'docs/windows-hd-main-integration-20261010.json').read_text())['mainMerged'],
               'diskBefore': disk(), 'targets': rows, 'keepDirectories': sorted(KEEP_DIRS),
               'keepArchives': sorted(KEEP_ZIPS),
               'retention': 'All non-resource files, including maps, manifests, runtime bytes, profiles and reports, are retained in verified content-addressed objects. Frozen resource copies may be omitted only after actual SHA-256 parity with the retained latest C9 kit. Raw returns, QA reports, source history and unrelated files are excluded.'}
    save(output / 'plan.json', receipt)
    print(json.dumps({'status': receipt['status'], 'targets': len(rows),
                      'logicalGiB': sum(r['logicalBytes'] for r in rows) / 1024**3}))


def execute(output):
    main_ready()
    plan_path = output / 'plan.json'
    x = json.loads(plan_path.read_text())
    assert x['status'] == 'AUDITED_NOT_DELETED' and not (output / 'prepared.json').exists()
    retained = ROOT / 'candidate-c9-assembly-v2/RA2-HD-WINHD-20261008-D38F136-C9-69c132d-Windows-x64'
    manifest = json.loads((retained / 'diagnostic-manifest.json').read_text())
    assert manifest['diagnosticCommit'] == '69c132d385771dabd385635aa036c51b27014797'
    resources = {r['file']: r for r in manifest['files'] if Path(r['file']).parts[0] in RESOURCE_DIRS}
    verified_retained = set()
    objects = output / 'objects'; objects.mkdir()
    retained_rows, zip_rows = [], []
    for target in x['targets']:
        root = Path(target['path'])
        assert root.parent in [ROOT, DELIVERIES] and not root.is_symlink()
        assert census(root) == target['entries'], f'Changed target: {root}'
        if target['kind'] == 'zip':
            # Complete source/maps/manifests remain in Git or the retained kit archive.
            zip_rows.append({'path': str(root), 'bytes': root.stat().st_size, 'sha256': sha(root)})
            continue
        for row in target['entries']:
            p = root / row['file']; relative = Path(row['file']); parts = relative.parts
            value = dict(row, original=str(p))
            if row['link'] is not None:
                value['retention'] = 'LINK_TARGET_RECORDED'; retained_rows.append(value); continue
            resource = next((i for i, part in enumerate(parts) if part in RESOURCE_DIRS), None)
            key = Path(*parts[resource:]).as_posix() if resource is not None else None
            reference = resources.get(key)
            digest = sha(p)
            if reference and reference['bytes'] == row['bytes'] and reference['sha256'] == digest:
                if key not in verified_retained:
                    assert sha(retained / key) == digest and (retained / key).stat().st_size == row['bytes']
                    verified_retained.add(key)
                value.update(retention='EXACT_RETAINED_C9_RESOURCE', retained=str(retained / key), sha256=digest)
            else:
                obj = objects / digest
                if not obj.exists():
                    shutil.copyfile(p, obj)
                    assert obj.stat().st_size == row['bytes'] and sha(obj) == digest
                else:
                    assert obj.stat().st_size == row['bytes']
                value.update(retention='VERIFIED_CONTENT_ADDRESSED_OBJECT', object=digest, sha256=digest)
            retained_rows.append(value)
        print(json.dumps({'prepared': root.name}), flush=True)
    save(output / 'retained-files.json', retained_rows)
    save(output / 'retired-archive-identities.json', zip_rows)
    # All retention completes before the first deletion. Keep exact original modes and link targets in the index.
    prepared = {'status': 'PASS_ALL_RETENTION_BEFORE_DELETION', 'planSha256': sha(plan_path),
                'retentionIndexSha256': sha(output / 'retained-files.json'),
                'files': len(retained_rows), 'verifiedRetainedResourceFiles': len(verified_retained),
                'objects': len(list(objects.iterdir())), 'archiveIdentities': zip_rows, 'diskBeforeDeletion': disk()}
    save(output / 'prepared.json', prepared)
    for target in x['targets']:
        p = Path(target['path'])
        assert p.parent in [ROOT, DELIVERIES] and not p.is_symlink()
        assert census(p) == target['entries'], f'Changed before deletion: {p}'
        if target['kind'] == 'directory': shutil.rmtree(p)
        else: p.unlink()
        assert not p.exists()
        print(json.dumps({'retired': p.name}), flush=True)
    after = disk()
    save(output / 'completed.json', {'status': 'PASS_SCOPED_RETIREMENT', 'targets': len(x['targets']),
         'logicalBytesRemoved': sum(r['logicalBytes'] for r in x['targets']),
         'allocatedBytesRemovedBeforeCloneAccounting': sum(r['allocatedBytes'] for r in x['targets']),
         'retentionObjectBytes': sum(p.stat().st_size for p in objects.iterdir()),
         'diskBefore': x['diskBefore'], 'diskAfter': after,
         'availableSpaceIncreaseBytes': after['availableBytes'] - x['diskBefore']['availableBytes'],
         'physicalSpaceBoundary': 'Actual available-space change includes APFS clone/snapshot accounting and concurrent filesystem activity; logical byte totals are not claimed as physical space freed.',
         'preparedReceiptSha256': sha(output / 'prepared.json')})
    print((output / 'completed.json').read_text())


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['plan', 'execute'])
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    assert args.output.resolve().parent == ROOT
    (plan if args.action == 'plan' else execute)(args.output.resolve())
