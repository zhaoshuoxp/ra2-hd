"""Lossless shelf packing and target-local accepted terrain registration."""
import hashlib
from pathlib import Path
import numpy as np
from scipy import ndimage
from newurban_batch94_io import adapt_grass, assemble, atlas_pixels, crop, grass_field, native, pin, read, sha, write

ROOT = Path('.artifacts/m2-4/newurban-remaining-terrain-reuse-batch95-20261021')
GUIDE = Path('.artifacts/m2-4/newurban-native-v1')


def layout(pieces, maximum_side=2048):
    unique, lookup, indices = [], {}, []
    for piece in pieces:
        key = piece.shape, hashlib.sha256(piece.tobytes()).hexdigest()
        if key not in lookup:
            lookup[key] = len(unique)
            unique.append(piece)
        indices.append(lookup[key])
    orders = {tuple(range(len(unique)))}
    for key in [lambda p: (-p.shape[0], -p.shape[1]), lambda p: (-p.shape[1], -p.shape[0]),
                lambda p: (-p.shape[0] * p.shape[1], -p.shape[0])]:
        orders.add(tuple(sorted(range(len(unique)), key=lambda index: key(unique[index]))))
    choices = []
    minimum = max(p.shape[1] + 4 for p in unique)
    for order in sorted(orders):
        for width in range((minimum + 3) // 4 * 4, maximum_side + 1, 4):
            x, y, height, rects = 2, 2, 0, [None] * len(unique)
            for index in order:
                h, w = unique[index].shape[:2]
                if x + w + 2 > width:
                    x, y, height = 2, y + height + 4, 0
                rects[index] = [x, y, w, h]
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


def register_canvas(pixels, target, donor, density):
    result = np.zeros((*reversed([n * density for n in target['size']]), 4), np.uint8)
    x, y = ((np.array(donor['offset']) - target['offset']) * density).astype(int)
    sx, sy, dx, dy = max(0, -x), max(0, -y), max(0, x), max(0, y)
    w = min(pixels.shape[1] - sx, result.shape[1] - dx)
    h = min(pixels.shape[0] - sy, result.shape[0] - dy)
    assert w > 0 and h > 0
    result[dy:dy + h, dx:dx + w] = pixels[sy:sy + h, sx:sx + w]
    return result


def project_grass(pixels, image, density, field, weight):
    yy, xx = np.indices(weight.shape)
    x = (xx + .5) / density + image['origin'][0] + image['offset'][0]
    y = (yy + .5) / density + image['origin'][1] + image['offset'][1]
    u, v = (x / 60 + y / 30 - .5) % 1, (-x / 60 + y / 30 + .5) % 1
    coords = [v * field.shape[0] - .5, u * field.shape[1] - .5]
    sampled = np.stack([ndimage.map_coordinates(field[..., channel], coords, order=1, mode='grid-wrap')
                        for channel in range(3)], axis=2)
    result = pixels.copy()
    result[..., :3] = np.rint(np.clip(pixels[..., :3] * (1 - weight[..., None])
                                    + sampled * weight[..., None], 0, 255)).astype(np.uint8)
    assert np.array_equal(result[..., 3], pixels[..., 3])
    assert np.array_equal(result[weight == 0], pixels[weight == 0])
    return result


ROCK_MATERIAL_CONTOURS_4X = {
    'cliffx33.ubn': [[(48,61),(61,49),(82,44),(98,53),(105,42),(121,29),(137,30),
        (148,41),(150,59),(142,70),(132,74),(138,82),(130,91),(113,86),(104,80),
        (99,89),(84,87),(76,80),(63,76),(60,68),(49,67)]],
    'cliffx34.ubn': [
        [(110,13),(132,13),(145,21),(140,31),(123,33),(110,27)],
        [(123,32),(144,28),(155,36),(150,47),(135,55),(119,49)],
        [(94,49),(113,45),(123,51),(119,63),(101,69),(92,62)],
        [(79,76),(97,68),(115,66),(133,72),(135,85),(126,96),(111,100),
         (94,99),(80,90)],
        [(137,56),(147,50),(157,53),(158,61),(147,67),(135,63)],
        [(62,62),(76,59),(83,64),(79,73),(64,74)]],
    'cliffx39.ubn': [
        [(114,7),(133,7),(150,17),(156,31),(147,41),(132,38),(121,28)],
        [(83,24),(98,16),(110,18),(115,29),(104,39),(86,44),(79,35)],
        [(147,31),(165,33),(172,42),(167,53),(149,56),(137,46)],
        [(121,43),(136,40),(148,49),(154,66),(151,79),(145,87),(130,83),
         (120,71),(114,55)],
        [(73,54),(92,50),(104,59),(114,59),(118,70),(108,82),(100,86),
         (96,94),(82,94),(74,83),(61,78),(57,65)]],
    'cliffx40.ubn': [[(77,98),(75,86),(82,64),(90,45),(103,25),(121,16),
        (135,10),(140,16),(138,34),(134,53),(123,72),(107,88),(94,98),(84,103)]]
}


def adapt_rock_ground(pixels, image, density, field):
    from PIL import Image, ImageDraw
    polygons = ROCK_MATERIAL_CONTOURS_4X[image['member']]
    supersample = 4
    h, w = pixels.shape[:2]
    mask = Image.new('L', (w * supersample, h * supersample))
    draw = ImageDraw.Draw(mask)
    for polygon in polygons:
        points = np.array(polygon, dtype=float) / 4 * density * supersample
        for _ in range(2):
            following = np.roll(points, -1, axis=0)
            points = np.stack((points * .75 + following * .25,
                               points * .25 + following * .75), axis=1).reshape(-1, 2)
        draw.polygon([tuple(point) for point in points], fill=255)
    rock = np.asarray(mask.resize((w,h),Image.Resampling.LANCZOS)).astype(float) / 255
    rock = ndimage.gaussian_filter(rock, .25 * density, mode='nearest')
    weight = np.clip(1 - rock, 0, 1)
    result = project_grass(pixels, image, density, field, weight)
    return result, dict(policy='ACCEPTED_HD_ROCK_MATERIAL_CONTOURS_WITH_TARGET_HD_GRASS',
        resourceLocalContour=True, mapCoordinatesUsed=False, originalRgbUsedAsDetail=False,
        acceptedRockCorePixels=int((rock>.999).sum()),
        exactAcceptedRockCore=bool(np.array_equal(result[rock>=1], pixels[rock>=1])),
        changedPixels=int(((weight>0)&(pixels[...,3]>0)).sum()))


def adapt_cliff_grass(pixels, image, density, field):
    rgb = pixels[..., :3].astype(float)
    weight = np.clip((rgb[..., 1] - rgb[..., 0] * .95 - 3) / 18, 0, 1)
    weight *= np.clip((rgb[..., 1] - rgb[..., 2] - 15) / 35, 0, 1)
    weight = ndimage.gaussian_filter(weight, .25 * density, mode='nearest')
    result = project_grass(pixels, image, density, field, weight)
    return result, dict(policy='ACCEPTED_HD_GRASS_WEIGHT_WITH_TARGET_REGISTERED_HD_MATERIAL',
        changedVisiblePixels=int((np.any(result != pixels, axis=2) & (pixels[..., 3] > 0)).sum()),
        visibleWeightAboveOneTenth=int(((weight > .1) & (pixels[..., 3] > 0)).sum()),
        nativeRgbUsedAsDetail=False, unchangedOutsideGrassWeight=True)
