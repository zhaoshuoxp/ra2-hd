"""Share qualified beach material across two original sand-foot wall floors."""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from showcase_coastal_sea import load_coastal_sea, native_coastal_extra_coverage, original_floor_region
from showcase_newurban_coastal_scope import coastal_set_indices
from showcase_registration import sha
from showcase_shore import LAND_KEY, load_shore_land, sample_shore_land, transition


KEY = 'sourcePinnedCoastalBeach'
MEMBERS = {'wclifb01.ubn', 'wclifb05.ubn'}
POLICY = 'VISIBLE_ORIGINAL_ZERO_HEIGHT_FLOOR_EXCLUDING_WATER_AND_WALL'


def beach_extra_coverage(source, layout, declaration):
    assert coastal_set_indices(source) == dict.fromkeys(MEMBERS, 83)
    assert declaration['schema'] == 'yr-source-newurban-sand-foot-extra-ownership-v1'
    protected = native_coastal_extra_coverage(source, layout, declaration, partial_main=True)
    extra = native_coastal_extra_coverage(source, layout, declaration)
    # The left half of source subtile2 is raised sand; its right half is wall.
    # Retain both source depths while assigning their distinct material roles.
    name = 'wclifb01.ubn'
    region = np.zeros_like(protected[name])
    region[75:105, 30:60] = True
    assert int((region & protected[name] & ~extra[name]).sum()) == 210
    protected[name][region] = extra[name][region]
    return protected


def load_coastal_beach(profile, source, authoring):
    declaration = profile.get(KEY)
    if declaration is None:
        return {}, {}
    required = {'continuousAuthoredRgb', 'authoredSurfaceReconstruction', KEY}
    assert set(profile) in (required, required | {'sourcePinnedCoastalSea'})
    assert coastal_set_indices(source) == dict.fromkeys(MEMBERS, 83)
    members = {m['member']: m['native'] for m in source['members']}
    assert profile['continuousAuthoredRgb'] == profile['authoredSurfaceReconstruction'] == {
        name: native['sha256'] for name, native in members.items()}
    file = Path(declaration['file'])
    assert sha(file) == declaration['sha256']
    document = json.loads(file.read_text())
    assert document['schema'] == 'yr-source-pinned-sand-foot-beach-material-v1'
    assert document['theater'] == source['theater'] == 'NEWURBAN' and source['editions'] == ['yr']
    assert document['preparedSourceSha256'] == source['preparedSourceSha256']
    assert document['sourceFloorRole'] == POLICY
    assert document['nativeMainOwnership'] == 'PROTECT_VISIBLE_EXTRA_AND_SOURCE_NONPLANAR_WALL_PIXELS'
    assert document['nativeMainSandFloor'] == dict(member='wclifb01.ubn', subTile=2,
        nativeRect=[30, 75, 30, 30], nonplanarSandPixels=210)
    assert document['contactDistances'] == dict(waterInset=2, waterTransition=5, bodyInset=1, bodyTransition=4)
    assert set(document['members']) == MEMBERS and not document['sourceRgbUsedAsOutputTexture']
    sea_pin = document['sourceSeaControl']
    if 'sourcePinnedCoastalSea' in profile:
        assert profile['sourcePinnedCoastalSea'] == sea_pin
    # A dry control retains identical source-role weights without painting sea.
    sea, _ = load_coastal_sea(dict(profile, sourcePinnedCoastalSea=sea_pin), source, authoring)
    layout = json.loads((Path(authoring) / 'layout.json').read_text())
    protected = beach_extra_coverage(source, layout, document['nativeExtraOwnership'])
    masks = {}
    for name, entry in document['members'].items():
        assert entry['sourceSha256'] == members[name]['sha256']
        assert document['palette'] == dict(member='isoubn.pal',
            sha256='1aa49468a9439a5cff3e5f66fae0678501e9dc3ef7a4d90f23127c38ad6e4676')
        assert all(members[name]['palette'][key] == value for key, value in document['palette'].items())
        image = Path(authoring) / (name + '-native.png')
        assert sha(image) == entry['nativeAssemblySha256']
        rgba = np.asarray(Image.open(image).convert('RGBA'))
        assert entry['logical'] == list(rgba.shape[1::-1])
        floor = original_floor_region(rgba, members[name], layout[name])
        expected = floor & ~protected[name] & ~sea[name]['water']
        file = Path(entry['file'])
        assert sha(file) == entry['sha256']
        values = np.frombuffer(file.read_bytes(), np.uint8).reshape(rgba.shape[:2])
        assert np.all(values <= 1) and np.array_equal(values != 0, expected)
        assert int(expected.sum()) == entry['sandPixels'] > 0
        assert int(protected[name].sum()) == entry['protectedExtraPixels']
        assert not entry['sourceRgbUsedAsOutputTexture']
        clearance = entry['authoredFloorClearance']
        assert clearance['schema'] == 'yr-pinned-authored-wall-floor-clearance-v1'
        assert clearance['masterSha256'] == '267d47a3c6d6ae4ce749dca7f9edae85d31e3aeca0f59ac3808e1c2a12d470cc'
        assert sha(Path(authoring) / layout[name]['board']) == clearance['masterSha256']
        assert layout[name]['boardSize'] == [1536, 1024] and layout[name]['occupied'] == 2
        assert layout[name]['slotRect'] == ([0, 0, 768, 1024] if name == 'wclifb01.ubn'
            else [768, 0, 768, 1024])
        assert clearance['plane'] == ([-1, 0, 55] if name == 'wclifb01.ubn' else [0, 1, -82])
        assert clearance['transitionWidth'] == (3 if name == 'wclifb01.ubn' else 4)
        body = protected[name] | ((rgba[..., 3] > 0) & ~floor)
        masks[name] = dict(floor=floor & ~protected[name], body=body, water=sea[name]['water'],
            authoredFloorClearance=clearance)
    return masks, load_shore_land({LAND_KEY: document['acceptedMaterial']})


def lifted_distance(mask, density):
    distance = ndimage.distance_transform_edt(~mask)
    yy, xx = (np.indices(tuple(n*density for n in mask.shape)) + .5) / density - .5
    return ndimage.map_coordinates(distance, [yy, xx], order=1, mode='nearest')


def beach_weight(mask, density):
    assert density in (2, 4)
    floor = mask['floor'].repeat(density, 0).repeat(density, 1)
    dry = transition((lifted_distance(mask['water'], density)-2)/5)
    shadow = transition((lifted_distance(mask['body'], density)-1)/4)
    clearance = mask['authoredFloorClearance']
    yy, xx = (np.indices(floor.shape) + .5) / density
    a, b, c = clearance['plane']
    authored_floor = transition((a*xx+b*yy+c)/clearance['transitionWidth'])
    return floor*dry*shadow*authored_floor


def render_coastal_beach(rgb, mask, land, density):
    assert rgb.shape[:2] == tuple(n*density for n in mask['floor'].shape)
    weight = beach_weight(mask, density)[..., None]
    pixels = sample_shore_land(list(mask['floor'].shape[::-1]), land[density], density)
    return np.uint8(np.clip(np.rint(rgb*(1-weight) + pixels*weight), 0, 255))
