"""Continuous new material plus native contact and bounded owner-color semantics."""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from newurban_batch89_io import read
from newurban_rubble_r1_materials import register_subjects

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_contours import coverage
from showcase_owner import register_owner_material
from showcase_registration import capacity, independently_sample


def authored_frame(material, indices, bounds, palette, density, body=False):
    left, top, right, bottom = bounds
    height, width = indices.shape
    sampled = independently_sample(material['plate'], ((right - left) * density, (bottom - top) * density))
    alpha = np.asarray(material['alpha'].resize((sampled.shape[1], sampled.shape[0]), Image.Resampling.LANCZOS))
    native_body = indices != 0
    if body:
        native_body &= (indices != 12) & ~((indices >= 16) & (indices <= 31))
    mean = palette[indices][native_body].mean(0)
    authored_mean = sampled[alpha >= 180].mean(0)
    gain = .25 + .75 * mean / np.maximum(authored_mean, 1)
    rgb = np.uint8(np.clip(sampled.astype(float) * gain, 0, 255))
    rgba = np.zeros((height * density, width * density, 4), np.uint8)
    rgba[top * density:bottom * density, left * density:right * density] = np.dstack((rgb, alpha))
    data = np.zeros_like(rgba)
    data[..., 3] = 255
    evidence = dict(policy='CONTINUOUS_AUTHORED_ALPHA_AND_UNIFORM_RGB_GAIN_NO_OLD_BODY_MASK',
        nativeMean=mean.tolist(), authoredMean=authored_mean.tolist(), gain=gain.tolist(),
        nativeRgbBodyPixelsCopied=0, nativeBodyMaskStampedIntoVisual=False, nativeContactPixels=0)
    if body:
        native_rgba = np.dstack((palette[indices], (indices != 0).astype(np.uint8) * 255)).astype(np.uint8)
        rgba[..., :3], changed = register_owner_material(rgba[..., :3], native_rgba, indices, density)
        owner = (indices >= 16) & (indices <= 31)
        mask = coverage(owner, density, linear_strips=True)
        mask[rgba[..., 3] == 0] = 0
        if owner.any():
            nearest = ndimage.distance_transform_edt(~owner, return_distances=False, return_indices=True)
            shades = (indices[tuple(nearest)] - 16).repeat(density, 0).repeat(density, 1)
            data[..., 0] = mask
            data[..., 1] = np.where(mask > 0, shades, 0)
        contact = (indices == 12).repeat(density, 0).repeat(density, 1)
        rgba[contact] = [*palette[12], 255]
        data[contact] = [0, 0, 0, 255]
        evidence.update(nativeContactPixels=int((indices == 12).sum()),
            nativeContactPolicy='Exact original index-12 contact cells; separate shadow frames remain Original.',
            ownerPolicy='Only bounded subpixel reconstruction of native indices 16-31; nearest native shade.',
            nativeOwnerArea=int(owner.sum()), ownerArea=float(mask.sum() / 255 / density ** 2),
            authoredOwnerSpillNormalizedPixels=int(changed.sum()))
    rgba[..., :3][rgba[..., 3] == 0] = 0
    return rgba, data, evidence
