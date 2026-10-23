"""Declare the two source-pinned Snow wall families and all native connection states."""
import argparse
import copy
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('--base', type=Path, required=True)
parser.add_argument('--prepared', type=Path, required=True)
parser.add_argument('--inventory', type=Path, required=True)
args = parser.parse_args()
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
baseline, native, inventory = read(args.base), read(args.prepared / 'source.json'), read(args.inventory)
assert baseline['theater'] == native['theater'] == 'SNOW'
assert native['inventorySha256'] == sha(args.inventory)
assert {source['member'] for source in native['sources']} == {'cakrmw.shp', 'gasand.shp'}
contract = copy.deepcopy(baseline)
new, bindings = [], []
for source in native['sources']:
    name = source['member']
    assert name not in contract['sources'] and source['format'] == 'shp'
    assert source['hasShadow'] and not source['remapable'] and source['totalFrames'] == 96
    assert len(source['frames']) == 96 and not any(frame['empty'] for frame in source['frames'])
    assert source['nativeArt']['DamageLevels'] == '2'
    assert source['nativeRules']['Wall'].lower() == 'yes'
    assert sha(args.prepared / 'native' / source['nativeFile']) == source['sha256']
    assert sha(args.prepared / 'native' / (source['palette']['sha256'] + '.pal')) == source['palette']['sha256']
    for frame in source['frames']:
        assert sha(args.prepared / 'native' / frame['file']) == frame['rgbaSha256']
        assert sha(args.prepared / 'native' / frame['indexFile']) == frame['indexSha256']
    rows = [row for row in inventory['rows'] if row.get('theater') == 'SNOW'
            and row.get('source', {}).get('member') == name]
    assert rows and all(row['kind'] == 'overlay' and not row.get('dependencies') for row in rows)
    assert all(row['source']['sha256'] == source['sha256'] for row in rows)
    identities = sorted({row['id'] for row in rows})
    assert identities == [name.split('.')[0].upper()]
    contract['sources'][name] = dict(sha256=source['sha256'], canvas=source['canvas'],
        totalFrames=96, bodyFrames=48, palette=source['palette'], hasShadow=True, remapable=False)
    family = 'snow-' + name.split('.')[0]
    assert family not in contract['families']
    basis = dict(theater='SNOW', members={name: contract['sources'][name]}, identities=identities)
    contract['families'][family] = dict(members=[name], identities=identities, kinds=['overlay'],
        editions=sorted({row['edition'] for row in rows}),
        familyHash=hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest())
    for row in rows:
        table = contract['identities'].setdefault(row['edition'], {})
        assert row['id'] not in table
        table[row['id']] = family
        bindings.append(dict(edition=row['edition'], identity=row['id'], family=family,
                             nativeMember=name, sourceSha256=source['sha256']))
    new.append(family)
assert all(contract['sources'][key] == value for key, value in baseline['sources'].items())
assert all(contract['families'][key] == value for key, value in baseline['families'].items())
contract['preparedSourceSha256'] = sha(args.prepared / 'source.json')
contract['extensions'] = dict(milestone='M2.4', baselineContractSha256=sha(args.base),
    baselineSelectedPack=baseline['selectedPack'], inventorySha256=sha(args.inventory),
    nativeGuideSha256=contract['preparedSourceSha256'], newFamilies=sorted(new), bindings=bindings,
    state='SOURCE_CONTRACT_DECLARED_EXPORT_AND_RUNTIME_PENDING',
    policy='All 48 native connection and damage slots per wall, plus exact separate shadows; no map edits.')
with args.output.open('x') as stream:
    stream.write(json.dumps(contract, indent=2) + '\n')
print(json.dumps(dict(families=len(new), members=2, inheritedFamilies=len(baseline['families']))))
