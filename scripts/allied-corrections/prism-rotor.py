"""Project accepted crown materials on rigid petals about a fixed native axis."""
import math
import numpy as np
from PIL import Image

PIVOT = (85.5, 33.0)
ELEVATION = math.radians(30)


def material(master, quad):
    # Surface UVs are registered once, independently of animation phase.
    return np.array(master.convert('RGB').transform((128, 256), Image.Transform.QUAD,
        tuple(v * 4 for point in quad for v in point), Image.Resampling.BICUBIC))


def render(master, phase, density, quads=None, damaged=False):
    scale = density * 2
    size = (172 * scale, 160 * scale)
    pixels = np.zeros((size[1], size[0], 4), np.uint8)
    depth = np.full(size[::-1], -np.inf)
    quads = quads or {
        'front': [(78.4, 17.1), (79.0, 30.1), (84.1, 30.8), (83.6, 17.8)],
        'top': [(78.1, 14.8), (78.4, 17.1), (83.6, 17.8), (84.4, 15.4)],
        'side': [(84.4, 17.1), (84.5, 29.3), (87.1, 27.5), (87.2, 15.2)],
    }
    textures = {name: material(master, quad) for name, quad in quads.items()}
    angle = phase * math.tau / 64
    rotation = np.array([[math.cos(angle), -math.sin(angle), 0],
                         [math.sin(angle), math.cos(angle), 0], [0, 0, 1]])
    tilt = math.radians(18 if damaged else 0)
    lean = np.array([[math.cos(tilt), 0, -math.sin(tilt)], [0, 1, 0],
                     [math.sin(tilt), 0, math.cos(tilt)]])
    pivot = (79.5, 33.0) if damaged else PIVOT

    def face(vertices, name, brightness=1):
        v = np.array(vertices) @ rotation.T @ lean.T
        projected = np.column_stack((pivot[0] + v[:, 0],
            pivot[1] + v[:, 1] * math.sin(ELEVATION) - v[:, 2] * math.cos(ELEVATION))) * scale
        z = v[:, 1] * math.cos(ELEVATION) + v[:, 2] * math.sin(ELEVATION)
        uv = np.array([[0, 0], [1, 0], [1, 1], [0, 1]])
        for ids in ((0, 1, 2), (0, 2, 3)):
            tri = projected[list(ids)]
            left, top = np.maximum(0, np.floor(tri.min(0)).astype(int))
            right, bottom = np.minimum(size, np.ceil(tri.max(0)).astype(int) + 1)
            if right <= left or bottom <= top: continue
            yy, xx = np.mgrid[top:bottom, left:right]
            points = np.stack((xx + .5, yy + .5, np.ones_like(xx)), axis=-1)
            matrix = np.vstack((tri.T, np.ones(3)))
            if abs(np.linalg.det(matrix)) < 1e-7: continue
            weights = points @ np.linalg.inv(matrix).T
            dz = weights @ z[list(ids)]
            cover = (weights >= -1e-8).all(-1) & (dz > depth[top:bottom, left:right])
            st = weights @ uv[list(ids)]
            tex = textures[name]
            tx = np.clip(st[..., 0] * (tex.shape[1] - 1), 0, tex.shape[1] - 1).astype(int)
            ty = np.clip(st[..., 1] * (tex.shape[0] - 1), 0, tex.shape[0] - 1).astype(int)
            patch = pixels[top:bottom, left:right]
            patch[..., :3][cover] = np.clip(tex[ty, tx][cover] * brightness, 0, 255).astype(np.uint8)
            patch[..., 3][cover] = 255
            depth[top:bottom, left:right][cover] = dz[cover]

    def radial(r, tangent, height, theta):
        return (r * math.cos(theta) - tangent * math.sin(theta),
                r * math.sin(theta) + tangent * math.cos(theta), height)

    # Eight identical accepted prism petals expose different faces and occlude
    # one another. Eight native phases cover one 45-degree symmetry period.
    for petal in range(8):
        theta = math.tau * petal / 8
        spread = 1.22 if damaged else 1
        coords = [(15*spread, -2.1, 25), (15*spread, 2.1, 25), (10*spread, 1.8, 9), (10*spread, -1.8, 9),
                  (5.5, -1.5, 27), (5.5, 1.5, 27), (4.2, 1.2, 11), (4.2, -1.2, 11)]
        vertices = [radial(*p, theta) for p in coords]
        for ids, texture in (((0, 1, 2, 3), 'front'), ((4, 5, 1, 0), 'top'),
                             ((0, 3, 7, 4), 'side'), ((1, 5, 6, 2), 'side'), ((5, 4, 7, 6), 'side')):
            face([vertices[i] for i in ids], texture)
    # The central axle uses the accepted dark metal surface and shares its axis.
    for segment in range(16):
        a, b = math.tau * segment / 16, math.tau * (segment + 1) / 16
        face([(3 * math.cos(a), 3 * math.sin(a), 23), (3 * math.cos(b), 3 * math.sin(b), 23),
              (3 * math.cos(b), 3 * math.sin(b), 0), (3 * math.cos(a), 3 * math.sin(a), 0)], 'side')
    return Image.fromarray(pixels).convert('RGBa').resize((172 * density, 160 * density),
        Image.Resampling.LANCZOS).convert('RGBA')
