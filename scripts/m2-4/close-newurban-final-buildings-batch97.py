"""Close bounded technical evidence while leaving visual and full-milestone gates explicit."""
import hashlib
import json
import subprocess
from pathlib import Path
from newurban_batch89_io import pin, read, write
from newurban_batch97_materials import ROOT

exported = read(ROOT / 'export-and-preservation-v4.json')
stage = read(ROOT / 'active-stage-v1.json')
reports = {2: ROOT / 'native-2x-v2/report.json', 4: ROOT / 'native-4x-v1/report.json'}
world, prepared, rows = {}, {}, []
for density, file in reports.items():
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['candidate'] == exported['candidate']
    assert len(report['sourcePaths']) == 14 and len({r['member'] for r in report['sourcePaths']}) == 14
    assert len(report['maps']) == 3
    charges, caches = [], []
    for case in report['maps']:
        assert case['launch']['type'] == 0 and case['launch']['options']['gameMode'] == 1
        assert case['launch']['options']['credits'] == 10000
        for allocation in [case['allocationBefore'], case['allocationAfter']]:
            assert allocation['glError'] == 0
            assert all(g['status'] == 'PUBLISHED' for g in allocation['terrain']['groups'])
            assert all(f['status'] == 'PUBLISHED_COMPLETE_FAMILY' for f in allocation['environment']['families'].values())
            assert allocation['total'] <= (512 if density == 2 else 1280) * 1024 ** 2
            charges.append(allocation['total']); caches.append(allocation['prepared']['peakBytes'])
        assert case['nativeStates']['status'] == 'PASS_SEQUENTIAL_NATIVE_BUILDING_ACTOR_AND_ANIMATION_CASES'
    assert report['secretLab']['captured']['owned'] and report['secretLab']['captured']['engineerConsumed']
    assert report['secretLab']['damaged']['frame'] == 1 and report['secretLab']['repaired']['frame'] == 0
    assert len(report['linkedBuildingCycles']) == 2
    for cycle in report['linkedBuildingCycles']:
        assert cycle['status'] == 'PASS_ALL_ORIGINAL_PHASES_AND_NATIVE_LOOP_RETURN'
        assert cycle['expectedPhases'] == list(range(16))
        assert cycle['unusedSourcePhases'] == list(range(16, 32))
    assert not report['prepared']['fallbacks']
    assert report['reentry']['terrain']['disposed'] and report['crossTheater']['environment']['disposed']
    world[str(density)] = max(charges)
    prepared[str(density)] = max(caches)
    rows.append(dict(density=density, report=pin(file), sourcePaths=14, officialOriginalMaps=3,
        nativeStates='PASS', labCaptureRepairAndBothLoops='PASS', originalControl=density == 4,
        worldPeakBytes=max(charges), preparedPeakBytes=max(caches)))
recovery = ROOT / 'gpu-recovery-4x-v2/report.json'
assert read(recovery)['terrainSourceRecovery']['status'] == 'PASS_ACTUAL_UPLOAD_REUPLOAD_AND_ISOLATED_CONTEXT_RESTORE'
assert read(reports[2])['terrainSourceRecovery']['status'] == 'PASS_ACTUAL_UPLOAD_REUPLOAD_AND_ISOLATED_CONTEXT_RESTORE'

jobs = read(ROOT / 'mother-jobs-v3.json')['jobs']
generations = []
for job in jobs:
    receipt_file = ROOT / (job['id'] + '-mother-receipt-v1.json')
    receipt = read(receipt_file)
    mother = Path(job['destination'])
    assert pin(mother)['sha256'] == receipt['sha256']
    refs = [pin(Path(file)) for file in receipt['request']['referenced_image_paths']]
    generations.append(dict(id=job['id'], mode='BUILT_IN_IMAGEGEN', receipt=pin(receipt_file),
        exactInvocation=receipt['request'], referencePins=refs, retainedMother=pin(mother)))
write(ROOT / 'retained-generation-provenance-v1.json', dict(status='PASS_21_RETAINED_MOTHERS_EXACT_REQUESTS_REFERENCES_AND_HASHES',
    jobs=generations, allSourceNativeHashesRetained=True, originalRgbUsedAsNewDetail=False))

old = subprocess.check_output(['git', 'show', '0e82175d:src/engine/renderable/entity/map/TerrainHd.ts'])
backup = ROOT / 'baseline-terrain-loader.ts'
with backup.open('xb') as stream: stream.write(old)
assert hashlib.sha256(old).hexdigest() == '31b067845d1ec3cbb8103e509e04270e740c59fda0ed05091f143b2afabbcfa8'
review = read(ROOT / 'review-v1/review-metadata-v1.json')
changes = subprocess.check_output(['git', 'diff', '0e82175d', stage['runtimeSourceHead'], '--name-only', '--', 'src', 'desktop'], text=True).splitlines()
assert changes == ['desktop/environment-newurban-hd-contract.json',
    'src/engine/renderable/entity/map/TerrainHd.ts', 'src/engine/renderable/entity/map/retainedTerrainSource.ts']
closure = dict(status='PASS_13_BUILDING_FAMILIES_28_DENSITY_SOURCE_PATHS_NATIVE_STATES_AND_LOSSLESS_BACKING',
    candidate=exported['candidate'], runtimeSourceCommit=stage['runtimeSourceHead'],
    stage=pin(ROOT / 'active-stage-v1.json'), export=pin(ROOT / 'export-and-preservation-v4.json'),
    staticAudit=pin(ROOT / 'static-audit-v4.json'), priorBatchAcceptance=pin(Path('.artifacts/m2-4/newurban-final-terrain-reuse-batch96-20261021/user-acceptance-20261021.json')),
    completeSelectedShpFamilies=13, sourceMembers=14, sourceDensitySlots=164,
    originalUnusedFlagDensitySlots=32, separateOriginalShadowSlots=exported['originalSeparateShadowSlots'],
    selectedMothers=21, inheritedSnowStructuralEdits=4, unchangedPriorFamilies=208,
    exactPriorPayloads=len(exported['preservedPayloadHashes']), native=rows,
    worldPeakBytes=world, preparedPeakBytes=prepared,
    budgets=dict(world2x=512 * 1024 ** 2, world4x=1280 * 1024 ** 2, preparedCpu=128 * 1024 ** 2, ui=16 * 1024 ** 2),
    sourceStorage='Only NewUrban terrain CPU backing uses lossless repeated-RGBA runs when smaller. GPU RGBA, source atlases, dimensions, UVs, filters, shaders and terrain geometry are unchanged. Decoded upload plus retained encoded data is included in transient source checks. All 220 selected density atlases round-trip byte exactly.',
    gpuRecovery2x=pin(reports[2]), gpuRecovery4x=pin(recovery),
    preparedRegistration=stage['preparedRegistration'],
    preparedInputs='The new environment families use their independent PNG reader and worker preparation. All 453 existing prepared actor members / 1205 pages keep unchanged actual inputs and the same original index; no new manifest is mislabeled as old prepared data.',
    testPasses=34, testAssertions=1012, tests=[pin(ROOT / 'loader-tests-v4.log'), pin(ROOT / 'terrain-retention-tests-v1.log')],
    typecheck=pin(ROOT / 'typecheck-v1.log'), build=pin(Path('.artifacts/m2-4/build-newurban-final-buildings-batch97-v1/identity.json')),
    applicationDifferences=changes, terrainLoaderRecovery=pin(backup),
    inventory=pin(ROOT / 'inventory-reconciliation-v1.json'), remainingAuthoredNewUrbanSources=3,
    remainingIdentities=['CIV1', 'DNOA', 'GAFWLL'], conditionalScannerRows=22,
    review=review['review'], reviewMetadata=pin(ROOT / 'review-v1/review-metadata-v1.json'),
    imageInstances=review['imageInstances'], nativeVideos=len(review['videos']),
    productionFailures=[
        dict(attempt='First native cloth-reuse audit', result='A donor has no ownership pixels in one slot; the diagnostic assumed every flag was remappable. Retain the partial v1 input extraction. The v2 audit preserves empty/non-remappable cases, and the target is a dedicated fixed yellow motif.'),
        dict(attempt='First building export', result='Internal visual inspection rejected native index-12 architectural cells pasted over LAX HD material. The final continuous export keeps original separate shadows and native ownership without old dark-cell stamping.'),
        dict(attempt='First pole-freeze export', result='The original mast uses several fixed-palette indices rather than guessed dark indices 5/7. Final registration measures its invariant source-canvas columns, with one shared authored pole patch for all 16 phases.'),
        dict(attempt='First isolated context recovery probe', result='Restoring the unattached probe in the loss-event microtask timed out. No game-source or resource change was needed: the corrected tool attaches its probe and waits for Chromium event bookkeeping; both density checks now pass. The failed receipt remains preserved.')],
    browser='NOT_RUN_RETAINED_LOCAL_PROTOCOL_RESTRICTION', visual='PENDING_CONSOLIDATED_USER_REVIEW',
    windows='NOT_RUN', mainIntegration='NOT_PERFORMED', m24Complete=False)
write(ROOT / 'coverage-and-native-closure-v1.json', closure)
write(Path('docs/m2-4-newurban-final-buildings-batch97-20261021.json'), closure)
print(dict(status=closure['status'], worldPeakBytes=world, preparedPeakBytes=prepared, review=review['review']))
