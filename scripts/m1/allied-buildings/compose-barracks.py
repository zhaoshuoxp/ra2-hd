"""Authored barracks with fixed ground, staggered roof deployment and cloth motion."""
import math
import sys
import numpy as np
from scipy.ndimage import label, find_objects
from PIL import Image, ImageDraw, ImageFilter
from production_common import DENSITY, normal_for, export_output, ROOT, row_for, decode, indices, register, sheet_cells, export_frames, sha
from master_regeneration import resolve_master

theater = sys.argv[1] if len(sys.argv) > 1 else 'TEMPERATE'
row = row_for('GAPILE', theater)
body, active, build = row['members']
size = tuple(body['canvas'])
hd_size = tuple(v * DENSITY for v in size)
blank = lambda: Image.new('RGBA', hd_size)
source = ROOT / 'production-art-v1/GAPILE/keys-raw.png'
cells = sheet_cells(Image.open(source).convert('RGBA'))
normal = normal_for(ROOT / 'review-v1/GAPILE-candidate-2x.png')
damaged, _ = register(cells[0], size, (74, 24, 204, 143))
snow_source = ROOT / 'production-art-v1/GAPILE/snow-raw.png'


def accepted_2x_registration(image, bounds):
    image = image.crop(image.getchannel('A').point(lambda a: 255 if a > 64 else 0).getbbox())
    x0, y0, x1, y1 = bounds
    scale = min((x1 - x0) / image.width, (y1 - y0) / image.height)
    target = tuple(round(v * scale * 2) for v in image.size)
    result = Image.new('RGBA', tuple(v * 2 for v in size))
    result.alpha_composite(image.resize(target, Image.Resampling.LANCZOS),
        (round((x0 + (x1 - x0) / 2) * 2 - target[0] / 2), y1 * 2 - target[1]))
    return result


reference_normal = Image.open(ROOT / 'review-v1/GAPILE-candidate-2x.png').convert('RGBA')
reference_damage = accepted_2x_registration(cells[0], (74, 24, 204, 143))
if theater == 'SNOW':
    snow = sheet_cells(Image.open(snow_source).convert('RGBA'), 2, 1)
    normal, _ = register(snow[0], size, (74, 18, 204, 143))
    damaged, _ = register(snow[1], size, (74, 24, 204, 143))
    reference_normal = accepted_2x_registration(snow[0], (74, 18, 204, 143))
    reference_damage = accepted_2x_registration(snow[1], (74, 24, 204, 143))


def polygon(image, points):
    mask = Image.new('L', hd_size)
    ImageDraw.Draw(mask).polygon([(round(x * DENSITY), round(y * DENSITY)) for x, y in points], fill=255)
    return clip(image, mask)


def clip(image, mask):
    result = image.copy()
    result.putalpha(Image.fromarray(np.uint8(np.array(image.getchannel('A'), float) * np.array(mask) / 255)))
    return result


def box(image, bounds):
    x0, y0, x1, y1 = bounds
    return polygon(image, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)])


def translate(image, dx=0, dy=0):
    out = blank()
    out.alpha_composite(image, (round(dx * DENSITY), round(dy * DENSITY)))
    return out


def native_mask(member, n, expand=1):
    mask = Image.fromarray(np.uint8(indices(member, n) != 0) * 255)
    if expand:
        mask = mask.filter(ImageFilter.MaxFilter(expand * 2 + 1))
    return mask.resize(hd_size, Image.Resampling.LANCZOS)


def width_register(image, x0, x1, bottom):
    # One-time master registration uses the fixed foundation width; a tall
    # temporary roof beam must not change the width of the two huts.
    image = image.crop(image.getchannel('A').point(lambda a: 255 if a > 64 else 0).getbbox())
    scale = (x1 - x0) * DENSITY / image.width
    target = (round(image.width * scale), round(image.height * scale))
    image = resolve_master(image, target).resize(target, Image.Resampling.LANCZOS)
    result = blank()
    result.alpha_composite(image, (x0 * DENSITY, bottom * DENSITY - image.height))
    return result


foundation = width_register(cells[1], 74, 204, 143)
mid = width_register(cells[2], 74, 204, 143)
# The fixed full-size slab is revealed through the native growing footprint.
# The dry foundation is never globally whitened. Snow uses only actual native
# snow deposits and the snow master's own white material samples.
def snow_deposits(image, member, n):
    if theater != 'SNOW':
        return image
    dry = row_for('GAPILE')
    dry_member = next(m for m in dry['members'] if m['roles'] == member['roles'])
    a, b = np.array(decode(row, member, n)), np.array(decode(dry, dry_member, n))
    rgb = a[..., :3].astype(float)
    mask = (rgb.min(axis=2) > 180) & (rgb.max(axis=2) - rgb.min(axis=2) < 45)
    mask &= np.max(np.abs(rgb - b[..., :3].astype(float)), axis=2) > 30
    grain = np.array(normal)
    samples = grain[(grain[..., :3].min(axis=2) > 205) & (grain[..., 3] > 240)]
    yy, xx = np.indices(hd_size[::-1])
    pixels = samples[(yy * 71 + xx * 13) % len(samples)].copy()
    pixels[..., 3] = np.array(Image.fromarray(np.uint8(mask) * 255).resize(hd_size, Image.Resampling.LANCZOS))
    pixels[..., 3] = np.minimum(pixels[..., 3], np.array(image.getchannel('A')))
    result = image.copy()
    result.alpha_composite(Image.fromarray(pixels))
    return result


def without_flag(image, damaged_state=False, reference=None):
    result = image.copy()
    # Keep the pole; remove only blue cloth and its antialiased dark edge.
    rgb = np.array(reference if DENSITY == 4 else image)
    yy, xx = np.indices(rgb.shape[:2])
    blue = ((rgb[..., 2] > rgb[..., 0] * 1.2) & (rgb[..., 2] > rgb[..., 1] * 1.12)
            & (yy < (62 if damaged_state else 41) * 2))
    mask = Image.fromarray(np.uint8(blue) * 255).filter(ImageFilter.MaxFilter(5))
    reference_cloth = clip(reference, mask) if DENSITY == 4 else clip(image, mask)
    region = reference_cloth.getbbox()
    if DENSITY == 4:
        mask = mask.resize(image.size, Image.Resampling.NEAREST)
        region = tuple(v * 2 for v in region)
    rgb = np.array(image)
    rgb[..., 3] = np.minimum(rgb[..., 3], 255 - np.array(mask))
    result = Image.fromarray(rgb)
    return result, clip(image, mask), region


normal_body, flag, flag_region = without_flag(normal, reference=reference_normal)
damage_body, torn_flag, torn_region = without_flag(damaged, True, reference_damage)
frames = {(body['source']['member'], n): normal_body if n == 0 else damage_body for n in range(3)}
for n in range(active['visibleFrames']):
    damaged_state = n >= 16
    cloth = torn_flag if damaged_state else flag
    region = torn_region if damaged_state else flag_region
    target = decode(row, active, n).getbbox()
    image = blank()
    if region and target:
        # Cloth is the only deformable object. Fit its own local native
        # envelope, leaving the pole, roof and foundation unchanged.
        patch = cloth.crop(region)
        patch = patch.resize(((target[2] - target[0]) * DENSITY, (target[3] - target[1]) * DENSITY), Image.Resampling.LANCZOS)
        image.alpha_composite(patch, (target[0] * DENSITY, target[1] * DENSITY))
    frames[active['source']['member'], n] = image

# Stationary lower hulls are isolated from the mid-deployment master.
rear_hull = polygon(mid, [(94, 84), (131, 66), (162, 84), (162, 108), (123, 128), (94, 111)])
front_hull = polygon(mid, [(130, 104), (168, 84), (197, 101), (197, 127), (160, 145), (130, 125)])
rear_roof = polygon(normal_body, [(93, 97), (105, 71), (140, 57), (157, 75), (157, 94), (122, 113)])
front_roof = polygon(normal_body, [(132, 118), (140, 91), (180, 77), (197, 96), (197, 117), (158, 134)])
mast = box(normal_body, (112, 16, 132, 75))
rear_beam = box(mid, (112, 59, 147, 82))
front_beam = polygon(mid, [(177, 99), (177, 91), (197, 46), (203, 49), (184, 99)])


def articulated_beam(n, rear):
    # Track the native *single rigid red beam*, never the whole building.
    # Its principal axes encode the isometric projection of its hinge motion.
    pix = indices(build, n)
    labels, _ = label((pix >= 16) & (pix <= 31))
    boxes = find_objects(labels)
    candidates = [(i + 1, b) for i, b in enumerate(boxes) if b
                  and (labels == i + 1).sum() > 140
                  and b[0].start < (60 if rear else 82)
                  and (b[1].start < 185 if rear else b[1].start > 164)]
    if not candidates:
        return blank()
    target_id, _ = min(candidates, key=lambda item: item[1][0].start)
    yy, xx = np.where(labels == target_id)
    target_points = np.column_stack([xx * DENSITY, yy * DENSITY]).astype(float)
    pixels = np.array(front_beam)
    keep = (pixels[..., 0] > pixels[..., 1] * 1.7) & (pixels[..., 0] > pixels[..., 2] * 1.7) & (pixels[..., 3] > 80)
    yy, xx = np.where(keep)
    source_points = np.column_stack([xx, yy]).astype(float)

    def axes(points):
        center = points.mean(axis=0)
        values, vectors = np.linalg.eigh(np.cov((points - center).T))
        if vectors[1, 1] < 0:
            vectors[:, 1] *= -1
        if np.linalg.det(vectors) < 0:
            vectors[:, 0] *= -1
        return center, vectors, np.sqrt(np.maximum(values, 1))

    sc, sv, ss = axes(source_points)
    tc, tv, ts = axes(target_points)
    forward = tv @ np.diag(ts / ss) @ sv.T
    inverse = np.linalg.inv(forward)
    offset = sc - inverse @ tc
    material_mask = Image.fromarray(np.uint8(keep) * 255).filter(ImageFilter.MaxFilter(DENSITY + 1))
    beam = clip(front_beam, material_mask)
    beam = beam.transform(hd_size, Image.Transform.AFFINE,
        (*inverse[0], offset[0], *inverse[1], offset[1]), Image.Resampling.BICUBIC)
    # Native beam attachment points and the authored shell sockets differ by
    # a few pixels. Register the complete beam to that socket once per hut.
    return translate(beam, dx=-10 if rear else -9, dy=7)


def unroll(roof, n, start, back):
    yy, xx = np.indices(hd_size[::-1])
    progress = np.clip((n - start + 1) / 7, 0, 1)
    # Reveal along the hut's longitudinal axis, retaining the authored shell
    # and its fixed ribs instead of fading or scaling a completed building.
    distance = -(xx / DENSITY - back[0]) * .82 + (yy / DENSITY - back[1]) * .57
    mask = Image.fromarray(np.uint8(distance <= progress * 54) * 255)
    return clip(roof, mask)

operations = []
for n in range(build['visibleFrames']):
    mask = native_mask(build, n)
    image = foundation.copy()
    beams = []
    for hull, start in ((rear_hull, 2), (front_hull, 5)):
        if n >= start:
            image.alpha_composite(translate(hull, dy=max(0, start + 3 - n) * 3))
    # Separate complete beams articulate around fixed sockets. Roof shells
    # emerge behind them, separately and with the native four-tick stagger.
    if 5 <= n < 11:
        beams.append(articulated_beam(n, True))
    if 9 <= n < 15:
        beams.append(articulated_beam(n, False))
    if n >= 8:
        image.alpha_composite(translate(mast, dy=max(0, 20 - n) * 3))
    for roof, start, back in ((rear_roof, 12, (151, 67)), (front_roof, 17, (190, 87))):
        if n >= start:
            image.alpha_composite(unroll(roof, n, start, back))
    image = clip(image, mask)
    for beam in beams:
        image.alpha_composite(beam)
    if n >= 21:
        image.alpha_composite(frames[active['source']['member'], min(14, n - 21)])
    if n == 24:
        image = normal.copy()
    else:
        image = snow_deposits(image, build, n)
    frames[build['source']['member'], n] = image
    operations.append({'frame': n, 'foundationTranslation': [0, 0], 'wholeBuildingScale': [1, 1],
                       'rearRoofStart': 12, 'frontRoofStart': 17, 'mastStart': 8, 'clothStart': 21})
out = ROOT / 'full-exports-v3' / ('GAPILE' if theater == 'TEMPERATE' else 'GAPILE-SNOW')
export_frames(row, frames, out, {'authoredKeysSha256': sha(source), 'snowMasterSha256': sha(snow_source),
                               'operations': operations, 'mechanism': 'Separate hulls, rigid roof beams, shell lift and cloth'})
print(theater, len(frames), 'barracks frames; visual QA pending')
