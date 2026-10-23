"""Extend the accepted source ledger with ten complete small-object families."""
import hashlib
import subprocess
from pathlib import Path

from newurban_batch89_io import pin, read, sha, write

ROOT = Path('.artifacts/m2-4/newurban-rock-crates-batch90-20261020')
PRIOR_ROOT = Path('.artifacts/m2-4/newurban-linked-buildings-batch89-20261020')
PRIOR = PRIOR_ROOT / 'resource-handoff-v1.json'
assert sha(PRIOR) == '0d6078a14931d58a8257b88888c743fb2a9324fa38acc5ad439d39a6dabac75b'
closure = read(ROOT / 'coverage-and-native-closure-v1.json')
assert closure['status'] == 'PASS_TEN_COMPLETE_FAMILIES_20_NATIVE_MEMBER_DENSITY_PATHS_VISUAL_PENDING'
files = {row['file']: row.copy() for row in read(PRIOR)['files']}
allowed = {'desktop/environment-newurban-hd-contract.json', '.local/environment-newurban-selection.json'}
repins = []


def include(file):
    file = Path(file)
    record = pin(file)
    old = files.get(str(file))
    if old and old != record:
        assert str(file) in allowed, str(file)
        backup = ROOT / ('baseline-contract.json' if str(file).startswith('desktop/') else 'baseline-selector.json')
        assert sha(backup) == old['sha256']
        if str(file).startswith('desktop/'):
            previous = subprocess.check_output(['git', 'show', '5394ff46:' + str(file)])
            assert hashlib.sha256(previous).hexdigest() == old['sha256']
        repins.append(dict(file=str(file), before=old['sha256'], after=record['sha256'], recovery=pin(backup),
            sourceGitRevision='5394ff46' if str(file).startswith('desktop/') else None,
            reason='Add eight complete NewUrban rock families and both stock crates. Preserve all prior 187 families.'))
    files[str(file)] = record


for file in sorted((Path('.local/environment-packs') / closure['candidate']['revision']).rglob('*')):
    if file.is_file():
        include(file)
excluded = {'resource-handoff-v1.json', 'resource-handoff-post-exit-v1.json',
    'desktop-delivery-v1.json', 'delivery-checkpoint-v1.json'}
for file in sorted(ROOT.rglob('*')):
    if any(part.lower() in {'profile', 'review-profile', '__pycache__'} for part in file.parts):
        continue
    if file.is_file() and file.name not in excluded and file.suffix in {
            '.json', '.png', '.py', '.mjs', '.ts', '.html', '.js', '.log', '.txt', '.webm'}:
        include(file)
for original in read(ROOT / 'source-preparation-v1.json')['originalFiles']:
    include(Path(original['file']))
for name in ['prepare-newurban-rock-crates-batch90.py', 'retain-newurban-batch90-mother.py',
    'export-newurban-rock-crates-batch90.py', 'audit-newurban-rock-crates-batch90.py',
    'select-newurban-rock-crates-batch90.py', 'native-newurban-overlay-objects-batch90.mjs',
    'native-newurban-rock-crates-batch90.mjs', 'reconcile-newurban-inventory-batch90.py',
    'review-newurban-rock-crates-batch90.py', 'close-newurban-rock-crates-batch90.py',
    'handoff-newurban-rock-crates-batch90.py']:
    include(Path('scripts/m2-4') / name)
for file in [PRIOR, PRIOR_ROOT / 'user-acceptance-20261020.json', PRIOR_ROOT / 'delivery-checkpoint-v1.json',
    PRIOR_ROOT / 'desktop-delivery-v1.json', PRIOR_ROOT / 'resource-handoff-post-exit-v1.json',
    Path('desktop/environment-newurban-hd-contract.json'), Path('.local/environment-newurban-selection.json'),
    Path('.artifacts/m2-4/build-newurban-rock-crates-batch90-v1/identity.json')]:
    include(file)
assert {row['file'] for row in repins} == allowed
for row in files.values():
    assert pin(Path(row['file'])) == row, row['file']
main = '/Users/Aone/RA2remaster/ra2-hd'
head = subprocess.check_output(['git', '-C', main, 'rev-parse', 'HEAD'], text=True).strip()
porcelain = subprocess.check_output(['git', '-C', main, 'status', '--porcelain'], text=True)
write(ROOT / 'resource-handoff-v1.json', dict(
    status='PASS_COMPLETE_ACCEPTED_INHERITANCE_AND_BATCH90_RESOURCE_HASH_CLOSURE',
    inheritedLedger=pin(PRIOR), acceptedPrior=pin(PRIOR_ROOT / 'user-acceptance-20261020.json'),
    candidate=closure['candidate'], runtimeSourceCommit=closure['runtimeSourceCommit'],
    closure=pin(ROOT / 'coverage-and-native-closure-v1.json'), files=list(files.values()), fileCount=len(files),
    explicitTaskPinsRepinned=repins, newCompleteFamilies=10, sourceMembers=10, newArtStudies=10,
    selectedBuiltinMothers=5, builtinCalls=5, newBodyDensityFrames=20, originalNativeShadowSlots=10,
    retainedAttempts=closure['retainedAttempts'],
    sourcePolicy='Original map/archive/SHP/index/palette/logical/shadow data remains immutable. All 187 accepted prior source families remain exact. New material has no native pixel-grid mask in visual RGB or alpha.',
    storage='Versioned task-local packs and project-bound built-in mothers. Desktop receives embedded HTML, metadata and this ledger only; no per-batch game or resource copy.',
    main=dict(head=head, clean=not porcelain.strip(), porcelain=porcelain, changedByTask=False),
    newArtworkAcceptance='PENDING_TEN_NEW_ROCK_AND_CRATE_STUDIES', windows='NOT_RUN',
    mainIntegration='NOT_PERFORMED', m24Complete=False))
print(dict(files=len(files), ledger=pin(ROOT / 'resource-handoff-v1.json'), repins=len(repins),
    main=head, mainClean=not porcelain.strip()))
