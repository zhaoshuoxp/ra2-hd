"""Prepare native/authoring contact sheets without changing either input."""
import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('--exclude', type=Path)
parser.add_argument('--masters-root', type=Path)
args = parser.parse_args()
root = Path('.artifacts/m2-2/authoring-shp-v1')
work = json.loads((root / 'worklist.json').read_text())
masters_root = args.masters_root or root
seen = {name for row in json.loads(args.exclude.read_text()) for name in row['boards']} if args.exclude else set()
available = [batch for batch in work['batches'] if batch['name'] not in seen
             and (masters_root / (batch['name'] + '-master.png')).exists()]
args.output.mkdir(exist_ok=False)
records = []
for start in range(0, len(available), 4):
    board = Image.new('RGB', (2048, 2200), (25, 25, 25))
    draw = ImageDraw.Draw(board)
    batches = available[start:start + 4]
    for index, batch in enumerate(batches):
        y, name = index * 550, batch['name']
        draw.text((20, y + 12), name, fill='white', font_size=25)
        reference = Path('.artifacts/m2-2/rubble-native-guides-v3') / (name + '-reference.png')
        if not reference.exists():
            reference = root / (name + '-reference.png')
        for side, file in enumerate([reference, masters_root / (name + '-master.png')]):
            image = Image.open(file).convert('RGBA')
            image.thumbnail((1000, 495))
            board.paste(image, (side * 1024 + (1024 - image.width) // 2,
                               y + 45 + (495 - image.height) // 2), image)
    target = args.output / f'page-{start // 4 + 1:02}.jpg'
    board.save(target, quality=95)
    records.append(dict(page=str(target), boards=[batch['name'] for batch in batches]))
(args.output / 'index.json').write_text(json.dumps(records, indent=2) + '\n')
print(json.dumps(dict(pages=len(records), boards=len(available), pendingBoards=[batch['name']
    for batch in work['batches'] if not (masters_root / (batch['name'] + '-master.png')).exists()])))
