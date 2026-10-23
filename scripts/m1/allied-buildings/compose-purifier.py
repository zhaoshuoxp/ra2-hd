"""Fixed refinery drum, deploying braces, sequential pipe and telescoping flue."""
import sys
import numpy as np
from PIL import Image, ImageFilter
from production_common import DENSITY, normal_for, export_output, ROOT, row_for, decode, register, sheet_cells, export_frames, sha
from mechanical_common import clip, polygon, rectangle, translate, native_mask, ground_planes, active_lights, add_native_snow

theater = sys.argv[1] if len(sys.argv) > 1 else 'TEMPERATE'
row = row_for('GAOREP', theater)
body, active, build = row['members']
size = tuple(body['canvas'])
hd = tuple(v * DENSITY for v in size)
source = ROOT / 'production-art-v1/GAOREP/keys-raw.png'
cells = sheet_cells(Image.open(source).convert('RGBA'))
normal = normal_for(ROOT / 'review-v1/GAOREP-candidate-2x.png')
damaged, _ = register(cells[0], size, decode(row, body, 1).getbbox())
early, _ = register(cells[1], size, decode(row, build, 0).getbbox())
mid, _ = register(cells[2], size, decode(row, build, 11).getbbox())
if theater == 'SNOW':
    snow = sheet_cells(Image.open(ROOT / 'production-art-v1/GAOREP/snow-raw.png').convert('RGBA'), 2, 1)
    normal, _ = register(snow[0], size, decode(row, body, 0).getbbox())
    damaged, _ = register(snow[1], size, decode(row, body, 1).getbbox())

frames = {(body['source']['member'], n): normal if n == 0 else damaged for n in range(3)}
activity, ranges = active_lights(row, active, normal, damaged)
frames.update({(active['source']['member'], n): im for n, im in activity.items()})
ground, foot = ground_planes(normal)
components_path = ROOT / 'production-art-v1/GAOREP/components-raw.png'
sheet = Image.open(components_path).convert('RGBA')
component_boxes = [(0, 0, 720, 700), (760, 310, 1280, 700), (0, 750, 700, 1280), (700, 750, 1280, 1280)]
parts = [sheet.crop(bounds) for bounds in component_boxes]
foundation, _ = register(parts[0], size, (2, 77, 129, 164))
drum, _ = register(parts[1], size, (38, 76, 97, 137))
center = polygon(normal, [(39, 118), (46, 96), (52, 84), (59, 79), (77, 79), (91, 95), (95, 115), (67, 115), (65, 132), (47, 129)])
drum.alpha_composite(center)
brace_group, _ = register(parts[2], size, (9, 92, 118, 159))
pipe, _ = register(parts[3], size, (21, 93, 113, 146))
flue = rectangle(normal, (55, 58, 80, 98))
braces = [polygon(normal, points) for points in (
    [(4, 115), (18, 98), (38, 91), (43, 95), (41, 126), (8, 122)],
    [(84, 86), (105, 90), (117, 103), (117, 124), (94, 121), (86, 102)],
    [(65, 116), (87, 116), (95, 152), (70, 155)])]
rgba = np.array(normal)
rgb = rgba[..., :3].astype(float)
yy, xx = np.indices(hd[::-1])
blue = (rgb[..., 2] > rgb[..., 0] * 1.08) & (rgb[..., 2] > rgb[..., 1] * 1.02) & (yy > 96 * DENSITY)
pipe_mask = Image.fromarray(np.uint8(blue) * 255).filter(ImageFilter.MaxFilter(5))
pipe = clip(normal, pipe_mask)
braces = [clip(part, Image.fromarray(255 - np.array(pipe_mask))) for part in braces]
foundation = clip(foundation, ground)
operations = []
for n in range(build['visibleFrames']):
    image = foundation.copy()
    lift = max(0, 4 - n) * 7
    conduit = Image.new('RGBA', hd)
    if n >= 15:
        progress = min(1, (n - 14) / 9)
        reveal = (xx >= (120 - progress * 120) * DENSITY)
        conduit = clip(pipe, Image.fromarray(np.uint8(reveal) * 255))
    image.alpha_composite(rectangle(conduit, (0, 0, 150, 122)))
    image.alpha_composite(clip(translate(drum, dy=lift), ground))
    image.alpha_composite(rectangle(conduit, (0, 122, 150, 168)))
    if n >= 7:
        for part in braces:
            image.alpha_composite(clip(translate(part, dy=max(0, 13 - n) * 4), ground))
    if n >= 19:
        image.alpha_composite(translate(flue, dy=max(0, 23 - n) * 3))
    image = clip(image, native_mask(build, n, hd))
    if n >= 3:
        image.alpha_composite(foot)
    image = add_native_snow(row, build, n, image, normal)
    if n >= 23:
        image = normal.copy()
    frames[build['source']['member'], n] = image
    operations.append({'frame': n, 'foundationTranslation': [0, 0], 'wholeBuildingScale': [1, 1],
                       'braceLiftStart': 7, 'pipeExtensionStart': 15, 'flueLiftStart': 19})
out = ROOT / 'full-exports-v5' / ('GAOREP' if theater == 'TEMPERATE' else 'GAOREP-SNOW')
export_frames(row, frames, out, {'authoredKeysSha256': sha(source), 'componentsSha256': sha(components_path), 'activeRanges': ranges,
                               'operations': operations, 'mechanism': 'Fixed drum, local braces, conduit and flue'})
print(theater, len(frames), 'purifier slots; visual QA pending')
