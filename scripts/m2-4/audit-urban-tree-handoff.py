"""Pin the complete Urban tree delta without repeating accepted theater matrices."""
import collections
import hashlib
import json
from pathlib import Path

read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
record = lambda path: dict(file=str(path), sha256=sha(path), bytes=path.stat().st_size)
out = Path('.artifacts/m2-4/urban-tree-batch46-v1')
previous = Path('.artifacts/m2-4/urban-overlay-batch45-v1/coverage-delta.json')
prior = read(previous)
native_root = Path('.artifacts/m2-4/urban-tree-native-batch46-v1')
native_file = native_root / 'source.json'
native = read(native_file)
contract_file = Path('desktop/environment-urban-hd-contract.json')
contract = read(contract_file)
selection = read(native_root / 'selection-v1.json')
expected = set(selection['newFamilies'])
assert len(expected) == len(native['sources']) == 23
report_files = [Path('.artifacts/m2-4') / name / 'report.json' for name in [
    'urban-tree-native-yr-xkaliforn-2x-v2', 'urban-tree-native-yr-xkaliforn-4x-v1',
    'urban-tree-native-yr-xrockets-2x-v1', 'urban-tree-native-yr-xrockets-4x-v1']]
reports = [read(path) for path in report_files]
for report in reports:
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['urbanNativeTrees']['status'] == 'PASS_ORIGINAL_TREE_BINDINGS_AND_REPRESENTATIVE_NATIVE_WARHEAD_DAMAGE_REMOVAL'
    assert report['graphics']['glError'] == 0
    assert report['combinedWorldAllocation']['total'] <= report['combinedWorldAllocation']['limit']
    assert report['prepared']['cache']['peakBytes'] <= 128 * 1024 * 1024
for density in [2, 4]:
    covered = {contract['identities']['yr'][row['name']] for report in reports
        if report['environment']['density'] == density for row in report['urbanNativeTrees']['originals']}
    assert covered == expected
    actions = {row['name'] for report in reports if report['environment']['density'] == density
               for row in report['urbanNativeTrees']['actions']}
    assert actions == {'TREE13', 'TREE21', 'TREE26'}
assert any(report.get('release', {}).get('environment', {}).get('disposed')
           and report['release']['currentEnvironment']['worldChargeBytes'] == 0 for report in reports)
for archive in prior['archives']:
    assert record(Path(archive['file'])) == {key: archive[key] for key in ('file', 'sha256', 'bytes')}
sources = {row['member']: row['sha256'] for row in native['sources']}
covered = [row for row in prior['remainingGaps'] if sources.get(row['member']) == row['sha256']]
assert len(covered) == 23 and all(row['kind'] == 'terrain' for row in covered)
keys = {row['key'] for row in covered}
remaining = [row for row in prior['remainingGaps'] if row['key'] not in keys]
assert len(remaining) == 232
maps = sorted({mid for row in covered for mid in row['maps']})
baseline = read(Path(prior['baseline']['file']))
map_hashes = {row['source']['sha256'] for row in baseline['maps'] if row['mapId'] in maps}
delta = dict(status='PASS_INCREMENTAL_SOURCE_BOUND_TREE_COVERAGE', baseline=prior['baseline'],
    priorDelta=record(previous), selectedEnvironment=contract['selectedPack'],
    selectedTerrain=read(Path('.local/terrain-urban-selection.json')), totalUrbanMapEntries=32,
    uniqueUrbanMapHashes=26, affectedMapEntries=len(maps), uniqueAffectedMapHashes=len(map_hashes),
    affectedMapIds=maps, newArtFamilies=23, newCompleteSourceGroups=23, covered=covered,
    remainingGapFamilies=232, remainingByKind=dict(collections.Counter(row['kind'] for row in remaining)),
    remainingGaps=remaining, archives=prior['archives'], unchangedMapBytes=True, unchangedDependencyKeys=True,
    runtime='PASS_ALL_23_ORIGINAL_TREE_FAMILIES_AT_BOTH_DENSITIES', visual='PENDING', windows='NOT_RUN', m24Complete=False,
    deduplication='Original source, palette, frame, health and shared Terrain renderer paths are pinned for all 31 affected entries. Two YR original maps cover all 23 species; overlap is not a second acceptance matrix. RA2 shares identical source contracts and the unchanged renderer. No new RA2 execution is claimed for Batch46.')
root = Path('.local/environment-packs') / contract['selectedPack']['revision']
assert sha(root / 'manifest.json') == contract['selectedPack']['sha256']
pack = read(root / 'manifest.json')
assert len(pack['families']) == 110
old = selection['priorContract']
old_root = Path('.local/environment-packs') / old['selectedPack']['revision']
old_pack = read(old_root / 'manifest.json')
assert len(old_pack['families']) == 87
for family, declared in old['families'].items():
    assert contract['families'][family] == declared
    assert pack['families'][family] == old_pack['families'][family]
    for member in old_pack['families'][family]['members']:
        for file in (old_root / member['path']).parent.rglob('*'):
            if file.is_file(): assert sha(file) == sha(root / file.relative_to(old_root))
files = [record(path) for path in sorted(root.rglob('*')) if path.is_file()]
assert len(files) == 996
dependencies = {native_file, native_root / 'contract.json', native_root / 'preparation-checkpoint.json'}
for source in native['sources']:
    required = [(source['nativeFile'], source['sha256']), (source['palette']['sha256'] + '.pal', source['palette']['sha256'])]
    for frame in source['frames']:
        required.extend([(frame['file'], frame['rgbaSha256']), (frame['indexFile'], frame['indexSha256'])])
    for relative, digest in required:
        path = native_root / 'native' / relative
        assert sha(path) == digest
        dependencies.add(path)
authoring = Path('.artifacts/m2-4/urban-tree-authoring-batch46-v1')
handoff = dict(schema='m2-4-urban-tree-resource-handoff-v1', status='PASS_NATIVE_AUTHORING_SELECTED_AND_PRESERVED_HASHES',
    selectedEnvironment=contract['selectedPack'], selectedTerrain=delta['selectedTerrain'], sourceContract=record(contract_file),
    files=files, priorAcceptedFamiliesPreserved=87, nativeDependencies=[record(path) for path in sorted(dependencies)],
    authoringDependencies=[record(path) for path in sorted(authoring.rglob('*')) if path.is_file()],
    nativeReports=[record(path) for path in report_files],
    reusableCrossTheaterEvidence=record(Path('.artifacts/m2-4/urban-overlay-native-yr-xbarrel-4x-v2/report.json')),
    policy='All eight builtin mothers, original raw output locations, exact English prompts, rejected berry slots and correction masks/overrides remain pinned. Review contains only 23 new tree families. No game/resource copy, main integration or Windows run.')
for name, data in [('coverage-delta.json', delta), ('resource-handoff.json', handoff)]:
    with (out / name).open('x') as stream: stream.write(json.dumps(data, indent=2) + '\n')
print(json.dumps(dict(families=23, affectedMapEntries=len(maps), affectedHashes=len(map_hashes),
    remaining=delta['remainingByKind'], packFiles=len(files), nativeDependencies=len(dependencies))))
