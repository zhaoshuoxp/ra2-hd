"""Native framebuffer crops only; no resampling or artwork edits."""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

source, out = map(Path, sys.argv[1:3])
out.mkdir(parents=True, exist_ok=True)
rows = json.loads((source / 'shadow-captures.json').read_text())
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 18)
labels = ['warped', 'cloaked-own', 'elevated-warped', 'normal', 'restored']
sheet = Image.new('RGB', (800, 232 * len(labels)), '#1c2024')
for y, label in enumerate(labels):
    for x, mode in enumerate(['before', 'after']):
        row = next(r for r in rows if r['label'] == label and r['mode'] == mode)
        cx, cy = map(round, row['center'])
        crop = Image.open(source / row['file']).convert('RGB').crop((cx-200, cy-125, cx+200, cy+75))
        sheet.paste(crop, (x*400, y*232+32))
        ImageDraw.Draw(sheet).text((x*400+8, y*232+6), f'{label} / {mode}', font=font, fill='white')
sheet.save(out / 'comparison.png')
sheet.crop((0, 0, 800, 464)).save(out / 'special-states.png')
