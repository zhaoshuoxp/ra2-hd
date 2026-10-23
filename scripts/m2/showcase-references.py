"""Assemble exact native reference boards; these are not HD exports."""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(sys.argv[1])
out = Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=False)
source = json.loads((root / 'source.json').read_text())
members = {entry['member']: entry for entry in source['sources']}
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 28)
title_font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 40)
metadata = []


def native(member, slot=0):
    entry = members[member]
    frames = entry.get('images', entry.get('frames'))
    if entry['format'] == 'shp':
        frame = frames[slot]
        image = Image.frombytes('RGBA', tuple(frame['size']), (root / 'native' / frame['file']).read_bytes())
        return image, [slot]
    parts = []
    for frame in frames:
        if frame['nativeOffset'] == 0:
            continue
        x = frame['origin'][0] + frame['offset'][0]
        y = frame['origin'][1] + frame['offset'][1] - frame['height'] * 15
        parts.append((frame, x, y))
    left = min(p[1] for p in parts)
    top = min(p[2] for p in parts)
    width = max(x + frame['size'][0] for frame, x, y in parts) - left
    height = max(y + frame['size'][1] for frame, x, y in parts) - top
    image = Image.new('RGBA', (width, height))
    for frame, x, y in sorted(parts, key=lambda part: part[2]):
        part = Image.frombytes('RGBA', tuple(frame['size']), (root / 'native' / frame['file']).read_bytes())
        image.alpha_composite(part, (x - left, y - top))
    return image, [part[0]['subTile'] for part in parts]


boards = [
    ('ground-water', 'Native ground and water references', [
        ('ruff01.tem', 0, 'Thick grass'), ('shore13.tem', 0, 'Shore contact'),
        ('water04.tem', 0, 'Water surface'), ('wb04x.tem', 0, 'Waterfall phase'),
    ]),
    ('props-resources', 'Native props and resource references', [
        ('tib01.tem', 11, 'Ore amount state'), ('gem01.tem', 11, 'Gem amount state'),
        ('tree05.tem', 0, 'Tree silhouette'), ('trock01.tem', 0, 'Standalone rock'),
    ]),
    ('civil-buildings', 'Native civilian and technology references', [
        ('cthosp.shp', 0, 'Technology hospital'), ('ctfarm01.shp', 0, 'Farm building'),
        ('ctgas01.shp', 0, 'Gas station'), ('cthse01.shp', 0, 'Civilian house'),
    ]),
    ('animal', 'Native neutral animal references', [
        ('cow.shp', 0, 'Standing view'), ('cow.shp', 8, 'Turning view'),
        ('cow.shp', 16, 'Movement pose'), ('cow.shp', 80, 'Native action pose'),
    ]),
    ('bridges', 'Native bridge deck references', [
        ('lobrdb01.tem', 1, 'Concrete deck variant 01'), ('lobrdg01.tem', 1, 'Wood deck variant 01'),
        ('lobrdb13.tem', 1, 'Concrete deck variant 13'), ('lobrdg13.tem', 1, 'Wood deck variant 13'),
    ]),
]
if len(sys.argv) > 3:
    boards.append(('neutral-actors', 'Native neutral actor references', [
        ('car-native-0.png', 0, 'Original CAR heading 0'), ('car-native-90.png', 0, 'Original CAR heading 90'),
        ('cow.shp', 16, 'Native cow movement pose'), ('cow.shp', 80, 'Native cow action pose'),
    ]))
for name, title, cells in boards:
    board = Image.new('RGBA', (1280, 1400), (34, 43, 38, 255))
    draw = ImageDraw.Draw(board)
    draw.text((32, 22), title, font=title_font, fill='white')
    draw.text((32, 78), 'Original indexed pixels; independently fitted guides. No HD claim.', font=font, fill='#ccd8ce')
    panels = []
    for index, (member, slot, label) in enumerate(cells):
        runtime_reference = member.endswith('.png')
        if runtime_reference:
            image = Image.open(Path(sys.argv[3]) / member).convert('RGBA')
            slots = []
        else:
            image, slots = native(member, slot)
        bounds = image.getbbox()
        assert bounds, (member, slot)
        crop = image.crop(bounds)
        scale = min(550 / crop.width, 540 / crop.height)
        preview = crop.resize((round(crop.width * scale), round(crop.height * scale)), Image.Resampling.NEAREST)
        x, y = 24 + index % 2 * 632, 138 + index // 2 * 624
        draw.rectangle((x, y, x + 606, y + 594), fill='#526052', outline='#849284', width=2)
        board.alpha_composite(preview, (x + (606 - preview.width) // 2, y + 20 + (540 - preview.height) // 2))
        draw.text((x + 12, y + 550), label, font=font, fill='white')
        image.save(out / f'{name}-{index}-native.png')
        panels.append(dict(member=member, slots=slots, nativeSize=list(image.size), crop=list(bounds),
                           sourceSha256=None if runtime_reference else members[member]['sha256'],
                           runtimeReference=runtime_reference))
    board.save(out / f'{name}-native-board.png')
    metadata.append(dict(board=name, panels=panels, purpose='NATIVE_REFERENCE_NOT_HD_PRODUCTION'))
(out / 'references.json').write_text(json.dumps(metadata, indent=2) + '\n')
print(json.dumps(dict(boards=len(metadata), output=str(out))))
