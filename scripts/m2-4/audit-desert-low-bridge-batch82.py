"""Verify complete source closure, exact reuse, broken-end masks and prior resources."""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_contours import register_contours

root = Path('.artifacts/m2-4/desert-low-bridge-batch82-20261019')
version = 2
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
encode = lambda value: json.dumps(value, indent=2) + '\n'
export = read(root / f'export-and-preservation-v{version}.json')
contract = read(root / f'contract-candidate-v{version}.json')
baseline = read(root / 'baseline-contract.json')
pack = Path('.local/environment-packs') / export['candidate']['revision']
assert sha(pack / 'manifest.json') == export['candidate']['sha256']
manifest = read(pack / 'manifest.json')
guide_path = Path(export['guide']['file'])
assert sha(guide_path) == export['guide']['sha256']
sources = {s['member']: s for s in read(guide_path)['sources']}
old_contract = read(Path(export['donorContract']['file']))
assert sha(Path(export['donorContract']['file'])) == export['donorContract']['sha256']
donor = Path('.local/environment-packs') / old_contract['selectedPack']['revision']
donor_entries = {e['member']: e for e in read(donor / 'manifest.json')['families']['environment-lobrdg']['members']}
family = 'desert-bridge-low-wood'
assert set(contract['families']) - set(baseline['families']) == {family}
assert len(contract['families'][family]['members']) == 26
for key in ['sources', 'families', 'aliases']:
    assert all(contract[key][k] == value for k, value in baseline[key].items())
for edition, table in baseline['identities'].items():
    assert all(contract['identities'][edition][k] == value for k, value in table.items())
for relative, digest in export['preservedPayloadHashes'].items():
    assert sha(pack / relative) == digest
records, copied_pages, density_frames = [], 0, 0
for entry in manifest['families'][family]['members']:
    name = entry['member']
    source = sources[name]
    record, = [r for r in export['records'] if r['member'] == name]
    file = pack / entry['path']
    assert sha(file) == entry['sha256']
    hd = read(file)
    old_entry = donor_entries[record['donorMember']]
    old_file = donor / old_entry['path']
    assert sha(old_file) == record['donorMetadataSha256']
    old = read(old_file)
    assert hd['source']['member'] == name and hd['source']['theater'] == 'DESERT'
    assert hd['source']['sha256'] == source['sha256'] == contract['sources'][name]['sha256']
    assert hd['logical']['canvas'] == source['canvas']
    assert [v['density'] for v in hd['variants']] == [2, 4]
    for slot, frame in enumerate(hd['logical']['frames']):
        original = source['frames'][slot]
        assert frame['nativeFrame'] == slot and frame['trimOrigin'] == original['origin']
        assert frame['trimSize'] == original['size'] and frame['empty'] == original['empty']
        assert frame['legacyRenderSize'] == [n + n % 2 for n in original['size']]
    for variant in hd['variants']:
        density = variant['density']
        pages = {}
        for page in variant['pages']:
            assert max(page['size']) <= 8192
            pair = []
            for role in ['base', 'data']:
                page_file = file.parent / str(density) / page['id'] / (role + '.png')
                assert sha(page_file) == page[role + 'Sha256']
                assert page_file.stat().st_size == page[role + 'Bytes']
                pixels = np.array(Image.open(page_file).convert('RGBA'))
                assert list(pixels.shape[1::-1]) == page['size']
                pair.append(pixels)
                if role == 'data':
                    assert (pixels[..., 3] == 255).all() and not pixels[..., 2].any()
                if not record['adapted']:
                    old_page = old_file.parent / str(density) / page['id'] / (role + '.png')
                    assert sha(old_page) == sha(page_file)
                    copied_pages += 1
            pages[page['id']] = pair
        for frame in variant['frames']:
            slot = frame['nativeFrame']
            native = source['frames'][slot]
            if native['empty']:
                assert frame['contentRect'][2:] == [0, 0]
                continue
            base, data = pages[frame['page']]
            x, y, w, h = frame['contentRect']
            sx, sy, sw, sh = frame['sampleRect']
            assert (sx, sy) == (x, y) and w == native['size'][0] * density and h == native['size'][1] * density
            assert x >= 2 and y >= 2 and x + sw + 2 <= base.shape[1] and y + sh + 2 <= base.shape[0]
            content, owner = base[y:y + h, x:x + w].copy(), data[y:y + h, x:x + w].copy()
            assert not owner[..., :2].any()
            if record['adapted']:
                index_file = guide_path.parent / 'native' / native['indexFile']
                assert sha(index_file) == native['indexSha256']
                indices = np.fromfile(index_file, np.uint8).reshape(*native['size'][::-1])
                expected, _ = register_contours(content.copy(), owner.copy(), indices, density, False)
                np.testing.assert_array_equal(content[..., 3], expected[..., 3])
            density_frames += 1
    records.append(dict(member=name, adapted=record['adapted'], sourceSha256=source['sha256'], metadataSha256=entry['sha256']))
assert len(records) == 26 and sum(r['adapted'] for r in records) == 4
assert copied_pages == 88
receipt = dict(status='PASS_COMPLETE_26_MEMBERS_BOTH_DENSITIES_AND_SOURCE_GEOMETRY', candidate=export['candidate'],
    exactAcceptedMembers=22, adaptedBrokenEnds=4, unchangedAcceptedPngs=copied_pages,
    nonemptyDensityFrames=density_frames, preservedPayloads=len(export['preservedPayloadHashes']), members=records,
    sourceMapChanges=False, sourceArchiveChanges=False, corePreparedChanges=False,
    preparedPolicy='Environment RGBA pages are read and validated by the selected complete family loader; no core prepared alias or relabel.',
    native='PENDING', visual='PENDING_FOUR_ADAPTED_BROKEN_ENDS_ONLY', windows='NOT_RUN', m24Complete=False)
with (root / f'static-audit-v{version}.json').open('x') as stream:
    stream.write(encode(receipt))
if '--select' in sys.argv:
    selected_file = Path('desktop/environment-desert-hd-contract.json')
    selector = Path('.local/environment-desert-selection.json')
    prior = read(selected_file)
    assert prior in [baseline, read(root / 'contract-candidate-v1.json')]
    assert read(selector) == prior['selectedPack']
    selected_file.write_text(encode(contract))
    selector.write_text(encode(contract['selectedPack']))
print(json.dumps({k: v for k, v in receipt.items() if k != 'members'}))
