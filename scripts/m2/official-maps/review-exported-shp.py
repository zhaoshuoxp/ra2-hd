"""Compare exported SHP frames with native pixels at the actual selected density."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from owner_review import compose_owner, frame_palette

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('pack', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--prepared', type=Path, required=True)
parser.add_argument('--contract', type=Path, required=True)
parser.add_argument('--members', nargs='+', required=True)
parser.add_argument('--density', type=int, choices=[2, 4], default=2)
parser.add_argument('--frames', nargs='+', type=int, default=[0, 1, 2, 3])
parser.add_argument('--owner-color', help='House RGB, for example 32,96,255')
args = parser.parse_args()
owner_rgb = list(map(int, args.owner_color.split(','))) if args.owner_color else None
assert owner_rgb is None or len(owner_rgb) == 3 and all(0 <= value <= 255 for value in owner_rgb)
sources = {s['member']: s for s in json.loads((args.prepared / 'source.json').read_text())['sources']}
contract = json.loads(args.contract.read_text())
pack_manifest = json.loads((args.pack / 'manifest.json').read_text())
args.output.mkdir(parents=True, exist_ok=False)
records = []
for name in args.members:
    entries = [entry for family in pack_manifest['families'].values()
               for entry in family['members'] if entry['member'] == name]
    assert entries and len({entry['path'] for entry in entries}) == 1
    manifest_path = args.pack / entries[0]['path']
    assert manifest_path.resolve().is_relative_to(args.pack.resolve())
    folder = manifest_path.parent
    manifest = json.loads(manifest_path.read_text())
    source = sources[name]
    variant = next(v for v in manifest['variants'] if v['density'] == args.density)
    frames = [f for f in args.frames if f < len(manifest['logical']['frames'])]
    density = args.density
    cw, ch = [v * density for v in source['canvas']]
    panel_width = max(cw, 240)
    canvas_left = (panel_width - cw) // 2
    row_height = ch + 58
    board = Image.new('RGB', (panel_width * 2, row_height * len(frames)), (28, 28, 28))
    draw = ImageDraw.Draw(board)
    pages = {}
    for row, number in enumerate(frames):
        frame = source['frames'][number]
        width, height = frame['size']
        native = Image.frombytes('RGBA', (width, height),
                                (args.prepared / 'native' / frame['file']).read_bytes())
        palette_colors = frame_palette(args.prepared, source, contract['sources'][name], number, owner_rgb)
        palette = contract['sources'][name].get('framePalettes', {}).get(str(number))
        if palette or owner_rgb is not None:
            indices = np.frombuffer((args.prepared / 'native' / frame['indexFile']).read_bytes(),
                                    np.uint8).reshape(height, width)
            rgba = np.array(native)
            rgba[..., :3] = palette_colors[indices]
            native = Image.fromarray(rgba)
        entry = next(f for f in variant['frames'] if f['nativeFrame'] == number)
        if entry['page'] not in pages:
            page = folder / str(density) / entry['page']
            pages[entry['page']] = tuple(Image.open(page / name).convert('RGBA') for name in ['base.png', 'data.png'])
        x, y, w, h = entry['contentRect']
        base, data = pages[entry['page']]
        hd = compose_owner(base.crop((x, y, x + w, y + h)), data.crop((x, y, x + w, y + h)), palette_colors)
        top = row * row_height + 56
        ox, oy = [v * density for v in frame['origin']]
        draw.text((8, top - 53), f'{name} / frame {number}', fill='white', font_size=22)
        draw.text((8, top - 27), f'Native {density}X', fill='white', font_size=22)
        draw.text((panel_width + 8, top - 27), f'HD {density}X', fill='white', font_size=22)
        native = native.resize((width * density, height * density), Image.Resampling.NEAREST)
        board.paste(native, (canvas_left + ox, top + oy), native)
        board.paste(hd, (panel_width + canvas_left + ox, top + oy), hd)
    output = args.output / f'{name}-{density}x.png'
    board.save(output)
    records.append(dict(member=name, frames=frames, density=density, ownerColor=owner_rgb, file=str(output.resolve()),
                        policy='Native nearest pixels and independently exported HD at actual density'))
(args.output / 'index.json').write_text(json.dumps(records, indent=2) + '\n')
print(json.dumps(dict(status='PREPARED_FOR_VISUAL_QA', records=records)))
