"""Chain accepted resources, complete native source adapters and retained unused art."""
import hashlib
import subprocess
from pathlib import Path

from newurban_batch89_io import pin, read, sha, write

ROOT = Path('.artifacts/m2-4/newurban-anchored-buildings-batch91-20261020')
PRIOR_ROOT = Path('.artifacts/m2-4/newurban-rock-crates-batch90-20261020')
PRIOR = PRIOR_ROOT / 'resource-handoff-v1.json'
assert sha(PRIOR) == 'c7cf9a589211f0f269ca0121b336248be4a83530fb37eca024d7f3315aa90199'
closure = read(ROOT / 'coverage-and-native-closure-v1.json')
assert closure['status'] == 'PASS_SIX_COMPLETE_ACCEPTED_ART_FAMILIES_24_NATIVE_MEMBER_DENSITY_PATHS'
files = {row['file']: row.copy() for row in read(PRIOR)['files']}
allowed = {'desktop/environment-newurban-hd-contract.json', '.local/environment-newurban-selection.json'}
repins = []


def include(file):
    file = Path(file)
    current = pin(file)
    previous = files.get(str(file))
    if previous and previous != current:
        assert str(file) in allowed, str(file)
        backup = ROOT / ('baseline-contract.json' if str(file).startswith('desktop/') else 'baseline-selector.json')
        assert sha(backup) == previous['sha256']
        if str(file).startswith('desktop/'):
            raw = subprocess.check_output(['git', 'show', 'f515f206:' + str(file)])
            assert hashlib.sha256(raw).hexdigest() == previous['sha256']
        repins.append(dict(file=str(file), before=previous['sha256'], after=current['sha256'], recovery=pin(backup),
            sourceGitRevision='f515f206' if str(file).startswith('desktop/') else None,
            reason='Register six complete source families using accepted art and two bounded native semantic adapters. All prior 197 families remain exact.'))
    files[str(file)] = current


for revision in ['newurban-environment-anchored-buildings-batch91-v1-combined', closure['candidate']['revision']]:
    for file in sorted((Path('.local/environment-packs') / revision).rglob('*')):
        if file.is_file():
            include(file)
excluded = {'resource-handoff-v1.json', 'resource-handoff-post-exit-v1.json',
    'desktop-delivery-v1.json', 'delivery-checkpoint-v1.json'}
for root in [ROOT, Path('.artifacts/m2-4/newurban-building-canvas-reuse-batch91-v1')]:
    for file in sorted(root.rglob('*')):
        if any(part.lower() in {'profile', 'review-profile', '__pycache__'} for part in file.parts):
            continue
        if file.is_file() and file.name not in excluded and file.suffix in {
                '.json', '.png', '.py', '.mjs', '.ts', '.html', '.js', '.log', '.txt', '.webm', '.index', '.pal', '.shp'}:
            include(file)
for original in read(ROOT / 'source-preparation-v2.json')['originalFiles']:
    include(Path(original['file']))
for name in ['audit-newurban-canvas-donors-batch91.ts', 'audit-newurban-anchored-donors-batch91.ts',
    'audit-newurban-structural-donors-batch91.ts', 'extract-newurban-accepted-donors-batch91.ts',
    'prepare-newurban-anchored-buildings-batch91.py', 'retain-newurban-batch91-mother.py',
    'newurban_batch91_materials.py', 'export-newurban-anchored-buildings-batch91.py',
    'reuse-newurban-anchored-buildings-batch91.py', 'audit-newurban-accepted-reuse-batch91.py',
    'native-newurban-accepted-reuse-batch91.mjs', 'reconcile-newurban-inventory-batch91.py',
    'close-newurban-accepted-reuse-batch91.py', 'handoff-newurban-accepted-reuse-batch91.py']:
    include(Path('scripts/m2-4') / name)
for file in [PRIOR, PRIOR_ROOT / 'user-acceptance-20261020.json', PRIOR_ROOT / 'delivery-checkpoint-v1.json',
    PRIOR_ROOT / 'desktop-delivery-v1.json', PRIOR_ROOT / 'resource-handoff-post-exit-v1.json',
    Path('desktop/environment-newurban-hd-contract.json'), Path('.local/environment-newurban-selection.json'),
    Path('.artifacts/m2-4/build-newurban-accepted-reuse-batch91-v1/identity.json')]:
    include(file)
assert {row['file'] for row in repins} == allowed
for row in files.values():
    assert pin(Path(row['file'])) == row, row['file']
main = '/Users/Aone/RA2remaster/ra2-hd'
head = subprocess.check_output(['git', '-C', main, 'rev-parse', 'HEAD'], text=True).strip()
porcelain = subprocess.check_output(['git', '-C', main, 'status', '--porcelain'], text=True)
write(ROOT / 'resource-handoff-v1.json', dict(
    status='PASS_COMPLETE_ACCEPTED_INHERITANCE_AND_BATCH91_SOURCE_REGISTRATION_HASH_CLOSURE',
    inheritedLedger=pin(PRIOR), acceptedPrior=pin(PRIOR_ROOT / 'user-acceptance-20261020.json'),
    candidate=closure['candidate'], runtimeSourceCommit=closure['runtimeSourceCommit'],
    closure=pin(ROOT / 'coverage-and-native-closure-v1.json'), files=list(files.values()), fileCount=len(files),
    explicitTaskPinsRepinned=repins, newCompleteFamilies=6, sourceMembers=12,
    newArtStudies=0, selectedNewMothers=0, retainedUnusedNewMothers=4,
    unselectedRedrawCandidate=read(ROOT / 'export-and-preservation-v1.json')['candidate'],
    sourceDensitySlots=360, exactAcceptedRgbaAuxiliaryPairs=354, oilShadeDensityAdapters=4,
    hospitalContactDensityAdapters=2, nativeEmptyDensitySlots=46, separateOriginalShadowSlots=104,
    sourcePolicy='Target original headers, archives, SHPs, palettes, logical bounds, separate shadows and gameplay remain immutable. Source-byte equality and accepted art compatibility are distinct. Accepted body/rubble/loop samples are reused directly, except the explicitly verified native contact and owner-shade semantics.',
    storage='Versioned isolated task packs, exact donor source evidence and retained unselected mothers/candidate. Desktop receives only embedded HTML, metadata and this ledger; no per-batch game or resource copy.',
    main=dict(head=head, clean=not porcelain.strip(), porcelain=porcelain, changedByTask=False),
    artworkAcceptance='INHERITED_ACCEPTED', nativeSemanticAdapters='TECHNICAL_PASS',
    repeatUserArtworkReview='NOT_REQUESTED', windows='NOT_RUN', mainIntegration='NOT_PERFORMED', m24Complete=False))
print(dict(files=len(files), ledger=pin(ROOT / 'resource-handoff-v1.json'), repins=len(repins),
    main=head, mainClean=not porcelain.strip(), newArtwork=0))
