"""Measure generated state cells without substituting native texture or enlarged masters."""
from pathlib import Path
import sys
import numpy as np
from PIL import Image
from scipy import ndimage
from newurban_batch89_io import pin, read

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_registration import authored_coverage, capacity, extrude
from showcase_registration import independently_sample
from showcase_contours import coverage
from showcase_owner import register_owner_material

ROOT = Path('.artifacts/m2-4/newurban-remaining-actors-batch97-20261021')


def continuous_frame(material, indices, palette, density, remapable, authored_owner=False):
    """Index 12 is not a license to paste native dark architectural cells over HD RGB."""
    left, top, right, bottom = material['nativeBounds']
    height, width = indices.shape
    sampled = independently_sample(material['plate'], ((right - left) * density, (bottom - top) * density))
    alpha = np.asarray(material['alpha'].resize((sampled.shape[1], sampled.shape[0]), Image.Resampling.LANCZOS))
    owner = (indices >= 16) & (indices <= 31) if remapable else np.zeros_like(indices, bool)
    active = (indices != 0) & (indices != 12) & ~owner
    if not active.any():
        active = indices != 0
    mean = palette[indices][active].mean(0)
    authored_mean = sampled[alpha >= 180].mean(0)
    gain = .25 + .75 * mean / np.maximum(authored_mean, 1)
    rgb = np.uint8(np.clip(sampled.astype(float) * gain, 0, 255))
    rgba = np.zeros((height * density, width * density, 4), np.uint8)
    rgba[top * density:bottom * density, left * density:right * density] = np.dstack((rgb, alpha))
    data = np.zeros_like(rgba)
    data[..., 3] = 255
    if remapable:
        native_rgba = np.dstack((palette[indices], (indices != 0).astype(np.uint8) * 255)).astype(np.uint8)
        rgba[..., :3], changed = register_owner_material(rgba[..., :3], native_rgba, indices, density)
        mask = coverage(owner, density, linear_strips=True)
        if authored_owner and owner.any():
            # Preserve the material's clean ring and crossing white arches rather
            # than reproducing the palette grid at their subpixel boundary.
            sampled_red = np.zeros(rgba.shape[:2], float)
            red = (rgb[..., 0].astype(float) - rgb[..., 1:].max(2)) / np.maximum(rgb[..., 0], 1)
            sampled_red[top * density:bottom * density, left * density:right * density] = np.clip((red - .15) / .30, 0, 1)
            yy, xx = np.indices(sampled_red.shape)
            distance = ndimage.distance_transform_edt(~owner).astype(float) - .5
            distance = ndimage.map_coordinates(distance,
                [(yy + .5) / density - .5, (xx + .5) / density - .5], order=1, mode='nearest')
            envelope = np.clip((.7 - distance) * density + .5, 0, 1)
            mask = np.rint(sampled_red * envelope * 255).astype(np.uint8)
        mask[rgba[..., 3] == 0] = 0
        if owner.any():
            nearest = ndimage.distance_transform_edt(~owner, return_distances=False, return_indices=True)
            shades = (indices[tuple(nearest)] - 16).repeat(density, 0).repeat(density, 1)
            data[..., 0] = mask
            data[..., 1] = np.where(mask > 0, shades, 0)
    rgba[..., :3][rgba[..., 3] == 0] = 0
    return rgba, data, dict(policy='CONTINUOUS_AUTHORED_RGB_ALPHA_WITH_NATIVE_OWNER_SEMANTICS_NO_DARK_CELL_STAMP',
        nativeRgbBodyPixelsCopied=0, nativeIndex12CellsNotStamped=int((indices == 12).sum()),
        nativeOwnerArea=int(owner.sum()), nativeMean=mean.tolist(), authoredMean=authored_mean.tolist(),
        gain=gain.tolist(), separateOriginalShadowsUnchanged=True,
        ownerReconstruction='AUTHORED_RING_AND_WHITE_ARCHES_WITHIN_0_7_NATIVE_PIXEL_OWNER_ENVELOPE' if authored_owner else 'NATIVE_CONTINUOUS_OWNER_CONTOURS')


def stabilize_flag(images, source, density):
    """Freeze the original pole and its attachment edge in source-canvas coordinates."""
    frames = source['frames'][:16]
    native = []
    for frame in frames:
        index = np.fromfile(ROOT / 'native' / frame['indexFile'], np.uint8).reshape(frame['size'][::-1])
        canvas = np.zeros(source['canvas'][::-1], np.uint8)
        x, y = frame['origin']
        canvas[y:y + index.shape[0], x:x + index.shape[1]] = index
        native.append(canvas)
    common = np.logical_and.reduce([canvas != 0 for canvas in native])
    counts = common.sum(0)
    maximum = int(counts.max())
    assert maximum >= 20, 'A fixed native pole must exist before animation stabilization'
    columns = np.where(counts == maximum)[0]
    x0, x1 = int(columns.min()), int(columns.max() + 1)
    assert x1 - x0 <= 3, 'The mast must be a narrow fixed vertical member'
    ys = np.where(common[:, x0])[0]
    y0, y1 = int(ys.min()), int(ys.max() + 1)
    assert y1 - y0 == maximum
    x1 += 2  # The adjacent cloth attachment stays fixed on the same pole.
    first = frames[0]
    fx, fy = first['origin']
    body, auxiliary = images[0]
    patch = body[(y0 - fy) * density:(y1 - fy) * density, (x0 - fx) * density:(x1 - fx) * density].copy()
    assert patch.shape[:2] == ((y1 - y0) * density, (x1 - x0) * density) and patch[..., 3].any()
    for slot, frame in enumerate(frames):
        x, y = frame['origin']
        body, auxiliary = images[slot]
        target = body[(y0 - y) * density:(y1 - y) * density, (x0 - x) * density:(x1 - x) * density]
        assert target.shape == patch.shape
        target[:] = patch
    return dict(policy='ONE_AUTHORED_FIXED_POLE_AND_ATTACHMENT_PATCH_FOR_ALL_16_NATIVE_PHASES',
        sourceCanvasBounds=[x0, y0, x1, y1], density=density, rgbaSha256=__import__('hashlib').sha256(patch.tobytes()).hexdigest(),
        nativePoseAndLoopUnchanged=True, nativeRgbCopiedPixels=0)


def materials():
    result, rows, missing = {}, [], []
    for job in read(ROOT / 'mother-jobs-v3.json')['jobs']:
        file = Path(job['destination'])
        if not file.exists():
            missing.append(job['id'])
            continue
        receipt = read(ROOT / (job['id'] + '-mother-receipt-v1.json'))
        assert pin(file)['sha256'] == receipt['sha256']
        master = np.array(Image.open(file).convert('RGBA'))
        height, width = master.shape[:2]
        subjects = job['subjects']
        if job['id'] == 'cnbarr01-shp':
            subjects = [dict(subjects[0], cell=[0, 0, 2048, 2048])]
        logical = job.get('layout', [2048, 2048])
        for subject in subjects:
            x, y, w, h = subject['cell']
            x0, y0 = round(x / logical[0] * width), round(y / logical[1] * height)
            x1, y1 = round((x + w) / logical[0] * width), round((y + h) / logical[1] * height)
            cell = master[y0:y1, x0:x1]
            valid = authored_coverage(cell, 180, fringe_guard=True)
            labels, count = ndimage.label(valid)
            assert count
            sizes = np.bincount(labels.ravel())
            sizes[0] = 0
            largest = int(sizes.argmax())
            selected = labels == largest
            for label, size in enumerate(sizes):
                if label and label != largest and size >= max(35, sizes[largest] * .004):
                    selected |= labels == label
            ys, xs = np.where(selected)
            left, top, right, bottom = int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)
            rgba = cell[top:bottom, left:right]
            valid = selected[top:bottom, left:right]
            rect = [x0 + left, y0 + top, right - left, bottom - top]
            alpha = rgba[..., 3].copy()
            alpha[~valid] = 0
            material = dict(plate=extrude(rgba[..., :3], valid), alpha=Image.fromarray(alpha),
                rect=rect, mother=pin(file), nativeBounds=subject['nativeBounds'],
                availableDensity=capacity(rect, subject['nativeBounds']))
            key = subject['member'], subject['slot']
            assert key not in result
            result[key] = material
            rows.append(dict(member=key[0], slot=key[1], mother=pin(file), rect=rect,
                nativeBounds=subject['nativeBounds'], availableDensity=material['availableDensity']))
        if job['id'] == 'cnbarr01-shp':
            result['cnbarr01.shp', 1] = result['cnbarr01.shp', 0]
    if ('cnnewy04.shp', 1) in result:
        result['cnnewy04.shp', 2] = result['cnnewy04.shp', 1]
    return result, rows, missing


if __name__ == '__main__':
    _, rows, missing = materials()
    for row in rows:
        print(row['member'], row['slot'], row['rect'][2:], round(row['availableDensity'], 3))
    print('Missing jobs:', missing)
