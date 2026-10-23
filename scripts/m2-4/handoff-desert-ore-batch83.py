"""Pin new ore art, complete source frames and the unchanged accepted resource chain."""
import hashlib
import json
import subprocess
from pathlib import Path

root = Path('.artifacts/m2-4/desert-ore-batch83-20261020')
prior_root = Path('.artifacts/m2-4/desert-low-bridge-continuous-r1-20261020')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
prior_file = prior_root / 'resource-handoff-v1.json'
assert sha(prior_file) == '563257257ba6230af675897af9911c52cab1fb1329922a92a54a82bacda02ebe'
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


candidate = read(root / 'contract-candidate-v1.json')['selectedPack']
pack = Path('.local/environment-packs') / candidate['revision']
assert sha(pack / 'manifest.json') == candidate['sha256']
for file in pack.rglob('*'):
    if file.is_file():
        include(file)
for folder in [root, Path('.artifacts/m2-4/desert-ore-batch83-preparation-v2-20261019')]:
    for file in folder.rglob('*'):
        if not file.is_file() or 'profile' in file.parts or file.name in {
            'resource-handoff-v1.json', 'resource-handoff-v2.json', 'handoff-run-v1.log',
            'desktop-delivery-v1.json', 'desktop-static-qa-v1.json', 'delivery-checkpoint-v1.json'}:
            continue
        if file.suffix in ['.json', '.png', '.log', '.html', '.rgba', '.idx']:
            include(file)
guide_file = Path('.artifacts/m2-4/desert-native-v1/source.json')
include(guide_file)
for source in read(guide_file)['sources']:
    if source['member'] not in [f'tib{n:02d}.des' for n in range(1, 13)]:
        continue
    include(guide_file.parent / 'native' / source['nativeFile'])
    for frame in source['frames']:
        for key in ['file', 'indexFile']:
            include(guide_file.parent / 'native' / frame[key])
for name in ['export-desert-ore-batch83.py', 'audit-desert-ore-batch83.py', 'close-desert-ore-batch83.py',
             'review-desert-ore-batch83.py', 'handoff-desert-ore-batch83.py',
             'prepare-desert-ore-batch83.ts', 'audit-embedded-batch-review.py']:
    include(Path('scripts/m2-4') / name)
for file in ['scripts/m2/official-maps/native-resources.mjs', 'src/game/gameobject/trait/TiberiumTrait.ts',
             'desktop/environment-desert-hd-contract.json', '.local/environment-desert-selection.json']:
    include(Path(file))
include(prior_file)
include(prior_root / 'user-acceptance-20261020.json')
include(root / 'resource-handoff-v1.json')
for row in files.values():
    file = Path(row['file'])
    assert file.is_file() and file.stat().st_size == row['bytes'] and sha(file) == row['sha256'], str(file)
main = '/Users/Aone/RA2remaster/ra2-hd'
assert not subprocess.check_output(['git', '-C', main, 'status', '--porcelain'], text=True).strip()
head = subprocess.check_output(['git', '-C', main, 'rev-parse', 'HEAD'], text=True).strip()
stage = read(root / 'active-stage-v1.json')
result = dict(status='PASS_COMPLETE_ORE_AND_INHERITED_RESOURCE_HASH_CLOSURE',
    inheritedLedger=dict(file=str(prior_file), sha256=sha(prior_file), files=prior['fileCount']),
    candidate=candidate, runtimeSourceCommit=stage['runtimeSourceHead'], fileCount=len(files),
    files=list(files.values()), mutableTaskPinsRepinned=repinned,
    completeMembers=12, sourceBodyFrames=148, densityFrames=296, generatedMothers=3,
    promptSet=dict(file=str(root / 'imagegen-jobs.json'), sha256=sha(root / 'imagegen-jobs.json')),
    storage='Existing isolated task resources. No per-batch game/resource copy. Project-bound mothers retained in the workspace.',
    main=dict(head=head, clean=True, changedByTask=False), visualAcceptance='PENDING_12_NEW_ORE_MEMBERS',
    windows='NOT_RUN', m24Complete=False)
with (root / 'resource-handoff-v2.json').open('x') as stream:
    stream.write(json.dumps(result, indent=2) + '\n')
print(json.dumps(dict(files=len(files), sha256=sha(root / 'resource-handoff-v2.json'), repinned=repinned)))
