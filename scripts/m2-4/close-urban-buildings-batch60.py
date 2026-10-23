"""Close sixteen complete families after source-pinned Mac native state and release checks."""
import collections
import hashlib
import json
from pathlib import Path

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
base = Path('.artifacts/m2-4')
root = base / 'urban-buildings-batch60-v1'
native = base / 'urban-buildings-native-batch60-v1'
art = base / 'urban-buildings-authoring-batch60-v1'
contract = read(Path('desktop/environment-urban-hd-contract.json'))
patch = read(native / 'contract.json')
plan = read(native / 'native-plan-v2.json')
sources = {s['member']: s for s in read(native / 'source.json')['sources']}
pack_root = Path('.local/environment-packs') / contract['selectedPack']['revision']
assert sha(pack_root / 'manifest.json') == contract['selectedPack']['sha256']
pack = read(pack_root / 'manifest.json')
assert len(pack['families']) == 278
reports, cases, allocations, cpu = [], [], {}, []
for entry in plan['cases']:
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
            member, = pack['families'][family]['members']
            declared = patch['sources'][member['member']]
            source = sources[member['member']]
            assert any(b['edition'] == entry['edition'] and entry['sourceMapId'] in b['mapIds'] for b in source['bindings'])
            identity = f'environment-aggregate/{member["sha256"]}/{source["sha256"]}/URBAN/tiles/{density}'
            assert report['environment']['families'][family]['status'] == 'PUBLISHED_COMPLETE_FAMILY'
            assert not report['environment']['families'][family]['attempts']
            assert row['normal']['initial']['hd'] == identity
            for state, frame in [('normal', 0), ('damaged', min(1, declared['bodyFrames'] - 1))]:
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
            rubble = declared.get('framePalettes', {}).get('3', {}).get('runtimeUsed', False)
            assert bool(row['normal']['leaveRubble']) == rubble
            if rubble:
                assert row['destroyed']['rubble'] == dict(hd=identity, frame=3, visible=True)
                assert row['rubbleCapture']['rescaled'] is False
            cases.append(dict(edition=entry['edition'], map=entry['runtimeName'], name=name, family=family,
                density=density, member=member['member'], sourceSha256=source['sha256'], identity=identity,
                occupiedApplicable=occupied, rubbleApplicable=rubble, bodyFrames=declared['bodyFrames']))
        assert len(states['evacuation']) == len(states['criticalDamageEvacuation']) == occupied_count
        if density == 4 and entry['checkRelease']:
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
    file = Path(f'{entry["output"]}-original-v1/report.json')
    original = read(file)
    assert original['status'] == 'PASS_SELECTED_NATIVE_CASES' and not original['errors']
    assert original['selectedMap'] == entry['runtimeName'] and original['captureRoute'] == report['captureRoute']
    reports.append(pin(file))
assert len(cases) == 32 and len({r['sourceSha256'] for r in cases}) == 16
assert sum(r['occupiedApplicable'] for r in cases) == 26 and sum(r['rubbleApplicable'] for r in cases) == 32
assert max(cpu) <= 128 * 1024 ** 2
verified = read(art / 'verification-v1.json')
assert verified['status'] == 'PASS' and verified['counts']['densityFrames'] == 128
recipe = read(art / 'urban-buildings-m2-4-batch60-r1/recipe.json')
assert len(recipe['actualSampling']) == 64 and min(s['availableDensity'] for s in recipe['actualSampling']) >= 4
prior_file = base / 'urban-placeholder-hd-repair-v1/coverage-delta.json'
prior = read(prior_file)
covered = [r for r in prior['remainingGaps'] if r['member'] in sources and r['sha256'] == sources[r['member']]['sha256']]
assert len(covered) == 16
keys = {r['key'] for r in covered}
remaining = [r for r in prior['remainingGaps'] if r['key'] not in keys]
assert len(remaining) == 15 and not {'culit01e.shp', 'cupol01s.shp'} & {r['member'] for r in remaining}
for archive in prior['archives']:
    assert sha(Path(archive['file'])) == archive['sha256']
closure = dict(status='PASS_SIXTEEN_COMPLETE_URBAN_BUILDINGS_NATIVE_STATES_AND_RELEASE', selectedEnvironment=contract['selectedPack'],
    nativeReports=reports, cases=cases, sourceContract=pin(native / 'contract.json'), runtimeStage=pin(root / 'active-stage.json'),
    worldAllocationBytes=allocations, preparedPeakBytes=max(cpu), priorFamiliesPreserved=262, sourceBodyStates=64,
    distinctNewMaterials=63, densityFrames=128, nativeShadows=64, nativeFamilyDensityCases=32, originalMapCases=6,
    releaseAndOriginalReentryCases=2, originalOneFrameFacilities=0,
    inactiveSlotPolicy='CAPARS01, CAWSH12 and CAWASH16 retain original unused occupied art without adding garrison capability. CAPARS01 original slot 2 remains exactly identical to damaged slot 1.',
    deduplication=plan['deduplication'], visual='PENDING_CONSOLIDATED_BATCH60_AND_TWO_FACILITY_REPAIRS', windows='NOT_RUN', m24Complete=False)
delta = dict(status='PASS_INCREMENTAL_COMPLETE_URBAN_BUILDINGS_VISUAL_PENDING', priorDelta=pin(prior_file), baseline=prior['baseline'],
    selectedEnvironment=contract['selectedPack'], selectedTerrain=prior['selectedTerrain'], totalUrbanMapEntries=32, uniqueUrbanMapHashes=26,
    newCompleteSourceGroups=16, sourceBodyStates=64, covered=covered, remainingGapFamilies=15,
    remainingByKind=dict(collections.Counter(r['kind'] for r in remaining)), remainingGaps=remaining, archives=prior['archives'],
    authorizedFacilityRepairsPreserved=['culit01e.shp', 'cupol01s.shp'], unchangedMapBytes=True, unchangedDependencyKeys=True,
    visual=closure['visual'], windows='NOT_RUN', m24Complete=False)
for name, value in [('native-closure.json', closure), ('coverage-delta.json', delta)]:
    with (root / name).open('x') as f:
        f.write(json.dumps(value, indent=2) + '\n')
print(json.dumps(dict(status=closure['status'], remaining=delta['remainingByKind'], allocations=allocations)))
