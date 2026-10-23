"""Select complete Snow object families after native-mask and inherited-byte verification."""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from snow_bridge_scope import UNUSED_ENDS, verified_unused_ends
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_contours import register_contours


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def encode(value):
    return json.dumps(value, indent=2) + '\n'


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--assembly', type=Path, required=True)
parser.add_argument('--contract', type=Path, required=True)
parser.add_argument('--prepared', type=Path, required=True)
parser.add_argument('--loading', type=Path, required=True)
parser.add_argument('--prior-delta', type=Path, required=True)
parser.add_argument('--batch', type=int, required=True)
parser.add_argument('--checkpoint-version', type=int, default=1,
                    help='Unique receipt version; preserve earlier failed or superseded selections')
parser.add_argument('--kind', choices=['terrain', 'smudge', 'overlay', 'wall', 'bridge', 'building', 'technology',
                                     'gate', 'infantry'], default='terrain')
parser.add_argument('--source-usage', type=Path, help='Pinned proof for unused original bridge end sources')
parser.add_argument('--selected-contract', type=Path,
                    help='Exclusive versioned contract snapshot for this batch')
parser.add_argument('--linked-building-members', nargs='+', default=[],
                    help='Explicit original ACTIVE dependencies in complete civilian families')
args = parser.parse_args()
assert args.checkpoint_version > 0
assembly, contract, prior = read(args.assembly), read(args.contract), read(args.prior_delta)
loading, native = read(args.loading), read(args.prepared / 'source.json')
inventory_path = Path(prior['baseInventory'])
assert sha(inventory_path) == prior['baseInventorySha256'] == native['inventorySha256']
inventory = read(inventory_path)
selector = Path('.local/environment-snow-selection.json')
base, pointer = assembly['acceptedBase'], assembly['pack']
assert read(selector) == base == prior['selectedEnvironment'] == contract['selectedPack']
assert read(Path('.local/terrain-snow-selection.json')) == prior['selectedTerrain']
assert loading['status'] == 'PASS_COMPLETE_FAMILIES_DENSITIES_ALLOCATION_FALLBACK_DISPOSAL'
assert loading['theater'] == contract['theater'] == native['theater'] == 'SNOW'
pack_root = Path('.local/environment-packs') / pointer['revision']
base_root = Path('.local/environment-packs') / base['revision']
assert sha(pack_root / 'manifest.json') == pointer['sha256']
assert sha(base_root / 'manifest.json') == base['sha256']
old, pack = read(base_root / 'manifest.json'), read(pack_root / 'manifest.json')
assert all(pack['families'][key] == value for key, value in old['families'].items())
preserved_files = 0
for file in base_root.rglob('*'):
    if file.is_file() and file != base_root / 'manifest.json':
        assert sha(file) == sha(pack_root / file.relative_to(base_root))
        preserved_files += 1
families = set(contract['extensions']['newFamilies'])
linked_building = set(args.linked_building_members)
assert len(linked_building) == len(args.linked_building_members)
assert not linked_building or args.kind == 'building'
if linked_building:
    assert linked_building == {source['member'] for source in native['sources']
                              if not any(binding['role'] == 'body' for binding in source['bindings'])}
    for name in families:
        family = contract['families'][name]
        basis = dict(theater='SNOW', members={member: contract['sources'][member]
                     for member in sorted(family['members'])}, identities=family['identities'])
        assert hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest() == family['familyHash']
        for row in inventory['rows']:
            if row.get('theater') != 'SNOW' or row.get('kind') != 'building' or row['id'] not in family['identities']:
                continue
            declarations = [row, *row.get('dependencies', [])]
            assert {item['source']['member'] for item in declarations} == set(family['members'])
            assert all(item['source']['sha256'] == contract['sources'][item['source']['member']]['sha256']
                       for item in declarations)
unused = verified_unused_ends(args.source_usage, native['inventorySha256']) if args.source_usage else None
assert not unused or args.kind == 'bridge'
excluded = UNUSED_ENDS if unused else set()
if unused:
    assert all(not set(identities).intersection({name.split('.')[0].upper() for name in excluded})
               for identities in contract['identities'].values())
assert families == set(assembly['appendedFamilies'])
for name in families:
    family = contract['families'][name]
    scope = family.get('sourceScope')
    if not scope:
        continue
    assert args.kind == 'building' and name in {f'snow-cacity{number:02d}' for number in range(1, 5)}
    assert scope['officialMapSha256s'] == ['a4f07f9b927148f871136237e48253cadff9ff631602cb79de46e86e1100c574']
    assert scope['visualAdaptationStatus'] == 'APPLIED_SOURCE_PINNED_ORIGINAL_LIBRARY_PALETTE'
    basis = dict(theater='SNOW', members={member: contract['sources'][member] for member in family['members']},
                 identities=family['identities'], sourceScope=scope)
    assert hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest() == family['familyHash']
if args.kind == 'bridge':
    assert families == {'snow-bridge-low-concrete', 'snow-bridge-low-wood',
                        'snow-bridge-high-concrete', 'snow-bridge-high-wood'}
    expected_members = {'bridge.sno', 'bridgb.sno'} | {
        f'{prefix}{index:02d}.sno' for prefix in ('lobrdg', 'lobrdb') for index in range(1, 27)
    } | {f'lobrdge{index}.sno' for index in range(1, 5)}
    assert {source['member'] for source in native['sources']} == expected_members
    for name in families:
        family = contract['families'][name]
        basis = dict(theater='SNOW', members={member: contract['sources'][member] for member in family['members']},
                     identities=family['identities'])
        assert hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest() == family['familyHash']
if args.kind == 'technology':
    assert families == {'snow-caoild', 'snow-cahosp', 'snow-caairp', 'snow-caoutp'}
    assert len(native['sources']) == 16
    assert {s['member'] for s in native['sources']} == {
        member for family in families for member in contract['families'][family]['members']}
    for name in families:
        family = contract['families'][name]
        basis = dict(theater='SNOW', members={member: contract['sources'][member] for member in family['members']},
                     identities=family['identities'])
        assert hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest() == family['familyHash']
if args.kind == 'wall':
    assert families == {'snow-cakrmw', 'snow-gasand'}
    assert {source['member'] for source in native['sources']} == {'cakrmw.shp', 'gasand.shp'}
    for name in families:
        family = contract['families'][name]
        basis = dict(theater='SNOW', members={member: contract['sources'][member]
                     for member in family['members']}, identities=family['identities'])
        assert hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest() == family['familyHash']
if args.kind in ('gate', 'infantry'):
    expected = {'gagate_a.shp': 42} if args.kind == 'gate' else {
        'civsf.shp': 476, 'civsfm.shp': 478, 'civstm.shp': 472}
    assert {source['member'] for source in native['sources']} == set(expected)
    assert families == {'snow-' + name.split('.')[0].replace('_', '-') for name in expected}
    for name in families:
        family = contract['families'][name]
        basis = dict(theater='SNOW', members={member: contract['sources'][member]
                     for member in family['members']}, identities=family['identities'])
        assert hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest() == family['familyHash']
    for source in native['sources']:
        assert source['hasShadow'] and source['remapable']
        assert source['totalFrames'] == expected[source['member']]
        assert contract['sources'][source['member']]['bodyFrames'] == source['totalFrames'] // 2
        if args.kind == 'gate':
            assert source['nativeRules']['Gate'].lower() == 'yes' and source['nativeArt']['GateStages'] == '9'
            assert {binding['role'] for binding in source['bindings']} == {'body', 'BUILDUP', 'UNBUILD'}
            assert all(binding['kind'] == 'building' for binding in source['bindings'])
            assert all(source['frames'][slot]['indexSha256'] == source['frames'][slot + 10]['indexSha256']
                       for slot in range(10))
            assert source['frames'][20]['indexSha256'] == source['frames'][0]['indexSha256']
        else:
            assert source['nativeArt']['Sequence'] == 'CivGunSequence'
            assert all(binding['kind'] == 'infantry' and binding['role'] == 'body' for binding in source['bindings'])
            assert all(frame['empty'] for frame in source['frames'][source['totalFrames'] // 2:])
assert {(row['identity'], row['density']) for row in loading['families']} == {
    (family, density) for family in families for density in (2, 4)}
covered, verified_frames = [], 0
for source in native['sources']:
    name = source['member']
    if name in excluded:
        assert name not in contract['sources']
        assert sha(args.prepared / 'native' / source['nativeFile']) == source['sha256']
        assert source['sha256'] == next(row['sha256'] for row in unused['excludedSourceGroups'] if row['member'] == name)
        continue
    if args.kind not in ('building', 'technology', 'gate', 'infantry'):
        assert not source['remapable']
    if args.kind == 'technology':
        assert source['remapable'] and all(b['kind'] == 'building' for b in source['bindings'])
        assert contract['sources'][name]['bodyFrames'] == source['totalFrames'] // (2 if source['hasShadow'] else 1)
    if args.kind in ('terrain', 'overlay', 'wall', 'bridge', 'building'):
        if name in linked_building:
            assert source['hasShadow'] == contract['sources'][name]['hasShadow']
        else:
            assert source['hasShadow']
        if args.kind == 'building':
            assert source['remapable'] and all(binding['kind'] == 'building' for binding in source['bindings'])
            if name in linked_building:
                assert all(binding['role'] == 'ACTIVE' for binding in source['bindings'])
                body_frames = source['totalFrames'] // 2 if source['hasShadow'] else source['totalFrames']
                assert contract['sources'][name]['bodyFrames'] == body_frames
                for binding in source['bindings']:
                    art = binding['nativeArt']
                    loop_start = int(art['LoopStart'])
                    loop_end = max(loop_start, int(art['LoopEnd']) - 1)
                    assert 0 <= loop_start <= loop_end < body_frames
                    assert int(art['Rate']) > 0 and int(art['LoopCount']) == -1
            else:
                assert contract['sources'][name]['bodyFrames'] in (2, 3, 4)
                assert all(binding['role'] == 'body' for binding in source['bindings'])
        if args.kind == 'overlay':
            assert name.startswith(('srock', 'trock')) or name in ('crate.sno', 'wcrate.sno')
            assert source['totalFrames'] == 2 and all(not frame['empty'] for frame in source['frames'])
        if args.kind == 'wall':
            assert all(binding['kind'] == 'overlay' and binding['role'] == 'body' for binding in source['bindings'])
            assert source['nativeRules']['Wall'].lower() == 'yes' and source['nativeArt']['DamageLevels'] == '2'
            assert source['totalFrames'] == 96 and contract['sources'][name]['bodyFrames'] == 48
            assert len(source['frames']) == 96 and all(not frame['empty'] for frame in source['frames'])
        if args.kind == 'bridge':
            assert source['totalFrames'] > 0 and source['totalFrames'] % 2 == 0
            assert contract['sources'][name]['bodyFrames'] == source['totalFrames'] // 2
    elif args.kind == 'smudge':
        assert not source['hasShadow'] and source['totalFrames'] == 2
        assert not source['frames'][0]['empty'] and source['frames'][1]['empty']
    assert sha(args.prepared / 'native' / source['nativeFile']) == source['sha256']
    for frame in source['frames']:
        assert sha(args.prepared / 'native' / frame['file']) == frame['rgbaSha256']
        assert sha(args.prepared / 'native' / frame['indexFile']) == frame['indexSha256']
    family, = [key for key in families if name in contract['families'][key]['members']]
    entry, = [member for member in pack['families'][family]['members'] if member['member'] == name]
    file = pack_root / entry['path']
    assert sha(file) == entry['sha256']
    hd = read(file)
    for variant in hd['variants']:
        density, pages = variant['density'], {}
        assert density in (2, 4)
        for page in variant['pages']:
            pixels = []
            for role in ('base', 'data'):
                image = file.parent / str(density) / page['id'] / (role + '.png')
                assert sha(image) == page[role + 'Sha256'] and image.stat().st_size == page[role + 'Bytes']
                pixels.append(np.asarray(Image.open(image).convert('RGBA')))
            pages[page['id']] = pixels
        body = contract['sources'][name]['bodyFrames']
        assert len(variant['frames']) == len(hd['logical']['frames']) == body
        for frame, exported, logical in zip(source['frames'][:body], variant['frames'], hd['logical']['frames']):
            assert logical['trimOrigin'] == frame['origin'] and logical['trimSize'] == frame['size']
            assert logical['nativeFrame'] == exported['nativeFrame'] == frame['slot']
            width, height = frame['size']
            indices = np.frombuffer((args.prepared / 'native' / frame['indexFile']).read_bytes(), np.uint8)
            native_indices = indices.reshape(height, width)
            indices = native_indices.repeat(density, 0).repeat(density, 1)
            base_pixels, data = pages[exported['page']]
            x, y, width, height = exported['contentRect']
            assert [width, height] == [value * density for value in frame['size']]
            pixels, owner_data = base_pixels[y:y + height, x:x + width], data[y:y + height, x:x + width]
            if args.kind in ('building', 'technology'):
                policy = hd['color']['structuralCoverage']
                assert policy['schema'] == 'native-structural-subpixel-coverage-v1'
                assert policy['toleranceNativePixels'] == .7 and policy['maximumContourAreaChangeFraction'] == .025
                semantic = contract['sources'][name].get('framePalettes', {}).get(str(frame['slot']), contract['sources'][name])
                marker = hd['color'].get('nativePaletteMarkerFrames', {}).get('frames', {}).get(str(frame['slot']))
                if marker:
                    assert args.kind == 'technology' and name == 'caairp_a.shp'
                    assert frame['slot'] > 9 and marker == frame['indexSha256']
                    assert set(np.unique(native_indices)).issubset({0, 1})
                    assert np.array_equal(pixels[..., 3], (indices != 0).astype(np.uint8) * 255)
                    assert not owner_data[..., :2].any()
                else:
                    expected_pixels, expected_owner = register_contours(pixels.copy(), owner_data.copy(),
                        native_indices, density, semantic['remapable'])
                    assert np.array_equal(pixels[..., 3], expected_pixels[..., 3])
                    assert np.array_equal(owner_data[..., :2], expected_owner[..., :2])
                if not semantic['remapable']:
                    assert not owner_data[..., :2].any(), 'Original rubble cannot acquire owner regions'
                contact = indices == 12
                assert (pixels[..., 3][contact] == 255).all() and not owner_data[..., 0][contact].any()
            else:
                assert np.array_equal(pixels[..., 3], (indices != 0).astype(np.uint8) * 255)
                if args.kind in ('gate', 'infantry'):
                    owner = (indices >= 16) & (indices <= 31)
                    assert np.array_equal(owner_data[..., 0], owner.astype(np.uint8) * 255)
                    assert np.array_equal(owner_data[..., 1], np.where(owner, indices - 16, 0).astype(np.uint8))
                else:
                    assert not owner_data[..., :2].any(), 'Non-remap native objects cannot acquire owner regions'
            verified_frames += 1
    matches = [row for row in inventory['resourceGroups'] if row.get('theater') == 'SNOW'
               and row.get('kind') == ('overlay' if args.kind in ('bridge', 'wall') else 'building' if args.kind in ('technology', 'gate') else args.kind) and row.get('member') == name
               and row.get('sha256') == source['sha256']]
    if ((args.kind == 'technology' and not any(binding['role'] == 'body' for binding in source['bindings']))
            or name in linked_building):
        assert not matches, 'Linked technology members are dependencies, not independent inventory roots'
        assert all(contract['identities'][binding['edition']][binding['id']] == family
                   for binding in source['bindings'])
        continue
    row, = matches
    assert row['decisions'] == ['MISSING_AUTHORED_FAMILY']
    covered.append(row)
remaining = dict(total=prior['remainingSnow']['total'] - len(covered) - len(excluded), tmp=prior['remainingSnow']['tmp'])
assert remaining['total'] >= 0
delta = dict(schema='m2-4-source-pinned-environment-coverage-delta-v1', baseInventory=str(inventory_path),
    baseInventorySha256=sha(inventory_path), priorDelta=str(args.prior_delta), priorDeltaSha256=sha(args.prior_delta),
    selectedTerrain=prior['selectedTerrain'], selectedEnvironment=pointer, covered=covered,
    newSourceGroups=len(covered), remainingSnow=remaining, verifiedDensityFrames=verified_frames,
    newMembers=sum(len(contract['families'][name]['members']) for name in families),
    unusedNotHdCovered=dict(proof=str(args.source_usage), sha256=sha(args.source_usage),
                           sources=unused['excludedSourceGroups']) if unused else prior.get('unusedNotHdCovered'),
    additionalUnusedNotHdCovered=prior.get('additionalUnusedNotHdCovered', []),
    status='PASS_STATIC_COMPLETE_FAMILIES_SOURCE_MASKS_OWNER_AND_INHERITED_BYTES; MAC_NATIVE_PENDING')
preservation = dict(status='PASS', inheritedFamilies=len(old['families']), inheritedFiles=preserved_files,
                    policy='Every inherited family declaration, member manifest, atlas and owner PNG remains exact.')
root = Path('.artifacts/m2-4')
version = args.checkpoint_version
for name, value in [(f'snow-batch{args.batch}-coverage-delta-v{version}.json', delta),
                    (f'snow-batch{args.batch}-base-preservation-v{version}.json', preservation)]:
    with (root / name).open('x') as stream:
        stream.write(encode(value))
contract['selectedPack'] = pointer
contract['extensions']['state'] = 'STATIC_EXPORT_VERIFIED_MAC_NATIVE_PENDING'
if args.selected_contract:
    with args.selected_contract.open('x') as stream:
        stream.write(encode(contract))
else:
    (args.contract.parent / f'contract-selected-v{version}.json').write_text(encode(contract))
Path('desktop/environment-snow-hd-contract.json').write_text(encode(contract))
selector.write_text(encode(pointer))
print(json.dumps(dict(selectedEnvironment=pointer, newFamilies=len(families), newSourceGroups=len(covered),
    verifiedDensityFrames=verified_frames, preservedFiles=preserved_files, remainingSnow=remaining,
    affectedDirectoryIdentities=len({name for row in covered for name in row['maps']}))))
