"""Prepare complete native body-slot guides, preserving shadows and empty slots."""
import argparse
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('root', type=Path)
parser.add_argument('--prepared', type=Path, default=Path('.artifacts/m2-2/prepared-native-v2'))
parser.add_argument('--exclude-kinds', nargs='*', default=[])
parser.add_argument('--board-size', type=int, nargs=2)
parser.add_argument('--reference-density', type=float, default=4.6)
parser.add_argument('--max-slots', type=int, choices=[1, 4, 16], default=16)
args = parser.parse_args()
root = args.root
root.mkdir(exist_ok=False)
prepared = args.prepared
source = json.loads((prepared / 'source.json').read_text())
slots, buckets, members = {}, defaultdict(list), []
for member in source['sources']:
    if member['format'] != 'shp':
        continue
    name = member['member']
    count = len(member['frames']) // 2 if member.get('hasShadow') else len(member['frames'])
    kind = member['bindings'][0]['kind']
    if kind in args.exclude_kinds:
        continue
    group = ('bridge' if name.startswith(('lobrdb', 'lobrdg', 'bridge', 'woodbridge')) else
             'resource' if name.startswith(('tib', 'gem')) and kind == 'overlay' else kind)
    canonical, membership = {}, []
    for frame in member['frames'][:count]:
        slot = frame['slot']
        key = f"{name}-{slot:03d}"
        data = (prepared / 'native' / frame.get('indexFile', f'{name}-{slot}.index')).read_bytes()
        assert hashlib.sha256(data).hexdigest() == frame['indexSha256']
        identity = (tuple(frame['size']), frame['indexSha256'])
        if frame['empty']:
            membership.append(dict(slot=slot, status='EXACT_NATIVE_EMPTY'))
            continue
        if identity in canonical:
            membership.append(dict(slot=slot, status='EXACT_NATIVE_DUPLICATE', canonical=canonical[identity]))
            continue
        canonical[identity] = slot
        indices = np.frombuffer(data, dtype=np.uint8).reshape(frame['size'][1], frame['size'][0])
        body = (indices != 0) & (indices != 12)
        bounds = Image.fromarray(body.astype(np.uint8) * 255).getbbox()
        if not bounds:
            membership.append(dict(slot=slot, status='EXACT_NATIVE_CONTACT_ONLY'))
            continue
        rgba = np.array(Image.frombytes('RGBA', tuple(frame['size']),
                        (prepared / 'native' / frame['file']).read_bytes()), copy=True)
        rgba[..., 3] = body.astype(np.uint8) * 255
        sprite = Image.fromarray(rgba).crop(bounds)
        sprite.save(root / f'{key}-native.png')
        w, h = sprite.size
        board_width, board_height = args.board_size or [(1600 if w > 260 else 1254), 1254]
        if args.board_size and h > w:
            board_width, board_height = sorted(args.board_size)
        target_density = min(args.reference_density, (board_width - 48) / w, (board_height - 48) / h)
        assert target_density >= 4.5, (name, slot, w, h, target_density)
        columns = max(c for c in range(1, 5) if (board_width // c - 48) / w >= target_density)
        rows = max(r for r in range(1, 5) if (board_height // r - 48) / h >= target_density)
        columns = min(columns, math.isqrt(args.max_slots))
        rows = min(rows, args.max_slots // columns)
        bucket_group = group + '-' + name.replace('.', '-') if kind == 'infantry' else group
        buckets[(bucket_group, board_width, board_height, columns, rows)].append(key)
        state = ['normal', 'damaged', 'occupied', 'rubble'][slot] if kind == 'building' and member['bindings'][0]['role'] == 'body' and slot < 4 else 'native-phase'
        slots[key] = dict(member=name, nativeSlot=slot, nativeBounds=list(bounds), kind=kind,
                          group=group, state=state, nativeMetadata=frame, sourceSha256=member['sha256'])
        membership.append(dict(slot=slot, key=key, status='AWAITING_AUTHORED_SLOT'))
    members.append(dict(member=name, sourceSha256=member['sha256'], palette=member['palette'],
                        bodyCount=count, totalNativeSlots=len(member['frames']), slots=membership,
                        shadowPolicy='Exact native separate shadow slots; never generated body replacements'))

batches = []
for (group, width, height, columns, rows), keys in sorted(buckets.items()):
    for start in range(0, len(keys), columns * rows):
        selected = keys[start:start + columns * rows]
        name = f'shp-{group}-{width}-{columns}x{rows}-{start // (columns * rows) + 1:03d}'
        board = Image.new('RGBA', (width, height))
        actual_columns = min(columns, len(selected))
        actual_rows = math.ceil(len(selected) / actual_columns)
        cw, ch = width // actual_columns, height // actual_rows
        for position, key in enumerate(selected):
            sprite = Image.open(root / f'{key}-native.png')
            capacity = min((cw - 48) / sprite.width, (ch - 48) / sprite.height)
            size = tuple(round(n * capacity) for n in sprite.size)
            x, y = position % actual_columns * cw, position // actual_columns * ch
            px, py = x + (cw - size[0]) // 2, y + (ch - size[1]) // 2
            board.alpha_composite(sprite.resize(size, Image.Resampling.NEAREST), (px, py))
            slots[key].update(board=f'{name}-master.png', slotRect=[x, y, cw, ch],
                              referenceRect=[px, py, *size], referenceCapacity=capacity)
        board.save(root / f'{name}-reference.png')
        batches.append(dict(name=name, group=group, boardSize=[width, height],
                            columns=actual_columns, rows=actual_rows, slots=selected, status='NATIVE_GUIDES_ONLY'))

result = dict(schema='m2-2-shp-native-slot-worklist-v1',
              preparedSourceSha256=hashlib.sha256((prepared / 'source.json').read_bytes()).hexdigest(),
              members=members, slots=slots, batches=batches,
              runtimeAcceptance='NOT_PUBLISHED; SOURCE_GUIDES_ONLY')
(root / 'worklist.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(dict(members=len(members), authoredSlots=len(slots), boards=len(batches),
    groups={group: sum(b['group'] == group for b in batches) for group in sorted({b['group'] for b in batches})},
    bodySlots=sum(m['bodyCount'] for m in members), nativeEmptyOrDuplicate=sum(
        s['status'] != 'AWAITING_AUTHORED_SLOT' for m in members for s in m['slots']))))
