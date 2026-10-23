"""Enlarge exact native pose crops for imagegen reference; no candidate artwork."""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

root = Path('.artifacts/yuri-units')
output = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'source-pose-references-v2'
output.mkdir(exist_ok=False)
for identity, slot in [('INIT', 3), ('INIT', 28), ('INIT', 229), ('INIT', 141), ('YURIPR', 3)]:
    member = 'init.shp' if identity == 'INIT' else 'yurix.shp'
    source = json.loads((root / 'source-v2' / f'{member}.json').read_text())
    frame = source['frames'][slot]
    indices = np.array(frame['pixels']).reshape(frame['height'], frame['width'])
    mask = Image.fromarray(((indices != 0) & (indices != 12)).astype('uint8') * 255)
    box = mask.getbbox()
    bounds = (box[0] + frame['x'], box[1] + frame['y'], box[2] + frame['x'], box[3] + frame['y'])
    original = Image.open(root / 'shp-references-v1' / f'{identity}-{slot}-original.png').convert('RGBA')
    crop = original.crop((max(0, bounds[0] - 3), max(0, bounds[1] - 3),
                          min(original.width, bounds[2] + 3), min(original.height, bounds[3] + 3)))
    crop = crop.resize((crop.width * 16, crop.height * 16), Image.Resampling.NEAREST)
    background = Image.new('RGBA', crop.size, (72, 88, 78, 255))
    background.alpha_composite(crop)
    background.save(output / f'{identity}-{slot}-nearest-reference.png')
print('Prepared five exact-frame source references; nearest sampling only.')
