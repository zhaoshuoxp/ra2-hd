"""Pin the passing copied R4 native cases without relabeling historical receipts."""
import argparse
import hashlib
import json
from pathlib import Path


def read(file):
    return json.loads(file.read_text())


def pin(file):
    data = file.read_bytes()
    return dict(file=str(file.resolve()), bytes=len(data), sha256=hashlib.sha256(data).hexdigest())


def gl_errors(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if key == 'glError':
                yield item
            else:
                yield from gl_errors(item)
    elif isinstance(value, list):
        for item in value:
            yield from gl_errors(item)


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('receipt', type=Path)
parser.add_argument('primary', type=Path)
parser.add_argument('supplement', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
assert not args.output.exists(), 'Use a new receipt path.'
artifact = read(args.receipt)
primary, supplement = read(args.primary / 'status.json'), read(args.supplement / 'status.json')
assert primary['status'] == 'PASS_COPIED_R4_NATIVE_REOPENED_CASES'
assert supplement['status'] == 'PASS_COPIED_R4_CIVIL_OWNER_CASES'
completed = read(args.primary / 'completed.json') + read(args.supplement / 'completed.json')
assert len(completed) == 28
plan = read(Path('.artifacts/m2-3/feedback-r4-v1/native-feedback-plan-v1.json'))
expected_families = {family for case in plan['cases'] for family in case['families']}
assert len(expected_families) == 53
families = {2: set(), 4: set()}
counts = {2: dict(maps=0, ownerSessions=0, ownerComparisons=0, bridges=0, fallback=0,
                  buildings=0, occupied=0, evacuation=0, criticalEvacuation=0),
          4: dict(maps=0, ownerSessions=0, ownerComparisons=0, bridges=0, fallback=0,
                  buildings=0, occupied=0, evacuation=0, criticalEvacuation=0)}
peaks, records = {2: None, 4: None}, []
for case in completed:
    file = Path(case['output']) / 'report.json'
    report = read(file)
    density = next(int(option.split('=')[1]) for option in case['options'] if option.startswith('--density='))
    count = counts[density]
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['app'] == artifact['app'] and report['resources'] == artifact['resources']
    assert all(error == 0 for error in gl_errors(report))
    record = dict(**pin(file), script=case['script'], density=density,
                  map=report.get('selectedMap', report.get('lobby', {}).get('map')),
                  reused=case.get('reused', False), status=report['status'])
    if case['script'] == 'native-building-owners':
        count['ownerSessions'] += 1
        count['ownerComparisons'] += len(report['cases'])
        assert report['ownerAudit'] == 'PASS_NATIVE_SELECTED_PART_PALETTES_AND_MATCHED_ORIGINAL_HD'
        assert all(row['originalRestoration'] == 'COMPLETE_BUILDING_FAMILY_SAME_SYNCHRONOUS_NATIVE_TICK'
                   for row in report['cases'])
        record['ownerNames'] = sorted({row['name'] for row in report['cases']})
        record['theater'] = 'SNOW' if report['snow'] else 'TEMPERATE'
    elif case['script'] == 'native-fallback':
        count['fallback'] += 1
        rejected = report['corruptMember']['environment']['families']['environment-ctoutp']
        assert rejected['status'] == 'ORIGINAL' and rejected['worldChargeBytes'] == 0
        assert report['missingPack']['environment']['worldChargeBytes'] == 0
        assert all(layer['disposed'] and layer['worldChargeBytes'] == 0
                   for layer in report['release'].values())
        record['completeFamilyFallback'] = 'PASS_SEVEN_MEMBER_OUTPOST_ATOMIC_ORIGINAL'
    else:
        allocation = report['combinedWorldAllocation']
        assert allocation['total'] <= allocation['limit'] == (512 if density == 2 else 1280) * 1024**2
        record['combinedWorldAllocation'] = allocation
        if peaks[density] is None or allocation['total'] > peaks[density]['total']:
            peaks[density] = dict(case=Path(case['output']).name, **allocation)
        assert report['graphics']['output'] == [3840, 2160]
        if 'newNativeBridge' in report:
            count['bridges'] += 1
            assert report['newNativeBridge']['status'] == 'PASS_NATIVE_WOOD_BRIDGE_PASSAGE_DAMAGE_DEMOLITION_REPAIR'
        else:
            count['maps'] += 1
            requested = report['requestedFamilies']
            families[density].update(requested)
            assert report['selectedEnvironmentRevision'] == 'environment-m2-3-material-feedback-complete-v4'
            for family in requested:
                binding = report['environment']['families'][family]
                assert binding['status'] == 'PUBLISHED_COMPLETE_FAMILY' and binding['density'] == density
            states = report['newNativeStates']
            assert states['status'] == 'PASS_SEQUENTIAL_NATIVE_BUILDING_ACTOR_AND_ANIMATION_CASES'
            count['buildings'] += len(states['buildings'])
            count['occupied'] += sum('occupied' in row for row in states['buildings'])
            count['evacuation'] += len(states['evacuation'])
            count['criticalEvacuation'] += len(states['criticalDamageEvacuation'])
            if 'release' in report:
                for layer in ['environment', 'terrain']:
                    assert report['release'][layer]['disposed'] and report['release'][layer]['worldChargeBytes'] == 0
    records.append(record)

for density in [2, 4]:
    assert families[density] == expected_families
    count = counts[density]
    assert (count['maps'], count['ownerSessions'], count['ownerComparisons'], count['bridges'], count['fallback']) == (9, 3, 8, 1, 1)

result = dict(schema='m2-3-feedback-native-summary-v1',
    status='PASS_ALL_28_COPIED_R4_NATIVE_CASES', app=artifact['app'], resources=artifact['resources'],
    runtimeSourceCommit=artifact['sourceHead'], packageReceipt=pin(args.receipt),
    caseCount=len(records), countsByDensity=counts, requestedFamiliesPerDensity=53,
    combinedWorldPeaks=peaks, cases=records, nativeAvailabilityExceptions=primary['notPreviouslyNativePlaced'],
    disclosure='Sequential copied Mac checks with isolated profiles, legal fixtures, native owner transitions, '
               'actual animation ticks, map reveal and suspended AI. Owner Original/HD comparisons use the same '
               'synchronous native tick. Allocation totals include retained CPU and are not physical VRAM. '
               'The broad static audit does not establish runtime testing of every previously completed building.',
    userAcceptance=False, browserRendered=False, windows='NOT_RUN', physicalInput='NOT_RUN',
    mainPromotion=False, remotePush=False)
args.output.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: result[key] for key in ['status', 'caseCount', 'countsByDensity', 'combinedWorldPeaks']}))
