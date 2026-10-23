"""Extend the immutable resource handoff with the corrected rubble and retained attempts."""
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path('.artifacts/m2-4/newurban-rubble-continuous-r1-20261020')
PRIOR = Path('.artifacts/m2-4/newurban-buildings-batch87-20261020/resource-handoff-v1.json')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
assert sha(PRIOR) == 'dbfd405ffa2ad8edeee75c21d0e10bec8e0472e69d2a3ef9f57ebebeb4f761bc'
closure = read(ROOT / 'coverage-and-native-closure-v1.json')
assert closure['status'] == 'PASS_40_CORRECTED_NATIVE_DENSITY_PATHS_AND_12_SETTLED_MATERIAL_CAPTURES_VISUAL_PENDING'
files = {row['file']: row.copy() for row in read(PRIOR)['files']}
allowed = {'desktop/environment-newurban-hd-contract.json', '.local/environment-newurban-selection.json'}
repins = []


def include(file):
    file = Path(file)
    record = pin(file)
    old = files.get(str(file))
    if old and old != record:
        assert str(file) in allowed, str(file)
        recovery_file = ROOT / ('baseline-contract.json' if str(file).startswith('desktop/') else 'baseline-selector.json')
        assert sha(recovery_file) == old['sha256']
        if str(file).startswith('desktop/'):
            source = subprocess.check_output(['git', 'show', '3cd865a6:' + str(file)])
            assert hashlib.sha256(source).hexdigest() == old['sha256']
        repins.append(dict(file=str(file), before=old['sha256'], after=record['sha256'],
            recovery=pin(recovery_file), sourceGitRevision='3cd865a6' if str(file).startswith('desktop/') else None,
            reason='User-requested complete rubble material and continuous visual-contour correction. Only twenty slot-3 density pairs change; 116 other complete families and 120 accepted body density frames remain exact.'))
    files[str(file)] = record


for revision in ['newurban-environment-rubble-continuous-r1-v1-combined', closure['candidate']['revision']]:
    for file in sorted((Path('.local/environment-packs') / revision).rglob('*')):
        if file.is_file():
            include(file)
excluded = {'resource-handoff-v1.json', 'desktop-delivery-v1.json', 'delivery-checkpoint-v1.json'}
for file in sorted(ROOT.rglob('*')):
    if file.is_file() and 'profile' not in file.parts and file.name not in excluded:
        if file.suffix in {'.json', '.png', '.py', '.html', '.js', '.log', '.txt', '.webm'}:
            include(file)
for name in ['retain-newurban-rubble-r1-mother.py', 'newurban_rubble_r1_materials.py',
             'probe-newurban-rubble-r1.py', 'export-newurban-rubble-continuous-r1.py',
             'audit-newurban-rubble-continuous-r1.py', 'select-newurban-rubble-continuous-r1.py',
             'native-newurban-rubble-continuous-r1.mjs', 'native-newurban-rubble-settled-r1.mjs',
             'review-newurban-rubble-continuous-r1.py', 'close-newurban-rubble-continuous-r1.py',
             'handoff-newurban-rubble-continuous-r1.py']:
    include(Path('scripts/m2-4') / name)
for file in [PRIOR, Path('desktop/environment-newurban-hd-contract.json'),
             Path('.local/environment-newurban-selection.json'),
             Path('.artifacts/m2-4/build-newurban-rubble-continuous-r1-v1/identity.json')]:
    include(file)
assert {row['file'] for row in repins} == allowed
for row in files.values():
    file = Path(row['file'])
    assert file.is_file() and file.stat().st_size == row['bytes'] and sha(file) == row['sha256'], str(file)
main = '/Users/Aone/RA2remaster/ra2-hd'
head = subprocess.check_output(['git', '-C', main, 'rev-parse', 'HEAD'], text=True).strip()
porcelain = subprocess.check_output(['git', '-C', main, 'status', '--porcelain'], text=True)
result = dict(status='PASS_COMPLETE_INHERITED_AND_CORRECTED_RUBBLE_RESOURCE_HASH_CLOSURE',
    inheritedLedger=pin(PRIOR), candidate=closure['candidate'], runtimeSourceCommit=closure['runtimeSourceCommit'],
    closure=pin(ROOT / 'coverage-and-native-closure-v1.json'), feedback=pin(ROOT / 'user-feedback-20261020.json'),
    files=list(files.values()), fileCount=len(files), explicitTaskPinsRepinned=repins,
    correctedStudies=19, correctedCompleteFamilies=20, selectedBuiltinMothers=10, builtinCalls=11,
    originalSources='All source SHP, native indices/RGBA/palettes and shadows remain individually pinned in the inherited ledger.',
    retainedAttempts='Original rejected artwork, native-mask prototype, unselected cross-row export, layout repair and obscured screenshot timing are retained. The review selects corrected complete subjects and naturally settled native material captures.',
    storage='Versioned task-local resources and project-bound builtin mothers. Desktop receives only embedded HTML, metadata and this ledger; no game or resource copy.',
    main=dict(head=head, clean=not porcelain.strip(), porcelain=porcelain, changedByTask=False),
    visualAcceptance='PENDING_ALL_19_CORRECTED_STUDIES', windows='NOT_RUN', mainIntegration='NOT_PERFORMED', m24Complete=False)
with (ROOT / 'resource-handoff-v1.json').open('x') as stream:
    stream.write(json.dumps(result, indent=2) + '\n')
print(json.dumps(dict(files=len(files), sha256=sha(ROOT / 'resource-handoff-v1.json'), repins=len(repins),
    main=head, mainClean=not porcelain.strip())))
