"""Close six source-complete linked families against immutable native evidence."""
import collections
import hashlib
import json
from pathlib import Path

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
base = Path('.artifacts/m2-4')
root = base / 'urban-linked-batch61-v1'
native = base / 'urban-linked-native-batch61-v1'
art = base / 'urban-linked-authoring-batch61-v1'
contract = read(Path('desktop/environment-urban-hd-contract.json'))
patch = read(native / 'contract.json')
plan = read(native / 'native-plan-v3.json')
sources = {s['member']: s for s in read(native / 'source.json')['sources']}
assert patch['preparedSourceSha256'] == sha(native / 'source.json')
assert plan['sourceContractSha256'] == sha(native / 'contract.json')
pack_root = Path('.local/environment-packs') / contract['selectedPack']['revision']
assert sha(pack_root / 'manifest.json') == contract['selectedPack']['sha256']
pack = read(pack_root / 'manifest.json')
assert len(pack['families']) == 284
reports, cases, cycles, allocations, cpu = [], [], [], {}, []
release_count = 0
for entry in plan['cases']:
    original_route = None
    for label in ['2X', '4X', 'Original']:
        density = {'2X': 2, '4X': 4, 'Original': 1}[label]
        directory = Path(entry.get('originalOutput', entry['output'] + '-original-v1')) if density == 1 else Path(
            f'{entry["output"]}-{density}x-v1')
        file = directory / 'report.json'
        report = read(file)
        assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
        assert report['selectedMap'] == entry['runtimeName'] and report['edition'] == entry['edition']
        assert original_route is None or original_route == report['captureRoute']
        original_route = report['captureRoute']
        assert report['linkedBuildingCycleSource']['sha256'] == sha(native / 'source.json')
        for cycle in report['linkedBuildingCycles']:
            idle = cycle['status'] == 'PASS_ORIGINAL_NEUTRAL_UNPOWERED_IDLE'
            assert idle or cycle['status'] == 'PASS_ALL_ORIGINAL_PHASES_AND_NATIVE_LOOP_RETURN'
            captured_phases = sorted({capture['phase'] for capture in cycle['captures']})
            assert cycle['expectedPhases'] == captured_phases
            if 'observedExpectedPhases' in cycle:
                assert cycle['expectedPhases'] == cycle['observedExpectedPhases']
            assert cycle['endTick'] > cycle['startTick'] and cycle['videoCapture']['rescaled'] is False
            assert cycle['videoCapture']['timing'] == 'UNCHANGED_NATIVE_CLOCK'
            if idle:
                assert cycle['member'] in ['nupsya_a.shp', 'ngpsyb_a.shp']
                assert cycle['nativePower'] == dict(neutral=True, poweredOn=False, poweredRule=True)
                assert cycle['expectedPhases'] == [0] and not cycle['fixture']
            else:
                assert cycle['firstPhase'] == cycle['lastPhase']
            cycles.append(dict(name=cycle['name'], member=cycle['member'], state=cycle['state'], density=label,
                status=cycle['status'], phases=cycle['expectedPhases'], nativePower=cycle.get('nativePower'),
                fixture=cycle.get('fixture', False), video=pin(directory / cycle['videoFile'])))
        if density == 1:
            reports.append(pin(file))
            continue
        assert report['selectedEnvironmentRevision'] == contract['selectedPack']['revision']
        states = report['newNativeStates']
        assert states['status'] == 'PASS_SEQUENTIAL_NATIVE_BUILDING_ACTOR_AND_ANIMATION_CASES'
        assert {r['normal']['name'] for r in states['buildings']} == set(entry['identities'])
        occupied_count = 0
        for row in states['buildings']:
            name = row['normal']['name']
            family = patch['identities'][entry['edition']][name]
            members = pack['families'][family]['members']
            assert {m['member'] for m in members} == set(patch['families'][family]['members'])
            member, = [m for m in members if m['member'] == row['normal']['mainMember']]
            source = sources[member['member']]
            assert any(b['id'] == name and b['edition'] == entry['edition'] and entry['sourceMapId'] in b['mapIds']
                for b in source['bindings'])
            parts = []
            for item in members:
                assert sha(pack_root / item['path']) == item['sha256']
                parts.append(f'{item["sha256"]}/{sources[item["member"]]["sha256"]}/URBAN/tiles/{density}')
            identity = 'environment-aggregate/' + '|'.join(parts)
            published = report['environment']['families'][family]
            assert published['status'] == 'PUBLISHED_COMPLETE_FAMILY' and not published['attempts']
            assert row['normal']['initial']['hd'] == identity
            for state, frame in [('normal', 0), ('damaged', 1)]:
                assert row[state]['hd'] == identity and row[state]['frame'] == frame
                assert row[state + 'Capture']['rescaled'] is False
            occupied = bool(row['normal']['canOccupy'] and row['normal']['maxOccupants'] > 0)
            if occupied:
                occupied_count += 1
                assert row['occupied']['hd'] == identity and row['occupied']['frame'] == 2
                assert row['occupied']['occupants'] == 1 and row['occupiedCapture']['rescaled'] is False
            else:
                assert 'occupied' not in row
            assert row['destroyed']['destroyed']
            rubble = patch['sources'][member['member']].get('framePalettes', {}).get('3', {}).get('runtimeUsed', False)
            assert bool(row['normal']['leaveRubble']) == rubble
            if rubble:
                assert row['destroyed']['rubble'] == dict(hd=identity, frame=3, visible=True)
                assert row['rubbleCapture']['rescaled'] is False
            cases.append(dict(edition=entry['edition'], mapId=entry['sourceMapId'], name=name, family=family,
                density=density, sourceSha256=source['sha256'], identity=identity,
                occupiedApplicable=occupied, rubbleApplicable=rubble))
        assert len(states['evacuation']) == len(states['criticalDamageEvacuation']) == occupied_count
        if density == 4 and entry['checkRelease']:
            for key in ['environment', 'terrain']:
                assert report['release'][key]['disposed'] and report['release'][key]['worldChargeBytes'] == 0
                assert report['release'][key]['gpuBytes'] == report['release'][key]['retainedCpuBytes'] == 0
            assert report['release']['currentEnvironment']['worldChargeBytes'] == 0
            assert report['release']['currentTerrain']['worldChargeBytes'] == 0
            release_count += 1
        allocation = report['combinedWorldAllocation']
        assert allocation['limit'] == (512 if density == 2 else 1280) * 1024 ** 2
        assert allocation['total'] <= allocation['limit'] and report['graphics']['glError'] == 0
        assert not report['prepared']['fallbacks']
        allocations[f'{entry["id"]}-{density}X'] = allocation['total']
        cpu.append(report['graphics']['prepared']['peakBytes'])
        reports.append(pin(file))
assert len(cases) == 14 and len({r['sourceSha256'] for r in cases}) == 6 and release_count == 2
assert len(cycles) == 42 and sum(c['status'].endswith('UNPOWERED_IDLE') for c in cycles) == 6
assert sum(r['occupiedApplicable'] for r in cases) == 2 and sum(r['rubbleApplicable'] for r in cases) == 4
assert max(cpu) <= 128 * 1024 ** 2
verified = read(art / 'verification-v1.json')
assert verified['status'] == 'PASS' and verified['counts']['densityFrames'] == 446
assert verified['counts']['exactAcceptedBodyFrames'] == 18
recipe = read(art / 'urban-linked-m2-4-batch61-r1/recipe.json')
assert len(recipe['actualSampling']) == 214 and min(s['availableDensity'] for s in recipe['actualSampling']) >= 4
prior_file = base / 'urban-buildings-batch60-v1/coverage-delta.json'
prior = read(prior_file)
covered = [r for r in prior['remainingGaps'] if r['member'] in sources and r['sha256'] == sources[r['member']]['sha256']]
assert len(covered) == 6
keys = {r['key'] for r in covered}
remaining = [r for r in prior['remainingGaps'] if r['key'] not in keys]
assert len(remaining) == 9 and collections.Counter(r['kind'] for r in remaining) == dict(infantry=3, vehicle=6)
for archive in prior['archives']:
    assert sha(Path(archive['file'])) == archive['sha256']
closure = dict(status='PASS_SIX_COMPLETE_LINKED_URBAN_FAMILIES_NATIVE_STATES_LOOPS_AND_RELEASE',
    selectedEnvironment=contract['selectedPack'], nativeReports=reports, cases=cases, cycles=cycles,
    sourceContract=pin(native / 'contract.json'), nativePlan=pin(native / 'native-plan-v3.json'),
    runtimeStage=pin(root / 'active-stage.json'), worldAllocationBytes=allocations, preparedPeakBytes=max(cpu),
    priorFamiliesPreserved=278, originalVisibleSlots=223, nativeShadows=223, densityFrames=446,
    distinctNewMaterials=189, acceptedFlagSourcePoses=9, nativeFamilyDensityCases=14, originalMapCases=3,
    fullNativeLoopObservations=36, originalNeutralIdleObservations=6, releaseAndOriginalReentryCases=release_count,
    inactiveSlotPolicy='Original exclusive LoopEnd ranges are unchanged; all unused source slots remain in complete members.',
    buildupPolicy='NAPSYB retains all 25 BUILDUP/UNBUILD source poses and native reverse indices. Official neutral placements are uncapturable with TechLevel=-1; construction/sell playback is not claimed as an official-map native state.',
    retainedDiagnostics=[pin(root / 'native-group2-2x-v1/report.json'),
        pin(root / 'native-group2-powered-r2-original-v1/report.json')],
    deduplication=plan['deduplication'], visual='PENDING_SIX_NEW_FAMILIES_ONLY', windows='NOT_RUN', m24Complete=False)
delta = dict(status='PASS_INCREMENTAL_COMPLETE_URBAN_LINKED_FAMILIES_VISUAL_PENDING', priorDelta=pin(prior_file),
    baseline=prior['baseline'], selectedEnvironment=contract['selectedPack'], selectedTerrain=prior['selectedTerrain'],
    totalUrbanMapEntries=32, uniqueUrbanMapHashes=26, newCompleteSourceGroups=6, covered=covered,
    remainingGapFamilies=9, remainingByKind=dict(collections.Counter(r['kind'] for r in remaining)), remainingGaps=remaining,
    archives=prior['archives'], authorizedFacilityRepairsPreserved=['culit01e.shp', 'cupol01s.shp'],
    unchangedMapBytes=True, unchangedDependencyKeys=True, visual=closure['visual'], windows='NOT_RUN', m24Complete=False)
for name, value in [('native-closure.json', closure), ('coverage-delta.json', delta)]:
    with (root / name).open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')
print(json.dumps(dict(status=closure['status'], remaining=delta['remainingByKind'], allocations=allocations)))
