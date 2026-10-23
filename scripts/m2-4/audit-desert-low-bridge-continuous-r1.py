"""Independently verify repainted complete-family payloads and preserved native behavior."""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_contours import register_contours

root = Path('.artifacts/m2-4/desert-low-bridge-continuous-r1-20261020')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
encode = lambda value: json.dumps(value, indent=2) + '\n'
baseline = read(root / 'baseline-contract.json')
contract = read(root / 'contract-candidate-v1.json')
export = read(root / 'export-and-preservation-v1.json')
family = 'desert-bridge-low-wood'
base = Path('.local/environment-packs') / baseline['selectedPack']['revision']
pack = Path('.local/environment-packs') / contract['selectedPack']['revision']
assert sha(pack / 'manifest.json') == contract['selectedPack']['sha256']
manifest, old_manifest = read(pack / 'manifest.json'), read(base / 'manifest.json')
assert set(manifest['families']) == set(old_manifest['families'])
for key in ['sources', 'families', 'identities', 'aliases']:
    assert contract[key] == baseline[key], key
for key, declaration in old_manifest['families'].items():
    if key != family:
        assert manifest['families'][key] == declaration
for relative, digest in export['preservedPayloadHashes'].items():
    assert sha(pack / relative) == digest
assert len(export['preservedPayloadHashes']) == 682
guide_file = Path('.artifacts/m2-4/desert-native-v1/source.json')
guide = read(guide_file)
sources = {s['member']: s for s in guide['sources']}
old_entries = {e['member']: e for e in old_manifest['families'][family]['members']}
metrics, count, changed_pages = [], 0, 0
for entry in manifest['families'][family]['members']:
    name, file = entry['member'], pack / entry['path']
    old_file = base / old_entries[name]['path']
    hd, old = read(file), read(old_file)
    assert sha(file) == entry['sha256']
    assert hd['source'] == old['source'] and hd['logical'] == old['logical']
    assert hd['source']['sha256'] == sources[name]['sha256']
    assert sha(guide_file.parent / 'native' / sources[name]['nativeFile']) == sources[name]['sha256']
    assert hd['authored']['desertContinuousBridgeR1']['nativeRgbUsed'] is False
    assert {v['density'] for v in hd['variants']} == {2, 4}
    for variant in hd['variants']:
        density = variant['density']
        old_variant, = [v for v in old['variants'] if v['density'] == density]
        assert variant['frames'] == old_variant['frames']
        pages, old_pages = {}, {}
        for page in variant['pages']:
            pair, old_pair = [], []
            for role in ['base', 'data']:
                path = file.parent / str(density) / page['id'] / (role + '.png')
                before_path = old_file.parent / str(density) / page['id'] / (role + '.png')
                assert sha(path) == page[role + 'Sha256'] and path.stat().st_size == page[role + 'Bytes']
                pixels = np.array(Image.open(path).convert('RGBA'))
                before = np.array(Image.open(before_path).convert('RGBA'))
                assert pixels.shape == before.shape and list(pixels.shape[1::-1]) == page['size']
                assert max(page['size']) <= 8192
                if role == 'data':
                    assert not pixels[..., :3].any() and (pixels[..., 3] == 255).all()
                else:
                    assert sha(path) != sha(before_path), name
                    changed_pages += 1
                pair.append(pixels)
                old_pair.append(before)
            pages[page['id']], old_pages[page['id']] = pair, old_pair
        for frame in variant['frames']:
            slot = frame['nativeFrame']
            source = sources[name]['frames'][slot]
            if source['empty']:
                assert frame['contentRect'][2:] == [0, 0]
                continue
            x, y, w, h = frame['contentRect']
            base_page, data_page = pages[frame['page']]
            piece, data = base_page[y:y + h, x:x + w], data_page[y:y + h, x:x + w]
            index_file = guide_file.parent / 'native' / source['indexFile']
            assert sha(index_file) == source['indexSha256']
            indices = np.fromfile(index_file, np.uint8).reshape(*source['size'][::-1])
            expected, _ = register_contours(piece.copy(), data.copy(), indices, density, False)
            np.testing.assert_array_equal(piece[..., 3], expected[..., 3])
            # Diagnostic only: edge-eroded wood grain contrast excludes contour,
            # plank gaps and broad metal highlights. Visual judgment remains open.
            before = old_pages[frame['page']][0][y:y + h, x:x + w]
            valid = (piece[..., 3] == 255) & (before[..., 3] == 255)
            red, green, blue = [piece[..., c].astype(float) for c in range(3)]
            wood = valid & (red > green * 1.12) & (green > blue * 1.1) & (red < 150)
            from scipy.ndimage import binary_erosion, uniform_filter
            wood = binary_erosion(wood, iterations=max(1, density // 2))
            def detail(rgb):
                luma = rgb[..., :3].astype(float) @ np.array([.2126, .7152, .0722])
                return float(np.abs(luma - uniform_filter(luma, size=density * 2 + 1))[wood].mean()) if wood.any() else None
            metrics.append(dict(member=name, density=density, woodPixels=int(wood.sum()),
                beforeLocalContrast=detail(before), afterLocalContrast=detail(piece),
                diagnostic='Not a perceptual quality score; actual source and gameplay comparison is required'))
            count += 1
assert count == changed_pages == 52
for master in export['motherEvidence']:
    assert sha(Path(master['mother'])) == master['motherSha256']
result = dict(status='PASS_ALL_26_REPAINTED_MEMBERS_COMPLETE_2X_4X_AND_NATIVE_GEOMETRY',
    candidate=contract['selectedPack'], family=family, repaintedMembers=26, changedBasePages=52,
    nonemptyDensityFrames=count, preservedPayloadFiles=682, sourceContractsUnchanged=True,
    logicalGeometryUnchanged=True, sourceShadowsUnchanged=True, nativeRgbCopiedPixels=0,
    visualDiagnostics=metrics, visualAcceptance='PENDING_ALL_26_CORRECTED_MEMBERS',
    native='PENDING', windows='NOT_RUN', m24Complete=False)
with (root / 'static-audit-v1.json').open('x') as stream:
    stream.write(encode(result))
if '--select' in sys.argv:
    selected = Path('desktop/environment-desert-hd-contract.json')
    selector = Path('.local/environment-desert-selection.json')
    assert read(selected) == baseline and read(selector) == baseline['selectedPack']
    selected.write_text(encode(contract))
    selector.write_text(encode(contract['selectedPack']))
print(json.dumps(dict(status=result['status'], candidate=result['candidate'], changedPages=52, preserved=682)))
