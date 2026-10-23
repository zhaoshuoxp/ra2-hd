"""Three synchronized radar heads on fixed towers; independent construction lifts."""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance
from production_common import DENSITY, normal_for, export_output, ROOT, row_for, decode, resting, register, sheet_cells, export_frames, sha
from mechanical_common import clip, polygon, rectangle, translate, native_mask, ground_planes, add_native_snow

theater = sys.argv[1] if len(sys.argv) > 1 else 'TEMPERATE'
row = row_for('GAROBO', theater)
body, active, build = row['members']
size = tuple(body['canvas'])
hd = tuple(v * DENSITY for v in size)
source = ROOT / 'production-art-v1/GAROBO/keys-raw.png'
keys = sheet_cells(Image.open(source).convert('RGBA'))
normal = normal_for(ROOT / 'review-v1/GAROBO-candidate-2x.png')
damaged, _ = register(keys[0], size, resting(row, True).getbbox())
foundation, _ = register(keys[1], size, decode(row, build, 0).getbbox())
if theater == 'SNOW':
    snow = sheet_cells(Image.open(ROOT / 'production-art-v1/GAROBO/snow-raw.png').convert('RGBA'), 2, 1)
    normal, _ = register(snow[0], size, resting(row).getbbox())
    damaged, _ = register(snow[1], size, resting(row, True).getbbox())
heads = [[(64, 27), (94, 34), (94, 51), (78, 49), (64, 39)],
         [(109, 32), (143, 42), (144, 59), (126, 57), (109, 46)],
         [(76, 51), (106, 58), (107, 73), (90, 73), (76, 62)]]
mask = Image.new('L', hd, 255)
for points in heads:
    ImageDraw.Draw(mask).polygon([(x * DENSITY, y * DENSITY) for x, y in points], fill=0)
static = [clip(master, mask) for master in (normal, damaged)]
radar_path = ROOT / 'production-art-v1/GAROBO/radar-raw.png'
poses = sheet_cells(Image.open(radar_path).convert('RGBA'), 4, 2)
sample_frames = [0, 2, 5, 7, 10, 12, 15, 18]
regions = [(61, 24, 95, 52), (107, 30, 141, 58), (76, 49, 110, 77)]
radars = []
for k, pose in enumerate(poses):
    pieces = []
    for bounds in regions:
        sample = rectangle(decode(row, active, sample_frames[k]).resize(hd, Image.Resampling.NEAREST), bounds)
        box = sample.getbbox()
        pieces.append(register(pose, size, tuple(v // DENSITY for v in box))[0])
    radars.append(pieces)


def assembled(frame, damaged=False):
    result = static[int(damaged)].copy()
    k = min(range(8), key=lambda k: abs(sample_frames[k] - frame % 20))
    for part in radars[k]:
        result.alpha_composite(ImageEnhance.Brightness(part).enhance(.72) if damaged else part)
    return result


frames = {(body['source']['member'], n): static[int(n > 0)] for n in range(3)}
for n in range(active['visibleFrames']):
    frames[active['source']['member'], n] = assembled(n, n >= 20) if n < 40 else Image.new('RGBA', hd)
ground, foot = ground_planes(normal)
mast = rectangle(static[0], (94, 0, 111, 75))
towers = [polygon(static[0], points) for points in (
    [(71, 46), (92, 46), (94, 63), (86, 84), (67, 82), (72, 65)],
    [(117, 52), (138, 52), (142, 75), (143, 88), (120, 89), (119, 70)],
    [(85, 69), (104, 69), (106, 85), (108, 104), (88, 111), (82, 105), (86, 88)])]
rails = rectangle(static[0], (93, 72, 126, 101))
operations = []
for n in range(build['visibleFrames']):
    image = foundation.copy()
    if n >= 1:
        image.alpha_composite(clip(translate(mast, dy=max(0, 9 - n) * 8), ground))
    if n >= 5:
        k = min(range(8), key=lambda k: abs(sample_frames[k] - min(19, n)))
        for j in (0, 1, 2):
            lift = max(0, 15 - n) * 4
            if n >= 9:
                image.alpha_composite(clip(translate(towers[j], dy=lift), ground))
            image.alpha_composite(clip(translate(radars[k][j], dy=lift), ground))
    if n >= 14:
        image.alpha_composite(clip(translate(rails, dy=max(0, 18 - n) * 3), ground))
    image = add_native_snow(row, build, n, image, normal)
    if n == 19:
        image = assembled(0)
    frames[build['source']['member'], n] = image
    operations.append({'frame': n, 'foundationTranslation': [0, 0], 'wholeBuildingScale': [1, 1],
                       'mastLift': [1, 9], 'towerLift': [9, 15], 'radarRotation': [5, 19]})
out = ROOT / 'full-exports-v1' / ('GAROBO' if theater == 'TEMPERATE' else 'GAROBO-SNOW')
export_frames(row, frames, out, {'authoredKeysSha256': sha(source), 'radarSha256': sha(radar_path),
                               'mechanism': 'Three local radar rotations and independent telescoping towers',
                               'operations': operations})
print(theater, len(frames), 'robot slots; visual QA pending')
