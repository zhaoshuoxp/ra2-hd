"""Pin the complete repaint, generation provenance and inherited accepted dependencies."""
import hashlib
import json
import subprocess
from pathlib import Path

root = Path('.artifacts/m2-4/desert-low-bridge-continuous-r1-20261020')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
prior_file = Path('.artifacts/m2-4/desert-low-bridge-batch82-20261019/resource-handoff-v2.json')
assert sha(prior_file) == '6d8e8f64fdc748568e71b8a627ee386d6dae6f7621b95eea35c3c61cfcde6051'
prior = read(prior_file)
files = {row['file']: row.copy() for row in prior['files']}
repinned = []


def include(file):
    file = Path(file)
    entry = dict(file=str(file), sha256=sha(file), bytes=file.stat().st_size)
    previous = files.get(str(file))
    if previous and previous['sha256'] != entry['sha256']:
        assert str(file) in ['desktop/environment-desert-hd-contract.json', '.local/environment-desert-selection.json']
        repinned.append(dict(file=str(file), before=previous['sha256'], after=entry['sha256']))
    files[str(file)] = entry


export = read(root / 'export-and-preservation-v1.json')
pack = Path('.local/environment-packs') / export['candidate']['revision']
assert sha(pack / 'manifest.json') == export['candidate']['sha256']
for file in pack.rglob('*'):
    if file.is_file():
        include(file)
for file in root.rglob('*'):
    if not file.is_file() or 'profile' in file.parts or file.name in {
        'resource-handoff-v1.json', 'desktop-delivery-v1.json', 'desktop-static-qa-v1.json', 'delivery-checkpoint-v1.json'}:
        continue
    if file.suffix in ['.json', '.png', '.log', '.html', '.webm']:
        include(file)
for name in ['export-desert-low-bridge-continuous-r1.py', 'audit-desert-low-bridge-continuous-r1.py',
             'close-desert-low-bridge-continuous-r1.py', 'review-desert-low-bridge-continuous-r1.py',
             'handoff-desert-low-bridge-continuous-r1.py', 'native-desert-broken-bridge-ends.mjs']:
    include(Path('scripts/m2-4') / name)
include(Path('desktop/environment-desert-hd-contract.json'))
include(Path('.local/environment-desert-selection.json'))
include(prior_file)
for row in files.values():
    file = Path(row['file'])
    assert file.is_file() and file.stat().st_size == row['bytes'] and sha(file) == row['sha256'], str(file)
stage = read(root / 'active-stage-v1.json')
main = '/Users/Aone/RA2remaster/ra2-hd'
assert not subprocess.check_output(['git', '-C', main, 'status', '--porcelain'], text=True).strip()
head = subprocess.check_output(['git', '-C', main, 'rev-parse', 'HEAD'], text=True).strip()
result = dict(status='PASS_COMPLETE_REPAINT_AND_INHERITED_RESOURCE_HASH_CLOSURE',
    inheritedLedger=dict(file=str(prior_file), sha256=sha(prior_file), files=prior['fileCount']),
    candidate=export['candidate'], runtimeSourceCommit=stage['runtimeSourceHead'], fileCount=len(files),
    files=list(files.values()), mutableTaskPinsRepinned=repinned, repaintedMembers=26, changedBasePages=52,
    generatedMothers=4, promptSet=dict(file=str(root / 'imagegen-jobs.json'), sha256=sha(root / 'imagegen-jobs.json')),
    storage='Existing isolated task resources; no per-batch game/resource copy. All project-bound mothers copied into the workspace.',
    main=dict(head=head, clean=True, changedByTask=False), visualAcceptance='PENDING_ALL_26_REPAINTED_MEMBERS',
    windows='NOT_RUN', m24Complete=False)
with (root / 'resource-handoff-v1.json').open('x') as stream:
    stream.write(json.dumps(result, indent=2) + '\n')
print(json.dumps(dict(files=len(files), sha256=sha(root / 'resource-handoff-v1.json'), repinned=repinned)))
