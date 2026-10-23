"""Credit legacy faction source groups only after complete static and native density proof."""
import collections
import hashlib
import json
import subprocess
from pathlib import Path

root = Path('.artifacts/m2-4/legacy-faction-reuse-batch84-20261020')
ore = Path('.artifacts/m2-4/desert-ore-batch83-20261020')
prior = Path('.artifacts/m2-4/accepted-faction-routing-batches79-80-20261019')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
inventory_file = prior / 'inventory-current-v1/inventory.json'
inventory, old_factions = read(inventory_file), read(prior / 'coverage-and-native-closure-v1.json')
stage = read(root / 'reused-stage-v1.json')
current_runtime_changes = subprocess.check_output(['git', 'diff', stage['runtimeSourceHead'], 'HEAD',
    '--name-only', '--', 'src', 'desktop'], text=True).splitlines()
assert not current_runtime_changes, 'This checkpoint must reuse the unchanged application'
source_before = {'DESERT': read(ore / 'coverage-and-native-closure-v2.json')['remainingDesertGaps'],
    'NEWURBAN': next(t for t in old_factions['theaters'] if t['theater'] == 'NEWURBAN')['remainingGaps']}
reports, budgets, cpu, coverage = [], [], [], []
for theater in ['DESERT', 'NEWURBAN']:
    authority_file = root / f'{theater.lower()}-authority-v1.json'
    authority = read(authority_file)
    expected = {r['family']: r for r in authority['rows']}
    assert len(expected) == 14 and all(r['status'].startswith('PASS_') and not r['issues'] for r in expected.values())
    for density in [2, 4]:
        file = root / f'native-{theater.lower()}-{density}x-v1/report.json'
        report = read(file)
        assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
        assert report['bindingStatus'] == 'PASS_COMPLETE_ACCEPTED_FACTION_BINDINGS_DENSITY_BUDGET_AND_ORIGINAL_RELEASE'
        assert report['requestedDensity'] == density and report['theater'] == theater
        assert report['authority']['sha256'] == sha(authority_file)
        source_map, = [m for m in inventory['maps'] if m['source']['member'] == report['selectedMap']]
        assert source_map['theater'] == theater and source_map['source']['sha256'] == report['sourceSha256']
        passed = report['factionBindings']
        assert {r['family'] for r in passed} == set(expected)
        for row in passed:
            assert row['status'] == 'PASS_COMPLETE_ACCEPTED_REMAINING_THEATER_BINDING_AND_REMOVAL'
            assert not row['removed']['spawned'] and not row['removed']['renderablePresent']
            bound, source = row['bound'], expected[row['family']]
            assert bound['tick'] > 0 and bound['glError'] == 0 and bound['pages'] > 0
            for member in source['members']:
                assert member['manifestSha256'] + '/' + member['sourceSha256'] + '/' in bound['hd']
                if row['family'] != 'NAWALL':
                    assert member['actualMember'] in bound['members']
            if source.get('turret'):
                assert bound['turret']['density'] == min(density, source['turret']['density'])
                assert len(bound['turret']['headings']) == 8 and not bound['turret']['disposed']
            world = bound['allocation']['total']
            prepared = bound['prepared']['bytes'] + bound['prepared']['pendingBytes']
            assert world <= {2: 512, 4: 1280}[density] * 1024 ** 2 and prepared <= 128 * 1024 ** 2
            budgets.append((density, world))
            cpu.append(prepared)
        assert all(value == 0 for value in report['release'].values())
        reports.append(dict(**pin(file), theater=theater, density=density, originalMap=report['selectedMap'],
            sourceSha256=report['sourceSha256'], completeBindings=14,
            nativeTickRange=[min(r['bound']['tick'] for r in passed), max(r['bound']['tick'] for r in passed)]))
    hashes = {r['members'][0]['sourceSha256'] for r in expected.values()}
    closed = [g for g in source_before[theater] if g['kind'] == 'building' and g['sha256'] in hashes]
    assert len(closed) == 14 and {g['identities'][0] for g in closed} == set(expected)
    remaining = [g for g in source_before[theater] if g['key'] not in {g['key'] for g in closed}]
    old = next(t for t in old_factions['theaters'] if t['theater'] == theater)
    maps = [m for m in inventory['maps'] if m['theater'] == theater]
    assert all(m['runtimeEligibility'] == 'ELIGIBLE_FOR_FOCUSED_NATIVE_MATCH' for m in maps)
    coverage.append(dict(theater=theater, newlyVerifiedExistingSourceGroups=14,
        completeFamilyMembers=sum(len(r['members']) for r in expected.values()),
        coveredSourceGroups=closed, remainingAuthoredGaps=len(remaining),
        remainingByKind=dict(collections.Counter(g['kind'] for g in remaining)), remainingGaps=remaining,
        unresolvedDependencyGroups=old['unresolvedDependencyGroups'],
        directoryEntries=old['directoryEntries'], uniqueMapFiles=old['uniqueMapFiles'],
        uniqueMapStreams=old['uniqueMapStreams'], selectableMaps=old['selectableMaps'],
        sourceModeVariants=old['sourceModeVariants'], overlappingSourceModeLabels=old['overlappingSourceModeLabels'],
        newSelectableMaps=0, nativeDeduplication='Complete source-hash families, actual theater filename resolver and native density publication; accepted state matrices are unchanged and reused.'))
assert [r['remainingAuthoredGaps'] for r in coverage] == [14, 310]
result = dict(status='PASS_28_EXISTING_LEGACY_SOURCE_GROUPS_56_NATIVE_DENSITY_BINDINGS',
    runtimeSourceCommit=stage['runtimeSourceHead'], currentInventory=pin(inventory_file),
    priorFactionClosure=pin(prior / 'coverage-and-native-closure-v1.json'),
    priorOreClosure=pin(ore / 'coverage-and-native-closure-v2.json'),
    priorOreAcceptance=pin(ore / 'user-acceptance-20261020.json'),
    theaters=coverage, nativeReports=reports, completeBindings=56, newArtwork=0,
    worldPeakBytes={str(d): max(v for density, v in budgets if density == d) for d in [2, 4]},
    preparedPeakBytes=max(cpu), oldResourceRelease='ALL_ZERO_AFTER_ORIGINAL_RESET',
    resourcesChanged=False, shippingCodeChanged=False, sourceMapsChanged=False, gameplayChanged=False,
    originalStateEvidence='REUSED_ACCEPTED_COMPLETE_FAMILIES_SOURCE_AND_PALETTE_EXACT',
    crossTheaterEvidence=pin(ore / 'native-monument-4x-v2/report.json'),
    visualAcceptance='EXISTING_ACCEPTED_ART_REUSED_NO_NEW_VISUAL_GATE',
    windows='NOT_RUN', m24Complete=False)
with (root / 'coverage-and-native-closure-v1.json').open('x') as stream:
    stream.write(json.dumps(result, indent=2) + '\n')
print(json.dumps(dict(status=result['status'], worldPeakBytes=result['worldPeakBytes'],
    preparedPeakBytes=max(cpu), remaining={r['theater']: r['remainingAuthoredGaps'] for r in coverage})))
