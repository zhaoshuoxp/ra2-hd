"""Decode native rubble guides with the runtime's independent ISO palette."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--prepared', type=Path, default=Path('.artifacts/m2-2/prepared-native-v2'))
parser.add_argument('--authoring', type=Path, default=Path('.artifacts/m2-2/authoring-shp-v1'))
parser.add_argument('--output', type=Path, default=Path('.artifacts/m2-2/rubble-native-guides-v3'))
parser.add_argument('--palette', type=Path, help='Original theater ISO palette; input bytes are hash-pinned')
args = parser.parse_args()
prepared, authoring, output = args.prepared, args.authoring, args.output
output.mkdir(exist_ok=False)
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
work = json.loads((authoring / 'worklist.json').read_text())
sources = {row['member']: row for row in json.loads((prepared / 'source.json').read_text())['sources']}
palette_file = args.palette or prepared / 'native/isotem.pal'
palette = np.frombuffer(palette_file.read_bytes(), np.uint8).reshape(256, 3) * 4
records = []
for batch in work['batches']:
    rubble = [key for key in batch['slots'] if work['slots'][key]['state'] == 'rubble']
    if not rubble:
        continue
    board = Image.open(authoring / (batch['name'] + '-reference.png')).convert('RGBA')
    frames = []
    for key in rubble:
        slot = work['slots'][key]
        source = sources[slot['member']]
        used = source['nativeRules'].get('LeaveRubble', '').lower() in ['yes', 'true', '1']
        frame = source['frames'][slot['nativeSlot']]
        index_file = prepared / 'native' / frame.get('indexFile', f"{slot['member']}-{slot['nativeSlot']}.index")
        assert sha(index_file) == frame['indexSha256']
        indices = np.frombuffer(index_file.read_bytes(), np.uint8).reshape(frame['size'][1], frame['size'][0])
        rgba = np.zeros((*indices.shape, 4), np.uint8)
        rgba[..., :3] = palette[indices]
        rgba[..., 3] = np.uint8((indices != 0) & (indices != 12)) * 255
        rgba[..., :3][rgba[..., 3] == 0] = 0
        sprite = Image.fromarray(rgba).crop(slot['nativeBounds'])
        x, y, w, h = slot['referenceRect']
        board.paste(sprite.resize((w, h), Image.Resampling.NEAREST), (x, y))
        frames.append(dict(key=key, nativeIndexSha256=sha(index_file), palette=palette_file.name, runtimeUsed=used))
    target = output / (batch['name'] + '-reference.png')
    board.save(target)
    records.append(dict(name=batch['name'], file=str(target.resolve()), sha256=sha(target), frames=frames))
receipt = dict(schema='m2-2-rubble-native-guide-v1', preparedSourceSha256=sha(prepared / 'source.json'),
    palette=dict(member=palette_file.name, sha256=sha(palette_file)), boards=records,
    authority='Building.createRubbleObject uses isoPalette, flat geometry and native frame 3 without owner remapping',
    preserved='Immutable prepared indices, guides, metadata and earlier source receipts remain unchanged')
(output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(dict(boards=len(records), rubbleSlots=sum(len(row['frames']) for row in records))))
