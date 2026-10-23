"""Source-local HD surface reuse with original target metadata and contacts."""
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from newurban_batch95_io import assemble, crop, native, pack, pin, read, sha, write

ROOT = Path('.artifacts/m2-4/newurban-final-terrain-reuse-batch96-20261021')
GUIDE = Path('.artifacts/m2-4/newurban-native-v1')
PRIOR = Path('.artifacts/m2-4/newurban-remaining-terrain-reuse-batch95-20261021')
BASELINE = read(ROOT / 'baseline-selector.json')
SOURCES = {s['member']: s for s in read(GUIDE / 'source.json')['sources']}


def extrude(pixels):
    valid = pixels[..., 3] > 128
    nearest = ndimage.distance_transform_edt(~valid, return_distances=False, return_indices=True)
    return pixels[tuple(nearest)][..., :3]


def periodic(field):
    field = field.astype(float)
    h, w = field.shape[:2]
    boundary = np.zeros_like(field)
    boundary[0] += field[0] - field[-1]
    boundary[-1] -= field[0] - field[-1]
    boundary[:, 0] += field[:, 0] - field[:, -1]
    boundary[:, -1] -= field[:, 0] - field[:, -1]
    fy, fx = np.indices((h, w))
    denominator = 2 * np.cos(2 * np.pi * fx / w) + 2 * np.cos(2 * np.pi * fy / h) - 4
    denominator[0, 0] = 1
    transform = np.fft.fft2(boundary, axes=(0, 1)) / denominator[..., None]
    transform[0, 0] = 0
    return field - np.fft.ifft2(transform, axes=(0, 1)).real


def sample(rgb, x, y, mode='nearest'):
    return np.stack([ndimage.map_coordinates(rgb[..., c].astype(float), [y, x], order=1, mode=mode)
                     for c in range(3)], axis=2)


def coordinates(image, density):
    yy, xx = (np.indices(tuple(n * density for n in image['size'][::-1])) + .5) / density
    return xx + image['origin'][0] + image['offset'][0], yy + image['origin'][1] + image['offset'][1]


def uv(x, y):
    return (x - 30) / 60 + y / 30, -(x - 30) / 60 + y / 30


@lru_cache(maxsize=12)
def material(name, slot, density):
    pointer = read('.local/terrain-urban-selection.json') if name.endswith('.urb') else BASELINE
    pixels = crop(pointer, name, slot, density)
    side = 60 * density
    v, u = (np.indices((side, side)) + .5) / side
    x, y = (30 + 27 * (u - v)) * density - .5, (1.5 + 13.5 * (u + v)) * density - .5
    return periodic(sample(extrude(pixels), x, y))


def field_at(field, x, y):
    u, v = uv(x, y)
    return sample(field, (u % 1) * field.shape[1] - .5,
                  (v % 1) * field.shape[0] - .5, 'grid-wrap')


def with_native_coverage(rgb, source, image, density):
    alpha = native(source, image)[..., 3].repeat(density, 0).repeat(density, 1)
    return np.dstack((np.rint(np.clip(rgb, 0, 255)).astype(np.uint8), alpha))


def semantic_weight(original, mask, density, sigma=.65):
    """Smooth material boundaries only; original RGB never supplies HD detail."""
    alpha = original[..., 3] > 0
    nearest = ndimage.distance_transform_edt(~alpha, return_distances=False, return_indices=True)
    values = mask[tuple(nearest)].astype(float)
    values = ndimage.gaussian_filter(values, sigma, mode='nearest')
    yy, xx = (np.indices((values.shape[0] * density, values.shape[1] * density)) + .5) / density - .5
    return np.clip(ndimage.map_coordinates(values, [yy, xx], order=3, mode='nearest'), 0, 1)


def road_slope(source, image, density):
    """Inverse-project the same accepted flat road, including its paint and curbs."""
    direction = int(source['member'][6:8])
    assert direction in [1, 2, 3, 4]
    x, y = coordinates(image, density)
    flat_y = {1: 2 * y + x / 2 - 15, 2: 2 * y - x / 2 + 15,
              3: 2 * y / 3 - x / 6 + 15, 4: 2 * y / 3 + x / 6 + 5}[direction]
    u, v = uv(x, flat_y)
    donor = 'proad01.ubn' if direction in [1, 3] else 'proad02.ubn'
    cross = v if direction in [1, 3] else u
    slots = np.clip(np.floor(cross).astype(int), 0, 2)
    along = u if direction in [1, 3] else v
    along = along % 1
    across = np.clip(cross - slots, 0, 1)
    local_u, local_v = (along, across) if direction in [1, 3] else (across, along)
    dx = (30 + 30 * (local_u - local_v)) * density - .5
    dy = 15 * (local_u + local_v) * density - .5
    rgb = np.zeros((*x.shape, 3))
    for slot in range(3):
        values = sample(extrude(crop(BASELINE, donor, slot, density)), dx, dy)
        rgb[slots == slot] = values[slots == slot]
    sign = -1 if direction in [1, 3] else 1
    center = -62.5 if sign == -1 else 122.5
    distance = (x + sign * 2 * flat_y - center) / np.sqrt(2)
    along = (x - sign * 2 * flat_y) / np.sqrt(2)
    derivatives = {1: (sign, 4 * sign), 2: (-sign, 4 * sign),
                   3: (1 - sign / 3, 4 * sign / 3), 4: (1 + sign / 3, 4 * sign / 3)}
    # For directions 1/2, x + sign*2*(2*y +/- x/2 + constant)
    # has zero x derivative: the uphill road is horizontal on screen.
    if direction in [1, 2]:
        gradient = 4 / np.sqrt(2)
    else:
        gradient = np.hypot(*derivatives[direction]) / np.sqrt(2)
    aa = gradient / density
    band = lambda values, width: np.clip((width / 2 - np.abs(values)) / aa + .5, 0, 1)
    gate = np.clip((53 - np.abs(distance)) / aa + .5, 0, 1)
    asphalt = field_at(asphalt_field(density), x, flat_y)
    rgb = rgb * (1 - gate[..., None]) + asphalt * gate[..., None]
    yellow = np.maximum(band(distance - 2.12, 1.35), band(distance + 2.12, 1.35))
    yellow = np.maximum(yellow, np.maximum(band(distance - 51, 1.05), band(distance + 51, 1.05))) * gate
    colors, phase_offset, dash_length, phase_score = straight_paint_model(donor)
    phase = (along + phase_offset) % (10 * np.sqrt(2))
    dash = np.clip(np.minimum(phase, dash_length - phase) / aa + .5, 0, 1)
    white = np.maximum(band(distance - 25.45, 1.25), band(distance + 25.45, 1.25)) * dash * gate
    rgb = rgb * (1 - yellow[..., None]) + colors['yellow'] * yellow[..., None]
    rgb = rgb * (1 - white[..., None]) + colors['white'] * white[..., None]
    return with_native_coverage(rgb, source, image, density), dict(
        policy='INVERSE_NATIVE_SLOPE_PROJECTED_ACCEPTED_FLAT_HD_ROAD', donor=donor,
        donorPack=BASELINE, drawingOrientation=direction, originalHeaderRampType=image['rampType'],
        targetHeaderChanged=False, sourceOriginConstant=[-15, 15, 15, 5][direction - 1],
        paint='CONTINUOUS_CANONICAL_PORTS_WITH_ACCEPTED_STRAIGHT_PHASE',
        paintCenterCross=center, paintPhaseOffset=phase_offset, dashLength=dash_length,
        donorPaintPhaseAgreement=phase_score,
        originalRgbUsedAsDetail=False)


@lru_cache(maxsize=2)
def straight_paint_model(name):
    sign = -1 if name == 'proad01.ubn' else 1
    center = -62.5 if sign == -1 else 122.5
    samples, phases, accepted = [], [], []
    yellow_colors, white_colors = [], []
    for image in SOURCES[name]['images']:
        p = crop(BASELINE, name, image['subTile'], 4).astype(float)
        x, y = coordinates(image, 4)
        distance = (x + sign * 2 * y - center) / np.sqrt(2)
        along = (x - sign * 2 * y) / np.sqrt(2)
        visible = p[..., 3] > 128
        yellow = (p[..., 0] - p[..., 2] > 60) & (p[..., 1] - p[..., 2] > 35) & visible
        white = (p[..., :3].mean(2) > 150) & (np.ptp(p[..., :3], axis=2) < 35) & visible
        stripe = (np.abs(np.abs(distance) - 25.45) < .32) & visible
        phases.extend(along[stripe]); accepted.extend(white[stripe])
        yellow_colors.extend(p[..., :3][yellow & (np.abs(distance) < 4)])
        white_colors.extend(p[..., :3][white & stripe])
    phases, accepted = np.asarray(phases), np.asarray(accepted)
    options = []
    period = 10 * np.sqrt(2)
    for length in np.arange(5.5, 10.1, .2):
        for offset in np.arange(0, period, .1):
            proposed = (phases + offset) % period < length
            union = (accepted | proposed).sum()
            score = float((accepted & proposed).sum() / union) if union else 0
            options.append((score, -abs(length - 8.3), float(offset), float(length)))
    score, _, offset, length = max(options)
    colors = dict(yellow=np.median(yellow_colors, axis=0), white=np.median(white_colors, axis=0))
    return colors, offset, length, score


def paving_fix(source, image, density):
    original = native(source, image)
    rgb = original[..., :3].astype(float)
    grass = (rgb[..., 1] > rgb[..., 0] * .96) & (rgb[..., 1] - rgb[..., 2] > 28)
    weight = semantic_weight(original, grass, density)
    x, y = coordinates(image, density)
    pavement = 'rough04.urb' if source['member'] == 'gbfix03.ubn' else 'pave01.ubn'
    slot = 8 if pavement.startswith('rough') else 0
    body = field_at(material(pavement, slot, density), x, y)
    green = field_at(material('clear01.ubn', 0, density), x, y)
    return with_native_coverage(body * (1 - weight[..., None]) + green * weight[..., None],
        source, image, density), dict(policy='ACCEPTED_HD_PAVING_AND_GRASS_TARGET_MATERIAL_BOUNDARY',
        pavement=pavement, pavementSlot=slot, materialBoundarySigma=.65,
        originalRgbUsedAsDetail=False)


def round_paving(source, image, density):
    x, y = coordinates(image, density)
    u, v = uv(x, y)
    centers = {'rough04.ubn': [4, 0], 'rough05.ubn': [4, 4],
               'rough09.ubn': [0, 0], 'rough10.ubn': [0, 4]}
    center = centers[source['member']]
    radius = np.hypot(u - center[0], v - center[1])
    width = .025 / density * 4
    red = np.clip((4 - radius) / width + .5, 0, 1)
    brick = field_at(material('rough04.urb', 8, density), x, y)
    stone = field_at(material('pave01.ubn', 0, density), x, y)
    return with_native_coverage(brick * red[..., None] + stone * (1 - red[..., None]),
        source, image, density), dict(policy='ANALYTIC_ORIGINAL_QUARTER_CIRCLE_ACCEPTED_HD_MATERIALS',
        center=center, radius=4, originalRgbUsedAsDetail=False,
        redMaterial=['rough04.urb', 8], paleMaterial=['pave01.ubn', 0])


def paved_end(source, image, density):
    x, y = coordinates(image, density)
    equations, center, low, high = end_geometry(source['member'])
    distance = np.max(equations[:, 0, None, None] * x + equations[:, 1, None, None] * y
                      + equations[:, 2, None, None], axis=0)
    road = np.clip((.4 - distance) * density + .5, 0, 1)
    pale = field_at(material('pave01.ubn', 0, density), x, y)
    surface = field_at(asphalt_field(density), x, y)
    body = pale * (1 - road[..., None]) + surface * road[..., None]
    # The source has one vertical yellow marking. Its source-local center and
    # extent are measured from all positive-pointer tiles, never map coordinates.
    line = np.clip((.55 - np.abs(x - center)) * density + .5, 0, 1)
    line *= np.clip((y - low) * density + .5, 0, 1) * np.clip((high - y) * density + .5, 0, 1)
    line *= road
    paint = np.array([186, 153, 44.])
    body = body * (1 - line[..., None]) + paint * line[..., None]
    return with_native_coverage(body, source, image, density), dict(
        policy='ACCEPTED_HD_ASPHALT_PAVING_WITH_CONTINUOUS_SOURCE_LOCAL_DEAD_END_MARKING',
        center=center, extent=[low, high], originalRgbUsedAsDetail=False,
        surfaceContour='CONVEX_STRAIGHT_NATIVE_ROAD_REGION_WITHOUT_TEXTURE_PORES')


@lru_cache(maxsize=2)
def end_geometry(name):
    from scipy.spatial import ConvexHull
    source = SOURCES[name]
    original, low_point = assemble([(f, native(source, f)) for f in source['images'] if f['nativeOffset'] > 0])
    p = np.asarray(original).astype(float)
    yellow = ((p[..., 0] > p[..., 2] + 60) & (p[..., 1] > p[..., 2] + 50)
              & (p[..., 2] < 100) & (p[..., 3] > 0))
    surface = ((p[..., :3].mean(2) < 100) | yellow) & (p[..., 3] > 0)
    surface = ndimage.binary_closing(np.pad(surface, 3), structure=np.ones((3, 3)))[3:-3, 3:-3]
    labels, _ = ndimage.label(surface)
    counts = np.bincount(labels.ravel()); counts[0] = 0
    yy, xx = np.where(labels == counts.argmax())
    points = np.stack((xx + low_point[0] + .5, yy + low_point[1] + .5), axis=1)
    hull = ConvexHull(points)
    points = []
    for frame in source['images']:
        if frame['nativeOffset'] <= 0:
            continue
        p = native(source, frame).astype(float)
        selected = ((p[..., 0] > p[..., 2] + 60) & (p[..., 1] > p[..., 2] + 50)
                    & (p[..., 2] < 100) & (p[..., 3] > 0))
        yy, xx = np.where(selected)
        points.extend(zip(xx + frame['origin'][0] + frame['offset'][0] + .5,
                          yy + frame['origin'][1] + frame['offset'][1] + .5))
    points = np.asarray(points)
    center = float(np.median(points[:, 0]))
    low, high = float(points[:, 1].min()), float(points[:, 1].max())
    return hull.equations, center, low, high


@lru_cache(maxsize=2)
def asphalt_field(density):
    import sys
    sys.path.insert(0, 'scripts/m2')
    from shared_road_network import asphalt_pixels, periodic_material
    controls = [crop(BASELINE, 'proad02.ubn', slot, density) for slot in range(3)]
    colors = np.concatenate([p[..., :3][asphalt_pixels(p)] for p in controls]).mean(0)
    field = periodic_material(controls[1], density, colors)
    broad = ndimage.gaussian_filter(field, (6 * density, 6 * density, 0), mode='wrap')
    medium = ndimage.gaussian_filter(field, (1.5 * density, 1.5 * density, 0), mode='wrap')
    return colors + np.clip(field - medium + (medium - broad) * .25, -18, 18)
