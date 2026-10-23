"""Retain selected road resources, explicit unresolved families and every failed candidate."""
import hashlib
import subprocess
from pathlib import Path
from newurban_batch93_io import ROOT, GUIDE, pin, read, sha, write

PRIOR = Path('.artifacts/m2-4/newurban-cross-name-reuse-batch92-20261020')
parent = PRIOR / 'resource-handoff-v1.json'
assert sha(parent) == 'cdf8c4ac8d3af6ffe5f02d23ca65b99f5f9012d54658e2d4a98c8df6d08895d6'
closure = read(ROOT / 'coverage-and-native-closure-v1.json')
assert closure['newMembers'] == 30 and closure['deferredOriginalSlopes'] == 4
files = {r['file']: r.copy() for r in read(parent)['files']}
mutable = {'desktop/terrain-theater-hd-contracts.json', '.local/terrain-newurban-selection.json'}
repins = []


def include(file):
    file = Path(file)
    current = pin(file)
    previous = files.get(str(file))
    if previous and previous != current:
        assert str(file) in mutable, str(file)
        backup = ROOT / ('baseline-contract.json' if str(file).startswith('desktop/') else 'baseline-selector.json')
        assert sha(backup) == previous['sha256']
        if str(file).startswith('desktop/'):
            raw = subprocess.check_output(['git', 'show', 'ffc4a6a9:' + str(file)])
            assert hashlib.sha256(raw).hexdigest() == previous['sha256']
        repins.append(dict(file=str(file), before=previous['sha256'], after=current['sha256'],
            recovery=pin(backup), sourceGitRevision='ffc4a6a9' if str(file).startswith('desktop/') else None,
            reason='Thirty complete new road sources reuse accepted material. Four unresolved HD slope projections explicitly retain Original and remain missing. All prior 22 terrain groups and other theater selections are exact.'))
    files[str(file)] = current


for version in range(1, 8):
    directory = Path('.local/terrain-packs') / f'newurban-m2-4-accepted-road-network-batch93-v{version}'
    for file in sorted(directory.rglob('*')):
        if file.is_file():
            include(file)
excluded = {'resource-handoff-v1.json', 'resource-handoff-post-exit-v1.json',
            'desktop-delivery-v1.json', 'delivery-checkpoint-v1.json'}
for file in sorted(ROOT.rglob('*')):
    if any('profile' in part.lower() or part == '__pycache__' for part in file.parts):
        continue
    if file.is_file() and file.name not in excluded and file.suffix in {
            '.json', '.png', '.html', '.js', '.mjs', '.py', '.log', '.webm', '.rgba', '.tem', '.index', '.pal'}:
        include(file)
for source in read(ROOT / 'source.json')['sources']:
    include(GUIDE / 'native' / source['nativeFile'])
    for image in source['images']:
        include(GUIDE / 'native' / image['file'])
for row in read(ROOT / 'urban-road-reuse-preparation-v3.json')['records']:
    include(row['originalDonor']['file'])
    for frame in row['frames']:
        include(frame['donorOriginal']['file'])
for row in read(ROOT / 'accepted-desert-slope-r2-reuse-v1.json')['records']:
    include(row['donorOriginal']['file'])
for file in Path('scripts/m2-4').glob('*batch93*'):
    if file.is_file():
        include(file)
for file in [parent, PRIOR / 'delivery-checkpoint-v1.json', PRIOR / 'desktop-delivery-v1.json',
    PRIOR / 'resource-handoff-post-exit-v1.json', Path('desktop/terrain-theater-hd-contracts.json'),
    Path('.local/terrain-newurban-selection.json'), Path('.artifacts/m2-4/urban-native-v2/source.json'),
    Path('.artifacts/m2-4/desert-native-v1/source.json'), Path('.artifacts/m2-4/newurban-native-v1/source.json')]:
    include(file)
for version in [1, 2, 4, 5]:
    include(Path(f'.artifacts/m2-4/build-newurban-road-reuse-batch93-v{version}/identity.json'))
assert {r['file'] for r in repins} == mutable
for row in files.values():
    assert pin(row['file']) == row, row['file']
main = '/Users/Aone/RA2remaster/ra2-hd'
head = subprocess.check_output(['git', '-C', main, 'rev-parse', 'HEAD'], text=True).strip()
porcelain = subprocess.check_output(['git', '-C', main, 'status', '--porcelain'], text=True)
write(ROOT / 'resource-handoff-v1.json', dict(
    status='PASS_SELECTED_THIRTY_ROADS_HASH_CLOSURE_FOUR_EXPLICIT_UNRESOLVED_ORIGINAL_SLOPES',
    inheritedLedger=pin(parent), candidate=closure['candidate'], runtimeSourceCommit=closure['runtimeSourceCommit'],
    closure=pin(ROOT / 'coverage-and-native-closure-v1.json'), files=list(files.values()), fileCount=len(files),
    explicitTaskPinsRepinned=repins, newRoadSources=30, newCompleteLoadFamilies=25,
    authoredDensitySlots=508, originalUnreferencedCompatibilityDensitySlots=40,
    inheritedPriorTerrainGroupsExact=22, priorBridgeCoreExact=4, selectedNewMothers=0,
    unresolvedSlopeMembers=['prslpe01.ubn', 'prslpe02.ubn', 'prslpe03.ubn', 'prslpe04.ubn'],
    unresolvedSlopeDecision=pin(ROOT / 'explicit-slope-original-fallback-v1.json'),
    artworkReview='PENDING_GROUPED_ROAD_CONTEXT_AND_BATCH92_MATERIAL_ONLY',
    storage='Versioned isolated resources, exact native source provenance, failed partial/complete candidates and one mutable internal Mac host. Desktop receives only embedded HTML, metadata and ledger.',
    main=dict(head=head, clean=not porcelain.strip(), porcelain=porcelain, changedByTask=False),
    windows='NOT_RUN', mainIntegration='NOT_PERFORMED', m24Complete=False))
print(dict(files=len(files), ledger=pin(ROOT / 'resource-handoff-v1.json'), repins=len(repins), main=head))
