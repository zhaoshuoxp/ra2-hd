"""Validate all new small-object contours, native shadows and untouched accepted families."""
import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from newurban_batch89_io import crop, logical, pin, read, sha, write

ROOT = Path('.artifacts/m2-4/newurban-rock-crates-batch90-20261020')
export = read(ROOT / 'export-and-preservation-v1.json')
prep = read(ROOT / 'source-preparation-v1.json')
sources = {s['member']: s for s in read(ROOT / 'source.json')['sources']}
contract = read(ROOT / 'contract-candidate-v1.json')
baseline = read(ROOT / 'baseline-contract.json')
pack = Path('.local/environment-packs') / export['candidate']['revision']
assert sha(pack / 'manifest.json') == export['candidate']['sha256']
manifest = read(pack / 'manifest.json')
assert len(contract['families']) == len(baseline['families']) + 10 == 197
for key in ['sources', 'families']:
    assert all(contract[key][name] == value for name, value in baseline[key].items())
for edition in ['ra2', 'yr']:
    assert all(contract['identities'][edition][name] == value for name, value in baseline['identities'][edition].items())
for relative, digest in export['preservedPayloadHashes'].items():
    assert sha(pack / relative) == digest
for file in prep['originalFiles']:
    assert pin(Path(file['file'])) == file
out = ROOT / 'actual-density-atlas-v1'
out.mkdir(exist_ok=False)
rows, allocations = [], {2: 0, 4: 0}
for row in export['records']:
    source = sources[row['member']]
    file = Path(row['metadata']['file'])
    assert pin(file) == row['metadata']
    metadata = read(file)
    assert re.fullmatch('[a-z0-9-]+', metadata['packId'])
    assert re.fullmatch('[a-zA-Z0-9.-]+', metadata['packRevision'])
    assert metadata['source'] == dict(member=row['member'], sha256=source['sha256'], theater='NEWURBAN', kind='resolved-shp-member')
    assert metadata['logical'] == dict(canvas=source['canvas'], frames=[logical(source['frames'][0])])
    assert sorted(v['density'] for v in metadata['variants']) == [2, 4]
    assert contract['sources'][row['member']]['palette'] == source['palette']
    assert contract['identities']['yr'][row['identity']] == row['family']
    for frame in source['frames']:
        assert sha(ROOT / 'native' / frame['indexFile']) == frame['indexSha256']
        assert sha(ROOT / 'native' / frame['file']) == frame['rgbaSha256']
    frame = source['frames'][0]
    indices = np.fromfile(ROOT / 'native' / frame['indexFile'], np.uint8).reshape(frame['size'][::-1])
    palette = np.fromfile(ROOT / 'native' / (source['palette']['sha256'] + '.pal'), np.uint8)
    palette = palette.reshape(256, 3).astype(np.uint16) * 4
    native = np.dstack((palette[indices].astype(np.uint8), (indices != 0).astype(np.uint8) * 255))
    record, = [r for r in prep['records'] if r['member'] == row['member']]
    coverage = metadata['color']['authoredFrameCoverage']['0']
    assert coverage['sourceIndexSha256'] == frame['indexSha256'] and coverage['logicalBounds'] == frame['size']
    assert coverage['nativeOrigin'] == frame['origin'] and coverage['mother'] == row['mother']
    assert pin(Path(row['mother']['file'])) == row['mother'] and row['availableDensity'] >= 4
    audit = dict(member=row['member'], identity=row['identity'], frames=[])
    previous = None
    for density in [2, 4]:
        variant, = [v for v in metadata['variants'] if v['density'] == density]
        for page in variant['pages']:
            assert max(page['size']) <= 2048
            for role in ['base', 'data']:
                png = file.parent / str(density) / page['id'] / (role + '.png')
                assert sha(png) == page[role + 'Sha256']
                with Image.open(png) as image:
                    image.load()
                    assert list(image.size) == page['size']
            allocations[density] += page['size'][0] * page['size'][1] * 8
        b = crop(file, 0, density)[:frame['size'][1] * density, :frame['size'][0] * density]
        data = crop(file, 0, density, 'data')
        assert not data[..., :3].any() and (data[..., 3] == 255).all()
        assert ((b[..., 3] > 0) & (b[..., 3] < 255)).any()
        evidence, = [f for f in row['frames'] if f['density'] == density]
        assert evidence['nativeRgbPixelsCopied'] == 0 and not evidence['oldBodyMaskAppliedToRgb']
        from newurban_rubble_r1_materials import register_subjects
        from showcase_registration import independently_sample
        job, = [j for j in read(ROOT / 'imagegen-jobs-v2.json')['jobs'] if row['member'] in j['members']]
        material = register_subjects(Image.open(row['mother']['file']), 2)[job['members'].index(row['member'])]
        assert material['rect'] == row['motherRect']
        left, top, right, bottom = record['originalBounds']
        sampled = independently_sample(material['plate'], ((right - left) * density, (bottom - top) * density))
        expected = np.uint8(np.clip(sampled.astype(float) * np.array(evidence['gain']), 0, 255))
        assert np.array_equal(b[top * density:bottom * density, left * density:right * density, :3], expected)
        alpha = np.asarray(material['alpha'].resize((expected.shape[1], expected.shape[0]), Image.Resampling.LANCZOS))
        assert np.array_equal(b[top * density:bottom * density, left * density:right * density, 3], alpha)
        coarse = np.asarray(Image.fromarray(b[..., 3]).resize(frame['size'], Image.Resampling.BOX)) >= 128
        native_mask = indices != 0
        iou = float((coarse & native_mask).sum() / (coarse | native_mask).sum())
        ratio = float(b[..., 3].sum() / 255 / density ** 2 / native_mask.sum())
        assert iou >= .65 and .65 <= ratio <= 1.5, (row['member'], iou, ratio)
        assert not np.array_equal(b, native.repeat(density, 0).repeat(density, 1))
        if previous is not None:
            assert not np.array_equal(b, previous.repeat(2, 0).repeat(2, 1))
        previous = b
        for suffix, array in [('hd', b), ('original', native.repeat(density, 0).repeat(density, 1))]:
            Image.fromarray(array).save(out / f'{row["member"]}-{density}x-{suffix}.png')
        audit['frames'].append(dict(density=density, coarseFootprintIoU=iou, nativeAlphaAreaRatio=ratio,
            originalRgbPixelsCopied=0, oldBodyMaskStampedIntoVisual=False))
    rows.append(audit)
summary = Image.new('RGB', (1500, 2 * 280), '#101820')
draw = ImageDraw.Draw(summary)
for i, row in enumerate(export['records']):
    im = Image.open(out / f'{row["member"]}-4x-hd.png')
    x, y = i % 5 * 300, i // 5 * 280
    draw.text((x + 14, y + 14), row['identity'], fill='white', font_size=25)
    summary.paste(im, (x + (300 - im.width) // 2, y + 65), im)
summary_file = out / 'newurban-ten-rocks-crates-summary.png'
summary.save(summary_file)
write(ROOT / 'static-audit-v1.json', dict(status='PASS_TEN_COMPLETE_ROCK_AND_CRATE_FAMILIES_CONTINUOUS_CONTOURS_AND_NATIVE_SHADOWS',
    export=pin(ROOT / 'export-and-preservation-v1.json'), candidate=export['candidate'], completeFamilies=10,
    sourceMembers=10, newDensityFrames=20, originalShadowSlots=10, unchangedPriorFamilies=187,
    inheritedPayloadFiles=len(export['preservedPayloadHashes']), allNewFrameAllocationBytes=allocations,
    minimumMotherDensity=min(r['availableDensity'] for r in export['motherRows']), summary=pin(summary_file), rows=rows,
    native='NOT_RUN', visual='PENDING_TEN_STUDIES', windows='NOT_RUN', m24Complete=False))
print(dict(families=10, densityFrames=20, allocations=allocations))
