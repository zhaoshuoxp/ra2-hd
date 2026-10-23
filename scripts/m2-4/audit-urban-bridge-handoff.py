"""Recheck original archives and deliver an incremental Urban object dependency inventory."""
import argparse
import collections
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('--smudges', action='store_true')
args = parser.parse_args()
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()


def record(path):
    return dict(file=str(path), sha256=sha(path), bytes=path.stat().st_size)


def write(name, value):
    with (args.output / name).open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


previous = Path('.artifacts/m2-4/urban-structures-batch42-v1/coverage-delta.json')
if args.smudges:
    previous = Path('.artifacts/m2-4/urban-bridge-batch43-v1/coverage-delta.json')
prior = read(previous)
baseline = Path(prior['baseline']['file'])
assert sha(baseline) == prior['baseline']['sha256']
inventory = read(baseline)
contract_file = Path('desktop/environment-urban-hd-contract.json')
contract = read(contract_file)
native_file = Path('.artifacts/m2-4/urban-bridge-native-v1/source.json')
if args.smudges:
    native_file = Path('.artifacts/m2-4/urban-smudge-native-batch44-v1/source.json')
native = read(native_file)
assert native['inventorySha256'] == sha(baseline)
members = {row['member']: row['sha256'] for row in native['sources']}
covered = [row for row in prior['remainingGaps']
           if row['member'] in members and row['sha256'] == members[row['member']]]
assert len(covered) == (24 if args.smudges else 27)
assert all(row['kind'] == ('smudge' if args.smudges else 'overlay') for row in covered)
keys = {row['key'] for row in covered}
remaining = [row for row in prior['remainingGaps'] if row['key'] not in keys]
assert len(remaining) == (268 if args.smudges else 292)
for archive in prior['archives']:
    assert record(Path(archive['file'])) == {key: archive[key] for key in ('file', 'sha256', 'bytes')}
map_ids = sorted({map_id for row in covered for map_id in row['maps']})
map_hashes = {row['source']['sha256'] for row in inventory['maps'] if row['mapId'] in map_ids}
delta = dict(status='PASS_INCREMENTAL_SOURCE_BOUND_RESOURCE_COVERAGE', baseline=prior['baseline'],
    priorDelta=record(previous), selectedEnvironment=contract['selectedPack'],
    selectedTerrain=read(Path('.local/terrain-urban-selection.json')),
    totalUrbanMapEntries=32, uniqueUrbanMapHashes=26, affectedMapEntries=len(map_ids),
    uniqueAffectedMapHashes=len(map_hashes), affectedMapIds=map_ids,
    newCompleteFamilies=24 if args.smudges else 2,
    newCompleteSourceGroups=len(covered), covered=covered,
    remainingGapFamilies=len(remaining), remainingByKind=dict(collections.Counter(row['kind'] for row in remaining)),
    remainingGaps=remaining, archives=prior['archives'], unchangedMapBytes=True, unchangedDependencyKeys=True,
    scope='Resource bindings only. Original archive hashes freshly rechecked; accepted 32-map identity, rules and dependency audit reused.',
    runtime='PENDING', visual='PENDING', windows='NOT_RUN', m24Complete=False)
pack_root = Path('.local/environment-packs') / contract['selectedPack']['revision']
assert sha(pack_root / 'manifest.json') == contract['selectedPack']['sha256']
files = [record(path) for path in sorted(pack_root.rglob('*')) if path.is_file()]
prepared = native_file.parent
dependencies = {native_file}
for source in native['sources']:
    declarations = [(source['nativeFile'], source['sha256']),
                    (source['palette']['sha256'] + '.pal', source['palette']['sha256'])]
    for frame in source['frames']:
        declarations.extend([(frame['file'], frame['rgbaSha256']),
                             (frame['indexFile'], frame['indexSha256'])])
    for relative, digest in declarations:
        path = prepared / 'native' / relative
        assert sha(path) == digest
        dependencies.add(path)
authoring = Path('.artifacts/m2-4/urban-bridge-authoring-v2')
if args.smudges:
    authoring = Path('.artifacts/m2-4/urban-smudge-authoring-batch44-v1')
handoff = dict(schema='m2-4-urban-object-resource-handoff-v1', kind='smudge' if args.smudges else 'bridge',
    status='PASS_CURRENT_SELECTED_FILES_NATIVE_AND_AUTHORING_HASHES',
    selectedEnvironment=contract['selectedPack'], selectedTerrain=delta['selectedTerrain'],
    sourceContract=record(contract_file), files=files,
    nativeDependencies=[record(path) for path in sorted(dependencies)],
    authoringDependencies=[record(path) for path in sorted(authoring.rglob('*')) if path.is_file()],
    scope='Ignored art is explicitly hash-pinned. Source commit alone is not delivery. Accepted TMP and faction dependencies retain their accepted authorities; final independent milestone transfer pending.')
write('coverage-delta.json', delta)
write('resource-handoff.json', handoff)
print(json.dumps(dict(affectedEntries=len(map_ids), affectedHashes=len(map_hashes),
    remaining=delta['remainingByKind'], packFiles=len(files),
    nativeDependencies=len(dependencies), authoringDependencies=len(handoff['authoringDependencies']))))
