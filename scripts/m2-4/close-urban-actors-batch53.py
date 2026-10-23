"""Close complete actor reuse using actual Mac bindings, native mechanics and source hashes."""
import collections
import hashlib
import json
from pathlib import Path

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
record = lambda p: dict(file=str(p), sha256=sha(p))
root = Path('.artifacts/m2-4/urban-accepted-actors-batch53-v1')
native = Path('.artifacts/m2-4/urban-accepted-actors-native-batch53-v1')
export = Path('.artifacts/m2-4/urban-accepted-actors-export-batch53-v2')
contract = read(Path('desktop/environment-urban-hd-contract.json'))
patch = read(export / 'contract.json')
pack_root = Path('.local/environment-packs') / contract['selectedPack']['revision']
assert sha(pack_root / 'manifest.json') == contract['selectedPack']['sha256']
pack = read(pack_root / 'manifest.json')
assert len(pack['families']) == 206
verified = read(export / 'verification-v1.json')
assert verified['status'] == 'PASS_COMPLETE_ACCEPTED_ACTORS_AND_BOUNDED_NATIVE_PALETTE_ADAPTATION'
sources = {s['member']: s for s in read(native / 'source.json')['sources']}
reports, peaks, cpu = [], {'2': 0, '4': 0}, []
for kind, family, map_name in [('gate', 'urban-snow-gagate-a', 'xbarrel.map'),
                               ('civsfm', 'urban-civsfm', 'xhailmary.map')]:
    member, = pack['families'][family]['members']
    source = sources[member['member']]
    for density in [2, 4]:
        file = root / f'native-{kind}-{density}x-v1/report.json'
        report = read(file)
        assert report['status'] == 'PASS_SELECTED_NATIVE_CASES'
        assert report['selectedMap'] == map_name and report['theater'] == 'URBAN'
        assert report['selectedEnvironmentRevision'] == contract['selectedPack']['revision']
        published = report['environment']['families'][family]
        assert published['status'] == 'PUBLISHED_COMPLETE_FAMILY' and not published['attempts']
        identity = f'{member["sha256"]}/{source["sha256"]}/URBAN/tiles/{density}'
        assert any(identity in row['hd'] for row in report['newNativeBindings'])
        if kind == 'civsfm':
            states = report['newNativeStates']
            assert states['status'] == 'PASS_SEQUENTIAL_NATIVE_BUILDING_ACTOR_AND_ANIMATION_CASES'
            actor, = states['actors']
            assert actor['name'] == 'CIVSFM'
            samples = actor['samples']
            assert {'ready', 'walk', 'cheer', 'wounded', 'death'}.issubset(samples)
            assert all(row['hd'] == identity and row['bodyFrameCount'] == 239 for row in samples.values())
            assert samples['walk']['moving'] and samples['wounded']['panicked'] and samples['death']['destroyed']
        if density == 4:
            for name in ['environment', 'terrain']:
                assert report['release'][name]['disposed'] and report['release'][name]['worldChargeBytes'] == 0
            assert report['release']['currentEnvironment']['worldChargeBytes'] == 0
            assert report['release']['currentTerrain']['worldChargeBytes'] == 0
        allocation = report['combinedWorldAllocation']
        assert allocation['limit'] == (512 if density == 2 else 1280) * 1024 * 1024
        assert allocation['total'] <= allocation['limit'] and report['graphics']['glError'] == 0
        peaks[str(density)] = max(peaks[str(density)], allocation['total'])
        cpu.append(report['graphics']['prepared']['peakBytes'])
        reports.append(record(file))
    file = root / f'native-{kind}-original-v1/report.json'
    original = read(file)
    assert original['status'] == 'PASS_SELECTED_NATIVE_CASES' and original['selectedMap'] == map_name
    reports.append(record(file))
for density, version in [(2, 3), (4, 1)]:
    file = root / f'native-gate-actions-{density}x-v{version}/report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES'
    assert report['gateStatus'] == 'PASS_NATIVE_NORMAL_AND_DAMAGED_OPEN_PASSAGE_CLOSE_REPAIR_AND_DESTRUCTION'
    assert report['selectedMap'] == 'xbarrel.map' and report['density'] == density
    assert len(report['originalPlacements']) == 4 and len(report['captures']) == 20
    gate, = pack['families']['urban-snow-gagate-a']['members']
    expected = f'environment-aggregate/{gate["sha256"]}/{sources[gate["member"]]["sha256"]}/URBAN/tiles/{density}'
    assert all(row['hd'] == expected and row['source'] == 'gugate_a.shp' for row in report['originalPlacements'])
    assert report['fixturePlacement']['requestedClearPassage'] and len(report['fixturePlacement']['corridor']) == 24
    assert report['repaired'] and len(report['cycles']) == 2
    assert all(row['entered']['passable'] and row['entered']['phase'] == 9 for row in report['cycles'])
    reports.append(record(file))
assert max(cpu) <= 128 * 1024 * 1024
prior_file = Path('.artifacts/m2-4/urban-rubble-batch52-v1/coverage-delta.json')
prior = read(prior_file)
covered = [r for r in prior['remainingGaps'] if r['member'] in sources and r['sha256'] == sources[r['member']]['sha256']]
assert len(covered) == 2
keys = {r['key'] for r in covered}
remaining = [r for r in prior['remainingGaps'] if r['key'] not in keys]
assert len(remaining) == 87
for archive in prior['archives']:
    assert sha(Path(archive['file'])) == archive['sha256']
delta = dict(status='PASS_COMPLETE_REUSE_MINOR_ORIGINAL_PALETTE_VISUAL_PENDING', priorDelta=record(prior_file),
    baseline=prior['baseline'], selectedEnvironment=contract['selectedPack'], selectedTerrain=prior['selectedTerrain'],
    totalUrbanMapEntries=32, uniqueUrbanMapHashes=26, newCompleteSourceGroups=2, newArtStates=0,
    covered=covered, remainingGapFamilies=len(remaining),
    remainingByKind=dict(collections.Counter(r['kind'] for r in remaining)), remainingGaps=remaining,
    archives=prior['archives'], unchangedMapBytes=True, unchangedDependencyKeys=True, windows='NOT_RUN', m24Complete=False)
closure = dict(status='PASS_COMPLETE_520_DENSITY_FRAMES_AND_EIGHT_MAC_CASES',
    selectedEnvironment=contract['selectedPack'], nativeReports=reports, verification=record(export / 'verification-v1.json'),
    runtimeStage=record(root / 'active-stage.json'), worldAllocationBytes=peaks, preparedPeakBytes=max(cpu),
    completeFamilyFallbackTests=4, loadingAssertions=64, releaseAndOriginalReentryCases=2,
    visual='Accepted family reuse; five fixed-palette source cells await combined review with batch 54',
    deduplication='One actual unchanged map per complete source family at each density. Other original gate placements use identical SHP, native palette and metadata; complete Snow artwork acceptance is reused.',
    diagnostics=[dict(file=str(root / 'native-gate-actions-2x-v1/report.json'),
        reason='Gate opened and unit entered; the hardcoded exit coordinate was not reached. Retry requires a verified clear existing corridor.'),
        dict(file=str(root / 'native-gate-actions-2x-v2.log'),
        reason='Target page closed during the first clear-corridor attempt; no final report was saved. Cause unproven. Bounded candidate search and durable failure save added before the passing v3.'),
        dict(file='.artifacts/m2-4/urban-accepted-actors-batch53-loading-tests-v1.log',
        reason='Invalid negative test assumption: CIVSFM is a valid source in both Urban and Snow. Corrected to reject an invalid source hash; runtime unchanged.')],
    windows='NOT_RUN', m24Complete=False)
for name, value in [('native-closure.json', closure), ('coverage-delta.json', delta)]:
    with (root / name).open('x') as stream: stream.write(json.dumps(value, indent=2) + '\n')
print(json.dumps(dict(status=closure['status'], remaining=delta['remainingByKind'], worldAllocationBytes=peaks)))
