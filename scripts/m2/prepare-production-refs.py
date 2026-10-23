"""Assemble authoritative native references for the authorized terrain closure."""
import argparse
import json
from pathlib import Path

from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('root', type=Path)
args = parser.parse_args()
root = args.root
assert not (root / 'layout.json').exists()
source = json.loads((root / 'source.json').read_text())
members = {m['member']: m for g in source['groups'] for m in g['members'] if not m['accepted']}
layout = {}
for name, member in members.items():
    parts = [dict(subTile=i['subTile'], rect=[i['origin'][0] + i['offset'][0],
             i['origin'][1] + i['offset'][1] - i['height'] * 15, *i['logical']])
             for i in member['images'] if member['nativeOffsets'][i['subTile']] > 0]
    left, top = min(p['rect'][0] for p in parts), min(p['rect'][1] for p in parts)
    width = max(p['rect'][0] + p['rect'][2] for p in parts) - left
    height = max(p['rect'][1] + p['rect'][3] for p in parts) - top
    native = Image.new('RGBA', (width, height))
    for p in sorted(parts, key=lambda p: p['rect'][1]):
        p['rect'][0] -= left
        p['rect'][1] -= top
        raw = Path('.artifacts/m2-1/inventory/native') / f"{member['nativeName']}-{p['subTile']}.rgba"
        native.alpha_composite(Image.frombytes('RGBA', tuple(p['rect'][2:]), raw.read_bytes()), tuple(p['rect'][:2]))
    native.save(root / f'{name}-native.png')
    layout[name] = dict(bounds=[left, top, width, height], parts=parts, nativeAlphaBounds=native.getbbox())

batches = []


def add_batches(prefix, names, columns, rows):
    size = columns * rows
    for start in range(0, len(names), size):
        selected = names[start:start + size]
        batches.append(dict(name=f'{prefix}-{start // size + 1}', members=selected,
                            columns=columns, rows=min(rows, (len(selected) + columns - 1) // columns)))


def names_for(set_index):
    return [name for name, m in members.items() if m['setIndex'] == set_index]


add_batches('rough-material', names_for(33), 4, 4)
add_batches('rough-transition', names_for(34), 4, 4)
add_batches('slope', names_for(9), 4, 4)
add_batches('fixup', names_for(43), 4, 4)
add_batches('cliff', names_for(10), 2, 2)
add_batches('road-main', names_for(20), 1, 2)
road_bits = names_for(40)
small_bits = [n for n in road_bits if layout[n]['nativeAlphaBounds'][2] - layout[n]['nativeAlphaBounds'][0] <= 60]
add_batches('road-bit', small_bits, 4, 4)
add_batches('road-connection', [name for name, m in members.items()
                               if m['setIndex'] in [36, 40, 47] and name not in small_bits], 2, 2)
for name in names_for(25):
    batches.append(dict(name=name.removesuffix('.tem'), members=[name], columns=1, rows=1))

assert sum(len(b['members']) for b in batches) == len(members) == 236
for batch in batches:
    board = Image.new('RGBA', (1254, 1254))
    slot_width, slot_height = 1254 // batch['columns'], 1254 // batch['rows']
    for slot, name in enumerate(batch['members']):
        info = layout[name]
        image = Image.open(root / f'{name}-native.png').crop(info['nativeAlphaBounds'])
        scale = min((slot_width - 32) / image.width, (slot_height - 32) / image.height)
        assert scale >= 4.3, (name, scale)
        size = (round(image.width * scale), round(image.height * scale))
        x, y = slot % batch['columns'] * slot_width, slot // batch['columns'] * slot_height
        px, py = x + (slot_width - size[0]) // 2, y + (slot_height - size[1]) // 2
        board.alpha_composite(image.resize(size, Image.Resampling.NEAREST), (px, py))
        info.update(board=f"{batch['name']}-master.png", slot=slot, slotRect=[x, y, slot_width, slot_height],
                    referenceRect=[px, py, *size], referenceCapacity=scale)
    board.save(root / f"{batch['name']}-reference.png")
(root / 'layout.json').write_text(json.dumps(layout, indent=2) + '\n')
(root / 'batches.json').write_text(json.dumps(batches, indent=2) + '\n')
print(json.dumps(dict(root=str(root), members=len(members), boards=len(batches),
                     minimumReferenceCapacity=min(i['referenceCapacity'] for i in layout.values()),
                     batches=[b['name'] for b in batches])))
