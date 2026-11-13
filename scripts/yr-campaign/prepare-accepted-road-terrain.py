"""Prepare seven complete original roads using existing qualified HD materials."""
import argparse
import copy
import hashlib
import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_accepted_roads import CONTRACT_SHA256, road_geometry, source_contract
from showcase_urban_ground import sample_accepted_plane

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('recipe', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
write = lambda p, value: p.write_text(json.dumps(value, indent=2) + '\n')
recipe = read(args.recipe)
assert recipe['schema'] == 'yr-source-material-road-recipe-v1'
assert recipe['userVisualAcceptance'] == 'PENDING' and recipe['newRasterArtwork'] == 0
prior = Path(recipe['referenceAuthoring']['directory'])
prepared = Path(recipe['originalGuides']['directory'])
for file, digest in [(prior / 'source.json', recipe['referenceAuthoring']['sourceSha256']),
        (prior / 'layout.json', recipe['referenceAuthoring']['layoutSha256']),
        (prepared / 'source.json', recipe['originalGuides']['sourceSha256'])]:
    assert sha(file) == digest
source, layout = read(prior / 'source.json'), read(prior / 'layout.json')
source = copy.deepcopy(source)
source['editions'] = ['yr']
source['members'] = [m for m in source['members'] if m['member'] in recipe['members']]
contract = source_contract(source)
assert set(recipe['members']) == set(contract['members'])
assert sha(prior / 'source.json') == contract['referenceSourceSha256']
assert sha(prior / 'layout.json') == contract['referenceLayoutSha256']
layout = {name: layout[name] for name in recipe['members']}
out = args.output.resolve()
out.mkdir()
write(out / 'source.json', source)
write(out / 'layout.json', layout)
write(out / 'batches.json', [])
geometry = {}
for member in source['members']:
    name = member['member']
    file = out / (name + '-native.png')
    os.link(prior / file.name, file)
    native = np.asarray(Image.open(file).convert('RGBA'))
    geometry[name] = dict(sourceSha256=member['native']['sha256'], nativeAssemblySha256=sha(file),
        model=road_geometry(native, recipe.get('paintStyle')))
geometry_file = out / 'source-road-geometry.json'
geometry_document = dict(schema='yr-source-pinned-accepted-road-geometry-v1',
    sourceContractSha256=CONTRACT_SHA256, members=geometry, sourceRgbUsedAsOutputTexture=False)
if recipe.get('retainTransparentMainRgb'):
    geometry_document['mainRgbPolicy'] = 'CONTINUOUS_SOURCE_PLANE_RGB_UNDER_ZERO_NATIVE_MAIN_ALPHA'
if recipe.get('paintStyle'):
    geometry_document['paintStyle'] = recipe['paintStyle']
write(geometry_file, geometry_document)
selection = recipe['baseSelection']
root = Path('.local/terrain-packs') / selection['revision']
assert sha(root / 'manifest.json') == selection['sha256']
manifest = read(root / 'manifest.json')
material_dir = out / 'accepted-materials'
material_dir.mkdir()
roles, yellow = {}, {}
for role, donor in [
    ('asphalt', dict(group='m2-4-newurban-secondary-set018-cohort13-part1', member='droads24.ubn',
        subTile=0, sourceSha256='0df1159fb51f7fbd8a63b9a86fe6b71be700d02753884b12a55cb348edc7f68d')),
    ('paving', dict(group='m2-4-newurban-secondary-set018-cohort21-part1', member='droads40.ubn',
        subTile=1, sourceSha256='71e3c08e708f53a6fc4aa03dbd28a27a1b0bfe71cb67b54b00bdecc5424ae80c')),
]:
    group, = [g for g in manifest['groups'] if g['id'] == donor['group']]
    cursor = 0
    for member in group['members']:
        if member['member'] == donor['member']:
            break
        cursor += len(member['images'])
    assert member['member'] == donor['member'] and member['sourceHashes']['yr'] == donor['sourceSha256']
    entry = dict(donor=donor, densities={})
    if role == 'asphalt':
        entry['sampling'] = dict(schema='accepted-road-asphalt-plane-v1', longitudinalRange=[.1, .9],
            nativeCrossRange=[-20, -12])
    else:
        entry['nativeInterior'] = [20, 8, 24, 12]
    for density in [2, 4]:
        variant, = [v for v in group['variants'] if v['density'] == density]
        file = root / variant['file']
        assert sha(file) == variant['sha256']
        atlas = np.memmap(file, np.uint8, 'r', shape=(*variant['size'][::-1], 4))
        x, y, w, h = variant['rects'][cursor+donor['subTile']]
        original = atlas[y:y+h, x:x+w]
        if role == 'asphalt':
            pixels = sample_accepted_plane(original, entry['sampling'], density)
            red, green, blue = np.moveaxis(original[..., :3].astype(int), -1, 0)
            gold = (original[..., 3] == 255) & (red > 100) & (green > 85) \
                & (red-blue > 45) & (green-blue > 35)
            assert gold.sum() > 10*density*density
            yellow[str(density)] = np.rint(original[..., :3][gold].mean(0)).astype(int).tolist()
        else:
            pixels = original[8*density:20*density, 20*density:44*density]
        assert pixels[..., 3].min() == 255
        file = material_dir / f'{role}-{density}x.png'
        Image.fromarray(pixels).save(file)
        entry['densities'][str(density)] = dict(file=str(file), sha256=sha(file),
            size=list(pixels.shape[1::-1]), sourceAtlas=variant['file'], sourceAtlasSha256=variant['sha256'])
    roles[role] = entry
materials_file = out / 'accepted-road-materials.json'
write(materials_file, dict(schema='yr-qualified-newurban-road-material-components-v1',
    sourceContractSha256=CONTRACT_SHA256, selection=selection, roles=roles, yellow=yellow,
    curbTint=[8, 8, 8], newRasterArtwork=0, sourceRgbUsedAsOutputTexture=False))
write(out / 'material-profile.json', dict(
    sourcePinnedAcceptedRoadGeometry=dict(file=str(geometry_file), sha256=sha(geometry_file)),
    acceptedRoadMaterials=dict(file=str(materials_file), sha256=sha(materials_file))))
write(out / 'preparation.json', dict(status='PREPARED_COMPLETE_ORIGINAL_ROADS_QUALIFIED_MATERIALS_EXPORT_PENDING',
    recipe=str(args.recipe.resolve()), recipeSha256=sha(args.recipe),
    originalSourceSha256=sha(prepared / 'source.json'), members=recipe['members'],
    linkedMothers=0, reusedQualifiedMaterials=2, newRasterArtwork=0,
    nativeGeometryModified=False, userVisualAcceptance='PENDING'))
print(json.dumps(dict(output=str(out), completeMembers=len(geometry), newRasterArtwork=0,
    reusedQualifiedMaterials=2, sourceContractSha256=CONTRACT_SHA256)))
