"""Register new rubble RGB and bounded continuous contours within native logical frames."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_contours import area, rasterize, simplify, trace
from showcase_materials import register_frame_tone
from showcase_registration import authored_coverage, extrude, independently_sample


def register_subjects(master, count):
    """Separate full generated subjects before cropping; nominal rows are only layout hints."""
    from PIL import Image
    from scipy import ndimage
    pixels = np.asarray(master.convert('RGBA'))
    valid = authored_coverage(pixels, 180, fringe_guard=True)
    labels, _ = ndimage.label(valid)
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    primary = list(np.argsort(sizes)[-count:])
    assert all(sizes[label] > 10000 for label in primary)
    assert min(sizes[label] for label in primary) > max(sizes[label] for label in primary) * .15
    primary.sort(key=lambda label: float(np.where(labels == label)[0].mean()))
    distances = [ndimage.distance_transform_edt(labels != label) for label in primary]
    groups = [labels == label for label in primary]
    included = [[int(label)] for label in primary]
    threshold = max(50, max(sizes[label] for label in primary) * .005)
    for label, size in enumerate(sizes):
        if label == 0 or label in primary or size < threshold:
            continue
        component = labels == label
        nearest = int(np.argmin([distance[component].min() for distance in distances]))
        groups[nearest] |= component
        included[nearest].append(label)
    result = []
    for group, ids in zip(groups, included, strict=True):
        ys, xs = np.where(group)
        x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)
        selected = group[y0:y1, x0:x1]
        rgb = extrude(pixels[y0:y1, x0:x1, :3], selected)
        alpha = pixels[y0:y1, x0:x1, 3].copy()
        alpha[~selected] = 0
        result.append(dict(plate=rgb, alpha=Image.fromarray(alpha), rect=[x0, y0, x1 - x0, y1 - y0],
            subjectComponents=ids, dominantComponents=count, registeredBodyPixels=int(selected.sum())))
    assert len(result) == count
    return result


def rubble_coverage(indices, density):
    """Replace tiny square raster islands with equal-area continuous fragment contours."""
    contours, tiny = [], 0
    for points in trace(indices != 0):
        signed = area(points)
        if 0 < abs(signed) <= 4:
            low, high = points.min(0), points.max(0)
            center, extent = (low + high) / 2, (high - low) / 2
            angle = np.arange(48) * (2 * np.pi / 48)
            ellipse = center + np.stack((np.cos(angle), np.sin(angle)), axis=1) * extent
            if area(ellipse) * signed < 0:
                ellipse = ellipse[::-1]
            ellipse = center + (ellipse - center) * np.sqrt(abs(signed / area(ellipse)))
            assert np.max(np.abs(ellipse - np.clip(ellipse, low, high))) <= .7
            contours.append(ellipse)
            tiny += 1
        else:
            contours.append(simplify(points))
    alpha = rasterize(contours, indices.shape, density)
    contact = (indices == 12).repeat(density, 0).repeat(density, 1)
    alpha[contact] = 255
    return alpha, tiny


def registered_material_alpha(master, rect):
    from PIL import Image
    x, y, width, height = rect
    pixels = np.array(master.crop((x, y, x + width, y + height)).convert('RGBA'))
    valid = authored_coverage(pixels, 180, fringe_guard=True)
    alpha = pixels[..., 3].copy()
    alpha[~valid] = 0
    return Image.fromarray(alpha)


def register_rubble(plate, indices, bounds, density, palette, authored_alpha=None):
    height, width = indices.shape
    left, top, right, bottom = bounds
    rgb = np.zeros((height * density, width * density, 3), np.uint8)
    rgb[top * density:bottom * density, left * density:right * density] = independently_sample(
        plate, ((right - left) * density, (bottom - top) * density))
    # Uniform mean registration preserves the actual source color relationship;
    # no original per-pixel RGB or palette noise is sampled into the new material.
    rgb, tone = register_frame_tone(rgb, palette[indices], indices, density)
    if authored_alpha is None:
        alpha, tiny = rubble_coverage(indices, density)
        policy = 'BOUNDED_NATIVE_CONTOURS_WITH_EQUAL_AREA_CONTINUOUS_TINY_FRAGMENTS'
    else:
        from PIL import Image
        assert not (indices == 12).any(), 'Contact geometry needs an explicit separate policy'
        alpha = np.zeros((height * density, width * density), np.uint8)
        alpha[top * density:bottom * density, left * density:right * density] = np.asarray(
            authored_alpha.resize(((right - left) * density, (bottom - top) * density), Image.Resampling.LANCZOS))
        tiny = 0
        policy = 'AUTHORED_CONTINUOUS_RUBBLE_WITHIN_UNCHANGED_NATIVE_LOGICAL_BOUNDS'
    active = (indices != 0).repeat(density, 0).repeat(density, 1)
    newly_covered = (alpha > 0) & ~active
    if newly_covered.any() and authored_alpha is None:
        from scipy import ndimage
        nearest = ndimage.distance_transform_edt(~active, return_distances=False, return_indices=True)
        rgb[newly_covered] = rgb[tuple(nearest[:, newly_covered])]
    return np.dstack((rgb, alpha)), dict(tinyContinuousContours=tiny, tone=tone,
        nativeRgbCopiedPixels=0, coverage=policy)
