"""Reuse selected road asphalt on every Newurban raised terrain deck."""
import copy
import hashlib
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
read = lambda p: json.loads(p.read_text())
encode = lambda value: (json.dumps(value, indent=2) + '\n').encode()
sha = lambda data: hashlib.sha256(data).hexdigest()
pointer_file = ROOT / '.local/terrain-newurban-selection.json'
selected_before = read(pointer_file)
assert selected_before['revision'] == 'yr-newurban-bridge-deck-material-r10'
before = dict(schemaVersion=1, revision='yr-newurban-bridge-approach-material-r9',
    sha256='f355d5099e3edbbec4019f7ffd4dee82d7b75de2437b43d3d0345707c2a3a293')
source = ROOT / '.local/terrain-packs' / before['revision']
assert sha((source / 'manifest.json').read_bytes()) == before['sha256']
original = read(source / 'manifest.json')
manifest = copy.deepcopy(original)
revision = 'yr-newurban-bridge-deck-material-r11'
destination = source.with_name(revision)
destination.mkdir()
records, donors = [], []


def entries(group, variant):
    cursor = 0
    for member in group['members']:
        for image, rect in zip(member['images'], variant['rects'][cursor:]):
            yield member['member'], image, rect
        cursor += len(member['images'])


def asphalt_weight(rgb):
    return (np.clip((140 - rgb.max(2)) / 25, 0, 1)
        * np.clip((50 - np.ptp(rgb, axis=2)) / 20, 0, 1)
        * np.clip((rgb.mean(2) - 20) / 20, 0, 1))


templates = {}
materials_file = ROOT / ('.local/source-art/yr-campaign-v1/terrain-remaining-r1/newurban/'
    'authoring-paved-roads-r3/accepted-road-materials.json')
assert sha(materials_file.read_bytes()) == '8a793f2690821df670f3375c5335a5bad0d0d25ba9145009a30b8ee264598e09'
materials = read(materials_file)
assert materials['schema'] == 'yr-qualified-newurban-road-material-components-v1'
for density in [2, 4]:
    member_name = 'proad01.ubn'
    group, = [g for g in original['groups'] if any(m['member'] == member_name for m in g['members'])]
    variant, = [v for v in group['variants'] if v['density'] == density]
    data = (source / variant['file']).read_bytes()
    assert sha(data) == variant['sha256']
    atlas = np.frombuffer(data, np.uint8).reshape(*variant['size'][::-1], 4)
    canvas = Image.new('RGBA', (120 * density, 60 * density))
    for name, image, rect in entries(group, variant):
        if name != member_name:
            continue
        x, y, width, height = rect
        ox, oy = image['origin']
        canvas.alpha_composite(Image.fromarray(atlas[y:y+height, x:x+width]), ((ox+60)*density, oy*density))
    pixels = np.asarray(canvas)
    rgb = pixels[..., :3].astype(float)
    clean = (pixels[..., 3] > 0) & (rgb.max(2) < 100) & (np.ptp(rgb, axis=2) < 20)
    assert clean.sum() > 200 * density ** 2
    reference = materials['roles']['asphalt']['densities'][str(density)]
    material_file = Path(reference['file'])
    assert sha(material_file.read_bytes()) == reference['sha256']
    material = np.asarray(Image.open(material_file).convert('RGBA'))
    assert np.all(material[..., 3] == 255)
    material = material[..., :3].astype(float)
    reference_mean, reference_std = rgb[clean].mean(0), rgb[clean].std(0)
    gain = reference_std / material.std((0, 1))
    templates[density] = np.clip((material-material.mean((0, 1)))*gain+reference_mean, 0, 255)
    donors.append(dict(member=member_name, density=density, sourceAtlas=variant['file'],
        sourceAtlasSha256=variant['sha256'], asphaltSamples=int(clean.sum()),
        mean=reference_mean.tolist(), standardDeviation=reference_std.tolist(),
        independentMaterial=dict(file=str(material_file.relative_to(ROOT)), sha256=reference['sha256']),
        colorGain=gain.tolist(), sourceMaterialMean=material.mean((0, 1)).tolist()))

for group, old_group in zip(manifest['groups'], original['groups']):
    relevant = any(m['member'].startswith('ovrps') and any(i['terrainType'] == 11 for i in m['images'])
        for m in group['members'])
    for variant in group['variants']:
        data = (source / variant['file']).read_bytes()
        assert sha(data) == variant['sha256']
        target = destination / variant['file']
        if not relevant:
            os.link(source / variant['file'], target)
            continue
        density = variant['density']
        original_atlas = np.frombuffer(data, np.uint8).reshape(*variant['size'][::-1], 4)
        atlas = original_atlas.copy()
        for name, image, rect in entries(group, variant):
            if not name.startswith('ovrps') or image['terrainType'] != 11:
                continue
            x, y, width, height = rect
            ox, oy = [-value * density for value in image['offset']]
            main = atlas[y+oy:y+oy+30*density, x+ox:x+ox+60*density]
            prior = main.copy()
            rgb = main[..., :3].astype(float)
            weight = asphalt_weight(rgb)
            yy, xx = (np.indices(weight.shape) + .5) / density
            gx, gy = xx + image['origin'][0], yy + image['origin'][1]
            template = templates[density]
            # A common whole-plane phase spans native subtiles. Continue RGB
            # through transparent main contacts without changing their alpha.
            coords = [(gy % 30) * density - .5, (gx % 60) * density - .5]
            sampled = np.stack([ndimage.map_coordinates(template[..., c], coords,
                order=1, mode='grid-wrap') for c in range(3)], axis=-1)
            main[..., :3] = np.rint(np.clip(rgb*(1-weight[..., None])
                + sampled*weight[..., None], 0, 255)).astype(np.uint8)
            np.testing.assert_array_equal(main[..., 3], prior[..., 3])
            np.testing.assert_array_equal(main[weight == 0], prior[weight == 0])
            valid = (main[..., 3] > 0) & (weight > .99)
            records.append(dict(member=name, frame=image['subTile'], density=density,
                changedPixels=int(np.any(main != prior, axis=2).sum()),
                meanBefore=prior[..., :3][valid].mean(0).tolist(),
                meanAfter=main[..., :3][valid].mean(0).tolist(),
                standardDeviationAfter=main[..., :3][valid].std(0).tolist(),
                alphaPaintAndOutsideMainExact=True))
        np.testing.assert_array_equal(atlas[..., 3], original_atlas[..., 3])
        target.open('xb').write(atlas.tobytes())
        variant['sha256'] = sha(target.read_bytes())
    assert group['members'] == old_group['members']
manifest['revision'] = revision
payload = (json.dumps(manifest, separators=(',', ':')) + '\n').encode()
assert len(payload) <= 2 * 1024 ** 2
(destination / 'manifest.json').open('xb').write(payload)
after = dict(schemaVersion=1, revision=revision, sha256=sha(payload))
contract_file = ROOT / 'desktop/terrain-theater-hd-contracts.json'
contract = read(contract_file)
assert contract['NEWURBAN'] == selected_before
contract['NEWURBAN'] = after
contract_file.write_bytes(encode(contract))
pointer_file.write_bytes(encode(after))
receipt = dict(schema='yr-newurban-complete-raised-deck-material-v1',
    status='SELECTED_NATIVE_VISUAL_REVIEW_PENDING', before=before, replacesUnacceptedSelection=selected_before, after=after,
    registered=True, originalGeometryDepthRulesUnchanged=True, acceptedPayloadsReplaced=0,
    newRasterArtwork=0, oldPackFilesChanged=0, originalMapsChanged=0,
    sourceMaterial='Qualified independent asphalt plane, color and detail matched to selected proad01.ubn; original paint retained.',
    donors=donors, frames=records, inspectionGroups=[g['id'] for g in manifest['groups']
        if any(m['member'].startswith('ovrps') for m in g['members'])],
    members=[m['member'] for g in manifest['groups'] for m in g['members']
        if m['member'].startswith('ovrps')],
    variants={g['id']: {str(v['density']): v['sha256'] for v in g['variants']}
        for g in manifest['groups'] if any(m['member'].startswith('ovrps') for m in g['members'])},
    completeSourceSubtiles=sum(len(m['images']) for g in manifest['groups'] for m in g['members']
        if m['member'].startswith('ovrps')),
    missions=['all06umd.map', 'sov03umd.map'], userVisualAcceptance='PENDING')
(ROOT / 'docs/yr-campaign-bridge-deck-material-20261108-r11.json').open('xb').write(encode(receipt))
print(json.dumps(dict(selected=after, densityFrames=len(records), originalAlphaAndMetadataExact=True)))
