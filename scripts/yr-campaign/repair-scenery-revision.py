"""Publish corrected YR scenery revision metadata using unchanged image payloads."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('registration', type=Path)
parser.add_argument('output_stage', type=Path)
parser.add_argument('revision')
parser.add_argument('receipt', type=Path)
args = parser.parse_args()
assert re.fullmatch(r'[a-z0-9-]+', args.revision)
read = lambda file: json.loads(Path(file).read_text())
encode = lambda value: (json.dumps(value, indent=2) + '\n').encode()
sha = lambda payload: hashlib.sha256(payload).hexdigest()
previous_bytes = args.registration.read_bytes()
previous = json.loads(previous_bytes)
assert previous['mission']['edition'] == 'yr' and previous['preparation']['userVisualAcceptance'] == 'PENDING'
assert not args.output_stage.exists() and not args.receipt.exists()
stage = args.output_stage.resolve()
shutil.copytree(previous['stage'], stage)
prepared = read(stage / 'preparation.json')
prepared['metadataRevisionPredecessor'] = dict(stage=previous['stage'], registration=str(args.registration),
    sha256=sha(previous_bytes), policy='Only the metadata transport revision changes; original image payloads remain exact.')
(stage / 'preparation.json').write_bytes(encode(prepared))
pack = read(stage / 'pack/manifest.json')
family, = pack['families'].values()
assert len(family['members']) == 1
member = family['members'][0]
file = stage / 'pack' / member['path']
metadata = read(file)
assert metadata['color']['authoredScenery']['declaration']['schema'] == 'yr-source-pinned-authored-scenery-v1'
assert not re.fullmatch(r'[a-zA-Z0-9.-]+', metadata['packRevision'])
old_revision = metadata['packRevision']
metadata['packRevision'] = args.revision
file.write_bytes(encode(metadata)); member['sha256'] = sha(file.read_bytes())
pack['revision'] = args.revision
(stage / 'pack/manifest.json').write_bytes(encode(pack))
subprocess.run(['python3', 'scripts/yr-campaign/verify-authored-family.py', str(stage)], check=True)
verified = read(stage / 'verification.json')
inspected = read(stage / 'visual-inspection.json')
inspected['packSha256'] = verified['sha256']
(stage / 'visual-inspection.json').write_bytes(encode(inspected))
mission = previous['mission']['mission']
directory = Path('.local/campaign/yr') / mission[:-4]
manifest_file = directory / 'manifest.json'
manifest_bytes = manifest_file.read_bytes(); manifest = json.loads(manifest_bytes)
published = read(directory / previous['bundle']['members'][0]['manifest'])
reused = []
for variant, old_variant in zip(metadata['variants'], published['variants'], strict=True):
    assert variant['density'] == old_variant['density']
    for page, old_page in zip(variant['pages'], old_variant['pages'], strict=True):
        for role in ['base', 'data']:
            payload = (file.parent / str(variant['density']) / page['id'] / (role + '.png')).read_bytes()
            assert payload == (directory / old_page[role]).read_bytes()
            record, = [row for row in manifest['files'] if row['name'] == old_page[role]]
            assert sha(payload) == record['sha256'] == page[role + 'Sha256']
            page[role] = old_page[role]; reused.append(record)
comparison = copy.deepcopy(metadata); comparison['packRevision'] = old_revision
assert comparison == published, 'Only the invalid revision spelling may change'
new_member = args.revision + '-' + member['member'].replace('.', '-') + '.json'
payload = encode(metadata)
bundle = {**previous['bundle'], 'revision': args.revision,
    'members': [dict(member=member['member'], manifest=new_member, sha256=sha(payload))]}
payloads = {new_member: payload, 'environment-family-' + args.revision + '.json': encode(bundle)}
files = []
for name, payload in payloads.items():
    assert not (directory / name).exists() and not any(row['name'] == name for row in manifest['files'])
    files.append(dict(name=name, bytes=len(payload), sha256=sha(payload),
        route=f'/local-campaign/yr/{mission[:-4]}/{name}'))
retired = {previous['bundle']['members'][0]['manifest'], 'environment-family-' + previous['bundle']['revision'] + '.json'}
manifest['files'] = [row for row in manifest['files'] if row['name'] not in retired] + files
assert len(manifest['files']) <= 256
for name, payload in payloads.items():
    (directory / name).open('xb').write(payload)
manifest_file.write_bytes(encode(manifest))
receipt = {**previous, 'status': 'COMPLETE_SCENERY_METADATA_REVISION_REPAIRED_NATIVE_REVIEW_PENDING',
    'stage': str(stage), 'preparation': prepared, 'sourceVerification': verified, 'internalVisualInspection': inspected,
    'bundle': bundle, 'files': files, 'reusedImageFiles': reused,
    'previousRegistration': dict(file=str(args.registration), sha256=sha(previous_bytes)),
    'retiredActiveMetadataRoutes': sorted(retired), 'imagePayloadsReplaced': 0, 'imagePayloadsDuplicated': 0,
    'priorManifestSha256': sha(manifest_bytes), 'manifestAfterSha256': sha(manifest_file.read_bytes()),
    'qualification': 'Invalid underscore transport spelling is corrected through new metadata. '
        'Retained original metadata remains historical evidence; all four original image payloads stay byte-identical.'}
args.receipt.open('xb').write(encode(receipt))
print(json.dumps(dict(family=previous['family'], metadataFiles=len(files), reusedImageFiles=len(reused), receipt=str(args.receipt))))
