"""Create registered retail references for a complete grass/dirt LAT trial."""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--root', type=Path, default=Path('.artifacts/m2-1/authoring-v11'))
args = parser.parse_args()
root = args.root
root.mkdir(parents=True, exist_ok=False)
source = json.loads(Path('.artifacts/m2-1/authoring-v7/export-input.json').read_text())
members = [m for g in source['groups'] if g['id'] == 'ground'
           for m in g['members'] if m['setIndex'] in [0, 41, 42]]
assert len(members) == 48 and all(len(m['images']) == 1 for m in members)
boards = [('materials', members[:16]), ('transitions-1', members[16:32]),
          ('transitions-2', members[32:48])]
layout = {}
for name, entries in boards:
    board = Image.new('RGBA', (1254, 1254))
    for slot, member in enumerate(entries):
        image = member['images'][0]
        raw = Path('.artifacts/m2-1/inventory/native') / f"{member['nativeName']}-0.rgba"
        native = Image.frombytes('RGBA', tuple(image['logical']), raw.read_bytes())
        assert native.size == (60, 30)
        native.save(root / f"{member['member']}-native.png")
        x = slot % 4 * 313 + 16
        y = slot // 4 * 313 + 86
        board.alpha_composite(native.resize((280, 140), Image.Resampling.NEAREST), (x, y))
        layout[member['member']] = dict(board=f'{name}-master.png', slot=slot,
                                       slotRect=[slot % 4 * 313, slot // 4 * 313, 313, 313],
                                       sourceRect=[x, y, 280, 140],
                                       nativeReferenceSha256=hashlib.sha256(raw.read_bytes()).hexdigest())
    board.save(root / f'{name}-reference.png')
(root / 'source.json').write_text(json.dumps(dict(members=members), indent=2) + '\n')
(root / 'layout.json').write_text(json.dumps(layout, indent=2) + '\n')
print(json.dumps(dict(root=str(root), members=len(members), boards=len(boards),
                     closure='Clear01 variants, Green01 variants, all Glat01-16 variants')))
