"""Fit source paint as whole-member vector strokes and sample accepted asphalt."""
import numpy as np
from PIL import Image
from scipy import ndimage, signal


def source_masks(native):
    rgb = native[..., :3].astype(float)
    active = native[..., 3] > 0
    light, chroma = rgb.mean(2), np.ptp(rgb, axis=2)
    dark = (light < 112) & (chroma < 52) & active
    if not dark.any():
        return active, dark, dark.copy(), dark.copy()
    nearest = ndimage.distance_transform_edt(~active, return_distances=False, return_indices=True)
    extended = dark[tuple(nearest)]
    road = ndimage.binary_closing(np.pad(extended, 6, mode='edge'), structure=np.ones((5, 5)))[6:-6, 6:-6]
    road &= active
    background = np.median(light[dark & (chroma < 44)]) if (dark & (chroma < 44)).any() else 60
    white = road & (light > max(88, min(110, background + 32))) & (chroma < 44)
    yellow = road & (rgb[..., 0] - rgb[..., 2] > 22) & (rgb[..., 1] - rgb[..., 2] > 20)
    yellow &= np.abs(rgb[..., 0] - rgb[..., 1]) < 45
    return active, road, white, yellow


def road_plane(x, y, ramp):
    if ramp == 1:
        y = 2 * y + x / 2
    elif ramp == 2:
        y = 2 * y - x / 2
    elif ramp == 3:
        y = 2 * y / 3 - x / 6
    elif ramp == 4:
        y = 2 * y / 3 + x / 6
    return x, y


def line_strokes(mask, minimum_length=4, gap=7, directions=(-1, 1), origin=(0, 0), ramp=0):
    """Recover both isometric line directions without joining distinct paint bars."""
    yy, xx = np.where(mask)
    if not len(xx):
        return []
    x, y = road_plane(xx + .5 + origin[0], yy + .5 + origin[1], ramp)
    points = np.column_stack([x, y])
    available = np.ones(len(points), bool)
    strokes = []
    for _ in range(100):
        best = None
        for sign in directions:
            cross = points[:, 0] + sign * 2 * points[:, 1]
            along = 2 * points[:, 0] - sign * points[:, 1]
            low = np.floor(cross.min()) - 4
            bins = np.rint(cross - low).astype(int)
            histogram = np.bincount(bins[available], minlength=int(np.ceil(cross.max() - low)) + 5)
            smooth = ndimage.gaussian_filter1d(histogram.astype(float), .8)
            peaks, _ = signal.find_peaks(smooth, distance=4, height=2)
            for peak in sorted(peaks, key=lambda p: smooth[p], reverse=True)[:40]:
                center = float(peak + low)
                band = available & (np.abs(cross - center) <= 1.7)
                ids = np.flatnonzero(band)
                if len(ids) < 4:
                    continue
                ids = ids[np.argsort(along[ids])]
                groups = np.split(ids, np.flatnonzero(np.diff(along[ids]) > gap) + 1)
                for ids in groups:
                    if len(ids) < 4:
                        continue
                    first, last = along[ids].min(), along[ids].max()
                    length = (last - first) / np.sqrt(5)
                    if length < minimum_length or len(ids) / max(length, 1) < .45:
                        continue
                    offset = float(np.median(cross[ids]))
                    error = np.abs(cross[ids] - offset) / np.sqrt(5)
                    score = len(ids) - error.sum() * .7
                    if best is None or score > best[0]:
                        best = score, ids, dict(kind='line', sign=sign, offset=offset,
                            first=float(first - 1.1), last=float(last + 1.1),
                            width=float(np.clip(2 * np.quantile(error, .8) + .35, .85, 1.65)),
                            anchorPixels=len(ids), error95=float(np.quantile(error, .95)))
        if best is None:
            break
        _, ids, model = best
        available[ids] = False
        strokes.append(model)
    return strokes


def structured_strokes(mask, origin=(0, 0), directions=(-1, 1), parking=False):
    """Fit strong parallel rows independently so intersections cannot steal anchors."""
    yy, xx = np.where(mask)
    if not len(xx):
        return []
    x, y = xx + .5 + origin[0], yy + .5 + origin[1]
    result = []
    for sign in directions:
        cross, along = x + sign * 2 * y, 2 * x - sign * y
        low = np.floor(cross.min()) - 4
        bins = np.rint(cross - low).astype(int)
        histogram = np.bincount(bins, minlength=int(np.ceil(cross.max() - low)) + 5)
        smooth = ndimage.gaussian_filter1d(histogram.astype(float), 1.2)
        peaks, _ = signal.find_peaks(smooth, distance=8 if parking else 5,
            height=max(8 if parking else 3, smooth.max() * .35))
        for peak in peaks:
            ids = np.flatnonzero(np.abs(cross - peak - low) <= 2)
            ids = ids[np.argsort(along[ids])]
            groups = np.split(ids, np.flatnonzero(np.diff(along[ids]) > (28 if parking else 5)) + 1)
            for group in groups:
                if len(group) < 5:
                    continue
                first, last = along[group].min(), along[group].max()
                if (last - first) / np.sqrt(5) < (8 if parking else 2.5):
                    continue
                result.append(dict(kind='line', sign=sign, offset=float(np.median(cross[group])),
                    first=float(first - 1.1), last=float(last + 1.1), width=1.05 if parking else 1.1,
                    anchorPixels=len(group)))
    return result


def render_strokes(strokes, shape, density, origin=(0, 0), ramp=0):
    """Analytic coverage has a one-output-pixel transition at every density."""
    yy, xx = (np.indices((shape[0] * density, shape[1] * density)) + .5) / density
    xx, yy = road_plane(xx + origin[0], yy + origin[1], ramp)
    coverage = np.zeros(xx.shape, float)
    for stroke in strokes:
        sign = stroke['sign']
        _, px = road_plane(np.array([.01]), np.array([0.]), ramp)
        _, py = road_plane(np.array([0.]), np.array([.01]), ramp)
        gradient = np.hypot(1 + sign * 2 * px[0] / .01, sign * 2 * py[0] / .01) / np.sqrt(5)
        along_gradient = np.hypot(2 - sign * px[0] / .01, -sign * py[0] / .01) / np.sqrt(5)
        cross = (xx + sign * 2 * yy - stroke['offset']) / np.sqrt(5)
        along = (2 * xx - sign * yy) / np.sqrt(5)
        body = np.clip((stroke['width'] / 2 - np.abs(cross)) * density / gradient + .5, 0, 1)
        cap = np.clip(np.minimum(along - stroke['first'] / np.sqrt(5),
            stroke['last'] / np.sqrt(5) - along) * density / along_gradient + .5, 0, 1)
        if stroke.get('dashed'):
            phase = ((xx - sign * 2 * yy) / np.sqrt(2)) % (10 * np.sqrt(2))
            dash_gradient = np.sqrt(2.5)
            cap *= np.clip(np.minimum(phase, 8.3 - phase) * density / dash_gradient + .5, 0, 1)
        coverage = np.maximum(coverage, body * cap)
    return coverage


def sample_asphalt(material, shape, origin, density, ramp=0):
    yy, xx = (np.indices((shape[0] * density, shape[1] * density)) + .5) / density
    x, y = xx + origin[0], yy + origin[1]
    if ramp == 1:
        y = 2 * y + x / 2
    elif ramp == 2:
        y = 2 * y - x / 2
    elif ramp == 3:
        y = 2 * y / 3 - x / 6
    elif ramp == 4:
        y = 2 * y / 3 + x / 6
    u, v = (x / 60 + y / 30 - .5) % 1, (-x / 60 + y / 30 + .5) % 1
    coords = [v * material.shape[0] - .5, u * material.shape[1] - .5]
    return np.stack([ndimage.map_coordinates(material[..., channel], coords, order=1, mode='grid-wrap')
        for channel in range(3)], axis=2)


def curve_markings(native, origin, density, member):
    """Use fitted tangent ports and a common lane layout through a complete bend."""
    from continuous_road_markings import coordinates, fit_member
    _, road, _, _ = source_masks(native)
    anchors = native.copy()
    # Off-road grass and sand can share the native yellow paint palette.
    # Neutralize them only in the fitting input; rendered surroundings stay exact.
    anchors[~road, :3] = 190
    model = fit_member(anchors, origin, member.split('.')[0] + '.des', 0)
    yy, xx = (np.indices((native.shape[0] * density, native.shape[1] * density)) + .5) / density
    distance, along, gradient = coordinates(model, xx + origin[0], yy + origin[1])
    band = lambda value, width: np.clip((width / 2 - np.abs(value)) * density / gradient + .5, 0, 1)
    _, _, source_white, _ = source_masks(native)
    ny, nx = np.where(source_white)
    original_distance, original_along, _ = coordinates(model,
        nx[None, :] + .5 + origin[0], ny[None, :] + .5 + origin[1])
    lane_anchors = np.minimum(abs(original_distance - 25.45), abs(original_distance + 25.45)) < 3
    anchors = original_along[lane_anchors]
    period, length = 10 * np.sqrt(2), 8.3
    phases = np.linspace(0, period, 120, endpoint=False)
    phase = max(phases, key=lambda value: float((((anchors + value) % period) < length).mean())) if len(anchors) else 0
    position = (along + phase) % period
    dash = np.clip(np.minimum(position, length - position) * density / gradient + .5, 0, 1)
    white = np.maximum(band(distance - 25.45, 1.4), band(distance + 25.45, 1.4)) * dash
    yellow = np.maximum(band(distance - 2.12, 1.5), band(distance + 2.12, 1.5))
    yellow = np.maximum(yellow, np.maximum(band(distance - 51, 1.1), band(distance + 51, 1.1)))
    return white, yellow, dict(**model['audit'], dashPeriod=period, dashLength=length, phase=float(phase))


def strip_markings(native, origin, density, ramp):
    """Keep the accepted straight-road lattice and dash phase at both ports."""
    from continuous_road_markings import coordinates, fit_member
    _, road, _, yellow = source_masks(native)
    yy, xx = np.where(yellow)
    x, y = road_plane(xx + .5 + origin[0], yy + .5 + origin[1], ramp)
    strengths = {}
    for sign in [-1, 1]:
        values = x + sign * 2 * y
        histogram = np.bincount(np.rint(values - values.min()).astype(int))
        strengths[sign] = ndimage.gaussian_filter1d(histogram.astype(float), 1).max()
    sign = max(strengths, key=strengths.get)
    anchors = native.copy()
    anchors[~road, :3] = 190
    model = fit_member(anchors, origin, 'proad06.des' if sign == -1 else 'proad07.des', ramp)
    yy, xx = (np.indices((native.shape[0] * density, native.shape[1] * density)) + .5) / density
    distance, along, gradient = coordinates(model, xx + origin[0], yy + origin[1])
    band = lambda field, width: np.clip((width / 2 - np.abs(field)) * density / gradient + .5, 0, 1)
    phase = along % (10 * np.sqrt(2))
    dash = np.clip(np.minimum(phase, 8.3 - phase) * density / gradient + .5, 0, 1)
    white = np.maximum(band(distance - 25.45, 1.25), band(distance + 25.45, 1.25)) * dash
    yellow_coverage = np.maximum(band(distance - 2.12, 1.35), band(distance + 2.12, 1.35))
    # Edge paint exists only at the source-owned curb, never across an approach.
    edge = np.maximum(band(distance - 51, 1.05), band(distance + 51, 1.05))
    native_yellow = ndimage.gaussian_filter(yellow.astype(float), .7)
    support = np.asarray(Image.fromarray(native_yellow.astype(np.float32))
        .resize((native.shape[1] * density, native.shape[0] * density), Image.Resampling.BILINEAR))
    yellow_coverage = np.maximum(yellow_coverage, edge * np.clip(support * 5, 0, 1))
    ny, nx = np.indices(native.shape[:2])
    native_distance, _, _ = coordinates(model, nx + .5 + origin[0], ny + .5 + origin[1])
    corners = line_strokes(yellow & (np.abs(native_distance) > 40), minimum_length=5,
        directions=(-sign,), origin=origin, ramp=ramp)
    corners = [{**line, 'width': 1.05} for line in corners if line['anchorPixels'] >= 6]
    yellow_coverage = np.maximum(yellow_coverage,
        render_strokes(corners, native.shape[:2], density, origin, ramp))
    return white, yellow_coverage, model['audit']


def repair_member(authored, native, origin, density, material, parking=False, crosswalk=False,
        curved=False, strip=False, member='', ramp=0):
    """Retain authored pavement, rebuild road paint, and keep source alpha exact."""
    active, road, white, yellow = source_masks(native)
    directions = (-1, 1)
    if crosswalk:
        yy, xx = np.where(active)
        points = np.column_stack([xx, yy * 2])
        _, _, axes = np.linalg.svd(points - points.mean(0), full_matrices=False)
        # A crossing's bars span the short axis of its complete source strip.
        directions = (1 if axes[0, 0] * axes[0, 1] > 0 else -1,)
    if parking or member.startswith('proad03.'):
        white_lines = structured_strokes(white, origin, directions, parking)
    else:
        white_lines = line_strokes(white, minimum_length=2.5, gap=7 if crosswalk else 5,
            directions=directions, origin=origin, ramp=ramp)
    if member.startswith('proad03.'):
        white_lines = [{**line, 'dashed': True} for line in white_lines]
    yellow_lines = [] if parking else line_strokes(yellow, minimum_length=5,
        directions=directions if crosswalk else (-1, 1), origin=origin, ramp=ramp)
    if not white_lines and not yellow_lines:
        return authored.copy(), dict(changed=False, white=[], yellow=[])
    white_coverage = render_strokes(white_lines, native.shape[:2], density, origin, ramp)
    yellow_coverage = render_strokes(yellow_lines, native.shape[:2], density, origin, ramp)
    curve = None
    if curved:
        white_coverage, yellow_coverage, curve = curve_markings(native, origin, density, member)
    elif strip:
        white_coverage, yellow_coverage, curve = strip_markings(native, origin, density, ramp)
    from showcase_urban_roads import continuous_coverage
    road_coverage = continuous_coverage(road, active, density)
    rgb = authored[..., :3].astype(float)
    asphalt = sample_asphalt(material, native.shape[:2], origin, density, ramp)
    # Whole-member paint detection can retain tiny curb specks. Only supported
    # road strokes inside the original asphalt plane receive fresh paint.
    gate = np.minimum(road_coverage, authored[..., 3] / 255)
    rgb = rgb * (1 - gate[..., None]) + asphalt * gate[..., None]
    if parking:
        # Compact fixtures are neither pavement nor paint. Preserve their
        # existing artwork and shadows after fitting the actual parking rows.
        painted = render_strokes(white_lines, native.shape[:2], 1, origin) > .05
        fixtures = white & ~ndimage.binary_dilation(painted, iterations=2)
        labels, count = ndimage.label(fixtures)
        keep = np.zeros(fixtures.shape, bool)
        for label in range(1, count + 1):
            yy, xx = np.where(labels == label)
            if 3 <= len(xx) <= 40 and max(np.ptp(xx), np.ptp(yy)) <= 8:
                keep |= labels == label
        keep |= yellow
        keep = ndimage.binary_dilation(keep, iterations=2)
        preserve = np.asarray(Image.fromarray(ndimage.gaussian_filter(keep.astype(float), .6).astype(np.float32))
            .resize((authored.shape[1], authored.shape[0]), Image.Resampling.BILINEAR))
        rgb = rgb * (1 - preserve[..., None]) + authored[..., :3] * preserve[..., None]
    wear = np.clip(asphalt.mean(2) - material.mean((0, 1, 2)), -15, 15)
    for coverage, color in [(yellow_coverage, [225, 184, 65]), (white_coverage, [214, 212, 198])]:
        weight = coverage * gate
        paint = np.asarray(color) + wear[..., None] * .15
        rgb = rgb * (1 - weight[..., None]) + paint * weight[..., None]
    result = authored.copy()
    result[..., :3] = np.rint(np.clip(rgb, 0, 255)).astype(np.uint8)
    np.testing.assert_array_equal(result[..., 3], authored[..., 3])
    return result, dict(changed=True, white=white_lines, yellow=yellow_lines,
        nativeWhitePixels=int(white.sum()), nativeYellowPixels=int(yellow.sum()),
        alphaExact=True, parking=parking, curve=curve)
