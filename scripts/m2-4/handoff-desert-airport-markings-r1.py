"""Extend the immutable accepted ledger with the bounded airport correction."""
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path('.artifacts/m2-4/desert-airport-markings-r1-20261020')
PRIOR = Path('.artifacts/m2-4/desert-final-buildings-batch86-20261020/resource-handoff-v1.json')
ACCEPTED = PRIOR.parent / 'user-acceptance-20261020.json'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
assert sha(PRIOR) == 'b2f6df63875e8a1bb9c2cbe5f6bfefc49b1f9de7c949500afc2ff0599129e42a'
assert sha(ACCEPTED) == '699dfdb6ced96b57be34771b669ecdacbbf76cc76c89205d61f4b1a101a82001'
closure = read(ROOT / 'technical-closure-v1.json')
assert closure['status'] == 'PASS_FOCUSED_MAC_AIRPORT_MARKING_CORRECTION_VISUAL_PENDING'
assert read(ROOT / 'source-static-qa-v1.json')['decodedPngs'] == 48
files = {row['file']: row.copy() for row in read(PRIOR)['files']}
repins = []
allowed = {'desktop/environment-desert-hd-contract.json', '.local/environment-desert-selection.json'}
selection = read(ROOT / 'selection-v1.json')


def include(file):
    file = Path(file)
    record = pin(file)
    old = files.get(str(file))
    if old and old != record:
        assert str(file) in allowed, str(file)
        if str(file).startswith('desktop/'):
            historical = subprocess.check_output(['git', 'show', 'ba79b68b:' + str(file)])
            assert hashlib.sha256(historical).hexdigest() == old['sha256']
            recovery = dict(gitRevision='ba79b68b', path=str(file))
        else:
            assert selection['previousSelectorSha256'] == old['sha256']
            recovery = dict(priorSelection=selection['previousContract']['selectedPack'], receipt=str(ROOT / 'selection-v1.json'))
        repins.append(dict(file=str(file), before=old['sha256'], after=record['sha256'], recovery=recovery,
            reason='Explicit source-pinned correction of only normal/damaged airport tower marking RGB; all native source semantics remain unchanged.'))
    files[str(file)] = record


candidate = closure['candidate']
for revision in [candidate['revision'], 'desert-m2-4-airport-markings-r1-v1', 'desert-m2-4-airport-markings-r1-v2']:
    for file in sorted((Path('.local/environment-packs') / revision).rglob('*')):
        if file.is_file():
            include(file)
excluded = {'resource-handoff-v1.json', 'desktop-delivery-v1.json', 'delivery-checkpoint-v1.json'}
for file in sorted(ROOT.rglob('*')):
    if file.is_file() and 'profile' not in file.parts and file.name not in excluded:
        if file.suffix in {'.json', '.png', '.html', '.js', '.log', '.txt', '.webm'}:
            include(file)
for name in ['repair-desert-airport-markings-r1.py', 'review-desert-airport-markings-r1.py',
             'close-desert-airport-markings-r1.py', 'handoff-desert-airport-markings-r1.py',
             'replace-environment-color-families.py', 'stage-active-mac-review.mjs']:
    include(Path('scripts/m2-4') / name)
for file in [PRIOR, ACCEPTED, Path('desktop/environment-desert-hd-contract.json'),
             Path('.local/environment-desert-selection.json'),
             Path('.artifacts/m2-4/build-desert-airport-markings-r1-v1/identity.json')]:
    include(file)
assert {row['file'] for row in repins} == allowed
for row in files.values():
    file = Path(row['file'])
    assert file.is_file() and file.stat().st_size == row['bytes'] and sha(file) == row['sha256'], str(file)
main = '/Users/Aone/RA2remaster/ra2-hd'
head = subprocess.check_output(['git', '-C', main, 'rev-parse', 'HEAD'], text=True).strip()
porcelain = subprocess.check_output(['git', '-C', main, 'status', '--porcelain'], text=True)
ledger = dict(status='PASS_BOUNDED_AIRPORT_MARKING_CORRECTION_AND_COMPLETE_INHERITED_RESOURCE_HASHES',
    inheritedLedger=pin(PRIOR), priorAcceptance=pin(ACCEPTED), feedback=pin(ROOT / 'feedback-and-root-cause-v1.json'),
    candidate=candidate, runtimeSourceCommit=closure['runtimeSourceCommit'], files=list(files.values()), fileCount=len(files),
    explicitTaskPinsRepinned=repins, changedMember='cdairp.shp', changedBodySlots=[0, 1], changedDensityFrames=4,
    originalSources='Unchanged source/palette/index/shadow files remain individually pinned by the inherited ledger.',
    storage='Task-local hash-pinned resources and project-bound builtin mothers. Desktop receives only embedded HTML, metadata and this ledger; no game or resource copy.',
    main=dict(head=head, clean=not porcelain.strip(), porcelain=porcelain, changedByTask=False),
    visualAcceptance='PENDING_AIRPORT_TOWER_MARKING_CORRECTION_ONLY', windows='NOT_RUN', m24Complete=False)
with (ROOT / 'resource-handoff-v1.json').open('x') as stream:
    stream.write(json.dumps(ledger, indent=2) + '\n')
print(json.dumps(dict(files=len(files), sha256=sha(ROOT / 'resource-handoff-v1.json'), repins=len(repins),
    main=head, mainClean=not porcelain.strip())))
