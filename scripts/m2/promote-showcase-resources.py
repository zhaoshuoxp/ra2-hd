"""Transfer the accepted showcase closure without replacing inherited resources."""
import argparse
import hashlib
import json
import os
import shutil
import stat
import subprocess
from collections import Counter
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('phase', choices=['transfer', 'select'])
parser.add_argument('--main', required=True, type=Path)
parser.add_argument('--output', required=True, type=Path)
args = parser.parse_args()
root, main, out = Path.cwd(), args.main.resolve(), args.output.resolve()
selectors = {'.local/terrain-selection.json', '.local/environment-selection.json'}
transfer = json.loads((root / 'docs/m2-2-resource-transfer.json').read_text())


def sha(file):
    digest = hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def describe(file, base):
    row = dict(path=file.relative_to(base).as_posix(), mode=stat.S_IMODE(file.lstat().st_mode))
    if file.is_symlink():
        row['link'] = os.readlink(file)
    else:
        row.update(bytes=file.stat().st_size, sha256=sha(file))
    return row


def save(name, value):
    (out / name).write_text(json.dumps(value, indent=2) + '\n')


if args.phase == 'transfer':
    out.mkdir(parents=True, exist_ok=False)
    assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=main).strip()
    checkpoint = dict(mainHead=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=main).decode().strip(),
                      sourceHead=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root).decode().strip(),
                      transferSha256=sha(root / 'docs/m2-2-resource-transfer.json'), files=[])
    for directory in ['.local', 'dist']:
        base = main / directory
        if base.exists():
            checkpoint['files'].extend(describe(file, main) for file in sorted(base.rglob('*'))
                                       if file.is_file() or file.is_symlink())
    save('before.json', checkpoint)
    rows = transfer['runtimeFiles'] + transfer['authoringFiles']
    plan = []
    for row in rows:
        relative = Path(row['path'])
        assert not relative.is_absolute() and '..' not in relative.parts
        source, target = root / relative, main / relative
        assert not source.is_symlink() and source.stat().st_size == row['bytes']
        assert sha(source) == row['sha256'], source
        if row['path'] in selectors:
            continue
        if target.exists() or target.is_symlink():
            assert not target.is_symlink() and sha(target) == row['sha256'], target
            assert stat.S_IMODE(target.stat().st_mode) == int(row['mode'], 8), target
            plan.append((row, 'IDENTICAL'))
        else:
            plan.append((row, 'ADD'))
    for row, action in plan:
        if action == 'ADD':
            target = main / row['path']
            target.parent.mkdir(parents=True, exist_ok=True)
            with (root / row['path']).open('rb') as source, target.open('xb') as destination:
                shutil.copyfileobj(source, destination, 1024 * 1024)
            target.chmod(int(row['mode'], 8))
        assert sha(main / row['path']) == row['sha256']
    result = dict(status='PASS_ADDITIVE_TRANSFER_SELECTORS_DEFERRED', policy='ADD_IF_ABSENT_OR_IDENTICAL',
                  sourceRoot=str(root), mainRoot=str(main), runtimeFiles=len(transfer['runtimeFiles']),
                  authoringFiles=len(transfer['authoringFiles']), counts=dict(Counter(action for _, action in plan)),
                  inheritedFiles=len(checkpoint['files']), files=[dict(**row, action=action) for row, action in plan])
    save('transfer.json', result)
    print(json.dumps({key: value for key, value in result.items() if key != 'files'}))
else:
    checkpoint = json.loads((out / 'before.json').read_text())
    assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=main).strip()
    assert not subprocess.check_output(['git', 'diff', '5eeb766', 'HEAD', '--', 'src', 'desktop', 'public'], cwd=main)
    inherited = {row['path']: row for row in checkpoint['files']}
    for relative in selectors:
        target = main / relative
        if relative in inherited:
            assert describe(target, main) == inherited[relative], target
        else:
            assert not target.exists() and not target.is_symlink(), target
        expected = (root / relative).read_bytes()
        if target.exists() and target.read_bytes() == expected:
            continue
        temporary = target.with_name(target.name + '.m2-2-accepted.tmp')
        with temporary.open('xb') as stream:
            stream.write(expected)
        temporary.chmod(0o644)
        os.replace(temporary, target)
    for row in checkpoint['files']:
        if row['path'] not in selectors:
            assert describe(main / row['path'], main) == row, row['path']
    for row in transfer['runtimeFiles'] + transfer['authoringFiles']:
        target = main / row['path']
        assert sha(target) == row['sha256'] and target.stat().st_size == row['bytes'], target
    result = dict(status='PASS_SELECTED_CLOSURE_AND_INHERITED_RESOURCES',
                  mainHead=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=main).decode().strip(),
                  inheritedFilesPreserved=sum(row['path'] not in selectors for row in checkpoint['files']),
                  closureFilesVerified=len(transfer['runtimeFiles']) + len(transfer['authoringFiles']),
                  selectedTerrain=transfer['selectedTerrain'], selectedEnvironment=transfer['selectedEnvironment'],
                  selectorPolicy='Only accepted terrain/environment selectors changed; world/UI/prepared/dist bytes retained.',
                  errors=[])
    save('after.json', result)
    print(json.dumps(result))
