"""Close exact Urban city reuse and complete national flags from bounded Mac evidence."""
import collections
import hashlib
import json
from pathlib import Path

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
root = Path('.artifacts/m2-4/urban-city-flags-batch57-v1')
native = Path('.artifacts/m2-4/urban-city-flags-native-batch57-v1')
art = Path('.artifacts/m2-4/urban-city-flags-authoring-batch57-v1')
contract = read(Path('desktop/environment-urban-hd-contract.json'))
patch = read(native / 'contract.json')
pack_root = Path('.local/environment-packs') / contract['selectedPack']['revision']
assert sha(pack_root / 'manifest.json') == contract['selectedPack']['sha256']
pack = read(pack_root / 'manifest.json')
assert len(pack['families']) == 238
verified = read(art / 'verification-v1.json')
assert verified['status'] == 'PASS' and verified['counts']['densityFrames'] == 176
assert verified['counts']['exactAcceptedBodyFrames'] == 48
plan = read(native / 'native-plan-v1.json')['cases']
plan[1] = read(native / 'native-plan-flags-r2.json')['cases'][0]
reports, cases, loops, allocations, cpu = [], [], [], {}, []
for entry in plan:
    for density in [2, 4]:
        file = Path(f'{entry["output"]}-{density}x-v1/report.json')
        report = read(file)
        assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
        assert report['selectedMap'] == entry['runtimeName'] and report['edition'] == entry['edition']
        assert report['selectedEnvironmentRevision'] == contract['selectedPack']['revision']
        states = report['newNativeStates']
        assert states['status'] == 'PASS_SEQUENTIAL_NATIVE_BUILDING_ACTOR_AND_ANIMATION_CASES'
        assert {r['normal']['name'] for r in states['buildings']} == set(entry['identities'])
        occupied_count = 0
        for row in states['buildings']:
            name = row['normal']['name']
            family = patch['identities'][entry['edition']][name]
            member_ids = []
            for member in pack['families'][family]['members']:
                descriptor = patch['sources'][member['member']]
                member_ids.append(f'{member["sha256"]}/{descriptor["sha256"]}/URBAN/tiles/{density}')
            identity = 'environment-aggregate/' + '|'.join(member_ids)
            assert report['environment']['families'][family]['status'] == 'PUBLISHED_COMPLETE_FAMILY'
            assert not report['environment']['families'][family]['attempts']
            assert row['normal']['initial']['hd'] == identity
            for state, number in [('normal', 0), ('damaged', 1)]:
                assert row[state]['hd'] == identity and row[state]['frame'] == number
                assert row[state + 'Capture']['rescaled'] is False
            occupied = row['normal']['canOccupy'] and row['normal']['maxOccupants'] > 0
            assert bool(occupied) == (entry['id'] == 'city')
            if occupied:
                occupied_count += 1
                assert row['occupied']['hd'] == identity and row['occupied']['frame'] == 2
                assert row['occupied']['occupants'] == 1 and not row['occupiedCapture']['rescaled']
            else:
                assert 'occupied' not in row
            assert row['destroyed']['destroyed'] and not row['normal']['leaveRubble']
            cases.append(dict(group=entry['id'], name=name, family=family, density=density,
                identity=identity, occupiedApplicable=bool(occupied), rubbleApplicable=False))
        assert len(states['evacuation']) == len(states['criticalDamageEvacuation']) == occupied_count
        if entry['id'] == 'flags':
            observed = report['linkedBuildingCycles']
            assert {cycle['member'] for cycle in observed} == set(entry['cycleMembers'])
            for cycle in observed:
                assert cycle['status'] == 'PASS_ALL_ORIGINAL_PHASES_AND_NATIVE_LOOP_RETURN'
                assert cycle['expectedPhases'] == list(range(15)) and cycle['unusedSourcePhases'] == [15]
                assert cycle['sourceFrameCount'] == 16 and cycle['endTick'] > cycle['startTick']
                loops.append(dict(density=density, member=cycle['member'], report=pin(file),
                    activePhases=cycle['expectedPhases'], retainedUnusedPhase=15))
        if density == 4:
            for key in ['environment', 'terrain']:
                assert report['release'][key]['disposed'] and report['release'][key]['worldChargeBytes'] == 0
            assert report['release']['currentEnvironment']['worldChargeBytes'] == 0
            assert report['release']['currentTerrain']['worldChargeBytes'] == 0
        allocation = report['combinedWorldAllocation']
        assert allocation['limit'] == (512 if density == 2 else 1280) * 1024 ** 2
        assert allocation['total'] <= allocation['limit'] and report['graphics']['glError'] == 0
        allocations[f'{entry["id"]}-{density}X'] = allocation['total']
        cpu.append(report['graphics']['prepared']['peakBytes'])
        reports.append(pin(file))
    original_file = Path(f'{entry["output"]}-original-v1/report.json')
    original = read(original_file)
    assert original['status'] == 'PASS_SELECTED_NATIVE_CASES' and not original['errors']
    assert original['selectedMap'] == entry['runtimeName']
    if entry['id'] == 'flags':
        assert len(original['linkedBuildingCycles']) == 4
        assert all(c['status'] == 'PASS_ALL_ORIGINAL_PHASES_AND_NATIVE_LOOP_RETURN'
            and c['expectedPhases'] == list(range(15)) and all(not r.get('hd') for r in c['captures'])
            for c in original['linkedBuildingCycles'])
    reports.append(pin(original_file))
guard_file = root / 'native-city-yr-4x-guard-v1/report.json'
guard = read(guard_file)
assert guard['status'] == 'PASS_SELECTED_NATIVE_CASES' and not guard['errors']
assert guard['sourceScope']['sourceSha256'] == patch['families']['urban-cacity01']['sourceScope']['officialMapSha256s'][0]
assert guard['sourceScope']['adaptation']['status'] == 'APPLIED_SOURCE_PINNED_ORIGINAL_LIBRARY_PALETTE'
assert guard['edition'] == 'yr' and len(guard['newNativeBindings']) >= 4
reports.append(pin(guard_file))
for edition in ['ra2', 'yr']:
    file = root / f'original-library-{edition}-v1/report.json'
    original = read(file)
    assert original['status'] == 'PASS_SELECTED_NATIVE_CASES' and not original['errors']
    assert original['paletteStatus'] == 'PASS_SOURCE_PINNED_ORIGINAL_LIBRARY_PALETTE'
    assert all(r['fixedPaletteMatches'] == 240 and not r.get('hd') for r in original['originalPlacements'])
    reports.append(pin(file))
assert len(cases) == 16 and len(loops) == 8 and max(cpu) <= 128 * 1024 ** 2
recipe = read(art / 'urban-city-flags-m2-4-batch57-r1/recipe.json')
assert len(recipe['actualSampling']) == 64
assert min(r['availableDensity'] for r in recipe['actualSampling']) >= 4
prior_file = Path('.artifacts/m2-4/urban-buildings-batch56-v1/coverage-delta.json')
prior = read(prior_file)
sources = patch['sources']
covered = [r for r in prior['remainingGaps'] if r['member'] in sources and r['sha256'] == sources[r['member']]['sha256']]
assert len(covered) == 8
keys = {r['key'] for r in covered}
remaining = [r for r in prior['remainingGaps'] if r['key'] not in keys]
assert len(remaining) == 55
for archive in prior['archives']:
    assert sha(Path(archive['file'])) == archive['sha256']
closure = dict(status='PASS_EIGHT_COMPLETE_CITY_FLAG_FAMILIES_NATIVE_STATES_LOOPS_PALETTES_AND_RELEASE',
    selectedEnvironment=contract['selectedPack'], nativeReports=reports, cases=cases, loops=loops,
    verification=pin(art / 'verification-v1.json'), runtimeStage=pin(root / 'active-stage.json'),
    worldAllocationBytes=allocations, preparedPeakBytes=max(cpu), priorFamiliesPreserved=230,
    sourceStates=88, reusedAcceptedBodyStates=24, newFlagSourcePhases=64, densityFrames=176,
    runtimeStateImages=20, activeFlagPhases=60, nativeFlagDensityLoops=8, matchedOriginalLoops=4,
    releaseAndOriginalReentryCases=2, originalMapsExecuted=2,
    deduplication=read(native / 'native-plan-v1.json')['deduplication'],
    visual='PENDING_FOUR_NEW_FLAG_ANIMATIONS_ONLY', windows='NOT_RUN', m24Complete=False)
delta = dict(status='PASS_INCREMENTAL_COMPLETE_URBAN_CITY_FLAGS_VISUAL_PENDING',
    priorDelta=pin(prior_file), baseline=prior['baseline'], selectedEnvironment=contract['selectedPack'],
    selectedTerrain=prior['selectedTerrain'], totalUrbanMapEntries=32, uniqueUrbanMapHashes=26,
    newCompleteSourceGroups=8, newArtStates=64, reusedAcceptedStates=24, covered=covered,
    remainingGapFamilies=55, remainingByKind=dict(collections.Counter(r['kind'] for r in remaining)),
    remainingGaps=remaining, archives=prior['archives'], unchangedMapBytes=True,
    unchangedDependencyKeys=True, visual=closure['visual'], windows='NOT_RUN', m24Complete=False)
for name, value in [('native-closure.json', closure), ('coverage-delta.json', delta)]:
    with (root / name).open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')
print(json.dumps(dict(status=closure['status'], remaining=delta['remainingByKind'], allocations=allocations)))
