"""Read virtual frame pixels from ordinary or lossless serialized tile pages."""
import hashlib

import numpy as np
from PIL import Image


def read_page(folder, page):
    arrays = {}
    for role in ['base', 'data', 'map']:
        if role not in page:
            continue
        file = folder / page[role]
        assert hashlib.sha256(file.read_bytes()).hexdigest() == page[role + 'Sha256']
        arrays[role] = np.asarray(Image.open(file).convert('RGBA'))
    return arrays


def frame_pixels(arrays, rect):
    x, y, width, height = rect
    if 'map' not in arrays:
        return tuple(arrays[role][y:y+height, x:x+width] for role in ['base', 'data'])
    xs, ys = np.meshgrid(np.arange(x, x+width), np.arange(y, y+height))
    codes = arrays['map'][ys // 4, xs // 4, :3].astype(np.uint32)
    indices = codes[..., 0] + codes[..., 1] * 256 + codes[..., 2] * 65536
    columns = arrays['base'].shape[1] // 4
    px, py = indices % columns * 4 + xs % 4, indices // columns * 4 + ys % 4
    return tuple(arrays[role][py, px] for role in ['base', 'data'])
