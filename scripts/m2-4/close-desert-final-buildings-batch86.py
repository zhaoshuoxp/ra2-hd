"""Close four complete Desert groups using scoped native state, motion and lifecycle evidence."""
import hashlib
import json
from pathlib import Path

ROOT = Path('.artifacts/m2-4/desert-final-buildings-batch86-20261020')
NATIVE = Path('.artifacts/m2-4/desert-final-buildings-native-batch86-v1')
ART = Path('.artifacts/m2-4/desert-final-buildings-authoring-batch86-v1')
PRIOR = Path('.artifacts/m2-4/desert-morocco-batch85-20261020/coverage-and-native-closure-v1.json')
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
pin = lambda path: dict(file=str(path), sha256=sha(path), bytes=path.stat().st_size)
patch = read(NATIVE / 'contract.json')
current = read(Path('desktop/environment-desert-hd-contract.json'))
pack_root = Path('.local/environment-packs') / current['selectedPack']['revision']
assert sha(pack_root / 'manifest.json') == current['selectedPack']['sha256']
pack = read(pack_root / 'manifest.json')
sources = {source['member']: source for source in read(NATIVE / 'source.json')['sources']}
verified = read(ART / 'verification-v2.json')
assert verified['status'] == 'PASS' and verified['counts']['families'] == 4
assert verified['counts']['members'] == 6 and verified['counts']['densityFrames'] == 98
assert read(ART / 'temporal-and-reuse-verification-v1.json')['status'] == 'PASS_ACCEPTED_REUSE_AND_NATIVE_AIRPORT_TEMPORAL_INVARIANTS'
cases, reports, peaks, cpu = [], [], {}, []
map_names = {'sahara': ('saharami.map', {'CAAIRP', 'CAPARK06'}),
             'sedona': ('sedonapass.map', {'CAHSE06'}), 'egypt': ('tourofegypt.map', {'CAEGYP02'})}
for label, (map_name, identities) in map_names.items():
    for density in [2, 4]:
        version = 2 if label == 'sahara' else 1
        file = ROOT / f'native-{label}-{density}x-v{version}/report.json'
        report = read(file)
        if label == 'sahara' and density == 4:
            scoped = read(ROOT / 'sahara-4x-scoped-evidence-v1.json')
            assert scoped['status'] == 'PASS_SCOPED_NATIVE_SECTIONS_REUSED_CROSS_MAP_ROUTE_FAILED'
            assert scoped['retainedReport'] == dict(file=str(file), sha256=sha(file))
            assert report['status'] == 'FAIL' and 'cityscape.map' in report['failure']
        else:
            assert report['status'] == 'PASS_SELECTED_NATIVE_CASES'
        assert not report['errors'] and report['edition'] == 'yr' and report['theater'] == 'DESERT'
        assert report['selectedMap'] == map_name
        assert report['selectedEnvironmentRevision'] == current['selectedPack']['revision']
        states = report['newNativeStates']
        assert states['status'] == 'PASS_SEQUENTIAL_NATIVE_BUILDING_ACTOR_AND_ANIMATION_CASES'
        assert {row['normal']['name'] for row in states['buildings']} == identities
        for row in states['buildings']:
            name = row['normal']['name']
            family = patch['identities']['yr'][name]
            published = report['environment']['families'][family]
            assert published['status'] == 'PUBLISHED_COMPLETE_FAMILY' and not published['attempts']
            for member in pack['families'][family]['members']:
                fragment = f'{member["sha256"]}/{sources[member["member"]]["sha256"]}/DESERT/tiles/{density}'
                assert fragment in row['normal']['hd'] and fragment in row['normal']['initial']['hd']
                assert any(binding['id'] == name and f'yr:{map_name}' in binding['mapIds']
                           for binding in sources[member['member']]['bindings'])
            assert row['normal']['frame'] == 0 and row['normalCapture']['rescaled'] is False
            observed = [0]
            if row['normal']['maxHitPoints'] > 1:
                assert row['damaged']['frame'] == 1 and row['damaged']['hd'] == row['normal']['hd']
                assert row['damagedCapture']['rescaled'] is False
                observed.append(1)
            else:
                assert name == 'CAPARK06' and row['damageException'] == 'INTENTIONAL_NATIVE_SINGLE_HITPOINT_NO_NONFATAL_DAMAGE_STATE'
                assert not row['normal']['canOccupy'] and not row['normal']['leaveRubble']
            if row['normal']['canOccupy']:
                assert name in {'CAHSE06', 'CAEGYP02'}
                assert row['occupied']['frame'] == 2 and row['occupied']['occupants'] == 1
                assert row['occupied']['hd'] == row['normal']['hd'] and row['occupiedCapture']['rescaled'] is False
                assert len(states['evacuation']) == len(states['criticalDamageEvacuation']) == 1
                observed.append(2)
            else:
                assert name in {'CAAIRP', 'CAPARK06'} and not states['evacuation']
            assert row['destroyed']['destroyed']
            if row['normal']['leaveRubble']:
                assert row['destroyed']['rubble'] == dict(hd=row['normal']['hd'], frame=3, visible=True)
                assert row['rubbleCapture']['rescaled'] is False
                observed.append(3)
            cases.append(dict(identity=name, family=family, map=f'yr:{map_name}', density=density,
                hdIdentity=row['normal']['hd'], nativeStates=observed,
                originalPlacements=sum(item['name'] == name for item in report['newNativeBindings'])))
        if label == 'sahara':
            technology = report['newNativeTechnology']
            assert technology['status'] == 'PASS_ORIGINAL_PLACEMENTS_NATIVE_CAPTURE_REPAIR_AND_OWNED_ANIMATION'
            row, = technology['cases']
            assert row['name'] == 'CAAIRP' and row['captureEngineerConsumed'] and row['repairEngineerConsumed']
            assert row['captured']['ownedByPlayer'] and row['repaired']['frame'] == 0
            assert row['repaired']['health'] == 100
            assert len(report['linkedBuildingCycles']) == 3
            for cycle in report['linkedBuildingCycles']:
                assert cycle['status'] == 'PASS_ALL_ORIGINAL_PHASES_AND_NATIVE_LOOP_RETURN'
                assert cycle['endTick'] > cycle['startTick'] and cycle['lastPhase'] == cycle['firstPhase']
                expected = list(range(16 if cycle['member'] == 'cdairp_f.shp' else 9))
                assert cycle['expectedPhases'] == expected
                assert all(capture['rescaled'] is False for capture in cycle['captures'])
                if cycle['member'] == 'cdairp_a.shp':
                    assert cycle['originalCapturedPlacement'] and cycle['nativeArtObservation']['needsEngineer']
                    assert cycle['nativeArtObservation']['powered'] and cycle['nativeArtObservation']['rate'] == 50
        allocation = report['combinedWorldAllocation']
        assert allocation['limit'] == {2: 512, 4: 1280}[density] * 1024 ** 2
        assert allocation['total'] <= allocation['limit'] and report['graphics']['glError'] == 0
        peaks[str(density)] = max(peaks.get(str(density), 0), allocation['total'])
        cpu.append(report['graphics']['prepared']['peakBytes'])
        reports.append(pin(file))
assert len(cases) == 8 and max(cpu) <= 128 * 1024 ** 2
lifecycle_file = ROOT / 'native-sahara-lifecycle-4x-v1/report.json'
lifecycle = read(lifecycle_file)
assert lifecycle['status'] == 'PASS_SELECTED_NATIVE_CASES' and not lifecycle['errors']
assert lifecycle['selectedEnvironmentRevision'] == current['selectedPack']['revision']
for section in ['release', 'crossTheater']:
    for kind in ['environment', 'terrain']:
        assert lifecycle[section][kind]['disposed'] and lifecycle[section][kind]['worldChargeBytes'] == 0
assert lifecycle['release']['currentEnvironment']['worldChargeBytes'] == 0
assert lifecycle['release']['currentTerrain']['worldChargeBytes'] == 0
assert lifecycle['crossTheater']['currentEnvironment']['density'] == 4
assert lifecycle['crossTheater']['currentTerrain']['density'] == 4 and lifecycle['crossTheater']['glError'] == 0
assert lifecycle['crossTheater']['options']['mapName'].lower() == 'fight.map'
reports.append(pin(lifecycle_file))
for label in ['sahara', 'egypt']:
    file = ROOT / f'native-{label}-original-v1/report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['fallback']['environment']['worldChargeBytes'] == report['fallback']['terrain']['worldChargeBytes'] == 0
    assert report['fallback']['glError'] == 0
    if label == 'sahara':
        assert len(report['linkedBuildingCycles']) == 2
        assert all(cycle['expectedPhases'] == list(range(9))
                   and cycle['status'] == 'PASS_ALL_ORIGINAL_PHASES_AND_NATIVE_LOOP_RETURN'
                   and all(not capture.get('hd') for capture in cycle['captures'])
                   for cycle in report['linkedBuildingCycles'])
    reports.append(pin(file))
prior = read(PRIOR)
theaters = []
for old in prior['theaters']:
    result = dict(old)
    if old['theater'] == 'DESERT':
        covered = [row for row in old['remainingGaps'] if row['member'] in sources
                   and row['sha256'] == sources[row['member']]['sha256']]
        assert len(covered) == 4 and len(old['remainingGaps']) == 4
        result.update(newCompleteSourceGroups=4, completeFamilyMembers=6, coveredSourceGroups=covered,
            remainingGaps=[], remainingAuthoredGaps=0, remainingByKind={},
            nativeDeduplication=read(NATIVE / 'native-plan-v1.json')['deduplication'])
    theaters.append(result)
assert [row['remainingAuthoredGaps'] for row in theaters] == [0, 310]
inventory = Path(prior['currentInventory']['file'])
assert sha(inventory) == prior['currentInventory']['sha256']
closure = dict(status='PASS_FOUR_COMPLETE_DESERT_GROUPS_NATIVE_STATES_MOTION_ORIGINAL_AND_LIFECYCLE',
    runtimeSourceCommit=read(ROOT / 'active-stage-v1.json')['runtimeSourceHead'], candidate=current['selectedPack'],
    priorClosure=pin(PRIOR), currentInventory=pin(inventory), sourceGuide=pin(NATIVE / 'source.json'),
    sourceContract=pin(NATIVE / 'contract.json'), sourceVerification=pin(ART / 'verification-v2.json'),
    temporalVerification=pin(ART / 'temporal-and-reuse-verification-v1.json'),
    nativeReports=reports, scoped4xEvidence=pin(ROOT / 'sahara-4x-scoped-evidence-v1.json'),
    cases=cases, theaters=theaters, sourceBodySlots=49, densityFrames=98, originalShadowFrames=29,
    acceptedSourceStatesReused=19, newAuthoredBodyStudies=10, newRadarPhaseStudies=10,
    worldPeakBytes=peaks, preparedPeakBytes=max(cpu), oldResourceRelease='ZERO_AFTER_ORIGINAL_REENTRY_AND_DESERT_TO_NEWURBAN_SWITCH',
    nativeAirportBehavior='NeedsEngineer=yes neutral airport is idle. Native engineer capture enables the active radar. Actual current Original and HD normal/damaged Art observations both use phases 0–8, Rate 50. All twenty raw slots, seven markers, three empties and excluded phase 9 remain preserved statically; unused phases are not forced into gameplay.',
    reusedEvidence='All ninety preceding Desert families; unchanged shared rules/loader; exact donor body/flag/bench payloads; Original mobile-home native state observation; passing 4X state/animation sections from the route-failed run. Only lifecycle is supplemented, without repeating those state cases.',
    originalHouseEvidence=pin(ART / 'original-house-observation-v1/report.json'),
    newSelectableMaps=0, sourceMapsChanged=False, gameplayChanged=False,
    preparedData='UNCHANGED_CORE_INPUTS_EXISTING_PREPARED_INDEX_REUSED',
    visualAcceptance='PENDING_NEW_AIRPORT_PYRAMID_AND_TWO_HOUSE_STATES', windows='NOT_RUN',
    perBatchGamePackage=False, m24Complete=False)
with (ROOT / 'coverage-and-native-closure-v1.json').open('x') as stream:
    stream.write(json.dumps(closure, indent=2) + '\n')
print(json.dumps(dict(status=closure['status'], cases=len(cases), worldPeakBytes=peaks,
    preparedPeakBytes=max(cpu), remaining={row['theater']: row['remainingAuthoredGaps'] for row in theaters})))
