"""Chain exact accepted resources and retain both source-adapter attempts."""
import hashlib
import subprocess
from pathlib import Path
from newurban_batch89_io import pin, read, sha, write

ROOT = Path('.artifacts/m2-4/newurban-cross-name-reuse-batch92-20261020')
PRIOR = Path('.artifacts/m2-4/newurban-anchored-buildings-batch91-20261020')
parent = PRIOR / 'resource-handoff-v1.json'
assert sha(parent) == '46680081a3d70863c5d153577424ff211130483a176ef15af55b0f23d57f14f4'
closure = read(ROOT / 'coverage-and-native-closure-v1.json')
files = {r['file']: r.copy() for r in read(parent)['files']}
mutable = {'desktop/environment-newurban-hd-contract.json', '.local/environment-newurban-selection.json'}
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
            raw = subprocess.check_output(['git', 'show', '6244b0bf:' + str(file)])
            assert hashlib.sha256(raw).hexdigest() == previous['sha256']
        repins.append(dict(file=str(file), before=previous['sha256'], after=current['sha256'],
            recovery=pin(backup), sourceGitRevision='6244b0bf' if str(file).startswith('desktop/') else None,
            reason='Five additional complete families reuse accepted architecture with target source ownership/contact/material registration. Earlier 203 families remain exact.'))
    files[str(file)] = current


for version in [1, 2]:
    revision = read(ROOT / f'export-and-preservation-v{version}.json')['candidate']['revision']
    for file in sorted((Path('.local/environment-packs') / revision).rglob('*')):
        if file.is_file():
            include(file)
excluded = {'resource-handoff-v1.json', 'resource-handoff-post-exit-v1.json', 'desktop-delivery-v1.json', 'delivery-checkpoint-v1.json'}
for root in [ROOT, Path('.artifacts/m2-4/newurban-tmp-material-reuse-batch93-20261020')]:
    for file in sorted(root.rglob('*')):
        if any('profile' in part.lower() or part == '__pycache__' for part in file.parts):
            continue
        if file.is_file() and file.name not in excluded and file.suffix in {
                '.json', '.png', '.html', '.js', '.mjs', '.log', '.webm', '.index', '.pal', '.shp'}:
            include(file)
for original in read(ROOT / 'export-and-preservation-v2.json')['originalFiles']:
    include(original['file'])
for file in Path('scripts/m2-4').glob('*batch92*'):
    if file.is_file():
        include(file)
include('scripts/m2-4/audit-newurban-tmp-material-reuse-batch93.ts')
for file in [parent, PRIOR / 'user-acceptance-20261020.json', PRIOR / 'delivery-checkpoint-v1.json',
    PRIOR / 'desktop-delivery-v1.json', PRIOR / 'resource-handoff-post-exit-v1.json',
    Path('desktop/environment-newurban-hd-contract.json'), Path('.local/environment-newurban-selection.json'),
    Path('.artifacts/m2-4/build-newurban-cross-name-reuse-batch92-v1/identity.json'),
    Path('.artifacts/m2-4/build-newurban-cross-name-reuse-batch92-v2/identity.json')]:
    include(file)
assert {r['file'] for r in repins} == mutable
for row in files.values():
    assert pin(row['file']) == row, row['file']
main = '/Users/Aone/RA2remaster/ra2-hd'
head = subprocess.check_output(['git', '-C', main, 'rev-parse', 'HEAD'], text=True).strip()
porcelain = subprocess.check_output(['git', '-C', main, 'status', '--porcelain'], text=True)
write(ROOT / 'resource-handoff-v1.json', dict(status='PASS_COMPLETE_INHERITED_RESOURCES_FIVE_SOURCE_ADAPTERS_AND_RETAINED_FAILURE',
    inheritedLedger=pin(parent), acceptedPrior=pin(PRIOR / 'user-acceptance-20261020.json'),
    candidate=closure['candidate'], runtimeSourceCommit=closure['runtimeSourceCommit'],
    closure=pin(ROOT / 'coverage-and-native-closure-v1.json'), files=list(files.values()), fileCount=len(files),
    explicitTaskPinsRepinned=repins, completeFamilies=5, sourceMembers=5,
    exactRegisteredAcceptedDensityPayloads=84, boundedAdaptedDensityPayloads=12,
    originalShadowSlots=48, selectedNewMothers=0,
    storage='Versioned task resources and one internal validation host. Desktop receives only embedded HTML, metadata and this ledger; no per-batch game or resource copy.',
    main=dict(head=head, clean=not porcelain.strip(), porcelain=porcelain, changedByTask=False),
    changedArtworkReview='PENDING_GROUPED_MATERIAL_AND_NATIVE_CONTEXT_REVIEW', inheritedArtwork='ACCEPTED',
    windows='NOT_RUN', mainIntegration='NOT_PERFORMED', m24Complete=False))
print(dict(files=len(files), ledger=pin(ROOT / 'resource-handoff-v1.json'), repins=len(repins)))
