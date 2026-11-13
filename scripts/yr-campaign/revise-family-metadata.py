"""Replace a pending family descriptor additively while reusing identical PNGs."""
import argparse
import copy
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('previous', type=Path)
parser.add_argument('stage', type=Path)
parser.add_argument('revision')
parser.add_argument('receipt', type=Path)
args = parser.parse_args()
read = lambda file: json.loads(file.read_text())
sha = lambda payload: hashlib.sha256(payload).hexdigest()
encode = lambda value: (json.dumps(value, indent=2) + '\n').encode()
prior, stage = read(args.previous), args.stage.resolve()
assert prior['status'] == 'COMPLETE_FAMILY_REGISTERED_NATIVE_AND_USER_REVIEW_PENDING'
assert prior['internalVisualInspection']['userVisualAcceptance'] == 'PENDING'
assert not args.receipt.exists() and args.revision != prior['bundle']['revision']
verification, inspection = read(stage / 'verification.json'), read(stage / 'visual-inspection.json')
assert verification['status'] == 'PASS' and verification['sha256'] == sha((stage / 'pack/manifest.json').read_bytes())
assert inspection['status'] == 'PASS_INTERNAL_NATIVE_GEOMETRY_AND_DENSITY_INSPECTION'
assert inspection['packSha256'] == verification['sha256']
pack = read(stage / 'pack/manifest.json')
assert list(pack['families']) == [prior['family']]
family = pack['families'][prior['family']]
assert family['familyHash'] == prior['bundle']['familyHash']
directory = Path('.local/campaign/yr') / prior['mission']['mission'][:-4]
manifest_file = directory / 'manifest.json'
manifest = read(manifest_file)
old_bundle_name = 'environment-family-' + prior['bundle']['revision'] + '.json'
old_bundle, = [row for row in manifest['files'] if row['name'] == old_bundle_name]
assert sha((directory / old_bundle_name).read_bytes()) == old_bundle['sha256']
assert read(directory / old_bundle_name) == prior['bundle']
payloads, members = {}, []
for member in family['members']:
    old, = [row for row in prior['bundle']['members'] if row['member'] == member['member']]
    old_bytes = (directory / old['manifest']).read_bytes()
    assert sha(old_bytes) == old['sha256']
    original = json.loads(old_bytes)
    file = stage / 'pack' / member['path']
    assert sha(file.read_bytes()) == member['sha256']
    metadata = read(file)
    for variant in metadata['variants']:
        donor, = [row for row in original['variants'] if row['density'] == variant['density']]
        for page in variant['pages']:
            accepted, = [row for row in donor['pages'] if row['id'] == page['id']]
            for role in ['base', 'data']:
                assert page[role + 'Sha256'] == accepted[role + 'Sha256']
                assert page[role + 'Bytes'] == accepted[role + 'Bytes']
                assert sha((directory / accepted[role]).read_bytes()) == accepted[role + 'Sha256']
                page[role] = accepted[role]
    expected = {**original, 'packId': original['packId'].replace('_', '-'), 'packRevision': args.revision}
    assert metadata == expected, 'This operation changes only pack identifier and revision'
    name = args.revision + '-' + member['member'].replace('.', '-') + '.json'
    payloads[name] = encode(metadata)
    members.append(dict(member=member['member'], manifest=name, sha256=sha(payloads[name])))
bundle = {**prior['bundle'], 'revision': args.revision, 'members': members}
payloads['environment-family-' + args.revision + '.json'] = encode(bundle)
files = []
for name, payload in payloads.items():
    assert not (directory / name).exists() and not any(row['name'] == name for row in manifest['files'])
    files.append(dict(name=name, bytes=len(payload), sha256=sha(payload),
        route=f"/local-campaign/yr/{prior['mission']['mission'][:-4]}/{name}"))
for name, payload in payloads.items():
    (directory / name).write_bytes(payload)
manifest['files'] = [row for row in manifest['files'] if row['name'] != old_bundle_name] + files
manifest_file.write_bytes(encode(manifest))
receipt = copy.deepcopy(prior)
receipt.update(stage=str(stage), preparation=read(stage / 'preparation.json'), sourceVerification=verification,
    internalVisualInspection=inspection, bundle=bundle, files=files,
    predecessor=dict(file=str(args.previous), sha256=sha(args.previous.read_bytes()),
        inactiveBundle=old_bundle, oldFilesRetained=True, copiedPngFiles=0),
    metadataCorrection='Only the pending pack identifiers and revision change. Complete PNGs, native geometry, owner data and shadows are identical.')
args.receipt.write_bytes(encode(receipt))
print(json.dumps(dict(family=prior['family'], revision=args.revision, addedMetadataFiles=len(files), copiedPngFiles=0)))
