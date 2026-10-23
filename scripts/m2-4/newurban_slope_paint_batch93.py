"""Fit continuous target-projected paint without assuming a donor's ramp projection."""
import numpy as np
from scipy import ndimage


def masks(native):
    rgb = native[..., :3].astype(float)
    active = native[..., 3] > 0
    yellow = active & (rgb[..., 0] > 65) & (rgb[..., 1] > 55) & (rgb[..., 2] < 100)
    yellow &= (rgb[..., 0] - rgb[..., 2] > 30) & (rgb[..., 1] - rgb[..., 2] > 22)
    yellow &= np.abs(rgb[..., 0] - rgb[..., 1]) < 50
    dark = active & (rgb.mean(2) < 105) & (np.ptp(rgb, axis=2) < 42)
    road = ndimage.binary_closing(np.pad(dark | yellow, 6, mode='edge'), structure=np.ones((5, 5)))[6:-6, 6:-6]
    interior = ndimage.binary_erosion(road, iterations=2, border_value=0)
    white = active & interior & (rgb.mean(2) > 95) & (np.ptp(rgb, axis=2) < 35)
    return active, yellow, white


def strokes(mask, color):
    joined, count = ndimage.label(ndimage.binary_dilation(mask, iterations=1), structure=np.ones((3, 3)))
    result = []
    for label in range(1, count + 1):
        yy, xx = np.where(mask & (joined == label))
        if len(xx) < 3:
            continue
        points = np.column_stack((xx + .5, yy + .5))
        center = points.mean(0)
        _, _, axes = np.linalg.svd(points - center, full_matrices=False)
        tangent = axes[0]
        normal = np.array([-tangent[1], tangent[0]])
        along, cross = points @ tangent, points @ normal
        length = np.ptp(along)
        if length < 2:
            continue
        pairs = [np.ones(len(points), bool)]
        if color == 'yellow' and np.ptp(cross) >= 1.5 and len(points) / max(length, 1) > 1.35:
            a, b = np.quantile(cross, [.2, .8])
            for _ in range(12):
                first = np.abs(cross - a) <= np.abs(cross - b)
                if first.all() or not first.any():
                    break
                a, b = cross[first].mean(), cross[~first].mean()
            if abs(a - b) >= 1.0 and first.sum() >= 3 and (~first).sum() >= 3:
                pairs = [first, ~first]
        for part in pairs:
            values = cross[part]
            start, end = float(along[part].min()), float(along[part].max())
            width = float(np.clip(part.sum() / max(end - start + 1, 1), .6, 1.25))
            result.append(dict(color=color, tangent=tangent.tolist(), normal=normal.tolist(),
                offset=float(np.median(values)), start=start - .6, end=end + .6,
                width=width, nativeAnchorPixels=int(part.sum()),
                maximumAnchorNormalResidual=float(np.max(np.abs(values - np.median(values))))))
    return result


def paint(authored, native, density):
    active, yellow, white = masks(native)
    models = strokes(yellow, 'yellow') + strokes(white, 'white')
    assert any(model['color'] == 'yellow' for model in models)
    h, w = authored.shape[:2]
    yy, xx = (np.indices((h, w)) + .5) / density
    coordinates = np.stack((xx, yy), axis=-1)
    rgb = authored[..., :3].astype(float)
    rgba_active = authored[..., 3] > 0
    yellow_hd = rgba_active & (rgb[..., 0] - rgb[..., 2] > 25) & (rgb[..., 1] - rgb[..., 2] > 20)
    white_hd = rgba_active & (rgb.mean(2) > 90) & (np.ptp(rgb, axis=2) < 38)
    support = ndimage.binary_dilation(yellow | white, iterations=3).repeat(density, 0).repeat(density, 1)
    paint_pixels = support & (yellow_hd | white_hd)
    asphalt = rgba_active & ~paint_pixels & (rgb.max(2) < 125) & (np.ptp(rgb, axis=2) < 25)
    assert asphalt.any()
    nearest = ndimage.distance_transform_edt(~asphalt, return_distances=False, return_indices=True)
    clean = rgb[tuple(nearest)]
    result = authored.copy()
    result[..., :3][paint_pixels] = clean[paint_pixels]
    colors = {}
    for name, mask, fallback in [('yellow', yellow_hd & support, [186, 166, 55]),
                                  ('white', white_hd & support, [190, 190, 185])]:
        samples = rgb[mask]
        colors[name] = np.percentile(samples, 65, axis=0) if len(samples) else np.asarray(fallback)
    coverage = np.zeros((h, w), float)
    for model in models:
        cross = coordinates @ np.asarray(model['normal']) - model['offset']
        along = coordinates @ np.asarray(model['tangent'])
        band = np.clip((model['width'] / 2 - np.abs(cross)) * density + .5, 0, 1)
        cap = np.clip(np.minimum(along - model['start'], model['end'] - along) * density + .5, 0, 1)
        weight = band * cap * rgba_active
        color = colors[model['color']] + np.clip(clean.mean(2) - np.median(clean[asphalt].mean(1)), -12, 12)[..., None] * .12
        result[..., :3] = np.rint(result[..., :3] * (1 - weight[..., None]) + color * weight[..., None]).astype(np.uint8)
        coverage = np.maximum(coverage, weight)
    assert np.array_equal(result[..., 3], authored[..., 3])
    return result, dict(models=models, outputColors={k: v.tolist() for k, v in colors.items()},
        changedSamples=int(np.any(result != authored, axis=2).sum()),
        originalRgbUsedAsNewDetail=False, nativeAnchorsOnly=True, alphaExact=True)
