"""Calibrate authored structure contacts without restoring retail pixel texture."""
import numpy as np
from PIL import Image
from scipy import ndimage

from showcase_registration import extrude


def continuous_structure_contacts(authored, native, density, policy=None):
    """Remove generated cut-edge rims; retain independently painted interior detail."""
    assert density in (2, 4)
    if policy is None:
        sigma, width, amplitude = 2, 3, 18
    else:
        assert policy == dict(schema='continuous-natural-contact-v2', nativeColorSigma=.65,
            contactWidthNativePixels=8, detailAmplitude=8)
        sigma, width, amplitude = .65, 8, 8
    active = native[..., 3] > 0
    assert authored.shape == (active.shape[0] * density, active.shape[1] * density, 3)
    distance = ndimage.distance_transform_edt(np.pad(active, 1))[1:-1, 1:-1]
    # A continuous color field carries broad source lighting, never nearest-cell RGB.
    guide = extrude(native[..., :3].astype(float), active)
    guide = ndimage.gaussian_filter(guide, (sigma, sigma, 0))
    size = authored.shape[1::-1]
    field = np.stack([np.asarray(Image.fromarray(guide[..., c].astype(np.float32)).resize(
        size, Image.Resampling.BICUBIC)) for c in range(3)], axis=-1)
    values = authored.astype(float)
    detail = values - ndimage.gaussian_filter(values, (density, density, 0))
    # Sampling painted interior avoids copying the generated bevel into the contact.
    safe = (distance >= width).repeat(density, 0).repeat(density, 1)
    if not safe.any():
        return authored.copy(), dict(status='UNCHANGED_NO_INTERIOR')
    detail = extrude(detail, safe)
    corrected = field + np.clip(detail, -amplitude, amplitude)
    contact = np.clip((width - distance) / (width-1), 0, 1).astype(np.float32)
    weight = np.asarray(Image.fromarray(contact).resize(size, Image.Resampling.BILINEAR))
    weight = np.clip(weight, 0, 1)
    # Preserve full contact correction at the actual covered cut, not at a new outline.
    exact_edge = ((distance <= 1) & active).repeat(density, 0).repeat(density, 1)
    weight[exact_edge] = 1
    result = np.uint8(np.clip(values * (1 - weight[..., None]) + corrected * weight[..., None], 0, 255))
    before_dark = np.maximum(0, field.mean(2) - values.mean(2))[exact_edge]
    after_dark = np.maximum(0, field.mean(2) - result.astype(float).mean(2))[exact_edge]
    return result, dict(status='CONTINUOUS_DIFFUSE_CONTACT_WITH_AUTHORED_INTERIOR_DETAIL',
        edgePixels=int(exact_edge.sum()), changedPixels=int(np.any(result != authored, axis=2).sum()),
        nativeColorSigma=sigma, contactWidthNativePixels=width, detailAmplitude=amplitude, alphaChanged=False,
        beforeP95EdgeDarkening=float(np.percentile(before_dark, 95)),
        afterP95EdgeDarkening=float(np.percentile(after_dark, 95)))
