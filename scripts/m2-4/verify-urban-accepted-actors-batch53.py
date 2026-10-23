"""Prove every accepted pixel and the bounded native index-254 color transition."""
import copy
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
root = Path('.artifacts/m2-4/urban-accepted-actors-native-batch53-v1')
export = Path('.artifacts/m2-4/urban-accepted-actors-export-batch53-v2')
receipt_file = export / 'reuse-receipt.json'; receipt = read(receipt_file)
contract_file = export / 'contract.json'; contract = read(contract_file)
source = {s['member']:s for s in read(root / 'source.json')['sources']}
assert sha(root / 'source.json') == contract['preparedSourceSha256'] == receipt['nativeSource']['sha256']
pack_root = Path('.local/environment-packs') / receipt['pack']['revision']
assert sha(pack_root / 'manifest.json') == receipt['pack']['sha256']
pack = read(pack_root / 'manifest.json')
old = read(Path('desktop/environment-snow-hd-contract.json'))
donor_root = Path('.local/environment-packs') / old['selectedPack']['revision']
assert sha(donor_root / 'manifest.json') == old['selectedPack']['sha256']
donor_pack = read(donor_root / 'manifest.json')
counts = dict(families=0, members=0, densityFrames=0, adaptedDensityFrames=0, changedRgbPixels=0)
expected_files = {'manifest.json'}
for family, group in pack['families'].items():
    declaration = contract['families'][family]
    assert len(group['members']) == 1
    basis = dict(theater='URBAN', members={n:contract['sources'][n] for n in declaration['members']},
        identities=declaration['identities'])
    digest = hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    assert declaration['familyHash'] == group['familyHash'] == digest
    member, = group['members']; name = member['member']
    donor_name = {'gugate_a.shp':'gagate_a.shp', 'civsfm.shp':'civsfm.shp'}[name]
    donor, = [m for f in donor_pack['families'].values() for m in f['members'] if m['member'] == donor_name]
    file, before_file = pack_root / member['path'], donor_root / donor['path']
    assert sha(file) == member['sha256'] and sha(before_file) == donor['sha256']
    hd, before = read(file), read(before_file)
    assert source[name]['sha256'] == before['source']['sha256'] == hd['source']['sha256']
    assert sha(root / 'native' / source[name]['nativeFile']) == source[name]['sha256']
    expected = copy.deepcopy(before)
    expected['source']['member'], expected['source']['theater'] = name, 'URBAN'
    expected['packId'], expected['packRevision'] = family, pack['revision']
    if name == 'civsfm.shp':
        correction = hd['authored']['urbanNativePaletteCorrection']
        assert correction['nativeIndex'] == 254 and correction['sourceSha256'] == source[name]['sha256']
        assert correction['oldRgb'] == [0, 0, 252] and correction['newRgb'] == [112, 196, 52]
        expected.setdefault('authored', {})['urbanNativePaletteCorrection'] = correction
    for vi, variant in enumerate(hd['variants']):
        density = variant['density']; assert density in [2, 4]
        counts['densityFrames'] += len(variant['frames'])
        for pi, page in enumerate(variant['pages']):
            old_page = before['variants'][vi]['pages'][pi]
            old_base = before_file.parent / str(density) / page['id'] / 'base.png'
            target_base = file.parent / str(density) / page['id'] / 'base.png'
            target_data = target_base.with_name('data.png')
            assert sha(old_base) == old_page['baseSha256']
            actual = np.array(Image.open(target_base).convert('RGBA'))
            desired = np.array(Image.open(old_base).convert('RGBA'))
            allowed = np.zeros(desired.shape[:2], dtype=bool)
            if name == 'civsfm.shp':
                for frame in variant['frames']:
                    number = frame['nativeFrame']
                    if frame['page'] != page['id'] or number not in [90, 96, 128, 130, 132]:
                        continue
                    native = source[name]['frames'][number]
                    indices_file = root / 'native' / native['indexFile']
                    assert sha(indices_file) == native['indexSha256']
                    indices = np.frombuffer(indices_file.read_bytes(), np.uint8).reshape(native['size'][::-1])
                    assert (indices == 254).sum() == 1
                    x, y, w, h = frame['contentRect']
                    mask = (indices == 254).repeat(density, 0).repeat(density, 1)
                    mask &= desired[y:y+h, x:x+w, 3] > 0
                    allowed[y:y+h, x:x+w] |= mask
                    counts['adaptedDensityFrames'] += 1
                desired[allowed, :3] = [112, 196, 52]
            assert np.array_equal(actual, desired), (name, density, page['id'], 'Unexpected RGB or coverage change')
            assert sha(target_data) == sha(old_base.with_name('data.png')) == page['dataSha256']
            assert sha(target_base) == page['baseSha256']
            if not allowed.any():
                assert sha(target_base) == sha(old_base)
            counts['changedRgbPixels'] += int(allowed.sum())
            expected['variants'][vi]['pages'][pi]['baseSha256'] = sha(target_base)
            expected['variants'][vi]['pages'][pi]['baseBytes'] = target_base.stat().st_size
            expected_files.update(str(p.relative_to(pack_root)) for p in [target_base, target_data])
    assert hd == expected, 'Only declared source labels, palette adaptation and pack identity may change.'
    expected_files.add(member['path']); counts['families'] += 1; counts['members'] += 1
assert counts['families'] == counts['members'] == 2 and counts['densityFrames'] == 520
assert counts['adaptedDensityFrames'] == 10 and 0 < counts['changedRgbPixels'] <= 100
assert expected_files == {str(p.relative_to(pack_root)) for p in pack_root.rglob('*') if p.is_file()}
report = dict(status='PASS_COMPLETE_ACCEPTED_ACTORS_AND_BOUNDED_NATIVE_PALETTE_ADAPTATION',
    pack=str(pack_root), sha256=sha(pack_root / 'manifest.json'), contractSha256=sha(contract_file),
    sourceSha256=sha(root / 'source.json'), reuseReceiptSha256=sha(receipt_file), counts=counts,
    exactDensityFrames=510, newArt=False, runtime='NOT_RUN', windows='NOT_RUN')
with (export / 'verification-v1.json').open('x') as stream:
    stream.write(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
