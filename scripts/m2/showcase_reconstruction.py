"""Continuous visual contours inside unchanged native gameplay geometry."""
import numpy as np
from scipy import ndimage
from showcase_contours import coverage


POLICY = dict(schema='hd-extra-contours-v1', maximumNativeDistance=1, protectMainBlock=True)


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
