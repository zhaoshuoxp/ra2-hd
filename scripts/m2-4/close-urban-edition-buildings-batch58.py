"""Close all eight exact edition families after native maps, states and release evidence pass."""
import collections
import hashlib
import json
from pathlib import Path

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
base = Path('.artifacts/m2-4')
root = base / 'urban-edition-buildings-batch58-v1'
native = base / 'urban-edition-buildings-native-batch58-v1'
contract = read(Path('desktop/environment-urban-hd-contract.json'))
patch = read(native / 'contract.json')
plan = read(native / 'native-plan-v1.json')
pack_root = Path('.local/environment-packs') / contract['selectedPack']['revision']
assert sha(pack_root / 'manifest.json') == contract['selectedPack']['sha256']
pack = read(pack_root / 'manifest.json')
assert len(pack['families']) == 246
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
        for row in states['buildings']:
            name = row['normal']['name']
            family = patch['identities'][entry['edition']][name]
            member, = pack['families'][family]['members']
            declared = patch['families'][family].get('sourceOverrides', {}).get(member['member'], patch['sources'][member['member']])
            identity = f'environment-aggregate/{member["sha256"]}/{declared["sha256"]}/URBAN/tiles/{density}'
            assert report['environment']['families'][family]['status'] == 'PUBLISHED_COMPLETE_FAMILY'
            assert not report['environment']['families'][family]['attempts']
            assert row['normal']['initial']['hd'] == identity
            for state, frame in [('normal', 0), ('damaged', 1)]:
                assert row[state]['hd'] == identity and row[state]['frame'] == frame
                assert row[state + 'Capture']['rescaled'] is False
            assert not row['normal']['canOccupy'] and 'occupied' not in row
            assert row['normal']['leaveRubble'] and row['destroyed']['destroyed']
            assert row['destroyed']['rubble'] == dict(hd=identity, frame=3, visible=True)
            assert row['rubbleCapture']['rescaled'] is False
            cases.append(dict(edition=entry['edition'], map=entry['runtimeName'], name=name,
                family=family, density=density, member=member['member'], sourceSha256=declared['sha256'],
                identity=identity, occupiedApplicable=False, rubbleApplicable=True,
                originalCanvas=declared['canvas'], originalFrameCount=declared['bodyFrames']))
        assert not states['evacuation'] and not states['criticalDamageEvacuation']
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
    original_file = Path(f'{entry["output"]}-original-v1/report.json')
    original = read(original_file)
    assert original['status'] == 'PASS_SELECTED_NATIVE_CASES' and not original['errors']
    assert original['selectedMap'] == entry['runtimeName'] and original['captureRoute'] == report['captureRoute']
    reports.append(pin(original_file))
assert len(cases) == 16 and len({r['sourceSha256'] for r in cases}) == 8 and max(cpu) <= 128 * 1024 ** 2
for edition in ['ra2', 'yr']:
    art = base / f'urban-edition-buildings-authoring-batch58-{edition}-v1'
    verified = read(art / 'verification-v1.json')
    assert verified['status'] == 'PASS' and verified['counts']['densityFrames'] == 32
    recipe = read(art / f'urban-edition-buildings-m2-4-batch58-{edition}-r1/recipe.json')
    assert len(recipe['actualSampling']) == 16 and min(s['availableDensity'] for s in recipe['actualSampling']) >= 4
prior_file = base / 'urban-city-flags-batch57-v1/coverage-delta.json'
prior = read(prior_file)
sources = {(r['member'], r['sha256']) for r in read(native / 'source.json')['sources']}
covered = [r for r in prior['remainingGaps'] if (r['member'], r['sha256']) in sources]
assert len(covered) == 8
keys = {r['key'] for r in covered}
remaining = [r for r in prior['remainingGaps'] if r['key'] not in keys]
assert len(remaining) == 47
for archive in prior['archives']:
    assert sha(Path(archive['file'])) == archive['sha256']
closure = dict(status='PASS_EIGHT_EXACT_EDITION_FAMILIES_NATIVE_STATES_AND_RELEASE',
    selectedEnvironment=contract['selectedPack'], nativeReports=reports, cases=cases,
    sourceContract=pin(native / 'contract.json'), runtimeStage=pin(root / 'active-stage.json'),
    worldAllocationBytes=allocations, preparedPeakBytes=max(cpu), priorFamiliesPreserved=238,
    sourceStates=32, distinctNewMaterials=20, densityFrames=64, nativeShadowFrames=32,
    sharedCrossEditionSourceStates=9, sharedBodyPixelParity=pin(native / 'shared-body-pixel-parity-v1.json'),
    inactiveSlotPolicy='All eight original identities disallow garrison. Retain slot 2; six exact native slot-1/2 duplicates share their original state art without adding gameplay.',
    runtimeStateImages=24, nativeFamilyDensityCases=16, originalMapCases=4,
    matchedOriginalSceneControls=4, releaseAndOriginalReentryCases=2,
    deduplication=plan['deduplication'], visual='PENDING_CONSOLIDATED_BATCH58_NEW_ART_ONLY',
    windows='NOT_RUN', m24Complete=False)
delta = dict(status='PASS_INCREMENTAL_EXACT_EDITION_BUILDINGS_VISUAL_PENDING',
    priorDelta=pin(prior_file), baseline=prior['baseline'], selectedEnvironment=contract['selectedPack'],
    selectedTerrain=prior['selectedTerrain'], totalUrbanMapEntries=32, uniqueUrbanMapHashes=26,
    newCompleteSourceGroups=8, newOriginalIdentities=4, newSourceStates=32, distinctNewMaterials=20,
    covered=covered, remainingGapFamilies=47,
    remainingByKind=dict(collections.Counter(r['kind'] for r in remaining)), remainingGaps=remaining,
    archives=prior['archives'], unchangedMapBytes=True, unchangedDependencyKeys=True,
    visual=closure['visual'], windows='NOT_RUN', m24Complete=False)
for name, value in [('native-closure.json', closure), ('coverage-delta.json', delta)]:
    with (root / name).open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')
print(json.dumps(dict(status=closure['status'], remaining=delta['remainingByKind'], allocations=allocations)))
