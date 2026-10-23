"""Close the complete low bridge family with both native orientations and original controls."""
import collections
import hashlib
import json
from pathlib import Path

root = Path('.artifacts/m2-4/desert-low-bridge-batch82-20261019')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
export = read(root / 'export-and-preservation-v2.json')
static = read(root / 'static-audit-v2.json')
assert static['status'].startswith('PASS_')
reports, charges, cpu, ticks = [], [], [], []
for density in [2, 4]:
    file = root / f'native-deathvalley-{density}x-v2/report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    bridge = report['newNativeBridge']
    assert bridge['status'] == 'PASS_NATIVE_LOW_WOOD_BRIDGE_PASSAGE_DAMAGE_DEMOLITION_REPAIR'
    assert bridge['repaired']['engineerConsumed']
    assert report['environment']['families']['desert-bridge-low-wood']['status'] == 'PUBLISHED_COMPLETE_FAMILY'
    passage_ticks = [sample['tick'] for sample in bridge['passage']]
    assert max(passage_ticks) > min(passage_ticks)
    ticks.append(dict(density=density, first=min(passage_ticks), last=max(passage_ticks)))
    charges.append((density, report['combinedWorldAllocation']['total']))
    cpu.append(report['graphics']['prepared']['peakBytes'])
    reports.append(pin(file))
    file = root / f'native-broken-ends-{density}x-v2/report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['brokenEndStatus'] == 'PASS_FOUR_ORIGINAL_NATIVE_HEADS_AND_DESTRUCTION_TRANSITIONS'
    assert {o['name'] for o in report['brokenEnds']} == {'LOBRDG20', 'LOBRDG22', 'LOBRDG24', 'LOBRDG26'}
    assert all(o['hd'] for o in report['brokenEnds'])
    assert report['graphics']['tick'] > report['initial']['tick']
    reports.append(pin(file))
for name in ['native-deathvalley-original-v2', 'native-broken-ends-original-v2']:
    file = root / name / 'report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    if 'broken' in name:
        assert not report['graphics']['hdEnabled']
        assert report['graphics']['environment']['worldChargeBytes'] == report['graphics']['terrain']['worldChargeBytes'] == 0
        assert all(not o.get('hd') for o in report['brokenEnds'])
    reports.append(pin(file))
release = read(root / 'native-deathvalley-4x-v2/report.json')
assert release['release']['terrain']['worldChargeBytes'] == release['release']['environment']['worldChargeBytes'] == 0
assert release['crossTheater']['terrain']['disposed'] and release['crossTheater']['environment']['disposed']
prior_file = Path('.artifacts/m2-4/desert-dirt-roads-batch81-20261019/coverage-and-native-closure-v7.json')
prior = read(prior_file)
members = {row['member'] for row in export['records']}
covered = [g for g in prior['remainingDesertGaps'] if g['kind'] == 'overlay' and g['member'] in members]
assert len(covered) == 26
remaining = [g for g in prior['remainingDesertGaps'] if g not in covered]
assert len(remaining) == 40
result = dict(status='PASS_COMPLETE_26_MEMBER_LOW_BRIDGE_NATIVE_AND_RESOURCE_CLOSURE_VISUAL_PENDING',
    runtimeSourceCommit=read(root / 'active-stage-v2.json')['runtimeSourceHead'], candidate=export['candidate'],
    exactAcceptedMembers=22, newlyAdaptedBrokenEnds=4, completeMembers=26, nativeReports=reports,
    worldPeakBytes={str(d): max(v for density, v in charges if density == d) for d in [2, 4]},
    preparedPeakBytes=max(cpu), nativePassageTicks=ticks, originalControls='BOTH_INTACT_AND_ALL_FOUR_BROKEN_ENDS',
    oldWorldRelease='ZERO_CHARGE', crossTheater='DESERT_TO_NEWURBAN_PASS', priorClosure=pin(prior_file),
    remainingDesertAuthoredGaps=40, remainingNewUrbanAuthoredGaps=prior['remainingNewUrbanAuthoredGaps'],
    remainingDesertByKind=dict(collections.Counter(g['kind'] for g in remaining)), remainingDesertGaps=remaining,
    unresolvedConditionalGroupsPreserved=prior['unresolvedConditionalGroupsPreserved'],
    sourceMapsChanged=False, gameplayChanged=False, corePreparedChanged=False,
    visualAcceptance='PENDING_FOUR_ADAPTED_BROKEN_ENDS_ONLY', windows='NOT_RUN', m24Complete=False)
with (root / 'coverage-and-native-closure-v2.json').open('x') as stream:
    stream.write(json.dumps(result, indent=2) + '\n')
print(json.dumps(dict(members=26, remainingDesert=40, worldPeakBytes=result['worldPeakBytes'], preparedPeakBytes=max(cpu))))
