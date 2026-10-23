"""Sample complete authored materials, using native art only for semantic masks."""
import hashlib
import json
import sys
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

style = next(arg.split('=', 1)[1] for arg in sys.argv if arg.startswith('--style='))
root = Path('.artifacts/m2-1/authoring-v7')
source = json.loads((root / 'export-input.json').read_text())
members = {m['member']: m for g in source['groups'] for m in g['members']}
layouts = json.loads((root / 'assembly-layout.json').read_text())
provenance = dict(style=style,
    method='Complete authored RGB materials; native semantic transition masks, shared grass across slopes and fixups',
    color='Global material palette anchors; no per-tile color correction or nearest-native edge strip',
    structure='Whole Cliff03/04 and Ramp01 paintings; nearest opaque RGB extrusion before native cutting',
    unchanged='Native alpha, geometry, offsets, lighting and zero-offset placeholder pixels', masters=[])
if style == 'e':
    provenance['groundAlbedo'] = 'Subtract 32-source-pixel Gaussian broad illumination from grass/soil only before periodic sampling; retain native global material means'


def native(member, image):
    file = Path('.artifacts/m2-1/inventory/native') / f"{member['nativeName']}-{image['subTile']}.rgba"
    return Image.frombytes('RGBA', tuple(image['logical']), file.read_bytes())


def native_mean(name):
    m = members[name]
    a = np.asarray(native(m, m['images'][0]))
    return a[a[:, :, 3] > 0, :3].mean(axis=0)


def periodic(pixels):
    h, w = pixels.shape[:2]
    boundary = np.zeros_like(pixels)
    boundary[0] = pixels[-1] - pixels[0]
    boundary[-1] = -boundary[0]
    boundary[:, 0] += pixels[:, -1] - pixels[:, 0]
    boundary[:, -1] -= pixels[:, -1] - pixels[:, 0]
    denominator = 2 * np.cos(2 * np.pi * np.arange(h)[:, None] / h)
    denominator = denominator + 2 * np.cos(2 * np.pi * np.arange(w)[None, :] / w) - 4
    denominator[0, 0] = 1
    frequency = np.fft.fft2(boundary, axes=(0, 1)) / denominator[:, :, None]
    frequency[0, 0] = 0
    return pixels - np.fft.ifft2(frequency, axes=(0, 1)).real


def fill_rgb(image):
    """Extend real edge colors into transparent RGB before any resampling."""
    rgba = np.asarray(image)
    rgb = rgba[:, :, :3].astype(np.float32).copy()
    valid = rgba[:, :, 3] > 180
    if not valid.any():
        raise ValueError('Empty authored sprite')
    # Transparent RGB is not artwork; propagating nearby opaque colors prevents
    # black corners when the immutable native mask differs by a few pixels.
    while not valid.all():
        previous = valid.copy()
        accum = np.zeros_like(rgb)
        count = np.zeros(valid.shape, dtype=np.float32)
        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            mask = np.roll(previous, (dy, dx), axis=(0, 1))
            if dy < 0: mask[dy:] = False
            if dy > 0: mask[:dy] = False
            if dx < 0: mask[:, dx:] = False
            if dx > 0: mask[:, :dx] = False
            use = ~previous & mask
            accum[use] += np.roll(rgb, (dy, dx), axis=(0, 1))[use]
            count[use] += 1
        use = count > 0
        rgb[use] = accum[use] / count[use, None]
        valid |= use
    return rgb


def record(file):
    provenance['masters'].append(dict(file=str(file), sha256=hashlib.sha256(file.read_bytes()).hexdigest()))


file = root / f'ground-{style}-master.png'
record(file)
material = Image.open(file).convert('RGB')
half = material.width // 2
swatches = []
for i, name in enumerate(['clear01.tem', 'green01.tem', 'sandy01.tem', 'dlat08.tem']):
    x, y = (i % 2) * half, (i // 2) * half
    crop = material.crop((x, y, x + half, y + half))
    field = np.asarray(crop, dtype=np.float32)
    if style == 'e' and i < 2:
        # A repeating ground swatch is an albedo field, not a lit raised tile.
        # Remove baked broad illumination before wrapping, leaving authored
        # fine material. Structural rock plates keep their complete shading.
        broad = np.asarray(crop.filter(ImageFilter.GaussianBlur(32)), dtype=np.float32)
        field = field - broad + broad.mean(axis=(0, 1))
    field = periodic(field)
    field += native_mean(name) - field.mean(axis=(0, 1))
    swatches.append(np.clip(field, 0, 255))

plates = {}
file = root / f'cliff-{style}-master.png'
record(file)
master = Image.open(file).convert('RGBA')
for i, name in enumerate(['cliff03.tem', 'cliff04.tem']):
    column = master.crop((i * master.width // 2, 0, (i + 1) * master.width // 2, master.height))
    rect = column.getchannel('A').point(lambda a: 255 if a > 180 else 0).getbbox()
    crop = column.crop(rect)
    plates[name] = Image.fromarray(fill_rgb(crop).astype(np.uint8))
file = root / f'ramp-{style}-master.png'
if not file.exists():
    file = root / 'ramp-master.png'
record(file)
master = Image.open(file).convert('RGBA')
rect = master.getchannel('A').point(lambda a: 255 if a > 180 else 0).getbbox()
plates['ramp01.tem'] = Image.fromarray(fill_rgb(master.crop(rect)).astype(np.uint8))
for name, plate in list(plates.items()):
    info = layouts[name]
    a = info['nativeAlphaBounds']
    capacity = min(plate.width / (a[2] - a[0]), plate.height / (a[3] - a[1]))
    if capacity < 4:
        raise ValueError(f'Inadequate 4X master: {name}: {capacity}')
    reference = np.asarray(Image.open(root / f'{name}-native.png').convert('RGBA'))
    covered = reference[a[1]:a[3], a[0]:a[2], 3] > 0
    mean = reference[a[1]:a[3], a[0]:a[2], :3][covered].mean(axis=0)
    projected = np.asarray(plate.resize((a[2] - a[0], a[3] - a[1]), Image.Resampling.LANCZOS),
                           dtype=np.float32)
    pixels = np.asarray(plate, dtype=np.float32)
    pixels += mean - projected[covered].mean(axis=0)
    plates[name] = Image.fromarray(np.clip(pixels, 0, 255).astype(np.uint8))
    provenance['masters'].append(dict(member=name, densityCapacity=capacity))


@lru_cache(maxsize=2)
def material_fields(density):
    # Prefilter each independent density before isometric sampling. Directly
    # picking distant master pixels aliases fine grass into false speckle.
    size = (60 * density, 60 * density)
    return [np.asarray(Image.fromarray(field.astype(np.uint8)).resize(size, Image.Resampling.LANCZOS),
                       dtype=np.float32) for field in swatches]


def sample_field(field, u, v):
    h, w = field.shape[:2]
    sx, sy = u * w, v * h
    x0, y0 = np.floor(sx).astype(int), np.floor(sy).astype(int)
    fx, fy = (sx - x0)[:, :, None], (sy - y0)[:, :, None]
    return ((field[y0 % h, x0 % w] * (1 - fx) + field[y0 % h, (x0 + 1) % w] * fx) * (1 - fy)
            + (field[(y0 + 1) % h, x0 % w] * (1 - fx)
               + field[(y0 + 1) % h, (x0 + 1) % w] * fx) * fy)


def project_style(member, image, density):
    original = native(member, image)
    size = tuple(n * density for n in original.size)
    nearest = np.asarray(original.resize(size, Image.Resampling.NEAREST))
    alpha = nearest[:, :, 3]
    y, x = np.indices(alpha.shape, dtype=np.float32)
    nx = x / density + image['origin'][0] + image['offset'][0]
    ny = y / density + image['origin'][1] + image['offset'][1] - image['height'] * 15
    u, v = np.mod(nx / 60 + ny / 30 - .5, 1), np.mod(ny / 30 - nx / 60 + .5, 1)
    fields = [sample_field(field, u, v) for field in material_fields(density)]
    original_rgb = np.asarray(original)[:, :, :3].astype(np.float32)
    grass = np.clip((original_rgb[:, :, 1] - original_rgb[:, :, 0] + 10) / 22, 0, 1)
    mask = np.asarray(Image.fromarray((grass * 255).astype(np.uint8)).resize(size, Image.Resampling.BICUBIC),
                      dtype=np.float32)[:, :, None] / 255
    name = member['member']
    if member['nativeOffsets'][image['subTile']] <= 0:
        rgb = nearest[:, :, :3].astype(np.float32)
    elif name in plates:
        info = layouts[name]
        a = info['nativeAlphaBounds']
        full = Image.new('RGB', (info['bounds'][2] * density, info['bounds'][3] * density))
        full.paste(plates[name].resize(((a[2] - a[0]) * density, (a[3] - a[1]) * density),
                                      Image.Resampling.LANCZOS), (a[0] * density, a[1] * density))
        x, y, w, h = [n * density for n in next(p['rect'] for p in info['parts']
                                               if p['subTile'] == image['subTile'])]
        rgb = np.asarray(full.crop((x, y, x + w, y + h)), dtype=np.float32)
        # Keep grass contiguous with the shared ground material. Native masks
        # select the surface, while the authored rock painting retains its forms.
        grass_surface = np.clip((nearest[:, :, 1].astype(float) - nearest[:, :, 0] - 3) / 10, 0, 1)
        grass_surface = np.asarray(Image.fromarray((grass_surface * 255).astype(np.uint8))
                                   .filter(ImageFilter.GaussianBlur(density * .4)), dtype=np.float32)[:, :, None] / 255
        rgb = rgb * (1 - grass_surface) + fields[0] * grass_surface
    elif member['setIndex'] == 41:
        rgb = fields[1]
    elif member['setIndex'] == 42:
        rgb = fields[0] * mask + fields[1] * (1 - mask)
    elif member['setIndex'] == 33:
        rgb = fields[2]
    elif member['setIndex'] == 34:
        rgb = fields[0] * mask + fields[3] * (1 - mask)
    else:
        # Clear, slopes and ramp fixups use one continuous authored surface.
        # No tile-shaped plate stretching, per-variant tint or native border band.
        rgb = fields[0]
    result = np.empty((*alpha.shape, 4), dtype=np.uint8)
    result[:, :, :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    result[:, :, 3] = alpha
    valid = alpha > 0
    for _ in range(2):
        previous = valid.copy()
        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            neighbor = np.roll(previous, (dy, dx), axis=(0, 1))
            if dy < 0: neighbor[dy:] = False
            if dy > 0: neighbor[:dy] = False
            if dx < 0: neighbor[:, dx:] = False
            if dx > 0: neighbor[:, :dx] = False
            fill = ~valid & neighbor
            result[fill, :3] = np.roll(result[:, :, :3], (dy, dx), axis=(0, 1))[fill]
            valid |= fill
    return Image.fromarray(result)
