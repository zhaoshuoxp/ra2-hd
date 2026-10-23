"""Native electrical control coverage, kept separate from photographic material."""
import numpy as np
from scipy import ndimage
from PIL import Image
from production_common import decode


def electrical(family, member, frame):
    rgba = np.array(decode(family.row, member, frame))
    red, green, blue = np.moveaxis(rgba[..., :3].astype(float), 2, 0)
    # All purple levels survive, including dim portions of the native ramp.
    purple = (red > green * 1.4) & (blue > green * 1.4) & (red > 0) & (blue > 0) & (rgba[..., 3] > 0)
    white = (np.minimum(np.minimum(red, green), blue) >= 220) & (rgba[..., 3] > 0)
    labels, count = ndimage.label(white)
    adjacent = set(np.unique(labels[ndimage.binary_dilation(purple)])) - {0}
    support = purple | np.isin(labels, list(adjacent))
    rgba[..., 3][~support] = 0
    rgba[..., :3][~support] = 0
    image = Image.fromarray(rgba).resize(tuple(v * family.density for v in member['canvas']), Image.Resampling.BICUBIC)
    if image.size != family.size:
        centered = family.blank()
        centered.alpha_composite(image, tuple((family.size[i] - image.size[i]) // 2 for i in range(2)))
        image = centered
    return image
