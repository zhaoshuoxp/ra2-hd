"""Close only source-pinned Urban families proven complete by batch 49 evidence."""
import collections
import hashlib
import json
from pathlib import Path

read = lambda file: json.loads(file.read_text())
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
record = lambda file: dict(file=str(file), sha256=sha(file))
root = Path('.artifacts/m2-4/urban-rubble-batch49-v1')
native_root = Path('.artifacts/m2-4/urban-building-rubble-native-batch49-v1')
contract = read(Path('desktop/environment-urban-hd-contract.json'))
patch = read(native_root / 'contract.json')
sources = {row['member']: row for row in read(native_root / 'source.json')['sources']}
verified_file = Path('.artifacts/m2-4/urban-building-rubble-authoring-batch49-v1/verify-r3.json')
verified = read(verified_file)
assert verified['status'] == 'PASS' and verified['counts']['exactAcceptedBodyFrames'] == 72
assert verified['counts']['structuralCoverageFrames'] == 96 and verified['counts']['nativeToneFrames'] == 24
pack_root = Path('.local/environment-packs') / contract['selectedPack']['revision']
assert sha(pack_root / 'manifest.json') == contract['selectedPack']['sha256']
pack = read(pack_root / 'manifest.json')
reports, cases, peaks, cpu = [], [], {}, []
for density in [2, 4]:
    file = Path(f'.artifacts/m2-4/urban-rubble-native-ra2-{density}x-v1/report.json')
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES'
    assert report['selectedEnvironmentRevision'] == contract['selectedPack']['revision']
    assert report['newNativeStates']['status'] == 'PASS_SEQUENTIAL_NATIVE_BUILDING_ACTOR_AND_ANIMATION_CASES'
    expected = set(patch['identities']['ra2'])
    buildings = report['newNativeStates']['buildings']
    assert {row['normal']['name'] for row in buildings} == expected and len(buildings) == 12
    for row in buildings:
        name = row['normal']['name']
        family = patch['identities']['ra2'][name]
        member, = pack['families'][family]['members']
        source = sources[member['member']]
        assert sha(pack_root / member['path']) == member['sha256']
        identity = f'environment-aggregate/{member["sha256"]}/{source["sha256"]}/URBAN/tiles/{density}'
        for state, frame in [('normal', 0), ('occupied', 2), ('damaged', 1)]:
            assert row[state]['hd'] == identity and row[state]['frame'] == frame
        assert row['normal']['initial']['hd'] == identity
        assert row['destroyed']['destroyed'] and row['destroyed']['rubble'] == dict(hd=identity, frame=3, visible=True)
        assert all(row[state + 'Capture']['rescaled'] is False for state in ['normal', 'occupied', 'damaged', 'rubble'])
        assert report['environment']['families'][family]['status'] == 'PUBLISHED_COMPLETE_FAMILY'
        assert report['environment']['families'][family]['attempts'] == []
        cases.append(dict(name=name, family=family, member=member['member'], sourceSha256=source['sha256'],
                          density=density, identity=identity, states=[0, 2, 1, 3], originalPlacement=True))
    assert len(report['newNativeStates']['evacuation']) == len(report['newNativeStates']['criticalDamageEvacuation']) == 12
    for old in ['environment', 'terrain']:
        assert report['release'][old]['disposed'] and report['release'][old]['worldChargeBytes'] == 0
    assert report['release']['currentEnvironment']['worldChargeBytes'] == report['release']['currentTerrain']['worldChargeBytes'] == 0
    assert report['graphics']['glError'] == 0
    allocation = report['combinedWorldAllocation']
    assert allocation['limit'] == (512 if density == 2 else 1280) * 1024 * 1024
    assert allocation['total'] <= allocation['limit']
    peaks[str(density)] = allocation['total']
    cpu.append(report['graphics']['prepared']['peakBytes'])
    reports.append(record(file))
assert max(cpu) <= 128 * 1024 * 1024
prior_file = Path('.artifacts/m2-4/urban-factions-batch48-v1/coverage-delta.json')
prior = read(prior_file)
covered = []
for group in prior['remainingGaps']:
    source = sources.get(group['member'])
    if group['kind'] == 'building' and source and group['sha256'] == source['sha256']:
        assert set(group['identities']) <= set(patch['identities']['ra2']) | set(patch['identities']['yr'])
        covered.append(group)
assert len(covered) == 12
keys = {row['key'] for row in covered}
remaining = [row for row in prior['remainingGaps'] if row['key'] not in keys]
assert len(remaining) == 146
for archive in prior['archives']:
    assert sha(Path(archive['file'])) == archive['sha256']
closure = dict(status='PASS_12_COMPLETE_SOURCE_PINNED_FAMILIES_24_NATIVE_STATE_CASES',
    verification=record(verified_file), selectedPack=contract['selectedPack'], nativeReports=reports,
    cases=cases, worldAllocationBytes=peaks, preparedPeakBytes=max(cpu),
    visual='PENDING_12_NEW_RUBBLE_STATES_ONLY', windows='NOT_RUN', m24Complete=False)
delta = dict(status='PASS_INCREMENTAL_SOURCE_BOUND_CIVILIAN_COVERAGE_VISUAL_PENDING',
    baseline=prior['baseline'], priorDelta=record(prior_file), selectedEnvironment=contract['selectedPack'],
    selectedTerrain=prior['selectedTerrain'], totalUrbanMapEntries=32, uniqueUrbanMapHashes=26,
    newCompleteSourceGroups=12, newArtStates=12, reusedAcceptedBodyStates=36, covered=covered,
    remainingGapFamilies=len(remaining), remainingByKind=dict(collections.Counter(row['kind'] for row in remaining)),
    remainingGaps=remaining, archives=prior['archives'], unchangedMapBytes=True,
    unchangedDependencyKeys=True, runtime='PASS_RA2_BOTH_DENSITIES_FULL_NATIVE_STATE_PATH',
    visual=closure['visual'], windows='NOT_RUN', m24Complete=False)
for name, value in [('native-closure.json', closure), ('coverage-delta.json', delta)]:
    with (root / name).open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')
print(json.dumps(dict(closedGroups=12, remaining=delta['remainingByKind'], worldAllocationBytes=peaks)))
