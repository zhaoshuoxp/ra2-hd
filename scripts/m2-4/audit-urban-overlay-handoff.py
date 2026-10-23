"""Close the Urban overlay delta with immutable native, source and payload receipts."""
import argparse
import collections
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('--native-reports', type=Path, nargs='+', required=True)
args = parser.parse_args()
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
record = lambda path: dict(file=str(path), sha256=sha(path), bytes=path.stat().st_size)
previous = Path('.artifacts/m2-4/urban-smudge-batch44-v1/coverage-delta.json')
prior = read(previous)
baseline = Path(prior['baseline']['file'])
assert sha(baseline) == prior['baseline']['sha256']
inventory = read(baseline)
fresh_file = Path('.artifacts/m2-4/inventory-urban-overlays-batch45-v2/inventory.json')
fresh = read(fresh_file)
assert len(fresh['maps']) == 32 and not fresh['issues']
old_maps = {row['mapId']: row for row in inventory['maps'] if row['theater'] == 'URBAN'}
assert set(old_maps) == {row['mapId'] for row in fresh['maps']}
for row in fresh['maps']:
    old = old_maps[row['mapId']]
    for key in ['source', 'geometryHash', 'placementHash', 'counts', 'starts', 'unifiedSkirmish', 'dependencyKeys']:
        assert row[key] == old[key], (row['mapId'], key)
contract_file = Path('desktop/environment-urban-hd-contract.json')
contract = read(contract_file)
native_file = Path('.artifacts/m2-4/urban-overlay-native-batch45-v1/source.json')
native = read(native_file)
assert native['inventorySha256'] == sha(baseline)
members = {row['member']: row['sha256'] for row in native['sources']}
covered = [row for row in prior['remainingGaps'] if members.get(row['member']) == row['sha256']]
assert len(covered) == 13 and collections.Counter(row['kind'] for row in covered) == dict(overlay=11, building=2)
keys = {row['key'] for row in covered}
remaining = [row for row in prior['remainingGaps'] if row['key'] not in keys]
assert len(remaining) == 255
for archive in prior['archives']:
    assert record(Path(archive['file'])) == {key: archive[key] for key in ('file', 'sha256', 'bytes')}
reports = [read(path) for path in args.native_reports]
assert all(report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors'] for report in reports)
for density in [2, 4]:
    for name in ['GAWALL', 'NAWALL']:
        assert any(report['environment']['density'] == density and any(wall['name'] == name
            and wall['status'] == 'PASS_NATIVE_WALL_DAMAGE_REMOVAL_ADJACENT_REBINDING'
            for wall in report.get('nativeFactionWalls', [])) for report in reports)
    assert any(report['environment']['density'] == density
        and report.get('newNativeOverlayObjects', {}).get('status') ==
        'PASS_ALL_5_PLACED_ROCKS_AND_NATIVE_LAND_WATER_CRATE_PICKUP' for report in reports)
assert any(report.get('factionWallLifecycle', {}).get('status') ==
           'PASS_WALL_ALLOCATIONS_RELEASED_AND_ORIGINAL_REENTRY' and report.get('crossTheater') for report in reports)
assert any(len(report.get('invisibleSystemOverlay', [])) == 22 for report in reports)
map_ids = sorted({map_id for row in covered for map_id in row['maps']})
delta = dict(status='PASS_INCREMENTAL_SOURCE_BOUND_RESOURCE_AND_ORIGINAL_MARKER_CLOSURE',
    baseline=prior['baseline'], priorDelta=record(previous), freshInventory=record(fresh_file),
    selectedEnvironment=contract['selectedPack'], selectedTerrain=read(Path('.local/terrain-urban-selection.json')),
    totalUrbanMapEntries=32, uniqueUrbanMapHashes=26, affectedMapEntries=len(map_ids),
    uniqueAffectedMapHashes=len({old_maps[mid]['source']['sha256'] for mid in map_ids}), affectedMapIds=map_ids,
    newArtFamilies=7, acceptedEnvironmentReuseFamilies=1, acceptedFactionReuseFamilies=2,
    newCompleteEnvironmentFamilies=8, resolvedSourceKindGroups=13, newCompleteSourceGroups=12,
    originalInvisibleSystemMarkerGroups=1, covered=covered, remainingGapFamilies=len(remaining),
    remainingByKind=dict(collections.Counter(row['kind'] for row in remaining)), remainingGaps=remaining,
    archives=prior['archives'], unchangedMapBytes=True, unchangedDependencyKeys=True,
    runtime='PASS_BOUNDED_NATIVE_PATHS', visual='PENDING_SEVEN_NEW_FAMILIES_ONLY', windows='NOT_RUN', m24Complete=False,
    scope='Eight environment source groups, four faction-wall building/overlay role groups and one preserved Original invisible marker. No failed map or dependency was removed.')
root = Path('.local/environment-packs') / contract['selectedPack']['revision']
assert sha(root / 'manifest.json') == contract['selectedPack']['sha256']
pack = read(root / 'manifest.json')
assert len(pack['families']) == 87 and 'urban-srock01' not in pack['families']
selection = read(Path('.artifacts/m2-4/urban-overlay-selection-v1.json'))
old_pack_root = Path('.local/environment-packs') / selection['priorContract']['selectedPack']['revision']
old_pack = read(old_pack_root / 'manifest.json')
assert len(old_pack['families']) == 79
for family, entry in old_pack['families'].items():
    assert pack['families'][family] == entry
    for member in entry['members']:
        for file in (old_pack_root / member['path']).parent.rglob('*'):
            if file.is_file(): assert sha(file) == sha(root / file.relative_to(old_pack_root))
dependencies = {native_file}
for source in native['sources']:
    declared = [(source['nativeFile'], source['sha256']), (source['palette']['sha256'] + '.pal', source['palette']['sha256'])]
    for frame in source['frames']:
        declared.extend([(frame['file'], frame['rgbaSha256']), (frame['indexFile'], frame['indexSha256'])])
    for relative, digest in declared:
        file = native_file.parent / 'native' / relative
        assert sha(file) == digest
        dependencies.add(file)
authoring = Path('.artifacts/m2-4/urban-rock-crate-authoring-batch45-v1')
authority_file = native_file.parent / 'faction-wall-authority-v2.json'
authority = read(authority_file)
for pin in authority['files']: assert record(Path(pin['file'])) == pin
handoff = dict(schema='m2-4-urban-overlay-resource-handoff-v1',
    status='PASS_SELECTED_NATIVE_AUTHORING_ACCEPTED_PAYLOAD_AND_ARCHIVE_HASHES',
    selectedEnvironment=contract['selectedPack'], selectedTerrain=delta['selectedTerrain'], sourceContract=record(contract_file),
    files=[record(file) for file in sorted(root.rglob('*')) if file.is_file()],
    nativeDependencies=[record(file) for file in sorted(dependencies)], factionAuthority=record(authority_file),
    factionDependencies=authority['files'], authoringDependencies=[record(file) for file in sorted(authoring.rglob('*')) if file.is_file()],
    nativeReports=[record(file) for file in args.native_reports],
    priorAcceptedFamiliesPreserved=79, unselectedCandidates='The first crate mother and srock01 system-marker mother are retained but excluded from selection and review.',
    scope='Internal singleton Mac host and existing isolated task resources. Embedded HTML/JSON delivery only; independent final M2.4 package and main integration remain pending.')
for name, value in [('coverage-delta.json', delta), ('resource-handoff.json', handoff)]:
    with (args.output / name).open('x') as stream: stream.write(json.dumps(value, indent=2) + '\n')
print(json.dumps(dict(coveredGroups=13, remaining=delta['remainingByKind'], files=len(handoff['files']),
    nativeDependencies=len(dependencies), authoredNewFamilies=7)))
