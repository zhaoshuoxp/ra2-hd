"""Pin the complete ignored payload, original sources and consolidated batch 60 review."""
import hashlib
import json
import subprocess
from pathlib import Path

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
base = Path('.artifacts/m2-4')
root = base / 'urban-buildings-batch60-v1'
native = base / 'urban-buildings-native-batch60-v1'
art = base / 'urban-buildings-authoring-batch60-v1'
review = base / 'urban-buildings-review-batch60-v1'
facility = base / 'urban-placeholder-hd-repair-v1'
closure = read(root / 'native-closure.json')
assert closure['status'] == 'PASS_SIXTEEN_COMPLETE_URBAN_BUILDINGS_NATIVE_STATES_AND_RELEASE'
facility_closure = read(facility / 'native-closure.json')
assert facility_closure['status'] == 'PASS_TWO_AUTHORIZED_FACILITY_REPAIRS_MAC_NATIVE_STATES_ORIGINAL_AND_RELEASE'
qa_file = base / 'urban-buildings-batch60-embedded-desktop-qa-v1/report.json'
qa = read(qa_file)
assert qa['status'] == 'PASS_STATIC_EMBEDDED_IMAGES_NATIVE_SIZE_AND_DENSITY_CONTROLS' and not qa['errors']
html = review / 'M2.4-Urban-Batch60-Embedded.html'
desktop = Path('/Users/Aone/Desktop/M2.4-Review-Urban-Batch60-20261016')
assert sha(desktop / html.name) == sha(html)
assert sorted(p.name for p in desktop.iterdir()) == [html.name, html.with_suffix('.json').name]
contract = read(Path('desktop/environment-urban-hd-contract.json'))
assert contract['selectedPack'] == closure['selectedEnvironment']
selected = Path('.local/environment-packs') / contract['selectedPack']['revision']
assert sha(selected / 'manifest.json') == contract['selectedPack']['sha256']
assembly = read(native / 'assembly-v1.json')
assert len(assembly['preservedFamilies']) == 262 and len(assembly['appendedFamilies']) == 16
for name, digest in assembly['payloadHashes'].items():
    assert sha(selected / name) == digest
patch = Path(read(art / 'verification-v1.json')['pack'])
patch_files = []
for file in sorted(patch.rglob('*')):
    if file.is_file():
        if file != patch / 'manifest.json':
            assert sha(selected / file.relative_to(patch)) == sha(file)
        patch_files.append(pin(file))
assert len(patch_files) == 111
recipe_file = art / 'urban-buildings-m2-4-batch60-r1/recipe.json'
recipe = read(recipe_file)
assert len(recipe['actualSampling']) == 64
assert min(s['availableDensity'] for s in recipe['actualSampling']) >= 4
receipts = [p for p in sorted(art.glob('imagegen-receipt-*.json')) if read(p)['status'] == 'PASS']
mother_hashes = {s['sha256'] for s in recipe['actualSampling']}
assert len(mother_hashes) == 46
for receipt_file in receipts:
    receipt = read(receipt_file)
    assert sha(Path(receipt['rawFile'])) == sha(Path(receipt['workspaceFile'])) == receipt['rawSha256'] == receipt['workspaceSha256']
    assert receipt['jobsSha256'] == sha(Path(receipt['jobsFile']))
assert mother_hashes <= {read(p)['workspaceSha256'] for p in receipts}
for row in read(art / 'mothers-closure-v1.json')['slots']:
    sample, = [s for s in recipe['actualSampling'] if s['key'] == row['key']]
    assert sample['sha256'] == row['sha256'] and sample['sourceRect'] == row['rect']
    assert sample['availableDensity'] == row['availableDensity']
native_files = set()
for source in read(native / 'source.json')['sources']:
    native_files.add(native / 'native' / source['nativeFile'])
    native_files.add(native / 'native' / (source['palette']['sha256'] + '.pal'))
    for frame in source['frames']:
        native_files.update(native / 'native' / frame[key] for key in ['file', 'indexFile'])
native_files.add(native / 'native' / 'b1f4c15b7b91130736b4dffeb189ca32621bf606afbc0b2d02eb5584b6921fe3.pal')
review_manifest = read(review / 'review-manifest.json')
for row in review_manifest['files']:
    assert sha(review / row['file']) == row['sha256']
main = Path('/Users/Aone/RA2remaster/ra2-hd')
main_head = subprocess.check_output(['git', '-C', str(main), 'rev-parse', 'HEAD'], text=True).strip()
assert main_head == '748d0998aaf663acda8807c158155bf0a5bb157b'
assert not subprocess.check_output(['git', '-C', str(main), 'status', '--porcelain'], text=True).strip()
assert not subprocess.check_output(['git', 'diff', '1742a092', '--', 'src', 'desktop', 'public'], text=True).strip()
doc = Path('docs/m2-4-urban-buildings-batch60-20261016.json')
old = read(doc)
snapshot = root / 'production-checkpoint-before-native-closure.json'
with snapshot.open('xb') as f:
    f.write(doc.read_bytes())
delta = read(root / 'coverage-delta.json')
result = dict(old, status='MAC_TECHNICAL_PASS_CONSOLIDATED_BATCH60_AND_FACILITIES_VISUAL_PENDING',
    runtimeSourceHead=read(root / 'active-stage.json')['runtimeSourceHead'], mainHead=main_head, mainClean=True,
    mainWasMutatedByThisBatch=False,
    counts=dict(old['counts'], patchFiles=len(patch_files), embeddedImages=len(review_manifest['files']),
        nativeReviewRows=len(review_manifest['states']), nativeFamilyDensityCases=32, originalMapsExecuted=6,
        groupedReviewFamilies=18, remainingUrbanSourceGroups=15),
    resourceHandoff=dict(policy='Transfer complete payloads additively with hash checks; source-only merge is not delivery.',
        selectedRoot=str(selected.resolve()), manifest=pin(selected / 'manifest.json'), payloadHashes=assembly['payloadHashes'],
        patchRoot=str(patch.resolve()), patchFiles=patch_files, assembly=pin(native / 'assembly-v1.json')),
    sourceContract=pin(native / 'contract.json'), preparedSource=pin(native / 'source.json'),
    sourceDependencies=[pin(p) for p in sorted(native_files)],
    authoring=dict(tool='built-in image_gen', actualMotherHashes=sorted(mother_hashes), recipe=pin(recipe_file),
        minimumAvailableDensity=min(s['availableDensity'] for s in recipe['actualSampling']),
        retainedFiles=[pin(p) for p in sorted(art.rglob('*')) if p.is_file()]),
    nativeClosure=pin(root / 'native-closure.json'), sourceCoverageDelta=pin(root / 'coverage-delta.json'),
    groupedFacilityReview=dict(authorization=pin(facility / 'user-authorization.json'), closure=pin(facility / 'native-closure.json'),
        handoff=pin(Path('docs/m2-4-urban-facility-placeholder-repair-20261016.json')),
        retainedFiles=[pin(p) for p in sorted(facility.rglob('*')) if p.is_file()]),
    desktopReview=pin(desktop / html.name), embeddedMetadata=pin(desktop / html.with_suffix('.json').name),
    desktopQa=pin(qa_file), reviewManifest=pin(review / 'review-manifest.json'), stage=pin(root / 'active-stage.json'),
    validationLogs=[pin(root / name) for name in ['loading-tests-v1.log', 'typecheck-v1.log', 'build-v1.log',
        'stage-v1.log', 'native-suite-v1.log', 'native-suite-v2.log', 'review-v1.log', 'review-v2.log', 'desktop-qa-v1.log']],
    retainedLaunchFailure=pin(root / 'native-group1-2x-v1.log'),
    retainedComparisonInvocation=pin(root / 'comparison-cli-first-attempt-v1.json'),
    retainedReviewLabelFailure=pin(root / 'review-v1.log'),
    productionCheckpoint=pin(snapshot), windows='NOT_RUN', m24Complete=False)
doc.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(dict(status=result['status'], families=18, selectedFiles=2099,
    embeddedImages=result['counts']['embeddedImages'], reviewBytes=html.stat().st_size, remaining=delta['remainingByKind'])))
