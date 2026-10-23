"""Declare exact Snow object families while preserving accepted contracts."""
import argparse
import copy
import hashlib
import json
from pathlib import Path


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('--base', type=Path, required=True)
parser.add_argument('--prepared', type=Path, required=True)
parser.add_argument('--inventory', type=Path, required=True)
parser.add_argument('--kind', choices=['terrain', 'smudge', 'overlay', 'building'], default='terrain')
parser.add_argument('--theater', choices=['SNOW', 'URBAN', 'NEWURBAN', 'DESERT'], default='SNOW')
parser.add_argument('--source-scope', type=Path, help='Approved source-specific library-palette scope')
args = parser.parse_args()
baseline = json.loads(args.base.read_text())
native_path = args.prepared / 'source.json'
native = json.loads(native_path.read_text())
inventory = json.loads(args.inventory.read_text())
scope = json.loads(args.source_scope.read_text()) if args.source_scope else None
if scope:
    assert args.kind == 'building' and args.theater == 'SNOW'
    assert set(scope) == {'officialMapSha256s', 'visualAdaptationStatus'}
    assert scope['officialMapSha256s'] == ['a4f07f9b927148f871136237e48253cadff9ff631602cb79de46e86e1100c574']
    assert scope['visualAdaptationStatus'] == 'APPLIED_SOURCE_PINNED_ORIGINAL_LIBRARY_PALETTE'
    assert {source['member'] for source in native['sources']} == {
        f'cacity{number:02d}.shp' for number in range(1, 5)}
assert baseline['theater'] == native['theater'] == args.theater
assert native['inventorySha256'] == sha(args.inventory)
contract = copy.deepcopy(baseline)
new_families, bindings = [], []
for source in native['sources']:
    name = source['member']
    suffix = {'SNOW': '.sno', 'URBAN': '.urb', 'NEWURBAN': '.ubn', 'DESERT': '.des'}[args.theater]
    assert source['format'] == 'shp' and name.endswith('.shp' if args.kind == 'building' else suffix)
    assert name not in contract['sources'] and source['bindings']
    assert sha(args.prepared / 'native' / source['nativeFile']) == source['sha256']
    palette = source['palette']
    if scope:
        assert palette['member'] == 'libsno.pal'
        assert palette['sha256'] == '79e668c9bd08bc5eed811df19de2af418cf8b434b97abf1fe2d65809321507e0'
        source_maps = {map_id for binding in source['bindings'] for map_id in binding['mapIds']}
        for map_id in source_maps:
            actual, = [row for row in inventory['maps'] if row['mapId'] == map_id]
            assert actual['source']['sha256'] in scope['officialMapSha256s']
            assert actual['officialVisualAdaptation']['status'] == scope['visualAdaptationStatus']
    assert sha(args.prepared / 'native' / (palette['sha256'] + '.pal')) == palette['sha256']
    rows = [row for row in inventory['rows'] if row['theater'] == args.theater
            and row.get('source', {}).get('member') == name]
    assert rows and all(row['kind'] == args.kind and not row.get('dependencies') for row in rows)
    assert all(row['source']['sha256'] == source['sha256'] for row in rows)
    total = len(source['frames'])
    assert total == source['totalFrames'] and (not source['hasShadow'] or total % 2 == 0)
    if args.kind == 'smudge':
        assert not source['hasShadow'] and not source['remapable']
        assert total == 2 and not source['frames'][0]['empty'] and source['frames'][1]['empty']
    if args.kind == 'overlay':
        assert name.startswith(('srock', 'trock')) or name in ('crate' + suffix, 'wcrate' + suffix), \
            'This single-member overlay path is limited to audited static rocks and crates'
        assert source['hasShadow'] and not source['remapable'] and total == 2
        assert all(not frame['empty'] for frame in source['frames'])
    contract['sources'][name] = dict(sha256=source['sha256'], canvas=source['canvas'],
        totalFrames=total, bodyFrames=total // 2 if source['hasShadow'] else total,
        palette=palette, hasShadow=source['hasShadow'], remapable=source['remapable'])
    if args.kind == 'building':
        assert all(binding['kind'] == 'building' and binding['role'] == 'body' for binding in source['bindings'])
        assert source['hasShadow'] and contract['sources'][name]['bodyFrames'] in (2, 3, 4), \
            'This path admits only complete audited civilian bodies without related dependencies'
        if contract['sources'][name]['bodyFrames'] == 4:
            iso = next(row['palette'] for row in inventory['rows']
                       if row.get('theater') == args.theater and row.get('palette', {}).get('member') ==
                       {'SNOW': 'isosno.pal', 'URBAN': 'isourb.pal', 'NEWURBAN': 'isoubn.pal', 'DESERT': 'isodes.pal'}[args.theater])
            assert sha(args.prepared / 'native' / (iso['sha256'] + '.pal')) == iso['sha256']
            contract['sources'][name]['framePalettes'] = {'3': dict(member=iso['member'], archive=iso['archive'],
                sha256=iso['sha256'], remapable=False, role='rubble',
                runtimeUsed=str(source['nativeRules'].get('LeaveRubble', '')).lower() in ['yes', 'true', '1'])}
    if args.kind == 'overlay':
        contract['sources'][name]['framePalettes'] = {
            '0': dict(**palette, role='body', runtimeUsed=True, remapable=False)}
    identities = sorted({row['id'] for row in rows})
    family = args.theater.lower() + '-' + name.split('.')[0].replace('_', '-')
    assert family not in contract['families']
    hash_input = dict(theater=args.theater, members={name: contract['sources'][name]}, identities=identities)
    if scope:
        hash_input['sourceScope'] = scope
    family_hash = hashlib.sha256(json.dumps(hash_input, sort_keys=True,
                                           separators=(',', ':')).encode()).hexdigest()
    contract['families'][family] = dict(members=[name], identities=identities,
        editions=sorted({row['edition'] for row in rows}), kinds=[args.kind], familyHash=family_hash)
    if scope:
        contract['families'][family]['sourceScope'] = scope
    for row in rows:
        edition = contract['identities'].setdefault(row['edition'], {})
        assert row['id'] not in edition
        edition[row['id']] = family
        bindings.append(dict(edition=row['edition'], identity=row['id'], nativeMember=name,
                             sourceSha256=source['sha256'], family=family))
    new_families.append(family)
assert all(contract['sources'][key] == value for key, value in baseline['sources'].items())
assert all(contract['families'][key] == value for key, value in baseline['families'].items())
contract['preparedSourceSha256'] = sha(native_path)
contract['extensions'] = dict(milestone='M2.4', baselineContractSha256=sha(args.base),
    baselineSelectedPack=baseline['selectedPack'], inventorySha256=sha(args.inventory),
    nativeGuideSha256=sha(native_path), newFamilies=sorted(new_families), bindings=bindings,
    state='SOURCE_CONTRACT_DECLARED_EXPORT_AND_RUNTIME_PENDING',
    policy='Original sources, identities, shadows and native rules are retained; no prepared cache is relabeled.')
with args.output.open('x') as stream:
    stream.write(json.dumps(contract, indent=2) + '\n')
print(json.dumps(dict(newSources=len(new_families), newFamilies=len(new_families),
                      inheritedFamilies=len(baseline['families']), exactBindings=len(bindings))))
