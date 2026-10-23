"""Verify inherited authority and retain exact recovery bytes for explicit source/selector changes."""
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path('.artifacts/m2-4/newurban-final-actors-batch98-20261021')
PRIOR_ROOT = Path('.artifacts/m2-4/newurban-remaining-actors-batch97-20261021')
PRIOR = PRIOR_ROOT / 'resource-handoff-v2.json'
BASE = 'fa102d9fdb571523697d971ae5b6beb1caa65615'
CWD = Path.cwd()
cache, files, repins, errors = {}, {}, [], []


def read(file):
    return json.loads(Path(file).read_text())


def pin(file):
    file = Path(file)
    stat = file.stat()
    key = stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns
    if key not in cache:
        digest = hashlib.sha256()
        with file.open('rb') as stream:
            for block in iter(lambda: stream.read(8 * 1024 * 1024), b''):
                digest.update(block)
        after = file.stat()
        assert (after.st_size, after.st_mtime_ns) == (stat.st_size, stat.st_mtime_ns), file
        cache[key] = digest.hexdigest()
    return dict(file=str(file), sha256=cache[key], bytes=stat.st_size)


def include(file):
    row = pin(file)
    previous = files.get(row['file'])
    assert previous is None or previous == row, f'Duplicate authority differs: {file}'
    files[row['file']] = row


assert pin(PRIOR)['sha256'] == 'b01141aea4edc5915a30a2692ef00fac2a59c90adf3df41b37a23877c8da6f5a'
prior = read(PRIOR)
for old in prior['files']:
    path = Path(old['file'])
    try:
        current = pin(path)
        if current != old:
            relative = path.resolve().relative_to(CWD)
            recovery = ROOT / 'inherited-recovery-v1' / relative
            if str(relative) == '.local/environment-newurban-selection.json':
                data = (ROOT / 'baseline-selector.json').read_bytes()
                authority = 'Frozen Batch 97 selector snapshot'
            else:
                assert relative.parts[0] in {'src', 'scripts', 'desktop', 'docs'} or str(relative) in {
                    'AGENTS.md', 'package.json', 'bun.lock', 'tsconfig.json', 'tsconfig.build.json'}
                data = subprocess.check_output(['git', 'show', f'{BASE}:{relative}'])
                authority = BASE
            assert hashlib.sha256(data).hexdigest() == old['sha256'] and len(data) == old['bytes']
            recovery.parent.mkdir(parents=True, exist_ok=True)
            if recovery.exists():
                assert recovery.read_bytes() == data
            else:
                recovery.write_bytes(data)
            recovered = pin(recovery)
            repins.append(dict(file=old['file'], before=old, after=current, recovery=recovered,
                recoveryAuthority=authority, reason='Final actor registration, unified inventory, current accepted main presentation/Windows repairs, or updated technical evidence. No inherited artwork is repainted.'))
        include(path)
    except Exception as error:
        errors.append(dict(file=old['file'], error=str(error)))
if errors:
    (ROOT / 'handoff-unresolved-v1.json').write_text(json.dumps(errors, indent=2) + '\n')
    raise RuntimeError(f'{len(errors)} inherited pins require explicit resolution; no ledger published')

excluded = {'resource-handoff-v1.json', 'resource-handoff-v2.json'}
for file in sorted(ROOT.rglob('*')):
    if any(part.lower() in {'profile', 'cache', 'gpucache', 'code cache', '__pycache__'} for part in file.parts):
        continue
    if file.is_file() and file.name not in excluded:
        include(file)
for folder in Path('.local/environment-packs').glob('*batch98*'):
    for file in sorted(folder.rglob('*')):
        if file.is_file():
            include(file)
for source in read(ROOT / 'source-v1.json')['sources']:
    include(ROOT / 'native' / source['nativeFile'])
    include(ROOT / 'native' / (source['palette']['sha256'] + '.pal'))
    for frame in source['frames']:
        for field in ['file', 'indexFile']:
            include(ROOT / 'native' / frame[field])
for file in Path('scripts/m2-4').glob('*batch98*'):
    if file.is_file():
        include(file)
for file in [PRIOR, PRIOR_ROOT / 'user-acceptance-20261021.json',
    Path('docs/m2-4-final-actors-batch98-20261021.json'), Path('docs/m2-4-final-actors-batch98-20261021.md'),
    Path('src/engine/renderable/builder/hdAtlasPageLimit.ts'),
    Path('.artifacts/m2-4/build-final-actors-batch98-v1/identity.json'),
    Path('.artifacts/m2-4/build-final-actors-batch98-v2/identity.json')]:
    include(file)
graph = read(ROOT / 'task-final-active-resource-graph-v1.json')
for row in graph['files']:
    file = Path('.local') / row['file']
    current = pin(file)
    assert current['sha256'] == row['sha256'] and current['bytes'] == row['bytes']
    include(file)
ledger = dict(schema='m2-4-final-actors-resource-handoff-v1',
    status='PASS_ALL_INHERITED_PINS_EXPLICIT_RECOVERY_AND_ACCEPTED_FINAL_ACTORS',
    inheritedLedger=pin(PRIOR), inheritedPinsVerified=len(prior['files']),
    explicitRecoverableRepins=repins, fileCount=len(files), files=list(files.values()),
    acceptance=pin(ROOT / 'user-acceptance-20261021.json'),
    closure=pin(ROOT / 'coverage-and-native-closure-v2.json'),
    allTheaterReconciliation=pin(ROOT / 'all-theater-reconciliation-v2.json'),
    activeRuntimeGraph=pin(ROOT / 'task-final-active-resource-graph-v1.json'),
    newArtFamilies=['CIV1', 'DNOA'], newAuthoredPoses=450, exactAcceptedReuse='GAFWLL',
    unusedUncreditedDinosaurSlots=212, selectedEnvironment=read(ROOT / 'review-receipt-v3.json')['candidate'],
    originalSourcesAndMapsModified=False, inheritedArtworkChanged=False,
    visual='USER_ACCEPTED', windows='NOT_RUN_ON_THIS_MAC', mainIntegration='PENDING_AUTHORIZED_LOCAL_INTEGRATION',
    independentFinalDelivery='PENDING_FINAL_PACKAGE', m24Complete=False,
    originalDataBlockers=4,
    desktopPolicy='Embedded HTML and metadata only for Batch 98. One independent complete final Mac delivery follows separately.')
output = ROOT / 'resource-handoff-v1.json'
assert not output.exists()
output.write_text(json.dumps(ledger, indent=2) + '\n')
print(json.dumps(dict(files=len(files), hashedInodes=len(cache), explicitRepins=len(repins), ledger=pin(output))))
