"""Reuse bounded accepted NewTheater families with exact original data and used colors."""
import argparse
import copy
import hashlib
import json
import os
import shutil
import sys
from pathlib import Path
import numpy as np
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_contours import register_contours


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def encode(value):
    return json.dumps(value, indent=2) + '\n'


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('revision')
parser.add_argument('--kind', choices=['building', 'overlay'], default='building')
args = parser.parse_args()
native_root = Path('.artifacts/m2-4/snow-native-v1')
native = read(native_root / 'source.json')
sources = {source['member']: source for source in native['sources']}
baseline_path = Path('desktop/environment-snow-hd-contract.json')
contract = copy.deepcopy(read(baseline_path))
accepted_path = Path('desktop/environment-hd-contract.json')
accepted = read(accepted_path)
donor_root = Path('.local/environment-packs') / accepted['selectedPack']['revision']
assert sha(donor_root / 'manifest.json') == accepted['selectedPack']['sha256']
donor = read(donor_root / 'manifest.json')
assert native['theater'] == contract['theater'] == 'SNOW'
identity_names = (['CAFNCP'] if args.kind == 'overlay' else
    ['CAMSC06', 'CABHUT', 'CAPARK01', 'CAPARK02', 'CAMISC04', 'CASTRT05', 'CAMIAM04'])
families, selected, member_records, copied_pages = {}, [], [], []
for identity in identity_names:
    old_family = accepted['identities']['ra2'].get(identity) or accepted['identities']['yr'][identity]
    declaration = accepted['families'][old_family]
    assert declaration['kinds'] == [args.kind]
    assert donor['families'][old_family]['familyHash'] == declaration['familyHash']
    new_family = 'snow-' + identity.lower()
    assert new_family not in contract['families']
    members, family_sources, bindings = [], {}, []
    for entry in donor['families'][old_family]['members']:
        old_name = entry['member']
        assert old_name.startswith('ct'), 'Only declared original NewTheater T/A counterparts are admitted'
        name = old_name[0] + 'a' + old_name[2:]
        source = sources[name]
        assert all(binding['kind'] == args.kind for binding in source['bindings'])
        old_descriptor = accepted['sources'][old_name]
        descriptor = copy.deepcopy(old_descriptor)
        descriptor['palette'] = source['palette']
        assert descriptor['sha256'] == source['sha256'] == sha(native_root / 'native' / source['nativeFile'])
        assert descriptor['canvas'] == source['canvas'] and descriptor['totalFrames'] == source['totalFrames']
        assert descriptor['hasShadow'] == source['hasShadow'] and descriptor['remapable'] == source['remapable']
        assert descriptor['bodyFrames'] == source['totalFrames'] // (2 if source['hasShadow'] else 1)
        for palette in descriptor.get('framePalettes', {}).values():
            assert palette['sha256'] == old_descriptor['palette']['sha256']
            for field in ['member', 'archive', 'sha256']:
                palette[field] = source['palette'][field]
        used = set()
        for frame in source['frames']:
            assert sha(native_root / 'native' / frame['file']) == frame['rgbaSha256']
            assert sha(native_root / 'native' / frame['indexFile']) == frame['indexSha256']
            if frame['slot'] < descriptor['bodyFrames']:
                used.update((native_root / 'native' / frame['indexFile']).read_bytes())
        used -= {0}
        if descriptor['remapable']:
            used -= set(range(16, 32))
        snow_palette = native_root / 'native' / (source['palette']['sha256'] + '.pal')
        temp_palette = Path('.artifacts/m2-4/accepted-unittem.pal')
        assert sha(snow_palette) == source['palette']['sha256']
        assert sha(temp_palette) == old_descriptor['palette']['sha256']
        snow_rgb = np.frombuffer(snow_palette.read_bytes(), np.uint8).reshape(256, 3)
        temp_rgb = np.frombuffer(temp_palette.read_bytes(), np.uint8).reshape(256, 3)
        assert np.array_equal(snow_rgb[sorted(used)], temp_rgb[sorted(used)])
        member_path = donor_root / entry['path']
        assert sha(member_path) == entry['sha256']
        hd = read(member_path)
        assert hd['source']['member'] == old_name and hd['source']['sha256'] == source['sha256']
        assert hd['source']['theater'] == 'TEMPERATE' and hd['logical']['canvas'] == source['canvas']
        assert len(hd['logical']['frames']) == descriptor['bodyFrames']
        assert {variant['density'] for variant in hd['variants']} == {2, 4}
        if args.kind == 'overlay':
            assert name == 'cafncp.shp' and descriptor['bodyFrames'] == 32
            assert not descriptor['remapable'] and not hd['color'].get('structuralCoverage')
            metal = hd['color']['nativeThinMetalRegistration']
            assert metal['sourceSha256'] == source['sha256']
            assert metal['paletteSha256'] == old_descriptor['palette']['sha256']
            assert metal['frames'] == {str(frame['slot']): frame['indexSha256']
                for frame in source['frames'][:descriptor['bodyFrames']]}
            assert metal['shadeGate'] == dict(nativeLuminanceThreshold=110, exponent=1.6,
                authoredMetalExposure=1.5)
        target_dir = Path('members') / name.replace('.', '-')
        frame_count = 0
        for variant in hd['variants']:
            density, pages = variant['density'], {}
            assert len(variant['frames']) == descriptor['bodyFrames']
            for page in variant['pages']:
                images = []
                for role in ['base', 'data']:
                    file = member_path.parent / str(density) / page['id'] / (role + '.png')
                    assert sha(file) == page[role + 'Sha256'] and file.stat().st_size == page[role + 'Bytes']
                    pixels = np.asarray(Image.open(file).convert('RGBA'))
                    assert list(pixels.shape[1::-1]) == page['size']
                    images.append(pixels)
                    copied_pages.append((file, target_dir / str(density) / page['id'] / (role + '.png')))
                pages[page['id']] = images
            for source_frame, logical, frame in zip(source['frames'], hd['logical']['frames'], variant['frames']):
                assert logical['nativeFrame'] == frame['nativeFrame'] == source_frame['slot']
                assert logical['trimOrigin'] == source_frame['origin'] and logical['trimSize'] == source_frame['size']
                assert logical['empty'] == source_frame['empty']
                if source_frame['empty']:
                    assert frame.get('empty') is True
                    continue
                width, height = source_frame['size']
                indices = np.frombuffer((native_root / 'native' / source_frame['indexFile']).read_bytes(), np.uint8)
                native_indices = indices.reshape(height, width)
                indices = native_indices.repeat(density, 0).repeat(density, 1)
                base, data = pages[frame['page']]
                x, y, w, h = frame['contentRect']
                assert [w, h] == [width * density, height * density]
                policy = hd['color'].get('structuralCoverage')
                remapable = descriptor.get('framePalettes', {}).get(str(source_frame['slot']), descriptor)['remapable']
                if policy:
                    assert policy['schema'] == 'native-structural-subpixel-coverage-v1'
                    assert policy['toleranceNativePixels'] == .7 and policy['maximumContourAreaChangeFraction'] == .025
                    accepted_base, accepted_data = base[y:y+h, x:x+w], data[y:y+h, x:x+w]
                    # Recompute only the accepted masks on inspection copies; copied PNGs remain exact.
                    expected_base, expected_data = register_contours(accepted_base.copy(), accepted_data.copy(),
                        native_indices, density, remapable)
                    assert np.array_equal(accepted_base[..., 3], expected_base[..., 3]), (name, density, source_frame['slot'])
                    assert np.array_equal(accepted_data[..., :2], expected_data[..., :2]), (name, density, source_frame['slot'])
                    contact = indices == 12
                    assert (accepted_base[..., 3][contact] == 255).all() and not accepted_data[..., 0][contact].any()
                else:
                    assert np.array_equal(base[y:y+h, x:x+w, 3], (indices != 0).astype(np.uint8) * 255)
                    owner = (indices >= 16) & (indices <= 31) if remapable else np.zeros_like(indices, dtype=bool)
                    assert np.array_equal(data[y:y+h, x:x+w, 0], owner.astype(np.uint8) * 255)
                    assert np.array_equal(data[y:y+h, x:x+w, 1], np.where(owner, indices - 16, 0))
                frame_count += 1
        hd['source']['member'], hd['source']['theater'] = name, 'SNOW'
        hd['packId'], hd['packRevision'] = new_family, args.revision
        assert name not in contract['sources']
        contract['sources'][name] = descriptor
        members.append(name); family_sources[name] = descriptor; selected.append(source)
        bindings.extend(source['bindings'])
        member_records.append(dict(family=new_family, member=name, donorMember=old_name,
            donorMetadataSha256=entry['sha256'], sourceSha256=source['sha256'],
            path=str(target_dir / 'manifest.json'), metadata=hd, verifiedDensityFrames=frame_count,
            usedFixedPaletteIndices=sorted(used)))
    identities = sorted({binding['id'] for binding in bindings})
    family_basis = dict(theater='SNOW', members=family_sources, identities=identities)
    family_hash = hashlib.sha256(json.dumps(family_basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    contract['families'][new_family] = dict(members=sorted(members), identities=identities,
        editions=sorted({binding['edition'] for binding in bindings}), kinds=[args.kind], familyHash=family_hash)
    for binding in bindings:
        edition = contract['identities'].setdefault(binding['edition'], {})
        assert edition.get(binding['id']) in (None, new_family), binding
        edition[binding['id']] = new_family
    families[new_family] = dict(familyHash=family_hash, members=[])
args.output.mkdir(parents=True, exist_ok=False)
os.symlink((native_root / 'native').resolve(), args.output / 'native', target_is_directory=True)
(args.output / 'source.json').write_text(encode(dict(schema='m2-4-exact-accepted-building-native-v1', kind=args.kind,
    theater='SNOW', inventorySha256=sha(Path('.artifacts/m2-4/inventory-v6/inventory.json')),
    reusedNativeSourceSha256=sha(native_root / 'source.json'), sources=selected)))
destination = Path('.local/environment-packs') / args.revision
destination.mkdir(exist_ok=False)
for file, relative in copied_pages:
    target = destination / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(file, target)
    assert sha(file) == sha(target)
for record in member_records:
    path = destination / record['path']
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(encode(record.pop('metadata')))
    families[record['family']]['members'].append(dict(member=record['member'], path=record['path'], sha256=sha(path)))
pack = dict(schema=donor['schema'], revision=args.revision, theater='SNOW', families=families)
(destination / 'manifest.json').write_text(encode(pack))
contract['extensions'] = dict(milestone='M2.4', baselineContractSha256=sha(baseline_path),
    inventorySha256=sha(Path('.artifacts/m2-4/inventory-v6/inventory.json')), newFamilies=sorted(families),
    state='EXACT_ACCEPTED_BUILDING_REUSE_STATIC_VERIFIED_NATIVE_PENDING',
    policy='All related original files, geometry and used fixed palette colors match. Accepted structural coverage and categorical owner masks are recomputed against the identical original indices; all PNGs remain byte-exact. New metadata uses normal fresh preparation; old cache data is not relabeled.')
(args.output / 'contract.json').write_text(encode(contract))
(args.output / 'reuse-receipt.json').write_text(encode(dict(status='PASS_COMPLETE_ACCEPTED_BUILDING_FAMILY_REUSE_STATIC',
    kind=args.kind, identities=identity_names,
    donorSelectedPack=accepted['selectedPack'], acceptedContractSha256=sha(accepted_path),
    patch=dict(schemaVersion=1, revision=args.revision, sha256=sha(destination / 'manifest.json')),
    families=member_records, copiedPages=len(copied_pages), visualStatus='ACCEPTED_ART_REUSED_SNOW_NATIVE_PENDING',
    nativeStatus='NOT_RUN', windowsStatus='NOT_RUN')))
print(json.dumps(dict(families=len(families), members=len(member_records), pngs=len(copied_pages),
    verifiedDensityFrames=sum(record['verifiedDensityFrames'] for record in member_records))))
