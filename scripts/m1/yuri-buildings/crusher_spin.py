"""Authored crusher surface rotating in three dimensions about its cradle axle."""
import numpy as np
from functools import lru_cache
from scipy import ndimage
from PIL import Image
from mechanical_common import registered_source
from production_common import sha

RIGHT = np.array([1., 0., -1.]) / np.sqrt(2)
UP = np.array([-1., 2., -1.]) / np.sqrt(6)
VIEW = np.array([1., 1., 1.]) / np.sqrt(3)
LIGHT = (-.45 * RIGHT + .65 * UP + .7 * VIEW)
LIGHT /= np.linalg.norm(LIGHT)


@lru_cache(maxsize=16)
def surface_colors(path, region, crop):
    raw = np.array(registered_source(path).crop(region).crop(crop))
    coverage = raw[..., 3] >= 240
    nearest = ndimage.distance_transform_edt(~coverage, return_distances=False, return_indices=True)
    return raw[nearest[0], nearest[1], :3]


def axle_rotation(axis, angle):
    cross = np.array([[0., -axis[2], axis[1]], [axis[2], 0., -axis[0]],
                      [-axis[1], axis[0], 0.]])
    return np.eye(3) * np.cos(angle) + (1 - np.cos(angle)) * np.outer(axis, axis) + np.sin(angle) * cross


def spin_surface(family, image, path, registration, ball, target, axis, hinge, phase, side):
    """Ray-project a rotating hemisphere, keeping fixed diameter and camera light.

    The approved studded metal is sampled from the full-resolution master.
    Its reverse hemisphere mirrors the available surface across the shaft;
    no screen-space rotation or per-frame fitting changes the head's shape.
    """
    angle = 2 * np.pi * 5 * phase / 47
    spin = axle_rotation(axis, angle)
    rotation = hinge @ spin
    bounds = image.getbbox()
    assert bounds
    original = np.array(image.crop(bounds))
    center = np.mean(target, axis=0) * family.density
    radii = (np.max(target, axis=0) - np.min(target, axis=0)) * family.density / 2
    yy, xx = np.indices(original.shape[:2])
    xx += bounds[0]
    yy += bounds[1]
    u, v = (xx + .5 - center[0]) / radii[0], -(yy + .5 - center[1]) / radii[1]
    disk = u * u + v * v
    visible = (disk < 1) & (original[..., 3] > 0)
    # Normals on the visible curved surface, followed back to the rotating
    # local metal. Features foreshorten at the limb and pass behind the head.
    normals = u[..., None] * RIGHT + v[..., None] * UP
    normals += np.sqrt(np.maximum(0, 1 - disk))[..., None] * VIEW
    local = normals[visible] @ rotation
    source_u, source_v = local @ RIGHT, local @ UP
    native_center = np.mean(ball, axis=0)
    native_radii = (np.max(ball, axis=0) - np.min(ball, axis=0)) / 2
    logical = np.column_stack((native_center[0] + source_u * native_radii[0],
                               native_center[1] - source_v * native_radii[1]))
    if side % 2:
        logical[:, 0] = 2 * native_center[0] - logical[:, 0]
    source = (logical * family.density - registration['physicalOffset']) / registration['scale']
    # A transparent source-edge texel cannot punch a hole in the solid metal.
    # Resolve it to the nearest authored material before surface sampling.
    colors = surface_colors(path, tuple(registration['sourceRegion']), tuple(registration['subjectCrop']))
    sampled = np.column_stack([ndimage.map_coordinates(colors[..., channel].astype(float),
        [source[:, 1], source[:, 0]], order=1, mode='nearest') for channel in range(3)])
    reflected = local.copy()
    back = reflected @ VIEW < 0
    reflected[back] -= 2 * (reflected[back] @ VIEW)[:, None] * VIEW
    original_light = .55 + .45 * np.maximum(0, reflected @ LIGHT)
    camera_light = .55 + .45 * np.maximum(0, normals[visible] @ LIGHT)
    sampled *= (camera_light / original_light)[:, None]
    original[..., :3][visible] = np.uint8(np.clip(sampled, 0, 255))
    family.local_parts.append({'kind': 'crusher-axle-spin', 'phase': int(phase), 'side': side,
        'axis': axis.tolist(), 'spinAngleDegrees': float(np.rad2deg(angle)), 'spinRotation': spin.tolist(),
        'hingeRotation': hinge.tolist(), 'rotation': rotation.tolist(), 'source': str(path),
        'sourceHash': sha(path), 'density': family.density, 'upsampling': False,
        'sourceScale': registration['scale'], 'sphereDiameterScale': 1, 'wholeBuildingScale': [1, 1],
        'surface': 'Full-resolution authored studded metal ray-projected on a rotating sphere; mirrored reverse hemisphere',
        'light': 'Fixed camera light; curved-surface features foreshorten and occlude at the limb'})
    result = family.blank()
    result.alpha_composite(Image.fromarray(original), bounds[:2])
    return result
