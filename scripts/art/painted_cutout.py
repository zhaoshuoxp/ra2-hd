"""Fit authored coverage without replacing it with a retail pixel silhouette."""
import numpy as np
from PIL import Image
from scipy.ndimage import label, distance_transform_edt, center_of_mass


def extract_grid_poses(image, columns, rows):
    """Decode whole source components by slot, including parts across grid lines."""
    rgba = np.array(image.convert("RGBA"))
    opaque = rgba[..., 3] >= 128
    components, count = label(opaque)
    centers = center_of_mass(opaque, components, range(1, count + 1))
    slots = np.full(count + 1, -1, int)
    for component, (y, x) in enumerate(centers, 1):
        column = min(columns - 1, int(x * columns / image.width))
        row = min(rows - 1, int(y * rows / image.height))
        slots[component] = row * columns + column
    _, nearest = distance_transform_edt(~opaque, return_indices=True)
    ownership = slots[components[nearest[0], nearest[1]]]
    poses = {}
    for cell in range(columns * rows):
        mask = opaque & (slots[components] == cell)
        bounds = Image.fromarray(mask.astype(np.uint8) * 255).getbbox()
        if not bounds:
            continue
        x0, y0, x1, y1 = bounds
        pose = rgba[y0:y1, x0:x1].copy()
        pose[ownership[y0:y1, x0:x1] != cell] = 0
        poses[cell] = (Image.fromarray(pose), list(bounds))
    return poses


def painted_pose_bounds(source, exclude_border_fragments=True):
    """Exclude small neighboring-cell fragments from the registration bounds."""
    opaque = np.array(source.getchannel("A")) >= 128
    components, count = label(opaque)
    areas = np.bincount(components.ravel())
    largest = int(areas[1:].max()) if count else 0
    border = set(np.unique(np.concatenate((components[0], components[-1], components[:, 0], components[:, -1]))))
    if exclude_border_fragments:
        for component in border - {0}:
            if areas[component] < largest * .1:
                opaque[components == component] = False
    bounds = Image.fromarray(opaque.astype(np.uint8) * 255).getbbox()
    assert bounds, "Painted pose has no opaque object"
    return bounds


def fit_painted_pose(source, size, exclude_border_fragments=True):
    bounds = painted_pose_bounds(source, exclude_border_fragments)
    # Pillow's RGBa mode resamples premultiplied color. Invisible RGB cannot
    # bleed into an antenna, missile tube, or another thin opaque surface.
    fitted = source.crop(bounds).convert("RGBa").resize(size, Image.Resampling.LANCZOS).convert("RGBA")
    rgba = np.array(fitted)
    rgba[..., :3][rgba[..., 3] == 0] = 0
    return rgba
