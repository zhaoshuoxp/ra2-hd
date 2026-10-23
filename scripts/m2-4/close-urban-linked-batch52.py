"""Close batch 52 only after every planned native family and applicable state passes."""
import collections
import hashlib
import json
from pathlib import Path

read = lambda file: json.loads(file.read_text())
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
record = lambda file: dict(file=str(file), sha256=sha(file))
root = Path('.artifacts/m2-4/urban-rubble-batch52-v1')
native_root = Path('.artifacts/m2-4/urban-building-rubble-native-batch52-v1')
authoring = Path('.artifacts/m2-4/urban-building-rubble-authoring-batch52-v1')
contract = read(Path('desktop/environment-urban-hd-contract.json'))
patch = read(native_root / 'contract.json')
sources = {row['member']: row for row in read(native_root / 'source.json')['sources']}
verified_file = authoring / 'verify-linked-r1.json'
verified = read(verified_file)
assert verified['status'] == 'PASS_COMPLETE_LINKED_BODY_AND_ACCEPTED_ANIMATION_FAMILIES'
assert verified['counts']['exactAcceptedBodyFrames'] == 48
assert verified['counts']['exactAcceptedAssociatedFrames'] == 376
assert verified['counts']['densityFrames'] == 440 and verified['counts']['nativeToneFrames'] == 16
pack_root = Path('.local/environment-packs') / contract['selectedPack']['revision']
assert sha(pack_root / 'manifest.json') == contract['selectedPack']['sha256']
pack = read(pack_root / 'manifest.json')
plan_file = native_root / 'native-plan-v1.json'
plan = read(plan_file)
assert sha(native_root / 'contract.json') == plan['sourceContractSha256']
reports, cases, peaks, cpu, release_count = [], [], {'2': 0, '4': 0}, [], 0
for planned in plan['cases']:
    for density in [2, 4]:
        file = Path(f'{planned["output"]}-{density}x-v1/report.json')
        report = read(file)
        assert report['status'] == 'PASS_SELECTED_NATIVE_CASES'
        assert report['selectedMap'] == planned['runtimeName']
        assert report['edition'] == planned['edition'] and report['theater'] == 'URBAN'
        assert report['selectedEnvironmentRevision'] == contract['selectedPack']['revision']
        states = report['newNativeStates']
        assert states['status'] == 'PASS_SEQUENTIAL_NATIVE_BUILDING_ACTOR_AND_ANIMATION_CASES'
        assert sorted(row['normal']['name'] for row in states['buildings']) == sorted(planned['identities'])
        occupied_count = 0
        for row in states['buildings']:
            name = row['normal']['name']
            family = patch['identities'][planned['edition']][name]
            body_name, = [n for n in planned['members'] if n in patch['families'][family]['members']]
            member, = [m for m in pack['families'][family]['members'] if m['member'] == body_name]
            source = sources[member['member']]
            assert any(binding['id'] == name and planned['mapId'] in binding['mapIds'] for binding in source['bindings'])
            assert sha(pack_root / member['path']) == member['sha256']
            parts = [f'{m["sha256"]}/{sources[m["member"]]["sha256"]}/URBAN/tiles/{density}' for m in pack['families'][family]['members']]
            identity = 'environment-aggregate/' + '|'.join(parts)
            for state, frame in [('normal', 0), ('damaged', 1)]:
                assert row[state]['hd'] == identity and row[state]['frame'] == frame
                assert row[state + 'Capture']['rescaled'] is False
            assert row['normal']['initial']['hd'] == identity
            occupied = row['normal']['canOccupy'] and row['normal']['maxOccupants'] > 0
            if occupied:
                occupied_count += 1
                assert row['occupied']['hd'] == identity and row['occupied']['frame'] == 2
                assert row['occupied']['occupants'] == 1 and row['occupiedCapture']['rescaled'] is False
            else:
                assert 'occupied' not in row
            assert row['destroyed']['destroyed']
            rubble_used = patch['sources'][member['member']]['framePalettes']['3']['runtimeUsed']
            assert bool(row['normal']['leaveRubble']) == rubble_used
            assert rubble_used and row['normal']['leaveRubble']
            assert row['destroyed']['rubble'] == dict(hd=identity, frame=3, visible=True)
            assert row['rubbleCapture']['rescaled'] is False
            published = report['environment']['families'][family]
            assert published['status'] == 'PUBLISHED_COMPLETE_FAMILY' and published['attempts'] == []
            cases.append(dict(name=name, family=family, member=member['member'], sourceSha256=source['sha256'],
                              edition=planned['edition'], mapId=planned['mapId'], density=density,
                              identity=identity, occupiedApplicable=bool(occupied), rubbleApplicable=rubble_used))
        assert len(states['evacuation']) == len(states['criticalDamageEvacuation']) == occupied_count
        if planned.get('technologyNames'):
            technology = report['newNativeTechnology']
            assert technology['status'] == 'PASS_ORIGINAL_PLACEMENTS_NATIVE_CAPTURE_REPAIR_AND_OWNED_ANIMATION'
            assert {r['name'] for r in technology['cases']} == set(planned['technologyNames'])
            for case in technology['cases']:
                assert case['captureEngineerConsumed'] and case['repairEngineerConsumed']
                assert case['captured']['ownedByPlayer'] and case['repaired']['frame'] == 0
                assert case['captured']['hd'] and case['damaged']['hd'] == case['repaired']['hd']
                if case['name'] == 'CAMACH':
                    healing = case['passiveVehicleHealing']
                    assert healing['after']['health'] > healing['before']['health']
            assert len(report['oilClips']) == 2
            clips = {Path(r['file']).stem:r for r in report['oilClips']}
            assert clips['oil-player-normal']['activeFrames'] == list(range(32))
            assert clips['oil-player-damaged']['activeFrames'] == list(range(33, 64))
        if density == 4 and planned['checkRelease']:
            for old in ['environment', 'terrain']:
                assert report['release'][old]['disposed'] and report['release'][old]['worldChargeBytes'] == 0
            assert report['release']['currentEnvironment']['worldChargeBytes'] == report['release']['currentTerrain']['worldChargeBytes'] == 0
            release_count += 1
        assert report['graphics']['glError'] == 0
        allocation = report['combinedWorldAllocation']
        assert allocation['limit'] == (512 if density == 2 else 1280) * 1024 * 1024
        assert allocation['total'] <= allocation['limit']
        peaks[str(density)] = max(peaks[str(density)], allocation['total'])
        cpu.append(report['graphics']['prepared']['peakBytes'])
        reports.append(record(file))
    original_version = 3 if planned['id'] == '4' else 1
    original_file = Path(f'{planned["output"]}-original-v{original_version}/report.json')
    if original_version == 3:
        failed_file = Path(f'{planned["output"]}-original-v1/report.json')
        failed = read(failed_file)
        assert failed['status'] == 'FAIL' and 'native-original-review.mjs:34' in failed['failure']
        assert failed['selectedMap'] == planned['runtimeName']
    original = read(original_file)
    assert original['status'] == 'PASS_SELECTED_NATIVE_CASES' and original['selectedMap'] == planned['runtimeName']
    reports.append(record(original_file))
assert len(cases) == 16 and release_count == 2 and max(cpu) <= 128 * 1024 * 1024
prior_file = Path('.artifacts/m2-4/urban-rubble-batch51-v1/coverage-delta.json')
prior = read(prior_file)
covered = [group for group in prior['remainingGaps'] if group['kind'] == 'building'
           and group['member'] in sources and group['sha256'] == sources[group['member']]['sha256']]
assert len(covered) == 8
keys = {row['key'] for row in covered}
remaining = [row for row in prior['remainingGaps'] if row['key'] not in keys]
assert len(remaining) == 89
for archive in prior['archives']:
    assert sha(Path(archive['file'])) == archive['sha256']
closure = dict(status='PASS_EIGHT_COMPLETE_LINKED_FAMILIES_16_NATIVE_STATE_CASES_FOUR_ORIGINAL_MAPS',
    verification=record(verified_file), nativePlan=record(plan_file), selectedPack=contract['selectedPack'],
    nativeReports=reports, diagnosticHistory=record(root / 'diagnostic-history.json'),
    cases=cases, worldAllocationBytes=peaks, preparedPeakBytes=max(cpu),
    releaseAndOriginalReentryCases=release_count, acceptedAnimationDensityFrames=376,
    editionDeduplication='Each family was exercised on one unchanged original map at both densities. Other source-identical edition/map bindings share exact SHP/palette bytes, logical metadata and complete selected family; this is image-loader coverage, not a claim of duplicated full matches.',
    visual='PENDING_EIGHT_NEW_RUBBLE_IMAGES_ONLY', windows='NOT_RUN', m24Complete=False)
delta = dict(status='PASS_INCREMENTAL_SOURCE_BOUND_CIVILIAN_COVERAGE_VISUAL_PENDING',
    baseline=prior['baseline'], priorDelta=record(prior_file), selectedEnvironment=contract['selectedPack'],
    selectedTerrain=prior['selectedTerrain'], totalUrbanMapEntries=32, uniqueUrbanMapHashes=26,
    newCompleteSourceGroups=8, newArtStates=8, memberRubbleStates=8, reusedAcceptedBodyStates=24, exactAcceptedAssociatedFrames=376,
    covered=covered, remainingGapFamilies=len(remaining), remainingByKind=dict(collections.Counter(row['kind'] for row in remaining)),
    remainingGaps=remaining, archives=prior['archives'], unchangedMapBytes=True, unchangedDependencyKeys=True,
    runtime=closure['status'], visual=closure['visual'], windows='NOT_RUN', m24Complete=False)
for name, value in [('native-closure.json', closure), ('coverage-delta.json', delta)]:
    with (root / name).open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')
print(json.dumps(dict(closedGroups=8, remaining=delta['remainingByKind'], worldAllocationBytes=peaks)))
