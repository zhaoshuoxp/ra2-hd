"""Register newly painted bridge mothers to the complete unchanged Desert source family."""
import copy
import hashlib
import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_contours import register_contours

root = Path('.artifacts/m2-4/desert-low-bridge-continuous-r1-20261020')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
write = lambda p, data: p.write_text(json.dumps(data, indent=2) + '\n')
contract = read(root / 'baseline-contract.json')
baseline = contract['selectedPack']
base = Path('.local/environment-packs') / baseline['revision']
assert sha(base / 'manifest.json') == baseline['sha256']
manifest = read(base / 'manifest.json')
family = 'desert-bridge-low-wood'
revision = 'desert-environment-low-bridge-continuous-r1-v1-combined'
destination = Path('.local/environment-packs') / revision
destination.mkdir(exist_ok=False)
guide_file = Path('.artifacts/m2-4/desert-native-v1/source.json')
sources = {s['member']: s for s in read(guide_file)['sources']}
inputs = read(root / 'mother-inputs.json')
entries = {e['member']: e for e in manifest['families'][family]['members']}
old_member_dirs = {str(Path(e['path']).parent) for e in entries.values()}
preserved = {}
for file in base.rglob('*'):
    if not file.is_file() or file == base / 'manifest.json' or any(file.is_relative_to(base / d) for d in old_member_dirs):
        continue
    target = destination / file.relative_to(base)
    target.parent.mkdir(parents=True, exist_ok=True)
    os.link(file, target)
    assert sha(target) == sha(file)
    preserved[str(file.relative_to(base))] = sha(file)
assert len(preserved) == 682

masters, mother_evidence = {}, []
for panel in inputs['panels']:
    file = root / (panel['key'] + '-mother-v1.png')
    rgba = np.array(Image.open(file).convert('RGBA'))
    height, width = rgba.shape[:2]
    assert width % 2 == height % 2 == 0
    for tile in panel['tiles']:
        col, row = tile['tile']
        piece = rgba[row * height // 2:(row + 1) * height // 2,
                     col * width // 2:(col + 1) * width // 2].copy()
        # Generator halos and transparency are not game geometry. Only strongly
        # covered, connected material interiors supply RGB; native contours own alpha.
        labels, count = ndimage.label(piece[..., 3] >= 240)
        sizes = np.bincount(labels.ravel())
        keep = np.flatnonzero(sizes >= 16)
        keep = keep[keep != 0]
        valid = np.isin(labels, keep)
        assert valid.any()
        ys, xs = np.where(valid)
        box = [int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)]
        x0, y0, x1, y1 = box
        rgb, valid = piece[y0:y1, x0:x1, :3].copy(), valid[y0:y1, x0:x1]
        nearest = ndimage.distance_transform_edt(~valid, return_distances=False, return_indices=True)
        rgb[~valid] = rgb[tuple(nearest[:, ~valid])]
        masters[tile['member']] = dict(rgb=rgb, origin=tile['nativeOrigin'], size=tile['nativeSize'],
            mother=str(file), motherSha256=sha(file), quadrant=tile['tile'], interiorBox=box)
        mother_evidence.append({k: v for k, v in masters[tile['member']].items() if k != 'rgb'} | dict(member=tile['member']))

mapping = {n: 1 for n in range(1, 5)} | {n: 7 for n in range(5, 8)}
mapping.update({8: 8, 9: 9, **{n: 10 for n in range(10, 14)}, **{n: 16 for n in range(14, 17)}})
mapping.update({n: n for n in range(17, 27)})
assert set(mapping) == set(range(1, 27))
records, new_entries = [], []
for number in range(1, 27):
    name = f'lobrdg{number:02d}.des'
    entry, source = entries[name], sources[name]
    assert sha(base / entry['path']) == entry['sha256']
    assert sha(guide_file.parent / 'native' / source['nativeFile']) == source['sha256']
    assert source['hasShadow'] and not source['remapable'] and source['totalFrames'] == 6
    hd = read(base / entry['path'])
    assert hd['source']['sha256'] == source['sha256'] and len(hd['logical']['frames']) == 3
    master_name = f'lobrdg{mapping[number]:02d}.des'
    master = masters[master_name]
    directory = destination / 'members' / name.replace('.', '-')
    density_records = []
    for variant in hd['variants']:
        density = variant['density']
        assert density in [2, 4]
        pages = {}
        for page in variant['pages']:
            w, h = page['size']
            pages[page['id']] = [np.zeros((h, w, 4), np.uint8), np.zeros((h, w, 4), np.uint8)]
            pages[page['id']][1][..., 3] = 255
        for frame in variant['frames']:
            slot = frame['nativeFrame']
            native = source['frames'][slot]
            if native['empty']:
                assert frame['contentRect'][2:] == [0, 0]
                continue
            logical = hd['logical']['frames'][slot]
            assert logical['trimOrigin'] == native['origin'] and logical['trimSize'] == native['size']
            w, h = native['size']
            x, y, fw, fh = frame['contentRect']
            assert (fw, fh) == (w * density, h * density)
            indices_file = guide_file.parent / 'native' / native['indexFile']
            assert sha(indices_file) == native['indexSha256']
            indices = np.fromfile(indices_file, np.uint8).reshape(h, w)
            yy, xx = np.indices((fh, fw), dtype=float)
            mw, mh = master['size']
            ox, oy = native['origin']
            mx, my = master['origin']
            source_x = ((ox + (xx + .5) / density - mx) / mw) * master['rgb'].shape[1] - .5
            source_y = ((oy + (yy + .5) / density - my) / mh) * master['rgb'].shape[0] - .5
            rgb = np.stack([ndimage.map_coordinates(master['rgb'][..., c].astype(float),
                [source_y, source_x], order=1, mode='nearest') for c in range(3)], axis=-1)
            pixels = np.zeros((fh, fw, 4), np.uint8)
            pixels[..., :3] = np.uint8(np.clip(np.rint(rgb), 0, 255))
            pixels[..., 3] = (indices != 0).repeat(density, 0).repeat(density, 1) * 255
            data = np.zeros_like(pixels)
            data[..., 3] = 255
            pixels, data = register_contours(pixels, data, indices, density, False)
            assert not data[..., :2].any()
            base_page, data_page = pages[frame['page']]
            sx, sy, sw, sh = frame['sampleRect']
            assert (sx, sy) == (x, y)
            for page_pixels, content, alpha_padding in [(base_page, pixels, True), (data_page, data, False)]:
                padded = np.pad(content, ((2, sh - fh + 2), (2, sw - fw + 2), (0, 0)), mode='edge')
                if alpha_padding:
                    padded[..., 3] = 0
                    padded[2:2 + fh, 2:2 + fw] = content
                page_pixels[y - 2:y + sh + 2, x - 2:x + sw + 2] = padded
            density_records.append(dict(density=density, slot=slot, master=master_name,
                motherSha256=master['motherSha256'], nativeIndexSha256=native['indexSha256'],
                newMaterial='BUILT_IN_IMAGEGEN_REPAINT', nativeRgbUsed=False, nativeRgbCopiedPixels=0,
                alpha='TARGET_NATIVE_STRUCTURAL_SUBPIXEL', sourceSampleBounds=[float(source_x.min()),
                    float(source_y.min()), float(source_x.max()), float(source_y.max())]))
        for page in variant['pages']:
            folder = directory / str(density) / page['id']
            folder.mkdir(parents=True)
            for role, pixels in zip(['base', 'data'], pages[page['id']], strict=True):
                file = folder / (role + '.png')
                Image.fromarray(pixels).save(file)
                page[role + 'Sha256'], page[role + 'Bytes'] = sha(file), file.stat().st_size
    hd['packRevision'] = revision
    hd['color']['structuralCoverage'] = dict(schema='native-structural-subpixel-coverage-v1',
        toleranceNativePixels=.7, maximumContourAreaChangeFraction=.025)
    hd['authored']['desertContinuousBridgeR1'] = dict(master=master_name, mother=master['mother'],
        motherSha256=master['motherSha256'], imagegenJobsSha256=sha(root / 'imagegen-jobs.json'),
        nativeRgbUsed=False, policy='ALL_26_MEMBERS_REPAINTED_FROM_NEW_CONTINUOUS_HD_MOTHERS')
    write(directory / 'manifest.json', hd)
    new_entries.append(dict(member=name, path=str((directory / 'manifest.json').relative_to(destination)),
        sha256=sha(directory / 'manifest.json')))
    records.append(dict(member=name, sourceSha256=source['sha256'], originalMetadataSha256=entry['sha256'],
        metadataSha256=sha(directory / 'manifest.json'), master=master_name, densityFrames=density_records))
manifest['families'][family]['members'] = new_entries
manifest['revision'] = revision
write(destination / 'manifest.json', manifest)
pointer = dict(schemaVersion=1, revision=revision, sha256=sha(destination / 'manifest.json'))
contract['selectedPack'] = pointer
contract['extensions'] = dict(milestone='M2.4', baselineSelectedPack=baseline, correctedFamilies=[family],
    state='ALL_26_REPAINTED_STATIC_AND_MAC_VALIDATION_PENDING')
write(root / 'contract-candidate-v1.json', contract)
write(root / 'export-and-preservation-v1.json', dict(status='NEW_ART_EXPORTED_VALIDATION_PENDING', baseline=baseline,
    candidate=pointer, completeMembers=26, repaintedMembers=26, sourceBodySlots=78, nonemptyDensityFrames=52,
    motherEvidence=mother_evidence, memberRecords=records, preservedPayloadHashes=preserved,
    nativeRgbCopiedPixels=0, nativeSourceMapsChanged=False, nativeSourceArchivesChanged=False,
    sharedTemperateDonorChanged=False, preparedCoreChanged=False, native='NOT_RUN', visual='PENDING', windows='NOT_RUN', m24Complete=False))
print(json.dumps(dict(candidate=pointer, completeMembers=26, repaintedMembers=26, preservedFiles=len(preserved), selected=False)))
