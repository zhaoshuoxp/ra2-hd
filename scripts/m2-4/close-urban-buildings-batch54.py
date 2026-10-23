"""Close eight new complete families only after actual Mac state and lifecycle checks."""
import argparse
import collections
import hashlib
import json
from pathlib import Path

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
record = lambda p: dict(file=str(p), sha256=sha(p))
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--batch', type=int, choices=[54, 55, 56], default=54)
args = parser.parse_args()
batch = args.batch
root = Path(f'.artifacts/m2-4/urban-buildings-batch{batch}-v1')
native = Path(f'.artifacts/m2-4/urban-buildings-native-batch{batch}-v1')
art = Path(f'.artifacts/m2-4/urban-buildings-authoring-batch{batch}-v1')
edition, map_name = {54: ('yr', 'hillbtwn.map'), 55: ('ra2', 'mp34u4.map'), 56: ('yr', 'xarena.map')}[batch]
contract = read(Path('desktop/environment-urban-hd-contract.json'))
patch = read(native / 'contract.json')
verified = read(art / 'verification-v1.json')
assert verified['status'] == 'PASS' and verified['counts']['densityFrames'] == (48 if batch == 54 else 64)
pack_root = Path('.local/environment-packs') / contract['selectedPack']['revision']
assert sha(pack_root / 'manifest.json') == contract['selectedPack']['sha256']
pack = read(pack_root / 'manifest.json')
assert len(pack['families']) == {54: 214, 55: 222, 56: 230}[batch]
sources = {s['member']: s for s in read(native / 'source.json')['sources']}
expected_names = {i for f in patch['families'].values() for i in f['identities']}
reports, cases, peaks, cpu = [], [], {}, []
for density in [2, 4]:
    file = root / f'native-group1-{density}x-v1/report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['selectedMap'] == map_name and report['edition'] == edition and report['theater'] == 'URBAN'
    assert report['selectedEnvironmentRevision'] == contract['selectedPack']['revision']
    states = report['newNativeStates']
    assert states['status'] == 'PASS_SEQUENTIAL_NATIVE_BUILDING_ACTOR_AND_ANIMATION_CASES'
    assert {row['normal']['name'] for row in states['buildings']} == expected_names
    occupied_count = 0
    for row in states['buildings']:
        name = row['normal']['name']
        family = patch['identities'][edition][name]
        member, = pack['families'][family]['members']
        source = sources[member['member']]
        assert any(b['id'] == name and f'{edition}:{map_name}' in b['mapIds'] for b in source['bindings'])
        identity = f'environment-aggregate/{member["sha256"]}/{source["sha256"]}/URBAN/tiles/{density}'
        published = report['environment']['families'][family]
        assert published['status'] == 'PUBLISHED_COMPLETE_FAMILY' and not published['attempts']
        assert row['normal']['initial']['hd'] == identity
        for state, number in [('normal', 0), ('damaged', 1)]:
            assert row[state]['hd'] == identity and row[state]['frame'] == number
            assert row[state + 'Capture']['rescaled'] is False
        occupied = row['normal']['canOccupy'] and row['normal']['maxOccupants'] > 0
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
        cases.append(dict(name=name, family=family, member=member['member'], sourceSha256=source['sha256'],
                          density=density, identity=identity, occupiedApplicable=bool(occupied), rubbleApplicable=rubble))
    assert len(states['evacuation']) == len(states['criticalDamageEvacuation']) == occupied_count == {54: 3, 55: 8, 56: 0}[batch]
    if density == 4:
        for name in ['environment', 'terrain']:
            assert report['release'][name]['disposed'] and report['release'][name]['worldChargeBytes'] == 0
        assert report['release']['currentEnvironment']['worldChargeBytes'] == 0
        assert report['release']['currentTerrain']['worldChargeBytes'] == 0
    allocation = report['combinedWorldAllocation']
    assert allocation['limit'] == (512 if density == 2 else 1280) * 1024 * 1024
    assert allocation['total'] <= allocation['limit'] and report['graphics']['glError'] == 0
    peaks[str(density)] = allocation['total']
    cpu.append(report['graphics']['prepared']['peakBytes'])
    reports.append(record(file))
original_file = root / 'native-group1-original-v1/report.json'
original = read(original_file)
assert original['status'] == 'PASS_SELECTED_NATIVE_CASES' and original['selectedMap'] == map_name
reports.append(record(original_file))
assert len(cases) == 16 and max(cpu) <= 128 * 1024 * 1024
recipe = read(art / f'urban-buildings-m2-4-batch{batch}-r1/recipe.json')
assert len(recipe['actualSampling']) == (24 if batch == 54 else 32)
assert min(row['availableDensity'] for row in recipe['actualSampling']) >= 4
prior_file = Path('.artifacts/m2-4/urban-accepted-actors-batch53-v1/coverage-delta.json'
    if batch == 54 else f'.artifacts/m2-4/urban-buildings-batch{batch - 1}-v1/coverage-delta.json')
prior = read(prior_file)
covered = [r for r in prior['remainingGaps'] if r['member'] in sources and r['sha256'] == sources[r['member']]['sha256']]
assert len(covered) == 8
keys = {r['key'] for r in covered}
remaining = [r for r in prior['remainingGaps'] if r['key'] not in keys]
assert len(remaining) == {54: 79, 55: 71, 56: 63}[batch]
for archive in prior['archives']:
    assert sha(Path(archive['file'])) == archive['sha256']
closure = dict(status='PASS_EIGHT_COMPLETE_FAMILIES_16_NATIVE_DENSITY_CASES_AND_ORIGINAL_MAP',
    selectedEnvironment=contract['selectedPack'], nativeReports=reports, cases=cases,
    verification=record(art / 'verification-v1.json'), runtimeStage=record(root / 'active-stage.json'),
    worldAllocationBytes=peaks, preparedPeakBytes=max(cpu), sourceStateImages=24 if batch == 54 else 32,
    runtimeStateImages={54: 23, 55: 32, 56: 24}[batch],
    retainedUnusedSlot={54: 'CASANF15 occupied slot is preserved; original rules disallow garrison',
        55: None, 56: 'Eight stadium slot-2 bodies are preserved; original rules disallow garrison'}[batch],
    releaseAndOriginalReentryCases=1,
    visual='PENDING_24_NEW_ART_STATES_AND_FIVE_SOURCE_PALETTE_CELLS' if batch == 54 else 'PENDING_32_NEW_ART_STATES_ONLY',
    deduplication=f'All eight actual original identities exercised on {edition}/{map_name} at both densities; identical original source, palette, geometry and complete-family bindings on other maps share this loader path. No full-match-per-map claim.',
    windows='NOT_RUN', m24Complete=False)
delta = dict(status='PASS_INCREMENTAL_COMPLETE_URBAN_BUILDINGS_VISUAL_PENDING',
    priorDelta=record(prior_file), baseline=prior['baseline'], selectedEnvironment=contract['selectedPack'],
    selectedTerrain=prior['selectedTerrain'], totalUrbanMapEntries=32, uniqueUrbanMapHashes=26,
    newCompleteSourceGroups=8, newArtStates=24 if batch == 54 else 32, covered=covered,
    remainingGapFamilies=len(remaining), remainingByKind=dict(collections.Counter(r['kind'] for r in remaining)),
    remainingGaps=remaining, archives=prior['archives'], unchangedMapBytes=True, unchangedDependencyKeys=True,
    visual=closure['visual'], windows='NOT_RUN', m24Complete=False)
for name, value in [('native-closure.json', closure), ('coverage-delta.json', delta)]:
    with (root / name).open('x') as stream: stream.write(json.dumps(value, indent=2) + '\n')
print(json.dumps(dict(status=closure['status'], remaining=delta['remainingByKind'], worldAllocationBytes=peaks)))
