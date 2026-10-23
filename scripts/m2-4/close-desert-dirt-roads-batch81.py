"""Close actual dirt-road placement coverage without reclassifying raw inventories."""
import collections
import hashlib
import json
from pathlib import Path

root = Path('.artifacts/m2-4/desert-dirt-roads-batch81-20261019')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
export = read(root/'export-and-preservation-v7.json')
guide = read(Path('.artifacts/m2-4/desert-native-v1/source.json'))
sources = {s['member']: s for s in guide['sources']}
inventory_file = Path('.artifacts/m2-4/accepted-faction-routing-batches79-80-20261019/inventory-current-v1/inventory.json')
inventory = read(inventory_file)
expected = {r['member'] for r in export['records']}
assert len(expected) == 81
reports, observed, budgets, cpu = [], set(), [], []
for name in ['tour', 'dryheat', 'sedona', 'dune', 'sahara']:
    file = root/f'native-{name}-4x-v7/report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['terrain']['density'] == 4 and report['graphics']['glError'] == 0
    bindings = [b for b in report['terrain']['placedBindings'] if b['group'] in export['newGroups']]
    assert bindings
    for binding in bindings:
        assert binding['member'] in expected
        assert sources[binding['member']]['images'][binding['subTile']]['nativeOffset'] > 0
    names = {b['member'] for b in bindings}
    observed.update(names)
    budgets.append((4, report['combinedWorldAllocation']['total']))
    cpu.append(report['graphics']['prepared']['peakBytes'])
    reports.append(dict(**pin(file), selectedMap=report['selectedMap'], density=4,
        actualNewPlacements=len(bindings), actualMembers=sorted(names), contextFamily='UNCHANGED_ACCEPTED_TREE_ONLY'))
assert observed == expected
file = root/'native-tour-2x-v7/report.json'
report = read(file)
assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
assert report['terrain']['density'] == 2 and report['graphics']['glError'] == 0
assert all(any(g['id'] == group and g['status'] == 'PUBLISHED' for g in report['terrain']['groups'])
    for group in export['newGroups'])
budgets.append((2, report['combinedWorldAllocation']['total']))
cpu.append(report['graphics']['prepared']['peakBytes'])
reports.append(dict(**pin(file), selectedMap=report['selectedMap'], density=2,
    allNewFamiliesPublished=True, matchedNativeCameras=True))
original = root/'native-tour-original-v7/report.json'
control = read(original)
assert control['status'] == 'PASS_SELECTED_NATIVE_CASES' and not control['errors']
release = read(root/'native-sahara-4x-v7/report.json')
assert release['release']['terrain']['worldChargeBytes'] == release['release']['environment']['worldChargeBytes'] == 0
assert release['crossTheater']['terrain']['disposed'] and release['crossTheater']['environment']['disposed']
prior_file = Path('.artifacts/m2-4/accepted-faction-routing-batches79-80-20261019/coverage-and-native-closure-v1.json')
prior = read(prior_file)
baseline = next(t for t in prior['theaters'] if t['theater'] == 'DESERT')
new_keys = {g['key'] for g in baseline['remainingGaps'] if g['kind'] == 'tmp' and g['member'] in expected}
assert len(new_keys) == 81
remaining = [g for g in baseline['remainingGaps'] if g['key'] not in new_keys]
assert len(remaining) == 66
result = dict(status='PASS_ALL_81_ACTUAL_NATIVE_MEMBERS_2X_4X_ORIGINAL_AND_RELEASE_VISUAL_PENDING',
    runtimeSourceCommit=read(root/'active-stage-v7.json')['runtimeSourceHead'], candidate=export['candidate'],
    nativeReports=reports, originalControl=pin(original), actualNew4XPlacements=sum(r.get('actualNewPlacements', 0) for r in reports),
    actualNewMembers=sorted(observed), nativeZeroPointerReferences=0, worldPeakBytes={str(d): max(v for density, v in budgets if density == d) for d in [2, 4]},
    preparedPeakBytes=max(cpu), oldWorldRelease='ZERO_CHARGE', crossTheater='DESERT_TO_NEWURBAN_PASS',
    priorClosure=pin(prior_file), sourceInventory=pin(inventory_file), newCompleteNativeSets=3,
    newAuthoredSourceGroups=81, remainingDesertAuthoredGaps=66, remainingNewUrbanAuthoredGaps=324,
    remainingDesertByKind=dict(collections.Counter(g['kind'] for g in remaining)), remainingDesertGaps=remaining,
    unresolvedConditionalGroupsPreserved=baseline['unresolvedDependencyGroups'], sourceMapsChanged=False,
    gameplayChanged=False, preparedCoreChanged=False, visualAcceptance='PENDING', windows='NOT_RUN', m24Complete=False)
with (root/'coverage-and-native-closure-v7.json').open('x') as stream:
    stream.write(json.dumps(result, indent=2)+'\n')
print(json.dumps(dict(actualMembers=81, placements=result['actualNew4XPlacements'],
    worldPeakBytes=result['worldPeakBytes'], preparedPeakBytes=result['preparedPeakBytes'], remaining=66)))
