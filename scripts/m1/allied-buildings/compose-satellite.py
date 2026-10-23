"""Satellite receiver rotation, local dish deployment and telescoping mast."""
import sys
import numpy as np
from PIL import Image
from production_common import DENSITY, normal_for, export_output, ROOT, row_for, decode, resting, register, sheet_cells, export_frames, sha
from mechanical_common import clip, polygon, rectangle, translate, native_mask, ground_planes, project_part, add_native_snow

theater = sys.argv[1] if len(sys.argv) > 1 else 'TEMPERATE'
row = row_for('GASPYSAT', theater)
body, active, build = row['members']
size = tuple(body['canvas'])
hd = tuple(v * DENSITY for v in size)
source = ROOT / 'production-art-v1/GASPYSAT/keys-raw.png'
keys = sheet_cells(Image.open(source).convert('RGBA'))
normal = normal_for(ROOT / 'review-v1/GASPYSAT-candidate-2x.png')
damaged, _ = register(keys[0], size, resting(row, True).getbbox())
mid, _ = register(keys[2], size, decode(row, build, 11).getbbox())
early, _ = register(keys[1], size, decode(row, build, 0).getbbox())
if theater == 'SNOW':
    snow = sheet_cells(Image.open(ROOT / 'production-art-v1/GASPYSAT/snow-raw.png').convert('RGBA'), 2, 1)
    normal, _ = register(snow[0], size, resting(row).getbbox())
    damaged, _ = register(snow[1], size, resting(row, True).getbbox())
yy, xx = np.indices(hd[::-1])
static_mask = Image.fromarray(np.uint8((xx >= 73 * DENSITY) | (yy >= 34 * DENSITY)) * 255)
static = [clip(master, static_mask) for master in (normal, damaged)]
receiver_path = ROOT / 'production-art-v1/GASPYSAT/receiver-raw.png'
poses = sheet_cells(Image.open(receiver_path).convert('RGBA'), 4, 2)
receivers = []
for state in range(2):
    group = []
    for k, pose in enumerate(poses):
        native = rectangle(decode(row, active, state * 16 + k * 2).resize(hd, Image.Resampling.NEAREST), (38, 0, 72, 40))
        box = native.getbbox()
        # Each pose is registered to its native receiver socket, independently
        # of the invariant large dish and foundations.
        group.append(register(pose, size, tuple(v // DENSITY for v in box))[0])
    receivers.append(group)
frames = {(body['source']['member'], n): static[int(n > 0)] for n in range(3)}
for n in range(active['visibleFrames']):
    frames[active['source']['member'], n] = receivers[n // 16][(n % 16) // 2] if n < 32 else Image.new('RGBA', hd)
ground, foot = ground_planes(normal)
base = rectangle(normal, (37, 75, 141, 98))
left_base = rectangle(normal, (37, 51, 74, 89))
mast = rectangle(normal, (49, 31, 67, 57))
pillar = rectangle(mid, (89, 47, 130, 78))
dish_quad = [(72, 13), (139, 13), (139, 62), (72, 62)]
dish = polygon(normal, [(75, 40), (88, 23), (104, 15), (125, 16), (135, 26),
                        (136, 39), (128, 49), (105, 60), (88, 60), (77, 52)])
flat_quad = [(73, 12), (140, 12), (140, 49), (73, 49)]
operations = []
for n in range(build['visibleFrames']):
    image = Image.new('RGBA', hd)
    if n < 5:
        image.alpha_composite(early)
    else:
        image.alpha_composite(base)
        t = float(np.clip((n - 14) / 8, 0, 1))
        target = np.array(flat_quad) * (1 - t) + np.array(dish_quad) * t
        moving_dish = project_part(dish, dish_quad, target)
        if n < 11:
            native_dish = rectangle(decode(row, build, n).resize(hd, Image.Resampling.NEAREST), (75, 0, 145, 75))
            dy = max(0, (native_dish.getbbox()[1] - moving_dish.getbbox()[1]) / DENSITY)
            moving_dish = translate(moving_dish, dy=dy)
        socket = min(74, moving_dish.getbbox()[3] / DENSITY - 8)
        support = project_part(pillar, [(89, 47), (130, 47), (130, 78), (89, 78)],
                               [(89, socket), (130, socket), (130, 78), (89, 78)])
        image.alpha_composite(support)
        image.alpha_composite(moving_dish)
    if n >= 1:
        image.alpha_composite(clip(translate(left_base, dy=max(0, 11 - n) * 2), ground))
    if n >= 16:
        dy = max(0, 21 - n) * 5
        image.alpha_composite(translate(mast, dy=dy))
        image.alpha_composite(translate(receivers[0][(n - 21) % 8] if n > 21 else receivers[0][7], dy=dy))
    # Native transparent holes belong to its low-resolution machinery, not to
    # authored surfaces. Only the native export rectangle clips this assembly.
    image = clip(image, ground)
    image = add_native_snow(row, build, n, image, normal)
    if n == 24:
        image = static[0].copy()
        image.alpha_composite(receivers[0][0])
    frames[build['source']['member'], n] = image
    operations.append({'frame': n, 'wholeBuildingScale': [1, 1], 'dishLift': [5, 11],
                       'dishTilt': [14, 22], 'mastExtension': [16, 21]})
out = ROOT / 'full-exports-v6' / ('GASPYSAT' if theater == 'TEMPERATE' else 'GASPYSAT-SNOW')
export_frames(row, frames, out, {'authoredKeysSha256': sha(source), 'receiverSha256': sha(receiver_path),
                               'mechanism': 'Eight receiver headings; local dish lift/tilt and mast', 'operations': operations})
print(theater, len(frames), 'satellite slots; visual QA pending')
