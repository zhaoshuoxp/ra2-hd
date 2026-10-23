"""Build technical comparison boards from immutable native and exported pixels."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

base = Path('.artifacts/m2-2')
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
args = parser.parse_args()
output = args.output
output.mkdir(exist_ok=False)
prepared = base / 'prepared-native-v2'
sources = {row['member']: row for row in json.loads((prepared / 'source.json').read_text())['sources']}
contract = json.loads(Path('desktop/environment-hd-contract.json').read_text())
pack_root = Path('.local/environment-packs') / contract['selectedPack']['revision']
pack = json.loads((pack_root / 'manifest.json').read_text())
records = []
for identity, family in sorted(pack['families'].items()):
    cells = []
    for member in family['members']:
        name = member['member']
        native = sources[name]
        manifest_path = pack_root / member['path']
        manifest = json.loads(manifest_path.read_text())
        frames = [frame for frame in manifest['logical']['frames'] if not frame['empty']]
        if len(frames) > 4:
            frames = [frames[index] for index in sorted({0, len(frames) // 3, 2 * len(frames) // 3, len(frames) - 1})]
        for frame in frames:
            slot = frame['nativeFrame']
            native_frame = native['frames'][slot]
            pixels = np.frombuffer((prepared / 'native' / native_frame['file']).read_bytes(), np.uint8)
            pixels = pixels.reshape(native_frame['size'][1], native_frame['size'][0], 4).copy()
            if str(slot) in contract['sources'][name].get('framePalettes', {}):
                palette = np.frombuffer((prepared / 'native/isotem.pal').read_bytes(), np.uint8).reshape(256, 3) * 4
                indices = np.frombuffer((prepared / 'native' / f'{name}-{slot}.index').read_bytes(), np.uint8).reshape(pixels.shape[:2])
                pixels[..., :3] = palette[indices]
                pixels[..., 3] = ((indices != 0) & (indices != 12)).astype(np.uint8) * 255
            images = {1: Image.fromarray(pixels)}
            for density in [2, 4]:
                variant = next(row for row in manifest['variants'] if row['density'] == density)
                entry = variant['frames'][slot]
                x, y, width, height = entry['contentRect']
                with Image.open(manifest_path.parent / str(density) / entry['page'] / 'base.png') as atlas:
                    images[density] = atlas.crop((x, y, x + width, y + height)).copy()
            cells.append(dict(label=f'{name} / native frame {slot}', images=images,
                              size=native_frame['size']))
    cell_width = max(240, max(cell['size'][0] for cell in cells) + 28)
    cell_height = max(100, max(cell['size'][1] for cell in cells) + 52)
    columns = min(4, len(cells))
    logical = [columns * cell_width, ((len(cells) + columns - 1) // columns) * cell_height]
    entry = dict(identity=identity, members=contract['families'][identity]['members'],
                 logical=logical, samples=len(cells), images={})
    for density in [1, 2, 4]:
        board = Image.new('RGB', tuple(value * density for value in logical), '#28302c')
        draw = ImageDraw.Draw(board)
        for index, cell in enumerate(cells):
            x, y = index % columns * cell_width * density, index // columns * cell_height * density
            draw.text((x + 8 * density, y + 6 * density), cell['label'], fill='white', font_size=14 * density)
            sprite = cell['images'][density]
            board.paste(sprite, (x + (cell_width * density - sprite.width) // 2,
                                y + 35 * density + (cell_height * density - 40 * density - sprite.height) // 2), sprite)
        file = output / f'{identity}-{density}x.png'
        board.save(file)
        entry['images'][str(density)] = dict(file=str(file.resolve()),
            sha256=hashlib.sha256(file.read_bytes()).hexdigest(), size=list(board.size))
    records.append(entry)
receipt = dict(schema='m2-2-export-gallery-v1', status='TECHNICAL_PREVIEW_USER_ACCEPTANCE_PENDING',
    packSha256=hashlib.sha256((pack_root / 'manifest.json').read_bytes()).hexdigest(), families=records,
    boundary='Native versus independent density export pixels at unchanged logical size. No composited scene is presented as gameplay.')
(output / 'gallery.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(dict(families=len(records), samples=sum(row['samples'] for row in records))))
