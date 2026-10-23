"""Deterministic native registration of preserved authored sprite masters."""
import hashlib
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage


def sha(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def matte(rgb):
    red = (rgb[..., 0] > 230) & (rgb[..., 1] < 30)
    yellow = (rgb[..., 0] > 240) & (rgb[..., 1] > 240) & (rgb[..., 2] < 16)
    green = (rgb[..., 0] < 40) & (rgb[..., 1] > 240) & (rgb[..., 2] < 40)
    return red | yellow | green


def extrude(rgb, valid):
    assert valid.any(), 'No covered authored pixels'
    if valid.all():
        return rgb.copy()
    indices = ndimage.distance_transform_edt(~valid, return_distances=False, return_indices=True)
    result = rgb.copy()
    result[~valid] = rgb[tuple(indices[:, ~valid])]
    return result


def authored_coverage(pixels, alpha_cutoff, fringe_guard=False):
    active = pixels[..., 3] > alpha_cutoff
    valid = active & ~matte(pixels[..., :3])
    if fringe_guard:
        r, g, b = np.moveaxis(pixels[..., :3], -1, 0)
        fluorescent = ((r > 210) & (g < 60) & (b < 100)
                       | (r > 210) & (g > 180) & (b < 80)
                       | (g > 210) & (r < 70) & (b < 90))
        edge_distance = ndimage.distance_transform_edt(np.pad(active, 1))[1:-1, 1:-1]
        valid &= ~(fluorescent & (edge_distance <= 4))
    return valid


def register(master, info, board_size, isolated=False):
    """Measure content, excluding fluorescent matte and isolated edge flecks."""
    sx, sy = master.width / board_size[0], master.height / board_size[1]
    x, y, w, h = info['slotRect']
    if isolated:
        x, y, w, h = 0, 0, *board_size
    x0, y0, x1, y1 = round(x * sx), round(y * sy), round((x + w) * sx), round((y + h) * sy)
    pixels = np.asarray(master.crop((x0, y0, x1, y1)))
    alpha_cutoff = info.get('alphaCutoff', 180)
    assert 0 <= alpha_cutoff < 255
    candidate = authored_coverage(pixels, alpha_cutoff, info.get('rejectFluorescentFringe', False))
    labels, count = ndimage.label(candidate)
    assert count > 0, 'No authored subject'
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    largest = int(sizes.argmax())
    selected = labels == largest
    # Include substantial disconnected native parts within the same cell.
    for index, size in enumerate(sizes):
        if index and index != largest and size >= max(50, sizes[largest] * .005):
            selected |= labels == index
    ys, xs = np.where(selected)
    assert len(xs) > 100, 'Negligible authored subject'
    rect = [x0 + int(xs.min()), y0 + int(ys.min()), int(xs.max() - xs.min() + 1),
            int(ys.max() - ys.min() + 1)]
    crop = np.asarray(master.crop((rect[0], rect[1], rect[0] + rect[2], rect[1] + rect[3])))
    valid = authored_coverage(crop, alpha_cutoff, info.get('rejectFluorescentFringe', False))
    return rect, extrude(crop[..., :3], valid)


def capacity(rect, bounds):
    return min(rect[2] / (bounds[2] - bounds[0]), rect[3] / (bounds[3] - bounds[1]))


def independently_sample(rgb, size):
    assert rgb.shape[1] >= size[0] and rgb.shape[0] >= size[1], 'Insufficient master resolution'
    return np.asarray(Image.fromarray(rgb).resize(size, Image.Resampling.LANCZOS))
