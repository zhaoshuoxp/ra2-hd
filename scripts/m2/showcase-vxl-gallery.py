"""Prepare bearing comparisons from native captures and independent VXL exports."""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

base = Path('.artifacts/m2-2')
output = base / 'complete-vxl-gallery-v1'
output.mkdir(exist_ok=False)
work = json.loads((base / 'selected-vxl-worklist-v1.json').read_text())
rows = []
for board in work['boards']:
    identity, part = board['identity'], board['part']
    images = {density: Image.new('RGB', (4 * 180 * density, 2 * 125 * density), '#28302c') for density in [1, 2, 4]}
    for index, frame in enumerate(board['frames']):
        heading = frame['heading']
        original = Image.open(Path(work['references']) / frame['source']).convert('RGB')
        data = np.asarray(original).astype(int)
        mask = np.max(np.abs(data - [72, 88, 78]), axis=2) > 12
        native = Image.fromarray(np.dstack([np.asarray(original), np.uint8(mask) * 255])).crop(frame['sourceBounds'])
        ratio = frame['ratio']
        native = native.resize(tuple(max(1, round(value / ratio)) for value in native.size), Image.Resampling.NEAREST)
        sprites = {1: native}
        for density in [2, 4]:
            sprites[density] = Image.open(base / 'vxl-export-v1' / f'{identity}-{density}x' / f'{identity}-{part}-{heading}.png').convert('RGBA')
        for density, image in images.items():
            sprite = sprites[density]
            x, y = index % 4 * 180 * density, index // 4 * 125 * density
            ImageDraw.Draw(image).text((x + 10 * density, y + 8 * density), f'{identity} / {heading} degrees', fill='white', font_size=16 * density)
            image.paste(sprite, (x + (180 * density - sprite.width) // 2,
                                y + 32 * density + (90 * density - sprite.height) // 2), sprite)
    row = dict(name=identity, logical=[720, 250], members=[board['sourceMember']], samples=8, images={})
    for density, image in images.items():
        file = output / f'{identity}-{density}x.png'
        image.save(file)
        row['images'][str(density)] = dict(file=str(file.resolve()), sha256=hashlib.sha256(file.read_bytes()).hexdigest())
    rows.append(row)
(output / 'gallery.json').write_text(json.dumps(dict(families=rows,
    boundary='Native capture resampled to its recorded logical ratio; authored 2X/4X pixels remain independent. TRUCKA uses the accepted DTRUCK pair.'), indent=2) + '\n')
print(json.dumps(dict(identities=len(rows), bearings=len(rows) * 8)))
