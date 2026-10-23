"""Independently verify native frames, exact linked payloads and continuous new material."""
import hashlib
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from newurban_batch89_io import ROOT, crop, logical, pin, read, sha, write

version = 'v2' if '--version=2' in sys.argv else 'v1'
export = read(ROOT / f'export-and-preservation-{version}.json')
prep = read(ROOT / 'source-preparation-v2.json')
sources = {s['member']: s for s in read(ROOT / 'source.json')['sources']}
contract = read(ROOT / f'contract-candidate-{version}.json')
baseline = read(ROOT / 'baseline-contract.json')
pack_root = Path('.local/environment-packs') / export['candidate']['revision']
assert sha(pack_root / 'manifest.json') == export['candidate']['sha256']
manifest = read(pack_root / 'manifest.json')
assert len(sources) == 14 and len(contract['families']) == len(baseline['families']) + 12 == 187
for key in ['sources', 'families']:
    assert all(contract[key][name] == value for name, value in baseline[key].items())
for edition in ['ra2', 'yr']:
    assert all(contract['identities'][edition][name] == value
        for name, value in baseline['identities'][edition].items())
for relative, digest in export['preservedPayloadHashes'].items():
    assert sha(pack_root / relative) == digest
for file in prep['originalFiles']:
    assert pin(Path(file['file'])) == file
out = ROOT / f'actual-density-atlas-{version}'
out.mkdir(exist_ok=False)
counts = dict(exact=0, semantic=0, authored=0, empty=0, shadows=0)
allocations = {2: 0, 4: 0}
rows = []
for row in export['records']:
    source = sources[row['member']]
    file = Path(row['metadata']['file'])
    assert pin(file) == row['metadata']
    metadata = read(file)
    assert re.fullmatch('[a-z0-9-]+', metadata['packId'])
    assert re.fullmatch('[a-zA-Z0-9.-]+', metadata['packRevision'])
    descriptor = contract['sources'][row['member']]
    assert descriptor['sha256'] == source['sha256'] == metadata['source']['sha256']
    assert metadata['source']['theater'] == 'NEWURBAN'
    frames = source['frames'][:descriptor['bodyFrames']]
    assert metadata['logical'] == dict(canvas=source['canvas'], frames=[logical(f) for f in frames])
    assert sorted(v['density'] for v in metadata['variants']) == [2, 4]
    assert contract['identities']['yr'][row['identity']] == row['family']
    assert row['member'] in contract['families'][row['family']]['members']
    entry, = [e for e in manifest['families'][row['family']]['members'] if e['member'] == row['member']]
    assert entry['sha256'] == sha(file)
    donor = Path(row['donorMetadata']['file'])
    assert pin(donor) == row['donorMetadata']
    for frame in source['frames']:
        assert sha(ROOT / 'native' / frame['indexFile']) == frame['indexSha256']
        assert sha(ROOT / 'native' / frame['file']) == frame['rgbaSha256']
    counts['shadows'] += row['originalShadowSlots']
    audit = dict(member=row['member'], identity=row['identity'], metadata=pin(file), frames=[])
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
        for slot in row['exactAcceptedSlots'] + row.get('semanticAcceptedSlots', []):
            for role in ['base', 'data']:
                assert np.array_equal(crop(file, slot, density, role), crop(donor, slot, density, role))
            counts['exact' if slot in row['exactAcceptedSlots'] else 'semantic'] += 1
            if frames[slot]['empty']:
                counts['empty'] += 1
                assert crop(file, slot, density).size == 0
        if row['linked']:
            for variant in metadata['variants']:
                for page in variant['pages']:
                    for role in ['base', 'data']:
                        relative = Path(str(variant['density'])) / page['id'] / (role + '.png')
                        assert sha(file.parent / relative) == sha(donor.parent / relative)
            continue
        frame = source['frames'][3]
        indices = np.fromfile(ROOT / 'native' / frame['indexFile'], np.uint8).reshape(frame['size'][::-1])
        record, = [r for r in prep['records'] if r['member'] == row['member']]
        palette = np.fromfile(ROOT / 'native' / (record['rubblePalette']['sha256'] + '.pal'), np.uint8)
        palette = palette.reshape(256, 3).astype(np.uint16) * 4
        native = np.dstack((palette[indices].astype(np.uint8), (indices != 0).astype(np.uint8) * 255))
        w, h = frame['size']
        b = crop(file, 3, density)[:h * density, :w * density]
        data = crop(file, 3, density, 'data')
        assert not data[..., :3].any() and (data[..., 3] == 255).all()
        assert ((b[..., 3] > 0) & (b[..., 3] < 255)).any()
        assert row['availableDensity'] >= 4 and pin(Path(row['mother']['file'])) == row['mother']
        coverage = metadata['color']['authoredFrameCoverage']['3']
        assert coverage['logicalBounds'] == frame['size'] and coverage['nativeOrigin'] == frame['origin']
        assert coverage['sourceIndexSha256'] == frame['indexSha256']
        evidence, = [f for f in row['frames'] if f['density'] == density]
        assert evidence['originalRgbPixelsCopied'] == 0 and evidence['oldBodyMaskAppliedToRgb'] is False
        # Independent uniform RGB registration check, including newly covered native holes.
        master = Image.open(row['mother']['file']).convert('RGBA')
        mx, my, mw, mh = row['motherRect']
        # Registration includes component-aware edge extrusion, pinned in motherRows.
        from newurban_rubble_r1_materials import register_subjects
        job, = [j for j in read(ROOT / 'imagegen-jobs-v2.json')['jobs'] if row['member'] in j['members']]
        material = register_subjects(master, len(job['members']))[job['members'].index(row['member'])]
        assert material['rect'] == row['motherRect']
        from showcase_registration import independently_sample
        left, top, right, bottom = record['rubbleBounds']
        sampled = independently_sample(material['plate'], ((right - left) * density, (bottom - top) * density))
        expected = np.uint8(np.clip(sampled.astype(float) * np.array(evidence['gain']), 0, 255))
        assert np.array_equal(b[top * density:bottom * density, left * density:right * density, :3], expected)
        assert np.array_equal(b[top * density:bottom * density, left * density:right * density, 3], np.asarray(
            material['alpha'].resize((expected.shape[1], expected.shape[0]), Image.Resampling.LANCZOS)))
        coarse = np.asarray(Image.fromarray(b[..., 3]).resize((w, h), Image.Resampling.BOX)) >= 128
        native_mask = indices != 0
        iou = float((coarse & native_mask).sum() / (coarse | native_mask).sum())
        ratio = float(b[..., 3].sum() / 255 / density ** 2 / native_mask.sum())
        assert iou >= .65 and .65 <= ratio <= 1.5, (row['member'], density, iou, ratio)
        assert not np.array_equal(b, native.repeat(density, 0).repeat(density, 1))
        for suffix, array in [('hd', b), ('original', native.repeat(density, 0).repeat(density, 1))]:
            Image.fromarray(array).save(out / f'{row["member"]}-rubble-{density}x-{suffix}.png')
        audit['frames'].append(dict(density=density, coarseFootprintIoU=iou, nativeAlphaAreaRatio=ratio,
            oldPixelMaskAppliedToRgb=False, originalRgbPixelsCopied=0))
        counts['authored'] += 1
    if not row['linked']:
        two = np.array(Image.open(out / f'{row["member"]}-rubble-2x-hd.png'))
        four = np.array(Image.open(out / f'{row["member"]}-rubble-4x-hd.png'))
        assert not np.array_equal(four, two.repeat(2, 0).repeat(2, 1))
    rows.append(audit)
assert counts == dict(exact=222, semantic=4, authored=24, empty=32, shadows=93), counts
summary = Image.new('RGB', (1600, 3 * 270), '#101820')
draw = ImageDraw.Draw(summary)
body = [row for row in export['records'] if not row['linked']]
for i, row in enumerate(body):
    image = Image.open(out / f'{row["member"]}-rubble-4x-hd.png')
    image.thumbnail((380, 220), Image.Resampling.LANCZOS)
    x, y = i % 4 * 400, i // 4 * 270
    draw.text((x + 10, y + 8), row['identity'], fill='white', font_size=24)
    summary.paste(image, (x + (400 - image.width) // 2, y + 40), image)
summary_file = out / 'newurban-batch89-twelve-new-rubble-summary.png'
summary.save(summary_file)
for density in [2, 4]:
    row, = [r for r in export['records'] if r['member'] == 'cnstl05d.shp']
    Image.fromarray(crop(row['metadata']['file'], 1, density)).save(out / f'stadium-d-damaged-{density}x-hd.png')
    source = sources['cnstl05d.shp']
    frame = source['frames'][1]
    indices = np.fromfile(ROOT / 'native' / frame['indexFile'], np.uint8).reshape(frame['size'][::-1])
    palette = np.fromfile(ROOT / 'native' / (source['palette']['sha256'] + '.pal'), np.uint8)
    palette = palette.reshape(256, 3).astype(np.uint16) * 4
    native = np.dstack((palette[indices].astype(np.uint8), (indices != 0).astype(np.uint8) * 255))
    Image.fromarray(native.repeat(density, 0).repeat(density, 1)).save(out / f'stadium-d-damaged-{density}x-original.png')
write(ROOT / f'static-audit-{version}.json', dict(status='PASS_TWELVE_COMPLETE_FAMILIES_LINKED_PIXEL_PRESERVATION_AND_CONTINUOUS_RUBBLE',
    export=pin(ROOT / f'export-and-preservation-{version}.json'), candidate=export['candidate'],
    completeFamilies=12, sourceMembers=14, counts=counts, allNewFrameAllocationBytes=allocations,
    unchangedPriorFamilies=175, preservedPayloadFiles=len(export['preservedPayloadHashes']),
    summary=pin(summary_file), semanticAdaptation=pin(ROOT / 'stadium-d-semantic-reuse-v1.json'), rows=rows,
    minimumMotherDensity=min(r['availableDensity'] for r in export['motherRows']),
    native='NOT_RUN', visual='PENDING', windows='NOT_RUN', m24Complete=False))
print(counts, allocations)
