"""Small composition primitives; all motion is local to named authored parts."""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from production_common import DENSITY, normal_for, export_output, indices, row_for, decode


def clip(image, mask):
    result = image.copy()
    result.putalpha(Image.fromarray(np.uint8(np.array(image.getchannel('A'), float) * np.array(mask) / 255)))
    return result


def polygon(image, points):
    mask = Image.new('L', image.size)
    ImageDraw.Draw(mask).polygon([(round(x * DENSITY), round(y * DENSITY)) for x, y in points], fill=255)
    return clip(image, mask)


def rectangle(image, bounds):
    x0, y0, x1, y1 = bounds
    return polygon(image, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)])


def translate(image, dx=0, dy=0):
    result = Image.new('RGBA', image.size)
    result.alpha_composite(image, (round(dx * DENSITY), round(dy * DENSITY)))
    return result


def project_part(image, source_quad, target_quad):
    """Project one planar mechanical part between four authored hinge points."""
    source = np.array(source_quad, float) * DENSITY
    target = np.array(target_quad, float) * DENSITY
    equations, values = [], []
    for (x, y), (u, v) in zip(target, source):
        equations.extend([[x, y, 1, 0, 0, 0, -u * x, -u * y],
                          [0, 0, 0, x, y, 1, -v * x, -v * y]])
        values.extend([u, v])
    matrix = np.linalg.solve(np.array(equations), np.array(values))
    part = polygon(image, source_quad)
    return part.transform(image.size, Image.Transform.PERSPECTIVE, tuple(matrix), Image.Resampling.BICUBIC)


def native_mask(member, n, size, expand=1):
    mask = Image.fromarray(np.uint8(indices(member, n) != 0) * 255)
    if expand:
        mask = mask.filter(ImageFilter.MaxFilter(expand * 2 + 1))
    return mask.resize(size, Image.Resampling.LANCZOS)


def ground_planes(normal):
    occupied = np.array(normal.getchannel('A')) > 8
    columns = occupied.any(axis=0)
    floors = np.where(columns, occupied.shape[0] - 1 - occupied[::-1].argmax(axis=0), -1)
    yy = np.arange(occupied.shape[0])[:, None]
    ground = Image.fromarray(np.uint8((yy <= floors[None, :]) & columns[None, :]) * 255)
    foot = Image.fromarray(np.uint8((yy >= floors[None, :] - 5 * DENSITY) & columns[None, :]) * 255)
    return ground, clip(normal, foot)


def shade_lights(image, gain, kind='warm'):
    rgba = np.array(image)
    rgb = rgba[..., :3].astype(float)
    if kind == 'warm':
        emission = (rgb[..., 0] > 150) & (rgb[..., 1] > 75) & (rgb[..., 1] > rgb[..., 2] * 1.5)
    else:
        emission = (rgb[..., 2] > 140) & (rgb[..., 2] > rgb[..., 0] * 1.4)
    rgb[emission] *= gain
    rgba[..., :3] = np.uint8(np.clip(rgb, 0, 255))
    return Image.fromarray(rgba)


def active_lights(row, member, normal, damaged, kind='warm'):
    """Keep architecture fixed; only authored emission changes in native loops."""
    anim = next(a for a in row['animations'] if a['member'] == member['source']['member'])
    result, ranges = {}, []
    for state, master in (('normal', normal), ('damaged', damaged)):
        props = anim.get(state) or anim['normal']
        lo, hi = props['start'], props['loopEnd']
        ranges.append([lo, hi])
        support = np.zeros(member['canvas'][::-1], bool)
        for n in range(lo, hi + 1):
            support |= indices(member, n) != 0
        mask = Image.fromarray(np.uint8(support) * 255).filter(ImageFilter.MaxFilter(5)).resize(master.size, Image.Resampling.LANCZOS)
        for n in range(lo, hi + 1):
            gain = 1 - .15 * (1 - np.cos(2 * np.pi * (n - lo) / max(1, hi - lo + 1)))
            result[n] = clip(shade_lights(master, gain, kind), mask)
    # Native source tails outside the actual animation ranges are retained as
    # contract slots, with no duplicate blue shadow-color sprite. Shadows are
    # drawn by the original renderer, not by these color layers.
    for n in range(member['visibleFrames']):
        result.setdefault(n, Image.new('RGBA', normal.size))
    return result, ranges


def add_native_snow(row, member, n, image, snow_master, align_center=False):
    if row['theater'] != 'SNOW':
        return image
    dry = row_for(row['id'])
    # Multiple SUPER/ACTIVE members may share roles but have different frame
    # counts. Inventory order identifies the corresponding resolved member.
    peer = dry['members'][row['members'].index(member)]
    assert peer['roles'] == member['roles']
    dry_image = decode(dry, peer, n)
    if peer['canvas'] != member['canvas']:
        assert align_center, 'Distinct member canvas requires explicit centered mapping'
        dx, dy = [(peer['canvas'][i] - member['canvas'][i]) // 2 for i in range(2)]
        assert [dx * 2, dy * 2] == [peer['canvas'][i] - member['canvas'][i] for i in range(2)]
        dry_image = dry_image.crop((dx, dy, dx + member['canvas'][0], dy + member['canvas'][1]))
    a, b = np.array(decode(row, member, n)), np.array(dry_image)
    rgb = a[..., :3].astype(float)
    deposit = (rgb.min(axis=2) > 180) & (rgb.max(axis=2) - rgb.min(axis=2) < 45)
    deposit &= np.max(np.abs(rgb - b[..., :3].astype(float)), axis=2) > 30
    texture = np.array(snow_master)
    samples = texture[(texture[..., :3].min(axis=2) > 205) & (texture[..., 3] > 240)]
    assert len(samples), 'Snow master must contain snow material'
    yy, xx = np.indices(image.size[::-1])
    pixels = samples[(yy * 71 + xx * 13) % len(samples)].copy()
    pixels[..., 3] = np.array(Image.fromarray(np.uint8(deposit) * 255).resize(image.size, Image.Resampling.LANCZOS))
    pixels[..., 3] = np.minimum(pixels[..., 3], np.array(image.getchannel('A')))
    result = image.copy()
    result.alpha_composite(Image.fromarray(pixels))
    return result


def native_electricity(row, member, n):
    """Reuse the source electric ramp including white cores, without metal whites."""
    palette = indices(member, n)
    pixels = np.array(decode(row, member, n))
    mask = (palette == 240) | ((palette >= 250) & (palette <= 254))
    pixels[..., 3] = np.uint8(mask) * 255
    return Image.fromarray(pixels).resize(tuple(v * DENSITY for v in member['canvas']), Image.Resampling.LANCZOS)
