"""Bake a palette variant of accepted world relief; do not author replacement material."""
import json
import math
from pathlib import Path
import re
import sys

import numpy as np
from PIL import Image, ImageChops, ImageDraw

atlas_file, mask_file, output_file = map(Path, sys.argv[1:])
assert not output_file.exists()
original = np.asarray(Image.open(atlas_file).convert('RGB'))
assert original.shape == (821, 1915, 3)
spec = json.loads(mask_file.read_text())
scale, source, target = spec['scale'], spec['sourceLocator'], spec['nativeLocator']
offset = np.array(target) - np.array(source) * scale
density = 4

def coverage(paths):
    mask = Image.new('L', (1915 * density, 821 * density))
    for path in paths:
        tokens = re.findall(r'[MLQZ]|-?\d+(?:\.\d+)?', path)
        cursor, points, previous = 0, [], None
        while cursor < len(tokens):
            command = tokens[cursor]
            cursor += 1
            if command == 'Z':
                # The runtime paints one complete longitude cycle. A Pacific
                # source can straddle its atlas seam; translate that same arc.
                shifts = [-1760 * density, 0, 1760 * density] if spec.get('wrapLongitude') else [0]
                for shift in shifts:
                    ring = Image.new('L', mask.size)
                    ImageDraw.Draw(ring).polygon([(x + shift, y) for x, y in points], fill=255)
                    mask = ImageChops.difference(mask, ring)
                points, previous = [], None
                continue
            count = 4 if command == 'Q' else 2
            values = list(map(float, tokens[cursor:cursor + count]))
            cursor += count
            pairs = [(np.array(values[i:i + 2]) - offset) / scale * density for i in range(0, count, 2)]
            if command in ('M', 'L'):
                points.append(tuple(pairs[0])); previous = pairs[0]
            else:
                assert command == 'Q' and previous is not None
                control, end = pairs
                steps = max(2, math.ceil((np.linalg.norm(control - previous) + np.linalg.norm(end - control)) / 2))
                for t in np.linspace(0, 1, steps + 1)[1:]:
                    point = (1 - t)**2 * previous + 2 * (1 - t) * t * control + t**2 * end
                    points.append(tuple(point))
                previous = end
        assert not points
    return np.asarray(mask.resize((1915, 821), Image.Resampling.BOX), dtype=float) / 255


red_alpha, blue_alpha = coverage(spec['redPaths']), coverage(spec['bluePaths'])
for territory in spec.get('atlasTerritories', []):
    # Original political authority may cover an entire isolated landmass whose
    # accepted coastline differs. Preserve that relief and recolor its material.
    x, y, width, height = territory['rect']
    target, other = (red_alpha, blue_alpha) if territory['state'] == 'red' else (blue_alpha, red_alpha)
    target[y:y + height, x:x + width] = 1
    other[y:y + height, x:x + width] = 0
base = original.copy()
grid_mask = np.zeros(original.shape[:2], bool)
# The accepted relief already has straight grid marks. Repair only these narrow
# overlay strips before the mission's independently registered grid is rendered.
for axis, positions in [(1, [119.5, 305, 467, 648, 804.5, 957, 1110, 1266.5, 1433.5, 1606.5, 1796]),
                        (0, [40, 227, 413.5, 604, 732.5])]:
    for at in positions:
        left, right = math.floor(at - 2.6), math.ceil(at + 2.6)
        for coordinate in range(left, right):
            weight = (coordinate - left + 1) / (right - left + 1)
            if axis == 1:
                base[:, coordinate] = np.rint(base[:, left - 1] * (1 - weight) + base[:, right] * weight)
                grid_mask[:, coordinate] = True
            else:
                base[coordinate] = np.rint(base[left - 1] * (1 - weight) + base[right] * weight)
                grid_mask[coordinate] = True
region_report = None
if spec.get('territoryPropagation'):
    from source_country_regions import source_country_regions
    red_alpha, blue_alpha, region_report = source_country_regions(base, red_alpha, blue_alpha, spec['territoryPropagation'])
red = base.astype(float)
red[..., 0] = np.minimum(red[..., 0] + red[..., 2], 255)
red[..., 2] = 0
blue = base.astype(float)
blue[..., 2] = np.minimum(blue[..., 0] + blue[..., 2], 255)
blue[..., 0] = 0
r, g, b = [base[..., channel].astype(float) for channel in range(3)]
source_ink = spec.get('politicalInkPolicy') == 'source-mask'
red_weight = red_alpha * ((b > g) & (b > (0 if source_ink else 10)) & ((b > r * 1.25) | bool(region_report) | source_ink))
blue_weight = blue_alpha * ((r > g) & (r > (0 if source_ink else 10)) & ((r > b * 1.25) | bool(region_report) | source_ink))
if region_report or source_ink:
    # Adjacent antialiased source contours can overlap fractionally. Keep the
    # stronger original state; exact ties retain the accepted material color.
    red_weight *= red_alpha > blue_alpha
    blue_weight *= blue_alpha > red_alpha
assert not ((red_weight > 0) & (blue_weight > 0)).any()
untouched = 1 - red_weight - blue_weight
result = np.uint8(np.rint(base * untouched[..., None] + red * red_weight[..., None] + blue * blue_weight[..., None]))
outside = (red_weight == 0) & (blue_weight == 0) & ~grid_mask
monochrome = spec.get('monochrome')
if monochrome:
    assert monochrome['schema'] == 'source-world-faction-monochrome-v1'
    coefficients = np.asarray(monochrome['coefficients'], dtype=float)
    assert coefficients.shape == (3,) and ((coefficients > 0) & (coefficients <= 2)).all()
    intensity = np.maximum.reduce([r, b, g * monochrome['boundaryGain']])
    result = np.uint8(np.rint(np.clip(intensity[..., None] * coefficients, 0, 255)))
    outside = (base.max(2) == 0) & ~grid_mask
assert np.array_equal(result[outside], original[outside])
Image.fromarray(result).save(output_file)
print(json.dumps(dict(status='PASS_PINNED_PALETTE_DERIVATION', sourceAtlasPixels=1915 * 821,
    redConversionPixels=0 if monochrome else int((red_weight > 0).sum()),
    blueConversionPixels=0 if monochrome else int((blue_weight > 0).sum()),
    repairedGridPixels=int(grid_mask.sum()),
    unchangedOutsideDeclaredRegions=int(outside.sum()), maximumOutsideChannelDifference=0,
    sourceTextureAndGeography='No replacement material, scale-up, sharpening, noise or geometry resampling.',
    **({'regionPropagation': region_report} if region_report else {}),
    **({'monochrome': monochrome, 'paletteScope': 'GLOBAL_SOURCE_FACTION_TINT_NO_ORIGINAL_PIXEL_MATERIAL_MASK',
        'paletteChangedPixels': int(np.any(result != base, axis=2).sum())} if monochrome else {}))))
