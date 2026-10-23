"""Respect visible Iso-palette index 12 without applying unit embedded-shadow semantics."""
import numpy as np
from PIL import Image

from newurban_rubble_r1_materials import register_rubble
from showcase_registration import independently_sample


def register_iso_rubble(plate, indices, bounds, density, palette, authored_alpha):
    if not (indices == 12).any():
        return register_rubble(plate, indices, bounds, density, palette, authored_alpha)
    # Building.createRubbleObject uses isoPalette, with ordinary visible index 12.
    # The untouched native shadow slots are separate; black Unit-palette RGBA is not this body.
    assert palette[12].tolist() == [0, 124, 244]
    assert Image.fromarray((indices != 0).astype(np.uint8) * 255).getbbox() == tuple(bounds)
    height, width = indices.shape
    left, top, right, bottom = bounds
    rgb = np.zeros((height * density, width * density, 3), np.uint8)
    rgb[top * density:bottom * density, left * density:right * density] = independently_sample(
        plate, ((right - left) * density, (bottom - top) * density))
    body = indices != 0
    mask = body.repeat(density, 0).repeat(density, 1)
    native_mean, input_mean = palette[indices][body].mean(0), rgb[mask].mean(0)
    gain = .25 + .75 * native_mean / np.maximum(input_mean, 1)
    rgb[mask] = np.uint8(np.clip(rgb[mask] * gain, 0, 255))
    alpha = np.zeros((height * density, width * density), np.uint8)
    alpha[top * density:bottom * density, left * density:right * density] = np.asarray(
        authored_alpha.resize(((right - left) * density, (bottom - top) * density), Image.Resampling.LANCZOS))
    tone = dict(nativeMean=native_mean.tolist(), inputMean=input_mean.tolist(),
        outputMean=rgb[mask].mean(0).tolist(), gain=gain.tolist(), strength=.75, bodyPixels=int(mask.sum()))
    return np.dstack((rgb, alpha)), dict(tinyContinuousContours=0, tone=tone, nativeRgbCopiedPixels=0,
        coverage='AUTHORED_CONTINUOUS_RUBBLE_WITHIN_UNCHANGED_NATIVE_LOGICAL_BOUNDS',
        isoIndex12Policy='Visible blue Iso material, not embedded Unit ground shadow; continuous authored RGB/alpha.',
        isoIndex12NativeBodyPixels=int((indices == 12).sum()), separateNativeShadowSlotsUnchanged=True)
