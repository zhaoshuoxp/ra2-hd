"""Complete-family atlas packing and accepted grass material registration."""
import hashlib
from functools import lru_cache
from pathlib import Path

import numpy as np
from scipy import ndimage
from newurban_batch93_io import assemble, atlas_pixels, native, pin, read, sha, write

ROOT = Path('.artifacts/m2-4/newurban-secondary-terrain-reuse-batch94-20261021')
GUIDE = Path('.artifacts/m2-4/newurban-native-v1')


@lru_cache(maxsize=8)
def terrain_pack(revision, digest):
    root = Path('.local/terrain-packs') / revision
    assert sha(root / 'manifest.json') == digest
    manifest = read(root / 'manifest.json')
    return root, manifest


def crop(pointer, name, slot, density):
    root, manifest = terrain_pack(pointer['revision'], pointer['sha256'])
    group, = [g for g in manifest['groups'] if any(m['member'] == name for m in g['members'])]
    variant, = [v for v in group['variants'] if v['density'] == density]
    offset = 0
    for member in group['members']:
        if member['member'] == name:
            offset += next(i for i, image in enumerate(member['images']) if image['subTile'] == slot)
            break
        offset += len(member['images'])
    x, y, w, h = variant['rects'][offset]
    pixels = atlas_pixels(str(root / variant['file']), variant['sha256'], tuple(variant['size']))
    return pixels[y:y + h, x:x + w].copy()


def layout(pieces, maximum_side=2048):
    unique, lookup, indices = [], {}, []
    for piece in pieces:
        key = piece.shape, hashlib.sha256(piece.tobytes()).hexdigest()
        if key not in lookup:
            lookup[key] = len(unique)
            unique.append(piece)
        indices.append(lookup[key])
    choices = []
    minimum = max(p.shape[1] + 4 for p in unique)
    for width in range((minimum + 3) // 4 * 4, maximum_side + 1, 4):
        x, y, height, rects = 2, 2, 0, []
        for piece in unique:
            h, w = piece.shape[:2]
            if x + w + 2 > width:
                x, y, height = 2, y + height + 4, 0
            rects.append([x, y, w, h])
            x += w + 4
            height = max(height, h)
        size = [width, y + height + 2]
        if size[1] <= maximum_side:
            choices.append((size[0] * size[1], size, rects))
    if not choices:
        return None
    _, size, rects = min(choices)
    return unique, indices, size, rects


def pack(destination, group, density, pieces, maximum_side=2048):
    placement = layout(pieces, maximum_side)
    assert placement, (group['id'], density)
    unique, indices, size, rects = placement
    pixels = np.zeros((*reversed(size), 4), np.uint8)
    for piece, (x, y, w, h) in zip(unique, rects, strict=True):
        pixels[y - 2:y + h + 2, x - 2:x + w + 2] = np.pad(
            piece, ((2, 2), (2, 2), (0, 0)), mode='edge')
    file = destination / f'{group["id"]}-{density}x.rgba'
    with file.open('xb') as stream:
        stream.write(pixels.tobytes())
    group['variants'].append(dict(density=density, file=file.name, size=size,
        rects=[rects[i] for i in indices], sha256=sha(file)))
    return dict(group=group['id'], density=density, slots=len(pieces), uniqueSamples=len(unique),
        size=size, rawBytes=file.stat().st_size)


def grass_field(pointer, density):
    accepted = crop(pointer, 'clear01.ubn', 0, density).astype(float)
    size = 60 * density
    v, u = (np.indices((size, size)) + .5) / size
    sx = (30 + 27 * (u - v)) * density - .5
    sy = (15 + 13.5 * (u + v - 1)) * density - .5
    field = np.stack([ndimage.map_coordinates(accepted[..., c], [sy, sx], order=1)
                      for c in range(3)], axis=2)
    assert ndimage.map_coordinates(accepted[..., 3], [sy, sx], order=0).min() > 0
    # Periodic-plus-smooth decomposition keeps accepted RGB detail and removes
    # only opposed-edge mismatch. No generated noise or native RGB is added.
    boundary = np.zeros_like(field)
    boundary[0] += field[0] - field[-1]
    boundary[-1] -= field[0] - field[-1]
    boundary[:, 0] += field[:, 0] - field[:, -1]
    boundary[:, -1] -= field[:, 0] - field[:, -1]
    fy, fx = np.indices((size, size))
    denominator = 2 * np.cos(2 * np.pi * fx / size) + 2 * np.cos(2 * np.pi * fy / size) - 4
    denominator[0, 0] = 1
    smooth_fft = np.fft.fft2(boundary, axes=(0, 1)) / denominator[..., None]
    smooth_fft[0, 0] = 0
    return field - np.fft.ifft2(smooth_fft, axes=(0, 1)).real


def adapt_grass(pixels, image, density, field):
    rgb = pixels[..., :3].astype(float)
    weight = np.clip((rgb[..., 1] - rgb[..., 0] * .95 - 3) / 18, 0, 1)
    weight *= np.clip((rgb[..., 1] - rgb[..., 2] - 15) / 35, 0, 1)
    weight = ndimage.gaussian_filter(weight, .25 * density, mode='nearest')
    yy, xx = np.indices(weight.shape)
    x = (xx + .5) / density + image['origin'][0] + image['offset'][0]
    y = (yy + .5) / density + image['origin'][1] + image['offset'][1]
    u, v = (x / 60 + y / 30 - .5) % 1, (-x / 60 + y / 30 + .5) % 1
    coords = [v * field.shape[0] - .5, u * field.shape[1] - .5]
    sampled = np.stack([ndimage.map_coordinates(field[..., c], coords, order=1, mode='grid-wrap')
                        for c in range(3)], axis=2)
    result = pixels.copy()
    result[..., :3] = np.rint(np.clip(rgb * (1 - weight[..., None])
                                    + sampled * weight[..., None], 0, 255)).astype(np.uint8)
    active = pixels[..., 3] > 0
    assert ((weight > .1) & active).any()
    assert np.array_equal(result[..., 3], pixels[..., 3])
    assert np.array_equal(result[weight == 0], pixels[weight == 0])
    return result, dict(changedVisiblePixels=int((np.any(result != pixels, axis=2) & active).sum()),
        unchangedOutsideAcceptedGrassWeight=True, nativeRgbUsedAsDetail=False)
