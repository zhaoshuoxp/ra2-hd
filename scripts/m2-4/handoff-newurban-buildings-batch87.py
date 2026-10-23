"""Extend accepted ledgers with exact NewUrban batch sources, exports and evidence."""
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path('.artifacts/m2-4/newurban-buildings-batch87-20261020')
ART = Path('.artifacts/m2-4/newurban-building-rubble-authoring-batch87-v1')
GUIDE = Path('.artifacts/m2-4/newurban-native-v1')
PREFLIGHT = Path('.artifacts/m2-4/newurban-reuse-batch87-preflight-v1')
PRIOR = Path('.artifacts/m2-4/desert-airport-markings-r1-20261020/resource-handoff-v1.json')
URBAN_PRIOR = Path('.artifacts/m2-4/bridge-overlay-completion-r5-20261019/resource-handoff-v3.json')
ACCEPTED = PRIOR.parent / 'user-acceptance-20261020.json'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
assert sha(PRIOR) == '98bc155fd021b2a6f247bb7d787dbb0276f741cafc2ecbed1f13b18bdad6dffa'
assert sha(URBAN_PRIOR) == '87c550c039869fac6fd429d7b570ea121429bf88e16ba4a70ae0ecac86b9fd38'
assert sha(ACCEPTED) == '9d1196dfe71582e3eabd002df65890248a26d778da3d816a90ac077edad0eaa7'
closure = read(ROOT / 'coverage-and-native-closure-v1.json')
assert closure['status'] == 'PASS_24_COMPLETE_NEWURBAN_FAMILIES_48_NATIVE_DENSITY_CASES_VISUAL_PENDING'
assert read(ROOT / 'source-static-qa-v1.json')['decodedPngs'] == 89
files = {row['file']: row.copy() for row in read(PRIOR)['files']}
historical = []
for row in read(URBAN_PRIOR)['files']:
    file = Path(row['file']).relative_to(Path.cwd())
    record = dict(file=str(file), sha256=row['sha256'], bytes=row['bytes'])
    old = files.get(str(file))
    if old and old != record:
        assert str(file) == 'scripts/m2-4/urban-bridge-loading.test.ts'
        before = subprocess.check_output(['git', 'show', 'c43b00aea8e94e2bd86dd65b2685da7aa28e1c4e:' + str(file)])
        after = subprocess.check_output(['git', 'show', 'd1b69ead:' + str(file)])
        assert hashlib.sha256(before).hexdigest() == record['sha256']
        assert hashlib.sha256(after).hexdigest() == old['sha256'] == sha(file)
        historical.append(dict(file=str(file), historicalPin=record, currentPin=old,
            originalGitRevision='c43b00aea8e94e2bd86dd65b2685da7aa28e1c4e', supersedingGitRevision='d1b69ead',
            reason='Pre-existing Desert bridge-test allowlist expansion, already pinned by the inherited accepted airport ledger. Not a Batch87 change.'))
    else:
        files[str(file)] = record

repins = []
allowed = {'desktop/environment-newurban-hd-contract.json', '.local/environment-newurban-selection.json'}
selection = read(ROOT / 'selection-v1.json')


def include(file):
    file = Path(file)
    record = pin(file)
    old = files.get(str(file))
    if old and old != record:
        assert str(file) in allowed, str(file)
        if str(file).startswith('desktop/'):
            previous = subprocess.check_output(['git', 'show', '7a240f6e:' + str(file)])
            assert hashlib.sha256(previous).hexdigest() == old['sha256'] == selection['priorContractSha256']
            recovery = dict(gitRevision='7a240f6e', path=str(file))
        else:
            assert old['sha256'] == selection['priorSelectorSha256']
            recovery = dict(priorSelection=selection['priorContract']['selectedPack'],
                receipt=str(ROOT / 'selection-v1.json'))
        repins.append(dict(file=str(file), before=old['sha256'], after=record['sha256'], recovery=recovery,
            reason='Explicit additive selection of 24 complete families; 112 prior NewUrban families retain exact payloads.'))
    files[str(file)] = record


def tree(root):
    for file in sorted(root.rglob('*')):
        if file.is_file():
            include(file)


for revision in [closure['candidate']['revision'], 'newurban-m2-4-building-rubble-batch87-v1',
                 'newurban-m2-4-complete-reuse-batch87-v1']:
    tree(Path('.local/environment-packs') / revision)
for root in [ART, PREFLIGHT, Path('.artifacts/m2-4/newurban-complete-reuse-export-batch87-v1')]:
    tree(root)
for file in Path('.artifacts/m2-4/newurban-building-rubble-native-batch87-v1').iterdir():
    if file.is_file():
        include(file)
excluded = {'resource-handoff-v1.json', 'desktop-delivery-v1.json', 'delivery-checkpoint-v1.json'}
for file in sorted(ROOT.rglob('*')):
    if file.is_file() and 'profile' not in file.parts and file.name not in excluded:
        if file.suffix in {'.json', '.png', '.html', '.js', '.log', '.txt', '.webm'}:
            include(file)

# Pin actual files behind the smaller guide's native symlink, including native shadow slots.
guide = read(GUIDE / 'source.json')
include(GUIDE / 'source.json')
new_names = {source['member'] for source in read(Path('.artifacts/m2-4/newurban-building-rubble-native-batch87-v1/source.json'))['sources']}
new_names.update({'cgpark04.shp', 'cgpark05.shp', 'cgpark06.shp', 'cnmisc06.shp'})
proof = read(PREFLIGHT / 'building-state-audit-v1.json')
source_keys = {row['nativeKey'] for row in proof['rows']}
for source in guide['sources']:
    if source['member'] in new_names or source['key'] in source_keys:
        include(GUIDE / 'native' / source['nativeFile'])
        if source.get('palette'):
            include(GUIDE / 'native' / (source['palette']['sha256'] + '.pal'))
        for frame in source['frames']:
            for key in ['file', 'indexFile']:
                if frame.get(key):
                    include(GUIDE / 'native' / frame[key])
include(GUIDE / 'native' / (proof['targetRubblePalette']['sha256'] + '.pal'))
symlink = Path('.artifacts/m2-4/newurban-building-rubble-native-batch87-v1/native')
assert symlink.is_symlink() and symlink.resolve() == (GUIDE / 'native').resolve()

# Exact accepted donors remain individually recoverable together with their source proof.
profile = read(ART / 'material-profile-v2.json')
for row in profile['acceptedNativeBodyFrames'].values():
    donor = Path(row['manifestFile'])
    assert sha(donor) == row['manifestSha256']
    tree(donor.parent)
audit = read(PREFLIGHT / 'four-complete-families-audit-v1.json')
donor_root = Path('.local/environment-packs') / audit['donorSelectedPack']['revision']
include(donor_root / 'manifest.json')
donor_pack = read(donor_root / 'manifest.json')
for row in audit['qualified']:
    for entry in donor_pack['families'][row['donorFamily']]['members']:
        tree((donor_root / entry['path']).parent)
for name in ['audit-newurban-building-reuse-batch87.ts', 'prepare-newurban-rubble-batch87.py',
             'refine-newurban-rubble-reuse-batch87.py', 'audit-newurban-rubble-mothers-batch87.py',
             'select-newurban-buildings-batch87.py', 'reconcile-newurban-inventory-batch87.py',
             'native-newurban-original-rubble-batch87.mjs', 'review-newurban-buildings-batch87.py',
             'close-newurban-buildings-batch87.py', 'handoff-newurban-buildings-batch87.py',
             'stage-active-mac-review.mjs', 'export-theater-accepted-reuse.py']:
    include(Path('scripts/m2-4') / name)
for file in [PRIOR, URBAN_PRIOR, ACCEPTED, Path('desktop/environment-newurban-hd-contract.json'),
             Path('.local/environment-newurban-selection.json'),
             Path('.artifacts/m2-4/build-newurban-buildings-batch87-v1/identity.json')]:
    include(file)
assert {row['file'] for row in repins} == allowed
for row in files.values():
    file = Path(row['file'])
    assert file.is_file() and file.stat().st_size == row['bytes'] and sha(file) == row['sha256'], str(file)
main = '/Users/Aone/RA2remaster/ra2-hd'
head = subprocess.check_output(['git', '-C', main, 'rev-parse', 'HEAD'], text=True).strip()
porcelain = subprocess.check_output(['git', '-C', main, 'status', '--porcelain'], text=True)
ledger = dict(status='PASS_COMPLETE_INHERITED_AND_INCREMENTAL_NEWURBAN_RESOURCE_HASH_CLOSURE',
    inheritedLedgers=[pin(PRIOR), pin(URBAN_PRIOR)], priorAcceptance=pin(ACCEPTED),
    candidate=closure['candidate'], runtimeSourceCommit=closure['runtimeSourceCommit'],
    files=list(files.values()), fileCount=len(files), explicitTaskPinsRepinned=repins,
    preexistingHistoricalPinReconciliation=historical,
    symlinks=[dict(file=str(symlink), target=str(symlink.resolve()),
        policy='Actual target source/index/RGBA/palette/shadow files are individually pinned.')],
    closure=pin(ROOT / 'coverage-and-native-closure-v1.json'), completeFamilies=24,
    newUniqueRubbleStudies=19, exactAcceptedDensityFramesReused=132,
    historicalReceipts='Immutable preflight and selection snapshots retain their creation-time inputs; final worklist and raw mothers are independently pinned as current files.',
    storage='Task-local versioned resources and project-bound builtin mothers. Desktop receives only embedded HTML, metadata and this ledger; no game or resource copy.',
    main=dict(head=head, clean=not porcelain.strip(), porcelain=porcelain, changedByTask=False),
    visualAcceptance='PENDING_19_NEW_RUBBLE_STUDIES_ONLY', windows='NOT_RUN', m24Complete=False)
with (ROOT / 'resource-handoff-v1.json').open('x') as stream:
    stream.write(json.dumps(ledger, indent=2) + '\n')
print(json.dumps(dict(files=len(files), sha256=sha(ROOT / 'resource-handoff-v1.json'), repins=len(repins),
    main=head, mainClean=not porcelain.strip())))
