"""Pin inherited resources, exact reuse, original dependencies and retained failed attempts."""
import hashlib
from pathlib import Path
import subprocess
from newurban_batch94_io import ROOT, GUIDE, pin, read, sha, write

PRIOR = Path('.artifacts/m2-4/newurban-tmp-material-reuse-batch93-20261020')
parent = PRIOR / 'resource-handoff-v1.json'
assert sha(parent) == 'eac30048f8c3b58b1f956555f77833da09ed104e3ba518dff6d809d89d60b7c2'
closure = read(ROOT / 'coverage-and-native-closure-v1.json')
assert closure['newCompleteSourceMembers'] == 111
files = {row['file']: row.copy() for row in read(parent)['files']}
allowed = {'desktop/terrain-theater-hd-contracts.json', '.local/terrain-newurban-selection.json'}
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
            raw = subprocess.check_output(['git', 'show', '6d4d2097:' + str(file)])
            assert hashlib.sha256(raw).hexdigest() == previous['sha256']
        repins.append(dict(file=str(file), before=previous['sha256'], after=current['sha256'], recovery=pin(backup),
            sourceGitRevision='6d4d2097' if str(file).startswith('desktop/') else None,
            reason='111 complete source members reuse accepted artwork. Prior crops and two-texel guards remain exact after lossless packing. Four unresolved slopes remain Original and missing.'))
    files[str(file)] = current


for version in range(1, 6):
    root = Path('.local/terrain-packs') / f'newurban-m2-4-secondary-terrain-reuse-batch94-v{version}'
    for file in sorted(root.rglob('*')):
        if file.is_file():
            include(file)
excluded = {'resource-handoff-v1.json', 'resource-handoff-post-exit-v1.json',
            'desktop-delivery-v1.json', 'delivery-checkpoint-v1.json'}
for file in sorted(ROOT.rglob('*')):
    if any('profile' in part.lower() or part == '__pycache__' for part in file.parts):
        continue
    if file.is_file() and file.name not in excluded:
        include(file)
for row in read(ROOT / 'source-preparation-v2.json')['records']:
    include(row['targetOriginal']['file'])
    include(row['donorOriginal']['file'])
    for frame in row['frames']:
        include(frame['targetRgba']['file'])
        include(frame['donorRgba']['file'])
for file in Path('scripts/m2-4').glob('*batch94*'):
    if file.is_file():
        include(file)
for file in [parent, PRIOR / 'user-acceptance-20261021.json', PRIOR / 'delivery-checkpoint-v1.json',
    PRIOR / 'desktop-delivery-v1.json', PRIOR / 'resource-handoff-post-exit-v1.json',
    Path('desktop/terrain-theater-hd-contracts.json'), Path('.local/terrain-newurban-selection.json'),
    Path('src/engine/renderable/entity/map/TerrainHd.ts'), Path('src/engine/renderable/entity/map/terrainHdContract.ts'),
    Path('.artifacts/m2-4/newurban-native-v1/source.json'), Path('.artifacts/m2-4/urban-native-v2/source.json')]:
    include(file)
for version in [1, 2]:
    include(Path(f'.artifacts/m2-4/build-newurban-secondary-terrain-batch94-v{version}/identity.json'))
assert {r['file'] for r in repins} == allowed
for index, row in enumerate(files.values(), 1):
    assert pin(row['file']) == row, row['file']
    if index % 10000 == 0:
        print(f'Checked {index} immutable file pins', flush=True)
main = '/Users/Aone/RA2remaster/ra2-hd'
head = subprocess.check_output(['git', '-C', main, 'rev-parse', 'HEAD'], text=True).strip()
porcelain = subprocess.check_output(['git', '-C', main, 'status', '--porcelain'], text=True)
write(ROOT / 'resource-handoff-v1.json', dict(
    status='PASS_111_COMPLETE_SOURCE_FAMILIES_INHERITED_FILTER_GUARDS_AND_RESOURCE_HASH_CLOSURE',
    inheritedLedger=pin(parent), priorAcceptance=pin(PRIOR / 'user-acceptance-20261021.json'),
    candidate=closure['candidate'], runtimeSourceCommit=closure['runtimeSourceCommit'],
    closure=pin(ROOT / 'coverage-and-native-closure-v1.json'), files=list(files.values()), fileCount=len(files),
    explicitTaskPinsRepinned=repins, newCompleteSourceMembers=111, newCompleteLoadFamilies=45,
    priorDensitySamplesAndFilterGuardsExact=2372, originalCompatibilityDensitySlots=142,
    selectedNewMothers=0, deferredOriginalSlopes=closure['deferredOriginalSlopes'],
    artworkReview='PENDING_CHANGED_GRASS_AND_NATIVE_CONNECTIONS_ONLY',
    storage='Versioned isolated source/resources and retained failed attempts; one mutable internal Mac host. Desktop receives embedded HTML, metadata and ledger only.',
    main=dict(head=head, clean=not porcelain.strip(), porcelain=porcelain, changedByTask=False),
    windows='NOT_RUN', mainIntegration='NOT_PERFORMED', m24Complete=False))
print(dict(files=len(files), ledger=pin(ROOT / 'resource-handoff-v1.json'), repins=len(repins), main=head))
