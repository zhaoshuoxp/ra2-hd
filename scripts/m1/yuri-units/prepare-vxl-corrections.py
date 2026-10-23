"""Prepare a focused native-heading edit while preserving other selected views."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image
from authored_slots import isolated_cells

p = argparse.ArgumentParser()
p.add_argument('board')
p.add_argument('headings', nargs='+', type=int)
p.add_argument('--worklist', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
a = p.parse_args()
w = json.loads(a.worklist.read_text())
b = next(b for b in w['boards'] if b['id'] == a.board)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(Path(b['selectedArt'])) == b['selectedArtSha256']
assert sha(Path(b['board'])) == b['boardSha256']
assert set(a.headings).issubset({f['heading'] for f in b['frames']})
cells = isolated_cells(Image.open(b['selectedArt']), *b['selectedArtGrid'], 8)
order = b.get('authoredCellOrder', list(range(8)))
indices = [next(i for i, f in enumerate(b['frames']) if f['heading'] == h) for h in a.headings]
selected = [cells[order[i]][0] for i in indices]
columns, rows = (2, 2) if len(indices) <= 4 else (4, 2)
assert len(indices) <= columns * rows
width, height = max(c.width for c in selected) + 96, max(c.height for c in selected) + 96
hd = Image.new('RGBA', (width * columns, height * rows))
native = Image.new('RGB', (512 * columns, 512 * rows), (71, 87, 77))
source = Image.open(b['board'])
for cell, (i, detail) in enumerate(zip(indices, selected, strict=True)):
    hd.alpha_composite(detail, (cell % columns * width + (width - detail.width) // 2,
                               cell // columns * height + (height - detail.height) // 2))
    x, y, cw, ch = b['frames'][i]['cell']
    native.paste(source.crop((x, y, x + cw, y + ch)), (cell % columns * 512, cell // columns * 512))
a.output.mkdir(parents=True, exist_ok=False)
hd.save(a.output / 'selected-target.png')
native.save(a.output / 'native-guide.png')
manifest = {'boardId': a.board, 'worklist': str(a.worklist.resolve()), 'grid': [columns, rows],
            'headings': a.headings, 'previousMaster': b['selectedArt'],
            'previousMasterSha256': b['selectedArtSha256'], 'sourceBoardSha256': b['boardSha256'],
            'runtimeActivation': False}
(a.output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(manifest))
