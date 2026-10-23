"""Register accepted HD samples and adapt only explicit target material semantics."""
import numpy as np
from scipy import ndimage
from newurban_batch89_io import crop


def registered(array, size, offset, density, auxiliary=False):
    w, h = [n * density for n in size]
    out = np.zeros((h, w, 4), np.uint8)
    if auxiliary:
        out[..., 3] = 255
    x, y = [n * density for n in offset]
    sx, sy, dx, dy = max(0, -x), max(0, -y), max(0, x), max(0, y)
    width, height = min(array.shape[1] - sx, w - dx), min(array.shape[0] - sy, h - dy)
    if width > 0 and height > 0:
        out[dy:dy + height, dx:dx + width] = array[sy:sy + height, sx:sx + width]
    return out


def native_registered(array, size, offset):
    rgba = np.repeat(array[..., None], 4, 2)
    return registered(rgba, size, offset, 1)[..., 0]


def warm_material_fit(donor, target, old_palette, new_palette):
    active = (donor != 0) & (target != 0)
    x, y = old_palette[donor][active] / 255, new_palette[target][active] / 255
    design = np.column_stack((x, np.ones(len(x))))
    # One smooth global material transform; no original pixel/coordinate texture is copied.
    regularizer = np.diag([.02, .02, .02, .0001])
    prior = np.vstack((np.eye(3), np.zeros((1, 3))))
    matrix = np.linalg.solve(design.T @ design + regularizer, design.T @ y + regularizer @ prior)
    before = float(np.sqrt(np.mean((x - y) ** 2)) * 255)
    after = float(np.sqrt(np.mean((design @ matrix - y) ** 2)) * 255)
    assert after < before and np.isfinite(matrix).all()
    return matrix, dict(matrix=matrix.tolist(), originalRgbRmseBefore=before, originalRgbRmseAfter=after,
        policy='One source-pinned continuous RGB affine transform. Accepted structural texture, alpha, auxiliary data and HD detail remain authoritative; native pixels are not sampled into the HD image.')


def adapt(metadata, slot, density, target_frame, donor_frame, target_indices, donor_indices,
          offset, source_member, color_matrix=None):
    size = [n + n % 2 for n in target_frame['size']]
    b = registered(crop(metadata, slot, density), size, offset, density)
    d = registered(crop(metadata, slot, density, 'data'), size, offset, density, auxiliary=True)
    old = native_registered(donor_indices, target_frame['size'], offset)
    target = target_indices
    record = dict(slot=slot, density=density, offset=offset, addedContact=0, removedContact=0,
        contactToMaterial=0, ownerChangedCells=0, colorTransform=False)
    if slot != 3 and source_member != 'cnfncp.shp':
        added = (target == 12) & (old != 12)
        removed = (target != 12) & (old == 12)
        material = removed & (target != 0)
        record.update(addedContact=int(added.sum()), removedContact=int(removed.sum()),
            contactToMaterial=int(material.sum()))
        h, w = [n * density for n in target.shape]
        bb, dd = b[:h, :w], d[:h, :w]
        if material.any():
            old_contact = (old == 12).repeat(density, 0).repeat(density, 1)
            valid = ~old_contact & (bb[..., 3] > 128) & (dd[..., 0] == 0)
            assert valid.any()
            _, indices = ndimage.distance_transform_edt(~valid, return_indices=True)
            nearest = bb[indices[0], indices[1]].copy()
            mask = material.repeat(density, 0).repeat(density, 1)
            bb[mask] = nearest[mask]
            dd[mask] = [0, 0, 0, 255]
        empty = (removed & (target == 0)).repeat(density, 0).repeat(density, 1)
        bb[..., 3][empty] = 0
        dd[empty] = [0, 0, 0, 255]
        new_contact = added.repeat(density, 0).repeat(density, 1)
        bb[new_contact] = [0, 0, 0, 255]
        dd[new_contact] = [0, 0, 0, 255]
        if source_member == 'cnmiam07.shp' and slot == 2:
            owner = (target >= 16) & (target <= 31)
            old_owner = (old >= 16) & (old <= 31)
            changed = (owner != old_owner) | (owner & old_owner & (target != old))
            record['ownerChangedCells'] = int(changed.sum())
            weight = owner.repeat(density, 0).repeat(density, 1).astype(float)
            shade = np.clip(target.astype(float) - 16, 0, 15).repeat(density, 0).repeat(density, 1)
            smooth_weight = ndimage.gaussian_filter(weight, .28 * density)
            smooth_shade = ndimage.gaussian_filter(shade * weight, .6 * density)
            smooth_shade /= np.maximum(ndimage.gaussian_filter(weight, .6 * density), 1e-6)
            support = changed.repeat(density, 0).repeat(density, 1)
            dd[..., 0][support] = np.rint(smooth_weight * 255).astype(np.uint8)[support]
            dd[..., 1][support] = np.rint(np.clip(smooth_shade, 0, 15)).astype(np.uint8)[support]
            dd[..., 1][support & (dd[..., 0] == 0)] = 0
    if color_matrix is not None:
        rgb = b[..., :3].astype(float) / 255
        b[..., :3] = np.rint(np.clip(rgb @ color_matrix[:3] + color_matrix[3], 0, 1) * 255).astype(np.uint8)
        record['colorTransform'] = True
    return b, d, record
