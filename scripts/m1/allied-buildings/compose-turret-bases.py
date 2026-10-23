"""Fixed sockets and articulated construction for the Allied voxel defenses."""
import sys
import numpy as np
from PIL import Image, ImageFilter
from production_common import DENSITY, normal_for, export_output, ROOT, row_for, decode, indices, register, export_frames, sha
from mechanical_common import polygon, clip as apply_mask, translate

identity = sys.argv[1]
theater = sys.argv[2] if len(sys.argv) > 2 else 'TEMPERATE'
assert identity in ('GTGCAN', 'NASAM') and theater in ('TEMPERATE', 'SNOW')
row = row_for(identity, theater)
body = next(m for m in row['members'] if 'body' in m['roles'])
build = next(m for m in row['members'] if 'BUILDUP' in m['roles'])
size = tuple(v * DENSITY for v in body['canvas'])
art = ROOT / 'production-art-v1' / identity
bases = Image.open(art / 'bases-raw.png').convert('RGBA')
keys = Image.open(art / 'build-raw.png').convert('RGBA')


def cell(sheet, i, columns=3):
    return sheet.crop((round(i * sheet.width / columns), 0, round((i + 1) * sheet.width / columns), sheet.height))


def registered(sheet, i, target, columns=3):
    return register(cell(sheet, i, columns), body['canvas'], target.getbbox())[0]


def band(image, top, bottom):
    result = Image.new('RGBA', size)
    result.alpha_composite(image.crop((0, top * DENSITY, size[0], bottom * DENSITY)), (0, top * DENSITY))
    return result


def clip(image, member, n):
    mask = Image.fromarray(np.uint8(indices(member, n) != 0) * 255).filter(ImageFilter.MaxFilter(3))
    mask = np.array(mask.resize(size, Image.Resampling.LANCZOS), float)
    image.putalpha(Image.fromarray(np.uint8(np.array(image.getchannel('A'), float) * mask / 255)))
    return image


normal = registered(bases, 2 if theater == 'SNOW' else 0, decode(row, body, 0))
if theater == 'SNOW':
    damaged_sheet = Image.open(ROOT / 'production-art-v1/turret-snow-damage-raw.png').convert('RGBA')
    damage = registered(damaged_sheet, int(identity == 'NASAM'), decode(row, body, 1), 2)
else:
    damage = registered(bases, 1, decode(row, body, 1))
key_indices = [0, 6, 11] if identity == 'GTGCAN' else [0, 4, 7]
poses = [registered(keys, i, decode(row, build, n)) for i, n in enumerate(key_indices)]
# Separate the complete carriage along its curved socket, never a horizontal band.
assembly = polygon(poses[1], [(85,0),(149,0),(149,106),(137,117),(123,124),(106,124),(88,116),(85,104)])
assembly_mask = assembly.getchannel('A').filter(ImageFilter.GaussianBlur(.3 * DENSITY))
assembly = apply_mask(poses[1], assembly_mask)
frames = {(body['source']['member'], n): normal if n == 0 else damage for n in range(3)}
operations = []
for n in range(build['visibleFrames']):
    image = normal.copy()
    if identity == 'GTGCAN':
        if n <= 3:
            moving = poses[0]
            dy = decode(row, build, n).getbbox()[1] - decode(row, build, 0).getbbox()[1]
            image.alpha_composite(moving, (0, dy * DENSITY))
        elif n <= 8:
            # One registered housing rises, exposing a stationary foundation.
            moving = assembly
            dy = decode(row, build, n).getbbox()[1] - decode(row, build, 6).getbbox()[1]
            image.alpha_composite(moving, (0, dy * DENSITY))
        else:
            # Only the barrel articulates. The carriage remains fixed.
            settled = Image.new('RGBA', size)
            settled.alpha_composite(assembly, (0, -5 * DENSITY))
            carriage = band(settled, 68, size[1] // DENSITY)
            barrel = band(settled, 0, 70)
            angle = {9: -7, 10: -17, 11: -29}[n]
            barrel = barrel.rotate(angle, Image.Resampling.BICUBIC, center=(116 * DENSITY, 75 * DENSITY))
            image.alpha_composite(carriage)
            image.alpha_composite(barrel)
            dy = 0
    else:
        if n == 0:
            image = poses[0].copy()
            dy = 0
        else:
            pods = band(poses[1], 0, 38)
            dy = max(0, decode(row, build, n).getbbox()[1] - decode(row, build, 4).getbbox()[1])
            angle = {6: -12, 7: -24}.get(n, 0)
            if angle:
                pods = pods.rotate(angle, Image.Resampling.BICUBIC, center=(48 * DENSITY, 37 * DENSITY))
            image.alpha_composite(pods, (0, dy * DENSITY))
    if identity != 'GTGCAN' or n < 4:
        image = clip(image, build, n)
    frames[build['source']['member'], n] = image
    operations.append({'frame': n, 'rigidTranslationY': dy, 'wholeBuildingScale': [1, 1],
                       'foundationTranslation': [0, 0]})
out = ROOT / ('feedback-exports-v1' if identity == 'GTGCAN' else 'full-exports-v1') / (identity if theater == 'TEMPERATE' else identity + '-SNOW')
export_frames(row, frames, out, {'operations': operations,
    'authoredSources': {str(p): sha(p) for p in (art / 'bases-raw.png', art / 'build-raw.png')},
    'turretExport': str(ROOT / 'turret-exports-v1' / identity / 'manifest.json')})
print(identity, theater, len(frames), 'slots exported; runtime pending')
