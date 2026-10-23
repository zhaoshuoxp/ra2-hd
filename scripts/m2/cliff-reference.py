"""Build native whole-assembly references; never synthesize terrain artwork."""
import json
from pathlib import Path
from PIL import Image

root = Path('.artifacts/m2-1/authoring-v8')
region = json.loads((root / 'region.json').read_text())
members = {m['member']: m for m in region['members'] if m['member'].startswith(('cliff', 'ramp'))}
layouts = {}
for name, member in members.items():
    parts = [dict(subTile=i['subTile'], rect=[i['origin'][0] + i['offset'][0],
        i['origin'][1] + i['offset'][1] - i['height'] * 15, *i['logical']])
        for i in member['images'] if member['nativeOffsets'][i['subTile']] > 0]
    left, top = min(p['rect'][0] for p in parts), min(p['rect'][1] for p in parts)
    w = max(p['rect'][0] + p['rect'][2] for p in parts) - left
    h = max(p['rect'][1] + p['rect'][3] for p in parts) - top
    image = Image.new('RGBA', (w, h))
    for p in sorted(parts, key=lambda p: p['rect'][1]):
        p['rect'][0] -= left; p['rect'][1] -= top
        data = Path('.artifacts/m2-1/inventory/native') / f"{member['nativeName']}-{p['subTile']}.rgba"
        image.alpha_composite(Image.frombytes('RGBA', tuple(p['rect'][2:]), data.read_bytes()), tuple(p['rect'][:2]))
    image.save(root / f'{name}-native.png')
    layouts[name] = dict(bounds=[left, top, w, h], parts=parts, nativeAlphaBounds=image.getbbox())
batches = [['cliff05.tem', 'cliff06.tem', 'cliff07.tem', 'cliff08.tem'],
           ['cliff01.tem', 'cliff02.tem', 'cliff03.tem', 'cliff04.tem'],
           ['cliff09.tem', 'cliff34.tem', 'cliff39.tem']]
for index, names in enumerate(batches):
    board = Image.new('RGBA', (1254, 1254))
    for slot, name in enumerate(names):
        image = Image.open(root / f'{name}-native.png')
        scale = min(595 / image.width, 595 / image.height)
        resized = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.NEAREST)
        board.alpha_composite(resized, ((slot % 2) * 627 + (627 - resized.width) // 2,
                                       (slot // 2) * 627 + (627 - resized.height) // 2))
        layouts[name].update(board=f'cliff-{index + 1}-master.png', slot=slot)
    board.save(root / f'cliff-{index + 1}-reference.png')
for name in ['ramp01.tem', 'ramp02.tem']:
    image = Image.open(root / f'{name}-native.png')
    scale = min(1190 / image.width, 1190 / image.height)
    resized = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.NEAREST)
    board = Image.new('RGBA', (1254, 1254));board.alpha_composite(resized, ((1254-resized.width)//2, (1254-resized.height)//2))
    board.save(root / f'{name}-reference.png');layouts[name].update(board=f'{name}-master.png', slot=None)
(root / 'layout.json').write_text(json.dumps(layouts, indent=2)+'\n')
family = Path('.local/hd-packs/power-plant-authored-body/owner-r3')
contract = json.loads((family / 'manifest.json').read_text())
variant = next(v for v in contract['variants'] if v['density'] == 4)
frame = variant['frames'][0]
print('Building style frame:', frame)
