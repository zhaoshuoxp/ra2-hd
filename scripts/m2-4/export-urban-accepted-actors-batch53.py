"""Retain accepted gate/actor detail and adapt only five proven native palette cells."""
import copy
import hashlib
import json
import shutil
from pathlib import Path
import numpy as np
from PIL import Image

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
encode = lambda d: json.dumps(d, indent=2) + '\n'
root = Path('.artifacts/m2-4/urban-accepted-actors-native-batch53-v1')
output = Path('.artifacts/m2-4/urban-accepted-actors-export-batch53-v2')
source_file = root / 'source.json'
sources = {s['member']:s for s in read(source_file)['sources']}
source = sources['civsfm.shp']
assert source['sha256'] == 'fc8b75a2b7b10da6405e8692ad91ebcf884cb366dff93e5e0c49b14dae181dee'
assert source['totalFrames'] == 478 and source['hasShadow'] and source['remapable']
proof_file = root / 'accepted-source-audit-v1.json'
proof = read(proof_file)
rejected, = [r for r in proof['rejected'] if r['identities'] == ['CIVSFM']]
assert rejected['reasons'] == ['civsfm.shp: used fixed palette colors differ']
candidate, = rejected['members']
expected_frames = [90, 96, 128, 130, 132]
assert candidate['colorDifferences'] == [dict(slot=n, indices=[254]) for n in expected_frames]
accepted = read(Path('desktop/environment-snow-hd-contract.json'))
old = accepted['sources']['civsfm.shp']
assert all(old[k] == source[k] for k in ['sha256', 'canvas', 'totalFrames', 'hasShadow', 'remapable'])
old_palette = Path('.artifacts/m2-4/snow-native-walls-batch32-v1/native') / (old['palette']['sha256'] + '.pal')
new_palette = root / 'native' / (source['palette']['sha256'] + '.pal')
assert sha(old_palette) == old['palette']['sha256'] and sha(new_palette) == source['palette']['sha256']
a = np.frombuffer(old_palette.read_bytes(), np.uint8).reshape(256, 3).astype(np.uint16) * 4
b = np.frombuffer(new_palette.read_bytes(), np.uint8).reshape(256, 3).astype(np.uint16) * 4
assert list(a[254]) == [0, 0, 252] and list(b[254]) == [112, 196, 52]
donor_root = Path('.local/environment-packs') / accepted['selectedPack']['revision']
donor_pack = read(donor_root / 'manifest.json')
assert sha(donor_root / 'manifest.json') == accepted['selectedPack']['sha256']
donor, = donor_pack['families']['snow-civsfm']['members']
donor_file = donor_root / donor['path']
assert sha(donor_file) == donor['sha256'] == candidate['donorEntry']['sha256']
hd = read(donor_file)
assert hd['source']['sha256'] == source['sha256'] and len(hd['logical']['frames']) == 239
indices = {}
for frame, logical in zip(source['frames'][:239], hd['logical']['frames'], strict=True):
    assert frame['size'] == logical['trimSize'] and frame['origin'] == logical['trimOrigin']
    assert frame['slot'] == logical['nativeFrame'] and frame['empty'] == logical['empty']
    file = root / 'native' / frame['indexFile']
    assert sha(file) == frame['indexSha256']
    data = np.frombuffer(file.read_bytes(), np.uint8).reshape(frame['size'][::-1])
    used = np.unique(data[(data != 0) & ((data < 16) | (data > 31))])
    differing = [int(n) for n in used if not np.array_equal(a[n], b[n])]
    assert differing == ([254] if frame['slot'] in expected_frames else [])
    if differing:
        assert (data == 254).sum() == 1
        indices[frame['slot']] = data
gate_export = Path('.artifacts/m2-4/urban-gate-accepted-export-batch53-v1')
gate_reuse = read(gate_export / 'reuse-receipt.json')
assert gate_reuse['status'] == 'PASS_COMPLETE_ACCEPTED_FAMILY_REUSE_PAYLOAD_AND_MASKS'
gate_root = Path('.local/environment-packs') / gate_reuse['pack']['revision']
assert sha(gate_root / 'manifest.json') == gate_reuse['pack']['sha256']
contract = read(gate_export / 'contract.json')
pack = read(gate_root / 'manifest.json')
revision = 'urban-accepted-actors-m2-4-batch53-r2'
destination = Path('.local/environment-packs') / revision
assert not destination.exists() and not output.exists()
output.mkdir(); destination.mkdir()
for file in gate_root.rglob('*'):
    if file.is_file() and file != gate_root / 'manifest.json':
        target = destination / file.relative_to(gate_root)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(file, target)
for group in pack['families'].values():
    for member in group['members']:
        file = destination / member['path']; metadata = read(file)
        metadata['packRevision'] = revision
        file.write_text(encode(metadata)); member['sha256'] = sha(file)
directory = destination / 'members/civsfm-shp'
directory.mkdir(parents=True)
changes = []
for variant in hd['variants']:
    density = variant['density']
    assert density in (2, 4)
    for page in variant['pages']:
        old_base = donor_file.parent / str(density) / page['id'] / 'base.png'
        old_data = old_base.with_name('data.png')
        assert sha(old_base) == page['baseSha256'] and sha(old_data) == page['dataSha256']
        base = np.array(Image.open(old_base).convert('RGBA'))
        data = np.array(Image.open(old_data).convert('RGBA'))
        allowed = np.zeros(base.shape[:2], dtype=bool)
        for frame in variant['frames']:
            number = frame['nativeFrame']
            if number not in indices or frame['page'] != page['id']:
                continue
            x, y, w, h = frame['contentRect']
            assert [w, h] == [n * density for n in source['frames'][number]['size']]
            mask = (indices[number] == 254).repeat(density, 0).repeat(density, 1)
            assert not data[y:y+h, x:x+w, 0][mask].any()
            mask &= base[y:y+h, x:x+w, 3] > 0
            allowed[y:y+h, x:x+w] |= mask
            changes.append(dict(frame=number, density=density, paletteIndex=254,
                changedVisiblePixels=int(mask.sum()), nativePixelCount=1))
        before = base.copy()
        base[allowed, :3] = b[254].astype(np.uint8)
        assert np.array_equal(before[..., 3], base[..., 3]) and np.array_equal(before[~allowed], base[~allowed])
        target = directory / str(density) / page['id']; target.mkdir(parents=True)
        if allowed.any():
            Image.fromarray(base).save(target / 'base.png')
        else:
            shutil.copyfile(old_base, target / 'base.png')
        shutil.copyfile(old_data, target / 'data.png')
        assert sha(target / 'data.png') == page['dataSha256']
        page['baseSha256'], page['baseBytes'] = sha(target / 'base.png'), (target / 'base.png').stat().st_size
assert len(changes) == 10 and sum(c['changedVisiblePixels'] for c in changes) <= 100
family = 'urban-civsfm'
hd['source']['theater'] = 'URBAN'
hd['packId'], hd['packRevision'] = family, revision
hd.setdefault('authored', {})['urbanNativePaletteCorrection'] = dict(schema='native-fixed-palette-index-transition-v1',
    donorMetadataSha256=donor['sha256'], sourceSha256=source['sha256'], nativeIndex=254,
    sourcePaletteSha256=old['palette']['sha256'], targetPaletteSha256=source['palette']['sha256'],
    oldRgb=[0, 0, 252], newRgb=[112, 196, 52], changes=changes,
    policy='Only opaque base RGB within the five original index-254 cells changes. All other RGB, alpha, owner data, frame geometry and shadows remain exact accepted content; no new HD detail is claimed.')
metadata_file = directory / 'manifest.json'; metadata_file.write_text(encode(hd))
descriptor = copy.deepcopy(old); descriptor['palette'] = source['palette']
contract['sources']['civsfm.shp'] = descriptor
basis = dict(theater='URBAN', members={'civsfm.shp':descriptor}, identities=['CIVSFM'])
digest = hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
contract['families'][family] = dict(members=['civsfm.shp'], identities=['CIVSFM'], editions=['yr'],
    kinds=['infantry'], familyHash=digest)
contract['identities']['yr']['CIVSFM'] = family
pack['families'][family] = dict(familyHash=digest, members=[dict(member='civsfm.shp',
    path='members/civsfm-shp/manifest.json', sha256=sha(metadata_file))])
pack['revision'] = revision
(destination / 'manifest.json').write_text(encode(pack))
pointer = dict(schemaVersion=1, revision=revision, sha256=sha(destination / 'manifest.json'))
contract['selectedPack'] = pointer; contract['preparedSourceSha256'] = sha(source_file)
(output / 'contract.json').write_text(encode(contract))
receipt = dict(status='STATIC_ACCEPTED_GATE_AND_BOUNDED_ORIGINAL_PALETTE_ADAPTATION_NATIVE_PENDING',
    pack=pointer, nativeSource=dict(file=str(source_file), sha256=sha(source_file)),
    audit=dict(file=str(proof_file), sha256=sha(proof_file)), gateReuse=dict(file=str(gate_export / 'reuse-receipt.json'),
        sha256=sha(gate_export / 'reuse-receipt.json')), donorMetadata=dict(file=str(donor_file), sha256=donor['sha256']),
    changes=changes, logicalDensityFrames=520, newArt=False, windows='NOT_RUN')
(output / 'reuse-receipt.json').write_text(encode(receipt))
print(json.dumps(dict(pack=pointer, densityFrames=520, adaptedFrames=10,
    changedVisiblePixels=sum(c['changedVisiblePixels'] for c in changes))))
