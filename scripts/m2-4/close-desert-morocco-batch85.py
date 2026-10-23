"""Close ten complete Desert families after source, native state and lifecycle proof."""
import collections
import hashlib
import json
from pathlib import Path

ROOT = Path('.artifacts/m2-4/desert-morocco-batch85-20261020')
NATIVE = Path('.artifacts/m2-4/desert-morocco-native-batch85-v1')
ART = Path('.artifacts/m2-4/desert-morocco-authoring-batch85-v1')
PRIOR = Path('.artifacts/m2-4/legacy-faction-reuse-batch84-20261020/coverage-and-native-closure-v1.json')
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
pin = lambda path: dict(file=str(path), sha256=sha(path), bytes=path.stat().st_size)
patch = read(NATIVE / 'contract.json')
contract = read(Path('desktop/environment-desert-hd-contract.json'))
pack_root = Path('.local/environment-packs') / contract['selectedPack']['revision']
assert sha(pack_root / 'manifest.json') == contract['selectedPack']['sha256']
pack = read(pack_root / 'manifest.json')
sources = {source['member']: source for source in read(NATIVE / 'source.json')['sources']}
names = set(patch['identities']['yr'])
assert len(names) == len(sources) == 10
assert read(ART / 'verification-v1.json')['counts']['densityFrames'] == 80
assert read(ART / 'mother-capacity-qa-v7.json')['status'] == 'ALL_40_SOURCE_STATES_HAVE_4X_CAPACITY'
recipe = read(ART / 'desert-m2-4-morocco-batch85-v1/recipe.json')
assert len(recipe['actualSampling']) == 40
assert min(row['availableDensity'] for row in recipe['actualSampling']) >= 4
cases, reports, peaks, cpu = [], [], {}, []
for density in [2, 4]:
    file = ROOT / f'native-sahara-{density}x-v1/report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['selectedMap'] == 'saharami.map' and report['edition'] == 'yr'
    assert report['theater'] == 'DESERT'
    assert report['selectedEnvironmentRevision'] == contract['selectedPack']['revision']
    states = report['newNativeStates']
    assert states['status'] == 'PASS_SEQUENTIAL_NATIVE_BUILDING_ACTOR_AND_ANIMATION_CASES'
    assert {row['normal']['name'] for row in states['buildings']} == names
    assert len(states['evacuation']) == len(states['criticalDamageEvacuation']) == 10
    for row in states['buildings']:
        name = row['normal']['name']
        family = patch['identities']['yr'][name]
        member, = pack['families'][family]['members']
        source = sources[member['member']]
        assert any(binding['id'] == name and 'yr:saharami.map' in binding['mapIds']
                   for binding in source['bindings'])
        identity = f'environment-aggregate/{member["sha256"]}/{source["sha256"]}/DESERT/tiles/{density}'
        published = report['environment']['families'][family]
        assert published['status'] == 'PUBLISHED_COMPLETE_FAMILY' and not published['attempts']
        assert row['normal']['initial']['hd'] == identity
        for state, frame in [('normal', 0), ('damaged', 1), ('occupied', 2)]:
            assert row[state]['hd'] == identity and row[state]['frame'] == frame
            assert row[state + 'Capture']['rescaled'] is False
        assert row['occupied']['occupants'] == 1 and row['normal']['leaveRubble']
        assert row['destroyed']['destroyed']
        assert row['destroyed']['rubble'] == dict(hd=identity, frame=3, visible=True)
        assert row['rubbleCapture']['rescaled'] is False
        assert patch['sources'][member['member']]['framePalettes']['3']['runtimeUsed']
        cases.append(dict(name=name, family=family, member=member['member'], sourceSha256=source['sha256'],
                          density=density, identity=identity, nativeStates=[0, 1, 2, 3]))
    allocation = report['combinedWorldAllocation']
    assert allocation['limit'] == {2: 512, 4: 1280}[density] * 1024 ** 2
    assert allocation['total'] <= allocation['limit'] and report['graphics']['glError'] == 0
    peaks[str(density)] = allocation['total']
    cpu.append(report['graphics']['prepared']['peakBytes'])
    if density == 4:
        for section in ['release', 'crossTheater']:
            for kind in ['environment', 'terrain']:
                assert report[section][kind]['disposed']
                assert report[section][kind]['worldChargeBytes'] == 0
        assert report['release']['currentEnvironment']['worldChargeBytes'] == 0
        assert report['release']['currentTerrain']['worldChargeBytes'] == 0
        assert report['crossTheater']['currentEnvironment']['density'] == 4
        assert report['crossTheater']['currentTerrain']['density'] == 4
        assert report['crossTheater']['glError'] == 0
    reports.append(pin(file))
assert len(cases) == 20 and max(cpu) <= 128 * 1024 ** 2
original_file = ROOT / 'native-sahara-original-v1/report.json'
original = read(original_file)
assert original['status'] == 'PASS_SELECTED_NATIVE_CASES' and not original['errors']
assert original['selectedMap'] == 'saharami.map' and original['edition'] == 'yr'
assert original['fallback']['environment']['worldChargeBytes'] == 0
assert original['fallback']['terrain']['worldChargeBytes'] == 0
assert original['fallback']['glError'] == 0
reports.append(pin(original_file))
prior = read(PRIOR)
theaters = []
for old in prior['theaters']:
    result = dict(old)
    if old['theater'] == 'DESERT':
        covered = [row for row in old['remainingGaps'] if row['member'] in sources
                   and row['sha256'] == sources[row['member']]['sha256']]
        assert len(covered) == 10
        keys = {row['key'] for row in covered}
        remaining = [row for row in old['remainingGaps'] if row['key'] not in keys]
        result.update(newCompleteSourceGroups=10, newAuthoredStates=40,
            coveredSourceGroups=covered, remainingGaps=remaining, remainingAuthoredGaps=len(remaining),
            remainingByKind=dict(collections.Counter(row['kind'] for row in remaining)),
            nativeDeduplication=read(NATIVE / 'native-plan-v1.json')['deduplication'])
    theaters.append(result)
assert [row['remainingAuthoredGaps'] for row in theaters] == [4, 310]
inventory_file = Path(prior['currentInventory']['file'])
assert sha(inventory_file) == prior['currentInventory']['sha256']
inventory = read(inventory_file)
maps = [row for row in inventory['maps'] if row['theater'] == 'DESERT'
        and any(row['mapId'] in group['maps'] for group in theaters[0]['coveredSourceGroups'])]
for row in maps:
    assert row['runtimeEligibility'] == 'ELIGIBLE_FOR_FOCUSED_NATIVE_MATCH'
closure = dict(status='PASS_TEN_COMPLETE_DESERT_BUILDINGS_20_NATIVE_DENSITY_CASES_AND_ORIGINAL',
    runtimeSourceCommit=read(ROOT / 'active-stage-v1.json')['runtimeSourceHead'],
    candidate=contract['selectedPack'], priorClosure=pin(PRIOR), currentInventory=pin(inventory_file),
    sourceGuide=pin(NATIVE / 'source.json'), sourceContract=pin(NATIVE / 'contract.json'),
    sourceVerification=pin(ART / 'verification-v1.json'), motherCapacity=pin(ART / 'mother-capacity-qa-v7.json'),
    selection=pin(NATIVE / 'selection-v1.json'), assembly=pin(NATIVE / 'assembly-v1.json'),
    nativeReports=reports, cases=cases, theaters=theaters, maps=maps,
    sourceBodyStates=40, densityFrames=80, originalShadowFrames=40,
    worldPeakBytes=peaks, preparedPeakBytes=max(cpu),
    oldResourceRelease='ZERO_AFTER_ORIGINAL_REENTRY_AND_DESERT_TO_NEWURBAN_SWITCH',
    newSelectableMaps=0, sourceMapsChanged=False, gameplayChanged=False,
    preparedData='UNCHANGED_INPUTS_EXISTING_CORE_PREPARED_INDEX_REUSED',
    reusedEvidence='All accepted preceding artwork, unchanged shared loading/rules and hash-identical per-map source groups. No repeated complete faction or map match matrix.',
    visualAcceptance='PENDING_TEN_NEW_BUILDING_FAMILIES_ONLY', windows='NOT_RUN',
    perBatchGamePackage=False, m24Complete=False)
with (ROOT / 'coverage-and-native-closure-v1.json').open('x') as stream:
    stream.write(json.dumps(closure, indent=2) + '\n')
print(json.dumps(dict(status=closure['status'], worldPeakBytes=peaks, preparedPeakBytes=max(cpu),
    remaining={row['theater']: row['remainingAuthoredGaps'] for row in theaters})))
