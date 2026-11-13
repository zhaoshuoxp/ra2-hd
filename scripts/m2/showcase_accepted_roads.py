"""Reconstruct seven original paved roads from qualified density materials."""
import json
from pathlib import Path

import numpy as np
from PIL import Image

from showcase_registration import sha
from showcase_road_geometry import fit_strip, render_geometry
from showcase_urban_roads import source_regions
from showcase_urban_ground import sample_accepted_plane


CONTRACT = 'terrain-newurban-paved-road-source-contract-r1.json'
CONTRACT_SHA256 = '097b5b2e90cfb03b076458b49f574cbf8d902fc4997dbc8a0900ad97de2edc08'
GEOMETRY_KEY = 'sourcePinnedAcceptedRoadGeometry'
MATERIAL_KEY = 'acceptedRoadMaterials'


def source_contract(source):
    file = Path(__file__).resolve().parents[2] / 'docs/campaign-art/yr-v1' / CONTRACT
    assert sha(file) == CONTRACT_SHA256
    contract = json.loads(file.read_text())
    assert contract['schema'] == 'yr-source-pinned-newurban-paved-road-source-v1'
    assert source['theater'] == contract['theater'] == 'NEWURBAN'
    assert source['editions'] == contract['editions'] == ['yr']
    assert source['preparedSourceSha256'] == contract['preparedSourceSha256']
    assert {m['member']: m['native']['sha256'] for m in source['members']} == contract['members']
    for member in source['members']:
        native = member['native']
        assert member['setIndex'] == native['setIndex'] == contract['setIndex'] == 18
        assert native['member'] == member['member']
        assert all(native['palette'][k] == v for k, v in contract['palette'].items())
        assert all(not image['hasExtraData'] and image['rampType'] == 0 for image in native['images'])
    return contract


def road_geometry(native, paint_style=None):
    assert paint_style in (None, 'QUALIFIED_NEWURBAN_PAINT_MAX_1_25_NATIVE')
    contours, audit = fit_strip(native, curb_direction=True)
    normal = np.asarray(audit[0]['normal'])
    center = np.mean(audit[0]['offsets'])
    half_width = np.ptp(audit[0]['offsets'])/2
    active, _, paint = source_regions(native, precise_paint=True)
    yy, xx = np.where(paint & active)
    points = np.column_stack([xx+.5, yy+.5])
    cross = points @ normal
    core = np.abs(cross-center) < half_width*.35
    assert core.sum() >= 10
    points, cross = points[core], cross[core]
    offset = float(np.median(cross))
    tangent = np.array([-normal[1], normal[0]])
    length = float(np.ptp(points @ tangent)) + 1
    width = float(np.clip(len(points)/length, .8, 2.5))
    if paint_style:
        width = float(np.clip(len(points)/length, .65, 1.25))
    return dict(logical=list(native.shape[1::-1]), contours=[p.tolist() for p in contours],
        paint=dict(normal=normal.tolist(), offset=offset, width=width),
        sourcePrimitiveAudit=audit)


def load_accepted_roads(profile, source, authoring):
    pin = profile.get(GEOMETRY_KEY)
    if pin is None:
        assert MATERIAL_KEY not in profile
        return {}, {}, []
    assert set(profile) == {GEOMETRY_KEY, MATERIAL_KEY}
    contract = source_contract(source)
    file = Path(pin['file'])
    assert sha(file) == pin['sha256']
    document = json.loads(file.read_text())
    assert document['schema'] == 'yr-source-pinned-accepted-road-geometry-v1'
    assert document['sourceContractSha256'] == CONTRACT_SHA256
    assert set(document['members']) == set(contract['members'])
    assert not document['sourceRgbUsedAsOutputTexture']
    padding = document.get('mainRgbPolicy')
    assert padding in (None, 'CONTINUOUS_SOURCE_PLANE_RGB_UNDER_ZERO_NATIVE_MAIN_ALPHA')
    geometry = {}
    for name, entry in document['members'].items():
        assert entry['sourceSha256'] == contract['members'][name]
        file = Path(authoring) / (name+'-native.png')
        assert sha(file) == entry['nativeAssemblySha256']
        native = np.asarray(Image.open(file).convert('RGBA'))
        expected = road_geometry(native, document.get('paintStyle'))
        assert entry['model'] == expected
        geometry[name] = dict(expected, retainTransparentMainRgb=padding is not None)
    pin = profile[MATERIAL_KEY]
    file = Path(pin['file'])
    assert sha(file) == pin['sha256']
    materials = json.loads(file.read_text())
    assert materials['schema'] == 'yr-qualified-newurban-road-material-components-v1'
    assert materials['sourceContractSha256'] == CONTRACT_SHA256
    assert not materials['newRasterArtwork'] and not materials['sourceRgbUsedAsOutputTexture']
    assert materials['selection'] == dict(schemaVersion=1, revision='yr-newurban-sand-foot-walls-r3',
        sha256='5c0bb1ab614baaa024ba586b1c453abc853d43032b21eb380345621922230eee')
    root = Path('.local/terrain-packs') / materials['selection']['revision']
    assert sha(root / 'manifest.json') == materials['selection']['sha256']
    manifest = json.loads((root / 'manifest.json').read_text())
    result, records = {}, []
    assert set(materials['roles']) == {'asphalt', 'paving'}
    for role, entry in materials['roles'].items():
        donor = entry['donor']
        assert donor == (dict(group='m2-4-newurban-secondary-set018-cohort13-part1',
            member='droads24.ubn', subTile=0,
            sourceSha256='0df1159fb51f7fbd8a63b9a86fe6b71be700d02753884b12a55cb348edc7f68d')
            if role == 'asphalt' else dict(group='m2-4-newurban-secondary-set018-cohort21-part1',
                member='droads40.ubn', subTile=1,
                sourceSha256='71e3c08e708f53a6fc4aa03dbd28a27a1b0bfe71cb67b54b00bdecc5424ae80c'))
        group, = [g for g in manifest['groups'] if g['id'] == donor['group']]
        cursor = 0
        for member in group['members']:
            if member['member'] == donor['member']:
                break
            cursor += len(member['images'])
        assert member['member'] == donor['member'] and member['sourceHashes']['yr'] == donor['sourceSha256']
        result[role] = {}
        for density in [2, 4]:
            item = entry['densities'][str(density)]
            file = Path(item['file'])
            assert sha(file) == item['sha256']
            pixels = np.asarray(Image.open(file).convert('RGBA'))
            assert list(pixels.shape[1::-1]) == item['size']
            assert pixels[..., 3].min() == 255
            assert np.all(np.asarray(item['size']) >= np.array([8, 4])*density)
            variant, = [v for v in group['variants'] if v['density'] == density]
            assert item['sourceAtlas'] == variant['file'] and item['sourceAtlasSha256'] == variant['sha256']
            assert sha(root / variant['file']) == variant['sha256']
            atlas = np.memmap(root / variant['file'], np.uint8, 'r', shape=(*variant['size'][::-1], 4))
            x, y, w, h = variant['rects'][cursor+donor['subTile']]
            original = atlas[y:y+h, x:x+w]
            if role == 'asphalt':
                expected = sample_accepted_plane(original, entry['sampling'], density)
                red, green, blue = np.moveaxis(original[..., :3].astype(int), -1, 0)
                gold = (original[..., 3] == 255) & (red > 100) & (green > 85) \
                    & (red-blue > 45) & (green-blue > 35)
                assert gold.sum() > 10*density*density
                color = np.rint(original[..., :3][gold].mean(0)).astype(int).tolist()
                assert materials['yellow'][str(density)] == color
            else:
                assert entry['nativeInterior'] == [20, 8, 24, 12]
                expected = original[8*density:20*density, 20*density:44*density]
            assert np.array_equal(pixels, expected), 'Road material must retain exact accepted density pixels'
            result[role][density] = pixels[..., :3].copy()
            if density == 4:
                records.append(dict(member='newurban-road-material-'+role, master=str(file),
                    sha256=item['sha256'], sourceRect=[0, 0, *item['size']], capacity=4,
                    role='REUSED_QUALIFIED_INDEPENDENT_DENSITY_MATERIAL_COMPONENT'))
    assert set(materials['yellow']) == {'2', '4'} and materials['curbTint'] == [8, 8, 8]
    result['yellow'] = {int(d): np.asarray(rgb) for d, rgb in materials['yellow'].items()}
    return geometry, result, records


def repeated_material(pixels, shape):
    yy, xx = np.indices(shape)
    return pixels[yy % pixels.shape[0], xx % pixels.shape[1]]


def render_accepted_road(model, materials, density):
    assert density in [2, 4]
    width, height = model['logical']
    coverage, curb = render_geometry(model['contours'], (height, width), density)
    paving = repeated_material(materials['paving'][density], coverage.shape).astype(float)
    asphalt = repeated_material(materials['asphalt'][density], coverage.shape).astype(float)
    result = paving*(1-coverage[..., None]) + asphalt*coverage[..., None]
    result = result*(1-curb[..., None]) + np.clip(paving+8, 0, 255)*curb[..., None]
    yy, xx = (np.indices(coverage.shape)+.5)/density
    paint = model['paint']
    nx, ny = paint['normal']
    distance = np.abs(nx*xx+ny*yy-paint['offset'])
    stripe = np.clip((paint['width']/2-distance)*density+.5, 0, 1)*coverage
    result = result*(1-stripe[..., None]) + materials['yellow'][density]*stripe[..., None]
    return np.uint8(np.clip(np.rint(result), 0, 255))
