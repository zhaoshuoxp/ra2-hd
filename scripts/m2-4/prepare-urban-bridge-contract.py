"""Declare complete Urban bridge or smudge families from native evidence."""
import argparse
import copy
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('prepared', type=Path)
parser.add_argument('inventory', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--smudges', action='store_true')
args = parser.parse_args()
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
base_file = Path('desktop/environment-urban-hd-contract.json')
baseline, native, inventory = read(base_file), read(args.prepared / 'source.json'), read(args.inventory)
assert baseline['theater'] == native['theater'] == 'URBAN'
assert native['inventorySha256'] == sha(args.inventory)
expected_members = ({f'{stem}{i:02d}.urb' for stem in ['burnt', 'crater'] for i in range(1, 13)}
                    if args.smudges else {'bridge.urb', *[f'lobrdg{i:02d}.urb' for i in range(1, 27)]})
assert {row['member'] for row in native['sources']} == expected_members
contract = copy.deepcopy(baseline)
family_members = {'urban-bridge-high-concrete': ['bridge.urb'],
    'urban-bridge-low-wood': [f'lobrdg{i:02d}.urb' for i in range(1, 27)]}
if args.smudges:
    family_members = {'urban-' + name[:-4]: [name] for name in sorted(expected_members)}
bindings = []
for source in native['sources']:
    name = source['member']
    assert name not in contract['sources'] and source['format'] == 'shp'
    assert source['hasShadow'] is (not args.smudges)
    assert not source['remapable'] and source['totalFrames'] % 2 == 0
    if args.smudges:
        assert source['totalFrames'] == 2 and not source['frames'][0]['empty'] and source['frames'][1]['empty']
    assert sha(args.prepared / 'native' / source['nativeFile']) == source['sha256']
    assert sha(args.prepared / 'native' / (source['palette']['sha256'] + '.pal')) == source['palette']['sha256']
    count = source['totalFrames'] // (2 if source['hasShadow'] else 1)
    assert len(source['frames']) == source['totalFrames']
    for frame in source['frames']:
        assert sha(args.prepared / 'native' / frame['file']) == frame['rgbaSha256']
        assert sha(args.prepared / 'native' / frame['indexFile']) == frame['indexSha256']
    contract['sources'][name] = dict(sha256=source['sha256'], canvas=source['canvas'],
        totalFrames=source['totalFrames'], bodyFrames=count, palette=source['palette'],
        hasShadow=source['hasShadow'], remapable=False,
        framePalettes={str(slot): dict(**source['palette'], role='body', runtimeUsed=True, remapable=False)
                       for slot in range(count)})
for family, members in family_members.items():
    assert family not in contract['families']
    kind = 'smudge' if args.smudges else 'overlay'
    rows = [row for row in inventory['rows'] if row['theater'] == 'URBAN' and row['kind'] == kind
            and row.get('source', {}).get('member') in members]
    assert {row['source']['member'] for row in rows} == set(members)
    assert all(not row['dependencies'] for row in rows), 'Unexpected linked bridge source requires explicit closure'
    identities = sorted({row['id'] for row in rows})
    expected = ({members[0][:-4].upper()} if args.smudges else {'BRIDGE1', 'BRIDGE2'}
                if len(members) == 1 else {f'LOBRDG{i:02d}' for i in range(1, 27)})
    assert set(identities) == expected
    basis = dict(theater='URBAN', members={name: contract['sources'][name] for name in members}, identities=identities)
    contract['families'][family] = dict(members=members, identities=identities,
        editions=sorted({row['edition'] for row in rows}), kinds=[kind],
        familyHash=hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest())
    for row in rows:
        table = contract['identities'].setdefault(row['edition'], {})
        assert row['id'] not in table
        assert row['source']['sha256'] == contract['sources'][row['source']['member']]['sha256']
        table[row['id']] = family
        bindings.append(dict(edition=row['edition'], identity=row['id'], family=family,
            nativeMember=row['source']['member'], sourceSha256=row['source']['sha256']))
assert all(contract['sources'][key] == value for key, value in baseline['sources'].items())
assert all(contract['families'][key] == value for key, value in baseline['families'].items())
contract['preparedSourceSha256'] = sha(args.prepared / 'source.json')
contract['extensions'] = dict(milestone='M2.4', baselineContractSha256=sha(base_file),
    baselineSelectedPack=baseline['selectedPack'], inventorySha256=sha(args.inventory),
    nativeGuideSha256=contract['preparedSourceSha256'], newFamilies=sorted(family_members), bindings=bindings,
    state='SOURCE_CONTRACT_DECLARED_EXPORT_AND_RUNTIME_PENDING',
    policy='Original member ranges, geometry, source colors, indexed empty/duplicate slots and applicable native shadows retained.')
with args.output.open('x') as stream:
    stream.write(json.dumps(contract, indent=2) + '\n')
print(json.dumps(dict(families=len(family_members), members=len(native['sources']), bindings=len(bindings))))
