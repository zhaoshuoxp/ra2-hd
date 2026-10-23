"""Register a fixed painted foundation and native-guided moving materials."""
import numpy as np
from PIL import Image, ImageDraw
from contourpy import contour_generator


def bounds(mask):
    y, x = np.where(mask)
    return (int(x.min()), int(y.min()), int(x.max() + 1), int(y.max() + 1)) if len(x) else None


def fit_rgba(image, size):
    return np.array(image.convert("RGBa").resize(size, Image.Resampling.LANCZOS).convert("RGBA"))


def foundation_canvas(image, box, canvas, density=4):
    x0, y0, x1, y1 = box
    fitted = fit_rgba(image, ((x1 - x0) * density, (y1 - y0) * density))
    result = np.zeros((canvas[1] * density, canvas[0] * density, 4), np.uint8)
    result[y0*density:y1*density, x0*density:x1*density] = fitted
    result[..., :3][result[..., 3] == 0] = 0
    return result


def place(image, box, canvas, density=4):
    """Place authored coverage in an explicit part rectangle, never sprite bounds."""
    x0, y0, x1, y1 = [round(v * density) for v in box]
    assert 0 <= x0 < x1 <= canvas[0] * density
    assert 0 <= y0 < y1 <= canvas[1] * density
    result = np.zeros((canvas[1] * density, canvas[0] * density, 4), np.uint8)
    result[y0:y1, x0:x1] = fit_rgba(image, (x1 - x0, y1 - y0))
    return result


def linearize(color):
    return np.where(color <= .04045, color / 12.92, ((color + .055) / 1.055) ** 2.4)


def encode(color):
    return np.where(color <= .0031308, color * 12.92, 1.055 * color ** (1 / 2.4) - .055)


def project_rgba(image, matrix, canvas, density=4):
    """Project one authored part with a source-to-native affine transform."""
    transform = np.eye(3)
    transform[:2] = np.asarray(matrix) * density
    inverse = np.linalg.inv(transform)[:2].ravel().tolist()
    result = image.convert("RGBa").transform(
        (canvas[0] * density, canvas[1] * density), Image.Transform.AFFINE,
        inverse, Image.Resampling.BICUBIC).convert("RGBA")
    rgba = np.array(result)
    rgba[..., :3][rgba[..., 3] == 0] = 0
    return rgba


def simplify_line(points, tolerance):
    """Keep geometric corners while removing retail raster stair steps."""
    if len(points) < 3:
        return points
    start, end = points[0], points[-1]
    direction = end - start
    if np.linalg.norm(direction) < 1e-9:
        distances = np.linalg.norm(points - start, axis=1)
    else:
        distances = np.abs(direction[0] * (start[1] - points[:, 1])
                           - direction[1] * (start[0] - points[:, 0])) / np.linalg.norm(direction)
    pivot = int(distances.argmax())
    if distances[pivot] <= tolerance:
        return points[[0, -1]]
    return np.concatenate((simplify_line(points[:pivot+1], tolerance)[:-1],
                           simplify_line(points[pivot:], tolerance)))


def vector_coverage(mask, density=4):
    """Rasterize smooth part polygons, retaining all genuine interior openings."""
    scale = density * 4
    contours = contour_generator(z=np.pad(mask.astype(float), 1)).lines(.5)
    coverage = np.zeros((mask.shape[0] * scale, mask.shape[1] * scale), bool)
    for contour in contours:
        points = contour[:-1] - .5
        if len(points) < 3:
            continue
        opposite = int(np.linalg.norm(points - points[0], axis=1).argmax())
        first = simplify_line(points[:opposite+1], .55)
        second = simplify_line(np.concatenate((points[opposite:], points[:1])), .55)
        polygon = np.concatenate((first[:-1], second[:-1]))
        if len(polygon) < 3:
            polygon = points
        layer = Image.new("1", (coverage.shape[1], coverage.shape[0]))
        ImageDraw.Draw(layer).polygon([tuple(point * scale) for point in polygon], fill=1)
        # Even/odd fill preserves cavities irrespective of winding direction.
        coverage ^= np.array(layer)
    return np.array(Image.fromarray(coverage.astype(np.uint8) * 255).resize(
        (mask.shape[1] * density, mask.shape[0] * density), Image.Resampling.LANCZOS))


def material_surface(texture, mask, density=4, vector=False):
    """Project authored texels onto one independently specified part surface."""
    box = bounds(mask)
    result = np.zeros((mask.shape[0] * density, mask.shape[1] * density, 4), np.uint8)
    if not box:
        return result
    x0, y0, x1, y1 = box
    size = ((x1 - x0) * density, (y1 - y0) * density)
    painted = fit_rgba(texture, size)
    local_mask = mask[y0:y1, x0:x1]
    coverage = vector_coverage(local_mask, density) if vector else np.array(
        Image.fromarray(local_mask.astype(np.uint8) * 255).resize(size, Image.Resampling.LANCZOS))
    painted[..., 3] = np.floor(painted[..., 3].astype(float) * coverage / 255 + .5).astype(np.uint8)
    painted[..., :3][painted[..., 3] == 0] = 0
    result[y0*density:y1*density, x0*density:x1*density] = painted
    return result


def over(foreground, background):
    front, back = foreground[..., 3:4] / 255, background[..., 3:4] / 255
    alpha = front + back * (1 - front)
    color = np.divide(linearize(foreground[..., :3] / 255) * front
                      + linearize(background[..., :3] / 255) * back * (1 - front),
                      alpha, out=np.zeros_like(foreground[..., :3], dtype=float), where=alpha > 0)
    return np.concatenate((np.clip(np.floor(encode(color) * 255 + .5), 0, 255).astype(np.uint8),
                           np.floor(alpha * 255 + .5).astype(np.uint8)), axis=2)


def encode_owner(painted, palette, allow_owner=True):
    """Encode authored red paint without changing neutral color or part coverage."""
    if not allow_owner:
        data = np.zeros_like(painted)
        data[..., 3] = 255
        return [painted.copy(), data]
    color = painted[..., :3].astype(float)
    tint = ((color[..., 0] > color[..., 1] * 2)
            & (color[..., 0] - np.maximum(color[..., 1], color[..., 2]) > 20)
            & (painted[..., 3] > 0))
    light = linearize(color / 255)
    floor = np.minimum(light[..., 1], light[..., 2])
    levels = linearize(palette[16:32, 0].astype(float) / 255)
    red = np.minimum(light[..., 0], levels.max())
    shade = np.argmin(np.where(levels[None, None] >= red[..., None],
                              levels[None, None] - red[..., None], 1000), axis=2)
    strength = np.clip((red - floor) / levels[shade], 0, 1)
    strength[~tint] = 0
    neutral = np.divide(floor, 1 - strength, out=np.zeros_like(floor), where=strength < .999)
    color[tint] = encode(np.clip(neutral[tint, None], 0, 1)) * 255
    base = painted.copy()
    base[..., :3] = np.clip(np.floor(color + .5), 0, 255).astype(np.uint8)
    base[..., :3][base[..., 3] == 0] = 0
    data = np.zeros_like(base)
    data[..., 0] = np.floor(strength * 255 + .5).astype(np.uint8)
    data[..., 1][tint] = shade[tint]
    data[..., 3] = 255
    return [base, data]
