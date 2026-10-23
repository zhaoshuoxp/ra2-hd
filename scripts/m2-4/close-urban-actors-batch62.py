"""Close changed source paths, native mechanics and unchanged-budget lifecycle evidence."""
import collections
import hashlib
import json
from pathlib import Path

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
record = lambda p: dict(file=str(p), sha256=sha(p))
base = Path('.artifacts/m2-4')
root = base / 'urban-actors-native-batch62-v1'
run_file = root / 'native-run-v1.json'
run = read(run_file)
assert run['status'] == 'PASS_CHANGED_ACTOR_PATHS' and len(run['cases']) == 12
contract = read(Path('desktop/environment-urban-hd-contract.json'))
assert run['selectedEnvironment'] == contract['selectedPack']
sources = {s['member']: s for s in read(root / 'source.json')['sources']}
shp = read(base / 'urban-actors-authoring-batch62-v1/verification-v1.json')
vxl = read(base / 'urban-actors-voxel-authoring-batch62-v2/verification-v1.json')
assert shp['status'] == 'PASS' and shp['counts']['densityFrames'] == 1204
assert vxl['densityBearings'] == 96
peaks, cpu, reports, actor_cases, vehicle_cases = {'2': 0, '4': 0}, [], [], [], []
cross = 0
for spec in run['cases']:
    file = Path(spec['report'])
    assert sha(file) == spec['sha256']
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['edition'] == spec['edition'] and report['selectedMap'] == spec['map']
    reports.append(record(file))
    if spec['density'] == 1:
        assert report['fallback']['terrain']['worldChargeBytes'] == 0
        assert report['fallback']['environment']['worldChargeBytes'] == 0
        continue
    density = spec['density']
    allocation = report['combinedWorldAllocation']
    assert allocation['limit'] == (512 if density == 2 else 1280) * 1024**2
    assert allocation['total'] <= allocation['limit'] and report['graphics']['glError'] == 0
    peaks[str(density)] = max(peaks[str(density)], allocation['total'])
    cpu.append(report['graphics']['prepared']['peakBytes'])
    assert report['selectedEnvironmentRevision'] == contract['selectedPack']['revision']
    if spec['kind'] == 'infantry':
        for actor in report['newNativeStates']['actors']:
            name = actor['name']
            assert {'ready', 'walk', 'cheer', 'wounded', 'death'}.issubset(actor['samples'])
            assert actor['samples']['walk']['moving'] and actor['samples']['death']['destroyed']
            if name == 'SSRV':
                assert actor['samples']['fire']['firing'] and actor['nativeAttackChangedHealth']
            family = contract['identities'][spec['edition']][name]
            assert report['environment']['families'][family]['status'] == 'PUBLISHED_COMPLETE_FAMILY'
            source = next(s for s in sources.values() if any(b['id'] == name for b in s['bindings']))
            assert all(sample['bodyFrameCount'] == source['totalFrames']//2
                and f'/{source["sha256"]}/URBAN/tiles/{density}' in sample['hd']
                for sample in actor['samples'].values())
            actor_cases.append(dict(identity=name, edition=spec['edition'], density=density,
                observedStates=list(actor['samples']), nativeAttack=name == 'SSRV'))
    else:
        native = report['newNativeNeutralVehicles']
        assert native['status'] == 'PASS_ORIGINAL_PLACEMENTS_ALL_NATIVE_BEARINGS_MOVE_DAMAGE_AND_DESTRUCTION'
        for actor in native['cases']:
            assert len(actor['bearings']) == 8 and len(actor['moves']) == 2
            assert actor['original']['active'] and actor['destroyed']['destroyed']
            assert actor['damaged']['active'] and actor['damaged']['health'] < 100
            vehicle_cases.append(dict(identity=actor['name'], density=density, nativeMoves=2, bearings=8))
        if density == 4:
            assert native['lifecycle']['released'] == dict(oldFamilies=0, oldGpuBytes=0, originalGpuBytes=0)
            assert native['lifecycle']['nextTheaterExcluded']
            assert report['crossTheater']['options']['mapName'] == 'xdisaster.map'
            assert any(name.startswith('snow-') for name in report['crossTheater']['currentEnvironment']['families'])
            cross += 1
    if density == 4:
        assert report['release']['environment']['disposed'] and report['release']['environment']['worldChargeBytes'] == 0
        assert report['release']['terrain']['disposed'] and report['release']['terrain']['worldChargeBytes'] == 0
assert len(actor_cases) == 8 and len(vehicle_cases) == 12 and cross == 2
assert max(cpu) <= 128 * 1024**2
prior_file = base / 'urban-linked-alignment-r1-v1/coverage-delta.json'
prior = read(prior_file)
assert prior['remainingGapFamilies'] == 9
covered = [row for row in prior['remainingGaps'] if row['member'] in sources
    and row['sha256'] == sources[row['member']]['sha256']]
assert len(covered) == 9
keys = {row['key'] for row in covered}
remaining = [row for row in prior['remainingGaps'] if row['key'] not in keys]
assert not remaining
delta = dict(status='TECHNICALLY_COMPLETE_URBAN_SOURCE_ROOTS_NEW_ART_VISUAL_PENDING',
    priorDelta=record(prior_file), baseline=prior['baseline'], selectedEnvironment=contract['selectedPack'],
    selectedTerrain=prior['selectedTerrain'], totalUrbanMapEntries=32, uniqueUrbanMapHashes=26,
    newCompleteSourceGroups=9, covered=covered, remainingGapFamilies=0, remainingByKind={}, remainingGaps=[],
    archives=prior['archives'], unchangedMapBytes=True, unchangedDependencyKeys=True,
    visual='BATCH62_PENDING; OTHER_BATCH_ACCEPTANCE_UNCHANGED', windows='NOT_RUN', m24Complete=False)
closure = dict(status='PASS_1204_SHP_FRAMES_96_VXL_BEARINGS_AND_12_MAC_CASES',
    selectedEnvironment=contract['selectedPack'], runtimeStage=record(root / 'active-stage.json'),
    nativeRun=record(run_file), nativeReports=reports, actorCases=actor_cases, vehicleCases=vehicle_cases,
    worldAllocationBytes=peaks, preparedPeakBytes=max(cpu), crossTheaterReleaseAndOriginalReentryCases=cross,
    deduplication=run['deduplication'], originalControls='Four actual source-map Original controls; both actor states and all six vehicle eight-bearing controls included once per changed path.',
    reusedEvidence='All 284 earlier SHP families, both accepted neutral vehicle descriptors, terrain and military art matrices remain unchanged. RA2 2X/4X successful cases are reused after validation-only harness additions; failed attempts remain retained.',
    failures=[dict(file=str(root/'native-inf-ra2-2x-v1.log'), reason='App process launch failed in the default sandbox before a runtime report; the same signed app and inputs pass with GUI process permission.'),
        dict(file=str(root/'native-vehicles-2x-v1/report.json'), reason='SHP-only harness precondition rejected an explicitly vehicle-only case before vehicle checks. The scoped harness now requires separate native vehicle bindings and actions; no game code or resource changed for this retry.')],
    visual='PENDING_COMBINED_REVIEW', windows='NOT_RUN', m24Complete=False)
for name, value in [('native-closure.json', closure), ('coverage-delta.json', delta)]:
    with (root / name).open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')
print(json.dumps(dict(status=closure['status'], worldMiB={k: round(v/1024**2, 2) for k, v in peaks.items()},
    preparedPeakMiB=round(max(cpu)/1024**2, 2), remainingUrbanSourceGaps=0, visual='PENDING')))
