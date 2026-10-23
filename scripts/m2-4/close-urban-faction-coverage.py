"""Close accepted faction source groups using pinned native bindings and explicit diagnostic scopes."""
import collections
import hashlib
import json
import re
from pathlib import Path

read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
record = lambda path: dict(file=str(path), sha256=sha(path), bytes=path.stat().st_size)
root = Path('.artifacts/m2-4/urban-factions-batch48-v1')
authority_file = root / 'authority-v1.json'
authority = read(authority_file)
expected = {(row['edition'], row['family']): row for row in authority['rows']}
assert len(expected) == 79
names = ['urban-factions-native-yr-2x-v1', 'urban-factions-native-yr-land-2x-v2',
    'urban-factions-native-yr-naval-2x-v1', 'urban-factions-native-yr-land-4x-v1',
    'urban-factions-native-yr-land-4x-v2', 'urban-factions-native-yr-naval-4x-v1',
    'urban-factions-native-ra2-2x-v1', 'urban-factions-native-ra2-4x-v1']
scoped_failures = {
    names[0]: ('No legal foundation for GAYARD', 16),
    names[1]: ("Cannot read properties of undefined (reading 'families')", 28),
    names[3]: ('identities.some', 9),
}
covered, reports, completed, scopes, allocations = {}, [], [], [], []
for name in names:
    path = Path('.artifacts/m2-4') / name / 'report.json'
    report = read(path)
    assert not report['errors'] and report['authority']['sha256'] == sha(authority_file)
    selected = [row for row in report['factionBindings']
                if row.get('status') == 'PASS_COMPLETE_ACCEPTED_URBAN_BINDING_AND_REMOVAL']
    if name in scoped_failures:
        message, count = scoped_failures[name]
        assert report['status'] == 'FAIL' and message in report['failure'] and len(selected) == count
        scopes.append(dict(report=record(path), status='PASS_ONLY_COMPLETED_BINDING_AND_REMOVAL_CASES',
            families=[row['family'] for row in selected], overallStatus='FAIL',
            failure=report['failure'], lifecycleClaim='NONE_FROM_THIS_FAILED_DIAGNOSTIC'))
    else:
        assert report['status'] == 'PASS_SELECTED_NATIVE_CASES'
        assert report['bindingStatus'] == 'PASS_COMPLETE_ACCEPTED_FACTION_URBAN_BINDINGS_DENSITY_BUDGET_AND_ORIGINAL_RELEASE'
        assert all(value == 0 for value in report['release'].values())
        assert report['prepared']['cache']['peakBytes'] <= 128 * 1024 * 1024
    density, edition = report['requestedDensity'], report['edition']
    for item in selected:
        key = edition, item['family'], density
        assert key not in covered
        declaration = expected[edition, item['family']]
        bound = item['bound']
        assert bound['name'] == item['family'] and bound['spawned'] and bound['pages'] > 0
        assert bound['hd'].startswith(item['family'].lower() + '/')
        for member in declaration['members']:
            assert member['actualMember'] in bound['members']
            suffix = r'(?:/stable-structure-effects-v1)?' if item['family'] == 'GAPOWR' and member['canonicalMember'] == 'ggpowr_a.shp' else ''
            assert any(member['manifestSha256'] + '/' + member['sourceSha256'] + '/' in identity
                and re.search(r'/(?:tiles/)?' + str(density) + suffix + '$', identity)
                for identity in bound['hd'].split('|'))
        assert bound['glError'] == 0 and item['removed']['spawned'] is False
        assert bound['allocation']['total'] <= {2: 512, 4: 1280}[density] * 1024 * 1024
        assert bound['prepared']['bytes'] + bound['prepared']['pendingBytes'] <= 128 * 1024 * 1024
        assert bound['prepared']['peakBytes'] <= 128 * 1024 * 1024
        covered[key] = dict(report=record(path), family=item['family'], edition=edition, density=density,
            actualBinding=bound['hd'], members=bound['members'], nativeRemoval=True,
            sourceSha256=report['sourceSha256'])
        allocations.append((density, bound['allocation']['total'], bound['prepared']['peakBytes']))
    reports.append(record(path))
assert {(edition, family) for edition, family, density in covered if density == 2} == {
    (edition, family) for edition, family, density in covered if density == 4}
assert len(covered) == 102
assert {family for edition, family, density in covered if edition == 'yr'} == {
    family for edition, family in expected if edition == 'yr'}
assert {family for edition, family, density in covered if edition == 'ra2'} == {'NAPSIS', 'NACLON', 'GAREFN', 'NAHAND'}
deduplicated = []
for (edition, family), row in expected.items():
    if (edition, family, 2) in covered:
        continue
    assert edition == 'ra2' and ('yr', family, 2) in covered
    other = expected['yr', family]
    assert row['familyHash'] == other['familyHash'] and row['selection'] == other['selection']
    assert row['members'] == other['members']
    deduplicated.append(dict(edition=edition, family=family,
        basis='Exact selected family/member hashes, actual Urban filenames, palette, logical slots, density handling and shared loader; RA2 Soviet/Allied controls and its two distinct catalog selections execute separately.'))
assert len(deduplicated) == 28
prior_file = Path('.artifacts/m2-4/urban-props-batch47-v1/coverage-delta.json')
prior = read(prior_file)
new_groups = []
for group in prior['remainingGaps']:
    if group['kind'] != 'building':
        continue
    matches = [row for row in authority['rows'] if row['family'] in group['identities']
        and any(member['actualMember'] == group['member'] and member['sourceSha256'] == group['sha256']
                for member in row['members'])]
    if not matches:
        continue
    editions = {map_id.split(':')[0] for map_id in group['maps']}
    assert editions <= {row['edition'] for row in matches}
    assert all(identity in {row['family'] for row in matches} or identity == 'AMRADR'
               and any(row['family'] == 'GAAIRC' for row in matches) for identity in group['identities'])
    new_groups.append(dict(**group, closure='ACCEPTED_FACTION_AUTHORITY_AND_ACTUAL_URBAN_BINDING',
        acceptedFamilies=sorted({row['family'] for row in matches})))
assert len(new_groups) == 49
keys = {group['key'] for group in new_groups}
remaining = [group for group in prior['remainingGaps'] if group['key'] not in keys]
assert len(remaining) == 158
for archive in prior['archives']:
    assert sha(Path(archive['file'])) == archive['sha256']
receipt = dict(status='PASS_79_STATIC_CELLS_102_NATIVE_BINDINGS_AND_EXPLICIT_SHARED_PATH_DEDUPLICATION',
    authority=record(authority_file), nativeReports=reports, nativeBindings=list(covered.values()),
    reusedDiagnosticScopes=scopes, deduplicatedEditionCells=deduplicated,
    worldPeaksBytes={str(d): max(value for density, value, cpu in allocations if density == d) for d in [2, 4]},
    preparedPeakBytes=max(cpu for density, value, cpu in allocations),
    newArtwork=0, selectedResourcesChanged=False, windows='NOT_RUN', m24Complete=False)
delta = dict(status='PASS_INCREMENTAL_SOURCE_BOUND_ACCEPTED_FACTION_COVERAGE', baseline=prior['baseline'],
    priorDelta=record(prior_file), selectedEnvironment=prior['selectedEnvironment'], selectedTerrain=prior['selectedTerrain'],
    totalUrbanMapEntries=32, uniqueUrbanMapHashes=26, newCompleteSourceGroups=49, newArtFamilies=0,
    covered=new_groups, remainingGapFamilies=158, remainingByKind=dict(collections.Counter(row['kind'] for row in remaining)),
    remainingGaps=remaining, archives=prior['archives'], unchangedMapBytes=True, unchangedDependencyKeys=True,
    sourceClosure=record(authority_file), runtime='PASS_ACCEPTED_FACTION_URBAN_BINDINGS',
    visual='REUSED_ACCEPTED_ART_NO_NEW_REVIEW', windows='NOT_RUN', m24Complete=False,
    policy='Inventory MISSING labels described only environment-pack lookup; these 49 groups are served through the verified existing faction path. Preserve original inventory and retain every unresolved source group.')
for name, value in [('native-closure.json', receipt), ('coverage-delta.json', delta)]:
    with (root / name).open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')
print(json.dumps(dict(nativeBindings=len(covered), deduplicatedCells=len(deduplicated), closedGroups=49,
    remaining=delta['remainingByKind'], worldPeaksBytes=receipt['worldPeaksBytes'], preparedPeakBytes=receipt['preparedPeakBytes'])))
