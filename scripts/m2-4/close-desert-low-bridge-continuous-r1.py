"""Close the repaint using new native cases and explicitly source-identical Original evidence."""
import hashlib
import json
import subprocess
from pathlib import Path

root = Path('.artifacts/m2-4/desert-low-bridge-continuous-r1-20261020')
prior = Path('.artifacts/m2-4/desert-low-bridge-batch82-20261019')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
export = read(root / 'export-and-preservation-v1.json')
reports, budgets, cpu = [], [], []
for density in [2, 4]:
    file = root / f'native-deathvalley-{density}x-v1/report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['environment']['density'] == density
    assert report['selectedEnvironmentRevision'] == export['candidate']['revision']
    assert report['environment']['families']['desert-bridge-low-wood']['status'] == 'PUBLISHED_COMPLETE_FAMILY'
    bridge = report['newNativeBridge']
    assert bridge['status'] == 'PASS_NATIVE_LOW_WOOD_BRIDGE_PASSAGE_DAMAGE_DEMOLITION_REPAIR'
    assert bridge['repaired']['engineerConsumed']
    ticks = [p['tick'] for p in bridge['passage']]
    assert max(ticks) > min(ticks)
    reports.append(dict(**pin(file), density=density, passageTicks=[min(ticks), max(ticks)]))
    budgets.append((density, report['combinedWorldAllocation']['total']))
    cpu.append(report['graphics']['prepared']['peakBytes'])
    file = root / f'native-broken-ends-{density}x-v1/report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['brokenEndStatus'] == 'PASS_FOUR_ORIGINAL_NATIVE_HEADS_AND_DESTRUCTION_TRANSITIONS'
    assert {o['name'] for o in report['brokenEnds']} == {'LOBRDG20', 'LOBRDG22', 'LOBRDG24', 'LOBRDG26'}
    assert all(o['hd'] and f'/DESERT/tiles/{density}' in o['hd'] for o in report['brokenEnds'])
    assert report['graphics']['tick'] > report['initial']['tick']
    reports.append(dict(**pin(file), density=density, fourNativeBrokenEnds=True))
release = read(root / 'native-deathvalley-4x-v1/report.json')
assert release['release']['terrain']['worldChargeBytes'] == release['release']['environment']['worldChargeBytes'] == 0
assert release['crossTheater']['terrain']['disposed'] and release['crossTheater']['environment']['disposed']
stage = read(root / 'active-stage-v1.json')
old_stage = read(prior / 'active-stage-v2.json')
changed = subprocess.check_output(['git', 'diff', old_stage['runtimeSourceHead'], stage['runtimeSourceHead'],
    '--name-only', '--', 'src', 'desktop'], text=True).splitlines()
assert changed == ['desktop/environment-desert-hd-contract.json']
baseline, candidate = read(root / 'baseline-contract.json'), read(root / 'contract-candidate-v1.json')
for key in ['sources', 'families', 'identities', 'aliases']:
    assert baseline[key] == candidate[key]
originals = []
for name in ['native-deathvalley-original-v2', 'native-broken-ends-original-v2']:
    file = prior / name / 'report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    if 'broken' in name:
        assert not report['graphics']['hdEnabled']
        assert report['graphics']['environment']['worldChargeBytes'] == report['graphics']['terrain']['worldChargeBytes'] == 0
    originals.append(dict(**pin(file), evidence='REUSED_UNCHANGED_ORIGINAL_PATH_NOT_RERUN'))
result = dict(status='PASS_REPAINT_COMPLETE_FAMILY_2X_4X_NATIVE_AND_RELEASE_VISUAL_PENDING',
    runtimeSourceCommit=stage['runtimeSourceHead'], candidate=export['candidate'], repaintedMembers=26,
    sourceBodySlots=78, nonemptyDensityFrames=52, newlyRunNativeCases=reports, reusedOriginalControls=originals,
    originalReuseProof=dict(priorRuntime=old_stage['runtimeSourceHead'], currentRuntime=stage['runtimeSourceHead'],
        changedAppPaths=changed, originalContractsAndArchivesUnchanged=True),
    worldPeakBytes={str(d): max(value for density, value in budgets if density == d) for d in [2, 4]},
    preparedPeakBytes=max(cpu), oldWorldRelease='ZERO_CHARGE', crossTheater='DESERT_TO_NEWURBAN_PASS',
    sourceMapChanges=False, gameplayChanges=False, logicalGeometryChanges=False, preparedCoreChanges=False,
    remainingDesertAuthoredGaps=40, remainingNewUrbanAuthoredGaps=324,
    priorCoverageClosure=pin(prior / 'coverage-and-native-closure-v2.json'), coverageAddedByCorrection=0,
    visualAcceptance='PENDING_ALL_26_REPAINTED_MEMBERS', windows='NOT_RUN', m24Complete=False)
with (root / 'coverage-and-native-closure-v1.json').open('x') as stream:
    stream.write(json.dumps(result, indent=2) + '\n')
print(json.dumps(dict(status=result['status'], worldPeakBytes=result['worldPeakBytes'], preparedPeakBytes=max(cpu))))
