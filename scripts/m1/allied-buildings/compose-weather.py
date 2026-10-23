"""Five independent weather spheres, fixed ribs and native discharge cadence."""
import sys
import numpy as np
from PIL import Image, ImageFilter
from production_common import DENSITY, normal_for, export_output, ROOT, row_for, decode, resting, register, sheet_cells, export_frames, sha
from mechanical_common import clip, polygon, rectangle, translate, native_mask, ground_planes, add_native_snow, native_electricity

theater = sys.argv[1] if len(sys.argv) > 1 else 'TEMPERATE'
row = row_for('GAWEAT', theater)
body, closed, opening, ready, closing, build = row['members']
size = tuple(body['canvas'])
hd = tuple(v * DENSITY for v in size)
keys_path = ROOT / 'production-art-v1/GAWEAT/keys-raw.png'
keys = sheet_cells(Image.open(keys_path).convert('RGBA'))
normal = normal_for(ROOT / 'review-v1/GAWEAT-candidate-2x.png')
damaged, _ = register(keys[0], size, resting(row, True).getbbox())
if theater == 'SNOW':
    snow = sheet_cells(Image.open(ROOT / 'production-art-v1/GAWEAT/snow-raw.png').convert('RGBA'), 2, 1)
    normal, _ = register(snow[0], size, resting(row).getbbox())
    damaged, _ = register(snow[1], size, resting(row, True).getbbox())
parts_path = ROOT / 'production-art-v1/GAWEAT/open-spent-floor-raw.png'
parts = sheet_cells(Image.open(parts_path).convert('RGBA'), 3, 1)
active, spent = [register(part, size, resting(row).getbbox())[0] for part in parts[:2]]
floor, _ = register(parts[2], size, (22, 98, 131, 150))
early, _ = register(keys[1], size, decode(row, build, 0).getbbox())
regions = [(53, 45, 102, 89), (34, 74, 55, 97), (101, 76, 124, 101),
           (31, 104, 54, 131), (94, 106, 116, 133)]
yy, xx = np.indices(hd[::-1])
masks = []
for box in regions:
    p = np.array(normal)
    # Only blue shell material moves; metal ribs and pipes retain their pixels.
    rgb = p[..., :3].astype(float)
    blue = (rgb[..., 2] > rgb[..., 0] * 1.12) & (rgb[..., 2] > rgb[..., 1] * 1.02)
    bounds = (xx >= box[0]* DENSITY) & (xx < box[2]* DENSITY) & (yy >= box[1]* DENSITY) & (yy < box[3]* DENSITY)
    masks.append(blue & bounds & (p[..., 3] > 0))


def machinery(amounts, damage=False, discharged=False):
    master = damaged if damage else normal
    pixels = np.array(master)
    other = np.array(spent if discharged else active)
    for box, mask, amount in zip(regions, masks, amounts):
        top, bottom = box[1]* DENSITY, box[3]* DENSITY
        reveal = mask & (yy < top + (bottom-top)*amount)
        pixels[reveal, :3] = other[reveal, :3]
        if damage:
            pixels[reveal, :3] = np.uint8(pixels[reveal, :3] * .76)
    return Image.fromarray(pixels)


def unpowered_silver(image):
    # A material correction on the existing authored core retains its surface
    # texture and shading. No powered glow is composited during construction.
    pixels = np.array(image)
    rgb = pixels[..., :3].astype(float)
    green = (rgb[..., 1] > rgb[..., 2] * 1.12) & (rgb[..., 1] > rgb[..., 0] * .85)
    silver = np.clip(rgb @ np.array([.2126, .7152, .0722]), 0, 245)
    pixels[green, :3] = np.repeat(silver[..., None], 3, axis=2)[green].astype(np.uint8)
    return Image.fromarray(pixels)


frames = {(body['source']['member'], n): clip(normal if n == 0 else damaged,
          native_mask(body, min(n, 1), hd, expand=1)) for n in range(3)}
for member in (closed, opening, ready, closing):
    count = member['visibleFrames']//2
    for n in range(member['visibleFrames']):
        phase = n % count
        amounts = [0]*5
        if member is opening:
            # Native activation opens the rear-left, front-left, rear-right,
            # front-right spheres before finishing the large central sphere.
            amounts = [min(1, phase/10), min(1, phase/3), min(1, max(0,phase-3)/3),
                       min(1, max(0,phase-1)/3), min(1, max(0,phase-4)/3)]
        elif member is ready:
            amounts = [1]*5
        elif member is closing:
            amounts = [max(0, 1-max(0,phase-1)/6), max(0, 1-max(0,phase-5)/4),
                       max(0, 1-max(0,phase-4)/4), max(0, 1-max(0,phase-6)/4),
                       max(0, 1-max(0,phase-5)/4)]
        image = machinery(amounts, n >= count, member is closing and phase >= 1)
        if member is not closed:
            image.alpha_composite(native_electricity(row, member, n))
        frames[member['source']['member'], n] = add_native_snow(row, member, n, image, normal)

# The construction starts with a low unpowered silver central sphere, then raises its
# support. Each peripheral module rises separately from the fixed platform.
central_mask = polygon(Image.new('RGBA', hd, 'white'),
    [(52,44),(103,44),(103,85),(86,90),(86,102),(103,125),
     (92,133),(59,133),(49,123),(67,103),(68,90),(52,85)]).getchannel('A')
central_pixels = np.array(central_mask)
for box in regions[1:]:
    central_pixels[(xx >= (box[0]-2)* DENSITY) & (xx < (box[2]+2)* DENSITY)
                   & (yy >= (box[1]-2)* DENSITY) & (yy < (box[3]+2)* DENSITY)] = 0
central_mask = Image.fromarray(central_pixels)
side_masks = [polygon(Image.new('RGBA', hd, 'white'), points).getchannel('A') for points in (
    [(32,72),(54,72),(63,105),(52,113),(25,102)],
    [(100,73),(127,73),(135,107),(116,115),(99,105)],
    [(29,100),(56,100),(59,129),(57,139),(24,142),(21,131)],
    [(92,104),(119,104),(126,139),(113,146),(87,139),(90,124)])]
ground, foot = ground_planes(normal)
for n in range(build['visibleFrames']):
    image = clip(floor, native_mask(build, n, hd, expand=2))
    central_open = max(0, 1-max(0,n-8)/9)
    stage = unpowered_silver(machinery([central_open]*5))
    central = clip(stage, central_mask)
    native_top = decode(row, build, n).getbbox()[1]
    lift = max(0, native_top-44)
    image.alpha_composite(clip(translate(central, dy=lift), ground))
    for index, start in enumerate((10,12,15,16)):
        if n >= start:
            part = clip(stage, side_masks[index])
            part_ground, _ = ground_planes(part)
            image.alpha_composite(clip(translate(part, dy=max(0,start+3-n)*4), part_ground))
    image.alpha_composite(clip(foot, native_mask(build, n, hd, expand=1)))
    image = add_native_snow(row, build, n, image, normal)
    if n == 0:
        image = add_native_snow(row, build, n, unpowered_silver(early), normal)
    if n >= 23:
        image = normal.copy()
    frames[build['source']['member'], n] = image
out = ROOT / 'feedback-exports-v1' / ('GAWEAT' if theater == 'TEMPERATE' else 'GAWEAT-SNOW')
export_frames(row, frames, out, {'authoredKeysSha256': sha(keys_path), 'mechanismPartsSha256': sha(parts_path),
    'mechanism': 'Five independently retracting blue shells; fixed silver ribs; separate spent-energy close',
    'nativeElectricalArcs': 'REUSED_EFFECT_LAYER', 'wholeBuildingScale': [1, 1]})
print(theater, len(frames), 'Weather Control slots; visual QA pending')
