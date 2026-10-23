"""Export authored feedback corrections with native color and boundary anchors."""
import hashlib
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

root = Path('.artifacts/m2-1/authoring-v5')
boundary_repair = '--boundary-repair' in sys.argv
native_root = Path('.artifacts/m2-1/inventory/native')
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
material = Image.open(root / 'ground-master.png').convert('RGB')
# The generated soil panel ends above the other panel dividers.
material_rects = [[0, 0, 627, 627], [627, 0, 1254, 596],
                  [0, 627, 627, 1254], [627, 596, 1254, 1254]]
swatches = [np.asarray(material.crop(tuple(rect)), dtype=np.float32) for rect in material_rects]
layouts = json.loads((root / 'assembly-layout.json').read_text())
provenance = dict(method='Native RGB topology anchor plus authored material bands; no blurred color-class replacement',
                  material=dict(file=str(root / 'ground-master.png'), sha256=sha(root / 'ground-master.png'),
                                size=list(material.size), crops=material_rects),
                  palette='Preserve covered native RGB means and native edge colors independently per member',
                  structural='Direct coordinated slope and complete ramp paintings, cut at native positions',
                  masters=[], paletteChecks=[])
provenance['boundaryRepair'] = boundary_repair
provenance['detailPolicy'] = ('Authored middle-frequency detail with native structural boundary colors'
                             if boundary_repair else 'Initial high-frequency material band')
plates = {}
slopes = Image.open(root / 'slopes-master.png').convert('RGBA')
for index, name in enumerate(['slope01.tem', 'slope02.tem', 'slope03.tem', 'slope04.tem']):
    x, y = (index % 2) * (slopes.width // 2), (index // 2) * (slopes.height // 2)
    column = slopes.crop((x, y, x + slopes.width // 2, y + slopes.height // 2))
    rect = column.getchannel('A').point(lambda a: 255 if a > 180 else 0).getbbox()
    crop = column.crop(rect)
    plates[name] = crop.convert('RGB')
    provenance['masters'].append(dict(member=name, file=str(root / 'slopes-master.png'),
                                      sha256=sha(root / 'slopes-master.png'), crop=rect, size=list(crop.size)))
ramp = Image.open(root / 'ramp-master.png').convert('RGBA')
rect = ramp.getchannel('A').point(lambda a: 255 if a > 180 else 0).getbbox()
plates['ramp01.tem'] = ramp.crop(rect).convert('RGB')
provenance['masters'].append(dict(member='ramp01.tem', file=str(root / 'ramp-master.png'),
                                  sha256=sha(root / 'ramp-master.png'), crop=rect,
                                  size=list(plates['ramp01.tem'].size)))


def expand_rgb(image, size, resample=Image.Resampling.BICUBIC):
    pixels = np.asarray(image)
    rgb = pixels[:, :, :3].copy()
    valid = pixels[:, :, 3] > 0
    if valid.any():
        rgb[~valid] = rgb[valid].mean(axis=0).astype(np.uint8)
    return np.asarray(Image.fromarray(rgb).resize(size, resample), dtype=np.float32)


def color_anchor(rgb, source, valid):
    target = source[valid].mean(axis=0)
    for _ in range(3):
        rgb = np.clip(rgb + target - rgb[valid].mean(axis=0), 0, 255)
    return rgb


# Calibrate the whole structural assembly once, before any subtile cuts.
ramp_info = layouts['ramp01.tem']
native_ramp = Image.new('RGBA', tuple(ramp_info['bounds'][2:]))
for part in sorted(ramp_info['parts'], key=lambda p: p['rect'][1]):
    w, h = part['rect'][2:]
    file = native_root / f"RAMP01.tem-{part['subTile']}.rgba"
    native_ramp.alpha_composite(Image.frombytes('RGBA', (w, h), file.read_bytes()), tuple(part['rect'][:2]))
a = ramp_info['nativeAlphaBounds']
reference = native_ramp.crop(tuple(a))
size = plates['ramp01.tem'].size
target = expand_rgb(reference, size, Image.Resampling.NEAREST)
valid = np.asarray(reference.getchannel('A').resize(size, Image.Resampling.NEAREST)) > 0
calibrated = color_anchor(np.asarray(plates['ramp01.tem'], dtype=np.float32), target, valid)
if boundary_repair:
    scale = size[0] / reference.width
    painted = np.asarray(Image.fromarray(calibrated.astype(np.uint8)).filter(ImageFilter.GaussianBlur(scale * 3)),
                         dtype=np.float32)
    native_smooth = np.asarray(Image.fromarray(target.astype(np.uint8)).filter(ImageFilter.GaussianBlur(scale * 3)),
                              dtype=np.float32)
    calibrated = np.clip(calibrated + native_smooth - painted, 0, 255)
    # Blend only the outer assembly boundary; internal subtile cuts remain continuous.
    mask = reference.getchannel('A').resize(size, Image.Resampling.NEAREST)
    radius = max(1, round(scale))
    inner = np.asarray(mask.filter(ImageFilter.MinFilter(radius * 2 + 1)), dtype=np.float32) / 255
    calibrated = calibrated * inner[:, :, None] + target * (1 - inner[:, :, None])
plates['ramp01.tem'] = Image.fromarray(calibrated.astype(np.uint8))


def project_feedback(member, image, density):
    width, height = image['logical']
    native = Image.frombytes('RGBA', (width, height),
                            (native_root / f"{member['nativeName']}-{image['subTile']}.rgba").read_bytes())
    size = (width * density, height * density)
    alpha = np.asarray(native.getchannel('A').resize(size, Image.Resampling.NEAREST))
    covered = alpha > 0
    guide = expand_rgb(native, size)
    nearest = expand_rgb(native, size, Image.Resampling.NEAREST)
    name = re.sub(r'^(slope0[1-4])[a-c](\.tem)$', r'\1\2', member['member'])
    if member['nativeOffsets'][image['subTile']] <= 0:
        rgb = nearest
    elif name == 'ramp01.tem':
        info = layouts[name]
        a = info['nativeAlphaBounds']
        plate = plates[name]
        capacity = min(plate.width / (a[2] - a[0]), plate.height / (a[3] - a[1]))
        if capacity < 4:
            raise ValueError(f'Insufficient ramp master density: {capacity}')
        full = Image.new('RGB', (info['bounds'][2] * density, info['bounds'][3] * density))
        full.paste(plate.resize(((a[2] - a[0]) * density, (a[3] - a[1]) * density),
                               Image.Resampling.LANCZOS), (a[0] * density, a[1] * density))
        x, y, w, h = [n * density for n in next(p['rect'] for p in info['parts']
                                               if p['subTile'] == image['subTile'])]
        rgb = np.asarray(full.crop((x, y, x + w, y + h)), dtype=np.float32)
    elif name in plates:
        plate = plates[name]
        a = native.getbbox()
        if min(plate.width / (a[2] - a[0]), plate.height / (a[3] - a[1])) < 4:
            raise ValueError(f'Insufficient slope master density: {name}')
        complete = Image.new('RGB', size)
        complete.paste(plate.resize(((a[2] - a[0]) * density, (a[3] - a[1]) * density),
                                   Image.Resampling.LANCZOS), (a[0] * density, a[1] * density))
        rgb = np.asarray(complete, dtype=np.float32)
        if boundary_repair:
            authored = np.asarray(complete.filter(ImageFilter.GaussianBlur(density * 3)), dtype=np.float32)
            native_smooth = np.asarray(Image.fromarray(guide.astype(np.uint8))
                                       .filter(ImageFilter.GaussianBlur(density * 3)), dtype=np.float32)
            rgb = np.clip(rgb + native_smooth - authored, 0, 255)
            inner = np.asarray(native.getchannel('A').resize(size, Image.Resampling.NEAREST)
                               .filter(ImageFilter.MinFilter(density * 2 + 1)), dtype=np.float32) / 255
            rgb = rgb * inner[:, :, None] + nearest * (1 - inner[:, :, None])
        rgb = color_anchor(rgb, nearest, covered)
    else:
        y, x = np.indices(alpha.shape, dtype=np.float32)
        nx = x / density + image['origin'][0] + image['offset'][0]
        ny = y / density + image['origin'][1] + image['offset'][1] - image['height'] * 15
        u, v = np.mod(nx / 60 + ny / 30 - .5, 1), np.mod(ny / 30 - nx / 60 + .5, 1)
        samples = [pixels[(v * (pixels.shape[0] - 1)).astype(int),
                          (u * (pixels.shape[1] - 1)).astype(int)] for pixels in swatches]
        # Native color selects only detail type. It never replaces the RGB topology.
        grass = np.clip((nearest[:, :, 1] - nearest[:, :, 0] + 15) / 35, 0, 1)
        if member['setIndex'] == 0:
            field = samples[0]
        elif member['setIndex'] == 41:
            field = samples[1]
        elif member['setIndex'] in [33, 34]:
            field = samples[2] if member['setIndex'] == 33 else samples[3]
        else:
            field = samples[0] * grass[:, :, None] + samples[1] * (1 - grass[:, :, None])
        smooth = np.asarray(Image.fromarray(np.clip(field, 0, 255).astype(np.uint8))
                            .filter(ImageFilter.GaussianBlur(density * 2.4)), dtype=np.float32)
        fine = np.asarray(Image.fromarray(np.clip(field, 0, 255).astype(np.uint8))
                          .filter(ImageFilter.GaussianBlur(density * .45)), dtype=np.float32) if boundary_repair else field
        rgb = color_anchor(guide + (fine - smooth) * (.65 if boundary_repair else .9), nearest, covered)
        # Native neighbors, including Original shoreline pieces, retain matching edge colors.
        edge = covered.copy()
        interior = covered.copy()
        for dy, dx in [(-density, 0), (density, 0), (0, -density), (0, density)]:
            shifted = np.roll(covered, (dy, dx), axis=(0, 1))
            if dy < 0: shifted[dy:] = False
            if dy > 0: shifted[:dy] = False
            if dx < 0: shifted[:, dx:] = False
            if dx > 0: shifted[:, :dx] = False
            interior &= shifted
        edge &= ~interior
        rgb[edge] = nearest[edge]
        provenance['paletteChecks'].append(dict(member=member['member'], subTile=image['subTile'], density=density,
            nativeMean=nearest[covered].mean(axis=0).tolist(), exportedMean=rgb[covered].mean(axis=0).tolist()))
    result = np.empty((*alpha.shape, 4), dtype=np.uint8)
    result[:, :, :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    result[:, :, 3] = alpha
    valid = covered.copy()
    for _ in range(2):
        previous = valid.copy()
        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1)]:
            neighbor = np.roll(previous, (dy, dx), axis=(0, 1))
            if dy < 0: neighbor[dy:] = False
            if dy > 0: neighbor[:dy] = False
            if dx < 0: neighbor[:, dx:] = False
            if dx > 0: neighbor[:, :dx] = False
            fill = ~valid & neighbor
            result[fill, :3] = np.roll(result[:, :, :3], (dy, dx), axis=(0, 1))[fill]
            valid |= fill
    return Image.fromarray(result)
