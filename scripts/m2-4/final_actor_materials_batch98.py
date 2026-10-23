"""Register continuous actor bodies separately from native ground and small ejected parts."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from newurban_batch89_io import pin, read, sha

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_registration import authored_coverage, capacity, extrude, independently_sample

ROOT = Path('.artifacts/m2-4/newurban-final-actors-batch98-20261021')


def native_parts(indices, ejected_parts=False, dinosaur_fragments=False):
    body = (indices != 0) & (indices != 12)
    labels, count = ndimage.label(body, np.ones((3, 3)))
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    main = int(sizes.argmax())
    selected = labels == main
    parts = []
    for label in range(1, count + 1):
        if label == main:
            continue
        ys, xs = np.where(labels == label)
        values = set(map(int, indices[ys, xs]))
        if ejected_parts and len(xs) <= 2 and values.issubset({179, 180, 244}):
            parts.append(dict(points=[[int(x), int(y)] for x, y in zip(xs, ys)],
                indices=[int(indices[y, x]) for x, y in zip(xs, ys)], kind='accepted-small-ejected-material'))
        elif dinosaur_fragments and len(xs) <= 3 and values.issubset({11, 55, 56, 57, 58, 59, 60, 61, 62, 95, 167, 199}):
            parts.append(dict(points=[[int(x), int(y)] for x, y in zip(xs, ys)],
                indices=[int(indices[y, x]) for x, y in zip(xs, ys)], kind='isolated-original-component'))
        else:
            selected |= labels == label
    bounds = Image.fromarray(selected.astype(np.uint8) * 255).getbbox()
    assert bounds
    return bounds, selected, parts


def material(job, subject, indices):
    file = Path(job['destination'])
    receipt = read(ROOT / (job['id'] + '-mother-receipt-v1.json'))
    assert pin(file) == receipt['retained']
    image = Image.open(file).convert('RGBA')
    x, y, width, height = subject['cell']
    sx, sy = image.width / 2048, image.height / 2048
    cell = np.array(image.crop((round(x * sx), round(y * sy), round((x + width) * sx), round((y + height) * sy))))
    valid = authored_coverage(cell, 180, fringe_guard=True)
    labels, _ = ndimage.label(valid)
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    dominant = int(sizes.argmax())
    assert sizes[dominant] > 200
    selected = labels == dominant
    for label, size in enumerate(sizes):
        if label and label != dominant and size >= max(50, sizes[dominant] * .005):
            selected |= labels == label
    ys, xs = np.where(selected)
    rect = [int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)]
    left, top, w, h = rect
    pixels = cell[top:top + h, left:left + w]
    mask = selected[top:top + h, left:left + w]
    plate = extrude(pixels[..., :3], mask)
    alpha = pixels[..., 3].copy()
    alpha[~mask] = 0
    bounds, native_body, parts = native_parts(indices, job['member'] == 'civ1.shp', job['member'] == 'dnoa.shp')
    measured = capacity(rect, bounds)
    assert measured >= 4.0, (subject['key'], measured, rect, bounds)
    return dict(plate=plate, alpha=Image.fromarray(alpha), nativeBounds=bounds, nativeBody=native_body,
        parts=parts, evidence=dict(key=subject['key'], mother=pin(file), generatedCell=subject['cell'],
            cropWithinCell=rect, nativeBodyBounds=list(bounds), capacity=measured,
            detachedNativeParts=parts, nativeBodyRgbCopied=0, nativeBodyMaskStamped=False))


def frame(material, indices, palette, density, remapable):
    left, top, right, bottom = material['nativeBounds']
    height, width = indices.shape
    rgb = independently_sample(material['plate'], ((right - left) * density, (bottom - top) * density))
    alpha = np.asarray(material['alpha'].resize((rgb.shape[1], rgb.shape[0]), Image.Resampling.LANCZOS))
    native_mean = palette[indices][material['nativeBody']].mean(0)
    authored_mean = rgb[alpha >= 180].mean(0)
    gain = .25 + .75 * native_mean / np.maximum(authored_mean, 1)
    body = np.zeros((height * density, width * density, 4), np.uint8)
    body[top * density:bottom * density, left * density:right * density] = np.dstack((np.uint8(np.clip(rgb * gain, 0, 255)), alpha))
    data = np.zeros_like(body)
    data[..., 3] = 255
    # Infantry's existing embedded-shadow path reconstructs the untouched native
    # index-12 ground footprint. It is not new authored body detail.
    contact = (indices == 12).repeat(density, 0).repeat(density, 1)
    body[contact] = [*palette[12], 255]
    if remapable:
        owner = (indices >= 16) & (indices <= 31)
        if owner.any():
            from showcase_contours import coverage
            mask = coverage(owner, density, linear_strips=True)
            mask[body[..., 3] == 0] = 0
            nearest = ndimage.distance_transform_edt(~owner, return_distances=False, return_indices=True)
            shades = (indices[tuple(nearest)] - 16).repeat(density, 0).repeat(density, 1)
            data[..., 0] = mask
            data[..., 1] = np.where(mask > 0, shades, 0)
    if any(part['kind'] == 'accepted-small-ejected-material' for part in material['parts']):
        declaration = read('.artifacts/m2-4/urban-actors-authoring-batch62-v1/material-profile-v2.json')['nativeAcceptedSubpixelMaterials']['ssrv.shp']
        for part in material['parts']:
            if part['kind'] != 'accepted-small-ejected-material':
                continue
            role = 'brass' if set(part['indices']).issubset({179, 180}) else 'white'
            donor = declaration['materials'][role]['variants'][str(density)]
            assert sha(donor['file']) == donor['sha256']
            x, y, w, h = donor['rect']
            sample = np.array(Image.open(donor['file']).convert('RGBA'))[y:y + h, x:x + w]
            for px, py in part['points']:
                sample = sample.copy()
                tone = palette[indices[py, px]] / np.maximum(sample[..., :3].mean((0, 1)), 1)
                sample[..., :3] = np.uint8(np.clip(sample[..., :3] * tone, 0, 255))
                aa = Image.new('L', (density * 8, density * 8))
                ImageDraw.Draw(aa).ellipse((0, 1, density * 8 - 1, density * 8 - 2), fill=255)
                sample[..., 3] = np.asarray(aa.resize((density, density), Image.Resampling.LANCZOS))
                body[py * density:(py + 1) * density, px * density:(px + 1) * density] = sample
    for part in material['parts']:
        if part['kind'] != 'isolated-original-component':
            continue
        # These original one-to-three-pixel components are physically detached
        # from the animal. They keep their positions, colors and equal-area
        # continuous contours instead of stretching the entire HD animal toward
        # a distant point or being copied as enlarged native squares.
        from newurban_rubble_r1_materials import rubble_coverage
        points = np.asarray(part['points'], int)
        low, high = points.min(0), points.max(0) + 1
        mask = np.zeros(indices.shape, np.uint8)
        mask[points[:, 1], points[:, 0]] = 1
        alpha, _ = rubble_coverage(mask, density)
        px, py = low * density
        w, h = (high - low) * density
        patch = material['plate'][:max(h, 16), :max(w, 16)]
        texture = independently_sample(patch, (w, h))
        target = palette[np.asarray(part['indices'])].mean(0)
        gain = target / np.maximum(texture.mean((0, 1)), 1)
        texture = np.uint8(np.clip(texture * gain, 0, 255))
        selected = alpha[py:py + h, px:px + w] > 0
        view = body[py:py + h, px:px + w]
        view[..., :3][selected] = texture[selected]
        view[..., 3][selected] = alpha[py:py + h, px:px + w][selected]
    body[..., :3][body[..., 3] == 0] = 0
    return body, data
