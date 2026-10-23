"""Extend the accepted ledger with complete linked families and retained failures."""
import hashlib
import subprocess
from pathlib import Path

from newurban_batch89_io import ROOT, pin, read, sha, write

PRIOR_ROOT = Path('.artifacts/m2-4/newurban-buildings-batch88-20261020')
PRIOR = PRIOR_ROOT / 'resource-handoff-v2.json'
assert sha(PRIOR) == '02eb8eeb1f1c994d3dcff82740fb56f0f479dc09b00c66f1016533fb2025afac'
closure = read(ROOT / 'coverage-and-native-closure-v1.json')
assert closure['status'] == 'PASS_TWELVE_COMPLETE_FAMILIES_28_NATIVE_MEMBER_DENSITY_PATHS_VISUAL_PENDING'
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
            previous = subprocess.check_output(['git', 'show', 'c1b66ae9:' + str(file)])
            assert hashlib.sha256(previous).hexdigest() == old['sha256']
        repins.append(dict(file=str(file), before=old['sha256'], after=record['sha256'], recovery=pin(backup),
            sourceGitRevision='c1b66ae9' if str(file).startswith('desktop/') else None,
            reason='Add twelve complete NewUrban families with all eight stadium sections, two exact accepted linked members and twelve continuous rubble studies. Preserve all prior 175 families.'))
    files[str(file)] = record


for revision in ['newurban-environment-linked-buildings-batch89-v1-combined',
                 'newurban-environment-linked-buildings-batch89-v2-combined', closure['candidate']['revision']]:
    for file in sorted((Path('.local/environment-packs') / revision).rglob('*')):
        if file.is_file():
            include(file)
roots = [ROOT, Path('.artifacts/m2-4/newurban-building-reuse-batch89-v1'),
    ROOT.with_name(ROOT.name + '-preparation-attempt-v1'), ROOT.with_name(ROOT.name + '-preparation-attempt-v2')]
excluded = {'resource-handoff-v1.json', 'resource-handoff-post-exit-v1.json',
    'desktop-delivery-v1.json', 'delivery-checkpoint-v1.json'}
for root in roots:
    for file in sorted(root.rglob('*')):
        if any(part.lower() in {'profile', 'review-profile', '__pycache__'} for part in file.parts):
            continue
        if file.is_file() and file.name not in excluded and file.suffix in {
                '.json', '.png', '.py', '.mjs', '.ts', '.html', '.js', '.log', '.txt', '.webm'}:
            include(file)
for original in read(ROOT / 'source-preparation-v2.json')['originalFiles']:
    include(Path(original['file']))
for name in ['audit-newurban-remaining-buildings-batch89.ts', 'newurban_batch89_io.py',
    'prepare-newurban-linked-buildings-batch89.py', 'retain-newurban-batch89-mother.py',
    'export-newurban-linked-buildings-batch89.py', 'repair-newurban-linked-header-batch89.py',
    'audit-newurban-linked-buildings-batch89.py', 'select-newurban-linked-buildings-batch89.py',
    'native-newurban-linked-buildings-batch89.mjs', 'reconcile-newurban-inventory-batch89.py',
    'review-newurban-linked-buildings-batch89.py', 'close-newurban-linked-buildings-batch89.py',
    'handoff-newurban-linked-buildings-batch89.py']:
    include(Path('scripts/m2-4') / name)
for file in [PRIOR, PRIOR_ROOT / 'user-acceptance-20261020.json', PRIOR_ROOT / 'delivery-checkpoint-v1.json',
    PRIOR_ROOT / 'desktop-delivery-v1.json', PRIOR_ROOT / 'resource-handoff-post-exit-v1.json',
    Path('desktop/environment-newurban-hd-contract.json'), Path('.local/environment-newurban-selection.json'),
    Path('.artifacts/m2-4/build-newurban-linked-buildings-batch89-v1/identity.json'),
    Path('.artifacts/m2-4/build-newurban-linked-buildings-batch89-v2/identity.json')]:
    include(file)
assert {row['file'] for row in repins} == allowed
for row in files.values():
    assert pin(Path(row['file'])) == row, row['file']
main = '/Users/Aone/RA2remaster/ra2-hd'
head = subprocess.check_output(['git', '-C', main, 'rev-parse', 'HEAD'], text=True).strip()
porcelain = subprocess.check_output(['git', '-C', main, 'status', '--porcelain'], text=True)
write(ROOT / 'resource-handoff-v1.json', dict(status='PASS_COMPLETE_ACCEPTED_INHERITANCE_AND_BATCH89_RESOURCE_HASH_CLOSURE',
    inheritedLedger=pin(PRIOR), acceptedPrior=pin(PRIOR_ROOT / 'user-acceptance-20261020.json'),
    candidate=closure['candidate'], runtimeSourceCommit=closure['runtimeSourceCommit'],
    closure=pin(ROOT / 'coverage-and-native-closure-v1.json'), files=list(files.values()), fileCount=len(files),
    explicitTaskPinsRepinned=repins, newCompleteFamilies=12, sourceMembers=14, newRubbleStudies=12,
    selectedBuiltinMothers=6, builtinCalls=6, exactAcceptedDensitySlots=222, semanticAcceptedDensitySlots=4,
    nativeEmptyDensitySlots=32, originalNativeShadowSlots=93, retainedAttempts=closure['retainedAttempts'],
    sourcePolicy='Original map/archive/SHP/index/palette/logical/shadow data remains immutable. All previously accepted source families and complete linked payloads remain exact. The D sign semantic adapter is explicit, source-pinned and separate from exact original equivalence.',
    storage='Versioned task-local resource packs and project-bound built-in mothers. Desktop receives only the embedded HTML, metadata and this ledger; no per-batch game or resource copy.',
    main=dict(head=head, clean=not porcelain.strip(), porcelain=porcelain, changedByTask=False),
    newArtworkAcceptance='PENDING_TWELVE_NEW_RUBBLE_STUDIES', windows='NOT_RUN',
    mainIntegration='NOT_PERFORMED', m24Complete=False))
print(dict(files=len(files), ledger=pin(ROOT / 'resource-handoff-v1.json'), repins=len(repins),
    main=head, mainClean=not porcelain.strip()))
