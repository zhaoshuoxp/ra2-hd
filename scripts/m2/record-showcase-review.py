"""Pin review-only authoring closure and keep production/runtime acceptance separate."""
import hashlib
import json
import stat
from collections import Counter
from pathlib import Path
from PIL import Image

root = Path('.artifacts/m2-2')
masters = root / 'authoring-direction-v1'
sha = lambda data: hashlib.sha256(data).hexdigest()
save = lambda path, value: path.write_text(json.dumps(value, indent=2) + '\n')
generated = Path('/Users/Aone/.codex/generated_images/01a11827-07e9-7203-802a-3676478239e4')
baseline = Path('/Users/Aone/RA2remaster/ra2-hd-m2-1-integration')
accepted = baseline / '.artifacts/m2-1/authoring-seams-v13/grass-material-master.png'
scene = baseline / '.artifacts/m2-integration/matched-4x/native-placed-building-framebuffer.png'
road = baseline / '.artifacts/m2-integration/matched-4x/road-main-full-actual-size.png'
settings = [
    ('ground-water', 'exec-51758d00-aec7-4ec3-be68-f2cc2be064c0.png', 'direction-references-v1/ground-water-prompt.txt',
     ['direction-references-v1/ground-water-native-board.png', accepted]),
    ('props-resources', 'exec-f91cbb5c-825b-4b9d-8b9c-3bf4de2bd5f0.png', 'direction-references-v1/props-resources-prompt.txt',
     ['direction-references-v1/props-resources-native-board.png', scene]),
    ('civil-buildings', 'exec-846d0944-62fd-466e-93fb-322d5266bd1e.png', 'direction-references-v1/civil-buildings-prompt.txt',
     ['direction-references-v1/civil-buildings-native-board.png', scene]),
    ('neutral-actors', 'exec-52f42245-26d4-4869-bfbd-6974d102f081.png', 'direction-references-v2/neutral-actors-prompt.txt',
     ['direction-references-v2/neutral-actors-native-board.png']),
    ('bridges', 'exec-5cf4dfa3-0919-4356-840d-5dbb733958b2.png', 'direction-references-v2/bridges-v2-prompt.txt',
     ['direction-references-v2/bridges-native-board.png', masters / 'civil-buildings-master.png']),
]
records = []
for category, original, prompt, references in settings:
    output, original = masters / f'{category}-master.png', generated / original
    assert output.read_bytes() == original.read_bytes()
    prompt_path = root / prompt
    inputs = []
    for reference in references:
        path = reference if isinstance(reference, Path) else root / reference
        inputs.append(dict(path=str(path.resolve()), sha256=sha(path.read_bytes())))
    image = Image.open(output)
    assert image.mode == 'RGBA' and image.getextrema()[-1][0] == 0
    records.append(dict(category=category, revision='direction-v1' if category != 'bridges' else 'direction-v2',
                        tool='built-in image_gen', status='USER_ART_DIRECTION_APPROVAL_PENDING',
                        originalToolOutput=str(original), savedMaster=str(output), masterSha256=sha(output.read_bytes()),
                        size=list(image.size), promptFile=str(prompt_path), promptSha256=sha(prompt_path.read_bytes()),
                        references=inputs, runtimeReady=False))
rejected = masters / 'bridges-rejected-v1.png'
records.append(dict(category='bridges', revision='direction-v1', status='REJECTED_INTERNAL_QUALITY',
                    reason='Background haze and enlarged pixel-detail appearance; v2 is the review candidate.',
                    originalToolOutput=str(generated / 'exec-c92f3562-efa6-42de-b6ea-3d7219d5491b.png'),
                    savedMaster=str(rejected), masterSha256=sha(rejected.read_bytes()),
                    promptFile=str(root / 'direction-references-v2/bridges-prompt.txt'),
                    references=[str(root / 'direction-references-v2/bridges-native-board.png'), str(road)]))
save(masters / 'provenance.json', dict(schema='m2-2-direction-authoring-provenance-v1', records=records,
     disclosure='Native guides are nearest-neighbor reference enlargements. Authored masters are generated redraws. '
                'Registration/density pilots use deterministic native masks and independent direct master sampling; '
                'large sheets are style studies, not complete 4X production masters.'))

source = root / 'source-v5'
yr = json.loads((source / 'yr-XMP03T4.map-objects.json').read_text())
ra2 = json.loads((source / 'ra2-MP03T4.map-objects.json').read_text())
differences = {}
for kind in ('structures', 'overlays', 'waypoints'):
    left = Counter(json.dumps(value, sort_keys=True) for value in yr[kind])
    right = Counter(json.dumps(value, sort_keys=True) for value in ra2[kind])
    differences[kind] = dict(yrOnly=[dict(value=json.loads(value), count=count) for value, count in (left - right).items()],
                             ra2Only=[dict(value=json.loads(value), count=count) for value, count in (right - left).items()])
save(root / 'map-differences-v1.json', dict(schema='m2-2-native-map-differences-v1',
     method='Parsed-record multiset comparison, preserving meaningful differences without array-order noise',
     sources={edition: sha((source / file).read_bytes()) for edition, file in
              [('yr', 'yr-XMP03T4.map-objects.json'), ('ra2', 'ra2-MP03T4.map-objects.json')]}, differences=differences))

ledger = json.loads(Path('docs/m2-2-map-coverage.json').read_text())
review = root / 'direction-review-v1'
qa = json.loads((review / 'qa.json').read_text())
assert qa['status'] == 'PASS_OFFLINE_DIRECTION_REVIEW'
native = json.loads((root / 'prepared-native-v2/verification.json').read_text())
closure = []
directories = ['source-v5', 'prepared-native-v2', 'direction-references-v1', 'direction-references-v2',
               'authoring-direction-v1', 'direction-review-v1']
files = [path for directory in directories for path in (root / directory).rglob('*')
         if path.is_file() and 'M2.2-Direction-Review-Profile' not in path.parts]
files += [root / 'map-differences-v1.json', root / 'accepted-authoring-inventory-supplement.json']
files += [root / 'actor-native-reference-v1' / name for name in ('car-native-0.png', 'car-native-90.png', 'report.json')]
for path in sorted(set(files)):
    assert not path.is_symlink()
    closure.append(dict(path=str(path), sha256=sha(path.read_bytes()), bytes=path.stat().st_size,
                        mode=oct(stat.S_IMODE(path.stat().st_mode))))
transfer = dict(schema='m2-2-resource-transfer-v1', status='AUTHORING_REVIEW_CLOSURE_ONLY',
                policy='ADD_IF_ABSENT_OR_IDENTICAL', sourceRoot=str(Path.cwd()),
                baseline='7533e13ed8f19edd4cc888e44baf416acede3478', runtimeFiles=[], selectedRuntimeRevision=None,
                authoringFiles=closure, count=len(closure), bytes=sum(entry['bytes'] for entry in closure),
                boundary='Do not package authoring/native/reference inputs as runtime resources. No main transfer yet.')
save(Path('docs/m2-2-resource-transfer.json'), transfer)
acceptance = dict(schema='m2-2-acceptance-v1', status='ART_DIRECTION_APPROVAL_PENDING',
                 baseline=transfer['baseline'], primaryMap=ledger['primary'], counts=ledger['counts'],
                 worktree=str(Path.cwd()), branch='task/m2-2-temperate-showcase',
                 artDirections={category: 'USER_APPROVAL_PENDING' for category, *_ in settings},
                 nativeInputs=native, offlineReview=dict(path=str(review / 'index.html'), status=qa['status'],
                    images=len(qa['images']), sections=len(qa['sections']), densityPilots=9,
                    sha256=sha((review / 'index.html').read_bytes())),
                 authoringProvenanceSha256=sha((masters / 'provenance.json').read_bytes()),
                 transferManifestSha256=sha(Path('docs/m2-2-resource-transfer.json').read_bytes()),
                 newlyPublishedRuntimeFamilies=0, combinedNativeStates='NOT_RUN_PENDING_APPROVED_PRODUCTION',
                 combinedUserAcceptance='PENDING_COMPLETE_RUNTIME_REVIEW', wholeMapComplete=False,
                 mainPromotion='NOT_PERFORMED_PENDING_COMBINED_VISUAL_ACCEPTANCE_AND_TECHNICAL_CHECKS',
                 delivery='No M2.2 application yet; retain copied M2.1 integrated baseline.',
                 fixedLimitsBytes=dict(world2X=268435456, world4X=1342177280, preparedCPU=134217728, UI=16777216),
                 platform=dict(target='macOS arm64', windowsPerformance='DEFERRED_BY_USER',
                               physicalInput='DEFERRED_NO_PASS_CLAIM'),
                 next='Obtain direction decisions, then complete approved reusable category families and copied runtime review.')
save(Path('docs/m2-2-acceptance.json'), acceptance)
print(json.dumps(dict(status=acceptance['status'], files=transfer['count'], bytes=transfer['bytes'],
                      native=native['status'], review=qa['status'])))
