"""Assemble pinned native TMP guides with sufficient independent 4X capacity."""
import argparse
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path

from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('root', type=Path)
parser.add_argument('--prepared', type=Path, default=Path('.artifacts/m2-2/prepared-native-v2'))
parser.add_argument('--inventory', type=Path)
parser.add_argument('--board-size', type=int, nargs=2)
parser.add_argument('--reference-density', type=float, default=4.6)
parser.add_argument('--repair-selected', action='store_true')
args = parser.parse_args()
root = args.root
root.mkdir(exist_ok=False)
prepared = args.prepared
source = json.loads((prepared / 'source.json').read_text())
ledger = json.loads((args.inventory or Path('docs/m2-2-map-coverage.json')).read_text())
rows = {row['id']: row for row in ledger['rows'] if row['kind'] == 'tmp'
        and row['theater'] == source.get('theater', 'TEMPERATE')
        and (row['decision'] == 'MISSING_AUTHORED_FAMILY' or args.repair_selected)} if args.inventory else {
        row['id']: row for row in ledger['rows'] if row['edition'] == 'yr'
        and row['kind'] == 'tmp' and row['decision'] == 'MISSING_HD_TO_PRODUCE'
        and row['usage'].get('XMP03T4.map')}
layout, members = {}, []
assert not args.repair_selected or source.get('repairSelected'), 'Repair needs a source-pinned selected pack'
for native in source['sources']:
    if native['format'] != 'tmp':
        continue
    name = native['member']
    row = rows[name]
    parts = [dict(subTile=i['subTile'], rect=[i['origin'][0] + i['offset'][0],
             i['origin'][1] + i['offset'][1] - i['height'] * 15, *i['logical']])
             for i in native['images'] if i['nativeOffset'] > 0]
    left, top = min(p['rect'][0] for p in parts), min(p['rect'][1] for p in parts)
    width = max(p['rect'][0] + p['rect'][2] for p in parts) - left
    height = max(p['rect'][1] + p['rect'][3] for p in parts) - top
    assembly = Image.new('RGBA', (width, height))
    for part in sorted(parts, key=lambda p: p['rect'][1]):
        part['rect'][0] -= left
        part['rect'][1] -= top
        image = native['images'][part['subTile']]
        raw = (prepared / 'native' / image['file']).read_bytes()
        assert hashlib.sha256(raw).hexdigest() == image['rgbaSha256']
        assembly.alpha_composite(Image.frombytes('RGBA', tuple(image['logical']), raw), tuple(part['rect'][:2]))
    assembly.save(root / f'{name}-native.png')
    layout[name] = dict(bounds=[left, top, width, height], parts=parts,
                        nativeAlphaBounds=list(assembly.getbbox()))
    members.append(dict(member=name, setIndex=row['set'], setName=row['setName'], native=native))

buckets = defaultdict(list)
for member in members:
    name = member['member']
    a = layout[name]['nativeAlphaBounds']
    w, h = a[2] - a[0], a[3] - a[1]
    # The guide leaves margin for tool registration variation, rather than
    # relying on enlargement of a smaller generated sprite.
    board_width, board_height = args.board_size or [(1600 if w > 260 else 1254), 1254]
    if args.board_size and h > w:
        board_width, board_height = sorted(args.board_size)
    target_density = min(args.reference_density, (board_width - 48) / w, (board_height - 48) / h)
    assert target_density >= 4.4, (name, w, h, target_density)
    columns = max(c for c in range(1, 5) if (board_width // c - 48) / w >= target_density)
    rows_count = max(r for r in range(1, 5) if (board_height // r - 48) / h >= target_density)
    buckets[(member['setIndex'], board_width, board_height, columns, rows_count)].append(name)

batches = []
for (set_index, board_width, board_height, columns, rows_count), names in sorted(buckets.items()):
    for start in range(0, len(names), columns * rows_count):
        selected = names[start:start + columns * rows_count]
        batch_name = f'tmp-set{set_index:02d}-{board_width}-{columns}x{rows_count}-{start // (columns * rows_count) + 1:02d}'
        board = Image.new('RGBA', (board_width, board_height))
        actual_columns = min(columns, len(selected))
        actual_rows = math.ceil(len(selected) / actual_columns)
        slot_width, slot_height = board_width // actual_columns, board_height // actual_rows
        for slot, name in enumerate(selected):
            info = layout[name]
            image = Image.open(root / f'{name}-native.png').crop(info['nativeAlphaBounds'])
            capacity = min((slot_width - 48) / image.width, (slot_height - 48) / image.height)
            size = (round(image.width * capacity), round(image.height * capacity))
            x, y = slot % actual_columns * slot_width, slot // actual_columns * slot_height
            px, py = x + (slot_width - size[0]) // 2, y + (slot_height - size[1]) // 2
            board.alpha_composite(image.resize(size, Image.Resampling.NEAREST), (px, py))
            info.update(board=f'{batch_name}-master.png', slot=slot,
                        slotRect=[x, y, slot_width, slot_height], referenceRect=[px, py, *size],
                        referenceCapacity=capacity)
        board.save(root / f'{batch_name}-reference.png')
        batches.append(dict(name=batch_name, setIndex=set_index, setName=rows[selected[0]]['setName'],
                            boardSize=[board_width, board_height],
                            members=selected, columns=actual_columns, rows=actual_rows,
                            status='AWAITING_APPROVED_DIRECTION_PRODUCTION'))

assert sum(len(b['members']) for b in batches) == len(members)
if not args.inventory:
    assert len(members) == 177
(root / 'source.json').write_text(json.dumps(dict(schema='m2-2-tmp-authoring-v1',
    theater=source.get('theater', 'TEMPERATE'),
    preparedSourceSha256=hashlib.sha256((prepared / 'source.json').read_bytes()).hexdigest(),
    members=members), indent=2) + '\n')
(root / 'layout.json').write_text(json.dumps(layout, indent=2) + '\n')
(root / 'batches.json').write_text(json.dumps(batches, indent=2) + '\n')
print(json.dumps(dict(members=len(members), boards=len(batches),
    minimumCapacity=min(i['referenceCapacity'] for i in layout.values()),
    batches=[dict(name=b['name'], setName=b['setName'], members=len(b['members'])) for b in batches])))
