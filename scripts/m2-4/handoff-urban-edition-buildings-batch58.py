"""Pin both exact edition patches, raw mothers, retained failures and consolidated Desktop evidence."""
import hashlib
import json
import subprocess
from pathlib import Path

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
base = Path('.artifacts/m2-4')
root = base / 'urban-edition-buildings-batch58-v1'
native = base / 'urban-edition-buildings-native-batch58-v1'
review = base / 'urban-edition-buildings-review-batch58-v1'
desktop = Path('/Users/Aone/Desktop/M2.4-Review-Urban-Batch58-20261016')
html = desktop / 'M2.4-Urban-Batch58-Embedded.html'
qa_file = base / 'urban-edition-buildings-batch58-embedded-desktop-qa-v1/report.json'
qa = read(qa_file)
assert qa['status'] == 'PASS_STATIC_EMBEDDED_IMAGES_NATIVE_SIZE_AND_DENSITY_CONTROLS' and not qa['errors']
assert sha(html) == sha(review / html.name)
assert sorted(p.name for p in desktop.iterdir()) == [html.name, html.with_suffix('.json').name]
closure = read(root / 'native-closure.json')
assert closure['status'] == 'PASS_EIGHT_EXACT_EDITION_FAMILIES_NATIVE_STATES_AND_RELEASE'
delta = read(root / 'coverage-delta.json')
assert delta['remainingGapFamilies'] == 47
contract = read(Path('desktop/environment-urban-hd-contract.json'))
assert contract['selectedPack'] == closure['selectedEnvironment']
selected = Path('.local/environment-packs') / contract['selectedPack']['revision']
assert sha(selected / 'manifest.json') == contract['selectedPack']['sha256']
assembly = read(native / 'assembly-v1.json')
assert len(assembly['preservedFamilies']) == 238 and len(assembly['appendedFamilies']) == 8
assert len(assembly['payloadHashes']) + 1 == 1899
for name, digest in assembly['payloadHashes'].items():
    assert sha(selected / name) == digest
patches, authoring, native_files, samples = [], [], set(), []
receipt_files = []
for edition in ['ra2', 'yr']:
    source_root = base / f'urban-edition-buildings-native-batch58-{edition}-v1'
    art = base / f'urban-edition-buildings-authoring-batch58-{edition}-v1'
    verified = read(art / 'verification-v1.json')
    assert verified['status'] == 'PASS' and verified['counts']['densityFrames'] == 32
    patch_root = Path(verified['pack'])
    assert sha(patch_root / 'manifest.json') == verified['sha256']
    payloads = []
    for file in sorted(patch_root.rglob('*')):
        if not file.is_file():
            continue
        if file != patch_root / 'manifest.json':
            assert sha(selected / file.relative_to(patch_root)) == sha(file)
        payloads.append(pin(file))
    assert len(payloads) == 23
    patches.append(dict(edition=edition, root=str(patch_root), manifest=pin(patch_root / 'manifest.json'),
        verification=pin(art / 'verification-v1.json'), payloads=payloads))
    recipe_file = art / f'urban-edition-buildings-m2-4-batch58-{edition}-r1/recipe.json'
    recipe = read(recipe_file)
    assert recipe['memberPathPolicy'] == 'original-member-and-source-sha256'
    assert len(recipe['actualSampling']) == 16 and min(s['availableDensity'] for s in recipe['actualSampling']) >= 4
    samples.extend(recipe['actualSampling'])
    authoring.append(dict(edition=edition, root=str(art), finalJobs=pin(art / 'imagegen-jobs-v4.json'),
        materialProfile=pin(art / 'material-profile-v2.json'), samplingRecipe=pin(recipe_file),
        dependencies=[pin(p) for p in sorted(art.rglob('*')) if p.is_file()]))
    receipt_files.extend(sorted(art.glob('imagegen-receipt-*.json')))
    for source in read(source_root / 'source.json')['sources']:
        expected = [(source['nativeFile'], source['sha256'])]
        for frame in source['frames']:
            expected.extend([(frame['file'], frame['rgbaSha256']), (frame['indexFile'], frame['indexSha256'])])
        for filename, digest in expected:
            file = source_root / 'native' / filename
            assert sha(file) == digest
            native_files.add(file)
        for palette in [source['palette'], *read(source_root / 'contract.json')['sources'][source['member']]['framePalettes'].values()]:
            file = source_root / 'native' / (palette['sha256'] + '.pal')
            assert sha(file) == palette['sha256']
            native_files.add(file)
selected_hashes = {s['sha256'] for s in samples}
mothers, rejected = [], []
for file in receipt_files:
    receipt = read(file)
    raw, workspace = Path(receipt['rawFile']), Path(receipt['workspaceFile'])
    assert sha(raw) == sha(workspace) == receipt['rawSha256'] == receipt['workspaceSha256']
    jobs_file = Path(receipt['jobsFile'])
    assert sha(jobs_file) == receipt['jobsSha256']
    job, = [j for j in read(jobs_file)['jobs'] if j['id'] == receipt['jobId']]
    assert job['prompt'] == receipt['prompt'] and sha(Path(job['reference'])) == receipt['referenceSha256']
    row = dict(raw=pin(raw), workspace=pin(workspace), receipt=pin(file),
        reference=pin(Path(job['reference'])), prompt=receipt['prompt'], promptSet=pin(jobs_file))
    if sha(workspace) in selected_hashes:
        assert receipt['status'] == 'PASS'
        assert receipt['opaqueOuterEdgePixels'] == receipt['opaqueCellBoundaryPixels'] == 0
        relevant = [s for s in samples if s['sha256'] == sha(workspace)]
        row.update(minimumAuthoredDensity=min(s['availableDensity'] for s in relevant),
            selectedRegistrations=relevant)
        mothers.append(row)
    else:
        assert receipt['status'] == 'REWORK_REQUIRED' and receipt['opaqueCellBoundaryPixels'] == 105
        row['reason'] = 'Rejected paired white-house mother crossed its proportional divider; separate single-state mothers replace it. No selected samples use this image.'
        rejected.append(row)
assert len(mothers) == 16 and len(rejected) == 1
assert {r['workspace']['sha256'] for r in mothers} == selected_hashes
review_manifest = read(review / 'review-manifest.json')
assert len(review_manifest['files']) == 64 and len(review_manifest['scenes']) == 4
assert len(review_manifest['states']) == 18 and len(review_manifest['comparisons']) == 16
stage = read(root / 'active-stage.json')
assert not subprocess.check_output(['git', 'diff', stage['runtimeSourceHead'], '--', 'src', 'desktop', 'public'], text=True)
main_head = subprocess.check_output(['git', '-C', '../ra2-hd', 'rev-parse', 'HEAD'], text=True).strip()
main_clean = not subprocess.check_output(['git', '-C', '../ra2-hd', 'status', '--porcelain'], text=True).strip()
assert main_head == '748d0998aaf663acda8807c158155bf0a5bb157b' and main_clean
document = dict(schema='m2-4-urban-exact-edition-buildings-batch58-handoff-v1',
    status='MAC_TECHNICAL_PASS_CONSOLIDATED_BATCH58_ART_VISUAL_PENDING',
    sourceBranch='task/m2-4-all-skirmish-theaters', runtimeSourceHead=stage['runtimeSourceHead'],
    mainHead=main_head, mainClean=main_clean, mainWasMutatedByThisBatch=False,
    selectedEnvironment=contract['selectedPack'], selectedTerrain=delta['selectedTerrain'],
    families=sorted(read(native / 'contract.json')['families']),
    counts=dict(completeNewFamilies=8, originalIdentities=4, distinctSourceHashes=8,
        sourceBodyStates=32, densityFrames=64, originalShadowFrames=32, newDistinctMaterials=20,
        crossEditionSharedSourceStates=9, exactNativeInactiveDuplicatePairs=6,
        newSelectedMothers=16, retainedRejectedMothers=1, nativeFamilyDensityCases=16,
        applicableRuntimeStates=24, originalMapsExecuted=4, releaseAndOriginalReentryCases=2,
        priorFamiliesPreserved=238, selectedFamilies=246, selectedFiles=1899, newPatchFiles=46,
        embeddedImages=64, consolidatedNativeReviewRows=18, remainingUrbanSourceGroups=47),
    coveredMapEntries=sorted({m for r in delta['covered'] for m in r['maps']}),
    authoring=dict(mode='built-in image_gen', selectedMothers=mothers,
        retainedRejectedMothers=rejected, editions=authoring,
        fragmentRegistration=pin(base / 'urban-edition-buildings-batch58-fragment-registration-v3.json'),
        fragmentNegativeControl=pin(base / 'urban-edition-buildings-fragment-negative-v1/report.json')),
    resourceHandoff=dict(ignoredResourcesExplicitlyIncluded=True, patches=patches,
        selectedRoot=str(selected), completeSelectedAssembly=pin(native / 'assembly-v1.json'),
        nativeDependencies=[pin(p) for p in sorted(native_files)],
        priorAcceptedHandoff=pin(Path('docs/m2-4-urban-city-flags-batch57-20261016.json'))),
    nativeClosure=pin(root / 'native-closure.json'), sourceCoverageDelta=pin(root / 'coverage-delta.json'),
    sourceContract=pin(native / 'contract.json'), preparedSource=pin(native / 'source.json'),
    sharedBodyParity=pin(native / 'shared-body-pixel-parity-v1.json'), nativePlan=pin(native / 'native-plan-v1.json'),
    desktopReview=pin(html), embeddedMetadata=pin(html.with_suffix('.json')), desktopQa=pin(qa_file),
    reviewManifest=pin(review / 'review-manifest.json'), stage=pin(root / 'active-stage.json'),
    validationLogs=[pin(base / f'urban-edition-buildings-batch58-{name}.log') for name in
        ['ra2-loading-tests-v3', 'yr-loading-tests-v2', 'routing-tests-v1', 'typecheck-v1', 'build-v1', 'stage-v1', 'native-v1']],
    retainedDiagnosticLogs=[pin(base / f'urban-edition-buildings-batch58-{name}.log') for name in
        ['ra2-loading-tests-v1', 'ra2-loading-tests-v2', 'yr-loading-tests-v1']],
    testDiagnosticCorrection='Initial environment-loading fixture supplied a family object instead of its ID to environmentMemberSource; one initial family name also had a filename prefix typo. The helper now uses the real family ID. All 16 density cases pass; no runtime or asset correction resulted.',
    originalRules='All eight original identities remain non-garrisonable. All source slots, geometry, owner regions, shadows and palettes remain original. Source-hash namespaces and per-family overrides retain edition identity.',
    applicationPolicy='One reused internal signed arm64 Mac validation host. No per-batch game bundle or resource copy. Final standalone M2.4 application remains pending.',
    visual='PENDING_CONSOLIDATED_BATCH58_NEW_ART_ONLY', windows='NOT_RUN', m24Complete=False)
target = Path('docs/m2-4-urban-edition-buildings-batch58-20261016.json')
before = root / 'production-checkpoint-before-native-closure.json'
with before.open('xb') as stream:
    stream.write(target.read_bytes())
document['productionCheckpoint'] = pin(before)
target.write_text(json.dumps(document, indent=2) + '\n')
print(json.dumps(dict(status=document['status'], selectedMothers=len(mothers), rejectedMothers=len(rejected),
    minimumAuthoredDensity=min(r['minimumAuthoredDensity'] for r in mothers),
    selectedFiles=1899, reviewBytes=html.stat().st_size, remaining=delta['remainingByKind'])))
