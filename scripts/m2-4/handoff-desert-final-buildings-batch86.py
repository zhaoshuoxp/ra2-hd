"""Pin new ignored Desert artwork, validation and the inherited accepted resource chain."""
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path('.artifacts/m2-4/desert-final-buildings-batch86-20261020')
NATIVE = Path('.artifacts/m2-4/desert-final-buildings-native-batch86-v1')
ART = Path('.artifacts/m2-4/desert-final-buildings-authoring-batch86-v1')
PRIOR = Path('.artifacts/m2-4/desert-morocco-batch85-20261020/resource-handoff-v1.json')
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
pin = lambda path: dict(file=str(path), sha256=sha(path), bytes=path.stat().st_size)
assert sha(PRIOR) == '70a62fe7134dae91dff50002c0b4549c5f08a6516eee26802cbbaa940b9389ea'
files = {row['file']: row.copy() for row in read(PRIOR)['files']}
repinned = []
allowed_changes = {'desktop/environment-desert-hd-contract.json', '.local/environment-desert-selection.json',
    'scripts/m2/export-showcase-shp.py', 'scripts/m2/official-maps/native-coverage.mjs',
    'scripts/m2-4/native-original-review.mjs'}
closure = read(ROOT / 'coverage-and-native-closure-v1.json')
assert read(ROOT / 'source-static-qa-v2/report.json')['decodedPngs'] == 70
assert read(ROOT / 'source-static-qa-v2/report.json')['verifiedNativeVideos'] == 6
assert read(ROOT / 'desktop-media-transfer-v1.json')['status'] == 'PASS_ACTUAL_DESKTOP_HTML_METADATA_BYTE_IDENTITY_MEDIA_QA_REUSED'
candidate = read(Path('desktop/environment-desert-hd-contract.json'))['selectedPack']
assert candidate == closure['candidate']


def include(file):
    file = Path(file)
    entry = pin(file)
    old = files.get(str(file))
    if old and old != entry:
        assert str(file) in allowed_changes, str(file)
        recovery = None
        if str(file) != '.local/environment-desert-selection.json':
            original = subprocess.check_output(['git', 'show', '4e77a51d:' + str(file)])
            assert hashlib.sha256(original).hexdigest() == old['sha256']
            recovery = dict(gitRevision='4e77a51d', path=str(file))
        else:
            recovery = dict(priorSelection=read(NATIVE / 'selection-v1.json')['priorContract']['selectedPack'])
        repinned.append(dict(file=str(file), before=old['sha256'], after=entry['sha256'],
            reason='Explicit additive Desert selection or bounded export/validation harness extension; previous implementation remains in Git.',
            recovery=recovery))
    files[str(file)] = entry


for revision in [candidate['revision'], 'desert-m2-4-final-buildings-batch86-v1',
                 'desert-m2-4-final-buildings-batch86-v2']:
    for file in sorted((Path('.local/environment-packs') / revision).rglob('*')):
        if file.is_file():
            include(file)
excluded = {'resource-handoff-v1.json', 'desktop-delivery-v1.json', 'delivery-checkpoint-v1.json'}
for folder in [ROOT, NATIVE, ART]:
    for file in sorted(folder.rglob('*')):
        if file.is_file() and 'profile' not in file.parts and file.name not in excluded:
            if file.suffix in {'.json', '.png', '.jpg', '.webm', '.html', '.js', '.log', '.txt'}:
                include(file)
guide = read(NATIVE / 'source.json')
palettes = set()
for source in guide['sources']:
    include(NATIVE / 'native' / source['nativeFile'])
    assert sha(NATIVE / 'native' / source['nativeFile']) == source['sha256']
    palettes.add(source['palette']['sha256'])
    for frame in source['frames']:
        for key in ['file', 'indexFile']:
            include(NATIVE / 'native' / frame[key])
for source in read(NATIVE / 'contract.json')['sources'].values():
    palettes.update(item['sha256'] for item in source.get('framePalettes', {}).values())
for digest in palettes:
    file = NATIVE / 'native' / (digest + '.pal')
    assert sha(file) == digest
    include(file)
profile = read(ART / 'material-profile-v2.json')
donor_names = set()
for declaration in profile['acceptedNativeBodyFrames'].values():
    include(declaration['proofFile'])
    file = Path(declaration['manifestFile'])
    include(file)
    donor_names.add(declaration['donorMember'])
    for variant in read(file)['variants']:
        for page in variant['pages']:
            for role in ['base', 'data']:
                include(file.parent / str(variant['density']) / page['id'] / (role + '.png'))
for guide_file in [Path('.artifacts/m2-4/urban-civilians-native-batch49-v1/source.json'),
                   Path('.artifacts/m2-4/urban-building-rubble-native-batch52-v1/source.json')]:
    include(guide_file)
    for source in read(guide_file)['sources']:
        if source['member'] not in donor_names:
            continue
        include(guide_file.parent / 'native' / source['nativeFile'])
        include(guide_file.parent / 'native' / (source['palette']['sha256'] + '.pal'))
        for frame in source['frames']:
            for key in ['file', 'indexFile']:
                include(guide_file.parent / 'native' / frame[key])
for name in ['prepare-desert-final-buildings-batch86.py', 'prepare-desert-building-body-jobs-batch86.py',
    'audit-desert-building-body-mothers-batch86.py', 'native-original-desert-house-batch86.mjs',
    'prepare-desert-airport-motion-batch86.py', 'prepare-desert-final-export-batch86.py',
    'select-desert-final-buildings-batch86.py', 'verify-desert-final-buildings-batch86.py',
    'close-desert-final-buildings-batch86.py', 'review-desert-final-buildings-batch86.py',
    'verify-desert-review-batch86.py', 'handoff-desert-final-buildings-batch86.py', 'native-original-review.mjs']:
    include(Path('scripts/m2-4') / name)
for name in ['export-showcase-shp.py', 'verify-showcase-shp.py', 'showcase_airport.py',
    'showcase_body_reuse.py', 'showcase_registration.py', 'showcase_owner.py', 'showcase_contours.py',
    'official-maps/native-coverage.mjs', 'official-maps/native-technology.mjs',
    'official-maps/native-linked-building-cycle.mjs']:
    include(Path('scripts/m2') / name)
for file in ['desktop/environment-desert-hd-contract.json', '.local/environment-desert-selection.json',
    '.artifacts/m2-4/desert-morocco-batch85-20261020/user-acceptance-20261020.json',
    '.artifacts/m2-4/media-verifier-wheels-v1/dependency-v1.json']:
    include(Path(file))
decoder = read(Path('.artifacts/m2-4/media-verifier-wheels-v1/dependency-v1.json'))
include(Path(decoder['wheel']['file']))
include(PRIOR)
assert {row['file'] for row in repinned} == allowed_changes
for row in files.values():
    file = Path(row['file'])
    assert file.is_file() and file.stat().st_size == row['bytes'] and sha(file) == row['sha256'], str(file)
main = '/Users/Aone/RA2remaster/ra2-hd'
head = subprocess.check_output(['git', '-C', main, 'rev-parse', 'HEAD'], text=True).strip()
porcelain = subprocess.check_output(['git', '-C', main, 'status', '--porcelain'], text=True)
ledger = dict(status='PASS_FOUR_COMPLETE_DESERT_GROUPS_AND_INHERITED_IGNORED_RESOURCE_HASH_CLOSURE',
    inheritedLedger=pin(PRIOR), fileCount=len(files), files=list(files.values()),
    explicitTaskPinsRepinned=repinned, candidate=candidate, runtimeSourceCommit=closure['runtimeSourceCommit'],
    completeFamilies=4, originalMembers=6, sourceBodySlots=49, densityFrames=98, originalShadowFrames=29,
    sourceLink=dict(path=str(NATIVE / 'native'), target=str((NATIVE / 'native').resolve()),
        policy='All required linked original, palette, index and body/shadow files are pinned individually.'),
    validationDecoder=dict(dependency=pin(Path('.artifacts/m2-4/media-verifier-wheels-v1/dependency-v1.json')),
        policy='The pinned wheel recreates the isolated verifier offline; it is not a game dependency.'),
    storage='Hash-pinned in-place task resources and project-bound mothers; Desktop carries HTML, metadata and this ledger only. No per-batch game or art-resource copy.',
    main=dict(head=head, clean=not porcelain.strip(), porcelain=porcelain, changedByTask=False),
    visualAcceptance=closure['visualAcceptance'], windows='NOT_RUN', m24Complete=False)
with (ROOT / 'resource-handoff-v1.json').open('x') as stream:
    stream.write(json.dumps(ledger, indent=2) + '\n')
print(json.dumps(dict(files=len(files), sha256=sha(ROOT / 'resource-handoff-v1.json'),
    repinned=len(repinned), main=head, mainClean=not porcelain.strip())))
