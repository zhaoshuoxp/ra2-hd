"""Close incremental native evidence while keeping new visual acceptance separate."""
from pathlib import Path
from newurban_batch95_io import ROOT, pin, read, write

export = read(ROOT / 'export-and-preservation-v4.json')
audit = read(ROOT / 'static-audit-v3.json')
inventory = read(ROOT / 'inventory-reconciliation-v1.json')
stage = read(ROOT / 'active-stage-v1.json')
review = read(ROOT / 'review-v3/review-metadata-v1.json')
assert read('.local/terrain-newurban-selection.json') == export['candidate']
assert review['html'] == pin(ROOT / 'review-v3/M2.4-NewUrban-Extended-Terrain-Batch95-Embedded.html')
paths, reports, world, prepared = [], [], {}, {}
for density in [2, 4]:
    file = ROOT / f'native-{density}x-v1/report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['selectedTerrainRevision'] == export['candidate']['revision']
    assert len(report['sourcePaths']) == len({p['member'] for p in report['sourcePaths']}) == 36
    assert {p['member'] for p in report['sourcePaths']} == {r['member'] for r in export['records']}
    for path in report['sourcePaths']:
        source, = [r for r in export['records'] if r['member'] == path['member']]
        assert path['sha256'] == source['sourceSha256'] and path['group'] == source['group']
        assert path['mapId'] in source['maps'] and path['density'] == density
    for case in report['maps']:
        assert case['launch']['terrain']['density'] == density
        assert all(g['status'] == 'PUBLISHED' for g in case['launch']['terrain']['groups'])
        assert case['simulation']['tick'] >= case['launch']['tick'] + 12
        assert case['simulation']['glError'] == 0 and case['simulation']['status'] == 1
        assert case['launch']['mode'] == 0 and case['launch']['options']['gameMode'] == 1
        assert case['launch']['options']['credits'] == 10000
        assert case['allocation']['total'] <= case['allocation']['budget'] == (512 if density == 2 else 1280) * 1024**2
    world[str(density)] = max(m['allocation']['total'] for m in report['maps'])
    prepared[str(density)] = max(report['prepared']['cache']['peakBytes'],
        *(m['allocation']['prepared']['peakBytes'] for m in report['maps']))
    assert prepared[str(density)] <= 128 * 1024**2
    if density == 4:
        assert report['originalState']['terrain']['worldChargeBytes'] == 0
        assert report['originalState']['environment']['worldChargeBytes'] == 0
        for key in ['terrain', 'environment']:
            assert report['crossTheater'][key]['disposed']
            assert report['crossTheater'][key]['worldChargeBytes'] == 0
    paths.extend(report['sourcePaths'])
    reports.append(pin(file))
assert len(paths) == 72 and inventory['remainingAuthoredGaps'] == 37
assert audit['counts'] == dict(authoredDensitySlots=266, densitySlots=302,
    originalUnreferencedCompatibilityDensitySlots=36)
tests = ROOT / 'targeted-tests-v1.log'
assert '4 pass' in tests.read_text() and '0 fail' in tests.read_text()
assert '392 expect() calls' in tests.read_text()
assert stage['preparedRegistration']['members'] == 453 and stage['preparedRegistration']['pages'] == 1205
closure = dict(status='PASS_36_SOURCE_MEMBERS_72_NATIVE_PATHS_AND_EXACT_INHERITED_FILTER_GUARDS',
    candidate=export['candidate'], runtimeSourceCommit=stage['runtimeSourceHead'], finalStage=pin(ROOT / 'active-stage-v1.json'),
    newCompleteSourceMembers=36, newCompleteLoadFamilies=6, selectedLoadGroups=98,
    scope=dict(extendedNaturalCliffs=33, naturalWaterCliff=1, baseballField=1, secondaryRoadCurve=1),
    sourceDensitySlots=302, authoredDensitySlots=266, originalUnreferencedCompatibilityDensitySlots=36,
    priorGroupsRetained=92, priorDensitySamplesAndFilterGuardsExact=3588,
    losslessPrior4xRawBytesSaved=29748480, new4xRawBytes=27413888,
    nativeReports=reports, sourcePaths=paths, worldPeakBytes=world, preparedPeakBytes=prepared,
    budgets=dict(world2x=512 * 1024**2, world4x=1280 * 1024**2, preparedCpu=128 * 1024**2, ui=16 * 1024**2),
    preparedRegistration=stage['preparedRegistration'],
    preparedDependencies='All 453 prepared members and 1205 pages have unchanged actual source inputs. Terrain atlases are separately registered raw resources. No stale cache hash or version is substituted.',
    staticAudit=pin(ROOT / 'static-audit-v3.json'), targetNativeMetadata=pin(ROOT / 'target-native-metadata-v3.json'),
    filterGuards=pin(ROOT / 'inherited-filter-guards-v3.json'),
    waterSourceVisibility=pin(ROOT / 'water-source-visibility-v1.json'),
    tests=dict(passCount=4, assertions=392, log=pin(tests)), typecheck=pin(ROOT / 'typecheck-v1.log'),
    buildIdentity=pin(Path(stage['build']) / 'identity.json'), inventory=pin(ROOT / 'inventory-reconciliation-v1.json'),
    priorBatchAcceptance=pin('.artifacts/m2-4/newurban-secondary-terrain-reuse-batch94-20261021/user-acceptance-20261021.json'),
    remainingAuthoredNewUrbanGroups=37, remainingByKind=inventory['remainingByKind'],
    conditionalDependencyGroups=len(inventory['unresolvedDependencyGroups']),
    deferredOriginalSlopes=inventory['deferredSlopes'], slopeFollowup=pin(ROOT / 'wide-road-slope-followup-v1.json'),
    review=review['html'], reviewMetadata=pin(ROOT / 'review-v3/review-metadata-v1.json'),
    selectedNewMothers=0, originalRgbUsedAsHdDetail=False,
    applicationChanges=['desktop/terrain-theater-hd-contracts.json'], sharedRuntimeCodeChanged=False,
    inheritedArtwork='ACCEPTED', changedVisualStatus='PENDING_USER_NEW_MATERIAL_CAP_AND_NATIVE_CONTEXT_REVIEW',
    windows='NOT_RUN', mainIntegration='NOT_PERFORMED', m24Complete=False)
write(ROOT / 'coverage-and-native-closure-v2.json', closure)
document = {k:v for k,v in closure.items() if k != 'sourcePaths'}
document['technicalClosure'] = pin(ROOT / 'coverage-and-native-closure-v2.json')
Path('docs/m2-4-newurban-extended-terrain-batch95-20261021.json').write_text(
    __import__('json').dumps(document, indent=2) + '\n')
print(dict(status=closure['status'], worldPeakBytes=world, preparedPeakBytes=prepared,
    review=review['html'], remainingByKind=inventory['remainingByKind']))
