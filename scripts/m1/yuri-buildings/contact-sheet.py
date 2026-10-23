"""Inspect physical-density exports reconstructed at their native origins."""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from production_common import ROOT, row_for

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('exports')
parser.add_argument('identity')
parser.add_argument('--theater', default='TEMPERATE')
parser.add_argument('--density', type=int, default=4)
parser.add_argument('--member', default='BUILDUP')
parser.add_argument('--frames', type=int, nargs='+')
parser.add_argument('--output', default='construction-selected-full-buffer.png')
args = parser.parse_args()
row = row_for(args.identity, args.theater)
member = next(m for m in row['members'] if args.member in m['roles'] or m['source']['member'] == args.member)
folder = ROOT / args.exports / f'{args.identity}-{args.theater}-{args.density}x'
receipt = json.loads((folder / 'candidate-review.json').read_text())
frames = args.frames or sorted({round(i * (member['visibleFrames'] - 1) / 7) for i in range(8)})
size = tuple(v * args.density for v in member['canvas'])
columns = min(4, len(frames))
height = size[1] + 48
sheet = Image.new('RGB', (columns * size[0], ((len(frames) + columns - 1) // columns) * height), '#293e35')
draw = ImageDraw.Draw(sheet)
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 26)
for index, n in enumerate(frames):
    record = next(f for f in receipt['frames'] if (f['member'], f['nativeFrame']) == (member['source']['member'], n))
    image = Image.new('RGBA', size)
    if record['base']:
        patch = Image.open(folder / record['base']).convert('RGBA')
        image.alpha_composite(patch, tuple(record['native'][k] * args.density for k in ('x', 'y')))
    x, y = index % columns * size[0], index // columns * height
    draw.text((x + 12, y + 5), f'{n} / {args.density}X', font=font, fill='white')
    sheet.paste(image, (x, y + 48), image)
path = folder / args.output
assert not path.exists()
sheet.save(path)
print(path)
