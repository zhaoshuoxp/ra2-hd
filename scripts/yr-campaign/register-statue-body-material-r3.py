"""Select complete architectural statue body states with the retained HD head."""
import copy
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
read = lambda p: json.loads(p.read_text())
encode = lambda value: (json.dumps(value, indent=2) + '\n').encode()
sha = lambda data: hashlib.sha256(data).hexdigest()
stage = ROOT / '.artifacts/yr-campaign/task-newurban-caeast02-stage-r2'
verification = read(stage / 'verification.json')
assert verification['status'] == 'PASS'
pack_file = stage / 'pack/manifest.json'
assert sha(pack_file.read_bytes()) == verification['sha256']
inspection = read(stage / 'visual-inspection.json')
assert inspection['status'] == 'PASS_INTERNAL_NATIVE_GEOMETRY_AND_DENSITY_INSPECTION'
assert inspection['packSha256'] == verification['sha256']
contract_file = ROOT / 'desktop/environment-newurban-hd-contract.json'
directory = ROOT / '.local/campaign/yr/sov05umd'
manifest_file = directory / 'manifest.json'
contract, campaign = read(contract_file), read(manifest_file)
before = contract['identities']['yr']['CAEAST02']
assert before == 'yr-task-newurban-caeast02-v1'
family = 'yr-feedback-caeast02-body-r3'
assert family not in contract['families']
old_bundle = read(directory / 'environment-family-yr-task-newurban-caeast02-r1.json')
old_metadata = read(directory / old_bundle['members'][0]['manifest'])
entry, = read(pack_file)['families'][before]['members']
metadata_file = stage / 'pack' / entry['path']
assert sha(metadata_file.read_bytes()) == entry['sha256']
metadata = read(metadata_file)
assert metadata['source'] == old_metadata['source']
assert metadata['logical'] == old_metadata['logical']
assert metadata['source']['member'] == 'cneast02.shp'
original_files = {row['name']: row for row in campaign['files']}
for name, row in original_files.items():
    assert sha((directory / name).read_bytes()) == row['sha256']
payloads = {}
for variant, prior in zip(metadata['variants'], old_metadata['variants']):
    density = variant['density']
    assert density == prior['density']
    assert variant['frames'] == prior['frames']
    for page in variant['pages']:
        page_root = metadata_file.parent / str(density) / page['id']
        for role in ['base', 'data']:
            data = (page_root / (role + '.png')).read_bytes()
            assert sha(data) == page[role + 'Sha256']
            name = f'{family}-{density}-{page["id"]}-{role}.png'
            payloads[name] = data
            page[role] = name
metadata['packRevision'] = family
declaration = copy.deepcopy(contract['families'][before])
declaration['familyHash'] = sha(encode(dict(originalFamilyHash=declaration['familyHash'],
    revision=family, material='Source-faithful architectural casting; complete body states.')))
assert declaration['requiredTurret'] is True
contract['families'][family] = declaration
contract['identities']['yr']['CAEAST02'] = family
contract['turretAttachments'][family] = copy.deepcopy(contract['turretAttachments'][before])
name = family + '-member.json'
payloads[name] = encode(metadata)
bundle = dict(schema='campaign-environment-extension-v1', identity=family,
    familyHash=declaration['familyHash'], mission='sov05umd.map', theater='NEWURBAN',
    edition='yr', revision=family, members=[dict(member=entry['member'], manifest=name,
        sha256=sha(payloads[name]))], acceptance='USER_REOPENED_MATERIAL_NATIVE_AND_VISUAL_REVIEW_PENDING')
payloads['environment-family-' + family + '.json'] = encode(bundle)
head = read(directory / 'environment-turret-yr-cahead-r2.json')
assert head['identity'] == before and head['family'] == 'CAEAST02'
head['identity'], head['revision'] = family, family
payloads['environment-turret-' + family + '.json'] = encode(head)
assert len(campaign['files']) + len(payloads) <= 256
for name, data in payloads.items():
    assert name not in original_files
    (directory / name).open('xb').write(data)
    campaign['files'].append(dict(name=name, bytes=len(data), sha256=sha(data),
        route='/local-campaign/yr/sov05umd/' + name))
for name, row in original_files.items():
    assert sha((directory / name).read_bytes()) == row['sha256']
manifest_file.write_bytes(encode(campaign))
contract_file.write_bytes(encode(contract))
receipt = dict(schema='yr-statue-complete-architectural-body-material-v1',
    status='SELECTED_NATIVE_VISUAL_REVIEW_PENDING', identity='CAEAST02', before=before, family=family,
    independentDensities=[2, 4], bodyStates=[0, 1, 2, 3], originalDuplicateDamageStateRetained=True,
    reusedCompleteHead='yr-cahead-r2', addedFiles=len(payloads),
    priorPayloadsChanged=0, preservedPriorFiles=len(original_files),
    originalSourceGeometryPivotsShadowsAnimationTimingAndMapsUnchanged=True,
    authoringSelection='.local/source-art/yr-campaign-v1/task-buildings/newurban-caeast02/selected-states-r2.json',
    preparation=str(stage.relative_to(ROOT)), userVisualAcceptance='PENDING')
(ROOT / 'docs/yr-campaign-statue-body-material-20261108-r3.json').open('xb').write(encode(receipt))
print(json.dumps(dict(family=family, addedFiles=len(payloads), originalBodyStatesAndHeadPreserved=True)))
