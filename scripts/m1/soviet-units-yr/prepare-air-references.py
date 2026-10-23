"""Assemble native-rendered source references without synthesizing unit artwork."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import numpy as np
root = Path('.artifacts/m1-7-yr')
src = root / 'native-references-v4'
out = root / 'air-references-v3'
out.mkdir(exist_ok=False)
report = json.loads((src / 'result.json').read_text())
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 26)
selections = []
for identity, roles in {'SCHP': [('SCHP', 0, 'Flight'), ('SCHP', 90, 'Flight'), ('SCHD', 0, 'Deployed'), ('SCHD', 90, 'Deployed')], 'BPLN': [('BPLN', 0, 'Flight'), ('BPLN', 90, 'Flight')]}.items():
    board = Image.new('RGB', (1024, 1024 if len(roles) == 4 else 560), (72, 88, 78))
    draw = ImageDraw.Draw(board)
    cells = []
    for i, (unit, heading, state) in enumerate(roles):
        entry = next(u for u in report['units'] if u['name'] == unit)
        view = next(v for v in entry['views'] if v['heading'] == heading)
        im = Image.open(src / view['layers']['complete']).convert('RGB')
        arr = np.asarray(im).astype(int)
        ys, xs = np.where(np.max(np.abs(arr - [72,88,78]),axis=2)>8)
        box = [max(0,int(xs.min())-3),max(0,int(ys.min())-3),min(im.width,int(xs.max())+4),min(im.height,int(ys.max())+4)]
        tile = im.crop(box)
        scale = min(4,460/tile.width,375/tile.height)
        large = tile.resize((round(tile.width*scale),round(tile.height*scale)),Image.Resampling.NEAREST)
        x,y = (i%2)*512,(i//2)*480+45
        placement = [x+(512-large.width)//2,y+(400-large.height)//2]
        board.paste(large,placement)
        label = f'{state} / yaw {heading}'
        draw.text((x+14,y+415),label,font=font,fill='white')
        cells.append({'unit':unit,'heading':heading,'state':state,'cell':[x,y,512,400], 'source':view['layers']['complete'],'crop':box,'scale':scale,'placement':placement,'nativeBounds':view['bounds'],'nativeCrop':view['crop']})
    draw.text((16,10),f'{identity} | Original native references',font=font,fill='white')
    board.save(out/f'{identity}-board.png')
    selections.append({'id':identity,'cells':cells})
(out/'selection.json').write_text(json.dumps(selections,indent=2)+'\n')
