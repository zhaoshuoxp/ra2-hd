"""Register the approved decal batch with the complete native SHP exporter."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from showcase_registration import sha

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('authoring', type=Path)
parser.add_argument('prepared', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
args.output.mkdir(exist_ok=False)
input_work = json.loads((args.authoring / 'worklist.json').read_text())
native = {source['member']: source for source in json.loads((args.prepared / 'source.json').read_text())['sources']}
slots, members, batches = {}, [], []
for batch in input_work['batches']:
    master = Path(batch['master']).resolve()
    assert sha(master) == batch['masterSha256']
    records = []
    for member in batch['members']:
        name = member['member']
        source = native[name]
        assert source['sha256'] == member['sourceSha256']
        assert all(f['empty'] for f in source['frames'][1:])
        frame = source['frames'][0]
        index_file = args.prepared / 'native' / frame['indexFile']
        assert sha(index_file) == frame['indexSha256']
        index = np.frombuffer(index_file.read_bytes(), np.uint8).reshape(frame['size'][::-1])
        bounds = Image.fromarray(np.uint8((index != 0) & (index != 12)) * 255).getbbox()
        key = name + '-000'
        cell = member['cell']
        slots[key] = dict(member=name, nativeSlot=0, nativeBounds=list(bounds), kind='smudge',
            group='smudge', state='native-ground-decal', nativeMetadata=frame,
            sourceSha256=source['sha256'], board=str(master), boardSize=input_work['boardSize'],
            slotRect=[cell % 2 * 800, cell // 2 * 600, 800, 600], occupied=4)
        members.append(dict(member=name, sourceSha256=source['sha256'], palette=source['palette'],
            bodyCount=len(source['frames']), totalNativeSlots=len(source['frames']),
            slots=[dict(slot=0, key=key, status='AUTHORED_SLOT_READY')]
            + [dict(slot=f['slot'], status='EXACT_NATIVE_EMPTY') for f in source['frames'][1:]]))
        records.append(key)
    batches.append(dict(name=batch['name'], boardSize=input_work['boardSize'], slots=records))
work = dict(schema='m2-3-ground-decal-export-worklist-v1',
    preparedSourceSha256=sha(args.prepared / 'source.json'), approval=input_work['approval'],
    authoringWorklistSha256=sha(args.authoring / 'worklist.json'), slots=slots, members=members, batches=batches)
(args.output / 'worklist.json').write_text(json.dumps(work, indent=2) + '\n')
print(json.dumps(dict(members=len(members), slots=len(slots))))
