"""Pin ignored artwork, sources, native evidence and the standalone Batch 61 page."""
import hashlib
import json
import subprocess
from pathlib import Path

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
base = Path('.artifacts/m2-4')
root = base / 'urban-linked-batch61-v1'
native = base / 'urban-linked-native-batch61-v1'
art = base / 'urban-linked-authoring-batch61-v1'
review = base / 'urban-linked-review-batch61-v1'
desktop = Path('/Users/Aone/Desktop/M2.4-Review-Urban-Batch61-20261016')
closure = read(root / 'native-closure.json')
assert closure['status'] == 'PASS_SIX_COMPLETE_LINKED_URBAN_FAMILIES_NATIVE_STATES_LOOPS_AND_RELEASE'
qa_file = base / 'urban-linked-batch61-embedded-desktop-qa-v1/report.json'
qa = read(qa_file)
assert qa['status'] == 'PASS_STATIC_EMBEDDED_IMAGES_NATIVE_SIZE_CONTROLS_AND_NATIVE_VIDEO_PLAYBACK'
assert not qa['errors'] and len(qa['videos']) == 36
html = review / 'M2.4-Urban-Batch61-Embedded.html'
assert sha(desktop / html.name) == sha(html)
assert sha(desktop / html.with_suffix('.json').name) == sha(html.with_suffix('.json'))
assert sorted(p.name for p in desktop.iterdir()) == [html.name, html.with_suffix('.json').name]
contract_file = Path('desktop/environment-urban-hd-contract.json')
contract = read(contract_file)
assert contract['selectedPack'] == closure['selectedEnvironment']
selected = Path('.local/environment-packs') / contract['selectedPack']['revision']
assert sha(selected / 'manifest.json') == contract['selectedPack']['sha256']
assembly = read(native / 'assembly-v1.json')
assert len(assembly['preservedFamilies']) == 278 and len(assembly['appendedFamilies']) == 6
assert len(assembly['payloadHashes']) == 2257
for name, digest in assembly['payloadHashes'].items():
    assert sha(selected / name) == digest
patch = Path(read(art / 'verification-v1.json')['pack'])
patch_files = []
for file in sorted(patch.rglob('*')):
    if file.is_file():
        if file != patch / 'manifest.json':
            assert sha(selected / file.relative_to(patch)) == sha(file)
        patch_files.append(pin(file))
assert len(patch_files) == 160
recipe_file = art / 'urban-linked-m2-4-batch61-r1/recipe.json'
recipe = read(recipe_file)
capacity = read(art / 'actual-authoring-capacity-v1.json')
assert capacity['status'] == 'PASS' and len(recipe['actualSampling']) == capacity['authoredSlots'] == 214
assert min(s['availableDensity'] for s in recipe['actualSampling']) >= 4
mother_hashes = {s['sha256'] for s in recipe['actualSampling']}
assert len(mother_hashes) == 54
receipts = list(sorted(art.glob('imagegen-receipt-*.json')))
assert len(receipts) == 70
selected_receipts = []
for receipt_file in receipts:
    receipt = read(receipt_file)
    assert sha(Path(receipt['rawFile'])) == sha(Path(receipt['workspaceFile'])) == receipt['rawSha256'] == receipt['workspaceSha256']
    assert receipt['jobsSha256'] == sha(Path(receipt['jobsFile']))
    if receipt['workspaceSha256'] in mother_hashes:
        if receipt['status'] != 'PASS':
            assert receipt_file.name == 'imagegen-receipt-12-r2.json'
            assert read(art / 'registration-gap-repair-12-v1.json')['status'] == 'SOURCE_UNCHANGED_REGISTRATION_ONLY'
        selected_receipts.append(pin(receipt_file))
assert len(selected_receipts) == 54
for row in capacity['rows']:
    sample, = [s for s in recipe['actualSampling'] if s['key'] == row['key']]
    assert sample['sha256'] == row['sha256'] and sample['sourceRect'] == row['rect']
    assert sample['availableDensity'] == row['availableDensity']
    assert row['alphaCutoff'] == 180 and row['boundaryPixels'] == 0
native_files = set()
for source in read(native / 'source.json')['sources']:
    file = native / 'native' / source['nativeFile']
    assert sha(file) == source['sha256']
    native_files.add(file)
    native_files.add(native / 'native' / (source['palette']['sha256'] + '.pal'))
    for frame in source['frames']:
        native_files.update(native / 'native' / frame[key] for key in ['file', 'indexFile'])
native_files.add(native / 'native' / 'b1f4c15b7b91130736b4dffeb189ca32621bf606afbc0b2d02eb5584b6921fe3.pal')
manifest = read(review / 'review-manifest.json')
assert len(manifest['files']) == 121 and len(manifest['videoFiles']) == 36
for row in manifest['files'] + manifest['videoFiles']:
    assert sha(review / row['file']) == sha(Path(row['source'])) == row['sha256']
main = Path('/Users/Aone/RA2remaster/ra2-hd')
main_head = subprocess.check_output(['git', '-C', str(main), 'rev-parse', 'HEAD'], text=True).strip()
assert main_head == '748d0998aaf663acda8807c158155bf0a5bb157b'
assert not subprocess.check_output(['git', '-C', str(main), 'status', '--porcelain'], text=True).strip()
stage = read(root / 'active-stage.json')
assert not subprocess.check_output(['git', 'diff', stage['runtimeSourceHead'], '--', 'src', 'desktop', 'public'], text=True).strip()
assert subprocess.check_output(['git', 'diff', '--name-only', '1742a092', '--', 'src', 'desktop', 'public'], text=True).splitlines() == [str(contract_file)]
delta = read(root / 'coverage-delta.json')
validation_files = sorted(p for p in root.rglob('*') if p.is_file())
doc = dict(schema='m2-4-urban-linked-batch61-handoff-v1', status='MAC_TECHNICAL_PASS_SIX_NEW_FAMILIES_VISUAL_PENDING',
    mainHead=main_head, mainClean=True, mainWasMutatedByThisBatch=False, runtimeSourceHead=stage['runtimeSourceHead'],
    validationToolsBaseHead=subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
    validationToolFiles=[pin(Path(name)) for name in [
        'scripts/m2-4/close-urban-linked-batch61.py', 'scripts/m2-4/handoff-urban-linked-batch61.py',
        'scripts/m2-4/review-urban-linked-batch61.py', 'scripts/m2-4/prepare-urban-linked-comparisons-batch61.py',
        'scripts/m2-4/embed-review.py', 'scripts/m2-4/verify-embedded-review.cjs',
        'scripts/m2-4/native-original-review.mjs', 'scripts/m2-4/native-urban-rubble-batch.mjs',
        'scripts/m2/official-maps/native-object-bindings.mjs', 'scripts/m2/official-maps/native-coverage.mjs',
        'scripts/m2/official-maps/native-states.mjs', 'scripts/m2/official-maps/native-linked-building-cycle.mjs']],
    counts=dict(families=6, members=13, visibleSourceSlots=223, untouchedNativeShadowSlots=223, densityFrames=446,
        distinctNewMaterials=189, selectedMothers=54, rawMothersRetained=70, acceptedFlagSourcePoses=9,
        nativeFamilyDensityCases=14, originalMapCases=3, fullNativeLoopObservations=36, originalIdleObservations=6,
        nativeReviewRows=15, embeddedImages=121, embeddedNativeRecordings=36, patchFiles=160, selectedFiles=2258,
        remainingUrbanSourceGroups=9, coveredMapEntries=len({m for row in delta['covered'] for m in row['maps']})),
    resourceHandoff=dict(policy='Transfer complete ignored payloads additively with hash checks; source-only merge is not delivery.',
        selectedRoot=str(selected.resolve()), manifest=pin(selected / 'manifest.json'), payloadHashes=assembly['payloadHashes'],
        patchRoot=str(patch.resolve()), patchFiles=patch_files, assembly=pin(native / 'assembly-v1.json')),
    sourceContract=pin(native / 'contract.json'), selectedContract=pin(contract_file), preparedSource=pin(native / 'source.json'),
    sourceDependencies=[pin(p) for p in sorted(native_files)],
    authoring=dict(tool='built-in image_gen', selectedReceipts=selected_receipts, actualMotherHashes=sorted(mother_hashes),
        recipe=pin(recipe_file), minimumAvailableDensity=capacity['minimumDensity'],
        registrationRepair=pin(art / 'registration-gap-repair-12-v1.json'),
        repairDisclosure='The retained 12-r2 receipt records its original rejected row cut. A five-pixel cut shift into the actual transparent gutter preserves every source pixel; final alpha-180 registration and density proof pass without exemptions.',
        retainedFiles=[pin(p) for p in sorted(art.rglob('*')) if p.is_file()]),
    nativeClosure=pin(root / 'native-closure.json'), sourceCoverageDelta=pin(root / 'coverage-delta.json'),
    retainedNativeEvidence=[pin(p) for p in validation_files],
    originalArchives=delta['archives'], unchangedMapBytes=True, unchangedDependencyKeys=True,
    desktopReview=pin(desktop / html.name), embeddedMetadata=pin(desktop / html.with_suffix('.json').name),
    reviewManifest=pin(review / 'review-manifest.json'), desktopQa=pin(qa_file), runtimeStage=pin(root / 'active-stage.json'),
    build=dict(directory=stage['build'], runtimeSourceHead=stage['runtimeSourceHead'], target=stage['target'],
        noGameRuntimeEditsAfterBuild=True, noPerBatchMacGameCopy=True, preparedRegistration=stage['preparedRegistration']),
    verification=pin(art / 'verification-v1.json'), loadingTests=dict(passed=15, assertions=233, log=pin(root / 'loading-tests.log')),
    typecheck=pin(root / 'typecheck.log'), isolatedBuildLog=pin(root / 'build.log'),
    budgets=dict(world2XMiB=512, world4XMiB=1280, preparedCpuMiB=128, uiMiB=16),
    inheritedEvidence='Accepted terrain, trees, other civilian families, faction packs, unified skirmish adaptation and official-map lightweight simulation evidence are reused. No full faction/icon matrix is repeated.',
    retainedFailures='Original neutral psychic structures correctly remained unpowered; the initial validator expected an active loop. An Original-only fixture observer was also missing. Both failed reports remain pinned; only the failed paths were retried after validator fixes, with no game or map edits.',
    visual='PENDING_SIX_NEW_FAMILIES_ONLY', batch59='SEPARATELY_PENDING', batch60='USER_ACCEPTED_9bf3e6ed',
    remaining=dict(urban=delta['remainingByKind'], newUrban='PENDING_RESOURCE_PRODUCTION', desert='PENDING_RESOURCE_PRODUCTION'),
    windows='NOT_RUN', localMainIntegration='NOT_PERFORMED', remotePush='NOT_PERFORMED', m24Complete=False)
target = Path('docs/m2-4-urban-linked-batch61-20261016.json')
with target.open('x') as stream:
    stream.write(json.dumps(doc, indent=2) + '\n')
print(json.dumps(dict(status=doc['status'], selectedFiles=2258, reviewBytes=html.stat().st_size,
    nativeRecordings=36, sourceDependencies=len(native_files), remaining=delta['remainingByKind'])))
