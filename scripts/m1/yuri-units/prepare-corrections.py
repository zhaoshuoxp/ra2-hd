"""Assemble source and selected-frame reference boards for focused generated corrections."""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'allied-units'))
from authored_slots import isolated_cells

p = argparse.ArgumentParser()
p.add_argument('identity')
p.add_argument('frames', nargs='+', type=int)
p.add_argument('--worklist', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
a = p.parse_args()
a.output.mkdir(parents=True, exist_ok=False)
work = json.loads(a.worklist.read_text())
member = work['families'][a.identity]['members'][0]
source = json.loads(Path(member['sourceFile']).read_text())
columns = min(4, len(a.frames))
rows = (len(a.frames) + columns - 1) // columns
boards = [Image.new('RGB', (columns * 512, rows * 512), (72, 88, 78)) for _ in range(2)]
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 28)
cache, records = {}, []
for position, fid in enumerate(a.frames):
    batch = next(b for b in member['batches'] if any(s['frame'] == fid for s in b['samples']))
    si = next(i for i, s in enumerate(batch['samples']) if s['frame'] == fid)
    sample = batch['samples'][si]
    master = Path(sample.get('selectedArt', batch['selectedArt']))
    grid = sample.get('selectedArtGrid', batch['grid'])
    occupied = sample.get('selectedArtOccupied', len(batch['samples']))
    index = sample.get('selectedArtIndex', si)
    key = (str(master), tuple(grid), occupied)
    if key not in cache:
        cache[key] = isolated_cells(Image.open(master), *grid, occupied)
    selected = cache[key][index][0]
    f = source['frames'][fid]
    indices = np.array(f['pixels'], dtype=np.uint8).reshape(f['height'], f['width'])
    rgba = np.zeros((*indices.shape, 4), dtype=np.uint8)
    rgba[..., :3] = np.array(source['palette'], dtype=np.uint8)[indices]
    rgba[..., 3] = (indices != 0).astype(np.uint8) * 255
    body = Image.fromarray(((indices != 0) & (indices != 12)).astype(np.uint8) * 255).getbbox()
    ground = indices == 12
    ground[body[1]:body[3], body[0]:body[2]] = False
    rgba[ground] = 0
    native = Image.fromarray(rgba).crop(body)
    x, y = position % columns * 512, position // columns * 512
    for board, sprite, resampling in zip(boards, [selected, native], [Image.Resampling.LANCZOS, Image.Resampling.NEAREST]):
        scale = min(380 / sprite.width, 380 / sprite.height)
        image = sprite.resize(tuple(round(v * scale) for v in sprite.size), resampling)
        board.paste(image, (x + (512 - image.width) // 2, y + 72 + (380 - image.height) // 2), image)
        ImageDraw.Draw(board).text((x + 16, y + 14), f'FRAME {fid:03d}', font=font, fill='white')
    records.append({'frame': fid, 'cellIndex': position, 'batch': batch['id'], 'sourceFrameSha256': f['sha256'],
                    'previousMaster': str(master), 'previousMasterSha256': hashlib.sha256(master.read_bytes()).hexdigest(),
                    'sequenceMembership': member['slots'][fid]['sequenceMembership']})
for board, name in zip(boards, ['selected-target.png', 'native-guide.png']):
    board.save(a.output / name)
(a.output / 'manifest.json').write_text(json.dumps({'identity': a.identity, 'worklist': str(a.worklist), 'grid': [columns, rows],
                                                  'frames': records, 'runtimeActivation': False}, indent=2) + '\n')
print('Prepared correction reference boards for', a.identity, a.frames)
