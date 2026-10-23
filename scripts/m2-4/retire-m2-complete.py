"""Retain compact correction evidence and retire only this conversation's derived outputs."""
import argparse
import gzip
import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('phase', choices=['retain', 'apply'])
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
history = root.parent / 'project-history/m2-complete-20261022'
targets = [root / '.artifacts/m2-4' / name for name in ['post-acceptance-r1', 'post-acceptance-r2']]
baseline = targets[1] / 'baseline-source'
final = Path('/Users/Aone/Desktop/RA2-HD-M2.4-v0.2-R2-Mac-arm64-20261022')
old_desktop = [Path('/Users/Aone/Desktop') / name for name in [
    'RA2-HD-M2.4-v0.2-R1-Mac-arm64-20261022',
    'RA2-HD-M2.4-v0.2-Mac-arm64-20261022',
    'RA2-HD-M2.4-v0.2-Mac-arm64-20261022.zip',
    'M2.4-Review-Corrections-R1-20261022.html']]


def load(file):
    return json.loads(file.read_text())


def save(file, value):
    file.write_text(json.dumps(value, indent=2) + '\n')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.check_output(['git', *args], cwd=root, text=True).strip()


def measure(folder):
    count = size = 0
    if folder.is_dir():
        for directory, dirs, files in os.walk(folder, followlinks=False):
            for name in dirs + files:
                file = Path(directory) / name
                if file.is_symlink() or file.is_file():
                    count += 1
                    size += file.lstat().st_size
    elif folder.exists():
        count, size = 1, folder.stat().st_size
    return dict(path=str(folder), entries=count, logicalBytes=size, present=folder.exists())


assert git('branch', '--show-current') == 'main'
assert not git('status', '--porcelain', '--untracked-files=all')
assert load(final / 'SOURCE-AND-RESOURCES.json')['status'] == 'USER_ACCEPTED_M2_COMPLETE'
archive = load(history / 'Final-Archive.json')
assert archive['status'] == 'PASS_ZIP64_ALL_PAYLOAD_HASHES_CRC_UNIX_PERMISSIONS_AND_SYMLINKS'
assert digest((final / 'Delivery-Inventory.json').read_bytes()) == archive['inventorySha256']
assert load(history / 'Final-Signature.json')['status'].startswith('PASS_')
profiles = load(history / 'User-Profile-Retention.json')['profiles']
assert profiles and all(Path(profile['retained']).is_dir() for profile in profiles)

if args.phase == 'retain':
    objects = history / 'Provenance/Objects'
    objects.mkdir(parents=True, exist_ok=True)
    rows, unique = [], {}
    allowed = {'.json', '.jsonl', '.log', '.png', '.webm', '.html', '.md', '.txt', '.mjs', '.js', '.py', '.ts'}
    for target in targets:
        for directory, dirs, files in os.walk(target, followlinks=False):
            directory = Path(directory)
            dirs[:] = [d for d in dirs if d not in ['profile', 'M2.4-Review-Profile', 'node_modules',
                'baseline-source', 'RA2-HD-Editions-Resources', 'RA2-HD-UI-Resources'] and not d.endswith('.app')]
            if directory.name.startswith('build-'):
                dirs[:] = []
                files = [f for f in files if f in ['identity.json', 'package.json']]
            for name in sorted(files):
                file = directory / name
                if file.is_symlink() or file.suffix not in allowed:
                    continue
                data = file.read_bytes()
                sha = digest(data)
                relative = Path('Objects') / sha[:2] / (sha + '.gz')
                destination = history / 'Provenance' / relative
                if sha not in unique:
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    if not destination.exists():
                        destination.write_bytes(gzip.compress(data, compresslevel=6, mtime=0))
                    assert digest(gzip.decompress(destination.read_bytes())) == sha
                    unique[sha] = len(data)
                rows.append(dict(origin=str(file.relative_to(root)), bytes=len(data), sha256=sha,
                    retained=str(relative)))
    index = history / 'Provenance/Source-Index.jsonl'
    index.write_text(''.join(json.dumps(row) + '\n' for row in rows))
    save(history / 'Provenance/Receipt.json', dict(status='PASS_ALL_COMPACT_RECORDS_DECODED_AND_HASH_VERIFIED',
        records=len(rows), uniqueObjects=len(unique), sourceIndexSha256=digest(index.read_bytes()),
        sourceBytes=sum(row['bytes'] for row in rows), uniqueSourceBytes=sum(unique.values()),
        policy='Retain receipts, failed controls, images, clips and build identities; exclude runtime/resource copies and QA caches. Authoring sources remain in the existing M2.4 provenance handoff.'))
    package = load(history / 'Final-Package-Payload.json')
    accepted = load(root.parent / 'project-history/m2-4-final-20261022/Canonical-Resources-Before.json')['files']
    protected = {}
    portable_manifests = []
    for row in package['files']:
        parts = Path(row['file']).parts
        if parts[0] not in ['RA2-HD-Editions-Resources', 'RA2-HD-UI-Resources']:
            continue
        file = root / '.local' / Path(*parts[1:])
        assert file.is_file() and not file.is_symlink()
        st = file.stat()
        relative = str(file.relative_to(root))
        current = dict(bytes=st.st_size, inode=st.st_ino, mtimeNs=st.st_mtime_ns)
        assert current == accepted[relative], relative
        if st.st_size != row['bytes']:
            portable_manifests.append(row['file'])
        protected[relative] = {key: str(value) for key, value in current.items()}
    assert len(protected) == 13978 and set(protected) == set(accepted)
    assert set(portable_manifests) == {'RA2-HD-Editions-Resources/ra2-core-manifest.json',
        'RA2-HD-Editions-Resources/upstream-support/manifest.json'}
    save(history / 'Canonical-Resources-Before.json', dict(files=protected, count=len(protected),
        portableImportManifests=portable_manifests,
        qualification='The portable package omits source-path/import metadata from two manifests. Protect canonical files against their accepted canonical metadata, not the smaller portable copies.'))
    save(history / 'Cleanup-Plan.json', dict(status='READY_USER_AUTHORIZED_M2_COMPLETION',
        mainHead=git('rev-parse', 'HEAD'), targets=[measure(t) for t in targets],
        obsoleteDesktop=[measure(t) for t in old_desktop], protectedCanonicalResources=len(protected),
        preservedFinalDelivery=str(final), preservedFinalArchive=archive['archive'],
        preservedProfiles=str(history / 'User-Profiles'), availableBytesBefore=shutil.disk_usage(root).free))
    print(json.dumps(dict(status='RETAINED_COMPACT_EVIDENCE_AND_FROZEN_PROTECTED_RESOURCES', records=len(rows))))
else:
    plan = load(history / 'Cleanup-Plan.json')
    assert git('rev-parse', 'HEAD') == plan['mainHead']
    receipt = load(history / 'Provenance/Receipt.json')
    index = history / 'Provenance/Source-Index.jsonl'
    assert digest(index.read_bytes()) == receipt['sourceIndexSha256']
    for row in map(json.loads, index.read_text().splitlines()):
        assert digest(gzip.decompress((history / 'Provenance' / row['retained']).read_bytes())) == row['sha256']
    # Do not retire a running app, an active profile or a tool's open output.
    process = subprocess.run(['/usr/sbin/lsof', '-n', '-Fpn'], capture_output=True, text=True)
    assert len(process.stdout.splitlines()) > 50, process.stderr
    in_use = [line[1:] for line in process.stdout.splitlines() if line.startswith('n') and any(
        line[1:] == str(t) or line[1:].startswith(str(t) + '/') for t in targets + old_desktop)]
    assert not in_use, json.dumps(in_use)
    assert git('-C', str(baseline), 'rev-parse', 'HEAD') == 'f1e18d0d38683a054b4258aa59877c6d597e22aa'
    assert not git('-C', str(baseline), 'status', '--porcelain', '--untracked-files=all')
    subprocess.run(['git', 'worktree', 'remove', str(baseline)], cwd=root, check=True)
    for target in targets:
        assert target.parent == root / '.artifacts/m2-4' and not target.is_symlink()
        shutil.rmtree(target)
    if not any((root / '.artifacts/m2-4').iterdir()):
        (root / '.artifacts/m2-4').rmdir()
    removed_desktop, already_absent = [], []
    for target in old_desktop:
        if not target.exists():
            already_absent.append(str(target))
            continue
        if target.is_dir() and (target / 'M2.4-Review-Profile').exists():
            label = 'Accepted-R1' if '-R1-' in target.name else 'Restored-Baseline'
            assert (history / 'User-Profiles' / label).is_dir()
        if target.is_dir():
            shutil.rmtree(target)
        else:
            target.unlink()
        removed_desktop.append(str(target))
    for relative, expected in load(history / 'Canonical-Resources-Before.json')['files'].items():
        st = (root / relative).stat()
        assert dict(bytes=str(st.st_size), inode=str(st.st_ino), mtimeNs=str(st.st_mtime_ns)) == expected, relative
    after = shutil.disk_usage(root).free
    result = dict(status='COMPLETE_SCOPED_M2_INTERMEDIATE_RETIREMENT', mainHead=git('rev-parse', 'HEAD'),
        artifactTargets=plan['targets'], detachedBaselineWorktreeRemoved=True, branchesDeleted=0,
        remainingBranches=git('branch', '--list').splitlines(), obsoleteDesktopRemoved=removed_desktop,
        obsoleteDesktopAlreadyAbsent=already_absent, protectedCanonicalResourcesUnchanged=13978,
        preservedProfiles=str(history / 'User-Profiles'), availableBytesBefore=plan['availableBytesBefore'],
        availableBytesAfter=after, observedAvailableBytesChange=after-plan['availableBytesBefore'],
        qualification='Filesystem available-space change is observed separately from logical file sizes; APFS/cloud accounting can differ.',
        originalDataRemoved=False, unrelatedArtifactsRemoved=False, gitHistoryPreserved=True, push=False)
    save(history / 'Cleanup.json', result)
    print(json.dumps(result))
