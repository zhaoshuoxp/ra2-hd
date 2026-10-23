"""Inspect source projections at retained original tile positions and elevations."""
from functools import lru_cache
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from newurban_batch96_io import BASELINE, ROOT, SOURCES, crop, native, pin, read, write

version = sys.argv[1] if len(sys.argv) > 1 else 'v3'
report_file = Path('.artifacts/m2-4/newurban-tmp-material-reuse-batch93-20261020/native-4x-v1/report.json')
report = read(report_file)
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 22)
selected = read(Path('.local/terrain-packs') / BASELINE['revision'] / 'manifest.json')
selected_names = {m['member'] for g in selected['groups'] for m in g['members']}
rows = []


@lru_cache(maxsize=200)
def pixels(name, slot, proposed):
    metadata = SOURCES[name]['images'][slot]
    file = ROOT / f'authored-{version}' / name / '4x' / f'{slot}.rgba'
    if proposed and file.exists():
        return np.fromfile(file, np.uint8).reshape(*reversed([n * 4 for n in metadata['size']]), 4)
    if name in selected_names:
        return crop(BASELINE, name, slot, 4)
    return native(SOURCES[name], metadata).repeat(4, 0).repeat(4, 1)


for direction in [1, 2, 3, 4]:
    name = f'prslpe0{direction}.ubn'
    options = []
    for case in report['maps']:
        bindings = case['launch']['terrain']['placedBindings']
        for binding in bindings:
            if binding['member'] != name or binding['subTile'] != 1:
                continue
            rx, ry, z, *_ = binding['tile']
            neighbors = [b for b in bindings if abs(b['tile'][0] - rx) <= 4 and abs(b['tile'][1] - ry) <= 4]
            score = sum(b['member'].startswith(('proad', 'p_end')) for b in neighbors)
            options.append((score, case['mapId'], binding, neighbors))
    score, map_id, center, neighbors = max(options, key=lambda row: row[0])
    rx, ry, z, *_ = center['tile']
    cx, cy = 30 * (rx - ry), 15 * (rx + ry) - 15 * z
    pair = Image.new('RGB', (1600, 620), '#14202a')
    draw = ImageDraw.Draw(pair)
    for column, proposed in enumerate([False, True]):
        canvas = Image.new('RGBA', (800, 560), '#14202a')
        for binding in sorted(neighbors, key=lambda b: sum(b['tile'][:2])):
            name2, slot = binding['member'], binding['subTile']
            if name2 not in SOURCES:
                continue
            metadata = SOURCES[name2]['images'][slot]
            x, y, z2, *_ = binding['tile']
            px = int((30 * (x - y) - cx + metadata['offset'][0] - 30) * 4 + 400)
            py = int((15 * (x + y) - 15 * z2 - cy + metadata['offset'][1]) * 4 + 240)
            canvas.alpha_composite(Image.fromarray(pixels(name2, slot, proposed)), (px, py))
        pair.paste(canvas.convert('RGB'), (column * 800, 45))
        draw.text((column * 800 + 10, 10), 'Proposed HD slope' if proposed else 'Original slope / accepted HD context', font=font, fill='white')
    draw.text((10, 590), f'{map_id} / {center["member"]} / original tile {center["tile"][:3]} / diagnostic projection, not a game capture', font=font, fill='white')
    file = ROOT / f'slope-contact-{direction}-{version}.png'
    pair.save(file)
    rows.append(dict(member=center['member'], mapId=map_id, tile=center['tile'], inspection=pin(file),
        originalPlacements=[b for b in neighbors if b['member'].startswith(('prslpe', 'proad', 'p_end'))]))
write(ROOT / f'slope-projection-contact-{version}.json', dict(status='SOURCE_PROJECTION_DIAGNOSTIC_NOT_NATIVE_ACCEPTANCE',
    retainedPositions=pin(report_file), baseline=BASELINE, rows=rows, mapsModified=False,
    native='NOT_RUN_FOR_BATCH96', windows='NOT_RUN', m24Complete=False))
print(dict(inspections=len(rows), version=version))
