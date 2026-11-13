"""Inspect actual Lunar ground exports and native-grid seams at both densities."""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('pack', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
manifest = json.loads((args.pack / 'manifest.json').read_text())
assert manifest['theater'] == 'LUNAR'
args.output.mkdir(parents=True, exist_ok=False)
records = []
for density in [2, 4]:
    fields = []
    for group in manifest['groups']:
        if not all(len(member['images']) == 1 and member['images'][0]['logical'] == [60, 30]
                   and member['images'][0]['height'] == 0 for member in group['members']):
            continue
        variant = next(row for row in group['variants'] if row['density'] == density)
        file = args.pack / variant['file']
        assert sha(file) == variant['sha256']
        atlas = Image.frombytes('RGBA', tuple(variant['size']), file.read_bytes())
        tiles = []
        for member, (x, y, w, h) in zip(group['members'], variant['rects']):
            assert set(member['sourceHashes']) == {'yr'}
            assert (w, h) == (60 * density, 30 * density)
            tiles.append(atlas.crop((x, y, x + w, y + h)))
        width, height = 480 * density, 240 * density
        field = Image.new('RGBA', (width, height))
        for depth in range(15):
            for y in range(8):
                x = depth - y
                if 0 <= x < 8:
                    tile = tiles[(x * 3 + y * 5) % len(tiles)]
                    field.alpha_composite(tile, ((x - y + 7) * 30 * density,
                                                (x + y) * 15 * density))
        fields.append((group['id'], field, tiles))
    assert fields
    width = max(max(field.width, sum(tile.width + 12 for tile in tiles)) for _, field, tiles in fields) + 32
    row_height = max(field.height + tiles[0].height + 110 for _, field, tiles in fields)
    board = Image.new('RGB', (width, row_height * len(fields)), (36, 43, 51))
    draw = ImageDraw.Draw(board)
    for index, (identity, field, tiles) in enumerate(fields):
        top = index * row_height
        draw.text((16, top + 12), f'{identity} / actual {density}X atlas / native grid', fill='white', font_size=24)
        x = 16
        for tile in tiles:
            board.paste(tile, (x, top + 50), tile); x += tile.width + 12
        board.paste(field, (16, top + tiles[0].height + 80), field)
    file = args.output / f'actual-{density}x.png'; board.save(file)
    records.append(dict(density=density, file=str(file.resolve()), sha256=sha(file), groups=len(fields)))
(args.output / 'index.json').write_text(json.dumps(dict(schema='yr-lunar-ground-density-review-v1',
    packSha256=sha(args.pack / 'manifest.json'), records=records,
    qualification='Actual independently exported pixels, native diamond grid; no display enlargement or texture edits.',
    runtimeAcceptance=False, userVisualAcceptance=False), indent=2) + '\n')
print(json.dumps(dict(status='ACTUAL_EXPORTS_PREPARED_FOR_VISUAL_INSPECTION', records=records)))
