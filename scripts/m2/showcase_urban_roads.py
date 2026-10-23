"""Reconstruct continuous road material boundaries inside unchanged native TMP coverage."""
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from scipy.interpolate import UnivariateSpline


def sample_float(field, size):
    return np.asarray(Image.fromarray(field.astype(np.float32)).resize(size, Image.Resampling.BICUBIC))


def extend(values, active):
    indices = ndimage.distance_transform_edt(~active, return_distances=False, return_indices=True)
    result = values.copy()
    result[~active] = values[tuple(indices[:, ~active])]
    return result


def source_regions(native, precise_paint=False):
    colors = native[..., :3].astype(float)
    active = native[..., 3] > 0
    light = colors.mean(2)
    chroma = np.minimum(colors[..., 0], colors[..., 1]) - colors[..., 2]
    yellow = (np.abs(colors[..., 0] - colors[..., 1]) < 40) & (light < 180)
    road = extend(((light < 120) | ((chroma > 25) & yellow)) & active, active)
    road = ndimage.median_filter(road, size=3, mode='nearest')
    labels, _ = ndimage.label(road & active, structure=np.ones((3, 3)))
    counts = np.bincount(labels.ravel())
    minimum = max(12, int((road & active).sum() * .015))
    road = extend((labels > 0) & (counts[labels] >= minimum), active)
    paint = (chroma > 9) & yellow
    paint &= active & ndimage.binary_erosion(road, border_value=1)
    if precise_paint:
        # Urban olive paint uses near-equal red/green source shades. Brown
        # weathering at the curb is material wear, never a new yellow marking.
        core = paint & (ndimage.distance_transform_edt(road) >= 3)
        seeds = core & (np.abs(colors[..., 0] - colors[..., 1]) <= 8) & (chroma > 15)
        strokes, count = ndimage.label(ndimage.binary_dilation(core, iterations=2))
        paint = np.zeros_like(paint)
        for stroke in range(1, count + 1):
            original = core & (strokes == stroke)
            # Keep the whole source stroke, including its brown worn sections;
            # filtering individual colors would break a legitimate centerline.
            if (seeds & original).sum() >= max(3, original.sum() * .2):
                paint |= original
    labels, _ = ndimage.label(paint)
    counts = np.bincount(labels.ravel())
    paint &= counts[labels] >= 3
    return active, road, extend(paint, active)


def continuous_coverage(mask, active, density, return_distance=False):
    """Smooth source stair steps, retain area, and rasterize an actual one-pixel edge."""
    size = (mask.shape[1] * density, mask.shape[0] * density)
    if not (mask & active).any():
        return np.zeros(size[::-1], float)
    if (mask | ~active).all():
        return np.ones(size[::-1], float)
    padded = np.pad(mask, 16, mode='edge')
    distance = ndimage.distance_transform_edt(padded) - ndimage.distance_transform_edt(~padded)
    field = ndimage.gaussian_filter(distance, 1.5)[16:-16, 16:-16]
    sampled = sample_float(field, size)
    valid = active.repeat(density, 0).repeat(density, 1)
    target = int((mask & active).sum()) * density ** 2
    low, high = float(sampled.min()) - 1, float(sampled.max()) + 1
    for _ in range(32):
        threshold = (low + high) / 2
        area = np.clip((sampled - threshold) * density + .5, 0, 1)[valid].sum()
        if area > target:
            low = threshold
        else:
            high = threshold
    field = sampled - (low + high) / 2
    coverage = np.clip(field * density + .5, 0, 1)
    return (coverage, field) if return_distance else coverage


def material_field(colors, mask, active, size):
    valid = mask & active
    assert valid.any(), 'Road material must have a native color authority'
    weight = ndimage.gaussian_filter(valid.astype(float), 2)
    field = np.stack([ndimage.gaussian_filter(colors[..., channel] * valid, 2)
                      / np.maximum(weight, 1e-6) for channel in range(3)], axis=-1)
    field = extend(field, weight > .02)
    return np.stack([sample_float(field[..., channel], size) for channel in range(3)], axis=-1)


def paint_strokes(mask, active, density):
    """Fit the existing paint centerlines, retaining their endpoints and separate strokes."""
    canvas = Image.new('L', (mask.shape[1] * 8, mask.shape[0] * 8))
    draw = ImageDraw.Draw(canvas)
    labels, count = ndimage.label(ndimage.binary_dilation(mask & active, iterations=2))
    for label in range(1, count + 1):
        yy, xx = np.where(mask & active & (labels == label))
        if len(xx) < 3:
            continue
        points = np.stack([xx + .5, yy + .5], axis=1)
        center = points.mean(0)
        _, _, axes = np.linalg.svd(points - center, full_matrices=False)
        coordinates = (points - center) @ axes.T
        bins = np.round(coordinates[:, 0]).astype(int)
        positions = sorted(set(bins))
        u = np.array([coordinates[bins == value, 0].mean() for value in positions])
        v = np.array([np.median(coordinates[bins == value, 1]) for value in positions])
        if len(u) < 3 or np.ptp(u) < 2:
            radius = min(1, np.sqrt(len(points) / np.pi)) * 8
            x, y = center * 8
            draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=255)
            continue
        curve = UnivariateSpline(u, v, k=min(3, len(u) - 1), s=len(u) * .18)
        samples = np.linspace(u[0], u[-1], max(8, int(np.ptp(u) * 8)))
        line = np.stack([samples, curve(samples)], axis=1) @ axes + center
        length = np.linalg.norm(np.diff(line, axis=0), axis=1).sum()
        width = np.clip(len(points) / max(length, 1), .65, 1.25)
        draw.line([tuple(point * 8) for point in line], fill=255, width=max(1, round(width * 8)))
    size = (mask.shape[1] * density, mask.shape[0] * density)
    return np.asarray(canvas.resize(size, Image.Resampling.LANCZOS)).astype(float) / 255


def temperate_material(master, size, density, target, contrast):
    """Retain authored wear and RGB aggregate instead of reducing it to gray grain."""
    pixels = np.asarray(Image.fromarray(master).resize(size, Image.Resampling.LANCZOS)).astype(float)
    diffuse = ndimage.gaussian_filter(pixels, (12 * density, 12 * density, 0))
    detail = pixels - diffuse
    scale = contrast / max(detail.mean(2).std(), 1)
    return np.asarray(target) + np.clip(detail * scale, -65, 65)


def register_urban_road(authored, native, density, materials, style=None, geometry=None):
    """Keep authored detail continuous; never restore retail RGB at cell or subtile cuts."""
    assert density in (2, 4) and authored.shape[:2] == tuple(n * density for n in native.shape[:2])
    active, road, paint = source_regions(native, precise_paint=style is not None)
    assert (road & active).any() and (~road & active).any()
    size = authored.shape[1::-1]
    colors = native[..., :3].astype(float)
    if geometry is None:
        coverage, distance = continuous_coverage(road, active, density, return_distance=True)
        curb_coverage = np.clip((distance + 1.1) * density + .5, 0, 1) - coverage
    else:
        from showcase_road_geometry import render_geometry
        assert geometry['logical'] == list(native.shape[1::-1])
        coverage, curb_coverage = render_geometry(geometry['contours'], native.shape[:2], density)
    asphalt = material_field(colors, road & ~paint, active, size)
    paving = material_field(colors, ~road, active, size)
    details = {}
    for role in ('asphalt', 'paving'):
        master = materials[role]
        assert master.shape[1] >= size[0] and master.shape[0] >= size[1]
        pixels = np.asarray(Image.fromarray(master).resize(size, Image.Resampling.LANCZOS)).astype(float)
        luminance = pixels.mean(2)
        residual = luminance - ndimage.gaussian_filter(luminance, .8 * density)
        details[role] = np.tanh(residual / 16) * 12
    # Substantial independent builtin grain remains separate from source geometry.
    asphalt += details['asphalt'][..., None]
    paving += details['paving'][..., None]
    if style is not None:
        assert style['policy'] == 'ACCEPTED_TEMPERATE_WORN_MATERIALS_V1'
        # The accepted road controls material language; Urban still owns every
        # road boundary, native marking, broad shadow and elevation change.
        for role, mask in [('asphalt', road & ~paint), ('paving', ~road)]:
            original = material_field(colors, mask, active, size)
            valid = (mask & active).repeat(density, 0).repeat(density, 1)
            light = original - original[valid].mean(0)
            material = temperate_material(materials[role], size, density,
                style['targets'][role]['mean'], style['targets'][role]['contrast'])
            material += light * .35
            if role == 'asphalt':
                asphalt = material
            else:
                paving = material
    result = paving * (1 - coverage[..., None]) + asphalt * coverage[..., None]
    # Retain the source's pale road edging as a continuous narrow curb, rather
    # than restoring a stair-stepped strip of retail RGB at every subtile cut.
    edge = active & ~road & ndimage.binary_dilation(road, iterations=2)
    if edge.any():
        original_edge = colors[edge]
        highlight = np.maximum(np.quantile(original_edge, .8, axis=0) - original_edge.mean(0), 0)
        curb = paving + np.minimum(highlight, 20)
        result = result * (1 - curb_coverage[..., None]) + curb * curb_coverage[..., None]
    if (paint & active).any():
        stripe = material_field(colors, paint, active, size) + details['asphalt'][..., None] * .15
        if style is not None:
            valid = (paint & active).repeat(density, 0).repeat(density, 1)
            stripe = np.asarray(style['targets']['yellow']['mean']) + (stripe - stripe[valid].mean(0)) * .25
            wear = (asphalt - np.asarray(style['targets']['asphalt']['mean'])).mean(2)
            stripe += np.clip(wear, -35, 18)[..., None] * .55
        stripe_coverage = paint_strokes(paint, active, density) * coverage
        result = result * (1 - stripe_coverage[..., None]) + stripe * stripe_coverage[..., None]
    return np.uint8(np.clip(result, 0, 255))
