"""Prepare isolated native guides for rejected or undersized authored cells."""
import argparse
import json
from pathlib import Path

from PIL import Image
from showcase_registration import sha

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('root', type=Path)
parser.add_argument('source', type=Path)
parser.add_argument('keys', nargs='+')
args = parser.parse_args()
args.root.mkdir(exist_ok=False)
terrain = (args.source / 'layout.json').exists()
work = json.loads((args.source / ('layout.json' if terrain else 'worklist.json')).read_text())
slots = work if terrain else work['slots']
repairs = []
for key in args.keys:
    info = slots[key]
    native = Image.open(args.source / f'{key}-native.png').convert('RGBA')
    if terrain:
        native = native.crop(info['nativeAlphaBounds'])
    name = key.replace('.', '-') + '-repair1'
    size = [1254, 1254]
    scale = min(1158 / native.width, 1158 / native.height)
    enlarged = native.resize(tuple(round(n * scale) for n in native.size), Image.Resampling.NEAREST)
    reference = Image.new('RGBA', size)
    reference.alpha_composite(enlarged, ((1254 - enlarged.width) // 2, (1254 - enlarged.height) // 2))
    file = args.root / f'{name}-reference.png'
    reference.save(file)
    material = ('Exactly one flat thick yellow-olive grass tile. NO water, sand, shoreline, pavement, roads, rocks or flowers anywhere.'
                if terrain else 'Exactly this native tree species, leaf colors, crown shape, trunk and root contact. No invented foliage islands or extra trees.')
    prompt = ('Use case: precise native game sprite production. The first image is the exact native geometry guide and edit target. '
              'Redraw ONE subject only, matching its own identity, isometric perspective and outline. ' + material + ' '
              'High resolution fine realistic hand-painted details, not enlarged pixel art. Keep original native upper-left illumination and subdued contrast. '
              'Preserve subject extents at 90 percent or more of guide dimensions, fully inside the canvas. '
              'Transparent background. No labels, text, new shadows, glow, background haze or new obstacles. '
              'Additional references supply material quality only; never copy their other objects. Square output.')
    (args.root / f'{name}-prompt.txt').write_text(prompt + '\n')
    repairs.append(dict(key=key, name=name, source=str(args.source), reference=str(file),
                        referenceSha256=sha(file), rejection='Rejected material or insufficient actual 4X capacity',
                        override=dict(board=str((args.root / f'{name}-master.png').resolve()),
                                      boardSize=size, slotRect=[0, 0, *size])))
(args.root / 'repairs.json').write_text(json.dumps(repairs, indent=2) + '\n')
print(json.dumps(dict(repairs=[r['name'] for r in repairs])))
