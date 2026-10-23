"""Decode native Allied representative layers using the shared building inventory."""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path('.artifacts/allied-buildings')
SOURCE = ROOT / 'source-v2'
OUT = ROOT / 'references-v1'
OUT.mkdir(exist_ok=False)
inventory = json.loads((SOURCE / 'inventory.json').read_text())
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
records = {}


def decode(row, member, index):
    raw = json.loads((SOURCE / 'members' / (member['source']['sha256'] + '.json')).read_text())
    frame = raw['frames'][index]
    indices = np.array(frame['pixels'], dtype=np.uint8).reshape(frame['height'], frame['width'])
    palette = np.array(row['palette']['colors'], dtype=np.uint8)
    rgba = np.dstack([palette[indices], (indices != 0).astype(np.uint8) * 255])
    canvas = Image.new('RGBA', raw['canvas'])
    canvas.paste(Image.fromarray(rgba), (frame['x'], frame['y']))
    return canvas


for row in inventory['matrix']:
    if row['edition'] != 'yr' or row['theater'] not in ['TEMPERATE', 'SNOW'] or row['id'] == 'AMRADR':
        continue
    key = row['id'] + '-' + row['theater']
    directory = OUT / key
    directory.mkdir()
    body = next(m for m in row['members'] if 'body' in m['roles'])
    canvas = Image.new('RGBA', body['canvas'])
    for role in ['bib', 'body']:
        for member in row['members']:
            if role in member['roles']:
                canvas.alpha_composite(decode(row, member, 5 if row['id'] == 'GAWALL' else 0))
    idle = [a for a in row['animations'] if a['type'] in ['IDLE', 'ACTIVE']]
    if not idle:
        idle = [a for a in row['animations'] if a['type'] == 'SUPER'][:1]
    for anim in idle:
        member = next(m for m in row['members'] if m['source']['member'] == anim['member'])
        canvas.alpha_composite(decode(row, member, anim['normal']['start']), tuple(anim['offset'].values()))
    canvas.save(directory / 'normal.png')
    canvas.resize((canvas.width * 4, canvas.height * 4), Image.Resampling.NEAREST).save(directory / 'normal-reference.png')
    records[key] = {'size': body['canvas'], 'source': body['source'], 'palette': row['palette']['sha256'],
                    'turretPending': bool(row['dependencies']), 'animations': row['animations']}
    if row['theater'] == 'TEMPERATE':
        for anim in row['animations']:
            if anim['type'] in ['UNBUILD', 'IDLE', 'ACTIVE']:
                continue
            member = next(m for m in row['members'] if m['source']['member'] == anim['member'])
            props = anim['normal']
            indices = sorted(set([props['start'], (props['start'] + props['end']) // 2, props['end']]))
            sheet = Image.new('RGBA', (canvas.width * 3, canvas.height))
            for i, index in enumerate(indices):
                frame = decode(row, member, index)
                sheet.alpha_composite(frame, (i * canvas.width, 0))
            sheet.save(directory / (anim['name'] + '-endpoints.png'))

(OUT / 'references.json').write_text(json.dumps(records, indent=2) + '\n')
keys = [k for k in records if k.endswith('TEMPERATE')]
board = Image.new('RGB', (1600, ((len(keys) + 3) // 4) * 320), '#34483d')
draw = ImageDraw.Draw(board)
for i, key in enumerate(keys):
    im = Image.open(OUT / key / 'normal.png')
    factor = min(2, 370 / im.width, 265 / im.height)
    im = im.resize((int(im.width * factor), int(im.height * factor)), Image.Resampling.NEAREST)
    x, y = i % 4 * 400, i // 4 * 320
    draw.text((x + 12, y + 10), key.split('-')[0], font=font, fill='white')
    board.paste(im, (x + 12, y + 42), im)
board.save(OUT / 'native-roster.png')
print(json.dumps({'references': len(records), 'turretReferencesPending': [k for k, v in records.items() if v['turretPending']]}))
