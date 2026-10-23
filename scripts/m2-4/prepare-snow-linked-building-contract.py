"""Declare complete Snow civilian families from exact root and dependency rows."""
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
parser.add_argument('--roots', nargs='+', required=True)
args = parser.parse_args()
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
baseline, native, inventory = read(args.base), read(args.prepared / 'source.json'), read(args.inventory)
assert baseline['theater'] == native['theater'] == 'SNOW'
assert native['inventorySha256'] == sha(args.inventory)
assert len(args.roots) == len(set(args.roots))
sources = {source['member']: source for source in native['sources']}
roots = {identity: [row for row in inventory['rows'] if row.get('theater') == 'SNOW'
                   and row['kind'] == 'building' and row['id'] == identity] for identity in args.roots}
groups = {}
for identity, rows in roots.items():
    assert rows, (identity, 'Missing official root')
    resolved = [{row['source']['member']} | {item['source']['member'] for item in row.get('dependencies', [])}
                for row in rows]
    assert all(members == resolved[0] for members in resolved), (identity, 'Edition dependency mismatch')
    groups[identity] = resolved[0]
    for row in rows:
        for item in [row, *row.get('dependencies', [])]:
            assert item['source']['member'] in sources, (identity, 'Missing complete dependency member',
                                                        item['source']['member'])
            source = sources[item['source']['member']]
            assert item['source']['sha256'] == source['sha256']
            assert item['palette']['sha256'] == source['palette']['sha256']
assert set(sources) == set.union(*groups.values()), 'Missing or unrelated prepared member'
assert sum(map(len, groups.values())) == len(sources), 'Shared members require an explicit reviewed family policy'
contract = copy.deepcopy(baseline)
for name, source in sources.items():
    assert name not in contract['sources'] and source['format'] == 'shp' and name.endswith('.shp')
    assert source['bindings'] and all(binding['kind'] == 'building' for binding in source['bindings'])
    assert sha(args.prepared / 'native' / source['nativeFile']) == source['sha256']
    assert sha(args.prepared / 'native' / (source['palette']['sha256'] + '.pal')) == source['palette']['sha256']
    count = source['totalFrames']
    assert count == len(source['frames']) and (not source['hasShadow'] or count % 2 == 0)
    for frame in source['frames']:
        assert sha(args.prepared / 'native' / frame['file']) == frame['rgbaSha256']
        assert sha(args.prepared / 'native' / frame['indexFile']) == frame['indexSha256']
    body = count // 2 if source['hasShadow'] else count
    declaration = dict(sha256=source['sha256'], canvas=source['canvas'], totalFrames=count,
                       bodyFrames=body, palette=source['palette'], hasShadow=source['hasShadow'],
                       remapable=source['remapable'])
    if any(binding['role'] == 'body' for binding in source['bindings']):
        assert all(binding['role'] == 'body' for binding in source['bindings'])
        assert source['hasShadow'] and body in (2, 3, 4)
        if body == 4:
            palette = next(row['palette'] for row in inventory['rows'] if row.get('theater') == 'SNOW'
                           and row.get('palette', {}).get('member') == 'isosno.pal')
            assert sha(args.prepared / 'native' / (palette['sha256'] + '.pal')) == palette['sha256']
            declaration['framePalettes'] = {'3': dict(member=palette['member'], archive=palette['archive'],
                sha256=palette['sha256'], role='rubble', remapable=False,
                runtimeUsed=str(source['nativeRules'].get('LeaveRubble', '')).lower() in ('yes', 'true', '1'))}
    else:
        assert all(binding['role'] == 'ACTIVE' for binding in source['bindings'])
        for binding in source['bindings']:
            art = binding['nativeArt']
            loop_start = int(art['LoopStart'])
            loop_end = max(loop_start, int(art['LoopEnd']) - 1)
            assert 0 <= loop_start <= loop_end < body
            assert int(art['Rate']) > 0 and int(art['LoopCount']) == -1
    contract['sources'][name] = declaration
new, bindings = [], []
for identity, members in groups.items():
    rows, family = roots[identity], 'snow-' + identity.lower().replace('_', '-')
    assert family not in contract['families']
    basis = dict(theater='SNOW', members={name: contract['sources'][name] for name in sorted(members)},
                 identities=[identity])
    contract['families'][family] = dict(members=sorted(members), identities=[identity], kinds=['building'],
        editions=sorted({row['edition'] for row in rows}),
        familyHash=hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest())
    for row in rows:
        edition = contract['identities'].setdefault(row['edition'], {})
        assert identity not in edition
        edition[identity] = family
        bindings.append(dict(edition=row['edition'], identity=identity, family=family,
                             nativeMember=row['source']['member'], sourceSha256=row['source']['sha256']))
    new.append(family)
assert all(contract['sources'][key] == value for key, value in baseline['sources'].items())
assert all(contract['families'][key] == value for key, value in baseline['families'].items())
contract['preparedSourceSha256'] = sha(args.prepared / 'source.json')
contract['extensions'] = dict(milestone='M2.4', baselineContractSha256=sha(args.base),
    baselineSelectedPack=baseline['selectedPack'], inventorySha256=sha(args.inventory),
    nativeGuideSha256=contract['preparedSourceSha256'], newFamilies=sorted(new), bindings=bindings,
    state='SOURCE_CONTRACT_DECLARED_EXPORT_AND_RUNTIME_PENDING',
    policy='Exact root/dependency closure; native states, empty slots, shadows and animation timings retained.')
with args.output.open('x') as stream:
    stream.write(json.dumps(contract, indent=2) + '\n')
print(json.dumps(dict(families=len(new), members=len(sources), inheritedFamilies=len(baseline['families']))))
