"""Hash-pin complete ignored payloads, actual authoring, native evidence and the embedded review."""
import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_registration import capacity, register

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
base = Path('.artifacts/m2-4')
root = base / 'urban-buildings-batch59-v1'
native = base / 'urban-buildings-native-batch59-v1'
art = base / 'urban-buildings-authoring-batch59-v1'
review = base / 'urban-buildings-review-batch59-v1'
closure = read(root / 'native-closure.json')
assert closure['status'] == 'PASS_FOURTEEN_COMPLETE_URBAN_FAMILIES_NATIVE_STATES_AND_RELEASE'
qa_file = base / 'urban-buildings-batch59-embedded-desktop-qa-v1/report.json'
qa = read(qa_file)
assert qa['status'] == 'PASS_STATIC_EMBEDDED_IMAGES_NATIVE_SIZE_AND_DENSITY_CONTROLS' and not qa['errors']
html = review / 'M2.4-Urban-Batch59-Embedded.html'
desktop = Path('/Users/Aone/Desktop/M2.4-Review-Urban-Batch59-20261016')
assert sha(desktop / html.name) == sha(html)
assert sorted(p.name for p in desktop.iterdir()) == [html.name, html.with_suffix('.json').name]
contract = read(Path('desktop/environment-urban-hd-contract.json'))
assert contract['selectedPack'] == closure['selectedEnvironment']
selected = Path('.local/environment-packs') / contract['selectedPack']['revision']
assert sha(selected / 'manifest.json') == contract['selectedPack']['sha256']
assembly = read(native / 'assembly-v1.json')
assert len(assembly['preservedFamilies']) == 246 and len(assembly['appendedFamilies']) == 14
for name, digest in assembly['payloadHashes'].items():
    assert sha(selected / name) == digest
patch = Path(read(art / 'verification-v1.json')['pack'])
patch_files = []
for file in sorted(patch.rglob('*')):
    if file.is_file():
        if file != patch / 'manifest.json':
            assert sha(selected / file.relative_to(patch)) == sha(file)
        patch_files.append(pin(file))
assert len(patch_files) == 81
recipe_file = art / 'urban-buildings-m2-4-batch59-r1/recipe.json'
recipe = read(recipe_file)
sampling = {s['key']: s for s in recipe['actualSampling']}
jobs_file = art / 'imagegen-jobs-v2.json'
jobs = read(jobs_file)['jobs']
work = read(art / 'worklist.json')
overrides = read(art / 'slot-overrides.json')
masters = []
for number, job in enumerate(jobs, 1):
    receipt_file = art / f'imagegen-receipt-{number:02d}.json'
    receipt = read(receipt_file)
    raw, master = Path(receipt['rawFile']), Path(receipt['workspaceFile'])
    assert sha(raw) == sha(master) == receipt['rawSha256'] == receipt['workspaceSha256']
    assert receipt['prompt'] == job['prompt'] and receipt['referenceSha256'] == sha(Path(job['reference']))
    if number == 9:
        assert receipt['status'] == 'REWORK_REQUIRED'
        correction = read(art / 'imagegen-receipt-09-layout-r2.json')
        assert correction['status'] == 'PASS_EXISTING_TRANSPARENT_GUTTER_LAYOUT_ONLY'
        assert correction['motherSha256'] == sha(master) and not correction['motherPixelsChanged']
    else:
        assert receipt['status'] == 'PASS'
    image = Image.open(master).convert('RGBA')
    alpha = np.array(image)[:, :, 3] > 180
    width, height = image.size
    edge = int(alpha[:, [0, width - 1]].sum() + alpha[[0, height - 1], :].sum())
    assert edge == 0
    registration = []
    for sample in [s for s in sampling.values() if s['sha256'] == sha(master)]:
        key = sample['key']
        info = {**work['slots'][key], **overrides.get(key, {})}
        rect, _ = register(image, info, info.get('boardSize', job['boardSize']))
        actual = capacity(rect, info['nativeBounds'])
        assert rect == sample['sourceRect'] and actual == sample['availableDensity'] and actual >= 4
        x, y, w, h = info['slotRect']
        bw, bh = info.get('boardSize', job['boardSize'])
        x0, y0, x1, y1 = round(x * width / bw), round(y * height / bh), round((x + w) * width / bw), round((y + h) * height / bh)
        region = alpha[y0:y1, x0:x1]
        boundary = int(region[:, [0, region.shape[1] - 1]].sum() + region[[0, region.shape[0] - 1], :].sum())
        assert boundary == 0, (key, 'Subject crosses its actual source crop at the unchanged alpha cutoff')
        registration.append(dict(key=key, sourceRect=rect, capacity=actual, activeCropBoundaryPixels=boundary))
    assert registration
    masters.append(dict(raw=pin(raw), workspace=pin(master), receipt=pin(receipt_file), reference=pin(Path(job['reference'])),
        prompt=job['prompt'], selectedSlots=registration, alphaCutoff=180, outerBoundaryPixels=edge,
        layoutCorrection=pin(art / 'imagegen-receipt-09-layout-r2.json') if number == 9 else None))
assert len(masters) == 19 and len(sampling) == 43
native_files = set()
for source in read(native / 'source.json')['sources']:
    native_files.add(native / 'native' / source['nativeFile'])
    native_files.add(native / 'native' / (source['palette']['sha256'] + '.pal'))
    for frame in source['frames']:
        for key in ['file', 'indexFile']:
            native_files.add(native / 'native' / frame[key])
    if source['totalFrames'] == 8:
        native_files.add(native / 'native' / 'b1f4c15b7b91130736b4dffeb189ca32621bf606afbc0b2d02eb5584b6921fe3.pal')
review_manifest = read(review / 'review-manifest.json')
for row in review_manifest['files']:
    assert sha(review / row['file']) == row['sha256']
main = Path('/Users/Aone/RA2remaster/ra2-hd')
main_head = subprocess.check_output(['git', '-C', str(main), 'rev-parse', 'HEAD'], text=True).strip()
assert main_head == '748d0998aaf663acda8807c158155bf0a5bb157b'
assert not subprocess.check_output(['git', '-C', str(main), 'status', '--porcelain'], text=True).strip()
assert not subprocess.check_output(['git', 'diff', '985552c7', '--', 'src', 'desktop', 'public'], text=True).strip()
doc = Path('docs/m2-4-urban-buildings-batch59-20261016.json')
old_doc = read(doc)
snapshot = root / 'production-checkpoint-before-native-closure.json'
with snapshot.open('xb') as f:
    f.write(doc.read_bytes())
delta = read(root / 'coverage-delta.json')
result = dict(schema=old_doc['schema'], status='MAC_TECHNICAL_PASS_CONSOLIDATED_BATCH59_ART_VISUAL_PENDING',
    sourceBranch='task/m2-4-all-skirmish-theaters', runtimeSourceHead=read(root / 'active-stage.json')['runtimeSourceHead'],
    mainHead=main_head, mainClean=True, mainWasMutatedByThisBatch=False,
    selectedEnvironment=contract['selectedPack'], selectedTerrain=delta['selectedTerrain'], families=old_doc['families'],
    counts=dict(old_doc['counts'], selectedFiles=len(assembly['payloadHashes']) + 1, patchFiles=len(patch_files),
        embeddedImages=len(review_manifest['files']), nativeReviewRows=len(review_manifest['states']),
        nativeFamilyDensityCases=28, originalMapsExecuted=5, remainingUrbanSourceGroups=33),
    resourceHandoff=dict(policy='Source-only merge is not resource delivery. Transfer complete payloads additively with hash checks.',
        selectedRoot=str(selected.resolve()), manifest=pin(selected / 'manifest.json'), payloadHashes=assembly['payloadHashes'],
        patchRoot=str(patch.resolve()), patchFiles=patch_files, assembly=pin(native / 'assembly-v1.json')),
    sourceContract=pin(native / 'contract.json'), preparedSource=pin(native / 'source.json'),
    sourceDependencies=[pin(p) for p in sorted(native_files)], authoring=dict(tool='built-in image_gen', mothers=masters,
        jobs=pin(jobs_file), recipe=pin(recipe_file), worklist=pin(art / 'worklist.json'),
        overrides=pin(art / 'slot-overrides.json'), profile=pin(art / 'material-profile-v1.json'),
        exactNativeDuplicates=pin(art / 'native-exact-duplicates-v1.json'),
        retainedFiles=[pin(p) for p in sorted(art.rglob('*')) if p.is_file()]),
    nativeClosure=pin(root / 'native-closure.json'), sourceCoverageDelta=pin(root / 'coverage-delta.json'),
    desktopReview=pin(desktop / html.name), embeddedMetadata=pin(desktop / html.with_suffix('.json').name),
    desktopQa=pin(qa_file), reviewManifest=pin(review / 'review-manifest.json'), stage=pin(root / 'active-stage.json'),
    validationLogs=[pin(root / name) for name in ['loading-tests-v1.log', 'typecheck-v1.log', 'build-v1.log', 'stage-v1.log', 'native-suite-v1.log']],
    retainedFailures=old_doc['retainedFailures'], originalPlaceholders=pin(base / 'urban-buildings-batch59-source-placeholders-v1.json'),
    placeholderSourceAudit=pin(base / 'urban-placeholder-source-variants-v1/report.json'),
    placeholderSourceAuditV2=pin(base / 'urban-placeholder-source-variants-v2/report.json'),
    placeholderSourceAuditAnnotation='V2 adds original resolveMember.source archive paths omitted by the initial audit field name; all sixteen source hashes, decoded bytes and palettes match V1 exactly. V1 remains retained.',
    productionCheckpoint=pin(snapshot), visual='PENDING_CONSOLIDATED_BATCH59_NEW_ART_ONLY', windows='NOT_RUN', m24Complete=False)
doc.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(dict(status=result['status'], families=14, selectedFiles=result['counts']['selectedFiles'],
    embeddedImages=result['counts']['embeddedImages'], reviewBytes=html.stat().st_size, remaining=delta['remainingByKind'])))
