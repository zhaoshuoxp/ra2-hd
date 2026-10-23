"""Remove authored owner-red spill while retaining exact retail remap regions."""
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, gaussian_filter

OWNER_SPILL_RADIUS = 32  # Covers displaced small trim/pump materials in native pixels.
RED_FRACTION = 0.22


def register_owner_material(rgb, native_rgba, indices, density):
    owner = (indices >= 16) & (indices <= 31)
    if not owner.any():
        return rgb.copy(), np.zeros(rgb.shape[:2], bool)
    valid = (indices != 0) & (indices != 12) & ~owner
    native = native_rgba[..., :3].astype(np.float32)
    native_red = (native[..., 0] - np.maximum(native[..., 1], native[..., 2])) / np.maximum(native[..., 0], 1)
    # Native brick, tile roofs, and the medical cross are fixed material colors.
    protected = native_red >= RED_FRACTION
    distance = distance_transform_edt(~owner)
    near = valid & ~protected & (distance <= OWNER_SPILL_RADIUS)
    near = np.repeat(np.repeat(near, density, axis=0), density, axis=1)
    authored = rgb.astype(np.float32)
    red = (authored[..., 0] - np.maximum(authored[..., 1], authored[..., 2])) / np.maximum(authored[..., 0], 1)
    native_red_hd = np.repeat(np.repeat(native_red, density, axis=0), density, axis=1)
    trim = valid & (distance <= 4) & (native_red >= RED_FRACTION) & (native_red < .65)
    trim = np.repeat(np.repeat(trim, density, axis=0), density, axis=1)
    # Bright authored paint on original subdued brick/rust can resemble stale team color.
    # Preserve native fixed-red hue, and constrain this adjustment to immediate trim.
    excess = trim & (red > native_red_hd + .12)
    changed = (near | excess) & (red >= RED_FRACTION) & (authored[..., 0] >= 40)
    if not changed.any():
        return rgb.copy(), changed
    # A normalized native chroma field excludes owner colors and transparency.
    # Preserve authored fine luminance instead of copying the low-resolution body.
    weights = gaussian_filter(valid.astype(np.float32), .65)
    guide = np.stack([gaussian_filter(native[..., c] * valid, .65) / np.maximum(weights, 1e-6)
                      for c in range(3)], axis=2)
    guide = np.asarray(Image.fromarray(np.uint8(np.clip(guide, 0, 255))).resize(
        (rgb.shape[1], rgb.shape[0]), Image.Resampling.BILINEAR)).astype(np.float32)
    luma_weights = np.array([.2126, .7152, .0722], np.float32)
    luma = authored @ luma_weights
    guide_luma = guide @ luma_weights
    neutral = guide * (luma / np.maximum(guide_luma, 1))[..., None]
    # Do not reintroduce neighboring red brick into a native non-red material cell.
    reference = np.repeat(np.repeat(native, density, axis=0), density, axis=1)
    max_red = np.maximum(reference[..., 1], reference[..., 2]) / np.maximum(reference[..., 0], 1)
    neutral[..., 0] = np.minimum(neutral[..., 0], np.maximum(neutral[..., 1], neutral[..., 2]) / np.maximum(max_red, .78))
    result = rgb.copy()
    result[changed] = np.uint8(np.clip(np.rint(neutral[changed]), 0, 255))
    return result, changed


def register_fixed_owner_trim(rgb, native_rgba, indices, density):
    """Restore dim fixed brick behind displaced CANEWY20 occupied window trim."""
    owner = (indices >= 16) & (indices <= 31)
    if not owner.any():
        return rgb.copy(), np.zeros(rgb.shape[:2], bool)
    valid = (indices != 0) & (indices != 12) & ~owner
    native = native_rgba[..., :3].astype(np.float32)
    weights = gaussian_filter(valid.astype(np.float32), .65)
    guide = np.stack([gaussian_filter(native[..., c] * valid, .65) / np.maximum(weights, 1e-6)
                      for c in range(3)], axis=2)
    guide = np.asarray(Image.fromarray(np.uint8(np.clip(guide, 0, 255))).resize(
        (rgb.shape[1], rgb.shape[0]), Image.Resampling.BILINEAR)).astype(np.float32)
    authored = rgb.astype(np.float32)
    red = (authored[..., 0] - authored[..., 1:].max(axis=2)) / np.maximum(authored[..., 0], 1)
    guide_red = (guide[..., 0] - guide[..., 1:].max(axis=2)) / np.maximum(guide[..., 0], 1)
    nearby = valid & (distance_transform_edt(~owner) <= 6)
    nearby = nearby.repeat(density, axis=0).repeat(density, axis=1)
    changed = nearby & (red >= RED_FRACTION) & (
        (authored[..., 0] > guide[..., 0] * 1.15 + 3) | (red > guide_red + .12))
    # Coarse material brightness must follow Original too: its dark red brick
    # otherwise protects bright displaced red window paint from chroma-only repair.
    luma = authored @ np.array([.2126, .7152, .0722], np.float32)
    detail = np.clip(luma / np.maximum(gaussian_filter(luma, .65 * density), 1), .75, 1.25)
    result = rgb.copy()
    result[changed] = np.uint8(np.clip(np.rint((guide * detail[..., None])[changed]), 0, 255))
    return result, changed
