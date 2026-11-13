"""Preserve the original body ownership paint while selecting new casting RGB."""
import copy
import hashlib
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
read = lambda p: json.loads(p.read_text())
encode = lambda value: (json.dumps(value, indent=2) + '\n').encode()
sha = lambda data: hashlib.sha256(data).hexdigest()
directory = ROOT / '.local/campaign/yr/sov05umd'
contract_file = ROOT / 'desktop/environment-newurban-hd-contract.json'
campaign_file = directory / 'manifest.json'
contract, campaign = read(contract_file), read(campaign_file)
prior_family = 'yr-feedback-caeast02-body-r3'
family = 'yr-feedback-caeast02-body-r4'
assert contract['identities']['yr']['CAEAST02'] == prior_family
assert family not in contract['families']
old = read(directory / 'yr-task-newurban-caeast02-r1-cneast02-shp.json')
metadata = read(directory / (prior_family + '-member.json'))
assert old['source'] == metadata['source'] and old['logical'] == metadata['logical']
payloads, records = {}, []
for variant, reference in zip(metadata['variants'], old['variants']):
    density = variant['density']
    assert density == reference['density'] and variant['frames'] == reference['frames']
    for page, original in zip(variant['pages'], reference['pages']):
        assert page['id'] == original['id'] and page['size'] == original['size']
        def load(entry, role):
            data = (directory / entry[role]).read_bytes()
            assert sha(data) == entry[role + 'Sha256']
            return np.array(Image.open(io.BytesIO(data)).convert('RGBA'))
        base, generated_data = load(page, 'base'), load(page, 'data')
        original_base, original_data = load(original, 'base'), load(original, 'data')
        owner = original_data[..., 0] != 0
        preserve = owner | (generated_data[..., 0] != 0)
        revised = base.copy()
        # Preserve the exact previous ownership contour, palette shades and
        # edge alpha. New casting and brass RGB remain outside this region.
        revised[preserve] = original_base[preserve]
        np.testing.assert_array_equal(revised[~preserve], base[~preserve])
        np.testing.assert_array_equal(revised[owner], original_base[owner])
        assert not ((original_data[..., 0] != 0) & (revised[..., 3] == 0)).any()
        stream = io.BytesIO()
        Image.fromarray(revised).save(stream, format='PNG')
        for role, data in [('base', stream.getvalue()), ('data', (directory / original['data']).read_bytes())]:
            name = f'{family}-{density}-{page["id"]}-{role}.png'
            payloads[name] = data
            page.update({role: name, role+'Sha256': sha(data), role+'Bytes': len(data)})
        assert page['dataSha256'] == original['dataSha256']
        records.append(dict(density=density, page=page['id'], ownerPixels=int(owner.sum()),
            originalOwnerAndShadePageSha256=original['dataSha256'], dataPageExact=True,
            ownerBaseRgbaExact=True, castingOutsideOwnershipPreservationExact=True,
            preservedPaintPixels=int(preserve.sum())))
metadata['packRevision'] = family
metadata['color']['authoredBody']['ownerMaterialPreservation'] = dict(
    schema='unchanged-original-hd-owner-material-v1',
    sourceManifest='yr-task-newurban-caeast02-r1-cneast02-shp.json',
    sourceManifestSha256=sha((directory / 'yr-task-newurban-caeast02-r1-cneast02-shp.json').read_bytes()),
    exactOriginalOwnerContourShadesAndPaint=True)
declaration = copy.deepcopy(contract['families'][prior_family])
declaration['familyHash'] = sha(encode(dict(sourceFamily=declaration['familyHash'],
    family=family, originalOwnerMaterial='EXACT')))
contract['families'][family] = declaration
contract['identities']['yr']['CAEAST02'] = family
contract['turretAttachments'][family] = copy.deepcopy(contract['turretAttachments'][prior_family])
name = family + '-member.json'
payloads[name] = encode(metadata)
payloads['environment-family-'+family+'.json'] = encode(dict(
    schema='campaign-environment-extension-v1', identity=family, familyHash=declaration['familyHash'],
    mission='sov05umd.map', theater='NEWURBAN', edition='yr', revision=family,
    members=[dict(member=metadata['source']['member'], manifest=name, sha256=sha(payloads[name]))],
    acceptance='MATERIAL_REVIEW_PENDING_ORIGINAL_OWNER_PAINT_PRESERVED'))
head = read(directory / ('environment-turret-'+prior_family+'.json'))
head['identity'], head['revision'] = family, family
payloads['environment-turret-'+family+'.json'] = encode(head)
before = {row['name']: row for row in campaign['files']}
assert len(before) + len(payloads) <= 256
for name, row in before.items():
    assert sha((directory / name).read_bytes()) == row['sha256']
for name, data in payloads.items():
    assert name not in before
    (directory / name).open('xb').write(data)
    campaign['files'].append(dict(name=name, bytes=len(data), sha256=sha(data),
        route='/local-campaign/yr/sov05umd/'+name))
campaign_file.write_bytes(encode(campaign))
contract_file.write_bytes(encode(contract))
receipt = dict(schema='yr-statue-original-owner-material-preservation-v1',
    status='SELECTED_NATIVE_VISUAL_REVIEW_PENDING', family=family, priorFamily=prior_family,
    bodyStates=[0, 1, 2, 3], independentDensities=[2, 4], records=records,
    nativeSourceGeometryPivotsTimingAndShadowsUnchanged=True,
    ownerContourPaletteShadesAndOwnerBaseRgbaExact=True,
    newCastingOutsidePreservedOwnerPaintExact=True, reusedCompleteHead='yr-cahead-r2',
    addedFiles=len(payloads), priorFilesRetained=len(before), priorPayloadsChanged=0,
    userVisualAcceptance='PENDING')
(ROOT / 'docs/yr-campaign-statue-owner-material-20261108-r4.json').open('xb').write(encode(receipt))
print(json.dumps(dict(family=family, originalOwnerDataExact=True, addedFiles=len(payloads))))
