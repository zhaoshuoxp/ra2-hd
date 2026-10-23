"""Copy complete prior authoring inputs and bounded exact accepted NewTheater donors."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('root', type=Path)
parser.add_argument('--prior-root', type=Path, required=True)
parser.add_argument('--prepared', type=Path, required=True)
parser.add_argument('--batch', type=int, choices=[19, 21], default=19)
args = parser.parse_args()
root, prior = args.root.resolve(), args.prior_root.resolve()
assert (root / 'package-receipt.json').is_file() and root != prior
records, inherited, seen = [], [], {}


def copy(source, relative, expected=None):
    target = root / relative
    assert target.is_relative_to(root) and source.is_file()
    digest = sha(source)
    assert expected is None or digest == expected
    if relative in seen:
        assert seen[relative] == digest
        return
    assert not target.exists()
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    assert sha(target) == digest
    seen[relative] = digest
    return dict(source=str(source.resolve()), file=relative, bytes=target.stat().st_size, sha256=digest)


prior_batch = args.batch - 1
manifests = [f'batch{prior_batch}-artwork-source-handoff.json',
             f'reused-batch{prior_batch - 1}-source-handoff-verification.json']
pins = {}
for name in manifests:
    pins[name] = sha(prior / name)
    for row in read(prior / name)['files']:
        source = prior / row['file']
        assert source.is_relative_to(prior) and source.stat().st_size == row['bytes']
        inherited.append(copy(source, f'Reused-Batch{prior_batch}-Source-Handoff/' + row['file'], row['sha256']))
native = read(args.prepared / 'source.json')
reuse = read(args.prepared / 'reuse-receipt.json')
assert reuse.get('kind', 'building') == ('overlay' if args.batch == 21 else 'building')
native_folder = 'Native-Accepted-Reuse' if args.batch == 21 else 'Native-Buildings'
native_files = set()
for source in native['sources']:
    native_files.add(source['nativeFile'])
    native_files.add(source['palette']['sha256'] + '.pal')
    for frame in source['frames']:
        native_files.update([frame['file'], frame['indexFile']])
for name in sorted(native_files):
    records.append(copy(args.prepared / 'native' / name, native_folder + '/' + name))
accepted_path = Path('desktop/environment-hd-contract.json')
assert sha(accepted_path) == reuse['acceptedContractSha256']
accepted = read(accepted_path)
donor_root = Path('.local/environment-packs') / reuse['donorSelectedPack']['revision']
assert sha(donor_root / 'manifest.json') == reuse['donorSelectedPack']['sha256']
donor = read(donor_root / 'manifest.json')
records.append(copy(accepted_path, 'Accepted-Temperate-Donors/contract.json'))
records.append(copy(donor_root / 'manifest.json', 'Accepted-Temperate-Donors/pack-manifest.json'))
for row in reuse['families']:
    entry, = [member for family in donor['families'].values() for member in family['members']
              if member['member'] == row['donorMember']]
    file = donor_root / entry['path']
    assert sha(file) == row['donorMetadataSha256']
    for input_file in file.parent.rglob('*'):
        if input_file.is_file():
            relative = 'Accepted-Temperate-Donors/' + str(input_file.relative_to(donor_root))
            records.append(copy(input_file, relative))
records.append(copy(Path('.artifacts/m2-4/accepted-unittem.pal'), native_folder + '/unittem.pal'))
for name in ['source.json', 'contract.json', 'contract-selected-v1.json', 'reuse-receipt.json']:
    recipe_folder = 'accepted-family-reuse' if args.batch == 21 else 'accepted-building-reuse'
    records.append(copy(args.prepared / name, 'Authoring/' + recipe_folder + '/' + name))
assert all(records) and all(inherited)
for name, value in [
    (f'batch{args.batch}-artwork-source-handoff.json', dict(schema='m2-4-exact-accepted-building-source-handoff-v1', files=records,
        batch=args.batch, kind=reuse.get('kind', 'building'),
        policy='Complete bounded original Snow members, index/RGBA guides, original palettes, exact accepted donor PNGs and metadata are independently copied. No new mother artwork is claimed for byte-exact reuse.')),
    (f'reused-batch{prior_batch}-source-handoff-verification.json', dict(status='PASS_EXACT_COMPLETE_INHERITED_AUTHORING_TRANSFER',
        priorManifests=pins, files=inherited,
        policy='All retained prior input files remain byte-exact, including native sources, mothers, rejected attempts and receipts. Prior deliveries are unchanged.'))]:
    with (root / name).open('x') as stream:
        json.dump(value, stream, indent=2)
        stream.write('\n')
print(json.dumps(dict(newSourceFiles=len(records), inheritedSourceFiles=len(inherited),
    sourceBytes=sum(row['bytes'] for row in records + inherited))))
