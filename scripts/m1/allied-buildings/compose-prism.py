"""Prism construction petals and native-timed ascending charge emission."""
import sys
import numpy as np
from PIL import Image, ImageFilter
from production_common import DENSITY, normal_for, export_output, ROOT, row_for, decode, resting, register, sheet_cells, export_frames, sha
from mechanical_common import clip, rectangle, translate, native_mask, ground_planes, add_native_snow

theater = sys.argv[1] if len(sys.argv) > 1 else 'TEMPERATE'
row = row_for('ATESLA', theater)
body, active, charge, build = row['members']
size = tuple(body['canvas'])
hd = tuple(v * DENSITY for v in size)
source = ROOT / 'production-art-v1/ATESLA/keys-raw.png'
keys = sheet_cells(Image.open(source).convert('RGBA'))
normal = normal_for(ROOT / 'review-v1/ATESLA-candidate-2x.png')
damaged, _ = register(keys[0], size, resting(row, True).getbbox())
floor, _ = register(keys[1], size, decode(row, build, 0).getbbox())
shaft, _ = register(keys[2], size, decode(row, build, 3).getbbox())
opened, _ = register(keys[3], size, decode(row, build, 6).getbbox())
if theater == 'SNOW':
    snow = sheet_cells(Image.open(ROOT / 'production-art-v1/ATESLA/snow-raw.png').convert('RGBA'), 2, 1)
    normal, _ = register(snow[0], size, resting(row).getbbox())
    damaged, _ = register(snow[1], size, resting(row, True).getbbox())
folded_path = ROOT / 'production-art-v1/ATESLA/folded-head-raw.png'
folded, _ = register(Image.open(folded_path).convert('RGBA'), size, (63, 39, 107, 78))
frames = {(body['source']['member'], n): normal if n == 0 else damaged for n in range(3)}
for member, half in ((active, 9), (charge, 10)):
    for n in range(member['visibleFrames']):
        master = normal if n < half else damaged
        native = np.array(decode(row, member, n))
        rgb = native[..., :3].astype(float)
        phase = n % half
        baseline = np.array(decode(row, member, n // half * half))[..., :3].astype(float)
        emission = (rgb.min(axis=2) > 160) & (rgb.max(axis=2) - rgb.min(axis=2) < 110)
        emission &= (rgb.mean(axis=2) - baseline.mean(axis=2) > 25) & (native[..., 3] > 0)
        glow = Image.fromarray(np.uint8(emission) * 200).resize(hd, Image.Resampling.LANCZOS)
        light = Image.new('RGBA', hd, (195, 220, 255, 0))
        light.putalpha(glow.filter(ImageFilter.GaussianBlur(.6)))
        im = clip(master, native_mask(member, n, hd, expand=1))
        im.alpha_composite(light)
        frames[member['source']['member'], n] = im
ground, foot = ground_planes(normal)
base = rectangle(normal, (60, 78, 109, 108))
for n in range(build['visibleFrames']):
    if n == 0:
        image = floor.copy()
    elif n == 1:
        image = base.copy()
        image.alpha_composite(clip(translate(rectangle(shaft, (72, 44, 99, 84)), dy=24), ground))
    elif n in (2, 3):
        image = shaft.copy()
        if n == 3:
            image.alpha_composite(clip(translate(folded, dy=28), ground))
    elif n == 4:
        image = shaft.copy()
        image.alpha_composite(folded)
    elif n == 5:
        image = normal.copy()
        image = rectangle(image, (0, 39, 172, 160))
        image.alpha_composite(translate(folded, dy=-29))
    elif n == 6:
        image = normal.copy()
        image = rectangle(image, (0, 43, 172, 160))
        image.alpha_composite(rectangle(opened, (0, 0, 172, 46)))
    else:
        image = normal.copy()
    image = add_native_snow(row, build, n, image, normal)
    frames[build['source']['member'], n] = image
out = ROOT / 'full-exports-v2' / ('ATESLA' if theater == 'TEMPERATE' else 'ATESLA-SNOW')
export_frames(row, frames, out, {'authoredKeysSha256': sha(source), 'foldedHeadSha256': sha(folded_path),
                               'mechanism': 'Eight original construction stages; separate folded/open/closed head and ascending charge',
                               'nativeBeam': 'RETAINED_ORIGINAL', 'wholeBuildingScale': [1, 1]})
print(theater, len(frames), 'prism slots; visual QA pending')
