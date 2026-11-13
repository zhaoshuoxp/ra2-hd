"""Correct a source-qualified SHP class without replacing or duplicating image payloads."""
import argparse
import copy
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('stage', type=Path)
parser.add_argument('revision')
parser.add_argument('receipt', type=Path)
parser.add_argument('retained_receipt', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
read = lambda path: json.loads(path.read_text())
encode = lambda value: (json.dumps(value, indent=2) + '\n').encode()
sha = lambda value: hashlib.sha256(value).hexdigest()
assert args.revision and all(char in 'abcdefghijklmnopqrstuvwxyz0123456789-' for char in args.revision)
stage = args.stage.resolve()
previous_bytes = args.receipt.read_bytes()
previous = json.loads(previous_bytes)
prepared, verified, inspected = [read(stage / name) for name in
    ['preparation.json', 'verification.json', 'visual-inspection.json']]
assert verified['status'] == 'PASS' and verified['sha256'] == sha((stage / 'pack/manifest.json').read_bytes())
assert inspected['status'] == 'PASS_INTERNAL_NATIVE_GEOMETRY_AND_DENSITY_INSPECTION'
assert inspected['packSha256'] == verified['sha256'] and inspected['independentDensities'] == [2, 4]
assert not inspected['userFullFamilyAcceptance'] and not previous['internalVisualInspection']['userFullFamilyAcceptance']
addition, pack = read(stage / 'contract.json'), read(stage / 'pack/manifest.json')
identity, family = next(iter(addition['families'].items()))
assert len(addition['families']) == 1 and len(family['members']) == 1 and previous['family'] == identity
mission, = family['sourceScope']['campaignSources']
theater = addition['theater']
contract_path = root / ('desktop/environment' + ('' if theater == 'TEMPERATE' else '-' + theater.lower()) + '-hd-contract.json')
contract_bytes = contract_path.read_bytes()
contract = json.loads(contract_bytes)
assert {**contract['families'][identity], 'kinds': family['kinds']} == family
assert all(contract['sources'][name] == value for name, value in addition['sources'].items())
source = read(stage / 'prepared/source.json')
assert source['nativeRegistryQualification']['schema'] == 'retail-shp-object-kind-v1'
assert source['sources'][0]['nativeKind'] == family['kinds'][0]
directory = root / '.local/campaign/ra2' / mission['mission'][:-4]
assert sha((directory / mission['mission']).read_bytes()) == mission['sha256']
manifest_path = directory / 'manifest.json'
manifest_bytes = manifest_path.read_bytes()
manifest = json.loads(manifest_bytes)
old_bundle_name = 'environment-family-' + previous['bundle']['revision'] + '.json'
old_bundle_record, = [item for item in manifest['files'] if item['name'] == old_bundle_name]
assert sha((directory / old_bundle_name).read_bytes()) == old_bundle_record['sha256']
member, = pack['families'][identity]['members']
old_member, = previous['bundle']['members']
assert old_member['member'] == member['member']
old = read(directory / old_member['manifest'])
metadata_path = stage / 'pack' / member['path']
assert sha(metadata_path.read_bytes()) == member['sha256']
metadata = read(metadata_path)
assert old['source'] == metadata['source'] and old['logical'] == metadata['logical']
reused = []
for variant, original in zip(metadata['variants'], old['variants'], strict=True):
    assert variant['density'] == original['density']
    for page, old_page in zip(variant['pages'], original['pages'], strict=True):
        for role in ['base', 'data']:
            payload = (metadata_path.parent / str(variant['density']) / page['id'] / (role + '.png')).read_bytes()
            name = old_page[role]
            assert payload == (directory / name).read_bytes()
            record, = [item for item in manifest['files'] if item['name'] == name]
            assert len(payload) == record['bytes'] == page[role + 'Bytes']
            assert sha(payload) == record['sha256'] == page[role + 'Sha256']
            page[role] = name
            reused.append(record)
    assert variant == original
normalized = copy.deepcopy(metadata)
normalized['packRevision'] = old['packRevision']
normalized['color']['sourcePinnedStructuralCoverage']['kind'] = old['color']['sourcePinnedStructuralCoverage']['kind']
assert normalized == old, 'Only revision and independently qualified structural class may change'
new_member_name = args.revision + '-' + member['member'].replace('.', '-') + '.json'
new_member_bytes = encode(metadata)
bundle = {**previous['bundle'], 'revision': args.revision,
    'members': [dict(member=member['member'], manifest=new_member_name, sha256=sha(new_member_bytes))]}
payloads = {new_member_name: new_member_bytes, 'environment-family-' + args.revision + '.json': encode(bundle)}
files = []
for name, payload in payloads.items():
    assert not (directory / name).exists() and all(item['name'] != name for item in manifest['files'])
    files.append(dict(name=name, bytes=len(payload), sha256=sha(payload),
        route=f"/local-campaign/ra2/{mission['mission'][:-4]}/{name}"))
assert not args.retained_receipt.exists()
receipt = dict(status='COMPLETE_FAMILY_METADATA_CLASS_CORRECTED_NATIVE_REVIEW_PENDING', family=identity,
    mission=mission, theater=theater, stage=str(stage), preparation=prepared, sourceVerification=verified,
    internalVisualInspection=inspected, bundle=bundle, files=files, reusedImageFiles=reused,
    supersededRegistration=dict(receipt=str(args.retained_receipt), sha256=sha(previous_bytes),
        bundle=old_bundle_record, reason='Native OverlayTypes identity was previously mislabeled as terrain. Image bytes and logical geometry are identical.'),
    priorManifestSha256=sha(manifest_bytes), contractBeforeSha256=sha(contract_bytes),
    imagePayloadsReplaced=0, imagePayloadsDuplicated=0, acceptedSelectorsChanged=False,
    nativeRuntimeEvidence=inspected.get('nativeRuntimeEvidence'), userFullFamilyAcceptance=False)
manifest['files'] = [item for item in manifest['files'] if item['name'] != old_bundle_name] + files
contract['families'][identity] = family
for name, payload in payloads.items():
    with (directory / name).open('xb') as output:
        output.write(payload)
args.retained_receipt.write_bytes(previous_bytes)
manifest_path.write_bytes(encode(manifest))
contract_path.write_bytes(encode(contract))
receipt['contractAfterSha256'] = sha(contract_path.read_bytes())
receipt['manifestAfterSha256'] = sha(manifest_path.read_bytes())
args.receipt.write_bytes(encode(receipt))
print(json.dumps(dict(family=identity, metadataFiles=len(files), reusedImageFiles=len(reused), kind=family['kinds'])))
