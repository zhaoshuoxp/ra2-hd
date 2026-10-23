"""Record the final copied review without granting pending user visual acceptance."""
import hashlib
import json
from pathlib import Path

root = Path.cwd()
base = root / '.artifacts/m2-2'


def read(file):
    return json.loads(file.read_text())


def pin(file):
    return dict(path=str(file.relative_to(root)), sha256=hashlib.sha256(file.read_bytes()).hexdigest())


file = root / 'docs/m2-2-acceptance.json'
record = read(file)
copy = read(base / 'copied-complete-runtime-v4.json')
package_file = Path(copy['packageReceipt'])
package = read(package_file)
verification = read(base / 'copied-complete-verification-v4.json')
parity = read(base / 'copied-complete-shared-parity-v4.json')
review_file = base / 'combined-review-v2/review.json'
review = read(review_file)
qa_file = base / 'combined-offline-qa-v2/qa.json'
qa = read(qa_file)
assert verification['status'].startswith('PASS') and parity['status'] == 'PASS'
assert qa['status'].startswith('PASS') and not qa['network'] and not qa['errors']
assert 'valid on disk' in (base / 'copied-complete-signature-v4.log').read_text()
delivered = Path('/Users/Aone/RA2remaster/deliveries/RA2-HD-M2.2-Combined-Offline-R2-20261007/M2.2-Combined-Offline.html')
assert hashlib.sha256(delivered.read_bytes()).hexdigest() == review['reviewSha256']
native = {}
for name in ['copied-complete-actions-2x-v4', 'copied-complete-states-4x-v4',
             'copied-complete-ra2-2x-v4', 'copied-complete-control-2x-v4', 'copied-missing-environment-2x-v4']:
    path = base / name / 'report.json'
    report = read(path)
    assert report['status'].startswith('PASS')
    assert report['graphics']['glError'] == 0
    assert report['combinedWorldAllocation']['total'] <= report['combinedWorldAllocation']['limit']
    native[name] = dict(**pin(path), status=report['status'], stages=len(report['stages']),
        clips=len(report['clips']), selectedMap=report['selectedMap'], graphics=report['graphics'],
        worldAllocation=report['combinedWorldAllocation'], environmentDensity=report['environment']['density'],
        encounteredFamilies=len(report['environment']['families']),
        actualBatchedHdBindings=sum(bool(row.get('batchedHd')) for row in report['placed']))
failed = []
for directory in sorted(base.iterdir()):
    if not directory.is_dir() or not directory.name.startswith(('native', 'copied', 'combined-offline')):
        continue
    for name in ['report.json', 'qa.json']:
        path = directory / name
        if path.exists():
            report = read(path)
            if report.get('status') == 'FAIL':
                failed.append(dict(**pin(path), status='FAIL_RETAINED',
                                   failure=report.get('failure', '').splitlines()[0]))
record.update(schema='m2-2-acceptance-v2', status='FULL_PRODUCTION_REVIEW_READY_USER_ACCEPTANCE_PENDING',
    productionStatus='SELECTED_FULL_PRODUCTION_EXPORTED_COPIED_NATIVE_REVIEW_PASS_WITH_DISCLOSED_LIMITS',
    combinedNativeStates='PASS_SELECTED_NATIVE_CATEGORY_CASES', combinedUserAcceptance='PENDING_COMBINED_VISUAL_REVIEW',
    wholeMapComplete=False, newlyPublishedRuntimeFamilies=110,
    newlyPublishedRuntimeFamilyBoundary='98 canonical SHP families and 12 new neutral VXL families; five new TMP groups are counted separately.',
    runtimeSourceHead=copy['runtimeSourceHead'], frozenBuild=pin(base / 'build-complete-frozen-v6/identity.json'),
    mainPromotion='NOT_PERFORMED_PENDING_COMBINED_USER_VISUAL_ACCEPTANCE',
    next='Review the combined 4X map and native clips. After acceptance, recheck main and promote under the existing authorization.',
    performance=pin(root / 'docs/m2-2-performance.json'),
    technicalAcceptance='PASS_REQUIRED_MAC_CHECKS_WITH_LOADING_AND_2X_RESIDENCY_LIMITS_DISCLOSED',
    userAcceptance='PENDING', remotePush='NOT_PERFORMED', cleanup='NOT_PERFORMED')
record['artDirections']['ground-water'] = 'APPROVED_GROUND_SEA_CORRECTION_RESTORED_PREVIOUS_GRASS_AND_WATERFALL'
record['production']['terrain']['selection'] = read(root / '.local/terrain-selection.json')
record['production']['environment']['selection'] = read(root / '.local/environment-selection.json')
record['production']['technicalEvidence'] = {
    str(path.relative_to(root)): dict(**pin(path), status=read(path)['status']) for path in [
        base / 'authoring-tmp-v2/temperate-m2-2-environment-v3/validation.json',
        base / 'shp-verification-complete-v2.json', base / 'vxl-verification-v1.json',
        base / 'registration-correction-v1/pack-parity.json',
        base / 'registration-correction-v1/unchanged-closure.json']}
record['production']['registrationCorrection'] = pin(base / 'registration-correction-v1/selection.json')
record['production']['wholeMapUserAcceptance'] = 'PENDING_COMBINED_REVIEW'
record['production']['mainPromotion'] = 'PENDING_USER_VISUAL_ACCEPTANCE'
record['nativeEvidence'] = native
record['evidenceReuse'] = dict(acceptedM1AndM2_1='Accepted resources and closed artwork matrices reused without redraw or full rerun.',
    preparedContract=package['preparedContract'], preparedRegistration=package['preparedRegistration'],
    corruptFamily=pin(base / 'copied-corrupt-environment-2x-v1/report.json'),
    corruptFamilyBoundary='Unchanged CAGAS01 pages and admission path; full body/rubble Original fallback, peers HD.',
    baselineAndOriginalScenes=['copied-baseline-scenes-v1', 'copied-original-scenes-v1'],
    priorCompleteTests='.artifacts/m2-2/complete-focused-tests-v1.log',
    currentBatchingTests='.artifacts/m2-2/registration-batching-tests-v1.log',
    sceneMatrixTests='.artifacts/m2-2/registration-scene-matrix-tests-v1.log',
    currentTypecheck='.artifacts/m2-2/registration-batching-typecheck-v1.log')
record['delivery'] = dict(status='PASS_COPIED_MAC_ARM64_NATIVE_AND_RESOURCE_CHECKS',
    **{key: value for key, value in copy.items() if key != 'packageReceipt'},
    launcher=str(Path(copy['app']).parent / 'Launch-Isolated-Review.command'),
    profile=str(Path(copy['app']).parent / 'M2.2-Review-Profile'),
    packageReceipt=pin(package_file), copiedVerification=pin(base / 'copied-complete-verification-v4.json'),
    sharedParity=pin(base / 'copied-complete-shared-parity-v4.json'),
    signature=pin(base / 'copied-complete-signature-v4.log'),
    regularFiles=verification['regularFilesVerified'], symlinks=verification['linksVerified'],
    exactSharedPayloads=parity['sharedPayloadFilesExact'], uiRevision=package['uiRevision'],
    uiManifestSha256=package['uiManifestSha256'],
    sourceDirtyAtPackaging=package['sourceDirty'],
    sourceBoundary='Only the authoring collector changed after the clean frozen runtime build; later helper/docs commits do not change this packaged runtime.')
record['combinedOfflineReview'] = dict(status=qa['status'], file=str(delivered), sha256=review['reviewSha256'],
    bytes=review['bytes'], counts=review['counts'], fullSceneComparisons=36,
    imageChecks=len(qa['images']), clipPlaybackChecks=len(qa['clips']), networkRequests=0,
    sourceReceipt=pin(review_file), qa=pin(qa_file), requiresServer=False, requiresSiblingMedia=False,
    pixels='Exact copied-runtime captures/exports; lossless compression and exact native canvas crop.', userAcceptance='PENDING')
record['limitations'] = [
    'Combined whole-map visual acceptance remains pending; technical checks and direction approval do not grant it.',
    'Fixed 2X world residency causes E1/INIT whole-family Original fallback in the six-actor mixed fixture; 4X retains HD. No budget increase or M1 redraw.',
    'Complete-map loading costs 6.887/11.123 seconds at 2X/4X versus baseline 4.418/5.318 seconds in these observations.',
    'Native fixtures use revealed shroud, legal controlled actors and suspended bot thinking; no every-object/every-action or unconstrained-match claim.',
    'Windows performance and physical input remain deferred, not PASS.']
record['retainedFailedReports'] = failed
record['supersededCandidates'] = dict(R1='Technical passes retained; internally rejected for wrong water material and tree crop registration.',
    R2='Copied failure: stale desktop terrain selection pin omitted new registration.',
    R3='Intermediate registration pass; native mixed-shore material defects corrected by R4.',
    R4='Current reviewed technical candidate; combined user visual acceptance pending.')
record['productionStateResolution'] = pin(root / 'docs/m2-2-production-state-resolution.json')
record['transferManifestSha256'] = pin(root / 'docs/m2-2-resource-transfer.json')['sha256']
record['provenanceBoundary'] = 'Early direction provenance is retained; final selected recipes, prompt/master/native hashes and repair history are in the pinned additive authoring inventory.'
file.write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(dict(status=record['status'], runtimeSourceHead=record['runtimeSourceHead'],
                     offline=record['combinedOfflineReview']['status'], userAcceptance='PENDING',
                     failedReportsRetained=len(failed))))
