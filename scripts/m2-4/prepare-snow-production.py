"""Reuse verified native guides for missing theater sources; default to Snow."""
import argparse
import hashlib
import json
import os
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('--inventory', type=Path, required=True)
parser.add_argument('--native', type=Path, required=True)
parser.add_argument('--theater', choices=['SNOW', 'URBAN', 'NEWURBAN', 'DESERT'], default='SNOW')
parser.add_argument('--sets', nargs='+', type=int)
parser.add_argument('--members', nargs='+', help='Explicit original member allowlist for object production')
parser.add_argument('--repair-selected', action='store_true', help='Verify an explicit selected terrain set allowlist for visual repair')
args = parser.parse_args()
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
inventory = json.loads(args.inventory.read_text())
original = json.loads((args.native / 'source.json').read_text())
assert original['theater'] == args.theater
assert not args.repair_selected or args.sets, 'Repair requires explicit native sets'
groups = [group for group in inventory['resourceGroups'] if group['theater'] == args.theater
          and ('MISSING_AUTHORED_FAMILY' in group['decisions'] or args.repair_selected)]
wanted = {(group['member'], group['sha256']) for group in groups if group.get('sha256')}
sources = [source for source in original['sources']
           if (source['member'], source['sha256']) in wanted
           and (not args.sets or source.get('setIndex') in args.sets)
           and (not args.members or source['member'] in args.members)]
assert sources and len({source['key'] for source in sources}) == len(sources)
if args.repair_selected:
    pointer = json.loads(Path(f'.local/terrain-{args.theater.lower()}-selection.json').read_text())
    pack_file = Path('.local/terrain-packs') / pointer['revision'] / 'manifest.json'
    assert sha(pack_file) == pointer['sha256']
    pack = json.loads(pack_file.read_text())
    selected = {member['member']: set(member['sourceHashes'].values())
                for group in pack['groups'] for member in group['members']}
    assert all(selected.get(source['member']) == {source['sha256']} for source in sources)
if args.members:
    assert len(set(args.members)) == len(args.members)
    assert {source['member'] for source in sources} == set(args.members), 'Member allowlist must resolve exactly'
verified = set()
for source in sources:
    files = [(source['nativeFile'], source['sha256'])]
    frames = source.get('images', source.get('frames', []))
    for frame in frames:
        if frame.get('file'):
            files.append((frame['file'], frame['rgbaSha256']))
        if frame.get('indexFile'):
            files.append((frame['indexFile'], frame['indexSha256']))
    for name, expected in files:
        file = args.native / 'native' / name
        assert sha(file) == expected, (name, 'Native reuse hash mismatch')
        verified.add(name)
args.output.mkdir(exist_ok=False)
os.symlink((args.native / 'native').resolve(), args.output / 'native', target_is_directory=True)
record = dict(schema='m2-4-derived-native-production-sources-v1', theater=args.theater,
              inventoryFile=str(args.inventory), inventorySha256=sha(args.inventory),
              reusedNativeSource=str(args.native / 'source.json'),
              reusedNativeSourceSha256=sha(args.native / 'source.json'),
              verifiedNativeFiles=len(verified), nativeSetAllowlist=args.sets,
              nativeMemberAllowlist=args.members,
              repairSelected=pointer if args.repair_selected else None,
              sources=sources, status='SOURCE_GUIDES_ONLY; ARTWORK_NOT_GENERATED')
with (args.output / 'source.json').open('x') as stream:
    stream.write(json.dumps(record, indent=2) + '\n')
print(json.dumps(dict(sources=len(sources), verifiedNativeFiles=len(verified))))
