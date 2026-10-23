"""Fixed Chronosphere foundation, local retracting shell and native effect timing."""
import sys
import numpy as np
from PIL import Image, ImageFilter
from production_common import DENSITY, normal_for, export_output, ROOT, row_for, decode, resting, register, sheet_cells, export_frames, sha
from mechanical_common import clip, polygon, rectangle, translate, native_mask, project_part, ground_planes, add_native_snow, native_electricity

theater = sys.argv[1] if len(sys.argv) > 1 else 'TEMPERATE'
row = row_for('GACSPH', theater)
body, closed, opening, ready, closing, build = row['members']
size = tuple(body['canvas'])
hd = tuple(v * DENSITY for v in size)
source = ROOT / 'production-art-v1/GACSPH/keys-raw.png'
sheet = Image.open(source).convert('RGBA')
# The early assembly has multiple detached plates; keep its complete cell.
keys = [sheet.crop(box) for box in ((0, 0, 650, 630), (650, 0, 1280, 640),
                                   (0, 640, 635, 1280), (635, 640, 1280, 1280))]
normal = normal_for(ROOT / 'review-v1/GACSPH-candidate-2x.png')
damaged, _ = register(keys[0], size, resting(row, True).getbbox())
early, _ = register(keys[1], size, decode(row, build, 0).getbbox())
if theater == 'SNOW':
    snow = sheet_cells(Image.open(ROOT / 'production-art-v1/GACSPH/snow-raw.png').convert('RGBA'), 2, 1)
    normal, _ = register(snow[0], size, resting(row).getbbox())
    damaged, _ = register(snow[1], size, resting(row, True).getbbox())
part_path = ROOT / 'production-art-v1/GACSPH/dome-parts-raw.png'
parts = sheet_cells(Image.open(part_path).convert('RGBA'), 3, 1)
half, open_normal, open_damaged = [register(part, size, (80, 109, 201, 189))[0] for part in parts]
half_hood = polygon(half, [(99, 143), (106, 124), (118, 110), (145, 107),
                           (164, 115), (173, 125), (111, 165), (100, 156)])
yy, xx = np.indices(hd[::-1])
dome_points = [(104, 140), (111, 123), (129, 109), (151, 107), (174, 118),
               (188, 139), (190, 165), (180, 177), (152, 180), (121, 174), (103, 157)]
dome_mask = polygon(Image.new('RGBA', hd, 'white'), dome_points).getchannel('A')
fixed = [clip(master, Image.fromarray(255 - np.array(dome_mask))) for master in (normal, damaged)]
hoods = [clip(master, dome_mask) for master in (normal, damaged)]
open_modules = [open_normal, open_damaged]
module_mask = polygon(Image.new('RGBA', hd, 'white'),
    [(99, 126), (114, 109), (165, 109), (192, 130), (193, 169), (174, 181), (116, 176), (100, 158)]).getchannel('A')


def assembled(amount, damage=False):
    state = int(damage)
    if amount <= 0:
        return (normal if not damage else damaged).copy()
    image = fixed[state].copy()
    image.alpha_composite(clip(open_modules[state], module_mask))
    if amount < 1:
        # Rotate only the outer shell toward its fixed left/rear hinge. The
        # concrete footprint, inner core and side machinery do not scale.
        if amount < .36:
            q = [(103, 107), (192, 107), (192, 180), (103, 180)]
            target = [(103, 107), (192 - 20 * amount, 107),
                      (192 - 15 * amount, 180 - 75 * amount), (103 + 22 * amount, 180 - 12 * amount)]
            hood = project_part(hoods[state], q, target)
        else:
            u = (amount - .36) / .64
            q = [(99, 107), (177, 107), (177, 168), (99, 168)]
            target = [(99 + 5 * u, 107), (177 - 16 * u, 107),
                      (177 - 17 * u, 168 - 27 * u), (99 + 14 * u, 168 + 5 * u)]
            hood = project_part(half_hood, q, target)
            if damage:
                pixels = np.array(hood)
                pixels[..., :3] = np.uint8(pixels[..., :3] * .72)
                hood = Image.fromarray(pixels)
        image.alpha_composite(hood)
    return image




frames = {(body['source']['member'], n): clip(normal if n == 0 else damaged,
          native_mask(body, min(n, 1), hd, expand=2)) for n in range(3)}
open_amounts = [0, 0, .16, .36, .62, .86, 1, 1, 1, 1, 1, 1]
close_amounts = [1, 1, 1, 1, 1, 1, 1, 1, .86, .65, .45, .24, .10, 0, 0]
for member in (closed, opening, ready, closing):
    half_count = member['visibleFrames'] // 2
    for n in range(member['visibleFrames']):
        phase = n % half_count
        amount = 0 if member is closed else open_amounts[phase] if member is opening else close_amounts[phase] if member is closing else 1
        im = assembled(amount, n >= half_count)
        if member is closing:
            canvas = Image.new('RGBA', tuple(v * DENSITY for v in member['canvas']))
            # Native H has a larger centered canvas; retain its +111,+55 origin.
            canvas.alpha_composite(im, tuple((member['canvas'][i] - size[i]) * DENSITY // 2 for i in range(2)))
            im = canvas
        if theater == 'SNOW':
            im = add_native_snow(row, member, n, im, normal, align_center=member is closing)
        # Native electricity is retained as an explicitly reused effect layer;
        # newly authored machinery remains beneath its exact event cadence.
        if member is not closed:
            im.alpha_composite(native_electricity(row, member, n))
        frames[member['source']['member'], n] = im
ground, foot = ground_planes(normal)
foundation_path = ROOT / 'production-art-v1/GACSPH/foundation-raw.png'
foundation_raw = Image.open(foundation_path).convert('RGBA')
# Project this single authored floor plane onto its exact native footprint.
# The runtime export mask excludes the unused external lamp halo in the raw.
source_quad = np.array([(122, 469), (711, 199), (1398, 595), (813, 932)], float)
target_quad = np.array([(27, 133), (107, 96), (201, 145), (126, 189)], float) * DENSITY
equations, values = [], []
for (x, y), (u, v) in zip(target_quad, source_quad):
    equations.extend([[x, y, 1, 0, 0, 0, -u*x, -u*y], [0, 0, 0, x, y, 1, -v*x, -v*y]])
    values.extend([u, v])
foundation = foundation_raw.transform(hd, Image.Transform.PERSPECTIVE,
    tuple(np.linalg.solve(np.array(equations), np.array(values))), Image.Resampling.BICUBIC)
foundation = clip(foundation, native_mask(build, 5, hd, expand=1))
cylinders = [polygon(normal, points) for points in (
    [(37, 125), (52, 123), (84, 139), (78, 152), (44, 142)],
    [(99, 99), (116, 99), (138, 114), (131, 126), (105, 116)])]
braces = polygon(normal, [(55, 81), (101, 81), (124, 123), (97, 142), (57, 126)])
core = polygon(open_normal, [(123, 136), (165, 129), (189, 147), (186, 172), (153, 181), (122, 165)])
core_floor, _ = ground_planes(core)
for n in range(build['visibleFrames']):
    if n < 3:
        image = early.copy()
        if n:
            image.alpha_composite(clip(foundation, native_mask(build, n, hd, expand=1)))
    else:
        image = clip(foundation, native_mask(build, n, hd, expand=2))
        if n >= 6:
            for part in cylinders:
                image.alpha_composite(clip(translate(part, dy=max(0, 13 - n) * 2), ground))
        if n >= 8:
            image.alpha_composite(clip(translate(braces, dy=max(0, 16 - n) * 3), ground))
        if n >= 10:
            image.alpha_composite(clip(translate(core, dy=max(0, 16 - n) * 3), core_floor))
        if n >= 17:
            stage = assembled(max(0, 1 - (n - 19) / 5))
            image.alpha_composite(clip(stage, module_mask))
        image.alpha_composite(clip(foot, native_mask(build, n, hd, expand=2)))
    image = add_native_snow(row, build, n, image, normal)
    if n == 24:
        image = normal.copy()
    frames[build['source']['member'], n] = image
out = ROOT / 'feedback-exports-v1' / ('GACSPH' if theater == 'TEMPERATE' else 'GACSPH-SNOW')
export_frames(row, frames, out, {'authoredKeysSha256': sha(source), 'domePartsSha256': sha(part_path),
                               'foundationSha256': sha(foundation_path),
                               'mechanism': 'Fixed foundation and inner core; local shell retraction; independent 15-frame close',
                               'nativeElectricalArcs': 'REUSED_EFFECT_LAYER',
                               'closingCanvasOffset': [(closing['canvas'][i] - size[i]) // 2 for i in range(2)],
                               'wholeBuildingScale': [1, 1]})
print(theater, len(frames), 'Chronosphere slots; visual QA pending')
