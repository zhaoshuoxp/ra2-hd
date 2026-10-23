"""Ray-project solid crusher spheres and radial cuboid teeth about their axles."""
from functools import lru_cache
import numpy as np
from PIL import Image
from scipy import ndimage
from production_common import ROOT, sha
from crusher_spin import RIGHT, UP, VIEW, LIGHT, axle_rotation

TEXTURE = ROOT / 'feedback-r6/crusher-brass-diffuse-raw.png'


@lru_cache(maxsize=1)
def material():
    return np.array(Image.open(TEXTURE).convert('RGB')).astype(float)


def shade(points, normals, axis, inward, tooth=-1, damage=False, uv=None, faces=None):
    texture = material()
    if tooth < 0:
        u = (np.arctan2(points @ inward, points[:, 1]) / (2 * np.pi) + .5) % 1
        v = np.arccos(np.clip(points @ axis / .77, -1, 1)) / np.pi
    else:
        # Fine authored material covers each independently lit tooth face.
        u = (uv[:, 0] * .7 + tooth * .137) % 1
        v = (uv[:, 1] * .7 + tooth * .193) % 1
    colors = np.column_stack([ndimage.map_coordinates(texture[..., channel],
        [v * (texture.shape[0] - 1), u * (texture.shape[1] - 1)], order=1, mode='wrap')
        for channel in range(3)])
    if damage:
        colors *= .68
    if faces is not None:
        colors[faces != 2] *= .64
    diffuse = .38 + .64 * np.maximum(0, normals @ LIGHT)
    half = LIGHT + VIEW
    half /= np.linalg.norm(half)
    specular = np.maximum(0, normals @ half) ** 24
    colors = colors * diffuse[:, None] + specular[:, None] * [68, 58, 43]
    colors[:, 0] = np.minimum(colors[:, 0], 1.45 * np.maximum(colors[:, 1], colors[:, 2]))
    return np.uint8(np.clip(colors, 0, 255))


def solid_head(family, image, target, axis, hinge, phase, side, damage=False):
    period = 46 if damage else 47
    angle = 2 * np.pi * 5 * phase / period
    spin = axle_rotation(axis, angle)
    rotation = hinge @ spin
    center = np.mean(target, axis=0) * family.density
    radii = (np.max(target, axis=0) - np.min(target, axis=0)) * family.density / 2
    bounds = np.floor(np.r_[center - radii * 1.12, center + radii * 1.12]).astype(int)
    width, height = bounds[2] - bounds[0], bounds[3] - bounds[1]
    assert width > 0 and height > 0
    supersample = 2
    yy, xx = np.indices((height * supersample, width * supersample))
    u = (bounds[0] + (xx + .5) / supersample - center[0]) / radii[0]
    v = -(bounds[1] + (yy + .5) / supersample - center[1]) / radii[1]
    world_rays = u[..., None] * RIGHT + v[..., None] * UP + 3 * VIEW
    origins = world_rays.reshape(-1, 3) @ rotation
    direction = -VIEW @ rotation
    inward = np.cross(axis, [0., 1., 0.])
    inward /= np.linalg.norm(inward)
    count = len(origins)
    depth = np.full(count, np.inf)
    colors = np.zeros((count, 3), np.uint8)
    projection = origins @ direction
    discriminant = projection * projection - (np.sum(origins * origins, axis=1) - .77 ** 2)
    hits = discriminant >= 0
    depth[hits] = -projection[hits] - np.sqrt(discriminant[hits])
    points = origins[hits] + depth[hits, None] * direction
    normals = points / .77
    colors[hits] = shade(points, normals @ rotation.T, axis, inward, damage=damage)
    # Three staggered rings of eight solid teeth leave both axle ends clear.
    half_size = np.array([.12, .12, .13])
    for ring, axial in enumerate((-.46, 0., .46)):
        for index in range(8):
            theta = index * np.pi / 4 + (ring % 2) * np.pi / 8
            normal = axis * axial + np.sqrt(1 - axial * axial) * (
                np.array([0., 1., 0.]) * np.cos(theta) + inward * np.sin(theta))
            tangent = np.cross(axis, normal)
            tangent /= np.linalg.norm(tangent)
            basis = np.column_stack((tangent, np.cross(normal, tangent), normal))
            location = normal * .87
            local = (origins - location) @ basis
            ray = direction @ basis
            safe_ray = np.where(abs(ray) > 1e-10, ray, np.copysign(1e-10, ray + 1e-30))
            ta, tb = (-half_size - local) / safe_ray, (half_size - local) / safe_ray
            near_axis, far_axis = np.minimum(ta, tb), np.maximum(ta, tb)
            near, far = near_axis.max(axis=1), far_axis.min(axis=1)
            hit = (near >= 0) & (far >= near) & (near < depth)
            if not hit.any():
                continue
            points = origins[hit] + near[hit, None] * direction
            on_cube = (points - location) @ basis
            faces = near_axis[hit].argmax(axis=1)
            face_normals = basis[:, faces].T * np.sign(on_cube[np.arange(len(faces)), faces])[:, None]
            # A narrow bevel catches a highlight along actual adjacent faces.
            edge = np.maximum(0, abs(on_cube) / half_size - .82)
            bevel = (edge * np.sign(on_cube)) @ basis.T
            normals = face_normals + bevel * 1.5
            normals /= np.linalg.norm(normals, axis=1)[:, None]
            uv = np.empty((len(faces), 2))
            for face in (0, 1, 2):
                selected = faces == face
                coordinates = [i for i in (0, 1, 2) if i != face]
                uv[selected] = on_cube[selected][:, coordinates] / (2 * half_size[coordinates]) + .5
            colors[hit] = shade(points, normals @ rotation.T, axis, inward,
                                tooth=ring * 8 + index, damage=damage, uv=uv, faces=faces)
            depth[hit] = near[hit]
    pixels = np.zeros((count, 4), np.uint8)
    pixels[:, :3] = colors
    pixels[:, 3] = np.uint8(np.isfinite(depth)) * 255
    rendered = Image.fromarray(pixels.reshape(height * supersample, width * supersample, 4))
    rendered = rendered.convert('RGBa').resize((width, height), Image.Resampling.LANCZOS).convert('RGBA')
    result = image.copy()
    # Remove the old photograph's head before compositing the new volume;
    # stationary shaft ends and the separate cradle faces stay untouched.
    old = np.array(result)
    yy, xx = np.indices(old.shape[:2])
    local_x = (xx + .5 - center[0]) / radii[0]
    local_y = (yy + .5 - center[1]) / radii[1]
    remove = (abs(local_x) < 1.02) & (local_y > -1.05) & (local_y < 1.16)
    old[remove] = 0
    result = Image.fromarray(old)
    result.alpha_composite(rendered, tuple(bounds[:2]))
    texture = material()
    family.local_parts.append({'kind': 'crusher-axle-spin', 'phase': int(phase), 'side': side,
        'axis': axis.tolist(), 'spinAngleDegrees': float(np.rad2deg(angle)), 'spinRotation': spin.tolist(),
        'hingeRotation': hinge.tolist(), 'rotation': rotation.tolist(), 'source': str(TEXTURE),
        'sourceHash': sha(TEXTURE), 'density': family.density, 'upsampling': False,
        'sourceScale': [width / texture.shape[1], height / texture.shape[0]],
        'sphereDiameterScale': 1, 'wholeBuildingScale': [1, 1],
        'solidGeometry': {'sphereRadius': .77, 'teeth': 24, 'toothHalfSize': half_size.tolist(),
                          'depthVisibility': 'Nearest ray intersection of sphere and 24 radial cuboids'},
        'surface': 'Adequate authored brass texture on solid sphere and beveled tooth faces',
        'light': 'Fixed camera light; real face normals and geometry occlusion'})
    return result
