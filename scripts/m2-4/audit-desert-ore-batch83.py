"""Validate all original ore slots, new HD pages and the unchanged selected baseline."""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_contours import register_contours

root = Path('.artifacts/m2-4/desert-ore-batch83-20261020')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
encode = lambda value: json.dumps(value, indent=2) + '\n'
export = read(root / 'export-and-preservation-v1.json')
baseline, contract = read(root / 'baseline-contract.json'), read(root / 'contract-candidate-v1.json')
pack = Path('.local/environment-packs') / contract['selectedPack']['revision']
base = Path('.local/environment-packs') / baseline['selectedPack']['revision']
assert sha(pack / 'manifest.json') == contract['selectedPack']['sha256']
manifest, old_manifest = read(pack / 'manifest.json'), read(base / 'manifest.json')
family = 'desert-ore'
assert set(manifest['families']) - set(old_manifest['families']) == {family}
for key in ['sources', 'families', 'aliases']:
    assert all(contract[key][k] == value for k, value in baseline[key].items())
for edition, table in baseline['identities'].items():
    assert all(contract['identities'][edition][k] == value for k, value in table.items())
for key, value in old_manifest['families'].items():
    assert manifest['families'][key] == value
for relative, digest in export['preservedPayloadHashes'].items():
    assert sha(pack / relative) == digest
assert len(export['preservedPayloadHashes']) == 812
guide_file = Path('.artifacts/m2-4/desert-native-v1/source.json')
sources = {s['member']: s for s in read(guide_file)['sources']}
body_slots, density_slots, pages_checked = 0, 0, 0
records = []
for entry in manifest['families'][family]['members']:
    file, source = pack / entry['path'], sources[entry['member']]
    assert sha(file) == entry['sha256']
    assert sha(guide_file.parent / 'native' / source['nativeFile']) == source['sha256']
    hd = read(file)
    assert hd['source']['sha256'] == source['sha256'] == contract['sources'][entry['member']]['sha256']
    count = source['totalFrames'] // 2
    assert len(hd['logical']['frames']) == contract['sources'][entry['member']]['bodyFrames'] == count
    assert hd['logical']['canvas'] == source['canvas']
    assert {v['density'] for v in hd['variants']} == {2, 4}
    body_slots += count
    for logical, native in zip(hd['logical']['frames'], source['frames'][:count], strict=True):
        assert logical['nativeFrame'] == native['slot'] and logical['trimOrigin'] == native['origin']
        assert logical['trimSize'] == native['size'] and logical['empty'] == native['empty']
        assert logical['legacyRenderSize'] == [n + n % 2 for n in native['size']]
    for variant in hd['variants']:
        density, decoded = variant['density'], {}
        for page in variant['pages']:
            images = []
            for role in ['base', 'data']:
                path = file.parent / str(density) / page['id'] / (role + '.png')
                assert sha(path) == page[role + 'Sha256'] and path.stat().st_size == page[role + 'Bytes']
                pixels = np.array(Image.open(path).convert('RGBA'))
                assert list(pixels.shape[1::-1]) == page['size'] and max(page['size']) <= 8192
                if role == 'data':
                    assert not pixels[..., :3].any() and (pixels[..., 3] == 255).all()
                images.append(pixels)
                pages_checked += 1
            decoded[page['id']] = images
        seen = set()
        for frame in variant['frames']:
            slot = frame['nativeFrame']
            assert slot not in seen
            seen.add(slot)
            native = source['frames'][slot]
            base_page, data_page = decoded[frame['page']]
            x, y, w, h = frame['contentRect']
            sx, sy, sw, sh = frame['sampleRect']
            assert (sx, sy) == (x, y)
            assert x >= 2 and y >= 2 and x + sw + 2 <= base_page.shape[1] and y + sh + 2 <= base_page.shape[0]
            assert [w, h] == [n * density for n in native['size']]
            indices_file = guide_file.parent / 'native' / native['indexFile']
            assert sha(indices_file) == native['indexSha256']
            indices = np.fromfile(indices_file, np.uint8).reshape(*native['size'][::-1])
            piece, data = base_page[y:y + h, x:x + w], data_page[y:y + h, x:x + w]
            expected, _ = register_contours(piece.copy(), data.copy(), indices, density, False)
            np.testing.assert_array_equal(piece[..., 3], expected[..., 3])
            active = piece[..., 3] > 0
            rgb = piece[..., :3][active].astype(float)
            assert not ((rgb[:, 0] > rgb[:, 1] * 2) | (rgb[:, 2] > rgb[:, 0] * 1.4)).any(), 'Chromatic fringe leaked into material'
            density_slots += 1
        assert seen == set(range(count))
    records.append(dict(member=entry['member'], bodyFrames=count, originalShadowFrames=count,
        preservedExtraBodyFrame=12 if count == 13 else None, sourceSha256=source['sha256'], metadataSha256=entry['sha256']))
assert body_slots == 148 and density_slots == 296 and pages_checked == 48
source_cap_file = Path('src/game/gameobject/trait/TiberiumTrait.ts')
assert 'static maxBails: number = 11;' in source_cap_file.read_text()
for mother in export['motherEvidence']:
    assert sha(Path(mother['mother'])) == mother['motherSha256']
result = dict(status='PASS_12_MEMBERS_ALL_148_ORIGINAL_BODY_SLOTS_BOTH_DENSITIES',
    candidate=contract['selectedPack'], members=12, identities=24, bodyFrames=148, densityFrames=296,
    originalShadowFrames=148, decodedPages=48, preservedPayloads=812, memberRecords=records,
    standardMaximumFrame=11, originalExtraBodyFrames=export['originalExtraBodySlots'],
    nativeCapSource=dict(file=str(source_cap_file), sha256=sha(source_cap_file)),
    extraFramePolicy='Preserve complete source range; no synthetic growth level, forced frame or map edit.',
    nativeRgbPixelCopy=False, nativeColorStatisticsOnly=True, gameplayChanged=False,
    corePreparedChanged=False, native='PENDING', visual='PENDING', windows='NOT_RUN', m24Complete=False)
with (root / 'static-audit-v1.json').open('x') as stream:
    stream.write(encode(result))
if '--select' in sys.argv:
    selected, selector = Path('desktop/environment-desert-hd-contract.json'), Path('.local/environment-desert-selection.json')
    assert read(selected) == baseline and read(selector) == baseline['selectedPack']
    selected.write_text(encode(contract))
    selector.write_text(encode(contract['selectedPack']))
print(json.dumps(dict(status=result['status'], candidate=result['candidate'], densityFrames=density_slots, preservedFiles=812)))
