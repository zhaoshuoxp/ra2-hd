"""Compose qualified Snow earth detail inside source-registered road roles."""
import json
from pathlib import Path

import numpy as np
from scipy.ndimage import distance_transform_edt

from showcase_registration import sha
from showcase_snow_road_contacts import LIGHT_KEY, PROFILE_KEY, road_weight
from showcase_snow_scope import admit_snow_scope


KEY = 'sourcePinnedSnowRoadEarthMaterial'
CONTRACT = 'terrain-snow-roads-qualified-earth-r12.json'
CONTRACT_SHA256 = '09aea7c4171c3bb6b8462d97aec7120663e45a039e14db897de0aed4a725db49'
CONTRACTS = {CONTRACT: CONTRACT_SHA256,
    'terrain-snow-roads-mud-and-shoulders-r21.json':
        'e2aae3af0605f5c5d7ecb68a85315dec5984164416ecab7f3dcdf2c6da44a791',
    'terrain-snow-roads-contact-fade-r23.json':
        'da60be2637c62c4061e7a08c1e75311649119e8e43e7fa8a358b5db14f3ddf11'}
ROOT = Path(__file__).resolve().parents[2]


def accepted_member(root, manifest, control, density):
    group, = [g for g in manifest['groups'] if g['id'] == control['group']]
    cursor = 0
    for member in group['members']:
        if member['member'] == control['member']:
            break
        cursor += len(member['images'])
    assert member['member'] == control['member']
    assert member['sourceHashes']['yr'] == control['sourceSha256']
    variant, = [v for v in group['variants'] if v['density'] == density]
    assert sha(root / variant['file']) == variant['sha256']
    atlas = np.memmap(root / variant['file'], np.uint8, 'r', shape=(*variant['size'][::-1], 4))
    parts = member['images']
    positions = [(p['origin'][0]+p['offset'][0], p['origin'][1]+p['offset'][1]) for p in parts]
    left, top = np.min(positions, axis=0)
    right = max(x+p['logical'][0] for (x, _), p in zip(positions, parts))
    bottom = max(y+p['logical'][1] for (_, y), p in zip(positions, parts))
    whole = np.zeros(((bottom-top)*density, (right-left)*density, 4), np.uint8)
    for (x, y), rect in zip(positions, variant['rects'][cursor:cursor+len(parts)]):
        sx, sy, width, height = rect
        part = atlas[sy:sy+height, sx:sx+width]
        target = whole[(y-top)*density:(y-top)*density+height,
            (x-left)*density:(x-left)*density+width]
        target[part[..., 3] > 0] = part[part[..., 3] > 0]
    return whole


def load_earth_material(profile, source):
    if KEY not in profile:
        return {}
    contract, contour_key, _ = admit_snow_scope(profile, source)
    assert contour_key == 'sourcePinnedSnowRoadContours'
    assert PROFILE_KEY in profile and LIGHT_KEY in profile
    pin = profile[KEY]
    assert pin['contract'] in CONTRACTS
    file = ROOT / 'docs/campaign-art/yr-v1' / pin['contract']
    assert sha(file) == CONTRACTS[file.name]
    assert pin == dict(contract=file.name, sha256=CONTRACTS[file.name])
    declaration = json.loads(file.read_text())
    shoulders = file.name != CONTRACT
    contact_fade = file.name == 'terrain-snow-roads-contact-fade-r23.json'
    assert declaration['schema'] == ('yr-source-pinned-snow-road-mud-and-shoulders-v1'
        if shoulders else 'yr-source-pinned-qualified-snow-road-earth-v1')
    assert declaration['members'] == contract['members']
    expected = ('COMPACTED_MUD_SHOULDERS_AND_SOURCE_ROAD_PORT_FADE_V1' if contact_fade else
        'COMPACTED_MUD_AND_EARTH_SHOULDERS_AUTHORED_LIGHT_V1' if shoulders else
        'AUTHORED_LIGHT_TIMES_ACCEPTED_EARTH_COMPONENT_V1')
    assert declaration['composition'] == expected
    assert not declaration['sourceRgbUsedAsOutputTexture'] and not declaration['newRasterArtwork']
    pointer = declaration['acceptedPack']
    assert pointer == dict(schemaVersion=1, revision='yr-snow-water-cliffs-r3',
        sha256='ff193253b7bd1362d0577c31275c5d7f744caa5d20b1998f3b00c8c90e29c453')
    root = ROOT / '.local/terrain-packs' / pointer['revision']
    assert sha(root / 'manifest.json') == pointer['sha256']
    manifest = json.loads((root / 'manifest.json').read_text())
    group, = [g for g in manifest['groups'] if g['id'] == declaration['group'] == 'm2-4-snow-set18']
    member, = group['members']
    assert member['member'] == declaration['member'] == 'droads25.sno'
    assert member['sourceHashes']['yr'] == declaration['sourceSha256'] == \
        '5a734372e7a5d023dee6553322a78fe6c4ba7cad65cb32c25a2131ada53558cc'
    parts = member['images']
    assert all(not p['hasExtraData'] and p['height'] == 0 for p in parts)
    positions = [(p['origin'][0]+p['offset'][0], p['origin'][1]+p['offset'][1]) for p in parts]
    left, top = np.min(positions, axis=0)
    right = max(x+p['logical'][0] for (x, _), p in zip(positions, parts))
    bottom = max(y+p['logical'][1] for (_, y), p in zip(positions, parts))
    assert declaration['nativeInterior'] == [51, 23, 21, 6]
    materials = {}
    for density in [2, 4]:
        variant, = [v for v in group['variants'] if v['density'] == density]
        assert sha(root / variant['file']) == variant['sha256']
        atlas = np.memmap(root / variant['file'], np.uint8, 'r', shape=(*variant['size'][::-1], 4))
        whole = np.zeros(((bottom-top)*density, (right-left)*density, 4), np.uint8)
        for (x, y), rect in zip(positions, variant['rects']):
            sx, sy, width, height = rect
            part = atlas[sy:sy+height, sx:sx+width]
            target = whole[(y-top)*density:(y-top)*density+height,
                (x-left)*density:(x-left)*density+width]
            target[part[..., 3] > 0] = part[part[..., 3] > 0]
        x, y, width, height = declaration['nativeInterior']
        patch = whole[y*density:(y+height)*density, x*density:(x+width)*density]
        assert patch.shape == (height*density, width*density, 4)
        assert (patch[..., 3] == 255).all()
        red, _, blue, _ = np.moveaxis(patch.astype(int), -1, 0)
        assert not ((blue-red > 2) & (blue > 170)).any(), 'Earth interior must exclude blue Snow'
        materials[density] = patch[..., :3].copy()
    if shoulders:
        controls = declaration['snowBodyControls']
        assert len(controls) == 5 and {c['member'] for c in controls} == {
            'droads23.sno', 'droads53.sno', 'droads17.sno', 'droads54.sno', 'droads65.sno'}
        materials['controls'] = {}
        for density in [2, 4]:
            means = []
            for control in controls:
                whole = accepted_member(root, manifest, control, density)
                red, green, blue, alpha = np.moveaxis(whole.astype(float), -1, 0)
                snow = (alpha == 255) & (red-blue < 4) & (green-blue < 4) & (whole[..., :3].mean(2) > 150)
                assert snow.sum() > 100*density*density
                means.append(whole[..., :3][snow].mean(0))
            control = declaration['mudControl']
            assert control == dict(next(c for c in controls if c['member'] == 'droads17.sno'),
                nativeInterior=[115, 60, 8, 2])
            whole = accepted_member(root, manifest, control, density)
            x, y, width, height = control['nativeInterior']
            mud = whole[y*density:(y+height)*density, x*density:(x+width)*density]
            assert (mud[..., 3] == 255).all()
            materials['controls'][density] = dict(snow=np.mean(means, axis=0), mud=mud[..., :3].mean((0, 1)))
    if contact_fade:
        fade = declaration['roadPortFade']
        assert fade == dict(contract='terrain-snow-roads-rgb-port-contract-r6.json',
            sha256='f31678025b25fa054bffed04f26bd2c3483df0e329895d1d626ed666158bc024',
            bandNativePixels=12)
        assert profile[PROFILE_KEY] == {k: fade[k] for k in ['contract', 'sha256']}
        file = ROOT / 'docs/campaign-art/yr-v1' / fade['contract']
        assert sha(file) == fade['sha256']
        ports = json.loads(file.read_text())
        assert ports['sourceMembers'] == contract['members']
        materials['ports'] = dict(band=12, members={name: [dict(axis=e['axis'], side=e['side'])
            for e in item['edges']] for name, item in ports['members'].items()})
    return materials


def road_port_weight(native, shape, density, ports):
    yy, xx = np.where(native[..., 3] > 0)
    original = [(xx+.5)/2+yy+.5, -(xx+.5)/2+yy+.5]
    limits = [(value.min(), value.max()) for value in original]
    yy, xx = (np.indices(shape)+.5)/density
    values = [xx/2+yy, -xx/2+yy]
    result = np.zeros(shape)
    for edge in ports:
        axis = 0 if edge['axis'] == 'u' else 1
        side = 0 if edge['side'] == 'min' else 1
        weight = np.clip(1-np.abs(values[axis]-limits[axis][side])/12, 0, 1)
        result = np.maximum(result, weight*weight*(3-2*weight))
    return result


def compose_earth_material(rgb, materials, density, native=None, member=None):
    assert density in [2, 4] and materials.keys() in ({2, 4}, {2, 4, 'controls'}, {2, 4, 'controls', 'ports'})
    patch = materials[density]
    yy, xx = np.indices(rgb.shape[:2])
    material = patch[yy % patch.shape[0], xx % patch.shape[1]].astype(float)
    if 'controls' in materials:
        assert native is not None and rgb.shape[:2] == tuple(n*density for n in native.shape[:2])
        active = (native[..., 3] > 0).repeat(density, 0).repeat(density, 1)
        weight = road_weight(rgb)
        snow = active & (weight <= .05) & (rgb.mean(2) > 150)
        mud = active & (weight >= .95)
        assert min(snow.sum(), mud.sum()) > 20*density*density
        control = materials['controls'][density]
        snow_gain, mud_gain = control['snow']/rgb[snow].mean(0), control['mud']/rgb[mud].mean(0)
        assert all(np.all((gain >= .6) & (gain <= 1.5)) for gain in [snow_gain, mud_gain])
        gain = snow_gain*(1-weight[..., None])+mud_gain*weight[..., None]
        result = np.clip(np.rint(rgb*gain), 0, 255)
        distance = distance_transform_edt(weight >= .5)/density
        shoulder = np.clip((2-distance)/1.5, 0, 1)*weight*active
        lighting = np.where((weight >= .95)[..., None], result/control['mud'], 1)
        gravel = np.clip(material*lighting, 0, 255)
        result = np.clip(np.rint(result*(1-shoulder[..., None])+gravel*shoulder[..., None]), 0, 255)
        if 'ports' in materials:
            assert materials['ports']['band'] == 12 and member in materials['ports']['members']
            contact = road_port_weight(native, rgb.shape[:2], density,
                materials['ports']['members'][member])*weight*active
            result = np.clip(np.rint(result*(1-contact[..., None])+gravel*contact[..., None]), 0, 255)
        return np.uint8(result)
    material = np.clip(material*rgb/patch.mean((0, 1)), 0, 255)
    weight = road_weight(rgb)[..., None]
    return np.uint8(np.clip(np.rint(rgb*(1-weight)+material*weight), 0, 255))
