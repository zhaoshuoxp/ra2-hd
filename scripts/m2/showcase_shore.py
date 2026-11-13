"""Keep authored shore detail and match continuous original sea contacts."""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from showcase_registration import capacity, independently_sample, register, sha


MEMBERS = {'shore10.ubn', 'shore11.ubn', 'shore12.ubn', 'shore13.ubn', 'shore18.ubn',
           'shore19.ubn', 'shore20.ubn', 'shore30.ubn', 'shore34.ubn', 'shore36.ubn', 'shore38.ubn'}
LAND_KEY = 'acceptedShoreLand'


def load_shore_land(profile):
    declaration = profile.get(LAND_KEY)
    if declaration is None:
        return None
    assert declaration['schema'] == 'yr-accepted-newurban-beach-material-v1'
    assert declaration['selection'] == dict(schemaVersion=1, revision='yr-newurban-sf-bridge-ends-r6',
        sha256='0f6ceaff08abb0848056922b09d80d862abfcb2630acb74dc757ba7493edc8ee')
    assert declaration['group'] == 'm2-4-newurban-ground-set41'
    assert declaration['member'] == 'green01.ubn' and declaration['subTile'] == 0
    assert declaration['sourceSha256'] == '1302bee0f03658912875a007c460eb0243785373c1a4ea15f543cadb1073924b'
    assert declaration['sampling'] == 'REPEAT_PINNED_OPAQUE_INDEPENDENT_DENSITY_INTERIOR'
    assert declaration['nativeInterior'] == [16, 8, 28, 12]
    assert declaration['sourceSandContactWidth'] == 2 and declaration['inlandTransitionWidth'] == 10
    root = Path('.local/terrain-packs') / declaration['selection']['revision']
    assert sha(root / 'manifest.json') == declaration['selection']['sha256']
    manifest = json.loads((root / 'manifest.json').read_text())
    assert manifest['theater'] == 'NEWURBAN'
    group, = [group for group in manifest['groups'] if group['id'] == declaration['group']]
    index = 0
    for member in group['members']:
        if member['member'] == declaration['member']:
            break
        index += len(member['images'])
    assert member['member'] == declaration['member']
    assert member['sourceHashes']['yr'] == declaration['sourceSha256']
    frame, = member['images']
    assert frame['subTile'] == frame['height'] == frame['rampType'] == 0
    assert frame['logical'] == [60, 30] and not frame['hasExtraData']
    result = {}
    for density in [2, 4]:
        variant, = [variant for variant in group['variants'] if variant['density'] == density]
        file = root / variant['file']
        assert sha(file) == variant['sha256']
        atlas = np.memmap(file, dtype=np.uint8, mode='r', shape=(*variant['size'][::-1], 4))
        x, y, width, height = variant['rects'][index]
        assert [width, height] == [60*density, 30*density]
        ix, iy, iw, ih = [value*density for value in declaration['nativeInterior']]
        pixels = atlas[y+iy:y+iy+ih, x+ix:x+ix+iw]
        assert pixels.shape == (ih, iw, 4) and pixels[..., 3].min() == 255
        result[density] = pixels[..., :3].copy()
    return result


def load_shore(profile, source, authoring):
    declarations = profile.get('sourcePinnedShoreMaterials', {})
    if not declarations:
        assert LAND_KEY not in profile
        return {}, {}, {}, None, []
    required = {'sourcePinnedShoreMaterials', 'shoreAuthoredMothers', 'acceptedShoreWater'}
    assert set(profile) in (required, required | {LAND_KEY})
    assert source['theater'] == 'NEWURBAN' and source['editions'] == ['yr']
    members = {member['member']: member for member in source['members']}
    assert set(declarations) == set(members) == set(profile['shoreAuthoredMothers']) == MEMBERS
    layout = json.loads((authoring / 'layout.json').read_text())
    geometry, plates = {}, {}
    for name, declaration in declarations.items():
        member = members[name]
        assert member['setIndex'] == 12 and not member['native']['emptySlots']
        assert declaration['sourceSha256'] == member['native']['sha256']
        assert declaration['paletteSha256'] == member['native']['palette']['sha256']
        file = Path(declaration['file'])
        assert sha(file) == declaration['sha256']
        model = json.loads(file.read_text())
        assert model['schema'] == 'yr-source-pinned-shore-contact-v1' and model['member'] == name
        assert model['sourceSha256'] == declaration['sourceSha256']
        assert model['paletteSha256'] == declaration['paletteSha256']
        assert model['nativeAssemblySha256'] == sha(authoring / (name + '-native.png'))
        assert not model['sourceRgbUsedAsOutputTexture'] and model['transitionWidth'] == 4
        assert model['samplingPolicy'] == dict(schema='yr-source-pinned-shore-contacts-v1', shapeWarp=False)
        if pin := model.get('originalWaterColorControl'):
            file = Path(pin['file'])
            assert sha(file) == pin['sha256']
            control = json.loads(file.read_text())
            assert control['schema'] == 'yr-original-water-palette-control-v1'
            assert control['source'] == pin['source']
            assert control['palette'] == pin['palette']
            assert control['source'] == dict(member='water04.ubn',
                sha256=profile['acceptedShoreWater']['sourceSha256'])
            assert control['palette']['sha256'] == member['native']['palette']['sha256']
            assert model['seaContactPolicy'] == 'INDEPENDENT_SOURCE_SAND_AND_DEEP_CURVES'
            assert model['seaSampling'] == 'REPEAT_PINNED_INDEPENDENT_DENSITY_HD_INTERIOR'
        assert set(model['sourceCurves']) == {'sand', 'deep'}
        assert set(model['roleColorOffsets']) == {'sand', 'shallow'}
        assert all(not image['hasExtraData'] and image['height'] == image['rampType'] == 0
                   for image in member['native']['images'])
        mother = profile['shoreAuthoredMothers'][name]
        master = Path(mother['file'])
        assert sha(master) == mother['sha256'] == model['masterSha256']
        image = Image.open(master).convert('RGBA')
        assert list(image.size) == mother['boardSize']
        rect, plate = register(image, layout[name], mother['boardSize'], isolated=layout[name]['occupied'] == 1)
        assert rect == model['registeredSourceRect']
        assert capacity(rect, layout[name]['nativeAlphaBounds']) >= 4
        assert model['nativeAlphaBounds'] == layout[name]['nativeAlphaBounds']
        assert model['logical'] == layout[name]['bounds'][2:]
        geometry[name], plates[name] = model, plate
    accepted = profile['acceptedShoreWater']
    root = Path('.local/terrain-packs') / accepted['selection']['revision']
    assert sha(root / 'manifest.json') == accepted['selection']['sha256']
    manifest = json.loads((root / 'manifest.json').read_text())
    assert manifest['theater'] == 'NEWURBAN'
    group, = [group for group in manifest['groups'] if group['id'] == accepted['group']]
    offset = 0
    for member in group['members']:
        if member['member'] == accepted['member']:
            break
        offset += len(member['images'])
    assert accepted['member'] == member['member'] == 'water04.ubn'
    assert accepted['sourceSha256'] == member['sourceHashes']['yr']
    assert accepted['subTile'] == 0 and accepted['nativeInterior'] == [15, 8, 30, 14]
    water = {}
    for density in [2, 4]:
        variant, = [variant for variant in group['variants'] if variant['density'] == density]
        file = root / variant['file']
        assert sha(file) == variant['sha256']
        atlas = np.memmap(file, dtype=np.uint8, mode='r', shape=(*variant['size'][::-1], 4))
        x, y, width, height = variant['rects'][offset]
        assert [width, height] == [60*density, 30*density]
        ix, iy, iw, ih = [value*density for value in accepted['nativeInterior']]
        pixels = atlas[y+iy:y+iy+ih, x+ix:x+ix+iw]
        assert pixels.shape == (ih, iw, 4) and pixels[..., 3].min() == 255
        water[density] = pixels[..., :3].copy()
    return geometry, plates, water, load_shore_land(profile), []


def coast_coordinates(model, density):
    width, height = model['logical']
    yy, xx = (np.indices((height*density, width*density)) + .5) / density
    x, y = xx-model['center'][0], yy-model['center'][1]
    nx, ny = model['normal']
    along = (-ny*x + nx*y) / model['alongScale']
    across = nx*x + ny*y
    curves = {'sourceCurves': {role: np.polynomial.polynomial.polyval(along, coefficients)
                              for role, coefficients in model['sourceCurves'].items()}}
    if model.get('seaContactPolicy') != 'INDEPENDENT_SOURCE_SAND_AND_DEEP_CURVES':
        curves['sourceCurves']['deep'] = np.maximum(curves['sourceCurves']['deep'], curves['sourceCurves']['sand'] + 1)
    return xx, yy, along, across, curves


def sample_authored_shore(model, plate, density):
    width, height = model['logical']
    left, top, right, bottom = model['nativeAlphaBounds']
    sample = independently_sample(plate, ((right-left)*density, (bottom-top)*density))
    result = np.zeros((height*density, width*density, 3), float)
    result[top*density:bottom*density, left*density:right*density] = sample
    return result


def transition(value):
    value = np.clip(value, 0, 1)
    return value*value*(3-2*value)


def sample_shore_land(logical, pixels, density):
    """Repeat a pinned covered HD material interior at its independent density."""
    assert pixels.shape == (12*density, 28*density, 3)
    width, height = logical
    yy, xx = np.indices((height*density, width*density))
    return pixels[yy % pixels.shape[0], xx % pixels.shape[1]]


def render_shore(model, plate, water, density, land=None):
    assert density in (2, 4) and not model['sourceRgbUsedAsOutputTexture']
    _, _, _, across, curves = coast_coordinates(model, density)
    source, width = curves['sourceCurves'], model['transitionWidth']
    sand = transition((source['sand']-across)/width + .5)
    sea = transition((across-source['deep'])/width + .5)
    shallow = np.maximum(0, 1-sand-sea)
    sample = sample_authored_shore(model, plate, density)
    for role, weight in [('sand', sand), ('shallow', shallow)]:
        sample += weight[..., None]*np.asarray(model['roleColorOffsets'][role])
    if land is not None:
        assert model['member'] in MEMBERS
        inland = sand*transition((source['sand']-across-2)/10)
        accepted = sample_shore_land(model['logical'], land[density], density)
        sample = sample*(1-inland[..., None]) + accepted*inland[..., None]
    pixels = water[density]
    yy, xx = np.indices(across.shape)
    # Reflect opaque sea interiors to avoid introducing rectangular repeat cuts.
    def mirrored(coordinates, length):
        phase = coordinates % (2*length)
        return np.minimum(phase, 2*length-1-phase)
    if model.get('seaSampling') == 'REPEAT_PINNED_INDEPENDENT_DENSITY_HD_INTERIOR':
        ocean = pixels[yy % pixels.shape[0], xx % pixels.shape[1]]
    else:
        ocean = pixels[mirrored(yy, pixels.shape[0]), mirrored(xx, pixels.shape[1])]
    result = sample*(1-sea[..., None]) + ocean*sea[..., None]
    return np.uint8(np.clip(np.rint(result), 0, 255))
