"""Native damage/construction evidence for approved Task C mechanical authoring."""
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path('.artifacts/yuri-buildings')
OUT = ROOT / (sys.argv[1] if len(sys.argv) > 1 else 'production-references-v1')
OUT.mkdir(exist_ok=False)
inventory = json.loads((ROOT / 'source-v1/inventory.json').read_text())
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 23)


def decode(row, member, n):
    raw = json.loads((ROOT / 'source-v1/members' / (member['source']['sha256'] + '.json')).read_text())
    frame = raw['frames'][n]
    indices = np.array(frame['pixels'], np.uint8).reshape(frame['height'], frame['width'])
    rgb = np.array(row['palette']['colors'], np.uint8)[indices]
    rgb[indices == 0] = 0
    image = Image.new('RGBA', raw['canvas'])
    image.paste(Image.fromarray(np.dstack((rgb, np.uint8(indices != 0) * 255))), (frame['x'], frame['y']))
    return image


for row in inventory['matrix']:
    if row['theater'] != 'TEMPERATE' or row['id'] in ('YADEPT', 'NAPSIS', 'NACLON'):
        continue
    directory = OUT / row['id']
    directory.mkdir()
    body = next(m for m in row['members'] if 'body' in m['roles'])
    damaged = Image.new('RGBA', body['canvas'])
    if row['id'] == 'GAFWLL':
        damaged = decode(row, body, 21)
    else:
        for role in ('bib', 'body'):
            for member in row['members']:
                if role in member['roles']:
                    damaged.alpha_composite(decode(row, member, 1))
        animations = [a for a in row['animations'] if a['type'] in ('ACTIVE', 'IDLE')]
        if not animations:
            animations = [a for a in row['animations'] if a['type'] == 'SUPER'][:1]
        for animation in animations:
            member = next(m for m in row['members'] if m['source']['member'] == animation['member'])
            props = animation.get('damaged') or animation['normal']
            damaged.alpha_composite(decode(row, member, props['start']), tuple(animation['offset'].values()))
    damaged.resize(tuple(v * 4 for v in damaged.size), Image.Resampling.NEAREST).save(directory / 'damaged-reference.png')
    sheets = []
    for member in row['members']:
        frames = list(range(member['visibleFrames']))
        if len(frames) > 8:
            frames = sorted({round(i * (len(frames) - 1) / 7) for i in range(8)})
        width, height = member['canvas']
        columns = min(4, len(frames))
        sheet = Image.new('RGB', (width * columns * 2, (height * 2 + 32) * ((len(frames) + columns - 1) // columns)), '#293e35')
        draw = ImageDraw.Draw(sheet)
        for i, n in enumerate(frames):
            image = decode(row, member, n).resize((width * 2, height * 2), Image.Resampling.NEAREST)
            x, y = i % columns * width * 2, i // columns * (height * 2 + 32)
            sheet.paste(image, (x, y + 32), image)
            draw.text((x + 8, y + 3), f'{member["source"]["member"]} / {n}', fill='white', font=font)
        sheet.save(directory / (member['source']['member'] + '-states.png'))
        if 'BUILDUP' in member['roles']:
            for label, n in [('foundation', 0), ('middle', member['visibleFrames'] // 2)]:
                image = decode(row, member, n)
                image.resize(tuple(v * 4 for v in image.size), Image.Resampling.NEAREST).save(directory / (label + '-reference.png'))
    print(row['id'], len(row['members']), flush=True)
