"""Decode immutable retail references for the representative art decision."""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path('.artifacts/m1-6c')
SOURCE = ROOT / 'source-v2'
OUT = ROOT / 'references-v1'
OUT.mkdir(exist_ok=False)
inventory = json.loads((SOURCE / 'inventory.json').read_text())
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 20)
records = {}


def row_for(identity, theater):
    return next(r for r in inventory['matrix'] if r['id'] == identity
                and r['edition'] == 'yr' and r['theater'] == theater)


def decode(row, member, index):
    raw = json.loads((SOURCE / 'members' / (member['source']['sha256'] + '.json')).read_text())
    frame = raw['frames'][index]
    indices = np.array(frame['pixels'], dtype=np.uint8).reshape(frame['height'], frame['width'])
    palette = np.array(row['palette']['colors'], dtype=np.uint8)
    rgba = np.dstack([palette[indices], (indices != 0).astype(np.uint8) * 255])
    canvas = Image.new('RGBA', raw['canvas'])
    canvas.paste(Image.fromarray(rgba), (frame['x'], frame['y']))
    return canvas


for identity, theater in [('NAINDP', 'TEMPERATE'), ('NABNKR', 'TEMPERATE'),
                          ('NAPOWR', 'SNOW'), ('NAHAND', 'SNOW'), ('NAREFN', 'SNOW'),
                          ('NAPOWR', 'NEWURBAN'), ('NAPOWR', 'TEMPERATE')]:
    row = row_for(identity, theater)
    key = identity + '-' + theater
    directory = OUT / key
    directory.mkdir()
    body = next(m for m in row['members'] if 'body' in m['roles'])
    size = body['canvas']
    canvas = Image.new('RGBA', size)
    for role in ['bib', 'body']:
        for member in row['members']:
            if role in member['roles']:
                canvas.alpha_composite(decode(row, member, 0))
    for anim in row['animations']:
        if anim['type'] in ['IDLE', 'ACTIVE']:
            member = next(m for m in row['members'] if m['source']['member'] == anim['member'])
            canvas.alpha_composite(decode(row, member, anim['normal']['start']), tuple(anim['offset'].values()))
    canvas.save(directory / 'normal.png')
    canvas.resize((size[0] * 4, size[1] * 4), Image.Resampling.NEAREST).save(directory / 'normal-reference.png')
    for member in row['members']:
        if not ('BUILDUP' in member['roles'] or identity in ['NAINDP', 'NABNKR']):
            continue
        count = member['visibleFrames']
        sheet = Image.new('RGB', (size[0] * 5, ((count + 4) // 5) * (size[1] + 28)), '#34483d')
        draw = ImageDraw.Draw(sheet)
        for index in range(count):
            im = decode(row, member, index)
            name = member['source']['member'] + f'-{index:02}.png'
            im.save(directory / name)
            x, y = index % 5 * size[0], index // 5 * (size[1] + 28)
            sheet.paste(im, (x, y + 28), im)
            draw.text((x + 5, y), str(index), font=font, fill='white')
        sheet.save(directory / (member['source']['member'] + '-contact.png'))
    records[key] = {'size': size, 'source': body['source'], 'palette': row['palette']['sha256']}

# Shared SHP hashes alone do not establish palette equivalence. Compare only
# indices used by visible frames; shadow split and remap remain explicit.
reuse = {}
for identity in ['NAYARD', 'TESLA']:
    dry, snow = row_for(identity, 'TEMPERATE'), row_for(identity, 'SNOW')
    used = set()
    for member in snow['members']:
        raw = json.loads((SOURCE / 'members' / (member['source']['sha256'] + '.json')).read_text())
        for f in raw['frames'][:member['visibleFrames']]:
            used.update(f['pixels'])
    differing = [i for i in sorted(used - {0}) if dry['palette']['colors'][i] != snow['palette']['colors'][i]]
    reuse[identity] = {'completeMemberHashMatch': snow['completeHashMatch'], 'usedPaletteDifferences': differing,
                       'runtime': 'NOT_RUN', 'decision': 'REUSE_CANDIDATE_PENDING_RUNTIME_PALETTE_AND_LIGHTING'}
(OUT / 'references.json').write_text(json.dumps({'representatives': records, 'snowReuse': reuse}, indent=2) + '\n')
print(json.dumps({'references': list(records), 'snowReuse': reuse}))
