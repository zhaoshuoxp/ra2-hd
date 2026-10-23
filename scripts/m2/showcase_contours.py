"""Reconstruct subpixel structural contours without filtering authored materials."""
import numpy as np
from scipy import ndimage


def trace(mask, connect_diagonal=False):
    """Trace oriented pixel-cell boundaries, keeping diagonal components separate."""
    edges = {}
    padded = np.pad(mask, 1)
    for y, x in zip(*np.where(mask)):
        x, y = int(x), int(y)
        for outside, start, end in [
            (not padded[y, x + 1], (x, y), (x + 1, y)),
            (not padded[y + 1, x + 2], (x + 1, y), (x + 1, y + 1)),
            (not padded[y + 2, x + 1], (x + 1, y + 1), (x, y + 1)),
            (not padded[y + 1, x], (x, y + 1), (x, y)),
        ]:
            if outside:
                edges.setdefault(start, []).append(end)
    contours = []
    while edges:
        start = next(iter(edges))
        current, previous, points = start, None, []
        while True:
            points.append(current)
            candidates = edges[current]
            if len(candidates) == 1 or previous is None:
                target = candidates[0]
            else:
                dx, dy = current[0] - previous[0], current[1] - previous[1]
                # At a diagonal contact, follow the right turn around this cell.
                choose = min if connect_diagonal else max
                target = choose(candidates, key=lambda p: dx * (p[1] - current[1]) - dy * (p[0] - current[0]))
            candidates.remove(target)
            if not candidates:
                del edges[current]
            previous, current = current, target
            if current == start:
                break
        contours.append(np.asarray(points, np.float64))
    return contours


def area(points):
    following = np.roll(points, -1, axis=0)
    return float(np.sum(points[:, 0] * following[:, 1] - following[:, 0] * points[:, 1]) / 2)


def simplify_open(points, tolerance):
    if len(points) <= 2:
        return points
    start, end = points[0], points[-1]
    vector = end - start
    length = np.linalg.norm(vector)
    distance = (np.abs(vector[0] * (points[:, 1] - start[1]) - vector[1] * (points[:, 0] - start[0])) / length
                if length else np.linalg.norm(points - start, axis=1))
    position = int(distance.argmax())
    if distance[position] <= tolerance:
        return points[[0, -1]]
    return np.concatenate((simplify_open(points[:position + 1], tolerance)[:-1],
                           simplify_open(points[position:], tolerance)))


def balance_area(points, target):
    """Balance a contour's signed area with a bounded subpixel miter offset."""
    before, after = points - np.roll(points, 1, axis=0), np.roll(points, -1, axis=0) - points
    if (np.linalg.norm(before, axis=1) == 0).any():
        keep = np.linalg.norm(before, axis=1) > 0
        points = points[keep]
        before, after = points - np.roll(points, 1, axis=0), np.roll(points, -1, axis=0) - points
    n1 = np.stack((before[:, 1], -before[:, 0]), axis=1) / np.linalg.norm(before, axis=1)[:, None]
    n2 = np.stack((after[:, 1], -after[:, 0]), axis=1) / np.linalg.norm(after, axis=1)[:, None]
    miter = (n1 + n2) / np.maximum(1 + (n1 * n2).sum(axis=1), .25)[:, None]
    miter *= np.minimum(1, 2 / np.maximum(np.linalg.norm(miter, axis=1), 1e-9))[:, None]
    # Signed hole contours need the opposite search direction to outer contours.
    low, high = -.15, .15
    increasing = area(points + miter * high) > area(points + miter * low)
    for _ in range(16):
        middle = (low + high) / 2
        if (area(points + miter * middle) < target) == increasing:
            low = middle
        else:
            high = middle
    result = points + miter * ((low + high) / 2)
    return result if abs(area(result) - target) < .01 else points


def simplify(points, tolerance=.7, preserve_area=False):
    """Bound displacement and area; preserve very small native fixtures and holes."""
    original_area = area(points)
    if abs(original_area) <= 4:
        return points
    # Pixel steps contain alternating short horizontal/vertical corners.
    # Cut only these subpixel corners before fitting straight structural lines;
    # retain the exact meeting point of two substantial architectural edges.
    incoming = points - np.roll(points, 1, axis=0)
    outgoing = np.roll(points, -1, axis=0) - points
    keep = incoming[:, 0] * outgoing[:, 1] - incoming[:, 1] * outgoing[:, 0] != 0
    corners = points[keep]
    rounded = []
    for previous, current, following in zip(np.roll(corners, 1, axis=0), corners, np.roll(corners, -1, axis=0)):
        before, after = current - previous, following - current
        a, b = np.linalg.norm(before), np.linalg.norm(after)
        if min(a, b) <= 1.01 and max(a, b) <= 8.01:
            rounded.extend([current - before / a * .5, current + after / b * .5])
        else:
            rounded.append(current)
    fitted = np.asarray(rounded)
    split = int(np.linalg.norm(fitted - fitted[0], axis=1).argmax())
    for limit in [tolerance, tolerance / 2, 0]:
        result = np.concatenate((simplify_open(fitted[:split + 1], limit)[:-1],
            simplify_open(np.concatenate((fitted[split:], fitted[:1])), limit)[:-1]))
        if len(result) >= 3 and abs(area(result) - original_area) <= max(.1, abs(original_area) * .025):
            return balance_area(result, original_area) if preserve_area and abs(area(result)-original_area)>.01 else result
    return points


def rasterize(contours, shape, density, samples=8):
    """Even-odd scan conversion at pixel centers; independent requested densities."""
    scale = density * samples
    height, width = shape
    raster = np.zeros((height * scale, width * scale), np.uint8)
    if not contours:
        return np.zeros((height * density, width * density), np.uint8)
    edges = np.concatenate([np.stack((p, np.roll(p, -1, axis=0)), axis=1) for p in contours])
    edges = edges[edges[:, 0, 1] != edges[:, 1, 1]]
    first, last = edges[:, 0], edges[:, 1]
    for y in range(max(0, int(first[:, 1].min() * scale)),
                   min(height * scale, int(max(first[:, 1].max(), last[:, 1].max()) * scale) + 1)):
        cy = (y + .5) / scale
        hit = ((first[:, 1] <= cy) & (last[:, 1] > cy)) | ((last[:, 1] <= cy) & (first[:, 1] > cy))
        a, b = first[hit], last[hit]
        crossings = np.sort(a[:, 0] + (cy - a[:, 1]) * (b[:, 0] - a[:, 0]) / (b[:, 1] - a[:, 1]))
        assert len(crossings) % 2 == 0, 'Unclosed structural contour'
        for left, right in crossings.reshape(-1, 2):
            x0, x1 = int(np.ceil(left * scale - .5)), int(np.ceil(right * scale - .5))
            x0, x1 = max(0, x0), min(width * scale, x1)
            if x0 < x1:
                raster[y, x0:x1] = 1
    coverage = raster.reshape(height * density, samples, width * density, samples).mean((1, 3))
    return np.uint8(np.rint(coverage * 255))


def coverage(mask, density, linear_strips=False):
    remaining, strips = mask.copy(), []
    if linear_strips:
        labels, count = ndimage.label(mask, np.ones((3, 3)))
        for component in range(1, count + 1):
            ys, xs = np.where(labels == component)
            if len(xs) < 6:
                continue
            points = np.stack((xs + .5, ys + .5), axis=1)
            center = points.mean(axis=0)
            values, vectors = np.linalg.eigh(np.cov(points.T))
            direction, normal = vectors[:, 1], vectors[:, 0]
            along, across = (points - center) @ direction, (points - center) @ normal
            if values[1] < 9 * max(values[0], .05) or np.max(np.abs(across)) > .85:
                continue
            # Reconstruct the full-width straight painted strip, including
            # corner-connected diagonal pixels. Width follows native area.
            extension = (abs(direction[0]) + abs(direction[1])) / 2
            left, right = along.min() - extension, along.max() + extension
            half_width = len(xs) / (right - left) / 2
            corners = np.asarray([center + direction * t + normal * u for t, u in
                                  [(left, -half_width), (right, -half_width),
                                   (right, half_width), (left, half_width)]])
            distance = ndimage.distance_transform_edt(labels != component)
            shape = rasterize([corners], mask.shape, density)
            # A fitted line cannot create color more than one native pixel
            # from its source component, including its endpoints.
            shape[distance.repeat(density, 0).repeat(density, 1) > 1] = 0
            expected = len(xs) * density * density
            if abs(shape.sum() / 255 / expected - 1) > .025:
                continue
            remaining[labels == component] = False
            strips.append(shape)
    result = rasterize([simplify(p, preserve_area=linear_strips) for p in
                        trace(remaining, connect_diagonal=linear_strips)], mask.shape, density)
    for strip in strips:
        result = np.maximum(result, strip)
    return result


def register_contours(base, data, indices, density, remapable):
    """Change coverage only; retain contact cells, palette identity, and native bounds."""
    height, width = indices.shape
    rgb, alpha = base[:height * density, :width * density, :3], base[:height * density, :width * density, 3]
    owner_data = data[:height * density, :width * density]
    original_alpha = alpha.copy()
    geometric = coverage(indices != 0, density)
    contact = (indices == 12).repeat(density, 0).repeat(density, 1)
    geometric[contact] = original_alpha[contact]
    # Newly covered edge pixels need color extrusion, never transparent black.
    valid = original_alpha > 0
    if valid.any():
        nearest = ndimage.distance_transform_edt(~valid, return_distances=False, return_indices=True)
        rgb[~valid & (geometric > 0)] = rgb[tuple(nearest[:, ~valid & (geometric > 0)])]
    if remapable:
        owner = (indices >= 16) & (indices <= 31)
        mask = coverage(owner, density, linear_strips=True)
        # Owner details participate in the silhouette union. Clipping a small
        # control cap against a simplified body edge would make its paint thin.
        geometric = np.maximum(geometric, mask)
        geometric[contact] = original_alpha[contact]
        mask[contact] = 0
        mask[geometric == 0] = 0
        newly_covered = ~valid & (geometric > 0)
        if newly_covered.any() and valid.any():
            nearest = ndimage.distance_transform_edt(~valid, return_distances=False, return_indices=True)
            rgb[newly_covered] = rgb[tuple(nearest[:, newly_covered])]
        old_mask = owner_data[..., 0].copy()
        # Fractional owner boundaries blend with the nearest fixed material,
        # so an enemy-blue strip never reveals stale red under its antialiasing.
        fixed = (original_alpha > 0) & (old_mask == 0) & ~contact
        border = ((old_mask > 0) | (mask > 0)) & (mask < 255) & (geometric > 0)
        if fixed.any() and border.any():
            nearest = ndimage.distance_transform_edt(~fixed, return_distances=False, return_indices=True)
            rgb[border] = rgb[tuple(nearest[:, border])]
        owner_data[..., 0] = mask
        if owner.any():
            nearest = ndimage.distance_transform_edt(~owner, return_distances=False, return_indices=True)
            shades = indices[tuple(nearest)] - 16
            shades = shades.repeat(density, 0).repeat(density, 1)
            owner_data[..., 1] = np.where(mask > 0, shades, 0)
    alpha[:] = geometric
    base[..., :3][base[..., 3] == 0] = 0
    return base, data
