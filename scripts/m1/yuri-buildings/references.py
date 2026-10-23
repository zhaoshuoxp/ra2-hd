"""Decode audited native families and record resumable Task C scope."""
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path('.artifacts/yuri-buildings')
SOURCE = ROOT / 'source-v1'
OUT = ROOT / 'references-v1'
OUT.mkdir(exist_ok=False)
inventory = json.loads((SOURCE / 'inventory.json').read_text())
records = []

def decode(row, member, index):
    raw = json.loads((SOURCE / 'members' / (member['source']['sha256'] + '.json')).read_text())
    frame = raw['frames'][index]
    pixels = np.array(frame['pixels'], dtype=np.uint8).reshape(frame['height'], frame['width'])
    colors = np.array(row['palette']['colors'], dtype=np.uint8)[pixels]
    canvas = Image.new('RGBA', raw['canvas'])
    canvas.paste(Image.fromarray(np.dstack([colors, (pixels != 0).astype(np.uint8) * 255])), (frame['x'], frame['y']))
    return canvas

for row in inventory['matrix']:
    if row['theater'] not in ('TEMPERATE', 'SNOW'):
        continue
    key = row['id'] + '-' + row['theater']
    directory = OUT / key
    directory.mkdir()
    body = next(m for m in row['members'] if 'body' in m['roles'])
    canvas = Image.new('RGBA', body['canvas'])
    for role in ('bib', 'body'):
        for member in row['members']:
            if role in member['roles']:
                canvas.alpha_composite(decode(row, member, 5 if row['id'] == 'GAFWLL' else 0))
    resting = [a for a in row['animations'] if a['type'] in ('IDLE', 'ACTIVE')]
    if not resting:
        resting = [a for a in row['animations'] if a['type'] == 'SUPER'][:1]
    for anim in resting:
        member = next(m for m in row['members'] if m['source']['member'] == anim['member'])
        canvas.alpha_composite(decode(row, member, anim['normal']['start']), tuple(anim['offset'].values()))
    canvas.save(directory / 'normal.png')
    canvas.resize((canvas.width * 4, canvas.height * 4), Image.Resampling.NEAREST).save(directory / 'normal-reference.png')
    for anim in row['animations']:
        if anim['type'] in ('BUILDUP', 'UNBUILD', 'ACTIVE', 'IDLE'):
            continue
        member = next(m for m in row['members'] if m['source']['member'] == anim['member'])
        props = anim['normal']
        indices = sorted({props['start'], (props['start'] + props['end']) // 2, props['end']})
        sheet = Image.new('RGBA', (member['canvas'][0] * len(indices), member['canvas'][1]))
        for i, index in enumerate(indices):
            sheet.alpha_composite(decode(row, member, index), (i * member['canvas'][0], 0))
        sheet.save(directory / (anim['name'] + '-endpoints.png'))
    records.append({'key': key, 'canvas': body['canvas'], 'source': body['source'],
                    'dependencies': row['dependencies'], 'nativeOwnerPixels': sum(
                        sum(16 <= v <= 31 for v in f['pixels'])
                        for m in row['members']
                        for f in json.loads((SOURCE / 'members' / (m['source']['sha256'] + '.json')).read_text())['frames'][:m['visibleFrames']])})

(OUT / 'references.json').write_text(json.dumps(records, indent=2) + '\n')
dry = [r for r in records if r['key'].endswith('TEMPERATE')]
board = Image.new('RGB', (1800, ((len(dry) + 3) // 4) * 330), '#293c35')
draw = ImageDraw.Draw(board)
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 24)
for i, row in enumerate(dry):
    im = Image.open(OUT / row['key'] / 'normal.png')
    factor = min(2, 425 / im.width, 275 / im.height)
    im = im.resize((round(im.width * factor), round(im.height * factor)), Image.Resampling.NEAREST)
    x, y = i % 4 * 450, i // 4 * 330
    draw.text((x + 12, y + 10), row['key'].split('-')[0], fill='white', font=font)
    board.paste(im, (x + 12, y + 45), im)
board.save(OUT / 'native-roster.png')
ledger = {'schemaVersion': 1, 'baseline': inventory['baseline'], 'status': 'SOURCE_AUDITED_AUTHORING_PENDING',
          'rulesIdentities': len(inventory['union']), 'cells': len(inventory['matrix']),
          'uniqueSourceMembers': len(inventory['uniqueMembers']), 'families': []}
for identity in inventory['union']:
    rows = [r for r in inventory['matrix'] if r['id'] == identity]
    ledger['families'].append({'id': identity, 'nativeRules': rows[0]['rules'],
        'eligibility': 'NATIVE_TECH_LEVEL_15_ABOVE_SKIRMISH_LIMIT' if identity == 'YADEPT' else 'NATIVE_ELIGIBILITY_TO_VERIFY',
        'sourceGroups': list({hashlib.sha256(json.dumps([(m['source']['sha256'], m['aggregateOffset']) for m in r['members']]).encode()).hexdigest() for r in rows}),
        'theaters': [{'theater': r['theater'], 'members': r['members'], 'animations': r['animations'],
                     'dependencies': r['dependencies'], 'selected2x': None, 'selected4x': None} for r in rows],
        'representativeApproval': 'PENDING', 'complete2x': False, 'complete4x': False, 'nativeEvidence': 'NOT_RUN'})
(ROOT / 'ledger-v1.json').write_text(json.dumps(ledger, indent=2) + '\n')
print(json.dumps({k: ledger[k] for k in ('status', 'rulesIdentities', 'cells', 'uniqueSourceMembers')}))
