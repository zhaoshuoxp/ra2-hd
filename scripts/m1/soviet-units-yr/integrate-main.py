"""Inventory, add missing pinned resources, and verify a non-overwriting integration."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

main = Path('/Users/Aone/RA2remaster/ra2-hd')
source = Path('/Users/Aone/RA2remaster/ra2-hd-units-yr')
out = main / '.artifacts/m1-7-yr-main-integration-v1'
predecessor = 'f508f430234c191c15583ecaf7dd822318e6e744'
def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args], text=True).strip()
def sha(file):
    h = hashlib.sha256()
    with Path(file).open('rb') as stream:
        for block in iter(lambda: stream.read(1024*1024), b''):
            h.update(block)
    return h.hexdigest()
def write(name, value):
    (out/name).write_text(json.dumps(value, indent=2)+'\n')
def files(root, relative):
    base = root / relative
    if not base.exists():
        return []
    rows = []
    for directory, dirs, names in os.walk(base, followlinks=False):
        for name in sorted(dirs + names):
            file = Path(directory)/name
            row = dict(path=str(file.relative_to(root)))
            if file.is_symlink():
                rows.append(dict(**row, link=os.readlink(file)))
            elif file.is_file():
                rows.append(dict(**row, bytes=file.stat().st_size, sha256=sha(file)))
    return rows
mode = sys.argv[1]
if mode == 'snapshot':
    assert git(main, 'rev-parse', 'HEAD') == predecessor
    assert not git(main, 'status', '--porcelain'), 'Main must be clean'
    out.mkdir(parents=True, exist_ok=False)
    siblings = []
    for line in git(main, 'worktree', 'list', '--porcelain').splitlines():
        if line.startswith('worktree '):
            tree = Path(line[9:])
            if tree in [main, source]:
                continue
            siblings.append(dict(path=str(tree), head=git(tree,'rev-parse','HEAD'), status=git(tree,'status','--porcelain')))
    rows = files(main, '.local') + files(main, 'dist')
    write('baseline.json', dict(mainHead=predecessor, files=rows, siblings=siblings))
    print('SNAPSHOT', len(rows), 'existing resource/dist entries', len(siblings), 'sibling worktrees')
elif mode == 'resources':
    assert git(main,'rev-parse','HEAD') == predecessor
    assert not git(main,'status','--porcelain')
    inventory = json.loads((source/'docs/m1-7-yr-resources.json').read_text())
    added, reused = [], []
    for row in inventory['files']:
        relative = Path(row['path'])
        assert not relative.is_absolute() and '..' not in relative.parts
        original, target = source/'.local'/relative, main/'.local'/relative
        assert original.resolve() == original and target.resolve() == target
        assert sha(original) == row['sha256']
        if target.exists():
            assert sha(target) == row['sha256'], str(target)
            reused.append(row)
        else:
            added.append(row)
    for row in added:
        original, target = source/'.local'/row['path'], main/'.local'/row['path']
        target.parent.mkdir(parents=True, exist_ok=True)
        with original.open('rb') as src, target.open('xb') as dst:
            shutil.copyfileobj(src, dst)
        assert sha(target) == row['sha256']
    write('resource-sync.json', dict(status='PASS_EXCLUSIVE_RESOURCE_SYNC', added=added, reused=reused, replaced=0))
    print('RESOURCES',len(added),'added',len(reused),'identical existing',0,'replaced')
elif mode == 'verify':
    baseline = json.loads((out/'baseline.json').read_text())
    for row in baseline['files']:
        file = main/row['path']
        if 'link' in row:
            assert file.is_symlink() and os.readlink(file)==row['link'], str(file)
        else:
            assert sha(file)==row['sha256'], str(file)
    for row in baseline['siblings']:
        assert git(row['path'],'rev-parse','HEAD')==row['head'], row['path']
        assert git(row['path'],'status','--porcelain')==row['status'], row['path']
    for row in json.loads((source/'docs/m1-7-yr-resources.json').read_text())['files']:
        assert sha(main/'.local'/row['path'])==row['sha256']
    subprocess.run(['git','-C',str(main),'merge-base','--is-ancestor',predecessor,'HEAD'],check=True)
    write('preservation.json',dict(status='PASS_EXISTING_RESOURCES_DIST_AND_SIBLINGS_PRESERVED',existingEntries=len(baseline['files']),siblings=len(baseline['siblings']),mainHead=git(main,'rev-parse','HEAD'),newResources=50))
    print('PRESERVATION_PASS',len(baseline['files']))
else:
    raise SystemExit('Expected snapshot, resources or verify')
