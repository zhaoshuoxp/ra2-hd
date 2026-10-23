"""Solid central grinding column, separate from the four hinged crushers."""
from functools import lru_cache
import numpy as np
from PIL import Image
from crusher_spin import RIGHT, UP, VIEW, LIGHT, axle_rotation
from crusher_volume import material

# Fixed native-canvas bounds; only the column's azimuth changes.
BOUNDS = (150, 79, 169, 111)


@lru_cache(maxsize=192)
def column(density, phase, damaged=False, bounds=BOUNDS, logical_scale=9):
    x0, y0, x1, y1 = bounds
    width, height = (x1 - x0) * density, (y1 - y0) * density
    supersample = 2
    y, x = np.indices((height * supersample, width * supersample))
    scale = logical_scale * density
    u = (x / supersample + .25 - width / 2) / scale
    v = -(y / supersample + .25 - height / 2) / scale
    angle = 2 * np.pi * phase / (46 if damaged else 47)
    rotation = axle_rotation(np.array([0., 1., 0.]), angle)
    origins = (u[..., None] * RIGHT + v[..., None] * UP + 8 * VIEW).reshape(-1, 3) @ rotation
    direction = -VIEW @ rotation
    depth = np.full(len(origins), np.inf)
    colors = np.zeros((len(origins), 3), np.uint8)
    radial = [0, 2]
    a = np.dot(direction[radial], direction[radial])
    b = origins[:, radial] @ direction[radial]
    c = np.sum(origins[:, radial] ** 2, axis=1) - .73 ** 2
    discriminant = b * b - a * c
    hits = discriminant >= 0
    distances = (-b - np.sqrt(np.maximum(0, discriminant))) / a
    points = origins + distances[:, None] * direction
    hits &= abs(points[:, 1]) <= 1.67
    depth[hits] = distances[hits]
    normals = points[hits].copy(); normals[:, 1] = 0; normals /= .73
    texture = material()
    def paint(points, normals, brass):
        uv = np.column_stack(((np.arctan2(points[:, 0], points[:, 2]) / (2 * np.pi) + .5) % 1,
                              (points[:, 1] * .21 + .5) % 1))
        sampled = texture[(uv[:, 1] * (texture.shape[0] - 1)).astype(int),
                          (uv[:, 0] * (texture.shape[1] - 1)).astype(int)]
        world_normals = normals @ rotation.T
        if not brass:
            sampled = sampled.mean(axis=1)[:, None] * np.array([.4, .4, .38])
            # Machined ring seams rotate with the metal, while light stays fixed.
            seams = abs((points[:, 1] + 1.67) % .8 - .08) < .025
            sampled[seams] *= .55
        light = .32 + .7 * np.maximum(0, world_normals @ LIGHT)
        half = LIGHT + VIEW; half /= np.linalg.norm(half)
        specular = np.maximum(0, world_normals @ half) ** 22
        sampled = sampled * light[:, None] + specular[:, None] * [48, 43, 34]
        return np.uint8(np.clip(sampled * (.7 if damaged else 1), 0, 255))
    colors[hits] = paint(points[hits], normals, False)
    # Closed brass caps and four staggered rows of actual radial teeth.
    for cap in [-1.67, 1.67]:
        distance = (cap - origins[:, 1]) / direction[1]
        points = origins + distance[:, None] * direction
        hit = (distance > 0) & (distance < depth) & (np.sum(points[:, radial] ** 2, axis=1) <= .73 ** 2)
        normals = np.tile([0., np.sign(cap), 0.], (hit.sum(), 1))
        depth[hit] = distance[hit]; colors[hit] = paint(points[hit], normals, True)
    half_size = np.array([.12, .12, .16])
    for row, row_height in enumerate([-1.2, -.4, .4, 1.2]):
        for tooth in range(8):
            theta = tooth * np.pi / 4 + (row % 2) * np.pi / 8
            normal = np.array([np.sin(theta), 0., np.cos(theta)])
            tangent = np.array([np.cos(theta), 0., -np.sin(theta)])
            basis = np.column_stack((tangent, [0., 1., 0.], normal))
            center = normal * .82 + [0., row_height, 0.]
            local = (origins - center) @ basis; ray = direction @ basis
            ray = np.where(abs(ray) > 1e-10, ray, np.copysign(1e-10, ray + 1e-30))
            ta, tb = (-half_size - local) / ray, (half_size - local) / ray
            near_axis, far_axis = np.minimum(ta, tb), np.maximum(ta, tb)
            near, far = near_axis.max(axis=1), far_axis.min(axis=1)
            hit = (near > 0) & (far >= near) & (near < depth)
            points = origins[hit] + near[hit, None] * direction
            faces = near_axis[hit].argmax(axis=1)
            on_box = (points - center) @ basis
            normals = basis[:, faces].T * np.sign(on_box[np.arange(len(faces)), faces])[:, None]
            depth[hit] = near[hit]; colors[hit] = paint(points, normals, True)
    pixels = np.zeros((len(origins), 4), np.uint8); pixels[:, :3] = colors
    pixels[np.isfinite(depth), 3] = 255
    image = Image.fromarray(pixels.reshape(height * supersample, width * supersample, 4))
    return image.convert('RGBa').resize((width, height), Image.Resampling.LANCZOS).convert('RGBA')


def replace_column(frame, fixed, density, phase, damaged=False, owner=None):
    """Keep flattened foreground modules and native particles in front of the shaft."""
    bounds = tuple(v * density for v in BOUNDS)
    current = np.array(frame.crop(bounds)); resting = np.array(fixed.crop(bounds))
    visible = np.all(abs(current.astype(int) - resting.astype(int)) <= 2, axis=2)
    if owner is not None:
        visible &= np.array(owner.crop(bounds))[..., 0] == 0
    rotor = np.array(column(density, phase, damaged))
    # Old photographed protrusions outside the rotating silhouette become well shadow.
    old_metal = (resting[..., 3] > 240) & (resting[..., 0] > resting[..., 2] * 1.15)
    outside = visible & old_metal & (rotor[..., 3] < 8)
    current[outside, :3] = [27, 25, 21]
    alpha = rotor[..., 3].astype(float) / 255 * visible
    current[..., :3] = np.uint8(np.clip(current[..., :3] * (1 - alpha[..., None]) +
                                        rotor[..., :3] * alpha[..., None], 0, 255))
    result = frame.copy(); result.paste(Image.fromarray(current), bounds[:2])
    return result, dict(kind='central-column-vertical-spin', phase=phase, angleDegrees=float(
        360 * phase / (46 if damaged else 47)), axis=[0, 1, 0], bounds=list(BOUNDS),
        foregroundPixels=int((~visible).sum()), exposedPixels=int(visible.sum()),
        wholeBuildingScale=[1, 1], density=density)
