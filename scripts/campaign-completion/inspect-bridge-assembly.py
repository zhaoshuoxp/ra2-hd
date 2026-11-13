"""Inspect complete source-compatible bridge assemblies at both authored densities."""
import hashlib
import json
from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageFont

stage = Path(sys.argv[1]).resolve()
output = stage / 'assembly-inspection'
output.mkdir(exist_ok=False)
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pack_file = stage / 'pack/manifest.json'
pack = read(pack_file)
family, definition = next(iter(pack['families'].items()))
members = {int(member['member'][6:8]): stage / 'pack' / member['path'] for member in definition['members']}
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 26)
title = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 32)
cases = [('X healthy', [21, 1, 1, 1, 1, 1, 19], 1), ('Y healthy', [23, 10, 10, 10, 10, 10, 25], -1),
         ('X damaged', [21, 1, 6, 7, 5, 1, 19], 1), ('Y damaged', [23, 10, 14, 16, 15, 10, 25], -1)]


def load(number, density):
    file = members[number]
    metadata = read(file)
    variant = next(v for v in metadata['variants'] if v['density'] == density)
    frame = variant['frames'][1]
    page = next(p for p in variant['pages'] if p['id'] == frame['page'])
    image = Image.open(file.parent / str(density) / page['id'] / 'base.png').convert('RGBA')
    x, y, width, height = frame['contentRect']
    origin = metadata['logical']['frames'][1]['trimOrigin']
    return image.crop((x, y, x + width, y + height)), origin


images, checks = [], []
for density in [2, 4]:
    for label, values, sign in cases:
        canvas = Image.new('RGBA', (410 * density, 220 * density))
        base_x = (0 if sign > 0 else 200) * density
        for index, number in enumerate(values):
            axis_x = number <= 9 or 19 <= number <= 22
            assert axis_x == (sign > 0), 'Never insert an opposite-direction frame into an unchanged bridge'
            image, (ox, oy) = load(number, density)
            canvas.alpha_composite(image, (base_x + sign * 30 * density * index + ox * density,
                                          15 * density * index + oy * density))
        file = output / (label.lower().replace(' ', '-') + f'-{density}x.png')
        canvas.save(file)
        images.append((density, label, canvas))
        checks.append(dict(density=density, label=label, members=values, sourceAxisCompatible=True,
                           file=str(file), sha256=sha(file)))
    selected = [(label, image) for d, label, image in images if d == density]
    width, height = 850 * density // 2, 520 * density // 2
    board = Image.new('RGB', (width * 2, height * 2), (30, 36, 40))
    draw = ImageDraw.Draw(board)
    for i, (label, image) in enumerate(selected):
        x, y = i % 2 * width, i // 2 * height
        draw.text((x + 12, y + 5), label + f' / {density}X', font=title, fill='white')
        board.paste(image, (x, y + 50), image)
    board.save(output / f'connected-assemblies-{density}x.png')

    cells = []
    for number in range(1, 27):
        image, _ = load(number, density)
        cell = Image.new('RGB', (max(280, image.width + 20), image.height + 65), (30, 36, 40))
        draw = ImageDraw.Draw(cell)
        axis = 'X' if number <= 9 or 19 <= number <= 22 else 'Y'
        draw.text((8, 8), f'LOBRDB{number:02d} / {axis} / {density}X', font=font, fill='white')
        cell.paste(image, (10, 55), image); cells.append(cell)
    w, h = max(c.width for c in cells), max(c.height for c in cells)
    board = Image.new('RGB', (w * 4, h * 7), (30, 36, 40))
    for i, cell in enumerate(cells):
        board.paste(cell, ((i % 4) * w, (i // 4) * h))
    board.save(output / f'all26-native-slots-{density}x.png')

receipt = dict(status='INTERNAL_DENSITY_AND_ASSEMBLY_SHEETS_READY_FOR_INSPECTION',
               packSha256=sha(pack_file), family=family, independentDensities=[2, 4], assemblies=checks,
               scope='Offline RGBA composition uses original30/15-pixel neighboring tile vectors, source-compatible axes and original adjacency variants. It is separate from actual mission and native-renderer evidence. No map is changed.')
(output / 'inspection-inputs.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(dict(status=receipt['status'], output=str(output))))
