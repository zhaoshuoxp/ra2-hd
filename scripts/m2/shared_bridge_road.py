"""Reuse one accepted road surface across compatible native bridge main blocks."""
import numpy as np
from scipy import ndimage


def road_surface(approved, template, native_main, lane, density, color_offset):
    """Replace roadway RGB only; native coverage and bridge extra data stay exact."""
    assert density in (2, 4) and lane in (0, 1, 2)
    assert approved.shape == template.shape == (30*density, 60*density, 4)
    assert native_main.shape == (30, 60, 4)
    valid = template[..., 3] > 0
    assert valid.any()
    nearest = ndimage.distance_transform_edt(~valid, return_distances=False, return_indices=True)
    rgb = template[..., :3].astype(float)[tuple(nearest)] + np.asarray(color_offset)
    y, x = np.indices(valid.shape)
    # Native proad02 spans three cells across the road. A single shared template
    # fixes both lane geometry and longitudinal phase at every bridge segment.
    cross = (x+.5)/density + 2*(y+.5)/density + lane*60
    weight = np.clip(np.minimum(cross-45, 200-cross)/3, 0, 1)
    covered = (native_main[..., 3] > 0).repeat(density, 0).repeat(density, 1)
    weight *= covered
    output = approved.copy()
    output[..., :3] = np.uint8(np.clip(approved[..., :3]*(1-weight[..., None])
        + rgb*weight[..., None], 0, 255))
    assert np.array_equal(output[..., 3], approved[..., 3])
    assert np.array_equal(output[weight == 0], approved[weight == 0])
    return output, weight
