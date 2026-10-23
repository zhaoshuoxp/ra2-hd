"""Close technical evidence without turning inherited art or pending review into acceptance."""
from pathlib import Path
import subprocess
from newurban_batch94_io import ROOT, pin, read, write

export = read(ROOT / 'export-and-preservation-v5.json')
stage = read(ROOT / 'active-stage-v2.json')
inventory = read(ROOT / 'inventory-reconciliation-v1.json')
audit = read(ROOT / 'static-audit-v3.json')
review_file = ROOT / 'review-v1/M2.4-NewUrban-Secondary-Terrain-Batch94-Embedded.html'
review = read(ROOT / 'review-v1/review-metadata-v1.json')
assert review['html'] == pin(review_file)
paths, native, world, prepared = [], [], {}, {}
for density, version in [(2, 1), (4, 2)]:
    file = ROOT / f'native-{density}x-v{version}/report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['selectedTerrainRevision'] == export['candidate']['revision']
    assert len(report['sourcePaths']) == len({p['member'] for p in report['sourcePaths']}) == 111
    assert {p['member'] for p in report['sourcePaths']} == {row['member'] for row in export['records']}
    for row in report['sourcePaths']:
        source, = [s for s in export['records'] if s['member'] == row['member']]
        assert row['sha256'] == source['sourceSha256'] and row['group'] == source['group']
        assert row['mapId'] in source['maps'] and row['density'] == density
    for case in report['maps']:
        assert case['simulation']['tick'] >= case['launch']['tick'] + 12
        assert case['simulation']['glError'] == 0 and case['simulation']['status'] == 1
        assert case['launch']['mode'] == 0 and case['launch']['options']['gameMode'] == 1
        assert case['launch']['options']['credits'] == 10000
        assert case['allocation']['total'] <= case['allocation']['budget'] == (512 if density == 2 else 1280) * 1024 ** 2
    world[str(density)] = max(case['allocation']['total'] for case in report['maps'])
    prepared[str(density)] = max(report['prepared']['cache']['peakBytes'],
        *(case['allocation']['prepared']['peakBytes'] for case in report['maps']))
    assert prepared[str(density)] <= 128 * 1024 ** 2
    if density == 4:
        assert report['originalState']['terrain']['worldChargeBytes'] == 0
        assert report['originalState']['environment']['worldChargeBytes'] == 0
        assert report['crossTheater']['terrain']['disposed'] and report['crossTheater']['environment']['disposed']
        assert report['crossTheater']['terrain']['worldChargeBytes'] == report['crossTheater']['environment']['worldChargeBytes'] == 0
    paths.extend(report['sourcePaths'])
    native.append(pin(file))
assert len(paths) == 222 and inventory['remainingAuthoredGaps'] == 73
assert audit['counts'] == dict(exactAcceptedDensitySlots=1052, densitySlots=1216,
    originalCompatibilityDensitySlots=142, boundedTargetCoverageDensitySlots=4, adaptedGrassDensitySlots=18)
tests = ROOT / 'targeted-tests-v2.log'
assert '7 pass' in tests.read_text() and '0 fail' in tests.read_text() and '773 expect() calls' in tests.read_text()
diff = subprocess.check_output(['git', 'diff', '6d4d2097630c1ebe592f12abd573a7ecb48ff334',
    stage['runtimeSourceHead'], '--', 'src/engine/renderable/entity/map/TerrainHd.ts',
    'src/engine/renderable/entity/map/terrainHdContract.ts'])
with (ROOT / 'shared-loader-diff-v1.patch').open('xb') as stream:
    stream.write(diff)
write(ROOT / 'coverage-and-native-closure-v1.json', dict(
    status='PASS_111_SOURCE_MEMBERS_222_NATIVE_DENSITY_PATHS_AND_EXACT_PRIOR_FILTER_GUARDS',
    candidate=export['candidate'], runtimeSourceCommit=stage['runtimeSourceHead'], finalStage=pin(ROOT / 'active-stage-v2.json'),
    newCompleteSourceMembers=111, newCompleteLoadFamilies=45, selectedLoadGroups=92,
    sourceDensitySlots=1216, authoredDensitySlots=1074, exactAcceptedDensitySlots=1052,
    boundedTargetCoverageDensitySlots=4, adaptedGrassDensitySlots=18, originalCompatibilityDensitySlots=142,
    priorMemberGroupsRetained=47, priorDensitySamplesAndFilterGuardsExact=2372,
    losslessPrior4xRawBytesSaved=61330432, nativeReports=native, sourcePaths=paths,
    worldPeakBytes=world, preparedPeakBytes=prepared, budgets=dict(world2x=512 * 1024 ** 2,
        world4x=1280 * 1024 ** 2, preparedCpu=128 * 1024 ** 2, ui=16 * 1024 ** 2),
    preparedRegistration=stage['preparedRegistration'],
    preparedDependencies='Existing 453 members and 1205 pages remain source-identical. Terrain atlases are separately registered raw resources; no prepared index version or dependency hash is spoofed.',
    staticAudit=pin(ROOT / 'static-audit-v3.json'), filterGuardAudit=pin(ROOT / 'inherited-filter-guards-v1.json'),
    compactManifest=pin(ROOT / 'compact-manifest-proof-v1.json'), sharedLoaderDiff=pin(ROOT / 'shared-loader-diff-v1.patch'),
    tests=dict(passCount=7, assertions=773, log=pin(tests)), typecheck=pin(ROOT / 'typecheck-v1.log'),
    buildIdentity=pin(Path(stage['build']) / 'identity.json'), inventory=pin(ROOT / 'inventory-reconciliation-v1.json'),
    remainingAuthoredNewUrbanGroups=73, remainingByKind=inventory['remainingByKind'], conditionalDependencyGroups=22,
    deferredOriginalSlopes=inventory['deferredSlopes'], review=pin(review_file),
    reviewMetadata=pin(ROOT / 'review-v1/review-metadata-v1.json'), selectedNewMothers=0,
    inheritedArtwork='ACCEPTED', changedVisualStatus='PENDING_USER_CHANGED_GRASS_AND_NATIVE_CONTEXT_REVIEW',
    windows='NOT_RUN', mainIntegration='NOT_PERFORMED', m24Complete=False))
print(dict(status='PASS_TECHNICAL_CLOSURE', worldPeakBytes=world, preparedPeakBytes=prepared, members=111, paths=222))
