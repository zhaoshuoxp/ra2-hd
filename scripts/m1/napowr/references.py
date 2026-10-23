"""Decode native indexed references; these are controls, never authored HD."""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

root = Path('.artifacts/m1-6a/source-v1')
out = Path('.artifacts/m1-6a/references-v1')
out.mkdir(exist_ok=False)
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
raws = {p.name[:-5]: json.loads(p.read_text()) for p in root.glob('*.shp.json')}
def frame(member, n):
    raw = raws[member]; f = raw['frames'][n]
    indices = np.array(f['pixels'], dtype=np.uint8).reshape(f['height'], f['width'])
    palette = np.array(raw['palette'], dtype=np.uint8)
    rgba = np.dstack([palette[indices], (indices != 0).astype(np.uint8) * 255])
    image = Image.new('RGBA', raw['canvas'])
    image.paste(Image.fromarray(rgba), (f['x'], f['y']))
    return image
samples = []
for label, body, active in [('normal', 0, 0), ('active-09', 0, 9), ('damaged', 1, 19), ('critical', 2, 28)]:
    im = frame('ngpowr.shp', body); im.alpha_composite(frame('ngpowr_a.shp', active))
    samples.append((label, im))
for n in [5, 12, 18, 25]: samples.append((f'buildup-{n:02}', frame('ntpowrmk.shp', n)))
board = Image.new('RGB', (1680, 1240), '#34483d')
draw = ImageDraw.Draw(board)
for i, (label, im) in enumerate(samples):
    im.save(out / f'{label}.png')
    im.resize((840, 560), Image.Resampling.NEAREST).save(out / f'{label}-4x.png')
    x, y = i % 4 * 420, i // 4 * 620
    draw.text((x + 10, y + 5), label, font=font, fill='white')
    board.paste(im.resize((420, 280), Image.Resampling.NEAREST), (x, y+45), im.resize((420, 280), Image.Resampling.NEAREST))
board.crop((0,0,1680,950)).save(out / 'representative-originals.png')
for member, raw in raws.items():
    count = len(raw['frames']); sheet = Image.new('RGB', (1260, ((count+5)//6)*170), '#34483d'); d = ImageDraw.Draw(sheet)
    for n in range(count):
        im = frame(member,n); x,y=n%6*210,n//6*170
        sheet.paste(im,(x,y+25),im); d.text((x+3,y),str(n),font=font,fill='white')
    sheet.save(out/f'{member}-all.png')
