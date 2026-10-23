"""Pin new mothers, complete ignored resources, source dependencies and Desktop evidence."""
import argparse
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
record = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--batch', type=int, choices=[54, 55, 56], default=54)
args = parser.parse_args()
batch = args.batch
prior_count = {54: 206, 55: 214, 56: 222}[batch]
state_count, runtime_count = {54: (24, 23), 55: (32, 32), 56: (32, 24)}[batch]
patch_count = 41 if batch == 54 else 53
root = Path(f'.artifacts/m2-4/urban-buildings-batch{batch}-v1')
native = Path(f'.artifacts/m2-4/urban-buildings-native-batch{batch}-v1')
art = Path(f'.artifacts/m2-4/urban-buildings-authoring-batch{batch}-v1')
review = Path(f'.artifacts/m2-4/urban-buildings-review-batch{batch}-v{3 if batch == 56 else 1}')
closure = read(root / 'native-closure.json')
assert closure['status'] == 'PASS_EIGHT_COMPLETE_FAMILIES_16_NATIVE_DENSITY_CASES_AND_ORIGINAL_MAP'
qa_file = Path(f'.artifacts/m2-4/urban-buildings-batch{batch}-embedded-desktop-qa-v1/report.json')
qa = read(qa_file)
assert qa['status'] == 'PASS_STATIC_EMBEDDED_IMAGES_NATIVE_SIZE_AND_DENSITY_CONTROLS' and not qa['errors']
html = review / f'M2.4-Urban-Batch{batch}-Embedded.html'
desktop = Path(f'/Users/Aone/Desktop/M2.4-Review-Urban-Batch{batch}-20261016')
assert sha(desktop / html.name) == sha(html)
assert sorted(p.name for p in desktop.iterdir()) == [html.name, html.with_suffix('.json').name]
contract = read(Path('desktop/environment-urban-hd-contract.json'))
assert contract['selectedPack'] == closure['selectedEnvironment']
selected = Path('.local/environment-packs') / contract['selectedPack']['revision']
assert sha(selected / 'manifest.json') == contract['selectedPack']['sha256']
assembly = read(native / 'assembly-v1.json')
assert len(assembly['preservedFamilies']) == prior_count and len(assembly['appendedFamilies']) == 8
for name, digest in assembly['payloadHashes'].items():
    assert sha(selected / name) == digest
patch = Path(read(art / 'verification-v1.json')['pack'])
patch_files = []
for file in sorted(patch.rglob('*')):
    if file.is_file():
        if file != patch / 'manifest.json':
            assert sha(selected / file.relative_to(patch)) == sha(file)
        patch_files.append(record(file))
assert len(patch_files) == patch_count
recipe_file = art / f'urban-buildings-m2-4-batch{batch}-r1/recipe.json'
recipe = read(recipe_file)
sampling = {s['key']: s for s in recipe['actualSampling']}
jobs_file = art / {54: 'imagegen-jobs-v1.json', 55: 'imagegen-jobs-v5.json', 56: 'imagegen-jobs-v4.json'}[batch]
jobs = read(jobs_file)['jobs']
work = read(art / 'worklist.json')
overrides_file = art / 'slot-overrides.json'
overrides = read(overrides_file) if overrides_file.exists() else {}
masters, retained_unused = [], []
for number, job in enumerate(jobs, 1):
    receipt_file = art / f'imagegen-receipt-{number:02d}.json'
    receipt = read(receipt_file)
    raw, master = Path(receipt['rawFile']), Path(receipt['workspaceFile'])
    assert sha(raw) == sha(master) == receipt['rawSha256'] == receipt['workspaceSha256']
    assert receipt['prompt'] == job['prompt'] and receipt['referenceSha256'] == sha(Path(job['reference']))
    image = Image.open(master).convert('RGBA')
    alpha = np.array(image)[:, :, 3] > 240
    width, height = image.size
    edge = int(alpha[:, [0, width - 1]].sum() + alpha[[0, height - 1], :].sum())
    selected_slots = [s for s in sampling.values() if s['sha256'] == sha(master)]
    references = []
    for ref in job.get('references', []):
        file = Path(ref['file'])
        assert sha(file) == ref['sha256']
        references.append(dict(role=ref['role'], **record(file)))
    if not selected_slots:
        assert batch == 55 and number == 17
        retained_unused.append(dict(raw=record(raw), workspace=record(master), receipt=record(receipt_file),
            reason='Capacity passed; internal visual QA rejected the material finish. Replaced by occupied r2. No selected pixels use this mother.'))
        continue
    assert edge == 0, (job['id'], 'Clipping at outer canvas')
    registration = []
    for sample in selected_slots:
        key = sample['key']
        assert key in job['slots']
        info = {**work['slots'][key], **overrides.get(key, {})}
        rect, _ = register(image, info, info.get('boardSize', job['boardSize']))
        actual_capacity = capacity(rect, info['nativeBounds'])
        assert rect == sample['sourceRect'] and actual_capacity == sample['availableDensity'] and actual_capacity >= 4
        x, y, w, h = info['slotRect']
        bw, bh = info.get('boardSize', job['boardSize'])
        x0, y0, x1, y1 = round(x * width / bw), round(y * height / bh), round((x + w) * width / bw), round((y + h) * height / bh)
        region = alpha[y0:y1, x0:x1]
        boundary = int(region[:, [0, region.shape[1] - 1]].sum() + region[[0, region.shape[0] - 1], :].sum())
        assert boundary == 0, (key, 'Active native slot crosses its actual source crop')
        registration.append(dict(key=key, sourceRect=rect, capacity=actual_capacity, opaqueCropBoundaryPixels=boundary))
    density = min(s['availableDensity'] for s in selected_slots)
    masters.append(dict(raw=record(raw), workspace=record(master), receipt=record(receipt_file),
        reference=record(Path(job['reference'])), prompt=job['prompt'], minimumAuthoredDensity=density,
        supportingReferences=references, selectedSlotRegistrations=registration,
        opaqueOuterEdgePixels=edge, selectedSlots=[s['key'] for s in selected_slots],
        partialMother='Rejected old occupied subimage excluded; only unchanged sufficient rubble is used'
            if batch == 55 and number == 4 else None))
assert len(masters) == {54: 9, 55: 17, 56: 16}[batch] and len(sampling) == state_count
assert len(retained_unused) == (1 if batch == 55 else 0)
native_files = set()
for source in read(native / 'source.json')['sources']:
    expected = [(source['nativeFile'], source['sha256'])]
    for frame in source['frames']:
        expected.extend([(frame['file'], frame['rgbaSha256']), (frame['indexFile'], frame['indexSha256'])])
    for name, digest in expected:
        file = native / 'native' / name
        assert sha(file) == digest
        native_files.add(file)
for source in read(native / 'contract.json')['sources'].values():
    for palette in [source['palette'], *source.get('framePalettes', {}).values()]:
        file = native / 'native' / (palette['sha256'] + '.pal')
        assert sha(file) == palette['sha256']
        native_files.add(file)
main_head = subprocess.check_output(['git', '-C', '../ra2-hd', 'rev-parse', 'HEAD'], text=True).strip()
main_clean = not subprocess.check_output(['git', '-C', '../ra2-hd', 'status', '--porcelain'], text=True).strip()
if batch == 54:
    assert main_head == '748d0998aaf663acda8807c158155bf0a5bb157b' and main_clean
delta = read(root / 'coverage-delta.json')
review_manifest = read(review / 'review-manifest.json')
assert len(review_manifest['scenes']) == 1 and len(review_manifest['states']) == runtime_count
assert len(review_manifest['files']) == {54: 67, 55: 83, 56: 67}[batch]
document = dict(schema=f'm2-4-urban-batch{batch}-handoff-v1', status='MAC_TECHNICAL_PASS_NEW_ART_VISUAL_PENDING',
    sourceBranch='task/m2-4-all-skirmish-theaters', runtimeSourceHead=read(root / 'active-stage.json')['runtimeSourceHead'],
    mainHead=main_head, mainClean=main_clean,
    mainAdvancedSinceBatch54=main_head != '748d0998aaf663acda8807c158155bf0a5bb157b',
    mainWasMutatedByThisBatch=False, selectedEnvironment=contract['selectedPack'],
    selectedTerrain=delta['selectedTerrain'], families=sorted(read(native / 'contract.json')['families']),
    counts=dict(completeNewFamilies=8, members=8, newSourceStates=state_count, densityFrames=state_count * 2,
        applicableRuntimeStates=runtime_count, originalShadowFrames=state_count, priorFamiliesPreserved=prior_count,
        selectedFamilies=prior_count + 8, selectedFiles=len(assembly['payloadHashes']) + 1, patchFiles=patch_count,
        nativeFamilyDensityCases=16, originalMapsExecuted=1, matchedOriginalSceneControls=1,
        embeddedImages=len(review_manifest['files']), runtimeReviewRows=runtime_count),
    coveredMapEntries=sorted({m for r in delta['covered'] for m in r['maps']}),
    authoring=dict(mode='built-in image_gen', jobs=record(jobs_file),
        mothers=masters, retainedUnusedMothers=retained_unused, samplingRecipe=record(recipe_file)),
    resourceHandoff=dict(patchRoot=str(patch), selectedRoot=str(selected), ignoredResourcesExplicitlyIncluded=True,
        patchFiles=patch_files, completeSelectedAssembly=record(native / 'assembly-v1.json'),
        nativeDependencies=[record(p) for p in sorted(native_files)],
        authoringDependencies=[record(p) for p in sorted(art.rglob('*')) if p.is_file()],
        priorAcceptedHandoff=record(Path('docs/m2-4-urban-accepted-actors-batch53-20261016.json'
            if batch == 54 else f'docs/m2-4-urban-buildings-batch{batch - 1}-20261016.json'))),
    verification=record(art / 'verification-v1.json'), nativeClosure=record(root / 'native-closure.json'),
    sourceCoverageDelta=record(root / 'coverage-delta.json'), nativePlan=record(native / 'native-plan-v1.json'),
    sourceContract=record(native / 'contract.json'), preparedSource=record(native / 'source.json'),
    desktopReview=record(desktop / html.name), embeddedMetadata=record(desktop / html.with_suffix('.json').name),
    desktopQa=record(qa_file), stage=record(root / 'active-stage.json'),
    validationLogs=[record(Path('.artifacts/m2-4') / f'urban-buildings-batch{batch}-{name}-v1.log')
            for name in ['loading-tests', 'typecheck', 'build', 'stage']],
    applicationPolicy='One reused internal signed Mac host; no per-batch game bundle or resource copy. Final standalone milestone delivery remains pending.',
    originalPaletteCorrection='Five CIVSFM native index-254 cells from batch 53 included in this combined review; unchanged accepted actor frames and gate art are not resubmitted.'
        if batch == 54 else 'Previously accepted with batch 54 and preserved unchanged; not resubmitted.',
    visual='PENDING_USER_REVIEW', windows='NOT_RUN', m24Complete=False)
output = Path(f'docs/m2-4-urban-buildings-batch{batch}-20261016.json')
with output.open('x') as stream:
    stream.write(json.dumps(document, indent=2) + '\n')
print(json.dumps(dict(status=document['status'], mothers=len(masters), minimumAuthoredDensity=min(m['minimumAuthoredDensity'] for m in masters),
    patchFiles=len(patch_files), selectedFiles=document['counts']['selectedFiles'], remaining=delta['remainingByKind'])))
