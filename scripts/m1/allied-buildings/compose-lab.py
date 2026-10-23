"""Battle Lab core, hinged side pods, descending shells and extending aerials."""
import sys
import numpy as np
from PIL import Image
from production_common import DENSITY, normal_for, export_output, ROOT, row_for, decode, register, sheet_cells, export_frames, sha
from mechanical_common import clip, polygon, rectangle, translate, native_mask, ground_planes, active_lights, add_native_snow, project_part

theater = sys.argv[1] if len(sys.argv) > 1 else 'TEMPERATE'
row = row_for('GATECH', theater)
body, active, build = row['members']
size = tuple(body['canvas'])
hd = tuple(v * DENSITY for v in size)
source = ROOT / 'production-art-v1/GATECH/keys-raw.png'
sheet = Image.open(source).convert('RGBA')
# The initial two detached anchors are intentionally one semantic pose.
cells = [sheet.crop(bounds) for bounds in ((0, 0, 640, 680), (640, 0, 1280, 680),
                                         (0, 680, 640, 1280), (640, 680, 1280, 1280))]
normal = normal_for(ROOT / 'review-v1/GATECH-candidate-2x.png')
damaged, _ = register(cells[0], size, decode(row, body, 1).getbbox())
early, _ = register(cells[1], size, decode(row, build, 0).getbbox())
mid, _ = register(cells[2], size, decode(row, build, 11).getbbox())
if theater == 'SNOW':
    snow = sheet_cells(Image.open(ROOT / 'production-art-v1/GATECH/snow-raw.png').convert('RGBA'), 2, 1)
    normal, _ = register(snow[0], size, decode(row, body, 0).getbbox())
    damaged, _ = register(snow[1], size, decode(row, body, 1).getbbox())
frames = {(body['source']['member'], n): normal if n == 0 else damaged for n in range(3)}
activity, ranges = active_lights(row, active, normal, damaged, 'blue')
frames.update({(active['source']['member'], n): im for n, im in activity.items()})
ground, foot = ground_planes(normal)
spine = polygon(mid, [(158, 74), (198, 74), (197, 192), (175, 204), (153, 186), (153, 136)])
foundation = rectangle(mid, (120, 177, 250, 225))
front_source = [(189, 105), (210, 117), (215, 169), (187, 157)]
front_target = [(178, 111), (207, 102), (242, 119), (213, 132)]
back_source = [(157, 95), (175, 91), (174, 142), (145, 132)]
back_target = [(136, 84), (156, 76), (181, 90), (157, 104)]
pods = [polygon(normal, pts) for pts in (
    [(131, 81), (154, 75), (179, 89), (177, 130), (153, 131), (132, 117)],
    [(180, 113), (208, 107), (240, 121), (240, 150), (224, 166), (188, 152)])]
small_pods = [rectangle(normal, (151, 55, 178, 98)), rectangle(normal, (187, 75, 211, 110))]
aerials = polygon(normal, [(168, 0), (204, 0), (204, 82), (178, 99), (168, 84)])
yy, xx = np.indices(hd[::-1])
operations = []
for n in range(build['visibleFrames']):
    image = Image.new('RGBA', hd)
    mask = native_mask(build, n, hd)
    if n == 0:
        image = early.copy()
    else:
        if n >= 7:
            image.alpha_composite(foundation)
        native_top = decode(row, build, n).getbbox()[1]
        dy = max(0, native_top - 77)
        image.alpha_composite(translate(spine, dy=dy))
        if 8 <= n <= 14:
            t = np.clip((n - 11) / 3, 0, 1)
            for source_quad, target_quad in ((back_source, back_target), (front_source, front_target)):
                quad = np.array(source_quad) * (1 - t) + np.array(target_quad) * t
                image.alpha_composite(project_part(mid, source_quad, quad))
        if n >= 14:
            for pod, top in zip(pods, (80, 110)):
                # The roof stays at its deployed hinge height while the side
                # shell extends downward, exposing a fixed authored texture.
                reveal = Image.fromarray(np.uint8(yy < (top + 14 + (n - 14) * 12) * DENSITY) * 255)
                image.alpha_composite(clip(pod, reveal))
        if n >= 20:
            for pod in small_pods:
                image.alpha_composite(translate(pod, dy=max(0, 24 - n) * 5))
        if n >= 18:
            image.alpha_composite(translate(aerials, dy=max(0, 24 - n) * 9))
        image = clip(image, mask)
        if n >= 7:
            image.alpha_composite(foot)
        image = add_native_snow(row, build, n, image, normal)
    if n == 24:
        image = normal.copy()
    frames[build['source']['member'], n] = image
    operations.append({'frame': n, 'foundationTranslation': [0, 0], 'wholeBuildingScale': [1, 1],
                       'hingedPods': [11, 14], 'podShellExtension': [14, 18], 'aerialExtension': [18, 24]})
out = ROOT / 'full-exports-v1' / ('GATECH' if theater == 'TEMPERATE' else 'GATECH-SNOW')
export_frames(row, frames, out, {'authoredKeysSha256': sha(source), 'activeRanges': ranges,
                               'operations': operations, 'mechanism': 'Core, two hinged pods, shell and aerial extension'})
print(theater, len(frames), 'Battle Lab slots; visual QA pending')
