"""Assemble original geometry guides and accepted material references, not authored art."""
import hashlib
import json
from pathlib import Path
import sys
import numpy as np
from PIL import Image

base = Path(sys.argv[1]).resolve()
references = base / (sys.argv[2] if len(sys.argv) > 2 else 'original-reference-r1')
source = json.loads((references / 'report.json').read_text())
assert source['status'] in ['PASS_NATIVE_VLAD_LOADED_AND_EMPTY_REFERENCES', 'PASS_NATIVE_ORIGINAL_VXL_AUTHORING_REFERENCES']
folder = base / 'authoring'
folder.mkdir(exist_ok=True)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
boards = []
for unit in source['units']:
    for part in unit['views'][0]['partMetadata']:
        key = part['key']
        board = Image.new('RGBA', (2048, 1024))
        frames = []
        for index, view in enumerate(unit['views']):
            original = Image.open(references / view['layers'][key]).convert('RGBA')
            pixels = np.array(original)
            mask = np.max(np.abs(pixels[..., :3].astype(int) - [72, 88, 78]), axis=2) > 12
            ys, xs = np.nonzero(mask)
            assert len(xs)
            bounds = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
            pixels[..., 3] = mask.astype('uint8') * 255
            crop = Image.fromarray(pixels).crop(bounds)
            scale = min(440 / crop.width, 420 / crop.height)
            width, height = round(crop.width * scale), round(crop.height * scale)
            cx, cy = index % 4 * 512, index // 4 * 512
            x, y = cx + (512 - width) // 2, cy + (512 - height) // 2
            board.alpha_composite(crop.resize((width, height), Image.Resampling.NEAREST), (x, y))
            frames.append(dict(heading=view['heading'], cell=[cx, cy, 512, 512], guideBounds=[x, y, x + width, y + height],
                sourceBounds=bounds, pivot=view['pivot'], ratio=view['ratio'], source=view['layers'][key],
                part=next(item for item in view['partMetadata'] if item['key'] == key)))
        filename = folder / (key + '-eight-heading-guide.png')
        board.save(filename)
        boards.append(dict(id=unit['name'] + '-' + key, family=unit['name'], identity=unit['name'], part=key, sourceMember=part['source'],
            board=str(filename), boardSha256=sha(filename), frames=frames, status='ORIGINAL_GUIDE_ONLY'))
        if part['source'] == unit['source']['member']:
            guide = Image.new('RGBA', (3072, 1536))
            for column, index in enumerate([1, 3]):
                cell = board.crop((index * 512, 0, (index + 1) * 512, 512))
                cell = cell.crop(cell.getbbox())
                scale = min(1400 / cell.width, 1300 / cell.height)
                cell = cell.resize((round(cell.width * scale), round(cell.height * scale)), Image.Resampling.NEAREST)
                guide.alpha_composite(cell, (column * 1536 + (1536 - cell.width) // 2, (1536 - cell.height) // 2))
            guide.save(folder / (unit['name'].lower() + '-two-heading-sample-guide.png'))
(base / 'authoring/worklist.json').write_text(json.dumps(dict(references=str(references), boards=boards), indent=2) + '\n')
print(json.dumps([dict(id=board['id'], source=board['sourceMember'], headings=len(board['frames'])) for board in boards]))
