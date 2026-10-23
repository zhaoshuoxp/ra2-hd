"""Decode source-only poses for review; no HD authoring or runtime activation."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path('.artifacts/yuri-units')
source = root / 'source-v2'
output = root / 'shp-references-v1'
output.mkdir(exist_ok=False)
ledger = json.loads((root / 'ledger.json').read_text())
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 25)
items = []
for row in [r for r in ledger['rows'] if r['included']] + ledger['children']:
    if row['representation'] != 'SHP' or row.get('reuse'):
        continue
    raw = json.loads((source / (row['members'][0] + '.json')).read_text())
    states = [s for s in ['Ready', 'Walk', 'FireUp', 'SecondaryFire', 'Deploy', 'Shovel', 'Carry', 'Die1']
              if s in row['sequences']][:6]
    board = Image.new('RGB', (1024, 1024), (72, 88, 78))
    draw = ImageDraw.Draw(board)
    draw.text((18, 12), row['id'] + ' | Original source reference', font=font, fill='white')
    cells = []
    for i, state in enumerate(states):
        start, count, stride, *_ = row['sequences'][state].split(',')
        number = int(start) + min(2, int(count) - 1) + int(stride) * 3
        frame = raw['frames'][number]
        tile = Image.new('RGBA', (frame['width'], frame['height']))
        tile.putdata([tuple(raw['palette'][p]) + (255 if p else 0,) for p in frame['pixels']])
        original = Image.new('RGBA', tuple(raw['canvas']))
        original.alpha_composite(tile, (frame['x'], frame['y']))
        scale = min(6, 300 / original.width, 360 / original.height)
        display = original.resize((round(original.width * scale), round(original.height * scale)), Image.Resampling.NEAREST)
        x, y = (i % 3) * 340, (i // 3) * 480 + 54
        board.paste(display, (x + (340 - display.width) // 2, y + (380 - display.height) // 2), display)
        draw.text((x + 12, y + 402), f'{state} / slot {number}', font=font, fill='white')
        filename = f'{row["id"]}-{number}-original.png'
        original.save(output / filename)
        cells.append({'state': state, 'frame': number, 'source': filename, 'canvas': raw['canvas'],
                      'nativeBounds': [frame['x'], frame['y'], frame['width'], frame['height']],
                      'cell': [x, y, 340, 380]})
    filename = row['id'] + '-board.png'
    board.save(output / filename)
    items.append({'id': row['id'], 'reference': filename, 'cells': cells, 'sourceHash': raw['sha256']})
(output / 'selection.json').write_text(json.dumps(items, indent=2) + '\n')
print('Prepared', len(items), 'Original SHP boards')
