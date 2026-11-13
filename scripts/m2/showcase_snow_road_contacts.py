"""Register authored Snow road ports without changing native TMP geometry."""
import json
from pathlib import Path

import numpy as np
from scipy import ndimage

from showcase_registration import independently_sample, sha
from showcase_snow_scope import admit_snow_scope


PROFILE_KEY = 'sourcePinnedSnowRoadRgbPorts'
CONTRACTS = {'terrain-snow-roads-rgb-port-contract-r3.json', 'terrain-snow-roads-rgb-port-contract-r6.json'}
LIGHT_KEY = 'sourcePinnedSnowRoadMaterialLight'


def load_material_light(profile, source):
    if LIGHT_KEY not in profile:
        return False
    contract, key, _ = admit_snow_scope(profile, source)
    assert key == 'sourcePinnedSnowRoadContours'
    assert 'sourcePinnedSnowRoadPlanarLight' not in profile
    declaration = profile[LIGHT_KEY]
    if declaration['schema'] == 'yr-source-snow-road-two-material-light-v1':
        assert declaration == dict(schema=declaration['schema'], members=contract['members'])
        return True
    assert declaration['schema'] == 'yr-accepted-snow-road-two-material-light-v1'
    assert declaration['members'] == contract['members']
    assert set(declaration) == {'schema', 'members', 'colorControls'}
    control = declaration['colorControls']
    assert control['contract'] == 'terrain-snow-roads-material-colors-r7.json'
    file = Path(__file__).resolve().parents[2] / 'docs/campaign-art/yr-v1' / control['contract']
    assert control == dict(contract=file.name, sha256=sha(file))
    colors = json.loads(file.read_text())
    assert colors['schema'] == 'yr-accepted-snow-road-material-colors-v1'
    pointer = colors['acceptedPack']
    assert pointer == dict(schemaVersion=1, revision='yr-snow-water-cliffs-r3',
        sha256='ff193253b7bd1362d0577c31275c5d7f744caa5d20b1998f3b00c8c90e29c453')
    root = Path(__file__).resolve().parents[2] / '.local/terrain-packs' / pointer['revision']
    assert sha(root / 'manifest.json') == pointer['sha256'] == colors['acceptedManifestSha256']
    manifest = json.loads((root / 'manifest.json').read_text())
    group, = [g for g in manifest['groups'] if g['id'] == colors['group'] == 'm2-4-snow-set18']
    member, = group['members']
    assert member['member'] == colors['member'] == 'droads25.sno'
    assert member['sourceHashes']['yr'] == colors['sourceSha256'] == \
        '5a734372e7a5d023dee6553322a78fe6c4ba7cad65cb32c25a2131ada53558cc'
    result = {}
    for density in (2, 4):
        variant, = [v for v in group['variants'] if v['density'] == density]
        record = colors['densityColors'][str(density)]
        assert variant == record['variant'] and sha(root / variant['file']) == variant['sha256']
        atlas = np.frombuffer((root / variant['file']).read_bytes(), np.uint8).reshape(*variant['size'][::-1], 4)
        parts = member['images']
        assert all(not p['hasExtraData'] and p['height'] == 0 for p in parts)
        positions = [(p['origin'][0] + p['offset'][0], p['origin'][1] + p['offset'][1]) for p in parts]
        left, top = np.min(positions, axis=0)
        right = max(x + p['logical'][0] for (x, _), p in zip(positions, parts))
        bottom = max(y + p['logical'][1] for (_, y), p in zip(positions, parts))
        whole = np.zeros(((bottom-top)*density, (right-left)*density, 4), np.uint8)
        for (x, y), rect in zip(positions, variant['rects']):
            sx, sy, width, height = rect
            part = atlas[sy:sy+height, sx:sx+width]
            target = whole[(y-top)*density:(y-top)*density+height, (x-left)*density:(x-left)*density+width]
            target[part[..., 3] > 0] = part[part[..., 3] > 0]
        red, green, blue, alpha = np.moveaxis(whole.astype(float), -1, 0)
        earth = (red-blue > 12) & (green-blue > 6) & (red > 45) & (alpha > 0)
        assert record['snowRect'] == [97, 51, 16, 8]
        x, y, width, height = record['snowRect']
        snow = whole[y*density:(y+height)*density, x*density:(x+width)*density]
        assert (snow[..., 3] == 255).all() and not earth[y*density:(y+height)*density, x*density:(x+width)*density].any()
        measured = dict(snow=snow[..., :3].mean((0, 1)).tolist(), earth=whole[..., :3][earth].mean(0).tolist())
        assert record['earthControlPixels'] == int(earth.sum())
        assert all(record[role] == measured[role] for role in measured)
        result[str(density)] = measured
    return result


def road_weight(rgb):
    red, green, blue = np.moveaxis(rgb.astype(float), -1, 0)
    return np.clip(np.minimum((red - blue) / 12, (green - blue) / 6), 0, 1)


def register_material_light(rgb, native, accepted_colors=None):
    """Match only broad material colors; retain each mother's continuous detail."""
    colors = native[..., :3].astype(float)
    active = native[..., 3] > 0
    original_road = (road_weight(colors) >= 1) & active
    original_snow = ~original_road & active & (colors.mean(2) > 150)
    weight = road_weight(rgb)
    density = rgb.shape[1] // native.shape[1]
    assert density in (2, 4) and rgb.shape[:2] == tuple(n * density for n in native.shape[:2])
    covered = np.repeat(np.repeat(active, density, 0), density, 1)
    masks = [original_snow, original_road]
    authored_masks = [covered & (weight < .05) & (rgb.mean(2) > 150), covered & (weight >= .95)]
    gains, evidence = [], []
    for role, original, authored in zip(['snow', 'earth'], masks, authored_masks):
        assert original.sum() >= 20 and authored.sum() >= 80
        original_mean = colors[original].mean(0)
        target = np.asarray(accepted_colors[role]) if accepted_colors else original_mean
        measured = rgb[authored].mean(0)
        gain = target / measured
        assert np.all((gain >= .65) & (gain <= 1.5)), 'Road material color gain exceeds bounded registration'
        gains.append(gain)
        evidence.append(dict(role=role, nativeColorMean=original_mean.tolist(), targetColorMean=target.tolist(), authoredColorMean=measured.tolist(),
            gain=gain.tolist(), originalControlPixels=int(original.sum()), authoredControlPixels=int(authored.sum())))
    gain = gains[0] * (1 - weight[..., None]) + gains[1] * weight[..., None]
    result = np.clip(np.rint(rgb.astype(float) * gain), 0, 255).astype(np.uint8)
    return result, dict(schema='yr-source-snow-road-two-material-light-v1', materials=evidence,
        colorAuthority='EXACT_ACCEPTED_INDEPENDENT_DENSITY_MATERIAL_MEANS' if accepted_colors else 'ORIGINAL_MATERIAL_MEANS',
        sourceTextureRendered=False, spatialSourceRgbFieldRendered=False, nativeGeometryModified=False)


def load(profile, source, root):
    if PROFILE_KEY not in profile:
        return {}
    contract, key, _ = admit_snow_scope(profile, source)
    assert key == 'sourcePinnedSnowRoadContours'
    declaration = profile[PROFILE_KEY]
    assert declaration['contract'] in CONTRACTS
    file = Path(__file__).resolve().parents[2] / 'docs/campaign-art/yr-v1' / declaration['contract']
    ports = json.loads(file.read_text())
    assert ports['schema'] == 'yr-source-pinned-snow-road-rgb-ports-v1'
    assert declaration == dict(contract=file.name, sha256=sha(file))
    assert ports['sourceMembers'] == contract['members']
    assert set(ports['members']) == set(contract['members'])
    for name, member in ports['members'].items():
        assert sha(root / (name + '-native.png')) == member['nativeRgbaSha256']
        assert member['bandNativePixels'] == 20
        assert 0 < len(member['edges']) <= 4
        for edge in member['edges']:
            assert edge['axis'] in ('u', 'v') and edge['side'] in ('min', 'max')
            points = np.asarray(edge['targetToAuthored'], float)
            assert points.ndim == 2 and points.shape[1] == 2 and len(points) >= 4
            assert np.all(np.diff(points, axis=0) > 0), 'Road-port UV mapping must be monotone'
            assert np.max(np.abs(points[:, 1] - points[:, 0])) <= 7
            assert np.array_equal(points[[0, -1], 0], points[[0, -1], 1])
    return ports['members']


def coordinates(x, y, native, declaration):
    """Use original isometric port tangents; keep the rest of the mother fixed."""
    yy, xx = np.where(native[..., 3] > 0)
    original = [(xx + .5) / 2 + yy + .5, -(xx + .5) / 2 + yy + .5]
    limits = [(values.min(), values.max()) for values in original]
    u, v = x / 2 + y, -x / 2 + y
    offsets = [np.zeros_like(u), np.zeros_like(v)]
    for edge in declaration['edges']:
        axis = 0 if edge['axis'] == 'u' else 1
        side = 0 if edge['side'] == 'min' else 1
        other = 1 - axis
        values = [u, v]
        distance = np.abs(values[axis] - limits[axis][side])
        weight = np.clip(1 - distance / declaration['bandNativePixels'], 0, 1)
        weight = weight * weight * (3 - 2 * weight)
        points = np.asarray(edge['targetToAuthored'], float)
        delta = np.interp(values[other], points[:, 0], points[:, 1] - points[:, 0], left=0, right=0)
        offsets[other] += delta * weight
    return u + offsets[0] - v - offsets[1], (u + offsets[0] + v + offsets[1]) / 2


def sample(plate, native, bounds, density, declaration):
    """Sample each output density directly from its unchanged genuine HD mother."""
    assert density in (2, 4)
    left, top, right, bottom = bounds
    width, height = right - left, bottom - top
    assert min(plate.shape[1] / width, plate.shape[0] / height) >= 4
    ordinary = independently_sample(plate, (width * density, height * density)).copy()
    # Integrate each output pixel from independent subpixel samples of the raw
    # registered plate. Neither density reads the other density's output.
    samples = 8 // density
    yy, xx = np.indices((height * density * samples, width * density * samples))
    x = left + (xx + .5) / (density * samples)
    y = top + (yy + .5) / (density * samples)
    sx, sy = coordinates(x, y, native, declaration)
    warped = (np.abs(sx - x) + np.abs(sy - y)) > 1e-8
    source_x = (sx - left) / width * plate.shape[1] - .5
    source_y = (sy - top) / height * plate.shape[0] - .5
    pixels = np.stack([ndimage.map_coordinates(plate[..., channel].astype(float),
        [source_y, source_x], order=3, mode='nearest') for channel in range(3)], axis=-1)
    pixels = pixels.reshape(height * density, samples, width * density, samples, 3).mean((1, 3))
    changed = warped.reshape(height * density, samples, width * density, samples).any((1, 3))
    ordinary[changed] = np.clip(np.rint(pixels[changed]), 0, 255).astype(np.uint8)
    return ordinary
