"""Extend frozen resource authority with explicit recoverable application repins."""
import hashlib
import json
import subprocess
from pathlib import Path
from newurban_batch89_io import read, write
from newurban_batch97_materials import ROOT

PRIOR_ROOT = Path('.artifacts/m2-4/newurban-final-terrain-reuse-batch96-20261021')
PRIOR = PRIOR_ROOT / 'resource-handoff-v2.json'
assert hashlib.sha256(PRIOR.read_bytes()).hexdigest() == '17941b24ced3653b99ed978110d0313701d945d07405ebd1c27245ffbc6de05c'
closure = read(ROOT / 'coverage-and-native-closure-v1.json')
assert closure['status'].startswith('PASS_13_BUILDING_FAMILIES')
files = {row['file']: row.copy() for row in read(PRIOR)['files']}
allowed = {
    'desktop/environment-newurban-hd-contract.json': ROOT / 'baseline-contract.json',
    '.local/environment-newurban-selection.json': ROOT / 'baseline-selector.json',
    'src/engine/renderable/entity/map/TerrainHd.ts': ROOT / 'baseline-terrain-loader.ts',
}
cache, repins = {}, []


def pin(file):
    file = Path(file)
    stat = file.stat()
    key = stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns
    if key not in cache:
        digest = hashlib.sha256()
        with file.open('rb') as stream:
            for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b''):
                digest.update(chunk)
        after = file.stat()
        assert (after.st_size, after.st_mtime_ns) == (stat.st_size, stat.st_mtime_ns), file
        cache[key] = digest.hexdigest()
    return dict(file=str(file), sha256=cache[key], bytes=stat.st_size)


def include(file):
    current = pin(file)
    previous = files.get(str(file))
    if previous and current != previous:
        assert str(file) in allowed, f'Frozen dependency changed: {file}'
        recovery = pin(allowed[str(file)])
        assert recovery['sha256'] == previous['sha256'] and recovery['bytes'] == previous['bytes']
        repins.append(dict(file=str(file), before=previous, after=current, recovery=recovery,
            sourceGitRevision='0e82175d' if str(file).startswith(('src/', 'desktop/')) else None,
            reason='Register 13 new complete building SHP families and lossless NewUrban terrain CPU backing. All inherited artwork and frozen source evidence stay exact.'))
    files[str(file)] = current


for name in list(files):
    include(Path(name))
assert {r['file'] for r in repins} == set(allowed)
excluded = {'resource-handoff-v1.json', 'desktop-delivery-v1.json', 'delivery-checkpoint-v1.json'}
for file in sorted(ROOT.rglob('*')):
    if any(part.lower() in {'profile', 'review-profile', '__pycache__', 'cache', 'gpucache', 'code cache'} for part in file.parts):
        continue
    if file.is_file() and file.name not in excluded:
        include(file)
for directory in sorted(Path('.local/environment-packs').glob('newurban-environment-final-buildings-batch97-v*-combined')):
    for file in sorted(directory.rglob('*')):
        if file.is_file(): include(file)
sources = read(ROOT / 'source-v1.json')['sources']
for source in sources:
    include(ROOT / 'native' / source['nativeFile'])
    include(ROOT / 'native' / (source['palette']['sha256'] + '.pal'))
    for frame in source['frames']:
        for key in ['file', 'indexFile']:
            include(ROOT / 'native' / frame[key])
for file in sorted(Path('scripts/m2-4').glob('*batch97*')):
    if file.is_file(): include(file)
for file in [Path('src/engine/renderable/entity/map/retainedTerrainSource.ts'),
    Path('.artifacts/m2-4/build-newurban-final-buildings-batch97-v1/identity.json'),
    PRIOR, PRIOR_ROOT / 'user-acceptance-20261021.json', PRIOR_ROOT / 'desktop-delivery-v1.json',
    PRIOR_ROOT / 'delivery-checkpoint-v1.json']:
    include(file)
main = '/Users/Aone/RA2remaster/ra2-hd'
head = subprocess.check_output(['git', '-C', main, 'rev-parse', 'HEAD'], text=True).strip()
status = subprocess.check_output(['git', '-C', main, 'status', '--porcelain'], text=True)
ledger = dict(status='PASS_FROZEN_INHERITANCE_NEW_14_SOURCE_MEMBERS_AND_NATIVE_TECHNICAL_CLOSURE',
    inheritedLedger=pin(PRIOR), priorUserAcceptance=pin(PRIOR_ROOT / 'user-acceptance-20261021.json'),
    candidate=closure['candidate'], runtimeSourceCommit=closure['runtimeSourceCommit'],
    closure=pin(ROOT / 'coverage-and-native-closure-v1.json'), fileCount=len(files), files=list(files.values()),
    inheritedPinsVerified=len(read(PRIOR)['files']), explicitRecoverableRepins=repins,
    newSelectedFamilies=13, sourceMembers=14, newMothers=21, retainedUnusedPartialCandidate='newurban-environment-final-buildings-batch97-v2-combined',
    originalSourcesAndMapsModified=False, allInheritedArtworkExact=True,
    desktopPolicy='Only embedded HTML, image metadata and this complete ledger; no per-batch app or resource copy.',
    main=dict(head=head, clean=not status.strip(), porcelain=status, changedByTask=False,
        disclosure='Independent active UI/occlusion changes are preserved; no integration or overwrite is attempted.'),
    visual='PENDING_CONSOLIDATED_USER_REVIEW', windows='NOT_RUN', mainIntegration='NOT_PERFORMED', m24Complete=False)
write(ROOT / 'resource-handoff-v1.json', ledger)
print(dict(files=len(files), independentlyHashedUniquePayloads=len(cache), repins=len(repins), ledger=pin(ROOT / 'resource-handoff-v1.json')))
