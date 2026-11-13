"""Register two original Temperate roads with qualified independent materials."""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates

from showcase_registration import extrude, independently_sample, register, sha
from showcase_snow_road_material import accepted_member


KEY = 'sourcePinnedTemperateRoadPortMaterials'
CONTRACT = 'terrain-temperate-dirtroad-port-material-contract-r6.json'
CONTRACT_SHA256 = '5715f8c8cb9a92d3a6fd6bab8054beb4d28a659e638e993ebfd475ef580c517d'
ROOT = Path(__file__).resolve().parents[2]


def coordinates(x, y, fields):
    u, v = x/2+y, -x/2+y
    offsets = [np.zeros_like(u), np.zeros_like(v)]
    for edge in fields:
        axis = 0 if edge['axis'] == 'u' else 1
        other = 1-axis
        values = [u, v]
        weight = np.clip(1-np.abs(values[axis]-edge['line'])/24, 0, 1)
        weight = weight*weight*(3-2*weight)
        points = np.asarray(edge['points'])
        delta = np.interp(values[other], points[:, 0], points[:, 1]-points[:, 0], left=0, right=0)
        offsets[other] += delta*weight
    return u+offsets[0]-v-offsets[1], (u+offsets[0]+v+offsets[1])/2


def mapped_density(native, bounds, rect, fields):
    yy, xx = (np.indices((native.shape[0]*8, native.shape[1]*8))+.5)/8
    sx, sy = coordinates(xx, yy, fields)
    dyx, dxx = np.gradient(sx, .125)
    dyy, dxy = np.gradient(sy, .125)
    jacobian = np.stack([np.stack([dxx, dyx], -1), np.stack([dxy, dyy], -1)], -2)
    active = (native[..., 3] > 0).repeat(8, 0).repeat(8, 1)
    singular = np.linalg.svd(jacobian[active], compute_uv=False)
    raw = min(rect[2]/(bounds[2]-bounds[0]), rect[3]/(bounds[3]-bounds[1]))
    return dict(rawDensity=raw, minimumUvDeterminant=float(np.linalg.det(jacobian[active]).min()),
        minimumMappedDensity=float(singular.min()*raw),
        maximumDisplacementNative=float(np.hypot(sx-xx, sy-yy)[active].max()))


def load(profile, source, authoring):
    if KEY not in profile:
        return {}, {}
    assert set(profile) == {KEY, 'continuousAuthoredRgb'}
    assert profile[KEY] == dict(contract=CONTRACT, sha256=CONTRACT_SHA256)
    file = ROOT / 'docs/campaign-art/yr-v1' / CONTRACT
    assert sha(file) == CONTRACT_SHA256
    declaration = json.loads(file.read_text())
    assert declaration['schema'] == 'yr-source-pinned-temperate-road-port-material-v1'
    assert declaration['theater'] == source['theater'] == 'TEMPERATE'
    assert declaration['editions'] == source['editions'] == ['yr']
    assert declaration['preparedSourceSha256'] == source['preparedSourceSha256']
    assert len(source['members']) == 2
    pins = {m['member']: m['native']['sha256'] for m in source['members']}
    assert pins == declaration['members'] == profile['continuousAuthoredRgb']
    assert declaration['setIndex'] == 16 and declaration['bandNativePixels'] == 24
    assert declaration['minimumMappedDensity'] == 4
    authoring = Path(authoring)
    layout = json.loads((authoring / 'layout.json').read_text())
    models = {}
    for member in source['members']:
        name, metadata = member['member'], member['native']
        assert name == metadata['member'] and member['setIndex'] == metadata['setIndex'] == 16
        assert metadata['palette'] == declaration['palette']
        for image in metadata['images']:
            if image['nativeOffset'] > 0:
                assert image['logical'] == [60, 30] and image['offset'] == [0, 0]
                assert image['height'] == image['rampType'] == 0 and not image['hasExtraData']
        file = authoring / (name+'-native.png')
        info = layout[name]
        pin = declaration['native'][name]
        assert sha(file) == pin['nativeAssemblySha256']
        assert info['bounds'] == pin['bounds'] and info['nativeAlphaBounds'] == pin['nativeAlphaBounds']
        master = authoring / info['board']
        assert sha(master) == declaration['masters'][name]
        assert info['boardSize'] == [1983, 793] and info['slotRect'] == [0, 0, 1983, 793]
        fields = declaration['uvFields'][name]
        assert len(fields) == 3
        for edge in fields:
            assert set(edge) == {'axis', 'line', 'points'} and edge['axis'] in ['u', 'v']
            points = np.asarray(edge['points'])
            assert points.ndim == 2 and points.shape[1] == 2 and len(points) >= 4
            assert np.all(np.diff(points, axis=0) > 0)
            assert np.array_equal(points[[0, -1], 0], points[[0, -1], 1])
            assert np.abs(points[:, 0]-points[:, 1]).max() <= 7
        native = np.asarray(Image.open(file).convert('RGBA'))
        rect, _ = register(Image.open(master).convert('RGBA'), info, info['boardSize'], isolated=True)
        audit = mapped_density(native, info['nativeAlphaBounds'], rect, fields)
        assert audit['minimumMappedDensity'] >= 4 and audit['minimumUvDeterminant'] > .4
        assert audit['maximumDisplacementNative'] <= 7
        models[name] = dict(fields=fields, bounds=pin['bounds'], mappedDensity=audit)
    pointer = declaration['acceptedPack']
    assert pointer == dict(schemaVersion=1, revision='temperate-native-road-slopes-v52-r2',
        sha256='f1ea91b06571103b96d991647e51a627549f9d7cdb13ea8780bdd70d06b2a78e')
    root = ROOT / '.local/terrain-packs' / pointer['revision']
    assert sha(root / 'manifest.json') == pointer['sha256']
    manifest = json.loads((root / 'manifest.json').read_text())
    grass, soil = declaration['materials']['grass'], declaration['materials']['soil']
    assert grass == dict(group='ground', member='clear01.tem',
        sourceSha256='d90df76d78fd9a3e23834c5a728cef666dbdf65b212dd3a66c29b456cbd51ed2',
        nativeDiamondPeriodicField=True)
    assert soil == dict(group='m2-2-dirtroads', member='droads23.tem',
        sourceSha256='2be9f806e9cb1ac85e35c574db97dae2003a50a10bda76b118e71a31ba0175e5',
        nativeInterior=[30, 23, 16, 6])
    materials = dict(grass={}, soil={})
    for density in [2, 4]:
        pixels = accepted_member(root, manifest, grass, density)
        assert pixels.shape == (30*density, 60*density, 4)
        materials['grass'][density] = extrude(pixels[..., :3], pixels[..., 3] > 0)
        pixels = accepted_member(root, manifest, soil, density)
        patch = pixels[23*density:29*density, 30*density:46*density]
        assert patch.shape == (6*density, 16*density, 4) and (patch[..., 3] == 255).all()
        red, green, blue, _ = np.moveaxis(patch.astype(int), -1, 0)
        assert not ((green-red > 4) & (green-blue > 10)).any()
        materials['soil'][density] = patch[..., :3].copy()
    return models, materials


def sample_plate(plate, bounds, density, fields):
    assert density in [2, 4]
    left, top, right, bottom = bounds
    width, height = right-left, bottom-top
    samples = 8//density
    yy, xx = np.indices((height*density*samples, width*density*samples))
    x, y = left+(xx+.5)/(density*samples), top+(yy+.5)/(density*samples)
    sx, sy = coordinates(x, y, fields)
    warped = np.abs(sx-x)+np.abs(sy-y) > 1e-8
    source_x, source_y = (sx-left)/width*plate.shape[1]-.5, (sy-top)/height*plate.shape[0]-.5
    rgb = np.stack([map_coordinates(plate[..., c].astype(float), [source_y, source_x],
        order=3, mode='nearest') for c in range(3)], axis=-1)
    rgb = rgb.reshape(height*density, samples, width*density, samples, 3).mean((1, 3))
    changed = warped.reshape(height*density, samples, width*density, samples).any((1, 3))
    ordinary = independently_sample(plate, (width*density, height*density)).copy()
    ordinary[changed] = np.uint8(np.clip(np.rint(rgb[changed]), 0, 255))
    return ordinary


def render_materials(rgb, native, model, materials, density):
    assert density in [2, 4] and rgb.shape[:2] == tuple(n*density for n in native.shape[:2])
    grass, soil = materials['grass'][density], materials['soil'][density]
    yy, xx = (np.indices(rgb.shape[:2])+.5)/density
    xx += model['bounds'][0]
    yy += model['bounds'][1]
    u, v = (xx/2+yy-15)%30+15, (-xx/2+yy+15)%30-15
    gx = np.clip(np.floor((u-v)*density).astype(int), 0, grass.shape[1]-1)
    gy = np.clip(np.floor((u+v)/2*density).astype(int), 0, grass.shape[0]-1)
    grass_field = grass[gy, gx].astype(float)
    iy, ix = np.indices(rgb.shape[:2])
    soil_field = soil[iy % soil.shape[0], ix % soil.shape[1]].astype(float)
    red, green, blue = np.moveaxis(rgb.astype(float), -1, 0)
    weight = np.clip((red-green-6)/10, 0, 1)*np.clip((red-blue-12)/16, 0, 1)
    active = (native[..., 3] > 0).repeat(density, 0).repeat(density, 1)
    road, ground = active & (weight >= .95), active & (weight <= .05)
    assert min(road.sum(), ground.sum()) >= 20*density*density
    soil_mean, grass_mean = rgb[road].mean(0), rgb[ground].mean(0)
    assert (soil_mean > 20).all() and (grass_mean > 20).all()
    soil_field = np.clip(soil_field*rgb/soil_mean, 0, 255)
    grass_field = np.clip(grass_field*rgb/grass_mean, 0, 255)
    return np.uint8(np.clip(np.rint(soil_field*weight[..., None]+grass_field*(1-weight[..., None])), 0, 255))
