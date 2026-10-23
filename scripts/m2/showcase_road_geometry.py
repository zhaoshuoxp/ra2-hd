"""Fit source road boundaries to mathematical lines and isometrically projected arcs."""
import numpy as np
from scipy import ndimage
from scipy.optimize import least_squares, minimize_scalar
from showcase_contours import trace, rasterize


def boundary_chains(mask, active):
    """Include enough transparent contact margin to join outside native coverage."""
    near = ndimage.binary_dilation(mask & active, iterations=3)
    near &= ndimage.binary_dilation(~mask & active, iterations=3)
    contours = trace(np.pad(mask, 8, mode='edge'))
    result = []
    for polygon in contours:
        polygon -= 8
        x = np.clip(polygon[:, 0].astype(int), 0, mask.shape[1] - 1)
        y = np.clip(polygon[:, 1].astype(int), 0, mask.shape[0] - 1)
        valid = near[y, x]
        if valid.all():
            result.append((polygon, np.arange(len(polygon))))
        elif valid.any():
            start = int(np.flatnonzero(~valid)[0])
            order = np.roll(np.arange(len(polygon)), -start)
            spans = ndimage.find_objects(ndimage.label(valid[order])[0])
            result.extend((polygon, order[span[0]]) for span in spans if span is not None)
    return result


def project_line(points):
    center = np.median(points, axis=0)
    _, _, axes = np.linalg.svd(points - center, full_matrices=False)
    direction = axes[0]
    angle = np.arctan2(direction[1], direction[0])
    snapped = np.round(angle / (np.pi / 4)) * np.pi / 4
    if abs(angle - snapped) < .12:
        direction = np.array([np.cos(snapped), np.sin(snapped)])
    normal = np.array([-direction[1], direction[0]])
    offset = np.median(points @ normal)
    def cost(n):
        residual = np.abs(points @ n - np.median(points @ n))
        return np.median(residual) + .2 * np.minimum(residual, 4).mean()
    candidates = [np.array([np.cos(a), np.sin(a)]) for a in np.arange(4) * np.pi / 4]
    grid = min(candidates, key=cost)
    if cost(grid) <= cost(normal) + .65:
        normal, offset = grid, np.median(points @ grid)
    return normal, offset


def segment_distance(points, a, b):
    vector = b - a
    t = np.clip((points - a) @ vector / max(vector @ vector, 1e-9), 0, 1)
    return np.linalg.norm(points - (a + t[:, None] * vector), axis=1)


def fillet(points, endpoint_margin=None):
    """Join two fitted straight port tangents with a single tangent circular arc."""
    q = points * [1, 2]
    count = min(20, max(5, len(q) // 5))
    margin = (3 if len(q) >= 24 else 0) if endpoint_margin is None else endpoint_margin
    assert isinstance(margin, int) and 0 <= margin <= 3
    n1, b1 = project_line(q[margin:margin + count])
    n2, b2 = project_line(q[-margin - count:len(q) - margin])
    matrix = np.stack([n1, n2])
    if abs(np.linalg.det(matrix)) < .15:
        return None
    corner = np.linalg.solve(matrix, [b1, b2])
    a = q[0] - n1 * (q[0] @ n1 - b1)
    b = q[-1] - n2 * (q[-1] @ n2 - b2)
    la, lb = np.linalg.norm(a - corner), np.linalg.norm(b - corner)
    if min(la, lb) < 3:
        return None
    u, v = (a - corner) / la, (b - corner) / lb
    phi = np.arccos(np.clip(u @ v, -1, 1))
    if not .2 < phi < np.pi - .2:
        return None
    bisector = (u + v) / np.linalg.norm(u + v)

    def shape(radius):
        tangent = radius / np.tan(phi / 2)
        first, last = corner + u * tangent, corner + v * tangent
        center = corner + bisector * radius / np.sin(phi / 2)
        angles = np.arctan2([first[1] - center[1], last[1] - center[1]],
                            [first[0] - center[0], last[0] - center[0]])
        delta = (angles[1] - angles[0] + np.pi) % (2 * np.pi) - np.pi
        return first, last, center, angles[0], delta

    def distances(radius):
        first, last, center, angle, delta = shape(radius)
        theta = (np.arctan2(q[:, 1] - center[1], q[:, 0] - center[0]) - angle + np.pi) % (2 * np.pi) - np.pi
        on_arc = (theta >= min(0, delta)) & (theta <= max(0, delta))
        arc = np.where(on_arc, np.abs(np.linalg.norm(q - center, axis=1) - radius), np.inf)
        return np.minimum(arc, np.minimum(segment_distance(q, a, first), segment_distance(q, last, b)))

    maximum = min(la, lb) * np.tan(phi / 2) * .98
    if maximum <= .6:
        return None
    fit = minimize_scalar(lambda radius: np.mean(np.minimum(distances(radius), 4) ** 2),
        bounds=(min(4, maximum * .8), maximum), method='bounded')
    first, last, center, angle, delta = shape(fit.x)
    theta = np.linspace(angle, angle + delta, max(16, int(abs(delta) * fit.x * 8)))
    arc = center + fit.x * np.column_stack([np.cos(theta), np.sin(theta)])
    curve = np.concatenate([a[None], arc, b[None]]) / [1, 2]
    return curve, dict(kind='tangent-fillet', radius=float(fit.x),
                       error95=float(np.quantile(distances(fit.x), .95)))


def fitted_chain(points):
    model = fit_primitive(points)
    q = points * [1, 2]
    if model['kind'] == 'line':
        normal, offset = project_line(q)
        error = np.abs(q @ normal - offset)
        model = dict(kind='line', normal=normal.tolist(), offset=float(offset),
                     error95=float(np.quantile(error, .95)))
        curve = (q[[0, -1]] - (q[[0, -1]] @ normal - offset)[:, None] * normal) / [1, 2]
        if model['error95'] <= 3.1:
            return curve, model
    else:
        center, radius = np.asarray(model['center']), model['radius']
        angles = np.unwrap(np.arctan2(q[:, 1] - center[1], q[:, 0] - center[0]))
        theta = np.linspace(angles[0], angles[-1], max(16, int(abs(angles[-1] - angles[0]) * radius * 8)))
        curve = (center + radius * np.column_stack([np.cos(theta), np.sin(theta)])) / [1, 2]
    alternative = fillet(points) if len(points) >= 16 and model['error95'] > 1.1 else None
    if alternative is not None and alternative[1]['error95'] < model['error95']:
        curve, model = alternative
    # Compound damaged fixtures retain their major contour turns. Short arcs
    # and straight sections are fitted separately, never by a blurred mask.
    if model['error95'] > 4.5 and len(points) >= 24:
        midpoint = len(points) // 2
        left, lm = fitted_chain(points[:midpoint + 1])
        right, rm = fitted_chain(points[midpoint:])
        join = (left[-1] + right[0]) / 2
        left[-1] = right[0] = join
        return np.concatenate([left[:-1], right]), dict(kind='compound', parts=[lm, rm],
            error95=max(lm['error95'], rm['error95']))
    return curve, model


def fit_junction_chain(points):
    """Keep a junction corner tangent to both ports when interior wear defeats the trimmed fit."""
    curve, model = fitted_chain(points)
    if model['kind'] == 'arc':
        fallback = fillet(points, endpoint_margin=0)
        if fallback is not None and fallback[1]['error95'] <= 4.5:
            curve, model = fallback
            model = dict(**model, tangentAuthority='UNTRIMMED_NATIVE_PORTS')
    return curve, model


def fit_geometry(mask, active, junction_ports=False):
    contours = trace(np.pad(mask, 8, mode='edge'))
    near = ndimage.binary_dilation(mask & active, iterations=3)
    near &= ndimage.binary_dilation(~mask & active, iterations=3)
    fitted, audit = [], []
    for polygon in contours:
        polygon -= 8
        x = np.clip(polygon[:, 0].astype(int), 0, mask.shape[1] - 1)
        y = np.clip(polygon[:, 1].astype(int), 0, mask.shape[0] - 1)
        valid = near[y, x]
        valid &= (polygon[:, 0] >= 0) & (polygon[:, 0] <= mask.shape[1])
        valid &= (polygon[:, 1] >= 0) & (polygon[:, 1] <= mask.shape[0])
        if not valid.any():
            fitted.append(polygon)
            continue
        start = int(np.flatnonzero(~valid)[0]) if not valid.all() else 0
        polygon, valid = np.roll(polygon, -start, axis=0), np.roll(valid, -start)
        labels, _ = ndimage.label(valid)
        pieces, position = [], 0
        for span in ndimage.find_objects(labels):
            if span is None:
                continue
            a, b = span[0].start, span[0].stop
            pieces.append(polygon[position:a])
            points = polygon[a:b]
            if len(points) >= 8:
                curve, model = fit_junction_chain(points) if junction_ports else fitted_chain(points)
                pieces.append(curve)
                audit.append(dict(points=len(points), **model))
            else:
                pieces.append(points)
            position = b
        pieces.append(polygon[position:])
        fitted.append(np.concatenate(pieces))
    return fitted, audit


def offset_contour(points, distance):
    before, after = points - np.roll(points, 1, axis=0), np.roll(points, -1, axis=0) - points
    n1 = np.column_stack([before[:, 1], -before[:, 0]]) / np.maximum(np.linalg.norm(before, axis=1)[:, None], 1e-8)
    n2 = np.column_stack([after[:, 1], -after[:, 0]]) / np.maximum(np.linalg.norm(after, axis=1)[:, None], 1e-8)
    miter = (n1 + n2) / np.maximum(1 + (n1 * n2).sum(1), .25)[:, None]
    miter *= np.minimum(1, 2 / np.maximum(np.linalg.norm(miter, axis=1), 1e-8))[:, None]
    return points + miter * distance


def render_geometry(contours, shape, density):
    polygons = [np.asarray(p, float) for p in contours]
    body = rasterize(polygons, shape, density).astype(float) / 255
    expanded = rasterize([offset_contour(p, 1.1) for p in polygons], shape, density).astype(float) / 255
    return body, np.clip(expanded - body, 0, 1)


def asphalt_pixels(native):
    colors = native[..., :3].astype(float)
    return ((native[..., 3] > 0) & (colors[..., 2] >= colors[..., 0] + 4)
            & (colors[..., 2] >= colors[..., 1] + 4) & (colors.mean(2) < 128))


def curb_normal(native):
    """Measure parallel curb direction independently of a short asphalt patch's aspect ratio."""
    active = native[..., 3] > 0
    bright = (native[..., :3].mean(2) > 145) & active
    edge = bright & ndimage.binary_dilation(asphalt_pixels(native), iterations=2)
    labels, count = ndimage.label(ndimage.binary_dilation(edge), np.ones((3, 3)))
    parts = []
    for label in range(1, count + 1):
        yy, xx = np.where(edge & (labels == label))
        if len(xx) >= 6:
            parts.append(np.column_stack([xx + .5, 2 * (yy + .5)]))
    assert parts, 'A curb-directed strip requires substantial native paving contacts'
    candidates = [np.array([1., 0]), np.array([0., 1]),
                  np.array([1., 1]) / np.sqrt(2), np.array([-1., 1]) / np.sqrt(2)]
    scores = [sum(np.minimum(abs(points @ normal - np.median(points @ normal)), 6).sum()
                  for points in parts) / sum(len(points) for points in parts) for normal in candidates]
    best = int(np.argmin(scores))
    normal = candidates[best] * [1, 2]
    normal /= np.linalg.norm(normal)
    return normal, dict(nativeCurbPixels=sum(len(points) for points in parts),
                        curbFitError=float(scores[best]), directionAuthority='NATIVE_PAVING_CONTACTS')


def fit_strip(native, ramp=False, curb_direction=False):
    """Straight source road families use parallel boundaries, including ramp projection."""
    yy, xx = np.where(asphalt_pixels(native))
    assert len(xx) >= 30, 'A straight road needs substantial native asphalt authority'
    points = np.column_stack([xx + .5, yy + .5])
    q = points * ([1, 1] if ramp else [1, 2])
    direction_audit = {}
    if curb_direction:
        assert not ramp, 'Raised ramp projection retains its existing independent fit'
        normal, direction_audit = curb_normal(native)
    elif ramp:
        _, _, axes = np.linalg.svd(q - q.mean(0), full_matrices=False)
        normal = axes[1]
    else:
        normal, _ = project_line(q)
    if not curb_direction:
        normal = normal * ([1, 1] if ramp else [1, 2])
        normal /= np.linalg.norm(normal)
    across = points @ normal
    low, high = np.quantile(across, [.02, .98])
    half_width = (high - low) / .96 / 2
    center = (high + low) / 2
    tangent = np.array([-normal[1], normal[0]])
    extent = sum(native.shape[:2]) * 3
    polygon = np.asarray([normal * (center + side * half_width) + tangent * along
                          for side, along in [(-1, -extent), (1, -extent), (1, extent), (-1, extent)]])
    # Pixel-cell tracing uses positive outer winding in screen coordinates.
    first, second = polygon[1] - polygon[0], polygon[2] - polygon[1]
    if first[0] * second[1] - first[1] * second[0] < 0:
        polygon = polygon[::-1]
    if curb_direction:
        ground_normal = normal / [1, 2]
        ground_normal /= np.linalg.norm(ground_normal)
        along_normal = np.array([-ground_normal[1], ground_normal[0]]) * [1, 2]
        along = points @ along_normal
        yy, xx = np.where((native[..., 3] > 0) & (native[..., :3].mean(2) > 145))
        paving = np.column_stack([xx + .5, yy + .5])
        cross_paving = paving @ normal
        interior = abs(cross_paving - center) < half_width * .6
        tail = paving[interior] @ along_normal
        support = abs(along_normal).sum() / 2
        caps = [int((tail < along.min() - 2 * support).sum()),
                int((tail > along.max() + 2 * support).sum())]
        limits = [float(along.min() - support) if caps[0] >= 6 else -extent,
                  float(along.max() + support) if caps[1] >= 6 else extent]
        if max(caps) >= 6:
            # End pieces have native paving across the road beyond the asphalt.
            # Cap in the ground plane; a screen-space orthogonal cap is wrong.
            basis = np.stack([normal, along_normal])
            polygon = np.array([np.linalg.solve(basis, [center + side * half_width, stop])
                                for side, stop in [(-1, limits[0]), (1, limits[0]),
                                                   (1, limits[1]), (-1, limits[1])]])
        direction_audit.update(nativeEndPavingPixels=caps, groundAlongLimits=limits)
    return [polygon], [dict(kind='parallel-ramp-lines' if ramp else 'parallel-straight-lines',
        nativeAsphaltPixels=len(xx), normal=normal.tolist(), offsets=[center - half_width, center + half_width],
        **direction_audit)]




def fit_primitive(points):
    """Robust fit in the ground plane; circular arcs project to 2:1 ellipses."""
    q = points * [1, 2]
    center = np.median(q, axis=0)
    _, _, axes = np.linalg.svd(q - center, full_matrices=False)
    normal = axes[1]
    offset = np.median(q @ normal)
    line_error = np.abs(q @ normal - offset)
    result = dict(kind='line', normal=normal.tolist(), offset=float(offset),
                  error95=float(np.quantile(line_error, .95)))
    if result['error95'] <= .9 or len(points) < 10:
        return result
    matrix = np.column_stack([2 * q, np.ones(len(q))])
    solution = np.linalg.lstsq(matrix, (q * q).sum(1), rcond=None)[0]
    origin = solution[:2]
    radius = np.sqrt(max(solution[2] + origin @ origin, 1))
    fitted = least_squares(lambda v: np.linalg.norm(q - v[:2], axis=1) - v[2],
        [*origin, radius], loss='soft_l1', f_scale=.7, max_nfev=200)
    origin, radius = fitted.x[:2], fitted.x[2]
    error = np.abs(np.linalg.norm(q - origin, axis=1) - radius)
    if radius > 2 and np.quantile(error, .95) < result['error95'] * .8:
        result = dict(kind='arc', center=origin.tolist(), radius=float(radius),
                      error95=float(np.quantile(error, .95)))
    return result
