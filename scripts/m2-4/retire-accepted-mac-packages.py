"""Retain and retire only the seven user-authorized accepted M2.4 Mac package folders."""
import argparse
import hashlib
import json
import os
import shutil
import stat
from pathlib import Path

ROOT = Path('/Users/Aone/RA2remaster')
ALLOWED = {'M2.4-Snow-Surface-R7-Mac-20261011-v1', 'M2.4-Snow-Batch16-Mac-20261012-v1',
    'M2.4-Snow-Batch17-Mac-20261012-v2', 'M2.4-Snow-Batch18-Mac-20261012-v1',
    'M2.4-Snow-Batch19-Mac-20261012-v1', 'M2.4-Snow-Batch20-Mac-20261012-v1',
    'M2.4-Snow-Batch21-Mac-20261012-v1'}


def sha(file):
    digest = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def write(file, value):
    with file.open('x') as stream:
        json.dump(value, stream, indent=2)
        stream.write('\n')


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('phase', choices=['retain', 'verify', 'retire'])
parser.add_argument('audit', type=Path)
args = parser.parse_args()
audit = args.audit.resolve()
assert audit.parent == ROOT and audit.name == 'M2.4-Accepted-Mac-Package-Cleanup-20261012-v1'
allowlist_path = audit / 'allowlist.json'
allowlist = json.loads(allowlist_path.read_text())
targets = allowlist['targets']
assert len(targets) == 7 and {Path(row['deliveryRoot']).name for row in targets} == ALLOWED
for row in targets:
    delivery, package = Path(row['deliveryRoot']), Path(row['packageFolder'])
    assert delivery.parent == ROOT and package.parent == delivery and package.name.startswith('RA2-HD-M2.4-Snow-')
    assert not package.is_symlink() and delivery.is_dir()

index_path = audit / 'retained-files.jsonl'
objects = audit / 'objects'
if args.phase == 'retain':
    objects.mkdir()
    count = logical = 0
    unique = {}
    free_before = shutil.disk_usage(ROOT).free
    with index_path.open('x') as index:
        for target in targets:
            package = Path(target['packageFolder'])
            assert package.is_dir()
            for directory, dirs, files in os.walk(package, followlinks=False):
                for name in sorted(dirs + files):
                    file = Path(directory) / name
                    info = file.lstat()
                    row = dict(packageFolder=str(package), file=str(file.relative_to(package)), mode=stat.S_IMODE(info.st_mode))
                    if stat.S_ISLNK(info.st_mode):
                        row.update(kind='symlink', target=os.readlink(file))
                    elif stat.S_ISDIR(info.st_mode):
                        row.update(kind='directory')
                    else:
                        assert stat.S_ISREG(info.st_mode), f'Unexpected special file: {file}'
                        digest = sha(file)
                        obj = objects / digest[:2] / digest
                        if digest not in unique:
                            obj.parent.mkdir(exist_ok=True)
                            shutil.copyfile(file, obj)
                            assert sha(obj) == digest
                            unique[digest] = info.st_size
                        assert obj.stat().st_size == info.st_size
                        row.update(kind='file', bytes=info.st_size, sha256=digest,
                            retained=str(obj.relative_to(audit)))
                        logical += info.st_size
                    index.write(json.dumps(row, separators=(',', ':')) + '\n')
                    count += 1
            print(json.dumps(dict(phase='retained', folder=str(package), entries=count)), flush=True)
    write(audit / 'retention.json', dict(status='RETAINED_PENDING_INDEPENDENT_VERIFICATION',
        allowlistSha256=sha(allowlist_path), indexSha256=sha(index_path), entries=count,
        logicalPackageBytes=logical, uniqueObjects=len(unique), retainedObjectBytes=sum(unique.values()),
        freeBytesBeforeRetention=free_before, freeBytesAfterRetention=shutil.disk_usage(ROOT).free,
        policy='Every actual package file, mode and symlink is retained. Unique payloads are copied once across all seven packages. Reviews, inputs, evidence and delivery roots remain outside the retirement targets.'))
else:
    retention = json.loads((audit / 'retention.json').read_text())
    assert sha(allowlist_path) == retention['allowlistSha256'] and sha(index_path) == retention['indexSha256']
    checked = set()
    entries = 0
    for line in index_path.open():
        row = json.loads(line)
        package = Path(row['packageFolder'])
        assert any(str(package) == target['packageFolder'] for target in targets)
        file = package / row['file']
        assert file.is_relative_to(package)
        info = file.lstat()
        assert stat.S_IMODE(info.st_mode) == row['mode']
        if row['kind'] == 'file':
            assert stat.S_ISREG(info.st_mode) and info.st_size == row['bytes'] and sha(file) == row['sha256']
            obj = audit / row['retained']
            assert obj.is_relative_to(objects) and obj.stat().st_size == row['bytes']
            if row['sha256'] not in checked:
                assert sha(obj) == row['sha256']
                checked.add(row['sha256'])
        elif row['kind'] == 'symlink':
            assert stat.S_ISLNK(info.st_mode) and os.readlink(file) == row['target']
        else:
            assert row['kind'] == 'directory' and stat.S_ISDIR(info.st_mode)
        entries += 1
    assert entries == retention['entries']
    if args.phase == 'verify':
        write(audit / 'verification.json', dict(status='PASS_COMPLETE_INDEPENDENT_RECOVERY_HASH_VERIFICATION',
            entries=entries, uniqueObjects=len(checked), indexSha256=sha(index_path), allowlistSha256=sha(allowlist_path)))
    else:
        verification = json.loads((audit / 'verification.json').read_text())
        assert verification['status'] == 'PASS_COMPLETE_INDEPENDENT_RECOVERY_HASH_VERIFICATION'
        assert verification['indexSha256'] == sha(index_path)
        free_before = shutil.disk_usage(ROOT).free
        for target in targets:
            package = Path(target['packageFolder'])
            shutil.rmtree(package)
            assert not package.exists()
            assert (Path(target['deliveryRoot']) / 'Review/index-embedded.html').is_file()
            print(json.dumps(dict(phase='retired', folder=str(package))), flush=True)
        write(audit / 'retirement.json', dict(status='PASS_ONLY_SEVEN_AUTHORIZED_MAC_PACKAGE_FOLDERS_RETIRED',
            logicalPackageBytes=retention['logicalPackageBytes'], retainedObjectBytes=retention['retainedObjectBytes'],
            freeBytesBeforeRetirement=free_before, freeBytesAfterRetirement=shutil.disk_usage(ROOT).free,
            freeBytesBeforeRetention=retention['freeBytesBeforeRetention'], targets=targets,
            preserved='All delivery roots, reviews, original/artwork inputs, source archives, manifests, evidence, receipts, rejected apps, main and other worktrees.',
            recoveryIndexSha256=sha(index_path)))
