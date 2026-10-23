"""Pin batch 52 artwork, ignored resource payloads and completed native evidence."""
import hashlib
import json
import subprocess
from pathlib import Path

read = lambda file: json.loads(file.read_text())
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
record = lambda file: dict(file=str(file), sha256=sha(file), bytes=file.stat().st_size)
root = Path('.artifacts/m2-4/urban-rubble-batch52-v1')
native = Path('.artifacts/m2-4/urban-building-rubble-native-batch52-v1')
authoring = Path('.artifacts/m2-4/urban-building-rubble-authoring-batch52-v1')
review = Path('.artifacts/m2-4/urban-rubble-review-batch52-v1')
html = review / 'M2.4-Urban-Batch52-Embedded.html'
desktop = Path('/Users/Aone/Desktop/M2.4-Review-Urban-Batch52-20261016') / html.name
closure = read(root / 'native-closure.json')
motion_files = [Path(clip['file']) for entry in closure['nativeReports']
    for clip in read(Path(entry['file'])).get('oilClips', [])]
assert len(motion_files) == 4
delta = read(root / 'coverage-delta.json')
assert closure['status'] == 'PASS_EIGHT_COMPLETE_LINKED_FAMILIES_16_NATIVE_STATE_CASES_FOUR_ORIGINAL_MAPS'
qa_file = Path('.artifacts/m2-4/urban-rubble-batch52-embedded-desktop-qa-v1/report.json')
qa = read(qa_file)
assert qa['status'] == 'PASS_STATIC_EMBEDDED_IMAGES_NATIVE_SIZE_AND_DENSITY_CONTROLS'
assert not qa['errors'] and sha(desktop) == sha(html)
contract = read(Path('desktop/environment-urban-hd-contract.json'))
assert contract['selectedPack'] == closure['selectedPack']
patch = read(authoring / 'verify-linked-r1.json')
patch_root = Path(patch['pack'])
selected = Path('.local/environment-packs') / contract['selectedPack']['revision']
assert sha(patch_root / 'manifest.json') == patch['sha256']
assert sha(selected / 'manifest.json') == contract['selectedPack']['sha256']
assembly_file = native / 'assembly-v1.json'
assembly = read(assembly_file)
assert len(assembly['preservedFamilies']) == 196 and len(assembly['appendedFamilies']) == 8
for name, digest in assembly['payloadHashes'].items():
    assert sha(selected / name) == digest
patch_files = []
for file in sorted(patch_root.rglob('*')):
    if file.is_file():
        if file.name != 'manifest.json' or file.parent != patch_root:
            assert sha(selected / file.relative_to(patch_root)) == sha(file)
        patch_files.append(dict(path=str(file.relative_to(patch_root)), sha256=sha(file), bytes=file.stat().st_size))
assert len(patch_files) == 104
native_files = set()
for source in read(native / 'source.json')['sources']:
    required = [(source['nativeFile'], source['sha256'])]
    for frame in source['frames']:
        required.extend([(frame['file'], frame['rgbaSha256']), (frame['indexFile'], frame['indexSha256'])])
    for name, digest in required:
        file = native / 'native' / name
        assert sha(file) == digest
        native_files.add(file)
for source in read(native / 'contract.json')['sources'].values():
    for palette in [source['palette'], *source.get('framePalettes', {}).values()]:
        file = native / 'native' / (palette['sha256'] + '.pal')
        assert sha(file) == palette['sha256']
        native_files.add(file)
masters = []
for row in read(authoring / 'material-profile-v2.json')['motherAudits']:
    master, capacity, receipt = map(Path, [row['master'], row['capacityFile'], row['receiptFile']])
    assert sha(master) == row['masterSha256'] and sha(capacity) == row['capacitySha256']
    assert sha(receipt) == row['receiptSha256'] and read(capacity)['status'] == 'PASS'
    raw = Path(read(receipt)['rawOriginal'])
    assert sha(raw) == sha(master)
    masters.append(dict(master=record(master), raw=record(raw), receipt=record(receipt),
        capacity=record(capacity), minimumAuthoredDensity=min(slot['capacity'] for slot in read(capacity)['slots'])))
assert len(masters) == 4 and min(row['minimumAuthoredDensity'] for row in masters) >= 4
main = Path('../ra2-hd')
main_head = subprocess.check_output(['git', '-C', str(main), 'rev-parse', 'HEAD'], text=True).strip()
assert main_head == '748d0998aaf663acda8807c158155bf0a5bb157b'
assert not subprocess.check_output(['git', '-C', str(main), 'status', '--porcelain'], text=True).strip()
review_manifest = read(review / 'review-manifest.json')
assert len(review_manifest['scenes']) == 4 and len(review_manifest['states']) == 8
document = dict(schema='m2-4-urban-batch52-handoff-v1', status='MAC_TECHNICAL_PASS_EIGHT_NEW_RUBBLE_IMAGES_VISUAL_PENDING',
    sourceBranch='task/m2-4-all-skirmish-theaters', runtimeSourceHead=read(root / 'active-stage.json')['runtimeSourceHead'],
    mainHead=main_head, mainCleanAndUnchanged=True,
    priorBatch51Acceptance=record(Path('.artifacts/m2-4/urban-rubble-batch51-v1/user-acceptance.json')),
    selectedEnvironment=contract['selectedPack'], selectedTerrain=delta['selectedTerrain'],
    families=sorted(read(native / 'contract.json')['families']),
    counts=dict(completeNewFamilies=8, members=15, newMemberRubbleStates=8, uniqueNewArtImages=8,
        reusedAcceptedBodyStates=24, densityFrames=440, exactAcceptedBodyDensityFrames=48,
        exactAcceptedAssociatedDensityFrames=376, uniqueAuthoredDensityFrames=16, priorFamiliesPreserved=196,
        selectedFamilies=204, selectedFiles=1619, patchFiles=104, nativeFamilyDensityCases=16,
        originalOfficialMaps=4, originalComparisonCases=4, releaseAndOriginalReentryCases=2,
        embeddedImages=len(review_manifest['files']), reviewNewArtRows=8),
    coveredMapEntries=sorted({mid for row in delta['covered'] for mid in row['maps']}),
    verification=record(authoring / 'verify-linked-r1.json'),
    bodyVerification=record(authoring / 'verify-bodies-r1.json'),
    associatedAssembly=record(native / 'linked-assembly-v1.json'),
    sourceContract=record(native / 'contract.json'), preparedSource=record(native / 'source.json'),
    materialProfile=record(authoring / 'material-profile-v2.json'), worklist=record(authoring / 'worklist.json'),
    authoring=dict(mode='built-in imagegen', jobs=record(authoring / 'imagegen-jobs-v1.json'), masters=masters),
    nativePlan=record(native / 'native-plan-v1.json'), nativeClosure=record(root / 'native-closure.json'),
    sourceCoverageDelta=record(root / 'coverage-delta.json'),
    resourceHandoff=dict(patchRoot=str(patch_root), selectedRoot=str(selected), ignoredResourcesExplicitlyIncluded=True,
        patchFiles=patch_files, completeSelectedAssembly=record(assembly_file), nativeDependencies=[record(p) for p in sorted(native_files)],
        authoringDependencies=[record(p) for p in sorted(authoring.rglob('*')) if p.is_file()],
        bodyReuseProofs=[record(Path(p)) for p in [
            '.artifacts/m2-4/urban-civilians-native-batch49-v1/temperate-body-reuse-v2.json',
            '.artifacts/m2-4/urban-linked-batch52-preflight-v1/snow-body-candidates-v1.json']],
        associatedSourceProof=record(Path('.artifacts/m2-4/urban-civilian-batch51-preflight-v1/linked-original-sources-v2.json'))),
    validation=dict(loadingTests=record(Path('.artifacts/m2-4/urban-linked-batch52-loading-tests-v1.log')),
        loadingTestsPassed=16, assertions=284,
        entryTypecheck=record(Path('.artifacts/m2-4/urban-linked-batch52-typecheck-v1.log')),
        isolatedBuild=record(Path('.artifacts/m2-4/build-urban-linked-batch52-v1/identity.json')),
        signedMacStage=record(root / 'active-stage.json'), nativeReports=closure['nativeReports'],
        oilMotionClips=[record(p) for p in motion_files], diagnostics=record(root / 'diagnostic-history.json'),
        worldAllocationBytes=closure['worldAllocationBytes'], preparedPeakBytes=closure['preparedPeakBytes']),
    review=dict(project=record(html), desktop=record(desktop), desktopQa=record(qa_file),
        userAcceptance='PENDING', scope='Eight new rubble images for eight complete families. Twenty-four accepted body states and 376 associated density frames are reused unchanged.'),
    remainingUrbanSourceGroups=delta['remainingByKind'], remainingUrbanGapCount=89,
    nextGatePreparation=dict(
        sourceAudit=record(Path('.artifacts/m2-4/urban-gate-native-batch53-v1/accepted-source-audit-v1.json')),
        exactExport=record(Path('.artifacts/m2-4/urban-gate-accepted-export-batch53-v1/reuse-receipt.json')),
        selected=False, native='NOT_RUN', policy='Forty-two exact accepted density frames prepared; no coverage reduction.'),
    newUrbanAndDesert='PRODUCTION_INCOMPLETE', windows='NOT_RUN', m24Complete=False,
    packagePolicy='One reusable internal signed Mac validation host and isolated resource root; Desktop receives embedded HTML and JSON only. No per-batch Mac app copy.',
    sourcePolicy='No source map, archive or installation changes; original shadow, logic, animation timing, collision and budgets preserved.',
    integration='LOCAL_TASK_COMMITS_ONLY_NO_MAIN_MERGE_NO_PUSH')
file = Path('docs/m2-4-urban-linked-civilians-batch52-20261016.json')
with file.open('x') as stream:
    stream.write(json.dumps(document, indent=2) + '\n')
with (root / 'technical-checkpoint.json').open('x') as stream:
    stream.write(json.dumps(dict(status=document['status'], document=record(file), review=document['review'],
        m24Complete=False), indent=2) + '\n')
print(json.dumps(dict(status=document['status'], families=8, newArt=8, selectedFiles=1619)))
