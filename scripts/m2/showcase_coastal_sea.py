"""Join new coastal-cliff artwork to the exact accepted independent sea material."""
import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.interpolate import PchipInterpolator

from showcase_materials import water_mask
from showcase_reconstruction import continuous_water_weight
from showcase_registration import sha
from showcase_snow_scope import admit_snow_scope
from showcase_newurban_coastal_scope import coastal_profile_indices, coastal_set_indices, bridge_floor_contacts


def original_floor_region(native, source, layout):
    floor = np.zeros(native.shape[:2], bool)
    for image in source['images']:
        if image['nativeOffset'] <= 0 or image['height'] != 0:
            continue
        x, y, width, height = next(part['rect'] for part in layout['parts']
                                  if part['subTile'] == image['subTile'])
        yy, xx = np.indices((height, width))
        ox, oy = image['offset']
        bw, bh = image['block']
        # Original raster rows include valid perimeter pixels outside an
        # analytic diamond. The original opaque pixels own that boundary.
        block = (xx+ox >= 0) & (xx+ox < bw) & (yy+oy >= 0) & (yy+oy < bh)
        floor[y:y+height, x:x+width] |= block
    return floor & (native[..., 3] > 0)


def original_floor_water(native, source, layout, reference_colors=(), protected_extra=None):
    floor = original_floor_region(native, source, layout)
    material = water_mask(native)
    for color in reference_colors:
        assert len(color) == 3 and all(0 <= int(value) <= 252 for value in color)
        material |= np.all(native[..., :3] == color, axis=2)
    candidate = floor & material
    if protected_extra is not None:
        assert protected_extra.shape == candidate.shape and protected_extra.dtype == bool
        candidate &= ~protected_extra
    active = native[..., 3] > 0
    boundary = ndimage.binary_dilation(~np.pad(active, 1))[1:-1, 1:-1] & active
    labels, count = ndimage.label(candidate)
    result = np.zeros_like(candidate)
    for index in range(1, count+1):
        component = labels == index
        if component.sum() >= 8 and (component & boundary).any():
            result |= component
    return result


def disconnected_coastal_water(mask):
    """Require an actual transparent gap between source water and dry artwork."""
    water = mask['water']
    body = mask['active'] & ~water
    return bool(water.any() and body.any()
        and not (ndimage.binary_dilation(water, structure=np.ones((3, 3), bool)) & body).any())


def snow_coastal_extra_coverage(source, layout, declaration):
    """Retain original ice extra-data ownership where it overlaps a sea block."""
    assert source['theater'] == 'SNOW' and source['editions'] == ['yr']
    assert declaration['schema'] == 'yr-source-snow-coastal-extra-ownership-v1'
    return native_coastal_extra_coverage(source, layout, declaration)


def bridge_coastal_extra_coverage(source, layout, declaration):
    """Protect original concrete faces where height-zero water blocks overlap."""
    indices = coastal_set_indices(source)
    assert indices == dict.fromkeys(['ovrps07.ubn', 'ovrps09.ubn', 'ovrps12.ubn'], 19)
    assert declaration['schema'] == 'yr-source-newurban-bridge-extra-ownership-v1'
    return native_coastal_extra_coverage(source, layout, declaration, bridge=True)


def native_coastal_extra_coverage(source, layout, declaration, bridge=False, partial_main=False):
    assert not (bridge and partial_main)
    assert declaration['members'] == {m['member']: m['native']['sha256'] for m in source['members']}
    prepared = Path(declaration['preparedDirectory'])
    assert sha(prepared / 'source.json') == source['preparedSourceSha256']
    masks = {}
    for member in source['members']:
        name, native = member['member'], member['native']
        raw_file = Path(declaration['originalTmpDirectory']) / name
        assert sha(raw_file) == native['sha256']
        raw = raw_file.read_bytes()
        info = layout[name]
        mask = np.zeros(tuple(info['bounds'][2:][::-1]), bool)
        for part in info['parts']:
            image = native['images'][part['subTile']]
            offset, = struct.unpack_from('<i', raw, 16+4*image['subTile'])
            assert offset == image['nativeOffset']
            if offset <= 0:
                continue
            rgba_file = prepared / 'native' / image['file']
            assert sha(rgba_file) == image['rgbaSha256']
            rgba = np.frombuffer(rgba_file.read_bytes(), np.uint8).reshape(*image['logical'][::-1], 4)
            active = rgba[..., 3] > 0
            extra = np.zeros(active.shape, bool)
            if image['hasExtraData']:
                x, y = struct.unpack_from('<ii', raw, offset)
                ex, ey, ew, eh, flags = struct.unpack_from('<iiiiI', raw, offset+20)
                assert [ex, ey, ew, eh] == image['extra'] and flags & 1
                start = offset+52+(image['block'][0]*image['block'][1]//2)*(1+int(bool(flags & 2)))
                indices = np.frombuffer(raw, np.uint8, count=ew*eh, offset=start).reshape(eh, ew)
                dx, dy = max(0, ex-x), max(0, ey-y)
                width, height = min(ew, extra.shape[1]-dx), min(eh, extra.shape[0]-dy)
                assert min(width, height) > 0
                extra[dy:dy+height, dx:dx+width] = indices[:height, :width] > 0
            if (bridge or partial_main) and image['hasZData']:
                # A nonplanar bridge main block contains abutment material,
                # including rows whose Z values locally match flat water.
                count = image['block'][0]*image['block'][1]//2
                z = np.frombuffer(raw, np.uint8, count=count, offset=offset+52+count)
                cursor = 0
                ox, oy = image['offset']
                main = np.zeros_like(extra)
                nonplanar = False
                for row in range(image['block'][1]-1):
                    width = 4*min(row+1, image['block'][1]-row-1)
                    left = (image['block'][0]-width)//2
                    raised = z[cursor:cursor+width] != image['block'][1]-row-1
                    nonplanar |= bool(raised.any())
                    if partial_main:
                        extra[row-oy, left-ox:left-ox+width] |= raised
                    main[row-oy, left-ox:left-ox+width] = True
                    cursor += width
                assert cursor == count
                if bridge and nonplanar:
                    extra |= main
            px, py, width, height = part['rect']
            assert list(active.shape[::-1]) == [width, height]
            region = mask[py:py+height, px:px+width]
            region[active] = extra[active]
        masks[name] = mask
    return masks


def load_coastal_sea(profile, source, authoring):
    declaration = profile.get('sourcePinnedCoastalSea')
    if declaration is None:
        return {}, {}
    snow = source['theater'] == 'SNOW'
    snow_contract = None
    if snow:
        snow_contract, key, _ = admit_snow_scope(profile, source)
        assert key == 'sourcePinnedSnowCoastalContours'
        assert set(profile) <= {'continuousAuthoredRgb', 'authoredSurfaceReconstruction', 'sourcePinnedCoastalSea',
                                'sourcePinnedSnowCoastalContours', 'sourcePinnedSnowCoastalPlanarLight'}
    else:
        assert source['theater'] == 'NEWURBAN' and source['editions'] == ['yr']
    newurban_sets = {} if snow else coastal_profile_indices(profile, source)
    extension, set_index, palette_name = ('sno', 79, 'isosno.pal') if snow else ('ubn', 112, 'isoubn.pal')
    file = Path(declaration['file'])
    assert sha(file) == declaration['sha256']
    document = json.loads(file.read_text())
    assert document['schema'] == 'yr-source-pinned-coastal-sea-masks-v1'
    assert document['status'] == 'PASS_SOURCE_FLOOR_WATER_OWNERSHIP_NO_EXTRA_CLIFF_RECOLORING'
    assert document['nativeFloorPolicy'] == 'ORIGINAL_OPAQUE_PIXELS_WITHIN_MAIN_BLOCK_RECTANGLE'
    assert document['nativeColorPolicy'] == 'SOURCE_BLUE_CONTROLS_PLUS_PINNED_REFERENCE_WATER_COLORS'
    assert document['sourceRgbUsedAsTexture'] is False
    assert document['theater'] == source['theater']
    accepted = document['acceptedSea']
    if snow:
        assert accepted == snow_contract['acceptedSea']
    pin = document['referenceWaterColors']
    file = Path(pin['file'])
    assert sha(file) == pin['sha256']
    reference = json.loads(file.read_text())
    assert reference['schema'] == 'yr-original-water-palette-control-v1'
    assert reference['source'] == dict(member='water04.' + extension, sha256=accepted['sourceSha256'])
    assert reference['palette'] == dict(member=palette_name, sha256=document['paletteSha256'])
    assert 0 < len(reference['colors']) == len(reference['indices']) <= 256
    members = {member['member']: member for member in source['members']}
    assert set(document['members']) == set(members)
    layout = json.loads((Path(authoring) / 'layout.json').read_text())
    if snow:
        extra = snow_coastal_extra_coverage(source, layout, document['nativeExtraOwnership'])
    elif set(newurban_sets) == {'ovrps07.ubn', 'ovrps09.ubn', 'ovrps12.ubn'}:
        extra = bridge_coastal_extra_coverage(source, layout, document['nativeExtraOwnership'])
    else:
        assert 'nativeExtraOwnership' not in document
        extra = {}
    masks = {}
    for name, entry in document['members'].items():
        native = members[name]['native']
        if snow:
            assert name.startswith('wclifx') and name.endswith('.' + extension) and native['setIndex'] == set_index
        else:
            assert native['setIndex'] == newurban_sets[name]
        assert entry['sourceSha256'] == native['sha256']
        assert entry['paletteSha256'] == native['palette']['sha256'] == document['paletteSha256']
        image = Path(authoring) / (name + '-native.png')
        assert sha(image) == entry['nativeAssemblySha256']
        rgba = np.asarray(Image.open(image).convert('RGBA'))
        mask_file = Path(entry['file'])
        assert sha(mask_file) == entry['sha256']
        values = np.frombuffer(mask_file.read_bytes(), np.uint8).reshape(rgba.shape[:2])
        assert list(rgba.shape[1::-1]) == entry['logical'] and np.all(values <= 1)
        mask = values != 0
        assert int(mask.sum()) == entry['waterPixels'] > 0
        assert not (mask & (rgba[..., 3] == 0)).any()
        assert np.array_equal(mask, original_floor_water(rgba, native, layout[name], reference['colors'], extra.get(name)))
        assert entry['sourceRgbUsedAsTexture'] is False
        masks[name] = dict(water=mask, active=rgba[..., 3] > 0)
        if contact := entry.get('shoreContact'):
            if name in {'ovrps07.ubn', 'ovrps09.ubn', 'ovrps12.ubn'}:
                assert contact == bridge_floor_contacts(source)[name]
            else:
                assert name in {'wclifx28.ubn', 'wclifx26.ubn', 'wclifb01.ubn', 'wclifb05.ubn'}
            assert contact['sourceSha256'] == native['sha256']
            assert contact['schema'] == 'yr-source-bound-coastal-shore-contact-v1'
            assert contact['maximumNativeRoleDeviation'] == 6
            assert contact['waterSide'] == ('above' if name == 'wclifb05.ubn' else 'below')
            masks[name].update(shoreContact=contact,
                floor=original_floor_region(rgba, native, layout[name]))
    root = Path('.local/terrain-packs') / accepted['selection']['revision']
    assert sha(root / 'manifest.json') == accepted['selection']['sha256']
    manifest = json.loads((root / 'manifest.json').read_text())
    assert manifest['theater'] == source['theater']
    group, = [group for group in manifest['groups'] if group['id'] == accepted['group']]
    cursor = 0
    for member in group['members']:
        if member['member'] == accepted['member']:
            break
        cursor += len(member['images'])
    assert member['member'] == accepted['member'] == 'water04.' + extension
    assert member['sourceHashes']['yr'] == accepted['sourceSha256']
    assert accepted['subTile'] == 0 and accepted['nativeInterior'] == [15, 8, 30, 14]
    water = {}
    for density in [2, 4]:
        variant, = [variant for variant in group['variants'] if variant['density'] == density]
        file = root / variant['file']
        assert sha(file) == variant['sha256']
        atlas = np.memmap(file, dtype=np.uint8, mode='r', shape=(*variant['size'][::-1], 4))
        x, y, width, height = variant['rects'][cursor]
        assert [width, height] == [60*density, 30*density]
        ix, iy, iw, ih = [value*density for value in accepted['nativeInterior']]
        pixels = atlas[y+iy:y+iy+ih, x+ix:x+ix+iw]
        assert pixels.shape == (ih, iw, 4) and pixels[..., 3].min() == 255
        water[density] = pixels[..., :3].copy()
    return masks, water


def coastal_sea_pixels(water, shape, density):
    assert density in (2, 4)
    pixels = water[density]
    assert pixels.shape == (14*density, 30*density, 3)
    yy, xx = np.indices(shape)
    return pixels[yy % pixels.shape[0], xx % pixels.shape[1]]


def coastal_sea_weight(mask, density):
    weight = continuous_water_weight(mask['water'], mask['active'], density)
    if contact := mask.get('shoreContact'):
        return shore_contact_weight(weight, mask, contact, density)
    return weight


def shore_contact_weight(weight, mask, contact, density):
    """Reconstruct a source beach contact while retaining floor and cliff roles."""
    assert density in (2, 4) and contact['waterSide'] in ('above', 'below')
    below = contact['waterSide'] == 'below'
    assert contact['interpolation'] == 'monotone-cubic'
    points = np.asarray(contact['controlPoints'], float)
    assert points.ndim == 2 and points.shape[1] == 2 and len(points) >= 3
    assert np.all(np.diff(points[:, 0]) > 0)
    x, y, width, height = contact['nativeRect']
    assert all(type(value) is int for value in contact['nativeRect'])
    assert min(x, y) >= 0 and min(width, height) > 0
    assert points[0, 0] == x and points[-1, 0] == x+width
    assert x+width <= mask['water'].shape[1] and y+height <= mask['water'].shape[0]
    curve = PchipInterpolator(points[:, 0], points[:, 1], extrapolate=False)
    yy, xx = np.indices(mask['water'].shape)
    domain = (xx >= x) & (xx < x+width) & (yy >= y) & (yy < y+height) & mask['floor']
    classified = yy+.5 >= curve(np.clip(xx+.5, x, x+width))
    if not below:
        classified = ~classified
    changed = domain & (classified != mask['water'])
    inside_distance = ndimage.distance_transform_edt(mask['water'])
    outside_distance = ndimage.distance_transform_edt(~mask['water'])
    limit = contact['maximumNativeRoleDeviation']
    assert 0 < limit <= 6
    assert np.all(np.where(mask['water'], inside_distance, outside_distance)[changed] <= limit), \
        'Shore contact exceeds its original role-boundary neighborhood'
    # Supersampling covers only the analytic material join. Neither material
    # RGB nor the original alpha, height, depth or subtile geometry is filtered.
    py, px = np.indices(weight.shape)
    coverage = np.zeros(weight.shape, float)
    for sy in range(8):
        for sx in range(8):
            ax = (px+(sx+.5)/8)/density
            ay = (py+(sy+.5)/8)/density
            classified_sample = ay >= curve(np.clip(ax, x, x+width))
            coverage += classified_sample if below else ~classified_sample
    coverage /= 64
    return np.where(domain.repeat(density, 0).repeat(density, 1), coverage, weight)


def render_coastal_sea(rgb, mask, water, density):
    assert rgb.shape[:2] == tuple(n*density for n in mask['water'].shape)
    weight = coastal_sea_weight(mask, density)[..., None]
    sea = coastal_sea_pixels(water, rgb.shape[:2], density)
    return np.uint8(np.clip(np.rint(rgb*(1-weight) + sea*weight), 0, 255))
