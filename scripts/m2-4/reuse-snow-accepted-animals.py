"""Register complete accepted animal art only after exact Snow source and palette checks."""
import argparse
import copy
import hashlib
import json
import os
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('--revision', default='snow-environment-m2-4-animals-v1')
parser.add_argument('--select', action='store_true')
args = parser.parse_args()
assert args.revision.startswith('snow-environment-m2-4-') and args.revision.replace('-', '').isalnum()
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
encode = lambda value: json.dumps(value, separators=(',', ':')) + '\n'
native_root = Path('.artifacts/m2-4/snow-native-v1')
native = read(native_root / 'source.json')
accepted = read(Path('.local/environment-selection.json'))
accepted_root = Path('.local/environment-packs') / accepted['revision']
assert sha(accepted_root / 'manifest.json') == accepted['sha256']
accepted_pack = read(accepted_root / 'manifest.json')
accepted_contract = read(Path('desktop/environment-hd-contract.json'))
contract_path = Path('desktop/environment-snow-hd-contract.json')
baseline_contract = read(contract_path)
base = read(Path('.local/environment-snow-selection.json'))
assert base == baseline_contract['selectedPack']
base_root = Path('.local/environment-packs') / base['revision']
assert sha(base_root / 'manifest.json') == base['sha256']
pack, contract = read(base_root / 'manifest.json'), copy.deepcopy(baseline_contract)
assert pack['theater'] == contract['theater'] == native['theater'] == 'SNOW'
assert accepted_pack['theater'] == accepted_contract['theater'] == 'TEMPERATE'
selected = []
records, page_files, verified_native = [], [], set()

for identity, name in [('COW', 'cow.shp'), ('POLARB', 'polarb.shp')]:
    source, = [s for s in native['sources'] if s['member'] == name]
    family = accepted_contract['identities']['yr'][identity]
    declared = accepted_contract['families'][family]
    assert declared['members'] == [name]
    old_descriptor = accepted_contract['sources'][name]
    descriptor = dict(sha256=source['sha256'], canvas=source['canvas'], totalFrames=source['totalFrames'],
        bodyFrames=source['totalFrames'] // 2, palette=source['palette'],
        hasShadow=source['hasShadow'], remapable=source['remapable'])
    assert descriptor['hasShadow'] and descriptor['remapable']
    assert all(descriptor[k] == old_descriptor[k] for k in descriptor if k != 'palette')
    assert sha(native_root / 'native' / source['nativeFile']) == source['sha256']
    verified_native.add(source['nativeFile'])
    snow_palette_file = native_root / 'native' / (source['palette']['sha256'] + '.pal')
    temp_palette_file = Path('.artifacts/m2-4/accepted-unittem.pal')
    assert sha(snow_palette_file) == source['palette']['sha256']
    assert sha(temp_palette_file) == old_descriptor['palette']['sha256']
    snow_palette = np.frombuffer(snow_palette_file.read_bytes(), np.uint8).reshape(256, 3)
    temp_palette = np.frombuffer(temp_palette_file.read_bytes(), np.uint8).reshape(256, 3)
    used = set()
    for frame in source['frames']:
        for key, expected in [('file', 'rgbaSha256'), ('indexFile', 'indexSha256')]:
            assert sha(native_root / 'native' / frame[key]) == frame[expected]
            verified_native.add(frame[key])
        if frame['slot'] < descriptor['bodyFrames']:
            used.update((native_root / 'native' / frame['indexFile']).read_bytes())
    used = sorted(used - {0} - set(range(16, 32)))
    assert np.array_equal(snow_palette[used], temp_palette[used]), name + ': used fixed colors differ'
    entry, = accepted_pack['families'][family]['members']
    assert accepted_pack['families'][family]['familyHash'] == declared['familyHash']
    assert sha(accepted_root / entry['path']) == entry['sha256']
    hd = read(accepted_root / entry['path'])
    assert hd['source'] == dict(member=name, sha256=source['sha256'], theater='TEMPERATE', kind='resolved-shp-member')
    assert hd['logical']['canvas'] == source['canvas']
    assert len(hd['logical']['frames']) == descriptor['bodyFrames']
    assert {v['density'] for v in hd['variants']} == {2, 4}
    for frame, logical in zip(source['frames'], hd['logical']['frames']):
        assert logical == dict(nativeFrame=frame['slot'], trimOrigin=frame['origin'], trimSize=frame['size'],
            legacyRenderSize=[v + v % 2 for v in frame['size']], empty=frame['empty'])
    density_frames = 0
    for variant in hd['variants']:
        density, pages = variant['density'], {}
        assert len(variant['frames']) == descriptor['bodyFrames']
        for page in variant['pages']:
            pixels = []
            for role in ['base', 'data']:
                relative = Path(entry['path']).parent / str(density) / page['id'] / (role + '.png')
                file = accepted_root / relative
                assert sha(file) == page[role + 'Sha256'] and file.stat().st_size == page[role + 'Bytes']
                image = Image.open(file).convert('RGBA')
                assert list(image.size) == page['size']
                pixels.append(np.asarray(image))
                page_files.append((file, relative))
            pages[page['id']] = pixels
        for frame, exported in zip(source['frames'], variant['frames']):
            assert exported['nativeFrame'] == frame['slot']
            if frame['empty']:
                assert exported.get('empty') is True
                continue
            base_pixels, data = pages[exported['page']]
            x, y, width, height = exported['contentRect']
            assert [width, height] == [v * density for v in frame['size']]
            indices = np.frombuffer((native_root / 'native' / frame['indexFile']).read_bytes(), np.uint8)
            indices = indices.reshape(frame['size'][1], frame['size'][0])
            indices = indices.repeat(density, 0).repeat(density, 1)
            owner = (indices >= 16) & (indices <= 31)
            assert np.array_equal(base_pixels[y:y + height, x:x + width, 3], (indices != 0).astype(np.uint8) * 255)
            assert np.array_equal(data[y:y + height, x:x + width, 0], owner.astype(np.uint8) * 255)
            assert np.array_equal(data[y:y + height, x:x + width, 1], np.where(owner, indices - 16, 0))
            density_frames += 1
    snow_family = 'snow-' + identity.lower()
    assert snow_family not in contract['families'] and name not in contract['sources']
    new_family = dict(members=[name], identities=[identity], editions=['yr'], kinds=['infantry'])
    family_basis = dict(theater='SNOW', members={name: descriptor}, identities=[identity])
    new_family['familyHash'] = hashlib.sha256(json.dumps(family_basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    contract['sources'][name], contract['families'][snow_family] = descriptor, new_family
    assert identity not in contract['identities']['yr']
    contract['identities']['yr'][identity] = snow_family
    hd['source']['theater'], hd['packRevision'] = 'SNOW', args.revision
    selected.append(source)
    records.append(dict(identity=identity, member=name, family=snow_family, sourceSha256=source['sha256'],
        nativeBodyFrames=descriptor['bodyFrames'], verifiedDensityFrames=density_frames,
        usedFixedPaletteColors=len(used), oldMemberSha256=entry['sha256'], oldFamilyHash=declared['familyHash'],
        newFamilyHash=new_family['familyHash'], memberPath=entry['path'], manifest=hd,
        palettePolicy='All used body non-remap palette entries are identical; original owner masks and shades remain exact',
        shadowPolicy='Native separate shadow frames remain Snow originals; no colored shadow art is copied',
        artPolicy='Complete accepted pages copied without editing; native separate shadow frames remain original'))

args.output.mkdir(parents=True, exist_ok=False)
os.symlink((native_root / 'native').resolve(), args.output / 'native', target_is_directory=True)
prepared = dict(schema='m2-4-accepted-snow-animal-native-v1', theater='SNOW',
    reusedNativeSourceSha256=sha(native_root / 'source.json'), verifiedNativeFiles=len(verified_native), sources=selected)
(args.output / 'source.json').write_text(json.dumps(prepared, indent=2) + '\n')
destination = Path('.local/environment-packs') / args.revision
shutil.copytree(base_root, destination)
pack['revision'] = args.revision
for file, relative in page_files:
    target = destination / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    assert not target.exists()
    shutil.copyfile(file, target)
    assert sha(file) == sha(target)
for record in records:
    path = destination / record['memberPath']
    path.write_text(encode(record.pop('manifest')))
    pack['families'][record['family']] = dict(familyHash=record['newFamilyHash'], members=[
        dict(member=record['member'], sha256=sha(path), path=record['memberPath'])])
(destination / 'manifest.json').write_text(encode(pack))
for file in base_root.rglob('*'):
    if file.is_file() and file != base_root / 'manifest.json':
        assert sha(file) == sha(destination / file.relative_to(base_root))
assert all(contract['families'][k] == v for k, v in baseline_contract['families'].items())
assert all(contract['sources'][k] == v for k, v in baseline_contract['sources'].items())
pointer = dict(schemaVersion=1, revision=args.revision, sha256=sha(destination / 'manifest.json'))
contract['selectedPack'] = pointer
contract['extensions'] = dict(baselineContractSha256=sha(contract_path),
    nativeGuideSha256=sha(native_root / 'source.json'), completeAcceptedPack=accepted,
    policy='Add only exact-source used-palette-equivalent complete animal families; no old prepared cache relabeling')
(args.output / 'contract.json').write_text(json.dumps(contract, indent=2) + '\n')
recipe = dict(schema='m2-4-complete-accepted-snow-animal-reuse-v1', base=base, accepted=accepted,
    selectedEnvironment=pointer, families=records, reusedPages=len(page_files),
    inheritedFamilies=len(baseline_contract['families']), nativeBodyFrames=sum(r['nativeBodyFrames'] for r in records),
    verifiedNativeFiles=len(verified_native), technicalStatus='PASS_STATIC_EXACT_SOURCE_PALETTE_GEOMETRY_ALPHA_AND_OWNER',
    artStatus='ACCEPTED_TEMPERATE_ART_BYTES_REUSED', snowNativeStatus='PENDING_NATIVE_VALIDATION', windowsStatus='NOT_RUN')
(args.output / 'recipe.json').write_text(json.dumps(recipe, indent=2) + '\n')
if args.select:
    assert read(Path('.local/environment-snow-selection.json')) == base and read(contract_path) == baseline_contract
    contract_path.write_text(json.dumps(contract, indent=2) + '\n')
    Path('.local/environment-snow-selection.json').write_text(json.dumps(pointer, indent=2) + '\n')
print(json.dumps({k: v for k, v in recipe.items() if k not in ['families']}))
