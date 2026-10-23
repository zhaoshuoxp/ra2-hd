"""Append exact gate or civilian sequence families without inferring civilian rubble."""
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
parser.add_argument('--kind', choices=['gate', 'infantry'], required=True)
args = parser.parse_args()
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
baseline, native, inventory = read(args.base), read(args.prepared / 'source.json'), read(args.inventory)
assert baseline['theater'] == native['theater'] == 'SNOW'
assert native['inventorySha256'] == sha(args.inventory)
expected = {'gagate_a.shp': 42} if args.kind == 'gate' else {
    'civsf.shp': 476, 'civsfm.shp': 478, 'civstm.shp': 472}
assert {s['member'] for s in native['sources']} == set(expected)
contract, new, bindings = copy.deepcopy(baseline), [], []
for source in native['sources']:
    name = source['member']
    assert name not in contract['sources'] and source['format'] == 'shp'
    assert source['hasShadow'] and source['remapable'] and source['totalFrames'] == expected[name]
    assert len(source['frames']) == expected[name]
    assert sha(args.prepared / 'native' / source['nativeFile']) == source['sha256']
    assert sha(args.prepared / 'native' / (source['palette']['sha256'] + '.pal')) == source['palette']['sha256']
    for frame in source['frames']:
        assert sha(args.prepared / 'native' / frame['file']) == frame['rgbaSha256']
        assert sha(args.prepared / 'native' / frame['indexFile']) == frame['indexSha256']
    body = source['totalFrames'] // 2
    if args.kind == 'gate':
        assert source['nativeRules']['Gate'].lower() == 'yes'
        assert source['nativeArt']['GateStages'] == '9'
        assert {b['role'] for b in source['bindings']} == {'body', 'BUILDUP', 'UNBUILD'}
        assert all(b['kind'] == 'building' for b in source['bindings'])
        assert all(source['frames'][i]['indexSha256'] == source['frames'][i + 10]['indexSha256']
                   for i in range(10))
        assert source['frames'][20]['indexSha256'] == source['frames'][0]['indexSha256']
    else:
        assert all(b['kind'] == 'infantry' and b['role'] == 'body' for b in source['bindings'])
        assert source['nativeArt']['Sequence'] == 'CivGunSequence'
        assert all(f['empty'] for f in source['frames'][body:]), 'Original empty shadow half must remain empty'
    rows = [row for row in inventory['rows'] if row.get('theater') == 'SNOW'
            and row.get('source', {}).get('member') == name]
    assert rows and all(row['source']['sha256'] == source['sha256'] for row in rows)
    members = {item['source']['member'] for row in rows for item in [row, *row.get('dependencies', [])]}
    assert members == {name}, 'Complete family must include every linked source'
    identities = sorted({row['id'] for row in rows})
    contract['sources'][name] = dict(sha256=source['sha256'], canvas=source['canvas'], totalFrames=source['totalFrames'],
        bodyFrames=body, palette=source['palette'], hasShadow=True, remapable=True)
    family = 'snow-' + name.split('.')[0].replace('_', '-')
    assert family not in contract['families']
    basis = dict(theater='SNOW', members={name: contract['sources'][name]}, identities=identities)
    contract['families'][family] = dict(members=[name], identities=identities,
        kinds=['building' if args.kind == 'gate' else 'infantry'], editions=sorted({row['edition'] for row in rows}),
        familyHash=hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest())
    for row in rows:
        table = contract['identities'].setdefault(row['edition'], {})
        assert row['id'] not in table
        table[row['id']] = family
        bindings.append(dict(edition=row['edition'], identity=row['id'], family=family,
                             nativeMember=name, sourceSha256=source['sha256']))
    new.append(family)
assert all(contract['families'][key] == value for key, value in baseline['families'].items())
assert all(contract['sources'][key] == value for key, value in baseline['sources'].items())
assert contract.get('vxl') == baseline.get('vxl')
contract['preparedSourceSha256'] = sha(args.prepared / 'source.json')
contract['extensions'] = dict(milestone='M2.4', baselineContractSha256=sha(args.base),
    baselineSelectedPack=baseline['selectedPack'], inventorySha256=sha(args.inventory),
    nativeGuideSha256=contract['preparedSourceSha256'], newFamilies=sorted(new), bindings=bindings,
    state='SOURCE_CONTRACT_DECLARED_EXPORT_AND_RUNTIME_PENDING',
    policy='Exact body, duplicate, empty shadow and linked source slots retained. Gate frames are opening phases, never inferred rubble.')
with args.output.open('x') as stream:
    stream.write(json.dumps(contract, indent=2) + '\n')
print(json.dumps(dict(families=len(new), members=len(expected), inheritedFamilies=len(baseline['families']))))
