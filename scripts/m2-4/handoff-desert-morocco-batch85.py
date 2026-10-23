"""Pin all new ignored artwork and preserve the accepted resource chain in place."""
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path('.artifacts/m2-4/desert-morocco-batch85-20261020')
NATIVE = Path('.artifacts/m2-4/desert-morocco-native-batch85-v1')
ART = Path('.artifacts/m2-4/desert-morocco-authoring-batch85-v1')
PRIOR = Path('.artifacts/m2-4/legacy-faction-reuse-batch84-20261020/resource-handoff-v1.json')
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
pin = lambda path: dict(file=str(path), sha256=sha(path), bytes=path.stat().st_size)
assert sha(PRIOR) == '96f3cddd40b47eb518187c2f8c7110313ee9e912b06d18fda1e934994c56403e'
prior = read(PRIOR)
files = {row['file']: row.copy() for row in prior['files']}
repinned = []
closure = read(ROOT / 'coverage-and-native-closure-v1.json')
assert read(ROOT / 'source-static-qa-v2.json')['decodedPngs'] == 152
candidate = read(Path('desktop/environment-desert-hd-contract.json'))['selectedPack']
assert candidate == closure['candidate']


def include(file):
    file = Path(file)
    entry = pin(file)
    previous = files.get(str(file))
    if previous and previous != entry:
        assert str(file) in ['desktop/environment-desert-hd-contract.json',
                             '.local/environment-desert-selection.json'], str(file)
        repinned.append(dict(file=str(file), before=previous['sha256'], after=entry['sha256']))
    files[str(file)] = entry


revisions = [candidate['revision'], 'desert-m2-4-morocco-batch85-v1',
             'desert-m2-4-morocco-batch85-representatives-v1',
             'desert-m2-4-morocco-batch85-representatives-v2']
for revision in revisions:
    folder = Path('.local/environment-packs') / revision
    for file in sorted(folder.rglob('*')):
        if file.is_file():
            include(file)
assert sha(Path('.local/environment-packs') / candidate['revision'] / 'manifest.json') == candidate['sha256']
excluded = {'resource-handoff-v1.json', 'desktop-delivery-v1.json', 'desktop-static-qa-v1.json',
            'delivery-checkpoint-v1.json'}
for folder in [ROOT, NATIVE, ART]:
    for file in sorted(folder.rglob('*')):
        if not file.is_file() or 'profile' in file.parts or file.name in excluded:
            continue
        if file.suffix in ['.json', '.png', '.html', '.log']:
            include(file)
guide = read(NATIVE / 'source.json')
palette_hashes = set()
for source in guide['sources']:
    raw = NATIVE / 'native' / source['nativeFile']
    assert sha(raw) == source['sha256']
    include(raw)
    palette_hashes.add(source['palette']['sha256'])
    for frame in source['frames']:
        for key in ['file', 'indexFile']:
            include(NATIVE / 'native' / frame[key])
for source in read(NATIVE / 'contract.json')['sources'].values():
    palette_hashes.update(palette['sha256'] for palette in source.get('framePalettes', {}).values())
for digest in sorted(palette_hashes):
    file = NATIVE / 'native' / (digest + '.pal')
    assert sha(file) == digest
    include(file)
for name in ['prepare-desert-morocco-batch85.py', 'refine-desert-morocco-batch85.py',
             'audit-desert-morocco-mothers-batch85.py', 'select-desert-morocco-batch85.py',
             'close-desert-morocco-batch85.py', 'review-desert-morocco-batch85.py',
             'handoff-desert-morocco-batch85.py']:
    include(Path('scripts/m2-4') / name)
for name in ['export-showcase-shp.py', 'verify-showcase-shp.py', 'showcase_registration.py',
             'showcase_contours.py']:
    include(Path('scripts/m2') / name)
for file in ['scripts/m2/official-maps/review-exported-shp.py',
             'scripts/m2/official-maps/owner_review.py',
             'scripts/m2/official-maps/native-coverage.mjs',
             'scripts/m2/official-maps/native-states.mjs',
             'scripts/m2-4/native-original-review.mjs',
             'desktop/environment-desert-hd-contract.json', '.local/environment-desert-selection.json']:
    include(Path(file))
include(PRIOR)
assert len(repinned) == 2
for row in files.values():
    file = Path(row['file'])
    assert file.is_file() and file.stat().st_size == row['bytes'] and sha(file) == row['sha256'], str(file)
main = '/Users/Aone/RA2remaster/ra2-hd'
assert not subprocess.check_output(['git', '-C', main, 'status', '--porcelain'], text=True).strip()
head = subprocess.check_output(['git', '-C', main, 'rev-parse', 'HEAD'], text=True).strip()
ledger = dict(status='PASS_TEN_COMPLETE_BUILDINGS_AND_INHERITED_RESOURCE_HASH_CLOSURE',
    inheritedLedger=pin(PRIOR), fileCount=len(files), files=list(files.values()),
    mutableTaskPinsRepinned=repinned, candidate=candidate,
    runtimeSourceCommit=closure['runtimeSourceCommit'], completeFamilies=10,
    sourceBodyStates=40, densityFrames=80, originalShadowFrames=40,
    projectBoundMotherProduction=pin(ART / 'mother-capacity-qa-v7.json'),
    nativeSourceLink=dict(path=str(NATIVE / 'native'),
        target=str((NATIVE / 'native').resolve()),
        policy='Every required linked source, palette, body and shadow file is independently pinned above. Standalone final delivery must materialize these dependencies.'),
    storage='In-place isolated resources, raw project-bound mothers and complete accepted chain; no per-batch game or resource copy.',
    main=dict(head=head, clean=True, changedByTask=False),
    visualAcceptance='PENDING_TEN_NEW_BUILDING_FAMILIES_ONLY', windows='NOT_RUN', m24Complete=False)
with (ROOT / 'resource-handoff-v1.json').open('x') as stream:
    stream.write(json.dumps(ledger, indent=2) + '\n')
print(json.dumps(dict(files=len(files), sha256=sha(ROOT / 'resource-handoff-v1.json'), repinned=repinned)))
