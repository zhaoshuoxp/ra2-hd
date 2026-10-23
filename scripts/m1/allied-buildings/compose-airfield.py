"""Shared GAAIRC/AMRADR art: radar scan, two light layers and local tower lifts."""
import sys
import numpy as np
from PIL import Image, ImageFilter
from production_common import DENSITY, normal_for, export_output, ROOT, row_for, decode, resting, register, sheet_cells, export_frames, sha
from mechanical_common import clip, polygon, rectangle, translate, native_mask, ground_planes, shade_lights, add_native_snow

theater = sys.argv[1] if len(sys.argv) > 1 else 'TEMPERATE'
row = row_for('GAAIRC', theater)
body, bib, lights, beacons, radar, build = row['members']
size = tuple(body['canvas'])
hd = tuple(v * DENSITY for v in size)
source = ROOT / 'production-art-v1/GAAIRC/keys-raw.png'
keys = sheet_cells(Image.open(source).convert('RGBA'))
normal = normal_for(ROOT / 'review-v1/GAAIRC-candidate-2x.png')
damaged, _ = register(keys[0], size, resting(row, True).getbbox())
if theater == 'SNOW':
    normal = normal_for(ROOT / 'review-v1/GAAIRC-SNOW-candidate-2x.png')
    damaged, _ = register(Image.open(ROOT / 'production-art-v1/GAAIRC/snow-damage-raw.png').convert('RGBA'),
                          size, resting(row, True).getbbox())
yy, xx = np.indices(hd[::-1])
without_radar = Image.fromarray(np.uint8((yy >= 39 * DENSITY) | (xx >= 92 * DENSITY)) * 255)
static = [clip(im, without_radar) for im in (normal, damaged)]
pad_points = [(68, 119), (118, 94), (180, 119), (124, 155)]
pads = [polygon(im, pad_points) for im in static]
pad_mask = polygon(Image.new('RGBA', hd, 'white'), pad_points).getchannel('A')
structures = [clip(im, Image.fromarray(255 - np.array(pad_mask))) for im in static]
radar_path = ROOT / 'production-art-v1/GAAIRC/radar-raw.png'
poses = sheet_cells(Image.open(radar_path).convert('RGBA'), 3, 1)
pose_for_frame = [0, 0, 1, 0, 2, 2, 2, 0]
radars = []
for n in range(8):
    native = rectangle(decode(row, radar, n).resize(hd, Image.Resampling.NEAREST), (40, 0, 93, 40))
    radars.append(register(poses[pose_for_frame[n]], size, tuple(v // DENSITY for v in native.getbbox()))[0])
frames = {}
for n in range(3):
    frames[body['source']['member'], n] = structures[int(n > 0)]
for n in range(2):
    frames[bib['source']['member'], n] = pads[n]
for member in (lights, beacons):
    half = member['visibleFrames'] // 2
    for n in range(member['visibleFrames']):
        master = static[int(n >= half)]
        # Native placement selects only lamps/markings, never the moving radar.
        support = native_mask(member, n, hd, expand=1)
        frames[member['source']['member'], n] = clip(shade_lights(master, .8 + .2 * np.cos(n * np.pi / half)), support)
for n in range(radar['visibleFrames']):
    im = radars[n % 8].copy()
    # A small right-roof beacon shares the native radar member.
    beacon = rectangle(clip(static[int(n >= 8)], native_mask(radar, n, hd, expand=1)), (93, 40, 115, 68))
    im.alpha_composite(beacon)
    frames[radar['source']['member'], n] = im
flat_radar, _ = register(keys[1].crop((28, 0, 185, 133)), size, (56, 4, 91, 38))
early, _ = register(keys[1], size, decode(row, build, 0).getbbox())
ground, foot = ground_planes(normal)
columns = [polygon(structures[0], points) for points in (
    [(56, 37), (87, 37), (88, 72), (75, 87), (55, 76)],
    [(42, 72), (80, 72), (80, 103), (72, 115), (43, 116)],
    [(91, 50), (111, 53), (117, 94), (99, 100), (91, 75)],
    [(77, 64), (98, 63), (99, 91), (104, 101), (90, 110), (77, 98)])]
foundation = rectangle(normal, (40, 109, 118, 123))
operations = []
for n in range(build['visibleFrames']):
    image = clip(pads[0], native_mask(build, n, hd, expand=2))
    image.alpha_composite(clip(foundation, native_mask(build, n, hd, expand=2)))
    head = flat_radar if n < 18 else radars[min(7, n - 18)]
    lift = max(0, decode(row, build, n).getbbox()[1] - head.getbbox()[1] / DENSITY)
    dx = max(0, 4 - n) * 10
    head = translate(head, dx=dx, dy=lift)
    for j in (2, 0, 1, 3):
        start = (5, 7, 7, 10)[j]
        if n >= start:
            column_lift = max(0, (16, 18, 18, 18)[j] - n) * (4, 3, 3, 3)[j]
            if j == 0:
                column_lift = max(0, head.getbbox()[3] / DENSITY - 39)
            image.alpha_composite(clip(translate(columns[j], dy=column_lift), ground))
    if n < 5:
        # Match the early ring to the same radar axis used by the rising tower.
        # Native pad expansion is independent; it must not ride with the head.
        early_head = rectangle(early, (86, 80, 132, 129))
        early_center = (early_head.getbbox()[0] + early_head.getbbox()[2]) / (2 * DENSITY)
        head_center = (head.getbbox()[0] + head.getbbox()[2]) / (2 * DENSITY)
        aligned = translate(early_head, dx=head_center-early_center, dy=-3*n)
        image.alpha_composite(aligned)
    else:
        image.alpha_composite(head)
    image = add_native_snow(row, build, n, image, normal)
    if n >= 23:
        image = static[0].copy()
        image.alpha_composite(radars[0])
    frames[build['source']['member'], n] = image
    operations.append({'frame': n, 'wholeBuildingScale': [1, 1], 'radarAssemblyLift': [0, 17],
                       'sideTowerLift': [7, 18], 'radarDeploy': [18, 23]})
out = ROOT / 'feedback-exports-v1' / ('GAAIRC' if theater == 'TEMPERATE' else 'GAAIRC-SNOW')
export_frames(row, frames, out, {'authoredKeysSha256': sha(source), 'radarSha256': sha(radar_path),
                               'mechanism': 'Limited-angle radar scan, separate beacon layers, local construction lifts',
                               'sharedRulesIdentities': ['GAAIRC', 'AMRADR'], 'operations': operations})
print(theater, len(frames), 'airfield slots; visual QA pending')
