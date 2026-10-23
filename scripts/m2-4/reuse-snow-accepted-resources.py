"""Prepare complete Snow ore and gem families from byte-verified accepted artwork."""
import argparse
import copy
import hashlib
import json
import os
import shutil
from pathlib import Path

import numpy as np
from PIL import Image


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def encode(value):
    return json.dumps(value, indent=2) + '\n'


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('--revision', default='snow-environment-m2-4-resources-v1')
parser.add_argument('--inventory', type=Path, default=Path('.artifacts/m2-4/inventory-v6/inventory.json'))
args = parser.parse_args()
assert args.revision.startswith('snow-environment-m2-4-') and args.revision.replace('-', '').isalnum()
native_root = Path('.artifacts/m2-4/snow-native-v1')
native = read(native_root / 'source.json')
inventory = read(args.inventory)
accepted = read(Path('.local/environment-selection.json'))
accepted_root = Path('.local/environment-packs') / accepted['revision']
assert sha(accepted_root / 'manifest.json') == accepted['sha256']
accepted_pack = read(accepted_root / 'manifest.json')
accepted_contract = read(Path('desktop/environment-hd-contract.json'))
base_path = Path('desktop/environment-snow-hd-contract.json')
baseline = read(base_path)
base = read(Path('.local/environment-snow-selection.json'))
assert base == baseline['selectedPack']
base_root = Path('.local/environment-packs') / base['revision']
assert sha(base_root / 'manifest.json') == base['sha256']
contract, pack = copy.deepcopy(baseline), read(base_root / 'manifest.json')
assert native['theater'] == contract['theater'] == pack['theater'] == 'SNOW'
assert accepted_contract['theater'] == accepted_pack['theater'] == 'TEMPERATE'
sources = [source for source in native['sources'] if source['format'] == 'shp'
           and (source['member'].startswith('gem') or source['member'].startswith('tib'))
           and not source['member'].startswith('tibtre')]
assert len(sources) == 32
by_name = {source['member']: source for source in sources}
verified, records, pages_to_copy, members = set(), [], {}, {}
family_members = {family: [] for family in ['snow-ore', 'snow-gem']}
family_identities = {family: set() for family in family_members}
body_frames = density_frames = 0
for source in sources:
    name = source['member']
    group, = [row for row in inventory['resourceGroups'] if row.get('theater') == 'SNOW'
              and row.get('kind') == 'overlay' and row.get('member') == name
              and row.get('sha256') == source['sha256']]
    assert group['decisions'] == ['MISSING_AUTHORED_FAMILY']
    rows = [row for row in inventory['rows'] if row['theater'] == 'SNOW'
            and row.get('source', {}).get('member') == name]
    assert rows and all(row['kind'] == 'overlay' and row['source']['sha256'] == source['sha256'] for row in rows)
    original_name = name.replace('.sno', '.tem')
    canonical = accepted_contract['aliases'].get(original_name, original_name)
    canonical_snow = canonical.replace('.tem', '.sno')
    old = accepted_contract['sources'][canonical]
    assert source['sha256'] == old['sha256'] == by_name[canonical_snow]['sha256']
    assert all(source[key] == old[key] for key in ['canvas', 'totalFrames', 'hasShadow', 'remapable'])
    assert source['hasShadow'] and not source['remapable']
    assert sha(native_root / 'native' / source['nativeFile']) == source['sha256']
    verified.add(source['nativeFile'])
    used = set()
    for frame in source['frames']:
        for key, expected in [('file', 'rgbaSha256'), ('indexFile', 'indexSha256')]:
            assert sha(native_root / 'native' / frame[key]) == frame[expected]
            verified.add(frame[key])
        if frame['slot'] < old['bodyFrames']:
            used.update((native_root / 'native' / frame['indexFile']).read_bytes())
    used = sorted(used - {0})
    original_palette = Path('.artifacts/m2-4/accepted-native-palettes-v1') / (old['palette']['sha256'] + '.pal')
    snow_palette = native_root / 'native' / (source['palette']['sha256'] + '.pal')
    assert sha(original_palette) == old['palette']['sha256']
    assert sha(snow_palette) == source['palette']['sha256']
    colors = [np.frombuffer(path.read_bytes(), np.uint8).reshape(256, 3)
              for path in [original_palette, snow_palette]]
    assert np.array_equal(colors[0][used], colors[1][used]), name + ': fixed body colors differ'
    family = 'snow-gem' if name.startswith('gem') else 'snow-ore'
    old_family = 'environment-gem' if name.startswith('gem') else 'environment-ore'
    assert accepted_pack['families'][old_family]['familyHash'] == accepted_contract['families'][old_family]['familyHash']
    identities = {binding['id'] for binding in source['bindings']}
    family_identities[family].update(identities)
    for binding in source['bindings']:
        assert binding['kind'] == 'overlay' and binding['role'] == 'body'
        assert binding['id'] not in baseline['identities'][binding['edition']]
        contract['identities'][binding['edition']][binding['id']] = family
    if name != canonical_snow:
        assert name not in contract['aliases'] and name not in contract['sources']
        contract['aliases'][name] = canonical_snow
        records.append(dict(member=name, canonical=canonical_snow, sha256=source['sha256'],
                            policy='Byte-identical native member alias; preserve original filename, indices and terrain identity.'))
        continue
    descriptor = {key: copy.deepcopy(old[key]) for key in
                  ['sha256', 'canvas', 'totalFrames', 'bodyFrames', 'hasShadow', 'remapable']}
    descriptor['palette'] = source['palette']
    assert name not in contract['sources']
    contract['sources'][name] = descriptor
    family_members[family].append(name)
    entry, = [row for row in accepted_pack['families'][old_family]['members'] if row['member'] == canonical]
    file = accepted_root / entry['path']
    assert sha(file) == entry['sha256']
    hd = read(file)
    assert hd['source'] == dict(member=canonical, sha256=source['sha256'], theater='TEMPERATE', kind='resolved-shp-member')
    assert hd['logical']['canvas'] == source['canvas']
    assert len(hd['logical']['frames']) == old['bodyFrames']
    assert {variant['density'] for variant in hd['variants']} == {2, 4}
    destination_manifest = Path('members') / name.replace('.', '-') / 'manifest.json'
    for frame, logical in zip(source['frames'], hd['logical']['frames']):
        assert logical == dict(nativeFrame=frame['slot'], trimOrigin=frame['origin'], trimSize=frame['size'],
            legacyRenderSize=[value + value % 2 for value in frame['size']], empty=frame['empty'])
    for variant in hd['variants']:
        density, decoded = variant['density'], {}
        assert len(variant['frames']) == old['bodyFrames']
        for page in variant['pages']:
            pixels = []
            for role in ['base', 'data']:
                relative = Path(str(density)) / page['id'] / (role + '.png')
                source_file = file.parent / relative
                assert sha(source_file) == page[role + 'Sha256']
                assert source_file.stat().st_size == page[role + 'Bytes']
                image = Image.open(source_file).convert('RGBA')
                assert list(image.size) == page['size']
                pixels.append(np.asarray(image))
                pages_to_copy[destination_manifest.parent / relative] = source_file
            decoded[page['id']] = pixels
        for frame, exported in zip(source['frames'], variant['frames']):
            assert exported['nativeFrame'] == frame['slot']
            if frame['empty']:
                assert exported.get('empty') is True
                continue
            base_pixels, data = decoded[exported['page']]
            x, y, width, height = exported['contentRect']
            assert [width, height] == [value * density for value in frame['size']]
            indices = np.frombuffer((native_root / 'native' / frame['indexFile']).read_bytes(), np.uint8)
            indices = indices.reshape(frame['size'][1], frame['size'][0]).repeat(density, 0).repeat(density, 1)
            assert np.array_equal(base_pixels[y:y + height, x:x + width, 3], (indices != 0).astype(np.uint8) * 255)
            assert not data[y:y + height, x:x + width, :2].any(), 'Fixed-color resources cannot acquire owner masks'
            density_frames += 1
    hd['source']['member'], hd['source']['theater'], hd['packRevision'] = name, 'SNOW', args.revision
    members[name] = (destination_manifest, hd)
    body_frames += old['bodyFrames']
    records.append(dict(member=name, acceptedMember=canonical, sha256=source['sha256'],
        acceptedMemberSha256=entry['sha256'], bodyFrames=old['bodyFrames'], usedFixedColors=len(used),
        palettePolicy='Every used nonzero body palette entry is identical, including indices 16 through 31.',
        artPolicy='Complete accepted base/data pages copied unchanged; original Snow separate shadow remains native.'))
assert all(len(values) == 12 for values in family_members.values())
for family, names in family_members.items():
    names.sort()
    identities = sorted(family_identities[family])
    hash_input = dict(theater='SNOW', members={name: contract['sources'][name] for name in names}, identities=identities)
    family_hash = hashlib.sha256(json.dumps(hash_input, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    assert family not in contract['families']
    contract['families'][family] = dict(members=names, identities=identities,
        editions=['ra2', 'yr'], kinds=['overlay'], familyHash=family_hash)
args.output.mkdir(parents=True, exist_ok=False)
os.symlink((native_root / 'native').resolve(), args.output / 'native', target_is_directory=True)
prepared = dict(schema='m2-4-accepted-snow-resource-native-v1', theater='SNOW', sources=sources,
    inventoryFile=str(args.inventory), inventorySha256=sha(args.inventory),
    verifiedNativeFiles=len(verified), originalNativeSourceSha256=sha(native_root / 'source.json'),
    originalSourceInventoryFile=native['inventoryFile'], originalSourceInventorySha256=native['inventorySha256'],
    admissionPolicy='Every original member is resolved in the current inventory with matching raw hash, overlay kind and identity rows; every named native input and accepted HD payload is independently rehashed.')
(args.output / 'source.json').write_text(encode(prepared))
destination = Path('.local/environment-packs') / args.revision
shutil.copytree(base_root, destination)
pack['revision'] = args.revision
for relative, source_file in pages_to_copy.items():
    target = destination / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    assert not target.exists()
    shutil.copyfile(source_file, target)
    assert sha(source_file) == sha(target)
for name, (relative, hd) in members.items():
    with (destination / relative).open('x') as stream:
        stream.write(json.dumps(hd, separators=(',', ':')) + '\n')
for family, names in family_members.items():
    pack['families'][family] = dict(familyHash=contract['families'][family]['familyHash'], members=[
        dict(member=name, path=str(members[name][0]), sha256=sha(destination / members[name][0])) for name in names])
(destination / 'manifest.json').write_text(json.dumps(pack, separators=(',', ':')) + '\n')
preserved = 0
for file in base_root.rglob('*'):
    if file.is_file() and file != base_root / 'manifest.json':
        assert sha(file) == sha(destination / file.relative_to(base_root))
        preserved += 1
for name, declared in baseline['families'].items():
    assert contract['families'][name] == declared and pack['families'][name] == read(base_root / 'manifest.json')['families'][name]
pointer = dict(schemaVersion=1, revision=args.revision, sha256=sha(destination / 'manifest.json'))
contract['preparedSourceSha256'] = sha(args.output / 'source.json')
contract['extensions'] = dict(baselineContractSha256=sha(base_path), baselineSelectedPack=base,
    nativeGuideSha256=sha(args.output / 'source.json'), inventorySha256=sha(args.inventory),
    newFamilies=sorted(family_members), completeAcceptedPack=accepted,
    policy='Exact complete accepted resource art, source and used-palette proof; no old cache relabeling.',
    state='STATIC_SOURCE_AND_PAYLOAD_VERIFIED_NATIVE_LOADING_PENDING')
(args.output / 'base-contract.json').write_text(encode(baseline))
(args.output / 'contract.json').write_text(encode(contract))
recipe = dict(schema='m2-4-complete-accepted-snow-resource-reuse-v1', base=base, accepted=accepted,
    selectedEnvironment=pointer, records=records, newFamilies=sorted(family_members),
    canonicalMembers=len(members), nativeSourceMembers=len(sources), reusedPngFiles=len(pages_to_copy),
    nativeBodyFrames=body_frames, verifiedDensityFrames=density_frames, verifiedNativeFiles=len(verified),
    preservedBaseFiles=preserved, staticStatus='PASS_EXACT_SOURCE_USED_PALETTE_GEOMETRY_ALPHA_AND_OWNER',
    nativeStatus='PENDING', visualStatus='SNOW_BINDINGS_PENDING_USER_REVIEW', windowsStatus='NOT_RUN')
(args.output / 'recipe.json').write_text(encode(recipe))
(args.output / 'base-preservation-v2.json').write_text(encode(dict(
    status='PASS_ALL_INHERITED_MEMBER_MANIFESTS_AND_PNGS_EXACT', families=len(baseline['families']),
    inheritedFiles=preserved, priorRecipeSha256=sha(args.output / 'recipe.json'),
    files=[dict(file=str(file.relative_to(base_root)), sha256=sha(file), bytes=file.stat().st_size)
           for file in sorted(base_root.rglob('*')) if file.is_file() and file != base_root / 'manifest.json'])))
print(json.dumps({key: value for key, value in recipe.items() if key != 'records'}))
