"""Extend accepted resource hashes with complete batch88 families and retained attempts."""
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path('.artifacts/m2-4/newurban-buildings-batch88-20261020')
PRIOR = Path('.artifacts/m2-4/newurban-rubble-continuous-r1-20261020/resource-handoff-v1.json')
PREP = Path('.artifacts/m2-4/newurban-building-references-batch88-v1/resource-handoff-v1.json')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
assert sha(PRIOR) == '3328c5b11a97a3f9fda36e543c3288ee7fc1ffc3afd3ad9d91647acbc1689461'
assert sha(PREP) == '03c734fe83baff37450c80154046dddd802669d911c3476fb1d2f25fa07d285f'
closure = read(ROOT / 'coverage-and-native-closure-v1.json')
assert closure['status'] == 'PASS_39_COMPLETE_FAMILIES_78_NATIVE_DENSITY_PATHS_VISUAL_PENDING'
files = {row['file']: row.copy() for row in read(PRIOR)['files']}
for row in read(PREP)['files']:
    if row['file'] in files:
        assert files[row['file']] == row
    files[row['file']] = row.copy()
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
            committed = subprocess.check_output(['git', 'show', '3a9bd98d:' + str(file)])
            assert hashlib.sha256(committed).hexdigest() == old['sha256']
        repins.append(dict(file=str(file), before=old['sha256'], after=record['sha256'], recovery=pin(backup),
            sourceGitRevision='3a9bd98d' if str(file).startswith('desktop/') else None,
            reason='Add 39 complete NewUrban source families. Preserve all 136 prior families, exact accepted bodies, native sources/shadows and accepted R1 material.'))
    files[str(file)] = record


for revision in ['newurban-environment-buildings-batch88-v1-combined',
                 'newurban-environment-buildings-batch88-v2-combined', closure['candidate']['revision']]:
    for file in sorted((Path('.local/environment-packs') / revision).rglob('*')):
        if file.is_file():
            include(file)
excluded = {'resource-handoff-v1.json', 'resource-handoff-v2.json', 'desktop-delivery-v1.json', 'delivery-checkpoint-v1.json'}
for file in sorted(ROOT.rglob('*')):
    if file.is_file() and 'profile' not in file.parts and file.name not in excluded:
        if file.suffix in {'.json', '.png', '.py', '.html', '.js', '.log', '.txt', '.webm'}:
            include(file)
for name in ['prepare-newurban-buildings-batch88.py', 'retain-newurban-batch88-mother.py',
             'newurban_rubble_batch88_materials.py', 'export-newurban-buildings-batch88.py',
             'audit-newurban-buildings-batch88.py', 'select-newurban-buildings-batch88.py',
             'native-newurban-buildings-batch88.mjs', 'reconcile-newurban-inventory-batch88.py',
             'review-newurban-buildings-batch88.py', 'close-newurban-buildings-batch88.py',
             'handoff-newurban-buildings-batch88.py']:
    include(Path('scripts/m2-4') / name)
for file in [PRIOR, PREP, Path('desktop/environment-newurban-hd-contract.json'),
             Path('.local/environment-newurban-selection.json'),
             Path('.artifacts/m2-4/newurban-rubble-continuous-r1-20261020/user-acceptance-20261020.json'),
             Path('.artifacts/m2-4/newurban-rubble-continuous-r1-20261020/delivery-checkpoint-v1.json'),
             Path('.artifacts/m2-4/build-newurban-buildings-batch88-v1/identity.json'),
             ROOT / 'resource-handoff-v1.json']:
    include(file)
assert {row['file'] for row in repins} == allowed
for row in files.values():
    file = Path(row['file'])
    assert file.is_file() and pin(file) == row, str(file)
main = '/Users/Aone/RA2remaster/ra2-hd'
head = subprocess.check_output(['git', '-C', main, 'rev-parse', 'HEAD'], text=True).strip()
porcelain = subprocess.check_output(['git', '-C', main, 'status', '--porcelain'], text=True)
result = dict(status='PASS_COMPLETE_ACCEPTED_INHERITANCE_AND_BATCH88_RESOURCE_HASH_CLOSURE',
    inheritedLedger=pin(PRIOR), sourcePreparationLedger=pin(PREP), candidate=closure['candidate'],
    runtimeSourceCommit=closure['runtimeSourceCommit'], closure=pin(ROOT / 'coverage-and-native-closure-v1.json'),
    files=list(files.values()), fileCount=len(files), explicitTaskPinsRepinned=repins,
    newCompleteFamilies=39, newRubbleStudies=37, selectedBuiltinMothers=19, builtinCalls=19,
    exactAcceptedBodyDensityFrames=234, nativeOriginalShadowSlots=156,
    retainedAttempts=[*closure['retainedAttempts'], pin(ROOT / 'handoff-attempt-v1.json')],
    sourcePolicy='All original maps, archives, SHPs, native indices, palettes, logical geometry, shadows and accepted family payloads remain pinned. The accepted R1 decision is appended separately from immutable pending receipts.',
    storage='Versioned task-local resources and project-bound builtin mothers. Desktop receives only embedded HTML, metadata and this ledger. No per-batch game or resource copy.',
    main=dict(head=head, clean=not porcelain.strip(), porcelain=porcelain, changedByTask=False),
    newArtworkAcceptance='PENDING_37_NEW_RUBBLE_STUDIES', windows='NOT_RUN', mainIntegration='NOT_PERFORMED', m24Complete=False)
with (ROOT / 'resource-handoff-v2.json').open('x') as stream:
    stream.write(json.dumps(result, indent=2) + '\n')
print(json.dumps(dict(files=len(files), sha256=sha(ROOT / 'resource-handoff-v2.json'), repins=len(repins),
    main=head, mainClean=not porcelain.strip())))
