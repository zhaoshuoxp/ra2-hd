"""Sample authored ground materials through source-pinned continuous boundaries."""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from showcase_registration import sha


def load_urban_ground(profile, source, authoring):
    declarations = profile.get('sourcePinnedUrbanGroundMaterials', {})
    if not declarations:
        return {}, {}, []
    accepted = profile.get('acceptedUrbanGroundRegions')
    assert set(profile) == {'sourcePinnedUrbanGroundMaterials',
        'acceptedUrbanGroundRegions' if accepted else 'urbanGroundMaterialSwatches'}
    assert source['theater'] in {'URBAN', 'NEWURBAN'} and source['editions'] == ['yr']
    members = {member['member']: member['native'] for member in source['members']}
    assert set(declarations) == set(members)
    expected = ({'gbfix08.urb', 'gbfix04.urb', 'gbfix03.urb', 'gbfix02.urb', 'gbfix07.urb', 'pavfxb03.urb'}
        if source['theater'] == 'URBAN' else {'pavefx04.ubn', 'pavefx02.ubn', 'grfix04.ubn', 'grfix03.ubn',
            'rbfix06.ubn', 'rbfix04.ubn', 'rbfix05.ubn', 'rbfix07.ubn', 'rbfix08.ubn',
            'pavfxb03.ubn', 'pavfxb01.ubn', 'pavfxb02.ubn'})
    assert set(members) == expected
    geometry = {}
    for name, declaration in declarations.items():
        native = members[name]
        assert declaration['sourceSha256'] == native['sha256']
        assert declaration['paletteSha256'] == native['palette']['sha256']
        file = Path(declaration['geometryFile'])
        assert sha(file) == declaration['geometrySha256']
        document = json.loads(file.read_text())
        assert document['schema'] == 'yr-source-pinned-urban-ground-geometry-v1'
        assert document['sourceSha256'] == native['sha256'] and document['member'] == name
        assert document['paletteSha256'] == native['palette']['sha256']
        assert document['logical'] == [60, 30] and len(native['images']) == 1
        assert document['nativeRgbaSha256'] == sha(authoring / (name + '-native.png'))
        assert native['images'][0]['logical'] == [60, 30] and native['images'][0]['rampType'] == 0
        assert not document['sourceRgbUsedAsNewDetail']
        geometry[name] = document['model']
    if accepted:
        return geometry, load_accepted_regions(accepted, geometry), accepted_region_records(accepted)
    assert source['theater'] == 'URBAN'
    swatches, records = {}, []
    assert set(profile['urbanGroundMaterialSwatches']) == {'grass', 'paving', 'sidewalk', 'asphalt'}
    for role, declaration in profile['urbanGroundMaterialSwatches'].items():
        file = Path(declaration['master'])
        assert sha(file) == declaration['sha256']
        image = Image.open(file).convert('RGBA')
        x, y, width, height = declaration['rect']
        assert x >= 0 and y >= 0 and x + width <= image.width and y + height <= image.height
        pixels = np.asarray(image.crop((x, y, x + width, y + height)))
        assert pixels[..., 3].min() == 255 and min(width / 60, height / 30) >= 4
        swatches[role] = pixels[..., :3]
        records.append(dict(member='urban-material-' + role, master=str(file), sha256=sha(file),
            sourceRect=declaration['rect'], capacity=min(width / 60, height / 30),
            role='INDEPENDENT_AUTHORED_GROUND_MATERIAL'))
    return geometry, swatches, records


def accepted_region_document(declaration):
    file = Path(declaration['file'])
    assert sha(file) == declaration['sha256']
    document = json.loads(file.read_text())
    assert document['schema'] == 'yr-accepted-ground-pixel-regions-v1'
    assert document['newArtwork'] == 0 and not document['nativeRgbUsedAsOutputTexture']
    return document


def sample_accepted_plane(pixels, specification, density):
    assert density in (2, 4)
    assert pixels.shape == (30*density, 60*density, 4)
    if specification['schema'] == 'accepted-road-asphalt-plane-v1':
        assert specification['longitudinalRange'] == [.1, .9] and specification['nativeCrossRange'] == [-20, -12]
        yy, xx = (np.indices((30*density, 60*density))+.5)/density
        u = xx/60+yy/30-.5
        repeat = (u-.1) % 1.6
        u = .1+np.minimum(repeat, 1.6-repeat)
        cross = -20+(xx-2*yy) % 8
        v = (30-cross)/60
        sx = np.clip(np.floor((30+30*(u-v))*density).astype(int), 0, 60*density-1)
        sy = np.clip(np.floor(15*(u+v)*density).astype(int), 0, 30*density-1)
        result = pixels[sy, sx]
        assert np.all(result[..., 3] == 255)
        return result
    assert specification['schema'] == 'accepted-fixed-scale-plane-v1'
    x, y, width, height = specification['nativeRect']
    assert all(type(value) is int for value in [x, y, width, height])
    assert min(x, y) >= 0 and min(width, height) > 0 and x+width <= 60 and y+height <= 30
    assert specification['quarterTurns'] in (0, 1, 2, 3)
    patch = pixels[y*density:(y+height)*density, x*density:(x+width)*density]
    assert np.all(patch[..., 3] == 255)
    patch = np.rot90(patch, specification['quarterTurns'])
    assert specification['repeat'] == 'mirror'
    yy, xx = np.indices((30*density, 60*density))
    xx, yy = xx % (2*patch.shape[1]), yy % (2*patch.shape[0])
    xx = np.minimum(xx, 2*patch.shape[1]-1-xx)
    yy = np.minimum(yy, 2*patch.shape[0]-1-yy)
    return patch[yy, xx]


def continue_accepted_hd_border(pixels, policy, density, source_role=None):
    assert policy == dict(schema='accepted-hd-native-boundary-mirror-v1', nativeInset=1)
    assert density in (2, 4) and pixels.shape == (30*density, 60*density, 4)
    native = pixels[::density, ::density, 3] > 0
    active = pixels[..., 3] > 0
    assert np.array_equal(active, native.repeat(density, 0).repeat(density, 1))
    core = ndimage.binary_erosion(native, structure=np.ones((3, 3), bool))
    interior = core.copy()
    if source_role is not None:
        assert source_role.shape == native.shape and source_role.dtype == bool
        interior &= source_role
    interior = interior.repeat(density, 0).repeat(density, 1)
    assert interior.any()
    _, nearest = ndimage.distance_transform_edt(~interior, return_indices=True)
    yy, xx = np.indices(active.shape)
    source_y = np.clip(2*nearest[0]-yy, 0, active.shape[0]-1)
    source_x = np.clip(2*nearest[1]-xx, 0, active.shape[1]-1)
    valid = interior[source_y, source_x]
    source_y = np.where(valid, source_y, nearest[0])
    source_x = np.where(valid, source_x, nearest[1])
    result = pixels.copy()
    border = active & ~core.repeat(density, 0).repeat(density, 1)
    result[border, :3] = pixels[source_y[border], source_x[border], :3]
    return result


def load_accepted_regions(declaration, geometry):
    document = accepted_region_document(declaration)
    selected = document['acceptedSelection']
    root = Path('.local/terrain-packs') / selected['revision']
    assert sha(root / 'manifest.json') == selected['sha256']
    manifest = json.loads((root / 'manifest.json').read_text())
    assert manifest['theater'] in {'URBAN', 'NEWURBAN'} and set(document['members']) == set(geometry)
    role_masks = None
    if declaration.get('sourceRoleMasks'):
        pin = declaration['sourceRoleMasks']
        file = Path(pin['file'])
        assert sha(file) == pin['sha256']
        role_masks = json.loads(file.read_text())
        assert role_masks['schema'] == 'yr-source-ground-role-masks-v1'
        assert role_masks['regionsSha256'] == sha(Path(role_masks['regionsFile']))
    selections = {selected['sha256']: manifest}
    result, atlases = {}, {}
    for name, regions in document['members'].items():
        assert set(regions) == set(geometry[name]['nativeRegionColors'])
        result[name] = {}
        for role, region in regions.items():
            controls = region['sourceRegionControls']
            if document.get('materialColorControls'):
                assert document['theater'] == 'NEWURBAN' and controls['coverageFraction'] == 1
                assert controls['meanColorDifference'] <= 4
                if document.get('semanticRoleControls'):
                    minimum = controls['requiredNativeMaterialCoverage']
                    assert minimum == (0 if role in {'grass', 'asphalt'} else .95)
                    assert controls['nativeMaterialCoverage'] >= minimum
                    if role == 'grass':
                        assert region['donor']['member'].startswith('clear01') and region['donorTheater'] == 'NEWURBAN'
                    if role == 'asphalt':
                        assert region['donor']['member'].startswith('droads') and region['donorTheater'] == 'NEWURBAN'
                assert geometry[name]['kind'] == 'polynomial-material-partition'
            else:
                assert controls['meanChannelError'] <= 4
            pointer = region.get('acceptedSelection', selected)
            root = Path('.local/terrain-packs') / pointer['revision']
            if pointer['sha256'] not in selections:
                assert sha(root / 'manifest.json') == pointer['sha256']
                selections[pointer['sha256']] = json.loads((root/'manifest.json').read_text())
            donor_manifest = selections[pointer['sha256']]
            assert donor_manifest['theater'] == region.get('donorTheater', manifest['theater'])
            donor = region['donor']
            source_role = None
            if role_masks and not region.get('sampling'):
                mask = role_masks['members'][name][role]
                assert mask['sourceSha256'] == donor['sourceSha256'] and mask['sourceMember'] == donor['member']
                assert mask['subTile'] == donor['subTile'] and mask['role'] == role and mask['nativeSize'] == [60, 30]
                assert mask['palette']['member'] == ('isourb.pal' if region['donorTheater'] == 'URBAN' else 'isoubn.pal')
                file = Path(mask['file'])
                assert sha(file) == mask['sha256']
                raw = np.frombuffer(file.read_bytes(), dtype=np.uint8).reshape(30, 60)
                assert np.all((raw == 0) | (raw == 1))
                source_role = raw.astype(bool)
            group, = [group for group in donor_manifest['groups'] if group['id'] == donor['group']]
            offset = 0
            for member in group['members']:
                if member['member'] == donor['member']:
                    break
                offset += len(member['images'])
            assert donor['sourceSha256'] == member['sourceHashes'][donor['edition']]
            result[name][role] = {}
            assert set(region['densities']) == {'2', '4'}
            for key, sample in region['densities'].items():
                density = int(key)
                variant, = [variant for variant in group['variants'] if variant['density'] == density]
                assert sample['sourceAtlas'] == variant['file'] and sample['sourceAtlasSha256'] == variant['sha256']
                assert sample['sourceRect'] == variant['rects'][offset + donor['subTile']]
                file = root / variant['file']
                if file not in atlases:
                    assert sha(file) == variant['sha256']
                    atlases[file] = np.memmap(file, dtype=np.uint8, mode='r',
                        shape=(variant['size'][1], variant['size'][0], 4))
                x, y, width, height = sample['sourceRect']
                assert [width, height] == sample['size'] == [60*density, 30*density]
                png = Path(sample['file'])
                assert sha(png) == sample['sha256']
                pixels = np.asarray(Image.open(png).convert('RGBA'))
                expected = atlases[file][y:y+height, x:x+width]
                if region.get('sampling'):
                    expected = sample_accepted_plane(expected, region['sampling'], density)
                assert np.array_equal(pixels, expected)
                if declaration.get('densityInteriorContinuation') and not region.get('sampling'):
                    pixels = continue_accepted_hd_border(pixels, declaration['densityInteriorContinuation'], density, source_role)
                result[name][role][density] = pixels
    guard = declaration.get('contourGuard')
    if guard:
        assert guard == dict(schema='accepted-grass-contour-v1', maximumNativeDistance=2,
            minimumGreenRedDifference=4, minimumGreenBlueDifference=4)
    return dict(schema='accepted-native-density-regions-v1', members=result, contourGuard=guard)


def accepted_region_records(declaration):
    document = accepted_region_document(declaration)
    return [dict(member=name + '-' + role, master=region['densities']['4']['file'],
        sha256=region['densities']['4']['sha256'], sourceRect=[0, 0, 240, 120], capacity=4,
        role='EXACT_ACCEPTED_INDEPENDENT_2X4X_PIXEL_REGION')
        for name, regions in document['members'].items() for role, region in regions.items()]


def partition_weights(model, density):
    assert model['kind'] == 'polynomial-material-partition' and density in (2, 4)
    assert model['degree'] in (1, 2)
    coefficients = np.asarray(model['coefficients'])
    assert coefficients.shape == (len(model['roles']), 3 if model['degree'] == 1 else 6)
    yy, xx = np.indices((30*density, 60*density))
    weights = np.zeros((len(model['roles']), *xx.shape))
    # Evaluate the continuous boundary at independent subpixel positions.
    # Only a material join is antialiased; accepted material pixels are never filtered.
    for sy in range(8):
        for sx in range(8):
            x, y = ((xx+(sx+.5)/8)/density-30)/30, ((yy+(sy+.5)/8)/density-15)/15
            basis = [np.ones_like(x), x, y]
            if model['degree'] == 2:
                basis += [x*x, x*y, y*y]
            labels = np.einsum('kc,cyx->kyx', coefficients, np.asarray(basis)).argmax(0)
            for role in range(len(model['roles'])):
                weights[role] += (labels == role)/64
    return dict(zip(model['roles'], weights))


def render_urban_ground(model, swatches, density, contour_guard=None):
    assert density in (2, 4)
    yy, xx = (np.indices((30 * density, 60 * density)) + .5) / density
    if model['kind'] == 'polynomial-material-partition':
        assert contour_guard is None
        weights = partition_weights(model, density)
    elif model['kind'] == 'quadratic-grass-paving-boundary':
        x, y = (xx - 30) / 30, (yy - 15) / 15
        b = np.asarray(model['coefficients'])
        field = b[0] + b[1] * x + b[2] * y + b[3] * x*x + b[4] * x*y + b[5] * y*y
        gx = (b[1] + 2*b[3]*x + b[4]*y) / 30
        gy = (b[2] + b[4]*x + 2*b[5]*y) / 15
        distance = field / np.maximum(np.hypot(gx, gy), 1e-8)
        green = np.clip(distance * density + .5, 0, 1)
        weights = dict(grass=green, paving=1-green)
    else:
        assert model['kind'] == 'horizontal-paving-sidewalk-asphalt-bands'
        top, bottom = model['upperBoundary'], model['lowerBoundary']
        upper = top[0] + top[1] * (xx - 30)
        lower = bottom[0] + bottom[1] * (xx - 30)
        assert np.all(lower > upper)
        above = np.clip((upper - yy) * density + .5, 0, 1)
        below = np.clip((yy - lower) * density + .5, 0, 1)
        weights = dict(paving=above, sidewalk=1-above-below, asphalt=below)
    # The original diamond is an isometric projection of one square ground cell.
    # Each density samples the genuine mother independently through that plane.
    u, v = xx / 60 + yy / 30 - .5, -xx / 60 + yy / 30 + .5
    accepted = isinstance(next(iter(swatches.values())), dict)
    result = np.zeros((*xx.shape, 3), float)
    for role, weight in weights.items():
        if accepted:
            rgba = swatches[role][density]
            sample = rgba[..., :3].astype(float)
            assert rgba.shape == (*xx.shape, 4)
            if contour_guard and role == 'grass':
                red, green, blue = np.moveaxis(sample, -1, 0)
                valid = (rgba[..., 3] == 255) & (distance > 0)
                valid &= (green-red >= contour_guard['minimumGreenRedDifference'])
                valid &= (green-blue >= contour_guard['minimumGreenBlueDifference'])
                assert valid.any(), 'The accepted region must contain actual grass material'
                distances, indices = ndimage.distance_transform_edt(~valid, return_indices=True)
                limit = contour_guard['maximumNativeDistance']
                transfer = (weight > 0) & (distance < limit) & ~valid & (distances <= limit*density)
                sample[transfer] = sample[tuple(indices[:, transfer])]
            result += sample * weight[..., None]
            continue
        material = swatches[role].astype(float)
        sample = np.stack([ndimage.map_coordinates(material[..., channel],
            [v * (material.shape[0]-1), u * (material.shape[1]-1)], order=1, mode='nearest')
            for channel in range(3)], axis=-1)
        sample += np.asarray(model['nativeRegionColors'][role]) - material.reshape(-1, 3).mean(0)
        result += sample * weight[..., None]
    if 'paleLowerRim' in model and not accepted:
        rim = model['paleLowerRim']
        distance = np.abs(yy - rim['center'])
        coverage = np.clip((rim['width'] / 2 - distance) * density + .5, 0, 1)
        result = result * (1-coverage[..., None]) + np.asarray(rim['color']) * coverage[..., None]
    return np.uint8(np.clip(np.rint(result), 0, 255))
