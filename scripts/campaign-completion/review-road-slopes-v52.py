"""Compose native-position road slope references and actual independent exports."""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

root, output = Path(sys.argv[1]), Path(sys.argv[2])
proof = json.loads((root / 'source.json').read_text())
pack = next(p for p in proof['packs'] if p['theater'] == 'temperate')
records = sorted([r for r in pack['records'] if r['member'].startswith('prslpe')], key=lambda r: r['member'])
font = lambda size: ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', size)
directions = {1: (30, 0), 2: (30, 0), 3: (30, 30), 4: (-30, 30)}


def placement(record, density):
    step = np.array(directions[record['frames'][0]['metadata']['rampType']])
    pieces = []
    for grade in range(4):
        for slot, frame in enumerate(record['frames']):
            md = frame['metadata']
            if density == 1:
                sample = np.frombuffer((root / frame['file']).read_bytes(), np.uint8).reshape(md['logical'][1], md['logical'][0], 4)
                sample = Image.fromarray(sample)
            else:
                sample = Image.open(root / f'{record["member"]}-{slot}-{density}x-fixed.png').convert('RGBA')
            position = np.array(md['origin']) + md['offset'] + grade * step
            pieces.append((position, sample))
    low = np.min([p for p, _ in pieces], axis=0)
    high = np.max([p + np.array(im.size) / density for p, im in pieces], axis=0).astype(int)
    result = Image.new('RGBA', tuple((high - low) * density))
    for p, im in pieces:
        result.alpha_composite(im, tuple((p - low) * density))
    return result.resize((result.width * 2, result.height * 2), Image.Resampling.NEAREST) if density == 1 else result


rows = [[placement(record, density) for density in [1, 2, 4]] for record in records]
widths = [max(row[c].width for row in rows) + 45 for c in range(3)]
heights = [max(im.height for im in row) + 78 for row in rows]
canvas = Image.new('RGB', (sum(widths) + 48, sum(heights) + 150), '#20272b')
draw = ImageDraw.Draw(canvas)
draw.text((24, 20), 'Source placement probe: four grades per native direction', font=font(32), fill='white')
draw.text((24, 62), 'Native TMP positions and slope planes; this is not a mission screenshot.', font=font(24), fill='#c7cbd0')
x = 24
for label, width in zip(['Original source (2X reference)', 'Independent 2X export', 'Independent 4X export'], widths):
    draw.text((x, 108), label, font=font(24), fill='#d6e9ff'); x += width
y = 160
for record, images, height in zip(records, rows, heights, strict=True):
    x = 24
    for im, width in zip(images, widths, strict=True):
        draw.text((x, y), record['member'], font=font(26), fill='white')
        canvas.paste(im, (x, y + 42), im); x += width
    y += height
canvas.save(output)
print(json.dumps(dict(file=str(output), size=canvas.size, directions=len(rows))))
