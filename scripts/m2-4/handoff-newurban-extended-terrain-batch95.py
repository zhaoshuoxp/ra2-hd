"""Freeze an additive resource handoff with explicit recovery for the two selectors."""
import hashlib
import subprocess
from pathlib import Path
from newurban_batch95_io import ROOT, GUIDE, pin, read, sha, write

PRIOR = Path('.artifacts/m2-4/newurban-secondary-terrain-reuse-batch94-20261021')
parent = PRIOR / 'resource-handoff-v1.json'
assert sha(parent) == '009dc5446957135dde6af18b4034ef478f28575b768ab6f543ca6a6c62c0bd6d'
closure = read(ROOT / 'coverage-and-native-closure-v2.json')
assert closure['newCompleteSourceMembers'] == 36
files = {r['file']: r.copy() for r in read(parent)['files']}
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
            raw = subprocess.check_output(['git', 'show', 'e64541047c3600b71df78142b2d4d3409cc58ebf:' + str(file)])
            assert hashlib.sha256(raw).hexdigest() == previous['sha256']
        repins.append(dict(file=str(file), before=previous['sha256'], after=current['sha256'], recovery=pin(backup),
            sourceGitRevision='e64541047c3600b71df78142b2d4d3409cc58ebf' if str(file).startswith('desktop/') else None,
            reason='36 complete target terrain sources reuse accepted HD structures. All inherited samples/filter guards remain exact; four original road slopes remain explicit gaps.'))
    files[str(file)] = current


for version in range(1, 5):
    folder = Path('.local/terrain-packs') / f'newurban-m2-4-extended-cliff-reuse-batch95-v{version}'
    for file in sorted(folder.rglob('*')):
        if file.is_file():
            include(file)
excluded = {'resource-handoff-v1.json', 'desktop-delivery-v1.json', 'delivery-checkpoint-v1.json'}
for file in sorted(ROOT.rglob('*')):
    if any('profile' in part.lower() or part == '__pycache__' for part in file.parts):
        continue
    if file.is_file() and file.name not in excluded:
        include(file)
for source in read(ROOT / 'source.json')['sources']:
    include(GUIDE / 'native' / source['nativeFile'])
    for frame in source['images']:
        include(GUIDE / 'native' / frame['file'])
for file in Path('scripts/m2-4').glob('*batch95*'):
    if file.is_file():
        include(file)
for file in [parent, PRIOR / 'user-acceptance-20261021.json', PRIOR / 'delivery-checkpoint-v1.json',
    PRIOR / 'desktop-delivery-v1.json', PRIOR / 'resource-handoff-post-exit-v1.json',
    Path('desktop/terrain-theater-hd-contracts.json'), Path('.local/terrain-newurban-selection.json'),
    Path('src/engine/renderable/entity/map/MapTileLayer.ts'), Path('src/engine/gfx/SpriteUtils.ts'),
    Path('src/engine/gfx/drawable/TmpDrawable.ts'), GUIDE / 'source.json']:
    include(file)
for file in sorted(Path(read(ROOT / 'active-stage-v1.json')['build']).rglob('*')):
    if file.is_file():
        include(file)
assert {r['file'] for r in repins} == allowed
for index, row in enumerate(files.values(), 1):
    assert pin(row['file']) == row, row['file']
    if index % 10000 == 0:
        print(f'Checked {index} immutable file pins', flush=True)
main = '/Users/Aone/RA2remaster/ra2-hd'
head = subprocess.check_output(['git', '-C', main, 'rev-parse', 'HEAD'], text=True).strip()
porcelain = subprocess.check_output(['git', '-C', main, 'status', '--porcelain'], text=True)
write(ROOT / 'resource-handoff-v1.json', dict(
    status='PASS_COMPLETE_SOURCE_FAMILIES_INHERITED_FILTER_GUARDS_AND_ALL_RESOURCE_FILE_HASHES',
    inheritedLedger=pin(parent), priorAcceptance=pin(PRIOR / 'user-acceptance-20261021.json'),
    candidate=closure['candidate'], runtimeSourceCommit=closure['runtimeSourceCommit'],
    sourceHandoffCommit=subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
    closure=pin(ROOT / 'coverage-and-native-closure-v2.json'), files=list(files.values()), fileCount=len(files),
    explicitTaskPinsRepinned=repins, newCompleteSourceMembers=36, newCompleteLoadFamilies=6,
    priorDensitySamplesAndFilterGuardsExact=3588, originalUnreferencedCompatibilityDensitySlots=36,
    selectedNewMothers=0, deferredOriginalSlopes=closure['deferredOriginalSlopes'],
    artworkReview='PENDING_NEW_GROUND_CAP_ADAPTERS_AND_NATIVE_CONNECTIONS_ONLY',
    storage='One internal mutable Mac host. Desktop receives embedded HTML, metadata and this complete hash ledger only; no game or asset copy.',
    main=dict(head=head, clean=not porcelain.strip(), porcelain=porcelain, changedByTask=False),
    windows='NOT_RUN', mainIntegration='NOT_PERFORMED', m24Complete=False))
print(dict(files=len(files), ledger=pin(ROOT / 'resource-handoff-v1.json'), repins=len(repins), main=head,
    mainClean=not porcelain.strip()))
