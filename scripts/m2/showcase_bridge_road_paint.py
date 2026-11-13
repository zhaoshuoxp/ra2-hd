"""Keep original bridge road paint continuous across repeated native blocks."""
import json
from pathlib import Path

import numpy as np
from scipy import ndimage

from continuous_road_markings import coordinates
from showcase_newurban_coastal_scope import coastal_set_indices
from showcase_registration import sha


KEY = 'sourcePinnedBridgeRoadPaint'
CONTRACT = 'terrain-newurban-bridge-paint-contract-r1.json'
CONTRACT_SHA256 = '17a5062cd7b076574cfb0da61746a85a9ac137af52868f35679b5127efbc1184'
PLANE_CONTRACT = 'terrain-newurban-bridge-paint-contract-r2.json'
PLANE_CONTRACT_SHA256 = 'e90038edb2770a37457dea78a3befc95abf0487594861b6700ca0a2b7b36807e'
ENDPOINT_CONTRACT = 'terrain-newurban-bridge-paint-contract-r3.json'
ENDPOINT_CONTRACT_SHA256 = '426f1f7fe4314d0e1e6c657a40fd5174862df6c82e82bdfa5e3a802827d5ab92'
FILTER_CONTRACT = 'terrain-newurban-bridge-paint-contract-r4.json'
FILTER_CONTRACT_SHA256 = '5a4c690336824fe559ff4695a447ae0c5d9fd1763fffbcca56ae3bab91125c76'


def load_bridge_paint(profile, source, authoring):
    if KEY not in profile:
        return {}
    assert coastal_set_indices(source) == dict.fromkeys(
        ['ovrps07.ubn', 'ovrps09.ubn', 'ovrps12.ubn'], 19)
    declaration = profile[KEY]
    contracts = {CONTRACT: CONTRACT_SHA256, PLANE_CONTRACT: PLANE_CONTRACT_SHA256,
        ENDPOINT_CONTRACT: ENDPOINT_CONTRACT_SHA256, FILTER_CONTRACT: FILTER_CONTRACT_SHA256}
    name = declaration['contract']
    assert name in contracts and declaration == dict(contract=name, sha256=contracts[name])
    file = Path(__file__).resolve().parents[2] / 'docs/campaign-art/yr-v1' / name
    assert sha(file) == contracts[name]
    document = json.loads(file.read_text())
    assert document['schema'] == 'yr-source-pinned-newurban-bridge-continuous-paint-v1'
    assert document['theater'] == source['theater'] and document['editions'] == source['editions']
    assert document['preparedSourceSha256'] == source['preparedSourceSha256']
    assert document['members'] == {m['member']: m['native']['sha256'] for m in source['members']}
    assert set(document['models']) == {'ovrps07.ubn', 'ovrps12.ubn'}
    assert document['retainedDamagedMember'] == 'ovrps09.ubn'
    for name, digest in document['originalNativeAssembly'].items():
        assert sha(Path(authoring) / (name + '-native.png')) == digest
    return document


def road_main_coverage(native, layout, density):
    width, height = layout['bounds'][2:]
    mask = np.zeros((height, width), bool)
    for part in layout['parts']:
        image = native['images'][part['subTile']]
        if image['nativeOffset'] <= 0 or image['height'] != 4 or image['terrainType'] != 11:
            continue
        x, y, w, h = part['rect']
        oy, ox = -image['offset'][1], -image['offset'][0]
        assert image['block'] == [60, 30]
        for row in range(29):
            row_width = 4*min(row+1, 29-row)
            left = (60-row_width)//2
            mask[y+oy+row, x+ox+left:x+ox+left+row_width] = True
    return mask.repeat(density, 0).repeat(density, 1)


def retain_bridge_main_rgb(rgb, whole_crop, alpha, image, density, document):
    """Continue the road field through transparent diagonal filter contacts."""
    if not document or not document.get('preserveMainRgbUnderTransparency') \
            or image['member'] not in document['models'] \
            or image['height'] != 4 or image['terrainType'] != 11:
        return rgb
    yy, xx = (np.indices(alpha.shape)+.5)/density
    ox, oy = image['offset']
    main = (xx+ox >= 0) & (xx+ox < image['block'][0]) \
        & (yy+oy >= 0) & (yy+oy < image['block'][1])
    changed = main & (alpha == 0)
    result = rgb.copy()
    result[changed] = whole_crop[changed]
    np.testing.assert_array_equal(result[alpha > 0], rgb[alpha > 0])
    return result


def reconstruct_bridge_paint(rgb, native, layout, density, document):
    name = native['member']
    if not document or name not in document['models']:
        return rgb
    assert density in (2, 4) and rgb.shape[:2] == tuple(n*density for n in layout['bounds'][2:][::-1])
    model, specification = document['models'][name], document['paint']
    yy, xx = np.indices(rgb.shape[:2])
    x = (xx+.5)/density + layout['bounds'][0]
    y = (yy+.5)/density + layout['bounds'][1]
    distance, along, gradient = coordinates(model, x, y)
    aa = gradient/density
    band = lambda center, width: np.clip((width/2-np.abs(distance-center))/aa+.5, 0, 1)
    gate = road_main_coverage(native, layout, density)
    contact_gate = gate
    if bounds := model.get('planeBounds'):
        tangent = x/2+y if bounds['axis'] == 'u' else -x/2+y
        cross_gate = np.abs(distance) < document['asphaltHalfWidth']
        gate = cross_gate & (tangent >= bounds['minimum']) & (tangent <= bounds['maximum'])
        contact_gate = cross_gate & (tangent >= bounds['minimum']-document['contactNativePixels']) \
            & (tangent <= bounds['maximum']+document['contactNativePixels'])
    values = rgb.astype(float)
    light, chroma = values.mean(2), np.ptp(values, axis=2)
    yellow = (values[..., 0]-values[..., 2] > 55) & (values[..., 1]-values[..., 2] > 40)
    white = (light > 150) & (chroma < 45)
    centers = specification['centerOffsets'] + specification['edgeOffsets'] + specification['whiteOffsets']
    near_paint = np.minimum.reduce([np.abs(distance-center) for center in centers]) < 5
    obsolete = gate & near_paint & (yellow | white)
    if model.get('planeBounds'):
        yellow_zone = np.minimum.reduce([np.abs(distance-center) for center in
            specification['centerOffsets']+specification['edgeOffsets']]) < 5
        white_zone = np.minimum.reduce([
            np.abs(distance-center) for center in specification['whiteOffsets']]) < 5
        obsolete = contact_gate & ((yellow & yellow_zone) | (white & white_zone))
        obsolete |= gate & (np.abs(distance) > 46) & (light > 135)
        if document.get('endpointPolicy'):
            # Original ground-level extra sprites carry the road's upper
            # overhang. Their baked paint must end with the same road plane.
            strong_white = white & (light > 205) & (chroma < 30)
            obsolete = gate & ((yellow & yellow_zone) | (white & white_zone)
                | ((np.abs(distance) > 46) & (light > 135)))
            obsolete |= contact_gate & ~gate & ((yellow & yellow_zone) | (strong_white & white_zone))
    removal = ndimage.binary_dilation(obsolete, iterations=max(1, density//2)) & contact_gate & near_paint
    clean = gate & ~ndimage.binary_dilation(obsolete, iterations=2*density)
    clean &= (light < 135) & (chroma < 45) & (np.abs(distance) < 49)
    assert clean.sum() > 100 and (yellow & gate).sum() > 20 and (white & gate).sum() > 20
    nearest = ndimage.distance_transform_edt(~clean, return_distances=False, return_indices=True)
    result = values.copy()
    result[removal] = values[tuple(nearest)][removal]
    if document.get('endpointPolicy'):
        local_clean = ~ndimage.binary_dilation(yellow | (white & (light > 205)), iterations=density)
        local_clean &= (light > 20) & (light < 205) & (chroma < 50)
        assert local_clean.any()
        local = ndimage.distance_transform_edt(~local_clean, return_distances=False, return_indices=True)
        outside = removal & ~gate
        result[outside] = values[tuple(local)][outside]
    yellow_color = np.median(values[yellow & gate], axis=0)
    white_controls = white & gate & (np.minimum.reduce([
        np.abs(distance-center) for center in specification['whiteOffsets']]) < 4)
    assert white_controls.sum() > 20
    white_color = np.median(values[white_controls], axis=0)
    yellow_weight = np.maximum.reduce([band(center, specification['centerWidth'])
        for center in specification['centerOffsets']])
    yellow_weight = np.maximum(yellow_weight, np.maximum.reduce([band(center, specification['edgeWidth'])
        for center in specification['edgeOffsets']]))
    phase = along % (specification['dashPeriod']*np.sqrt(2))
    dash = np.clip(np.minimum(phase, specification['dashLength']-phase)/aa+.5, 0, 1)
    white_weight = np.maximum.reduce([band(center, specification['whiteWidth'])
        for center in specification['whiteOffsets']])*dash
    for weight, color in [(yellow_weight, yellow_color), (white_weight, white_color)]:
        weight = (weight*gate)[..., None]
        result = result*(1-weight)+color*weight
    result = np.rint(np.clip(result, 0, 255)).astype(np.uint8)
    np.testing.assert_array_equal(result[~contact_gate], rgb[~contact_gate])
    return result
