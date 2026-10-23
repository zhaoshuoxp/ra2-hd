"""Freeze an additive complete resource ledger with two explicit selector repins."""
import hashlib
from pathlib import Path
import subprocess
from newurban_batch96_io import GUIDE, PRIOR, ROOT, pin, read, sha, write

parent = PRIOR / 'resource-handoff-v1.json'
assert sha(parent) == '28a2fa47ea2bc8dd0653433b3b491bb1beb2bb339e0c8aacdd0fa740471e3d20'
closure = read(ROOT / 'coverage-and-native-closure-v1.json')
assert closure['newCompleteSourceMembers'] == 21
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
        revision = '7d1f4d74c92c926bfd0d40c27b143656ac12fc90'
        if str(file).startswith('desktop/'):
            data = subprocess.check_output(['git', 'show', revision + ':' + str(file)])
            assert hashlib.sha256(data).hexdigest() == previous['sha256']
        repins.append(dict(file=str(file), before=previous['sha256'], after=current['sha256'], recovery=pin(backup),
            sourceGitRevision=revision if str(file).startswith('desktop/') else None,
            reason='21 complete NewUrban terrain sources; all 98 inherited groups and their complete atlas bytes remain exact.'))
    files[str(file)] = current


for version in [1, 2]:
    folder = Path('.local/terrain-packs') / f'newurban-m2-4-final-terrain-batch96-v{version}'
    for file in sorted(folder.rglob('*')):
        if file.is_file():
            include(file)
excluded = {'resource-handoff-v1.json', 'desktop-delivery-v1.json', 'delivery-checkpoint-v1.json'}
for file in sorted(ROOT.rglob('*')):
    if any('profile' in part.lower() or part == '__pycache__' for part in file.parts):
        continue
    if file.is_file() and file.name not in excluded:
        include(file)
for source in read(ROOT / 'source-v2.json')['sources']:
    include(GUIDE / 'native' / source['nativeFile'])
    for frame in source['images']:
        include(GUIDE / 'native' / frame['file'])
for file in Path('scripts/m2-4').glob('*batch96*'):
    if file.is_file():
        include(file)
for file in [parent, PRIOR / 'user-acceptance-20261021.json', PRIOR / 'desktop-delivery-v1.json',
    PRIOR / 'delivery-checkpoint-v1.json', Path('desktop/terrain-theater-hd-contracts.json'),
    Path('.local/terrain-newurban-selection.json'), GUIDE / 'source.json']:
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
handoff_head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
runtime_diff = subprocess.check_output(['git', 'diff', closure['runtimeSourceCommit'], handoff_head,
    '--name-only', '--', 'src', 'desktop'], text=True).splitlines()
assert not runtime_diff
write(ROOT / 'resource-handoff-v1.json', dict(
    status='PASS_COMPLETE_NEW_FAMILIES_AND_ALL_INHERITED_RESOURCE_HASHES', inheritedLedger=pin(parent),
    priorAcceptance=pin(PRIOR / 'user-acceptance-20261021.json'), candidate=closure['candidate'],
    runtimeSourceCommit=closure['runtimeSourceCommit'], sourceHandoffCommit=handoff_head,
    closure=pin(ROOT / 'coverage-and-native-closure-v1.json'), files=list(files.values()), fileCount=len(files),
    explicitTaskPinsRepinned=repins, newCompleteSourceMembers=21, newCompleteLoadFamilies=12,
    inheritedCompleteAtlasFilesExact=196, priorDensitySamplesAndGuardsExact=3890,
    originalUnreferencedCompatibilityDensitySlots=80, selectedNewMothers=2,
    artworkReview='PENDING_CHANGED_CONTEXT_AND_TWO_NATIVE_GUIDED_STRUCTURES',
    storage='One internal mutable Mac host. Desktop receives embedded HTML, metadata and this complete ledger only.',
    main=dict(head=head, clean=not porcelain.strip(), porcelain=porcelain, changedByTask=False),
    windows='NOT_RUN', mainIntegration='NOT_PERFORMED', m24Complete=False))
print(dict(files=len(files), ledger=pin(ROOT / 'resource-handoff-v1.json'), repins=len(repins),
    main=head, mainClean=not porcelain.strip()))
