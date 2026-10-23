"""Share authored plates only across exact native frame payloads and palette semantics."""
import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--root', type=Path, default=Path('.artifacts/m2-3/authoring-shp-v3'))
parser.add_argument('--contract', type=Path, default=Path('.artifacts/m2-3/environment-contract-v1.json'))
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
work = json.loads((args.root / 'worklist.json').read_text())
contract = json.loads(args.contract.read_text())
batches = {batch['name'] + '-master.png': batch for batch in work['batches']}
overrides_file = args.root / 'slot-overrides.json'
overrides = json.loads(overrides_file.read_text()) if overrides_file.exists() else {}
groups = defaultdict(list)
for key, slot in work['slots'].items():
    declared, frame = contract['sources'][slot['member']], slot['nativeMetadata']
    palette = declared.get('framePalettes', {}).get(str(frame['slot']), declared)
    palette_hash = palette.get('sha256') if palette is not declared else declared['palette']['sha256']
    signature = (slot['kind'], frame['indexSha256'], tuple(frame['size']), tuple(slot['nativeBounds']),
                 palette_hash, palette['remapable'])
    groups[signature].append(key)
aliases = {}
for signature, keys in groups.items():
    if len(keys) < 2:
        continue
    canonical = next((key for key in keys if (args.root / overrides.get(key, {}).get(
        'board', work['slots'][key]['board'])).exists()), keys[0])
    source = {**work['slots'][canonical], **overrides.get(canonical, {})}
    batch = batches.get(source['board'])
    board_size = source.get('boardSize', batch['boardSize'] if batch else None)
    assert board_size
    occupied = source.get('occupied', len(batch['slots']) if batch else 1)
    for key in keys:
        if key == canonical:
            continue
        overrides[key] = {**overrides.get(key, {}), 'board': source['board'],
            'slotRect': source['slotRect'], 'referenceRect': source['referenceRect'],
            'boardSize': board_size, 'occupied': occupied, 'alphaCutoff': source.get('alphaCutoff', 240)}
        aliases[key] = {'canonicalSlot': canonical, 'master': str((args.root / source['board']).resolve()),
            'nativeIndexSha256': signature[1], 'trimSize': list(signature[2]),
            'nativeBounds': list(signature[3]), 'paletteSha256': signature[4], 'remapable': signature[5],
            'targetAnchor': work['slots'][key]['nativeMetadata']['origin'],
            'canonicalAnchor': work['slots'][canonical]['nativeMetadata']['origin']}
record = {'schema': 'm2-3-exact-frame-authored-plate-sharing-v1',
    'preparedSourceSha256': work['preparedSourceSha256'], 'worklistSha256': sha(args.root / 'worklist.json'),
    'policy': 'Identical native indices, size, material palette and owner semantics share one authored plate. Every target retains its native canvas, origin, mask, timing and separate shadow.',
    'aliases': aliases, 'artworkAcceptance': 'Candidate plates require export QA and final grouped review'}
with args.output.open('x') as stream:
    stream.write(json.dumps(record, indent=2) + '\n')
overrides_file.write_text(json.dumps(overrides, indent=2) + '\n')
print(json.dumps({'sharedSlots': len(aliases), 'uniqueAuthoredSlots': len(work['slots']) - len(aliases)}))
