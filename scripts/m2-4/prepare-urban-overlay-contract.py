"""Declare eight authored Urban overlays and source-pinned accepted sandbag reuse."""
import argparse
import copy
import hashlib
import json
import shutil
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('prepared', type=Path)
parser.add_argument('audit', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('reuse_revision')
args = parser.parse_args()
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
encode = lambda value: json.dumps(value, indent=2) + '\n'
base_file = Path('desktop/environment-urban-hd-contract.json')
base, guide, audit = read(base_file), read(args.prepared / 'source.json'), read(args.audit)
assert base['theater'] == guide['theater'] == 'URBAN'
assert audit['sourceSha256'] == sha(args.prepared / 'source.json')
inventory_file = Path(guide['inventoryFile'])
assert sha(inventory_file) == guide['inventorySha256']
inventory = read(inventory_file)
sources = [source for source in guide['sources'] if source['member'] not in ['guwall.shp', 'nuwall.shp']]
assert len(sources) == 9
contract, bindings, families = copy.deepcopy(base), [], []
for source in sources:
    name = source['member']
    assert name not in contract['sources'] and source['hasShadow']
    count = source['totalFrames'] // 2
    assert count == (32 if name == 'gusand.shp' else 1)
    assert not source['remapable']
    assert sha(args.prepared / 'native' / source['nativeFile']) == source['sha256']
    assert sha(args.prepared / 'native' / (source['palette']['sha256'] + '.pal')) == source['palette']['sha256']
    for frame in source['frames']:
        assert sha(args.prepared / 'native' / frame['file']) == frame['rgbaSha256']
        assert sha(args.prepared / 'native' / frame['indexFile']) == frame['indexSha256']
    descriptor = dict(sha256=source['sha256'], canvas=source['canvas'], totalFrames=source['totalFrames'],
        bodyFrames=count, palette=source['palette'], hasShadow=True, remapable=source['remapable'],
        framePalettes={str(slot): dict(**source['palette'], role='body', runtimeUsed=True,
                                     remapable=source['remapable']) for slot in range(count)})
    contract['sources'][name] = descriptor
    rows = [row for row in inventory['rows'] if row['theater'] == 'URBAN' and row['kind'] == 'overlay'
            and row.get('source', {}).get('member') == name]
    assert rows and all(not row['dependencies'] and row['source']['sha256'] == source['sha256'] for row in rows)
    identities = sorted({row['id'] for row in rows})
    expected = 'RUBBLE_OVERLAY' if name == 'srock01.urb' else 'GASAND' if name == 'gusand.shp' else name.split('.')[0].upper()
    assert identities == [expected]
    family = 'urban-' + name.split('.')[0]
    assert family not in contract['families']
    basis = dict(theater='URBAN', members={name: descriptor}, identities=identities)
    contract['families'][family] = dict(members=[name], identities=identities, kinds=['overlay'],
        editions=sorted({row['edition'] for row in rows}),
        familyHash=hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest())
    families.append(family)
    for row in rows:
        assert row['id'] not in contract['identities'][row['edition']]
        contract['identities'][row['edition']][row['id']] = family
        bindings.append(dict(edition=row['edition'], identity=row['id'], family=family, nativeMember=name))
contract['preparedSourceSha256'] = sha(args.prepared / 'source.json')
contract['extensions'] = dict(milestone='M2.4', newFamilies=sorted(families), bindings=bindings,
    baselineContractSha256=sha(base_file), baselineSelectedPack=base['selectedPack'],
    inventorySha256=sha(inventory_file), state='SOURCE_CONTRACT_DECLARED_STATIC_AND_NATIVE_PENDING',
    policy='Retain native geometry, shadow dependencies and owner data. Faction walls retain their separate accepted authority.')
with args.output.open('x') as stream:
    stream.write(encode(contract))

donor_contract = read(Path('desktop/environment-hd-contract.json'))
donor_root = Path('.local/environment-packs') / donor_contract['selectedPack']['revision']
assert sha(donor_root / 'manifest.json') == donor_contract['selectedPack']['sha256']
donor = read(donor_root / 'manifest.json')
proof, = [row for row in audit['rows'] if row['member'] == 'gusand.shp']
assert len(proof['slots']) == 32 and all(row['status'] == 'ELIGIBLE_EXACT_RENDERED_BODY_DONOR'
    and row['sameOwnerPolicy'] and row['differingOwnerPixels'] == 0 for row in proof['slots'])
entry, = donor['families']['environment-gtsand']['members']
file = donor_root / entry['path']
assert sha(file) == entry['sha256']
manifest = read(file)
source, = [source for source in sources if source['member'] == 'gusand.shp']
assert manifest['source']['sha256'] == proof['donorSourceSha256']
assert manifest['logical']['canvas'] == source['canvas']
assert manifest['logical']['frames'] == [dict(nativeFrame=frame['slot'], trimOrigin=frame['origin'],
    trimSize=frame['size'], legacyRenderSize=[value + value % 2 for value in frame['size']], empty=frame['empty'])
    for frame in source['frames'][:32]]
destination = Path('.local/environment-packs') / args.reuse_revision
member_root = destination / 'members/gusand-shp'
assert not destination.exists()
shutil.copytree(file.parent, member_root)
manifest.update(packId='environment-gusand-shp', packRevision=args.reuse_revision,
    source=dict(member='gusand.shp', sha256=source['sha256'], theater='URBAN', kind='resolved-shp-member'))
(member_root / 'manifest.json').write_text(json.dumps(manifest, separators=(',', ':')) + '\n')
reused_files = []
for path in file.parent.rglob('*.png'):
    relative = path.relative_to(file.parent)
    assert sha(path) == sha(member_root / relative)
    reused_files.append(dict(file=str(member_root / relative), sha256=sha(path)))
family = 'urban-gusand'
pack = dict(schema='environment-shp-pack-v1', theater='URBAN', editions=['ra2', 'yr'], revision=args.reuse_revision,
    families={family: dict(familyHash=contract['families'][family]['familyHash'],
        members=[dict(member='gusand.shp', path='members/gusand-shp/manifest.json', sha256=sha(member_root / 'manifest.json'))])})
(destination / 'manifest.json').write_text(json.dumps(pack, separators=(',', ':')) + '\n')
receipt = dict(status='BODY_EQUIVALENCE_AND_EXACT_ACCEPTED_PNG_REUSE_STATIC_AND_NATIVE_PENDING',
    donor=donor_contract['selectedPack'], donorMetadataSha256=entry['sha256'], sourceProof=str(args.audit),
    sourceProofSha256=sha(args.audit), target=dict(revision=args.reuse_revision, sha256=sha(destination / 'manifest.json')),
    files=reused_files, newArtwork=False, sourceGeometryOwnerAndShadowsRetained=True)
with args.output.with_name('sandbag-reuse-v1.json').open('x') as stream:
    stream.write(encode(receipt))
print(json.dumps(dict(newFamilies=len(families), newArtFamilies=8, reusedPngs=len(reused_files), bindings=len(bindings))))
