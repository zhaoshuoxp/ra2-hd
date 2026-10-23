"""Audit actual authored capacity and material scope before density exports."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from showcase_registration import capacity, register, sha

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('root', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
root = args.root
terrain = (root / 'layout.json').exists()
work = json.loads((root / ('layout.json' if terrain else 'worklist.json')).read_text())
slots = work if terrain else work['slots']
batches = json.loads((root / 'batches.json').read_text()) if terrain else work['batches']
boards = {batch['name'] + '-master.png': batch for batch in batches}
overrides = json.loads((root / 'slot-overrides.json').read_text()) if (root / 'slot-overrides.json').exists() else {}
masters, records, pending, failed = {}, [], [], []
for key, original_info in slots.items():
    info = {**original_info, **overrides.get(key, {})}
    file = root / info['board']
    if not file.exists():
        pending.append(key)
        continue
    try:
        if file not in masters:
            masters[file] = Image.open(file).convert('RGBA')
        batch = boards.get(info['board'])
        board_size = info.get('boardSize', batch['boardSize'] if batch else None)
        assert board_size, 'Missing original board geometry'
        occupied = info.get('occupied', len(batch['members' if terrain else 'slots']) if batch else 1)
        rect, plate = register(masters[file], info, board_size, isolated=occupied == 1)
        bounds = info['nativeAlphaBounds' if terrain else 'nativeBounds']
        available = capacity(rect, bounds)
        record = dict(key=key, master=str(file), sha256=sha(file), sourceRect=rect,
                      nativeBounds=bounds, availableDensity=available, boardSize=board_size)
        assert available >= 4, f'Insufficient independent 4X capacity: {available:.3f}'
        if terrain and boards[original_info['board']]['setIndex'] in (13, 14):
            water = (plate[..., 2].astype(float) - plate[..., 1] > 8) & (plate[..., 2] > 60)
            assert water.mean() < .02, f'Invented water in grass-only guide: {water.mean():.3f}'
        record['status'] = 'PASS_CAPACITY_AND_MATERIAL_SCOPE'
        records.append(record)
    except (AssertionError, ValueError) as error:
        failed.append(dict(key=key, master=str(file), reason=str(error)))
result = dict(schema='m2-2-authored-registration-audit-v1', source=str(root),
              status='PASS_COMPLETE' if not pending and not failed else 'INCOMPLETE',
              checked=len(records), pending=pending, failed=failed, records=records,
              boundary='Measured authoring capacity only; complete family export and runtime acceptance remain required.')
with args.output.open('x') as stream:
    stream.write(json.dumps(result, indent=2) + '\n')
print(json.dumps(dict(checked=len(records), pending=len(pending), failed=failed,
                     minimumCapacity=min((r['availableDensity'] for r in records), default=None))))
