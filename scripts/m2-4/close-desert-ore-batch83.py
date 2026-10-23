"""Close all original ore members using native bindings, gathering and growth evidence."""
import hashlib
import json
import subprocess
from pathlib import Path

root = Path('.artifacts/m2-4/desert-ore-batch83-20261020')
prior = Path('.artifacts/m2-4/desert-low-bridge-continuous-r1-20261020')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
export, audit = (read(root / name) for name in ['export-and-preservation-v1.json', 'static-audit-v1.json'])
contract = read(root / 'contract-candidate-v1.json')
guide_file = Path('.artifacts/m2-4/desert-native-v1/source.json')
sources = {s['member']: s for s in read(guide_file)['sources']}
members = contract['families']['desert-ore']['members']
identity_members = {b['id']: name for name in members for b in sources[name]['bindings']}
assert len(identity_members) == 24 and len(members) == 12
expected = {row['member']: row for row in audit['memberRecords']}
reports, peaks, cpu, all_bindings = [], {}, [], []
for density in [2, 4]:
    file = root / f'native-monument-{density}x-v2/report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['selectedMap'] == 'monumentvalley.map' and report['theater'] == 'DESERT'
    assert report['selectedEnvironmentRevision'] == export['candidate']['revision']
    assert report['environment']['density'] == density and report['graphics']['glError'] == 0
    family = report['environment']['families']['desert-ore']
    assert family['status'] == 'PUBLISHED_COMPLETE_FAMILY' and sorted(family['members']) == members
    bindings, seen = [], set()
    for binding in report['newNativeBindings']:
        name = identity_members[binding['name']]
        row = expected[name]
        hd = f"{row['metadataSha256']}/{row['sourceSha256']}/DESERT/tiles/{density}"
        assert binding['hd'] == hd and binding['batchedHd'] and binding['spawned']
        assert 0 <= binding['frame'] <= 11
        seen.add(name)
        bindings.append(dict(identity=binding['name'], member=name, tile=binding['tile'],
            nativeFrame=binding['frame'], hd=binding['hd']))
    assert seen == set(members), 'The original map must bind every canonical source member'
    actions = report['newNativeResources']
    assert actions['status'] == 'PASS_NATIVE_ORE_GATHER_DEPLETION_AND_CREATED_ORE_HD'
    harvest, = actions['harvest']
    assert harvest['kind'] == 'ore' and harvest['before']['value'] > harvest['gathering']['value']
    assert harvest['gathering']['frame'] == harvest['gathering']['value']
    assert harvest['gathering']['miner']['ore'] > 0
    assert harvest['depleted']['value'] == -1 and not harvest['depleted']['spawned']
    assert not harvest['depleted']['batchedEntryPresent']
    assert actions['growthBefore']['resources'] == []
    grown = actions['growthAfter']['resources']
    assert grown and all(b['frame'] == b['value'] == 3 and b['batchedHd'] for b in grown)
    assert actions['growthAfter']['tick'] > actions['growthBefore']['tick']
    for capture in [harvest['beforeCapture'], harvest['gatheringCapture'], harvest['depletedCapture'], actions['growthCapture']]:
        assert capture['cameraUpdateAwaited'] and capture['targetWithinViewport']
    total, limit = report['combinedWorldAllocation']['total'], report['combinedWorldAllocation']['limit']
    assert limit == {2: 512, 4: 1280}[density] * 1024 ** 2 and total <= limit
    prepared = report['graphics']['prepared']['peakBytes']
    assert prepared <= 128 * 1024 ** 2
    peaks[str(density)], cpu = total, cpu + [prepared]
    reports.append(dict(**pin(file), density=density, nativeBindings=len(bindings),
        canonicalMembers=len(seen), placedIdentities=sorted({b['identity'] for b in bindings}),
        harvestTicks=[harvest['before']['tick'], harvest['depleted']['tick']],
        growthTicks=[actions['growthBefore']['tick'], actions['growthAfter']['tick']]))
    all_bindings.append(dict(density=density, bindings=bindings))
release = read(root / 'native-monument-4x-v2/report.json')
for phase in ['release', 'crossTheater']:
    assert release[phase]['terrain']['disposed'] and release[phase]['environment']['disposed']
    assert release[phase]['terrain']['worldChargeBytes'] == release[phase]['environment']['worldChargeBytes'] == 0
assert release['crossTheater']['glError'] == 0
original_file = root / 'native-monument-original-v1/report.json'
original = read(original_file)
assert original['status'] == 'PASS_SELECTED_NATIVE_CASES' and not original['errors']
assert original['selectedMap'] == release['selectedMap'] and original['captureRoute'] == release['captureRoute']
assert original['matchedOutput'] == release['graphics']['output'] == [1489, 1080]
assert original['fallback']['glError'] == 0
for kind in ['terrain', 'environment']:
    assert original['fallback'][kind]['density'] == 1 and original['fallback'][kind]['worldChargeBytes'] == 0
stage = read(root / 'active-stage-v1.json')
old_stage = read(prior / 'active-stage-v1.json')
changed = subprocess.check_output(['git', 'diff', old_stage['runtimeSourceHead'], stage['runtimeSourceHead'],
    '--name-only', '--', 'src', 'desktop'], text=True).splitlines()
assert changed == ['desktop/environment-desert-hd-contract.json']
prior_coverage_file = Path('.artifacts/m2-4/desert-low-bridge-batch82-20261019/coverage-and-native-closure-v2.json')
coverage = read(prior_coverage_file)
closed = [row for row in coverage['remainingDesertGaps'] if row['member'] in members]
remaining = [row for row in coverage['remainingDesertGaps'] if row['member'] not in members]
assert len(closed) == 12 and len(remaining) == 28 and all(r['kind'] == 'building' for r in remaining)
maps = sorted({map_id for name in members for b in sources[name]['bindings'] for map_id in b['mapIds']})
assert len(maps) == 8
result = dict(status='PASS_COMPLETE_ORE_2X_4X_NATIVE_AND_SOURCE_CLOSURE_VISUAL_PENDING',
    runtimeSourceCommit=stage['runtimeSourceHead'], candidate=export['candidate'], family='desert-ore',
    canonicalMembers=12, supportedIdentities=24, sourceBodyFrames=148, authoredDensityFrames=296,
    sourceShadowFrames=148, originalStandardMaximumFrame=11,
    originalExtraBodyFrames=export['originalExtraBodySlots'],
    extraFrameEvidence='SOURCE_PRESERVED_AND_LOADER_VALIDATED_NOT_FORCED_AS_NATIVE_GROWTH',
    coveredPlacedMaps=maps, nativeCases=reports, originalControl=pin(original_file),
    originalComparison='Same source, seed, output and camera. Resource amounts advance naturally; no same-tick assertion.',
    deduplication='All 12 original SHP members and both alias paths bind in Monument Valley. The eight placed-map routes use the same hash-pinned batched resource path; no catalog or rule change is introduced.',
    bindingEvidence=all_bindings, worldPeakBytes=peaks, preparedPeakBytes=max(cpu),
    sourcePathProof=dict(priorRuntime=old_stage['runtimeSourceHead'], changedAppPaths=changed),
    oldWorldRelease='ZERO_CHARGE', crossTheater='DESERT_TO_NEWURBAN_AND_ORIGINAL_REENTRY_PASS',
    priorCoverageClosure=pin(prior / 'coverage-and-native-closure-v1.json'),
    remainingMemberInventory=pin(prior_coverage_file), remainingDesertAuthoredGaps=28,
    remainingDesertByKind=dict(building=28), remainingDesertGaps=remaining,
    remainingNewUrbanAuthoredGaps=coverage['remainingNewUrbanAuthoredGaps'],
    unresolvedConditionalGroupsPreserved=coverage['unresolvedConditionalGroupsPreserved'],
    priorWoodAcceptance=pin(prior / 'user-acceptance-20261020.json'),
    sourceMapsChanged=False, gameplayChanged=False, logicalGeometryChanged=False, corePreparedChanged=False,
    visualAcceptance='PENDING_12_NEW_ORE_MEMBERS', windows='NOT_RUN', m24Complete=False)
with (root / 'coverage-and-native-closure-v2.json').open('x') as stream:
    stream.write(json.dumps(result, indent=2) + '\n')
print(json.dumps(dict(status=result['status'], canonicalMembers=12, worldPeakBytes=peaks,
    preparedPeakBytes=max(cpu), placedMaps=len(maps), remainingDesert=28)))
