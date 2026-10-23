"""Audit and retire only the accepted M2.4 worktree and its derived main artifacts."""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--apply', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
workspace = root.parent
history = workspace / 'project-history/m2-4-final-20261022'
task = workspace / 'ra2-hd-m2-4-theaters'
artifacts = root / '.artifacts/m2-4'
delivery = Path('/Users/Aone/Desktop/RA2-HD-M2.4-v0.2-Mac-arm64-20261022')
branch = 'task/m2-4-all-skirmish-theaters'
plan_file = history / 'Final-Cleanup-Plan.json'
protected_file = history / 'Canonical-Resources-Before.json'


def load(file):
    return json.loads(file.read_text())


def save(file, value):
    file.write_text(json.dumps(value, indent=2) + '\n')


def sha(file):
    value = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def git(*args):
    return subprocess.check_output(['git', *args], cwd=root, text=True).strip()


def tree_size(folder):
    count, size = 0, 0
    for current, directories, files in os.walk(folder, followlinks=False):
        for name in directories + files:
            file = Path(current) / name
            status = file.lstat()
            if file.is_file() or file.is_symlink():
                count += 1
                size += status.st_size
    return dict(path=str(folder), entries=count, logicalBytes=size)


retention = load(history / 'Provenance/Retention-Receipt.json')
assert sha(history / 'Provenance/Source-Index.jsonl') == retention['sourceIndexSha256']
assert retention['status'] == 'PASS_ALL_RETAINED_SOURCE_OBJECTS_DECODED_AND_HASH_VERIFIED'
for line in (history / 'Provenance/Source-Index.jsonl').read_text().splitlines():
    row = json.loads(line)
    assert (history / 'Provenance' / row['retained']).is_file()
archive = load(history / 'Final-Archive.json')
assert archive['status'] == 'PASS_ZIP64_ALL_PAYLOAD_HASHES_CRC_UNIX_PERMISSIONS_AND_SYMLINKS'
signature = load(history / 'Clean-Archive-Signature.json')
assert signature['status'] == 'PASS_CLEAN_ZIP_EXTRACTED_APP_DEEP_STRICT_SIGNATURE'
assert sha(delivery / 'Delivery-Inventory.json') == archive['inventorySha256']
assert git('branch', '--show-current') == 'main'
assert not git('-C', str(task), 'status', '--porcelain', '--untracked-files=all')
subprocess.run(['git', 'merge-base', '--is-ancestor', branch, 'main'], cwd=root, check=True)
task_head = git('rev-parse', branch)
assert task_head == 'adc98220be44b58c08e965d7dd42ee7d1e6799a4'

# Inspect only paths in the two explicit retirement targets; never print unrelated process data.
processes = subprocess.run(['/usr/sbin/lsof', '-n', '-Fpn'], capture_output=True, text=True)
assert len(processes.stdout.splitlines()) > 50, processes.stderr
pid, in_use = None, []
for line in processes.stdout.splitlines():
    if line.startswith('p'):
        pid = int(line[1:])
    elif line.startswith('n') and any(line[1:] == str(target) or line[1:].startswith(str(target) + '/') for target in [task, artifacts]):
        in_use.append(dict(pid=pid, file=line[1:]))
assert not in_use, json.dumps(dict(blockedByOpenFiles=in_use))

if not args.apply:
    assert not plan_file.exists() and not protected_file.exists()
    inventory = load(delivery / 'Delivery-Inventory.json')
    protected = {}
    for row in inventory['files']:
        parts = Path(row['file']).parts
        if parts[0] not in ['RA2-HD-Editions-Resources', 'RA2-HD-UI-Resources']:
            continue
        file = root / '.local' / Path(*parts[1:])
        assert file.is_file() and not file.is_symlink()
        status = file.stat()
        protected[str(file.relative_to(root))] = dict(bytes=status.st_size, inode=status.st_ino, mtimeNs=status.st_mtime_ns)
    save(protected_file, dict(status='FROZEN_CANONICAL_SELECTED_RESOURCE_METADATA', files=protected))
    plan = dict(schema='m2-4-final-scoped-retirement-plan-v1', status='READY_USER_AUTHORIZED_AFTER_VISUAL_ACCEPTANCE',
        mainHead=git('rev-parse', 'HEAD'), taskHead=task_head, taskBranch=branch,
        targets=[tree_size(task), tree_size(artifacts)], protectedCanonicalResources=len(protected),
        protectedMetadataSha256=sha(protected_file), retainedSourceObjects=retention['fileCount'],
        provenanceIndexSha256=retention['sourceIndexSha256'], finalArchive=archive, cleanArchiveSignature=signature,
        freeBytesBefore=shutil.disk_usage(workspace).free, openTargetFiles=in_use,
        retain=['canonical main and complete .local', 'final Desktop app/ZIP and its private profile',
            'all original installation/import archives in canonical storage', 'prior Desktop deliveries/profiles',
            'outer historical review folders and unrelated donor directories', 'Git history and indexed authoring/compact final/failed evidence'],
        policy='Delete derived task copies directly after verified handoff; do not create a full historical resource recovery archive.')
    save(plan_file, plan)
    print(json.dumps(dict(status=plan['status'], targets=plan['targets'], protectedCanonicalResources=len(protected))))
else:
    plan = load(plan_file)
    assert plan['mainHead'] == git('rev-parse', 'HEAD') and plan['taskHead'] == task_head
    assert sha(protected_file) == plan['protectedMetadataSha256']
    for target in plan['targets']:
        assert tree_size(Path(target['path'])) == target, 'Target metadata changed after the reviewed plan'
    assert [row['path'] for row in plan['targets']] == [str(task), str(artifacts)]
    subprocess.run(['git', 'worktree', 'remove', '--force', str(task)], cwd=root, check=True)
    subprocess.run(['git', 'branch', '-d', branch], cwd=root, check=True)
    shutil.rmtree(artifacts)
    for name, old in load(protected_file)['files'].items():
        file = root / name
        status = file.stat()
        assert dict(bytes=status.st_size, inode=status.st_ino, mtimeNs=status.st_mtime_ns) == old, name
    remaining_branches = git('branch', '--format=%(refname:short)').splitlines()
    assert not task.exists() and not artifacts.exists() and branch not in remaining_branches and 'main' in remaining_branches
    receipt = dict(schema='m2-4-final-scoped-retirement-v1', status='COMPLETE_SCOPED_DIRECT_RETIREMENT',
        date='2026-10-22', mainHead=plan['mainHead'], deletedTargets=plan['targets'], retiredBranch=branch,
        reachableTaskCommitRetained=git('rev-parse', task_head), remainingBranches=remaining_branches, sourceHistoryPreserved=True,
        logicalBytesRemoved=sum(row['logicalBytes'] for row in plan['targets']),
        entriesRemoved=sum(row['entries'] for row in plan['targets']),
        freeBytesBefore=plan['freeBytesBefore'], freeBytesAfter=shutil.disk_usage(workspace).free,
        freeSpaceMeaning='Observed available-space delta, separate from logical bytes; APFS clone/snapshot accounting can differ.',
        protectedCanonicalResources=len(load(protected_file)['files']), protectedMetadataUnchanged=True,
        retainedSourceObjects=retention['fileCount'], provenanceIndexSha256=retention['sourceIndexSha256'],
        finalArchiveSha256=archive['sha256'], finalInventorySha256=archive['inventorySha256'],
        finalAppAndUserProfilesDeleted=False, originalSourcesModified=False, unrelatedDirectoriesDeleted=False,
        sourceResourceRegistration='PENDING_POST_RETIREMENT_VALIDATION', windows='NOT_RUN_ON_THIS_MAC',
        remotePush=False, published=False)
    receipt['availableBytesGained'] = receipt['freeBytesAfter'] - receipt['freeBytesBefore']
    save(history / 'Final-Cleanup.json', receipt)
    print(json.dumps(receipt))
