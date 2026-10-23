"""Credit only complete source groups with actual matched 2X and 4X bindings."""
import collections
import hashlib
import json
from pathlib import Path

root = Path('.artifacts/m2-4/accepted-faction-routing-batches79-80-20261019')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
preparation_file = Path('.artifacts/m2-4/accepted-faction-theater-routing-preparation-20261019.json')
preparation = read(preparation_file)
inventory_file = root/'inventory-current-v1/inventory.json'
inventory = read(inventory_file)
cases = ['native-desert-4x-v1', 'native-newurban-4x-v1', 'native-desert-naval-4x-v1',
    'native-newurban-naval-4x-v1', 'native-desert-2x-v1', 'native-newurban-2x-v2',
    'native-desert-naval-2x-v2']
covered, reports, scopes, allocations, cpu_peaks = {}, [], [], [], []
for name in cases:
    file = root/name/'report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert all(value == 0 for value in report['release'].values())
    authority_file = Path(report['authority']['file'])
    assert sha(authority_file) == report['authority']['sha256']
    density, theater = report['requestedDensity'], report['theater']
    original_map = next(m for m in inventory['maps']
        if m['source']['member'].lower() == report['selectedMap'].lower())
    assert original_map['theater'] == theater and original_map['source']['sha256'] == report['sourceSha256']
    passed = [row for row in report['factionBindings'] if row['status'].startswith('PASS_')]
    for row in passed:
        key = (theater, density, row['family'])
        assert key not in covered, key
        covered[key] = dict(theater=theater, density=density, family=row['family'],
            selection=row['selection'], report=str(file), bound=row['bound'], removed=row['removed'])
        allocations.append((density, row['bound']['allocation']['total']))
        cpu_peaks.append(row['bound']['prepared']['bytes']+row['bound']['prepared']['pendingBytes'])
    skipped = [row for row in report['factionBindings'] if not row['status'].startswith('PASS_')]
    if skipped:
        assert all(row['status'] == 'NO_LEGAL_NATIVE_FOUNDATION_REQUIRES_OTHER_OFFICIAL_MAP' for row in skipped)
        scopes.append(dict(case=name, nonpassingFamilies=[row['family'] for row in skipped],
            policy='Observation scope only; never a map unsupported classification. Separate official-map naval probes supply complete bindings.'))
    reports.append(dict(**pin(file), theater=theater, density=density, passedFamilies=len(passed),
        originalMap=report['selectedMap'], sourceSha256=report['sourceSha256']))
results = []
for source in preparation['theaters']:
    theater = source['theater']
    expected = {row['identity'] for row in source['candidates']}
    assert all((theater, density, name) in covered for density in [2, 4] for name in expected)
    hashes = {row['source']['sha256'] for row in source['candidates']}
    groups = [g for g in inventory['resourceGroups'] if g['theater'] == theater
        and g['kind'] == 'building' and g['sha256'] in hashes]
    assert len(groups) == len(expected)
    assert all('MISSING_AUTHORED_FAMILY' in g['decisions'] for g in groups)
    missing = [g for g in inventory['resourceGroups'] if g['theater'] == theater
        and 'MISSING_AUTHORED_FAMILY' in g['decisions']]
    closed = {g['key'] for g in groups}
    remaining = [g for g in missing if g['key'] not in closed]
    maps = [m for m in inventory['maps'] if m['theater'] == theater]
    assert all(m['runtimeEligibility'] == 'ELIGIBLE_FOR_FOCUSED_NATIVE_MATCH' for m in maps)
    modes = collections.Counter(mode for m in maps for mode in m['unifiedSkirmish']['originalModes'])
    results.append(dict(theater=theater, newlyVerifiedExistingSourceGroups=len(groups),
        priorAuthoredGaps=len(missing), remainingAuthoredGaps=len(remaining),
        remainingByKind=dict(collections.Counter(g['kind'] for g in remaining)),
        coveredSourceGroups=groups, remainingGaps=remaining,
        directoryEntries=len(maps), uniqueMapFiles=len({m['source']['member'] for m in maps}),
        uniqueMapStreams=len({m['source']['sha256'] for m in maps}),
        overlappingSourceModeLabels=dict(modes), sourceModeVariants=sum(modes.values()),
        selectableMaps=len(maps), newSelectableMaps=0,
        unresolvedDependencyGroups=[g for g in inventory['resourceGroups'] if g['theater'] == theater
            and 'UNSUPPORTED_OR_UNRESOLVED_DEPENDENCY' in g['decisions']]))
assert len(covered) == 138
result = dict(status='PASS_69_EXISTING_COMPLETE_FACTION_GROUPS_138_NATIVE_DENSITY_BINDINGS',
    preparation=pin(preparation_file), currentInventory=pin(inventory_file),
    runtimeSourceCommit=read(Path('.artifacts/m2-4/desert-road-geometry-r2-20261019/active-stage-v5.json'))['runtimeSourceHead'],
    theaters=results, nativeReports=reports, observationScopes=scopes, nativeBindings=list(covered.values()),
    worldPeakBytes={str(d): max(v for density, v in allocations if density == d) for d in [2, 4]},
    preparedPeakBytes=max(cpu_peaks), newArtwork=0, resourcesChanged=False, gameplayChanged=False,
    palettes='USED_FIXED_INDICES_EXACT_REMAP_INDICES_AND_NATIVE_SHADOWS_PRESERVED',
    visualAcceptance='EXISTING_ACCEPTED_ART_REUSED_NO_NEW_VISUAL_GATE',
    windows='NOT_RUN', m24Complete=False,
    policy='The original scanner marks environment-pack misses. Actual complete faction paths now prove these 69 groups; preserve raw inventories and all unresolved groups.')
with (root/'coverage-and-native-closure-v1.json').open('x') as stream:
    stream.write(json.dumps(result, indent=2)+'\n')
print(json.dumps(dict(completeGroups=69, actualDensityBindings=138,
    remaining={r['theater']: r['remainingAuthoredGaps'] for r in results},
    worldPeakBytes=result['worldPeakBytes'], preparedPeakBytes=result['preparedPeakBytes'])))
