"""Close technical evidence while leaving changed visual acceptance explicit."""
import json
from pathlib import Path
from newurban_batch96_io import PRIOR, ROOT, pin, read, write

export = read(ROOT / 'export-v2.json')
audit = read(ROOT / 'static-audit-v2.json')
inventory = read(ROOT / 'inventory-reconciliation-v1.json')
stage = read(ROOT / 'active-stage-v1.json')
review = read(ROOT / 'review-v2/review-metadata-v1.json')
assert read('.local/terrain-newurban-selection.json') == export['candidate']
assert review['html'] == pin(ROOT / 'review-v2/M2.4-NewUrban-Final-Terrain-Batch96-Embedded.html')
paths, reports, world, prepared = [], [], {}, {}
for density in [2, 4]:
    file = ROOT / f'native-{density}x-v1/report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['selectedTerrainRevision'] == export['candidate']['revision']
    assert len(report['sourcePaths']) == len({p['member'] for p in report['sourcePaths']}) == 21
    assert {p['member'] for p in report['sourcePaths']} == {r['member'] for r in export['records']}
    for path in report['sourcePaths']:
        row, = [r for r in export['records'] if r['member'] == path['member']]
        assert path['sha256'] == row['sourceSha256'] and path['group'] == row['group']
        assert path['mapId'] in row['maps'] and path['density'] == density
    for case in report['maps']:
        assert case['launch']['terrain']['density'] == density
        assert all(g['status'] == 'PUBLISHED' for g in case['launch']['terrain']['groups'])
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
        for key in ['terrain', 'environment']:
            assert report['originalState'][key]['worldChargeBytes'] == 0
            for transition in ['originalRelease', 'originalArchitectureRelease', 'crossTheater', 'reentry']:
                assert report[transition][key]['disposed'] and report[transition][key]['worldChargeBytes'] == 0
        assert report['crossTheater']['currentTerrain']['density'] == 4
        assert report['reentry']['currentTerrain']['density'] == 4
        assert report['reentryAllocation']['total'] <= 1280 * 1024 ** 2
    paths.extend(report['sourcePaths']); reports.append(pin(file))
assert len(paths) == 42 and inventory['remainingAuthoredGaps'] == 16
assert audit['counts'] == dict(authoredDensitySlots=414, densitySlots=494,
    unreferencedOriginalCompatibilityDensitySlots=80)
tests = ROOT / 'loader-tests-v2.log'
assert '4 pass' in tests.read_text() and '0 fail' in tests.read_text() and '341 expect() calls' in tests.read_text()
assert stage['preparedRegistration']['members'] == 453 and stage['preparedRegistration']['pages'] == 1205
prior = read(PRIOR / 'coverage-and-native-closure-v2.json')
assert stage['preparedRegistration']['index'] == prior['preparedRegistration']['index']
closure = dict(status='PASS_21_COMPLETE_SOURCE_MEMBERS_42_NATIVE_PATHS_AND_ALL_PRIOR_ATLASES_EXACT',
    candidate=export['candidate'], runtimeSourceCommit=stage['runtimeSourceHead'], finalStage=pin(ROOT / 'active-stage-v1.json'),
    newCompleteSourceMembers=21, newCompleteLoadFamilies=12, selectedLoadGroups=110,
    sourceSlots=247, authoredPositivePointerSlots=207, originalUnreferencedCompatibilitySlots=40,
    authoredDensitySlots=414, originalUnreferencedCompatibilityDensitySlots=80,
    priorGroupsExact=98, priorAtlasFilesExact=196, priorDensitySamplesAndFilterGuardsExact=3890,
    selectedNewMothers=2, authoring=pin(ROOT / 'authoring-v6.json'), motherPrompts=pin(ROOT / 'mother-jobs-v1.json'),
    new4xRawBytes=22381632, nativeReports=reports, sourcePaths=paths, worldPeakBytes=world, preparedPeakBytes=prepared,
    budgets=dict(world2x=512 * 1024 ** 2, world4x=1280 * 1024 ** 2, preparedCpu=128 * 1024 ** 2, ui=16 * 1024 ** 2),
    preparedRegistration=stage['preparedRegistration'],
    preparedDependencies='The actual 453 prepared actor members and 1205 pages retain unchanged inputs. New raw terrain atlases use their independent registration; no stale prepared cache is relabeled.',
    staticAudit=pin(ROOT / 'static-audit-v2.json'), targetNativeMetadata=pin(ROOT / 'target-native-metadata-v2.json'),
    tests=dict(passCount=4, assertions=341, log=pin(tests)), typecheck=pin(ROOT / 'typecheck-v1.log'),
    buildIdentity=pin(Path(stage['build']) / 'identity.json'), inventory=pin(ROOT / 'inventory-reconciliation-v1.json'),
    priorBatchAcceptance=pin(PRIOR / 'user-acceptance-20261021.json'), remainingAuthoredNewUrbanGroups=16,
    remainingByKind=inventory['remainingByKind'], conditionalDependencyGroups=len(inventory['unresolvedDependencyGroups']),
    deferredOriginalSlopes=[], review=review['html'], reviewMetadata=pin(ROOT / 'review-v2/review-metadata-v1.json'),
    originalRgbUsedAsNewDetail=False, applicationChanges=['desktop/terrain-theater-hd-contracts.json'],
    sharedRuntimeCodeChanged=False, inheritedArtwork='ACCEPTED', changedVisualStatus='PENDING_CONSOLIDATED_USER_REVIEW',
    windows='NOT_RUN', mainIntegration='NOT_PERFORMED', m24Complete=False)
write(ROOT / 'coverage-and-native-closure-v1.json', closure)
document = {key: value for key, value in closure.items() if key != 'sourcePaths'}
document['technicalClosure'] = pin(ROOT / 'coverage-and-native-closure-v1.json')
Path('docs/m2-4-newurban-final-terrain-batch96-20261021.json').write_text(json.dumps(document, indent=2) + '\n')
print(dict(status=closure['status'], worldPeakBytes=world, preparedPeakBytes=prepared,
    review=review['html'], remainingByKind=inventory['remainingByKind']))
