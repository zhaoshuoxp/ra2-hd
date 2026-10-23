import json
from pathlib import Path
from PIL import Image, ImageDraw
root = Path('.artifacts/menu-ui/inventory-v1')
names = ['giicon','e2icon','htnkicon','gtnkicon','powricon','npwricon','tslaicon','agisicon','v3icon','dogicon','harvicon','jjeticon']
board = Image.new('RGB', (1200, 660), '#17232c')
draw = ImageDraw.Draw(board)
for index, name in enumerate(names):
    path = root / f'{name}.shp.json'
    if not path.exists():
        continue
    data = json.loads(path.read_text()); f = data['frame']
    img = Image.new('RGB', (data['width'], data['height']))
    px = Image.new('RGB', (f['width'], f['height']))
    px.putdata([tuple(data['palette'][i]) for i in f['pixels']]); img.paste(px, (f['x'], f['y']))
    img.save(root / f'{name}.png')
    x, y = (index % 4)*300, (index//4)*220
    board.paste(img.resize((240,176), Image.Resampling.NEAREST), (x+30,y+12))
    draw.text((x+30,y+192),name,fill='white')
board.save(root / 'cameo-reference.png')
