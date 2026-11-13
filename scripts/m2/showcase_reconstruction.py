"""Continuous visual contours inside unchanged native gameplay geometry."""
import hashlib
import numpy as np
from scipy import ndimage
from showcase_contours import coverage


POLICY = dict(schema='hd-extra-contours-v1', maximumNativeDistance=1, protectMainBlock=True)
COHERENT_POLICY = dict(schema='hd-coherent-member-extra-contours-v1', maximumNativeDistance=1,
                       protectMainBlock=True, protectInternalCuts=True)
ROCK_POLICY = dict(schema='hd-source-pinned-exposed-rock-contours-v1', maximumNativeDistance=1,
                   protectGroundContacts=True, protectInternalCuts=True)
SNOW_GROUND_POLICY = dict(schema='hd-source-pinned-raised-snow-ground-contacts-v1',
                         minimumChannel=170, maximumChroma=70, nativeNeighborhood=1)


def native_member_mask(native, layout, prepared):
    width, height = layout['bounds'][2:]
    mask = np.zeros((height, width), bool)
    for part in layout['parts']:
        image = next(image for image in native['images'] if image['subTile'] == part['subTile'])
        raw = (prepared / 'native' / image['file']).read_bytes()
        assert hashlib.sha256(raw).hexdigest() == image['rgbaSha256']
        pixels = np.frombuffer(raw, np.uint8).reshape(*image['logical'][::-1], 4)
        x, y, w, h = part['rect']
        assert [w, h] == image['logical']
        mask[y:y+h, x:x+w] |= pixels[..., 3] > 0
    return mask


def coherent_extra_alpha(original, image, density, whole_mask, rect,
                         exposed_rock=False, snow_ground=False):
    """Reconstruct exposed member contours while retaining opaque internal cuts."""
    mask = original[..., 3] > 0
    exact = np.uint8(mask.repeat(density, 0).repeat(density, 1)) * 255
    if not image['hasExtraData'] and not exposed_rock:
        return exact
    x, y, width, height = rect
    assert (height, width) == mask.shape
    boundary = ndimage.maximum_filter(whole_mask, 3) != ndimage.minimum_filter(whole_mask, 3)
    boundary = boundary[y:y+height, x:x+width]
    local_boundary = ndimage.maximum_filter(mask, 3) != ndimage.minimum_filter(mask, 3)
    yy, xx = np.indices(mask.shape)
    ox, oy = [-value for value in image['offset']]
    protected = (xx >= ox-1) & (xx < ox+image['block'][0]+1) & (yy >= oy-1) & (yy < oy+image['block'][1]+1)
    if snow_ground:
        rgb = original[..., :3].astype(np.int16)
        snow = mask & (rgb.min(2) >= SNOW_GROUND_POLICY['minimumChannel']) \
            & (np.ptp(rgb, axis=2) <= SNOW_GROUND_POLICY['maximumChroma'])
        protected |= ndimage.maximum_filter(snow, 3)
    if exposed_rock:
        rgb = original[..., :3].astype(np.int16)
        rock = mask & (rgb[..., 0]-rgb[..., 1] > 20) & (rgb[..., 0]-rgb[..., 2] > 35)
        protected &= ~ndimage.maximum_filter(rock, 3)
    permitted = (boundary & local_boundary & ~protected).repeat(density, 0).repeat(density, 1)
    reconstructed = coverage(whole_mask, density)[y*density:(y+height)*density, x*density:(x+width)*density]
    return np.where(permitted, reconstructed, exact).astype(np.uint8)


def continuous_water_detail(authored, native_anchor, density):
    """Use one broad sea color and new fine waves, without retail pixel grain."""
    active = native_anchor[..., 3] > 0
    assert active.any() and density in (2, 4)
    mean = native_anchor[..., :3][active].mean(0)
    values = authored.astype(float)
    detail = values - ndimage.gaussian_filter(values, (2*density, 2*density, 0))
    return np.uint8(np.clip(mean + np.clip(detail, -8, 14)*.28, 0, 255))


def continuous_water_weight(ownership, active, density):
    """Rebuild water/land boundaries, never expose material at tile/void cuts."""
    exact = ownership.repeat(density, 0).repeat(density, 1).astype(float)
    land_contact = ndimage.binary_dilation(active & ~ownership, iterations=1) & active
    if not land_contact.any():
        return exact
    smooth = coverage(ownership, density).astype(float) / 255
    contact = land_contact.repeat(density, 0).repeat(density, 1)
    return np.where(contact, smooth, exact)


def extra_alpha(original, image, density):
    mask = original[..., 3] > 0
    exact = np.uint8(mask.repeat(density, 0).repeat(density, 1)) * 255
    if not image['hasExtraData']:
        return exact
    reconstructed = coverage(mask, density)
    yy, xx = np.indices(mask.shape)
    ox, oy = [-value for value in image['offset']]
    protected = (xx >= ox-1) & (xx < ox+image['block'][0]+1) & (yy >= oy-1) & (yy < oy+image['block'][1]+1)
    protected = protected.repeat(density, 0).repeat(density, 1)
    boundary = ndimage.maximum_filter(mask, 3) != ndimage.minimum_filter(mask, 3)
    permitted = boundary.repeat(density, 0).repeat(density, 1) & ~protected
    return np.where(permitted, reconstructed, exact).astype(np.uint8)


def verify_extra_alpha(alpha, original, image, density):
    assert alpha.shape == (original.shape[0]*density, original.shape[1]*density)
    expected = extra_alpha(original, image, density)
    assert np.array_equal(alpha, expected), 'Continuous extra contour differs from its bounded source policy'
