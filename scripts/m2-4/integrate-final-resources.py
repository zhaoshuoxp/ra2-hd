"""Add the final active closure to local main without replacing protected resource payloads."""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
from collections import Counter
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--apply', action='store_true')
args = parser.parse_args()
root = Path('.artifacts/m2-4/newurban-final-actors-batch98-20261021')
source = Path('.local').resolve()
main = Path('/Users/Aone/RA2remaster/ra2-hd')
target = main / '.local'
graph_file = root / 'task-final-active-resource-graph-v1.json'
graph = json.loads(graph_file.read_text())
cache = {}


def git(*args):
    return subprocess.check_output(['git', '-C', str(main), *args], text=True).strip()


def pin(file):
    file = Path(file)
    stat = file.stat()
    key = stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns
    if key not in cache:
        digest = hashlib.sha256()
        with file.open('rb') as stream:
            for block in iter(lambda: stream.read(8 * 1024 * 1024), b''):
                digest.update(block)
        assert file.stat().st_mtime_ns == stat.st_mtime_ns
        cache[key] = digest.hexdigest()
    return dict(file=str(file), sha256=cache[key], bytes=stat.st_size)


def write(file, value):
    with file.open('x') as stream:
        json.dump(value, stream, indent=2)
        stream.write('\n')


assert not git('status', '--porcelain'), 'Preserve concurrent main work'
head = git('rev-parse', 'HEAD')
assert head == 'ce852200acac671c46e751c11372c169631f6265', 'Refresh current main before applying this plan'
plan_file = root / 'local-main-resource-transfer-plan-v1.json'
if not args.apply:
    rows = []
    for row in graph['files']:
        relative = Path(row['file'])
        assert not relative.is_absolute() and '..' not in relative.parts
        incoming = pin(source / relative)
        assert incoming['sha256'] == row['sha256'] and incoming['bytes'] == row['bytes']
        destination = target / relative
        before = pin(destination) if destination.is_file() else None
        action = 'IDENTICAL' if before and before['sha256'] == row['sha256'] else 'ADD' if before is None else 'CONFLICT'
        if action == 'CONFLICT' and relative.name in {
            f'{kind}-{theater}-selection.json' for kind in ['terrain', 'environment']
            for theater in ['snow', 'urban', 'newurban', 'desert']}:
            action = 'RECOVERABLE_THEATER_SELECTOR'
        rows.append(dict(**row, action=action, before=before))
    counts = dict(Counter(row['action'] for row in rows))
    plan = dict(schema='m2-4-local-main-resource-transfer-v1', status='REVIEWABLE_EXACT_TRANSFER_PLAN',
        source=str(source), target=str(target), mainBefore=head, sourceGraph=pin(graph_file),
        rows=rows, counts=counts, addedBytes=sum(r['bytes'] for r in rows if r['action'] == 'ADD'),
        policy='Missing files only; exact existing payloads are untouched. Only four-theater selector files may change after retaining exact prior bytes. Original archives, accepted Temperate/faction/UI/prepared inputs are protected.')
    write(plan_file, plan)
    print(json.dumps(dict(counts=counts, addedBytes=plan['addedBytes'])))
else:
    plan = json.loads(plan_file.read_text())
    assert pin(graph_file) == plan['sourceGraph'] and 'CONFLICT' not in plan['counts']
    copied = selectors = 0
    for row in plan['rows']:
        relative = Path(row['file'])
        incoming, destination = source / relative, target / relative
        assert pin(incoming)['sha256'] == row['sha256']
        before = pin(destination) if destination.is_file() else None
        assert before == row['before'], f'Main resources changed after planning: {relative}'
        if row['action'] == 'RECOVERABLE_THEATER_SELECTOR':
            recovery = root / 'main-theater-selector-recovery-v1' / relative
            recovery.parent.mkdir(parents=True, exist_ok=True)
            with recovery.open('xb') as stream:
                stream.write(destination.read_bytes())
            assert pin(recovery)['sha256'] == before['sha256']
            selectors += 1
        if row['action'] != 'IDENTICAL':
            destination.parent.mkdir(parents=True, exist_ok=True)
            assert destination.parent.resolve().is_relative_to(target)
            temporary = destination.with_name(destination.name + '.m24-transfer-v1')
            with temporary.open('xb') as outgoing, incoming.open('rb') as stream:
                shutil.copyfileobj(stream, outgoing, 8 * 1024 * 1024)
            assert pin(temporary)['sha256'] == row['sha256']
            os.replace(temporary, destination)
            copied += 1
        assert pin(destination)['sha256'] == row['sha256']
    assert git('rev-parse', 'HEAD') == head and not git('status', '--porcelain')
    receipt = dict(status='PASS_ADDITIVE_LOCAL_MAIN_ACTIVE_RESOURCE_TRANSFER', plan=pin(plan_file),
        filesVerified=len(plan['rows']), filesAdded=copied - selectors, selectorsRepinnedWithRecovery=selectors,
        bytesAdded=plan['addedBytes'], protectedPayloadReplacements=0, mainBefore=head,
        sourceIntegration='NOT_YET_PERFORMED', windows='NOT_RUN_ON_THIS_MAC', m24Complete=False)
    write(root / 'local-main-resource-transfer-v1.json', receipt)
    print(json.dumps(receipt))
