"""Pin the complete Urban terrain-prop delta without repeating accepted theater matrices."""
import collections
import hashlib
import json
from pathlib import Path

read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
record = lambda path: dict(file=str(path), sha256=sha(path), bytes=path.stat().st_size)
out = Path('.artifacts/m2-4/urban-props-batch47-v1')
previous = Path('.artifacts/m2-4/urban-tree-batch46-v1/coverage-delta.json')
prior = read(previous)
native_root = Path('.artifacts/m2-4/urban-props-native-batch47-v1')
native_file = native_root / 'source.json'
native = read(native_file)
contract_file = Path('desktop/environment-urban-hd-contract.json')
contract = read(contract_file)
selection = read(native_root / 'selection-v1.json')
expected = set(selection['newFamilies'])
assert len(expected) == len(native['sources']) == 25
report_files = [Path('.artifacts/m2-4') / f'urban-props-native-yr-{map_name}-{density}x-v1/report.json'
                for map_name in ['xpotomac', 'xpowdrkeg', 'xinvasion'] for density in [2, 4]]
report_files = [Path(str(p).replace('xpowdrkeg-2x-v1', 'xpowdrkeg-2x-v3')) for p in report_files]
reports = [read(path) for path in report_files]
for report in reports:
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['urbanNativeProps']['status'] == 'PASS_ORIGINAL_PROP_BINDINGS_AND_REPRESENTATIVE_NATIVE_WARHEAD_DAMAGE_REMOVAL'
    assert report['graphics']['glError'] == 0
    assert report['combinedWorldAllocation']['total'] <= report['combinedWorldAllocation']['limit']
    assert report['prepared']['cache']['peakBytes'] <= 128 * 1024 * 1024
    checked = {row['name']: row['hd'] for row in report['urbanNativeProps']['originals']}
    original_objects = [row for row in report['placed'] if row['name'] in checked]
    assert original_objects and all(row.get('hd') == checked[row['name']] for row in original_objects)
for density in [2, 4]:
    covered = {contract['identities']['yr'][row['name']] for report in reports
        if report['environment']['density'] == density for row in report['urbanNativeProps']['originals']}
    assert covered == expected
    actions = {row['name'] for report in reports if report['environment']['density'] == density
               for row in report['urbanNativeProps']['actions']}
    assert actions == {'LT_SGN01', 'TRFF02', 'POLE01', 'HDSTN01', 'SIGN01', 'LT_EUR01'}
    spawner, = [report['newNativeTerrainObjects'] for report in reports
                if report['environment']['density'] == density and 'newNativeTerrainObjects' in report]
    assert spawner['status'] == 'PASS_NATIVE_RESOURCE_SPAWN_ANIMATION_AND_TERRAIN_REMOVAL'
    assert spawner['fullCycle']['status'] == 'PASS_ALL_11_NATIVE_PHASES_UNCHANGED_COOLDOWN'
    assert {phase['frame'] for phase in spawner['fullCycle']['phases']} == set(range(11))
    assert spawner['repeatCycle']['animated'] and spawner['repeatCycle']['spawning']
assert any(report.get('release', {}).get('environment', {}).get('disposed')
           and report['release']['currentEnvironment']['worldChargeBytes'] == 0 for report in reports)
for archive in prior['archives']:
    assert record(Path(archive['file'])) == {key: archive[key] for key in ('file', 'sha256', 'bytes')}
sources = {row['member']: row['sha256'] for row in native['sources']}
covered = [row for row in prior['remainingGaps'] if sources.get(row['member']) == row['sha256']]
assert len(covered) == 25 and all(row['kind'] == 'terrain' for row in covered)
keys = {row['key'] for row in covered}
remaining = [row for row in prior['remainingGaps'] if row['key'] not in keys]
assert len(remaining) == 207
maps = sorted({mid for row in covered for mid in row['maps']})
baseline = read(Path(prior['baseline']['file']))
map_hashes = {row['source']['sha256'] for row in baseline['maps'] if row['mapId'] in maps}
delta = dict(status='PASS_INCREMENTAL_SOURCE_BOUND_TERRAIN_PROP_COVERAGE', baseline=prior['baseline'],
    priorDelta=record(previous), selectedEnvironment=contract['selectedPack'],
    selectedTerrain=read(Path('.local/terrain-urban-selection.json')), totalUrbanMapEntries=32,
    uniqueUrbanMapHashes=26, affectedMapEntries=len(maps), uniqueAffectedMapHashes=len(map_hashes),
    affectedMapIds=maps, newArtFamilies=25, newCompleteSourceGroups=25, covered=covered,
    remainingGapFamilies=207, remainingByKind=dict(collections.Counter(row['kind'] for row in remaining)),
    remainingGaps=remaining, archives=prior['archives'], unchangedMapBytes=True, unchangedDependencyKeys=True,
    runtime='PASS_ALL_25_ORIGINAL_PROP_FAMILIES_AT_BOTH_DENSITIES', visual='PENDING', windows='NOT_RUN', m24Complete=False,
    deduplication='Original source, palette, frame, rules and shared Terrain renderer paths are pinned for every affected entry. Three YR original maps cover all 25 prop families. Only new identities are asserted in the second and third maps; all actual map demands still load normally. RA2 shares identical sources and the unchanged renderer. No new RA2 execution is claimed for Batch47. TIBTRE02/03 are exact source/palette/geometry duplicates and use one shared native mechanism check.')
root = Path('.local/environment-packs') / contract['selectedPack']['revision']
assert sha(root / 'manifest.json') == contract['selectedPack']['sha256']
pack = read(root / 'manifest.json')
assert len(pack['families']) == 135
old = selection['priorContract']
old_root = Path('.local/environment-packs') / old['selectedPack']['revision']
old_pack = read(old_root / 'manifest.json')
assert len(old_pack['families']) == 110
for family, declared in old['families'].items():
    assert contract['families'][family] == declared
    assert pack['families'][family] == old_pack['families'][family]
    for member in old_pack['families'][family]['members']:
        for file in (old_root / member['path']).parent.rglob('*'):
            if file.is_file(): assert sha(file) == sha(root / file.relative_to(old_root))
files = [record(path) for path in sorted(root.rglob('*')) if path.is_file()]
assert len(files) == 1125
dependencies = {native_file, native_root / 'contract.json', native_root / 'preparation-checkpoint.json'}
for source in native['sources']:
    required = [(source['nativeFile'], source['sha256']), (source['palette']['sha256'] + '.pal', source['palette']['sha256'])]
    for frame in source['frames']:
        required.extend([(frame['file'], frame['rgbaSha256']), (frame['indexFile'], frame['indexSha256'])])
    for relative, digest in required:
        path = native_root / 'native' / relative
        assert sha(path) == digest
        dependencies.add(path)
authoring = Path('.artifacts/m2-4/urban-props-authoring-batch47-v1')
handoff = dict(schema='m2-4-urban-prop-resource-handoff-v1', status='PASS_NATIVE_AUTHORING_SELECTED_AND_PRESERVED_HASHES',
    selectedEnvironment=contract['selectedPack'], selectedTerrain=delta['selectedTerrain'], sourceContract=record(contract_file),
    files=files, priorAcceptedFamiliesPreserved=110, nativeDependencies=[record(path) for path in sorted(dependencies)],
    authoringDependencies=[record(path) for path in sorted(authoring.rglob('*')) if path.is_file()],
    nativeReports=[record(path) for path in report_files],
    reusableCrossTheaterEvidence=record(Path('.artifacts/m2-4/urban-overlay-native-yr-xbarrel-4x-v2/report.json')),
    policy='All three builtin mothers, original raw output locations, exact English prompts, stationary-region proof and exact duplicate mineral source registration remain pinned. The initial export failed stale intermediate tone-evidence verification and is unselected. Review contains only 25 new prop families. No game/resource copy, main integration or Windows run.')
for name, data in [('coverage-delta.json', delta), ('resource-handoff.json', handoff)]:
    with (out / name).open('x') as stream: stream.write(json.dumps(data, indent=2) + '\n')
print(json.dumps(dict(families=25, affectedMapEntries=len(maps), affectedHashes=len(map_hashes),
    remaining=delta['remainingByKind'], packFiles=len(files), nativeDependencies=len(dependencies))))
