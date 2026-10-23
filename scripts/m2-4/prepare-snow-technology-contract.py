"""Declare complete original Snow technology families and their linked members."""
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
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
baseline, native, inventory = read(args.base), read(args.prepared / 'source.json'), read(args.inventory)
assert baseline['theater'] == native['theater'] == 'SNOW'
assert native['inventorySha256'] == sha(args.inventory)
groups = {'CAOILD': {'caoild.shp', 'caoild_a.shp', 'caoild_f.shp'},
          'CAHOSP': {'cahosp.shp', 'cahosp_a.shp', 'cahosp_f.shp'},
          'CAAIRP': {'caairp.shp', 'caairp_a.shp', 'caairp_f.shp'},
          'CAOUTP': {'caoutp.shp', 'caoutp_a.shp', 'caoutp_b.shp', 'caoutp_c.shp',
                     'caoutp_d.shp', 'caoutp_f.shp', 'caoutpbb.shp'}}
sources = {s['member']: s for s in native['sources']}
assert set(sources) == set.union(*groups.values())
contract = copy.deepcopy(baseline)
for name, source in sources.items():
    assert name not in contract['sources'] and source['format'] == 'shp'
    assert sha(args.prepared / 'native' / source['nativeFile']) == source['sha256']
    assert sha(args.prepared / 'native' / (source['palette']['sha256'] + '.pal')) == source['palette']['sha256']
    count = source['totalFrames']
    assert count == len(source['frames']) and (not source['hasShadow'] or count % 2 == 0)
    for frame in source['frames']:
        assert sha(args.prepared / 'native' / frame['file']) == frame['rgbaSha256']
        assert sha(args.prepared / 'native' / frame['indexFile']) == frame['indexSha256']
    contract['sources'][name] = dict(sha256=source['sha256'], canvas=source['canvas'],
        totalFrames=count, bodyFrames=count // 2 if source['hasShadow'] else count,
        palette=source['palette'], hasShadow=source['hasShadow'], remapable=source['remapable'])
    if any(b['role'] == 'body' for b in source['bindings']):
        assert source['hasShadow'] and count == 8
        assert str(source['nativeRules'].get('LeaveRubble', '')).lower() == 'yes'
        palette = next(r['palette'] for r in inventory['rows']
                       if r.get('theater') == 'SNOW' and r.get('palette', {}).get('member') == 'isosno.pal')
        assert sha(args.prepared / 'native' / (palette['sha256'] + '.pal')) == palette['sha256']
        contract['sources'][name]['framePalettes'] = {'3': dict(member=palette['member'],
            archive=palette['archive'], sha256=palette['sha256'], remapable=False,
            role='rubble', runtimeUsed=True)}
bindings, new = [], []
for identity, members in groups.items():
    rows = [r for r in inventory['rows'] if r.get('theater') == 'SNOW'
            and r['kind'] == 'building' and r['id'] in ({'CAHOSP', 'CATHOSP'} if identity == 'CAHOSP' else {identity})]
    assert rows
    for row in rows:
        resolved = {row['source']['member']} | {d['source']['member'] for d in row['dependencies']}
        assert resolved == members, (identity, row['edition'], resolved)
        for declaration in [row, *row['dependencies']]:
            source = sources[declaration['source']['member']]
            assert declaration['source']['sha256'] == source['sha256']
            assert declaration['palette']['sha256'] == source['palette']['sha256']
    identities = sorted({r['id'] for r in rows})
    family = 'snow-' + identity.lower()
    basis = dict(theater='SNOW', members={n: contract['sources'][n] for n in sorted(members)}, identities=identities)
    family_hash = hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    assert family not in contract['families']
    contract['families'][family] = dict(members=sorted(members), identities=identities,
        editions=sorted({r['edition'] for r in rows}), kinds=['building'], familyHash=family_hash)
    for row in rows:
        edition = contract['identities'].setdefault(row['edition'], {})
        assert row['id'] not in edition
        edition[row['id']] = family
        bindings.append(dict(edition=row['edition'], identity=row['id'], family=family,
            nativeMember=row['source']['member'], sourceSha256=row['source']['sha256']))
    new.append(family)
assert all(contract['sources'][k] == v for k, v in baseline['sources'].items())
assert all(contract['families'][k] == v for k, v in baseline['families'].items())
contract['preparedSourceSha256'] = sha(args.prepared / 'source.json')
contract['extensions'] = dict(milestone='M2.4', baselineContractSha256=sha(args.base),
    baselineSelectedPack=baseline['selectedPack'], inventorySha256=sha(args.inventory),
    nativeGuideSha256=contract['preparedSourceSha256'], newFamilies=sorted(new), bindings=bindings,
    state='SOURCE_CONTRACT_DECLARED_EXPORT_AND_RUNTIME_PENDING',
    policy='Atomic original dependency closure; native rules, state roles, empty slots, shadows and timings retained.')
with args.output.open('x') as stream:
    stream.write(json.dumps(contract, indent=2) + '\n')
print(json.dumps(dict(families=len(new), members=len(sources), inheritedFamilies=len(baseline['families']))))
