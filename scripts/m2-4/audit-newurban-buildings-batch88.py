"""Independently check new family scope, native identity and accepted pixel preservation."""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path('.artifacts/m2-4/newurban-buildings-batch88-20261020')
PREP = Path('.artifacts/m2-4/newurban-building-references-batch88-v1')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)


def frame_pixels(file, density, number, role, sample=False):
    metadata = read(file)
    variant, = [v for v in metadata['variants'] if v['density'] == density]
    frame, = [f for f in variant['frames'] if f['nativeFrame'] == number]
    page, = [p for p in variant['pages'] if p['id'] == frame['page']]
    png = file.parent / str(density) / page['id'] / (role + '.png')
    assert sha(png) == page[role + 'Sha256']
    with Image.open(png) as image:
        assert list(image.size) == page['size'] and max(image.size) <= 2048
        image.load()
        rect = frame['sampleRect' if sample else 'contentRect']
        x, y, w, h = rect
        assert x >= 2 and y >= 2 and x + w + 2 <= image.width and y + h + 2 <= image.height
        return np.asarray(image.convert('RGBA'))[y:y + h, x:x + w].copy()


export = read(ROOT / 'export-and-preservation-v2.json')
prepared = read(PREP / 'source-preparation-v1.json')
guide = read(ROOT / 'source.json')
sources = {s['member']: s for s in guide['sources']}
contract = read(ROOT / 'contract-candidate-v2.json')
baseline = read(ROOT / 'baseline-contract.json')
pack_root = Path('.local/environment-packs') / export['candidate']['revision']
assert sha(pack_root / 'manifest.json') == export['candidate']['sha256']
pack = read(pack_root / 'manifest.json')
assert len(sources) == len(export['records']) == 39
assert len(contract['families']) == len(baseline['families']) + 39
assert len(pack['families']) == len(contract['families'])
for key in ['sources', 'families']:
    assert all(contract[key][name] == value for name, value in baseline[key].items())
for edition in ['ra2', 'yr']:
    assert all(contract['identities'][edition][name] == value
               for name, value in baseline['identities'][edition].items())
for relative, digest in export['preservedPayloadHashes'].items():
    assert sha(pack_root / relative) == digest
for original in prepared['originalFiles']:
    assert pin(Path(original['file'])) == original
out = ROOT / 'actual-density-atlas-v2'
out.mkdir(exist_ok=False)
rows, shadows, exact_body, authored, shared, unused, allocations = [], 0, 0, 0, 0, 0, {2: 0, 4: 0}
for row in export['records']:
    name, family = row['member'], row['family']
    source = sources[name]
    assert contract['sources'][name]['sha256'] == source['sha256'] == row['sourceSha256']
    assert sha(ROOT / 'native' / source['nativeFile']) == source['sha256']
    assert contract['families'][family]['members'] == [name]
    entry, = pack['families'][family]['members']
    file = pack_root / entry['path']
    assert sha(file) == entry['sha256'] == row['metadata']['sha256']
    metadata = read(file)
    assert metadata['source']['member'] == name and metadata['source']['theater'] == 'NEWURBAN'
    assert metadata['source']['sha256'] == source['sha256']
    assert metadata['logical']['canvas'] == source['canvas']
    assert len(metadata['logical']['frames']) == 4
    assert sorted(v['density'] for v in metadata['variants']) == [2, 4]
    for i, frame in enumerate(source['frames']):
        assert sha(ROOT / 'native' / frame['indexFile']) == frame['indexSha256']
        assert sha(ROOT / 'native' / frame['file']) == frame['rgbaSha256']
        if i >= 4:
            shadows += 1
            continue
        assert metadata['logical']['frames'][i] == dict(nativeFrame=i, trimOrigin=frame['origin'],
            trimSize=frame['size'], legacyRenderSize=[n + n % 2 for n in frame['size']], empty=frame['empty'])
    donor = Path(row['donorMetadata']['file'])
    assert pin(donor) == row['donorMetadata']
    frame = source['frames'][3]
    indices = np.fromfile(ROOT / 'native' / frame['indexFile'], np.uint8).reshape(frame['size'][::-1])
    pixels = []
    record, = [r for r in prepared['records'] if r['member'] == name]
    palette = np.fromfile(ROOT / 'native' / (record['rubblePalette']['sha256'] + '.pal'), np.uint8).reshape(256, 3).astype(np.uint16) * 4
    native = np.dstack((palette[indices].astype(np.uint8), (indices != 0).astype(np.uint8) * 255))
    audit = dict(member=name, identity=row['identity'], metadata=pin(file), frames=[])
    for density in [2, 4]:
        variant, = [v for v in metadata['variants'] if v['density'] == density]
        allocations[density] += sum(p['size'][0] * p['size'][1] * 8 for p in variant['pages'])
        for i in range(3):
            for role in ['base', 'data']:
                assert np.array_equal(frame_pixels(file, density, i, role, True),
                                      frame_pixels(donor, density, i, role, True)), (name, density, i, role)
            exact_body += 1
        b = frame_pixels(file, density, 3, 'base')
        pixels.append(b)
        if name == 'cnfarm02.shp':
            assert contract['sources'][name]['framePalettes']['3']['runtimeUsed'] is False
            assert source['nativeRules'].get('LeaveRubble', '').lower() != 'yes'
            assert source['sha256'] == read(donor)['source']['sha256']
            for role in ['base', 'data']:
                assert np.array_equal(frame_pixels(file, density, 3, role, True),
                                      frame_pixels(donor, density, 3, role, True))
            unused += 1
        elif name == 'cnnewy07.shp':
            shared_file = Path(row['acceptedRubbleDonor']['file'])
            assert pin(shared_file) == row['acceptedRubbleDonor']
            assert read(Path(row['rubbleAcceptance']['file']))['status'] == 'USER_ACCEPTED_NEWURBAN_RUBBLE_CONTINUOUS_R1'
            assert metadata['logical']['frames'][3]['trimOrigin'] == frame['origin']
            for role in ['base', 'data']:
                assert np.array_equal(frame_pixels(file, density, 3, role, True),
                                      frame_pixels(shared_file, density, 3, role, True))
            shared += 1
        else:
            assert row['availableDensity'] >= 4 and row['mother']['sha256'] == sha(Path(row['mother']['file']))
            if (indices == 12).any():
                assert name in {'cnmiam05.shp', 'cnmiam06.shp'}
                assert palette[12].tolist() == [0, 124, 244]
                evidence, = [f for f in row['frames'] if f['density'] == density]
                assert evidence['isoIndex12NativeBodyPixels'] == int((indices == 12).sum())
                assert evidence['nativeRgbCopiedPixels'] == 0 and evidence['separateNativeShadowSlotsUnchanged']
            data = frame_pixels(file, density, 3, 'data', True)
            assert not data[..., :3].any() and (data[..., 3] == 255).all()
            assert metadata['color']['structuralCoverage']['appliesToNativeFrames'] == [0, 1, 2]
            coverage = metadata['color']['authoredFrameCoverage']['3']
            assert coverage['logicalBounds'] == frame['size'] and coverage['nativeOrigin'] == frame['origin']
            assert coverage['sourceIndexSha256'] == frame['indexSha256']
            assert coverage['mother'] == row['mother']
            assert ((b[..., 3] > 0) & (b[..., 3] < 255)).any()
            assert not np.array_equal(b, np.repeat(np.repeat(native, density, axis=0), density, axis=1))
            native_mask = indices != 0
            coarse = np.asarray(Image.fromarray(b[..., 3]).resize(frame['size'], Image.Resampling.BOX)) >= 128
            iou = float((coarse & native_mask).sum() / (coarse | native_mask).sum())
            area_ratio = float(b[..., 3].sum() / 255 / density ** 2 / native_mask.sum())
            assert .65 <= area_ratio <= 1.5, (name, area_ratio)
            assert iou >= .65, (name, iou)
            authored += 1
            audit['frames'].append(dict(density=density, coarseFootprintIoU=iou, nativeAlphaAreaRatio=area_ratio,
                originalBodyRgbCopied=0, visibleIsoIndex12BodyPixels=int((indices == 12).sum()),
                originalBodyPixelAlphaRequired=False))
            hd_file = out / f'{name}-rubble-{density}x-hd.png'
            Image.fromarray(b).save(hd_file)
            Image.fromarray(native).resize(tuple(n * density for n in frame['size']), Image.Resampling.NEAREST).save(
                out / f'{name}-rubble-{density}x-original.png')
            canvas = Image.new('RGBA', tuple(b.shape[i] for i in [1, 0]), '#101820')
            canvas.alpha_composite(Image.fromarray(b))
            canvas.convert('RGB').save(out / f'{name}-rubble-{density}x-inspection.png')
        assert b.shape[:2] == tuple(n * density for n in frame['size'][::-1])
    if name not in {'cnfarm02.shp', 'cnnewy07.shp'}:
        assert not np.array_equal(pixels[1], np.repeat(np.repeat(pixels[0], 2, axis=0), 2, axis=1))
    rows.append(audit)
assert (exact_body, authored, shared, unused, shadows) == (234, 74, 2, 2, 156)
new_rows = [r for r in rows if r['frames']]
summary = Image.new('RGB', (1600, ((len(new_rows) + 3) // 4) * 235), '#101820')
draw = ImageDraw.Draw(summary)
for i, row in enumerate(new_rows):
    image = Image.open(out / f'{row["member"]}-rubble-4x-hd.png')
    image.thumbnail((380, 195), Image.Resampling.LANCZOS)
    x, y = (i % 4) * 400, (i // 4) * 235
    draw.text((x + 12, y + 8), row['identity'], fill='white', font_size=23)
    summary.paste(image, (x + (400 - image.width) // 2, y + 38), image)
summary_file = out / 'newurban-batch88-37-new-rubble-summary.png'
summary.save(summary_file)
result = dict(status='PASS_39_COMPLETE_FAMILIES_EXACT_ACCEPTED_REUSE_CONTINUOUS_AUTHORED_RUBBLE',
    export=pin(ROOT / 'export-and-preservation-v2.json'), candidate=export['candidate'],
    sourceGuide=pin(ROOT / 'source.json'), completeFamilies=39, totalBodyDensityFrames=312,
    exactAcceptedBodyDensityFrames=exact_body, newRubbleDensityFrames=authored,
    acceptedR1SharedRubbleDensityFrames=shared, nativeUnusedRubbleDensityFrames=unused,
    originalShadowSlots=shadows, unchangedPriorFamilies=len(baseline['families']),
    unchangedPriorPayloadFiles=len(export['preservedPayloadHashes']), originalFilePinsVerified=len(prepared['originalFiles']),
    minimumMotherDensity=min(r['availableDensity'] for r in export['motherRows']), newFamilyPageBytes=allocations,
    summary=pin(summary_file), records=rows, rawMapsArchivesChanged=False,
    native='NOT_RUN', visual='PENDING_37_NEW_RUBBLE_STUDIES', windows='NOT_RUN', m24Complete=False)
with (ROOT / 'static-audit-v2.json').open('x') as stream:
    stream.write(json.dumps(result, indent=2) + '\n')
print(json.dumps({k: result[k] for k in ['status', 'completeFamilies', 'exactAcceptedBodyDensityFrames',
    'newRubbleDensityFrames', 'minimumMotherDensity', 'unchangedPriorPayloadFiles', 'summary']}))
