"""Find byte-identical native frames that can reuse independently authored accepted pixels."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--prepared', type=Path, default=Path('.artifacts/m2-3/native-guides-v3'))
parser.add_argument('--contract', type=Path, default=Path('.artifacts/m2-3/environment-contract-v1.json'))
parser.add_argument('--donor-prepared', type=Path, required=True)
parser.add_argument('--donor-contract', type=Path, default=Path('desktop/environment-hd-contract.json'))
parser.add_argument('--donor-pack', type=Path, required=True)
parser.add_argument('--donor-hash', required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
assert sha(args.donor_pack / 'manifest.json') == args.donor_hash
current = json.loads((args.prepared / 'source.json').read_text())
donor = json.loads((args.donor_prepared / 'source.json').read_text())
contract, old_contract = json.loads(args.contract.read_text()), json.loads(args.donor_contract.read_text())
pack = json.loads((args.donor_pack / 'manifest.json').read_text())
donor_members = {m['member']: m for f in pack['families'].values() for m in f['members']}

def signature(source, frame, declared):
    palette = declared.get('framePalettes', {}).get(str(frame['slot']), declared)
    palette_hash = palette.get('sha256') if palette is not declared else declared['palette']['sha256']
    return (frame['indexSha256'], tuple(frame['size']), palette_hash, palette['remapable'])

available = {}
for source in donor['sources']:
    name = source['member']
    if source['format'] != 'shp' or name not in donor_members:
        continue
    member = donor_members[name]
    file = args.donor_pack / member['path']
    assert sha(file) == member['sha256']
    hd = json.loads(file.read_text())
    assert hd['source']['sha256'] == source['sha256'] == old_contract['sources'][name]['sha256']
    for frame in source['frames'][:old_contract['sources'][name]['bodyFrames']]:
        if frame['empty']:
            continue
        key = signature(source, frame, old_contract['sources'][name])
        available.setdefault(key, {
            'manifest': str(file.resolve()), 'manifestSha256': member['sha256'],
            'member': name, 'nativeFrame': frame['slot'], 'nativeSourceSha256': source['sha256'],
            'nativeIndexSha256': frame['indexSha256'], 'trimSize': frame['size'],
            'paletteSha256': key[2], 'remapable': key[3]})
reused = {}
for source in current['sources']:
    if source['format'] != 'shp':
        continue
    name = source['member']
    declared = contract['sources'][name]
    for frame in source['frames'][:declared['bodyFrames']]:
        if frame['empty']:
            continue
        match = available.get(signature(source, frame, declared))
        if match:
            reused[f'{name}-{frame["slot"]:03}'] = {**match, 'targetSourceSha256': source['sha256']}
record = {
    'schema': 'm2-3-exact-native-frame-reuse-v1', 'acceptedPackSha256': args.donor_hash,
    'preparedSourceSha256': sha(args.prepared / 'source.json'),
    'donorPrepared': {'file': str((args.donor_prepared / 'source.json').resolve()),
                     'sha256': sha(args.donor_prepared / 'source.json')},
    'policy': 'Reuse accepted 2X and 4X pixels separately only for exact index, trim size, palette and owner semantics. Retain each target native canvas and anchor.',
    'frames': reused, 'runtimeAcceptance': False}
with args.output.open('x') as stream:
    stream.write(json.dumps(record, indent=2) + '\n')
print(json.dumps({'reusedNativeFrames': len(reused), 'members': len({key.rsplit('-', 1)[0] for key in reused})}))
