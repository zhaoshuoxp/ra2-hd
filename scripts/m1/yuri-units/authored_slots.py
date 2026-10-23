"""Isolate authored cells while retaining small, detached native-state effects."""
import numpy as np
from PIL import Image
from scipy import ndimage


def isolated_cells(image, columns, rows, occupied=None, replaced=()):
    rgba = np.array(image.convert('RGBA'))
    labels, _ = ndimage.label(rgba[..., 3] > 128, np.ones((3, 3)))
    sizes = np.bincount(labels.ravel())
    subjects = [[] for _ in range(columns * rows)]
    for label, bounds in enumerate(ndimage.find_objects(labels), 1):
        if bounds is None or sizes[label] < 12:
            continue
        ys, xs = bounds
        cx, cy = (xs.start + xs.stop) / 2, (ys.start + ys.stop) / 2
        col = min(columns - 1, int(cx / image.width * columns))
        row = min(rows - 1, int(cy / image.height * rows))
        subjects[row * columns + col].append(label)
    occupied = len(subjects) if occupied is None else occupied
    assert not any(subjects[occupied:]), 'Unexpected subject in an unused cell'
    result = []
    for index, ids in enumerate(subjects[:occupied]):
        if index in replaced:
            result.append(None)
            continue
        assert ids, ('Missing authored subject', index)
        mask = np.isin(labels, ids)
        ys, xs = np.nonzero(mask)
        bounds = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
        assert bounds[0] > 0 and bounds[1] > 0 and bounds[2] < image.width and bounds[3] < image.height, ('Clipped outer subject', index)
        support = ndimage.binary_dilation(mask, iterations=2)
        out = rgba.copy()
        out[..., 3] *= support
        bounds = [max(0, bounds[0] - 2), max(0, bounds[1] - 2),
                  min(image.width, bounds[2] + 2), min(image.height, bounds[3] + 2)]
        result.append((Image.fromarray(out).crop(bounds), bounds))
    return result
