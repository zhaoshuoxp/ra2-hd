"""Admit complete sixth-mission candidates without replacing accepted art packs."""
import copy
import hashlib
import json
import math
from pathlib import Path
import shutil
import sys

import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[2]
stage = Path(sys.argv[1]).resolve()
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
encode = lambda v: json.dumps(v, indent=2) + '\n'
contract_file = root / 'desktop/environment-hd-contract.json'
before = sha(contract_file)
contract = read(contract_file)
assert 'CDEST' not in contract.get('vxl', {}) and 'CAMIAM08' not in contract['identities']['ra2']
proof = read(stage / 'shp-verify.json')
assert proof['status'] == 'PASS' and proof['counts']['densityFrames'] == 8
addition = read(stage / 'contract.json')
identity, declared = next(iter(addition['families'].items()))
assert len(addition['families']) == 1 and declared['members'] == ['ctmiam08.shp']
pack = read(stage / 'shp-pack/manifest.json')
assert sha(stage / 'shp-pack/manifest.json') == proof['sha256']
member, = pack['families'][identity]['members']
metadata_file = stage / 'shp-pack' / member['path']
assert sha(metadata_file) == member['sha256']
metadata = read(metadata_file)
directory = root / '.local/campaign/ra2/sov06t'
campaign_file = directory / 'manifest.json'
campaign = read(campaign_file)
files = []

def add_file(name, payload):
    file = directory / name
    with file.open('xb') as output:
        output.write(payload)
    files.append(dict(name=name, bytes=len(payload), sha256=sha(file), route='/local-campaign/ra2/sov06t/' + name))

for variant in metadata['variants']:
    for page in variant['pages']:
        for role in ['base', 'data']:
            file = metadata_file.parent / str(variant['density']) / page['id'] / (role + '.png')
            assert sha(file) == page[role + 'Sha256'] and file.stat().st_size == page[role + 'Bytes']
            name = f"camiam08-r1-{variant['density']}-{page['id']}-{role}.png"
            add_file(name, file.read_bytes())
            page[role] = name
name = 'campaign-camiam08-r1.json'
add_file(name, encode(metadata).encode())
bundle = dict(schema='campaign-environment-extension-v1', identity=identity, familyHash=declared['familyHash'],
    mission='sov06t.map', theater='TEMPERATE', revision='complete-r1',
    members=[dict(member=member['member'], manifest=name, sha256=files[-1]['sha256'])],
    acceptance='MATERIAL_DIRECTION_ACCEPTED_COMPLETE_RUNTIME_USER_REVIEW_PENDING')
add_file('environment-family-camiam08-r1.json', encode(bundle).encode())
assert not set(file['name'] for file in files) & set(file['name'] for file in campaign['files'])
campaign['files'].extend(files)
for name, value in addition['sources'].items():
    assert name not in contract['sources']
    contract['sources'][name] = value
contract['families'][identity] = declared
contract['identities']['ra2']['CAMIAM08'] = identity

inventory = read(stage / 'vxl-inventory.json')
accepted_file = root / '.local/hd-packs/allied-dest-vxl/owner-r3/manifest.json'
accepted = read(accepted_file)
child = next(part for part in accepted['parts'] if part['actor'] == 'ASW')
for member in ['asw.vxl', 'asw.hva']:
    assert inventory['assets'][member]['sha256'] == accepted['sources'][member]
variants, masks = [], []
round_pixel = lambda v: math.floor(v + .5)
for density in [2, 4]:
    source = stage / f'vxl-{density}x'
    directory = root / f'.local/hd-packs/campaign-sov06-cdest-vxl/full-r2-{density}x'
    assert not directory.exists()
    shutil.copytree(source, directory)
    manifest = read(directory / 'manifest.json')
    assert manifest['identity'] == 'CDEST' and manifest['density'] == density
    assert {part['member'] for part in manifest['parts']} == {'cdest.vxl', 'cdestwo.vxl'}
    part = copy.deepcopy(child)
    for role, resource in part['files'].items():
        file = accepted_file.parent / resource['file']
        assert sha(file) == resource['sha256']
        pixels = Image.open(file).convert('RGBA')
        if density == 2:
            canvas = Image.new('RGBA', tuple(round_pixel(v / 2) for v in pixels.size),
                (0, 0, 0, 255) if role == 'data' else (0, 0, 0, 0))
            for frame in part['frames']:
                x, y, width, height = frame['rect']
                rectangle = [round_pixel(v / 2) for v in [x, y, width, height]]
                crop = pixels.crop((x, y, x + width, y + height))
                crop = (crop.convert('RGBa').resize(tuple(rectangle[2:]), Image.Resampling.LANCZOS).convert('RGBA')
                        if role == 'base' else crop.resize(tuple(rectangle[2:]), Image.Resampling.NEAREST))
                canvas.paste(crop, tuple(rectangle[:2]))
            pixels = canvas
        destination = directory / resource['file']
        assert not destination.exists()
        pixels.save(destination)
        resource.update(sha256=sha(destination), bytes=destination.stat().st_size)
    if density == 2:
        part['pageSize'] = [round_pixel(v / 2) for v in part['pageSize']]
        for frame in part['frames']:
            frame['rect'] = [round_pixel(v / 2) for v in frame['rect']]
    part['provenance'] = dict(method='Exact accepted ASW source/geometry/owner-material reuse; independently exported density buffers',
        acceptedManifestSha256=sha(accepted_file), sourcePart=child['key'], density=density)
    manifest['parts'].append(part)
    for part in manifest['parts']:
        base = np.asarray(Image.open(directory / part['files']['base']['file']).convert('RGBA'))
        file = directory / part['files']['data']['file']
        data = np.array(Image.open(file).convert('RGBA'))
        assert base.shape == data.shape
        outside = (base[..., 3] == 0) & (data[..., 0] != 0)
        count = int(outside.sum())
        if count:
            data[outside, 0] = 0
            Image.fromarray(data).save(file)
            part['files']['data'].update(sha256=sha(file), bytes=file.stat().st_size)
        assert not np.any((base[..., 3] == 0) & (data[..., 0] != 0))
        masks.append(dict(density=density, member=part['member'], transparentOwnerSamplesCleared=count))
        for role, resource in part['files'].items():
            file = directory / resource['file']
            assert sha(file) == resource['sha256'] and file.stat().st_size == resource['bytes']
    manifest.update(acceptance='REPRESENTATIVE_ACCEPTED_FULL_FAMILY_REVIEW_PENDING',
        sourcePalette=inventory['assets']['unittem.pal']['sha256'], sourceVpl=inventory['assets']['voxels.vpl']['sha256'])
    file = directory / 'manifest.json'
    file.write_text(encode(manifest))
    variants.append(dict(hash=sha(file), density=density, path=str(file.relative_to(root / '.local'))))
contract['vxl']['CDEST'] = dict(**{k: v for k, v in variants[1].items() if k != 'density'}, edition='ra2',
    members=['cdest.vxl', 'cdestwo.vxl', 'asw.vxl'], variants=variants, theaters=['TEMPERATE'])
contract_file.write_text(encode(contract))
campaign_file.write_text(encode(campaign))
receipt = dict(status='PASS_COMPLETE_SIXTH_ART_REGISTERED_NATIVE_RUNTIME_REVIEW_PENDING',
    sourceStage=str(stage), contractBeforeSha256=before, contractAfterSha256=sha(contract_file),
    acceptedEnvironmentSelectorChanged=False, copiedAcceptedEnvironmentPack=False, replacedAcceptedPngFiles=0,
    building=dict(identity=identity, sourceSha256=metadata['source']['sha256'], bundle=bundle, files=files,
        bodyFrames=4, nativeSeparateShadows=4, independentDensities=[2, 4], sourceVerification=proof),
    ship=dict(identity='CDEST', states=['loaded', 'empty'], nativeHeadings=list(range(0, 360, 45)),
        variants=variants, child='ASW', acceptedChildManifestSha256=sha(accepted_file), maskChecks=masks),
    budgetPolicy='Existing complete-family fallback, fixed texture budgets and Windows loading paths',
    acceptance='Representative direction accepted; complete native/runtime/user visual acceptance remains pending')
(root / 'docs/campaign-art/sov06-new-resources.json').write_text(encode(receipt))
print(json.dumps(dict(status=receipt['status'], shipVariants=variants, buildingFiles=len(files))))
