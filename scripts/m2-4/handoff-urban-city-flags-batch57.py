"""Pin complete ignored resources, accepted reuse, new flag mothers and actual Desktop proof."""
import hashlib
import json
import subprocess
from pathlib import Path

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
root = Path('.artifacts/m2-4/urban-city-flags-batch57-v1')
native = Path('.artifacts/m2-4/urban-city-flags-native-batch57-v1')
art = Path('.artifacts/m2-4/urban-city-flags-authoring-batch57-v1')
review = Path('.artifacts/m2-4/urban-city-flags-review-batch57-v1')
desktop = Path('/Users/Aone/Desktop/M2.4-Review-Urban-Batch57-20261016')
html = desktop / 'M2.4-Urban-Batch57-Embedded.html'
qa_file = Path('.artifacts/m2-4/urban-city-flags-batch57-embedded-desktop-qa-v1/report.json')
qa = read(qa_file)
assert qa['status'] == 'PASS_STATIC_EMBEDDED_IMAGES_NATIVE_SIZE_AND_DENSITY_CONTROLS' and not qa['errors']
assert sha(html) == sha(review / html.name)
assert sorted(p.name for p in desktop.iterdir()) == [html.name, html.with_suffix('.json').name]
closure = read(root / 'native-closure.json')
assert closure['status'] == 'PASS_EIGHT_COMPLETE_CITY_FLAG_FAMILIES_NATIVE_STATES_LOOPS_PALETTES_AND_RELEASE'
delta = read(root / 'coverage-delta.json')
assert delta['remainingGapFamilies'] == 55
contract = read(Path('desktop/environment-urban-hd-contract.json'))
assert contract['selectedPack'] == closure['selectedEnvironment']
selected = Path('.local/environment-packs') / contract['selectedPack']['revision']
assert sha(selected / 'manifest.json') == contract['selectedPack']['sha256']
assembly = read(native / 'assembly-v1.json')
assert len(assembly['preservedFamilies']) == 230 and len(assembly['appendedFamilies']) == 8
for name, digest in assembly['payloadHashes'].items():
    assert sha(selected / name) == digest
patch = Path(read(art / 'verification-v1.json')['pack'])
patch_files = [pin(p) for p in sorted(patch.rglob('*')) if p.is_file()]
assert len(patch_files) == 69 and len(assembly['payloadHashes']) + 1 == 1855
for row in patch_files:
    file = Path(row['file'])
    if file.name != 'manifest.json':
        assert sha(selected / file.relative_to(patch)) == row['sha256']
recipe_file = art / 'urban-city-flags-m2-4-batch57-r1/recipe.json'
recipe = read(recipe_file)
sampling = recipe['actualSampling']
assert len(sampling) == 64 and min(row['availableDensity'] for row in sampling) >= 4
jobs_file = art / 'imagegen-jobs-v2.json'
jobs = read(jobs_file)['jobs']
mothers = []
for number, job in enumerate(jobs, 1):
    receipt_file = art / f'imagegen-receipt-{number:02d}.json'
    receipt = read(receipt_file)
    raw, workspace = Path(receipt['rawFile']), Path(receipt['workspaceFile'])
    assert sha(raw) == sha(workspace) == receipt['rawSha256'] == receipt['workspaceSha256']
    assert receipt['prompt'] == job['prompt'] and sha(Path(job['reference'])) == receipt['referenceSha256']
    rows = [s for s in sampling if s['sha256'] == sha(workspace)]
    assert len(rows) == 16
    mothers.append(dict(raw=pin(raw), workspace=pin(workspace), receipt=pin(receipt_file),
        reference=pin(Path(job['reference'])), prompt=job['prompt'], selectedSlots=[r['key'] for r in rows],
        minimumAuthoredDensity=min(r['availableDensity'] for r in rows)))
native_files = set()
for source in read(native / 'source.json')['sources']:
    expected = [(source['nativeFile'], source['sha256'])]
    for frame in source['frames']:
        expected.extend([(frame['file'], frame['rgbaSha256']), (frame['indexFile'], frame['indexSha256'])])
    for filename, digest in expected:
        file = native / 'native' / filename
        assert sha(file) == digest
        native_files.add(file)
    file = native / 'native' / (source['palette']['sha256'] + '.pal')
    assert sha(file) == source['palette']['sha256']
    native_files.add(file)
review_manifest = read(review / 'review-manifest.json')
assert len(review_manifest['files']) == 206 and len(review_manifest['nativeFlagPreviews']) == 12
assert len(review_manifest['scenes']) == 2 and len(review_manifest['states']) == 64
failed_file = root / 'native-flags-2x-v1/report.json'
failed = read(failed_file)
assert failed['status'] == 'FAIL' and 'Number.isInteger(loopStart)' in failed['failure']
main_head = subprocess.check_output(['git', '-C', '../ra2-hd', 'rev-parse', 'HEAD'], text=True).strip()
main_clean = not subprocess.check_output(['git', '-C', '../ra2-hd', 'status', '--porcelain'], text=True).strip()
assert main_head == '748d0998aaf663acda8807c158155bf0a5bb157b' and main_clean
stage = read(root / 'active-stage.json')
assert not subprocess.check_output(['git', 'diff', stage['runtimeSourceHead'], '--', 'src', 'desktop', 'public'], text=True)
document = dict(schema='m2-4-urban-city-flags-batch57-handoff-v1',
    status='MAC_TECHNICAL_PASS_FOUR_NEW_FLAG_ANIMATIONS_VISUAL_PENDING',
    sourceBranch='task/m2-4-all-skirmish-theaters', runtimeSourceHead=stage['runtimeSourceHead'],
    mainHead=main_head, mainClean=main_clean, mainWasMutatedByThisBatch=False,
    selectedEnvironment=contract['selectedPack'], selectedTerrain=delta['selectedTerrain'],
    families=sorted(read(native / 'contract.json')['families']),
    counts=dict(completeNewFamilies=8, sourceMembers=12, sourceBodyStates=88, densityFrames=176,
        reusedAcceptedBodyStates=24, exactReusedDensityFrames=48, newFlagSourcePhases=64,
        originalShadowFrames=88, authoredMothers=4, priorFamiliesPreserved=230, selectedFamilies=238,
        selectedFiles=1855, patchFiles=69, applicableRuntimeStates=20, nativeFamilyDensityCases=16,
        activeFlagPhases=60, nativeFlagDensityLoops=8, matchedOriginalLoops=4,
        originalMapsExecuted=2, embeddedImages=206, animatedPngPreviews=12, remainingUrbanSourceGroups=55),
    coveredMapEntries=sorted({m for r in delta['covered'] for m in r['maps']}),
    authoring=dict(mode='built-in image_gen', jobs=pin(jobs_file), mothers=mothers,
        initialJobs=pin(art / 'imagegen-jobs-v1.json'), samplingRecipe=pin(recipe_file),
        acceptedBodyProof=pin(art / 'accepted-body-proof-v1.json'),
        acceptedSnowAuthority=pin(Path('.artifacts/m2-4/snow-batch24-user-acceptance-20261013-v1.json'))),
    resourceHandoff=dict(patchRoot=str(patch), selectedRoot=str(selected), ignoredResourcesExplicitlyIncluded=True,
        patchFiles=patch_files, completeSelectedAssembly=pin(native / 'assembly-v1.json'),
        nativeDependencies=[pin(p) for p in sorted(native_files)],
        authoringDependencies=[pin(p) for p in sorted(art.rglob('*')) if p.is_file()],
        priorAcceptedHandoff=pin(Path('docs/m2-4-urban-buildings-batch56-20261016.json'))),
    verification=pin(art / 'verification-v1.json'), nativeClosure=pin(root / 'native-closure.json'),
    sourceCoverageDelta=pin(root / 'coverage-delta.json'), nativePlan=pin(native / 'native-plan-v1.json'),
    flagRetryPlan=pin(native / 'native-plan-flags-r2.json'),
    sourceContract=pin(native / 'contract.json'), preparedSource=pin(native / 'source.json'),
    desktopReview=pin(html), embeddedMetadata=pin(html.with_suffix('.json')), desktopQa=pin(qa_file),
    stage=pin(root / 'active-stage.json'), reviewManifest=pin(review / 'review-manifest.json'),
    validationLogs=[pin(Path('.artifacts/m2-4') / f'urban-city-flags-batch57-{name}.log')
        for name in ['loading-tests-v1', 'typecheck-v2', 'build-v1', 'stage-v1', 'native-v1', 'native-flags-r2']],
    retainedFailure=dict(report=pin(failed_file),
        cause='Validation tool parsed an absent LoopStart as NaN; unchanged AnimProps defaults to zero.',
        correction='Validator now applies original LoopStart=0 and exclusive LoopEnd defaults. Only incomplete flag cases repeated; city evidence reused. No app or art correction.'),
    originalPaletteCorrection='Only exact Urban archive map c3f4f1c670fe and the four previously approved raw city source hashes; original liburb and libsno bytes are identical. Both editions and Original fallback checked.',
    reviewPacing='APNG previews contain exact native phase captures at an explicit 100 ms per phase. Native rate/ticks and full loop-return evidence remain in source reports; previews are not real-time recordings.',
    applicationPolicy='One reused internal signed Mac arm64 host; no per-batch game bundle or resource copy. Final standalone M2.4 delivery remains pending.',
    visual='PENDING_FOUR_NEW_FLAG_ANIMATIONS_ONLY', windows='NOT_RUN', m24Complete=False)
target = Path('docs/m2-4-urban-city-flags-batch57-20261016.json')
with target.open('x') as stream:
    stream.write(json.dumps(document, indent=2) + '\n')
print(json.dumps(dict(status=document['status'], minimumAuthoredDensity=min(m['minimumAuthoredDensity'] for m in mothers),
    selectedFiles=1855, reviewBytes=html.stat().st_size, remaining=delta['remainingByKind'])))
