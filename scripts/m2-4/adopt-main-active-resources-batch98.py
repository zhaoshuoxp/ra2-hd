"""Add canonical active dependencies and explicitly preserve any superseded task bytes."""
import argparse
import hashlib
import json
import os
import shutil
from collections import Counter
from pathlib import Path
from newurban_batch89_io import pin, read, write

parser = argparse.ArgumentParser()
parser.add_argument('--apply', action='store_true')
args = parser.parse_args()
root = Path('.artifacts/m2-4/newurban-final-actors-batch98-20261021')
graph_file = root / 'main-active-resource-graph-v1.json'
graph = read(graph_file)
source_root = Path(graph['root'])
target_root = Path('.local').resolve()
allowed = {'hd-packs', 'prepared-hd', 'ui-packs', 'ui-selection.json'}
cache = {}


def digest(file):
    stat = file.stat()
    identity = stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns
    if identity not in cache:
        value = hashlib.sha256()
        with file.open('rb') as stream:
            for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
                value.update(block)
        cache[identity] = value.hexdigest()
    return cache[identity]


def theater_pins():
    return {file.name: pin(file) for file in sorted(Path('.local').glob('*selection*.json'))
        if file.name != 'ui-selection.json'}


if not args.apply:
    rows = []
    for name in graph['files']:
        relative = Path(name)
        assert not relative.is_absolute() and '..' not in relative.parts and relative.parts[0] in allowed
        source, target = source_root / relative, target_root / relative
        assert source.is_file() and target.parent.resolve().is_relative_to(target_root)
        source_hash = digest(source)
        before = digest(target) if target.is_file() else None
        action = 'IDENTICAL' if before == source_hash else 'ADD' if before is None else 'RECOVERABLE_REPIN'
        rows.append(dict(file=name, sha256=source_hash, bytes=source.stat().st_size, action=action,
            previousSha256=before, previousBytes=target.stat().st_size if before else 0,
            previousLink=str(target.readlink()) if target.is_symlink() else None))
    counts = Counter(row['action'] for row in rows)
    plan = dict(schema='m2-4-current-main-resource-adoption-v1', status='REVIEWABLE_TRANSFER_PLAN',
        mainCommit=graph['mainCommit'], sourceRoot=str(source_root), targetRoot=str(target_root),
        canonicalGraph=pin(graph_file), protectedTheaters=theater_pins(), rows=rows, counts=dict(counts),
        bytesAdded=sum(row['bytes'] for row in rows if row['action'] == 'ADD'),
        bytesRepinned=sum(row['bytes'] for row in rows if row['action'] == 'RECOVERABLE_REPIN'),
        originalArchivesAndMapsIncluded=False, mainModified=False,
        policy='Add missing active files. Identical files are untouched. Only explicitly listed task files may be repinned after byte-exact recovery retention; every replacement uses a new inode. No deletion or main writes.')
    write(root / 'main-resource-adoption-plan-v1.json', plan)
    print({key: plan[key] for key in ['counts', 'bytesAdded', 'bytesRepinned']})
else:
    plan_file = root / 'main-resource-adoption-plan-v1.json'
    plan = read(plan_file)
    assert pin(graph_file) == plan['canonicalGraph'] and theater_pins() == plan['protectedTheaters']
    recovery_root = root / 'main-resource-recovery-v1'
    recovery_root.mkdir()
    completed = []
    for row in plan['rows']:
        relative = Path(row['file'])
        source, target = source_root / relative, target_root / relative
        assert digest(source) == row['sha256'] and source.stat().st_size == row['bytes']
        before = digest(target) if target.is_file() else None
        assert before == row['previousSha256'], f'Target changed since plan: {relative}'
        recovery = None
        if row['action'] == 'RECOVERABLE_REPIN':
            old = recovery_root / relative
            old.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(target, old)
            assert digest(old) == row['previousSha256']
            recovery = pin(old)
        if row['action'] != 'IDENTICAL':
            target.parent.mkdir(parents=True, exist_ok=True)
            assert target.parent.resolve().is_relative_to(target_root)
            temporary = target.with_name(target.name + '.m24-main-adoption-v1-tmp')
            with temporary.open('xb') as stream, source.open('rb') as incoming:
                shutil.copyfileobj(incoming, stream, 4 * 1024 * 1024)
            assert digest(temporary) == row['sha256']
            os.replace(temporary, target)
        assert digest(target) == row['sha256']
        completed.append(dict(**row, recovery=recovery))
    assert theater_pins() == plan['protectedTheaters']
    write(root / 'main-resource-adoption-v1.json', dict(schema=plan['schema'],
        status='PASS_CANONICAL_CORE_UI_AND_ACTUAL_PREPARED_DEPENDENCIES_ADOPTED',
        mainCommit=plan['mainCommit'], plan=pin(plan_file), counts=plan['counts'], files=completed,
        protectedTheaters=plan['protectedTheaters'], originalArchivesAndMapsChanged=False,
        mainModified=False, native='NOT_RUN_ON_MERGED_BUILD', windows='NOT_RUN', m24Complete=False))
    print(dict(status='PASS_EXACT_TRANSFER_AND_EXPLICIT_RECOVERY_PINS', files=len(completed), counts=plan['counts']))
