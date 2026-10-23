"""Independently check changed pixel scope, source identity, slots and complete density payloads."""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path('.artifacts/m2-4/newurban-rubble-continuous-r1-20261020')
GUIDE = Path('.artifacts/m2-4/newurban-building-rubble-native-batch87-v1')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
export = read(ROOT / 'export-and-preservation-v2.json')
base = Path('.local/environment-packs') / export['baseline']['revision']
pack = Path('.local/environment-packs') / export['candidate']['revision']
assert sha(base / 'manifest.json') == export['baseline']['sha256']
assert sha(pack / 'manifest.json') == export['candidate']['sha256']
before, after = read(base / 'manifest.json'), read(pack / 'manifest.json')
assert set(before['families']) == set(after['families']) and len(after['families']) == 136
assert len(export['preservedPayloadHashes']) == 895
for relative, digest in export['preservedPayloadHashes'].items():
    assert sha(base / relative) == sha(pack / relative) == digest
sources = {s['member']: s for s in read(GUIDE / 'source.json')['sources']}
assert len(sources) == 20
for source in sources.values():
    assert sha(GUIDE / 'native' / source['nativeFile']) == source['sha256']
    assert sha(GUIDE / 'native' / (source['palette']['sha256'] + '.pal')) == source['palette']['sha256']
    for frame in source['frames']:
        assert sha(GUIDE / 'native' / frame['file']) == frame['rgbaSha256']
        assert sha(GUIDE / 'native' / frame['indexFile']) == frame['indexSha256']

out = ROOT / 'actual-density-atlas-v2'
out.mkdir(exist_ok=False)
summary = Image.new('RGB', (2200, 1450), '#111b24')
draw = ImageDraw.Draw(summary)
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 25)
checks, rubble_pixels, body_count, atlas_rows = [], {}, 0, []
families = {row['family'] for row in export['records']}
assert len(families) == 20
assert sum(before['families'][key] == after['families'][key] for key in before['families']) == 116
summary_index = 0
for record in export['records']:
    name, family = record['member'], record['family']
    source = sources[name]
    old_entry, = before['families'][family]['members']
    entry, = after['families'][family]['members']
    old_file, file = base / old_entry['path'], pack / entry['path']
    assert sha(old_file) == old_entry['sha256'] and sha(file) == entry['sha256']
    old, new = read(old_file), read(file)
    assert new['source'] == old['source'] and new['logical'] == old['logical']
    assert new['source']['sha256'] == source['sha256']
    assert new['authored']['newurbanRubbleContinuousR1']['changedNativeBodySlots'] == [3]
    assert new['color']['structuralCoverage']['appliesToNativeFrames'] == [0, 1, 2]
    coverage = new['color']['authoredFrameCoverage']['3']
    assert coverage['sourceIndexSha256'] == source['frames'][3]['indexSha256']
    assert coverage['nativeOrigin'] == source['frames'][3]['origin']
    assert coverage['logicalBounds'] == source['frames'][3]['size']
    assert coverage['alphaCutoff'] == 180
    ratios = []
    for variant, old_variant in zip(new['variants'], old['variants'], strict=True):
        density = variant['density']
        assert density == old_variant['density'] and density in [2, 4]
        assert variant['frames'] == old_variant['frames']
        page_images, old_images = {}, {}
        rubble_frame, = [frame for frame in variant['frames'] if frame['nativeFrame'] == 3]
        for page, old_page in zip(variant['pages'], old_variant['pages'], strict=True):
            assert page['size'] == old_page['size'] and page['id'] == old_page['id']
            for role in ['base', 'data']:
                png = file.parent / str(density) / page['id'] / (role + '.png')
                old_png = old_file.parent / str(density) / page['id'] / (role + '.png')
                assert sha(png) == page[role + 'Sha256'] and png.stat().st_size == page[role + 'Bytes']
                pixels, old_pixels = np.array(Image.open(png).convert('RGBA')), np.array(Image.open(old_png).convert('RGBA'))
                assert pixels.shape == old_pixels.shape == (*reversed(page['size']), 4)
                if role == 'data' or page['id'] != rubble_frame['page']:
                    assert np.array_equal(pixels, old_pixels)
                else:
                    allowed = np.zeros(pixels.shape[:2], bool)
                    x, y, w, h = rubble_frame['sampleRect']
                    allowed[y - 2:y + h + 2, x - 2:x + w + 2] = True
                    assert np.array_equal(pixels[~allowed], old_pixels[~allowed])
                    assert not pixels[y - 2:y, x - 2:x + w + 2, 3].any()
                    assert not pixels[y + h:y + h + 2, x - 2:x + w + 2, 3].any()
                page_images[page['id'], role], old_images[page['id'], role] = pixels, old_pixels
        for region in variant['frames']:
            x, y, width, height = region['contentRect']
            current = page_images[region['page'], 'base'][y:y + height, x:x + width]
            previous = old_images[region['page'], 'base'][y:y + height, x:x + width]
            if region['nativeFrame'] < 3:
                assert np.array_equal(current, previous)
                body_count += 1
                continue
            native_frame = source['frames'][3]
            indices = np.fromfile(GUIDE / 'native' / native_frame['indexFile'], np.uint8).reshape(native_frame['size'][::-1])
            assert not (indices == 12).any()
            data = page_images[region['page'], 'data'][y:y + height, x:x + width]
            assert not data[..., :3].any() and (data[..., 3] == 255).all()
            assert not np.array_equal(current[..., :3], previous[..., :3])
            assert not np.array_equal(current[..., 3], previous[..., 3])
            assert ((current[..., 3] > 0) & (current[..., 3] < 255)).any()
            ratio = float(current[..., 3].sum() / 255 / density ** 2 / (indices != 0).sum())
            assert .8 <= ratio <= 1.25, (name, density, ratio)
            coarse_alpha = current[..., 3].reshape(indices.shape[0], density, indices.shape[1], density).mean((1, 3))
            support = coarse_alpha > 128
            native_support = indices != 0
            iou = float((support & native_support).sum() / (support | native_support).sum())
            assert iou >= .65, (name, density, iou)
            ratios.append(ratio)
            rubble_pixels[name, density] = current.copy()
            background = Image.new('RGBA', (width, height), (24, 31, 38, 255))
            background.alpha_composite(Image.fromarray(current))
            atlas_file = out / f'{name}-rubble-{density}x-r1.png'
            background.convert('RGB').save(atlas_file)
            atlas_rows.append(dict(**pin(atlas_file), density=density, member=name, size=[width, height]))
            checks.append(dict(member=name, density=density, slot=3, nativeAlphaAreaRatio=ratio,
                nativeCoarseFootprintIoU=iou, fractionalAuthoredAlpha=True, originalLogicalFrameExact=True,
                nativeOwnerAndContactDataExact=True, originalShadowSourceExact=True))
        assert max(ratios) - min(ratios) < .015
    if name != 'cnnewy08.shp':
        image = Image.open(out / f'{name}-rubble-4x-r1.png')
        image.thumbnail((400, 235), Image.Resampling.LANCZOS)
        left, top = (summary_index % 5) * 440, (summary_index // 5) * 290
        draw.text((left + 14, top + 10), next(
            binding['id'] for binding in source['bindings'] if binding['role'] == 'body'), font=font, fill='white')
        summary.paste(image, (left + (440 - image.width) // 2, top + 48 + (235 - image.height) // 2))
        summary_index += 1
assert summary_index == 19 and body_count == 120 and len(checks) == 40
assert all(np.array_equal(rubble_pixels['cnnewy06.shp', d], rubble_pixels['cnnewy08.shp', d]) for d in [2, 4])
summary_file = out / 'newurban-rubble-r1-summary.png'
summary.save(summary_file)
result = dict(status='PASS_COMPLETE_FAMILIES_CHANGED_RUBBLE_SCOPE_AND_AUTHORED_VISUAL_COVERAGE',
    candidate=export['candidate'], sourceGuide=pin(GUIDE / 'source.json'), checks=checks,
    exactAcceptedBodyDensityFrames=body_count, correctedRubbleDensityFrames=40,
    sourceMembers=20, untouchedNativeShadowSlots=80, unchangedOtherFamilies=116,
    exactInheritedPayloadFiles=895, sharedRubblePair='cnnewy06.shp and cnnewy08.shp',
    atlas=atlas_rows, summary=pin(summary_file),
    visualContract='Only rubble slot 3 uses continuous authored coverage within the exact original logical frame. Source coarse-alpha pixel artifacts are intentionally superseded by user feedback. All original rules, geometry, shadow sources and other states remain unchanged.',
    failedNativeMaskPrototype=pin(ROOT / 'probe-v1/registration-v1.json'),
    motherMinimumDensity=min(row['availableDensity'] for row in export['motherRows']),
    visualAcceptance='PENDING_ALL_19_CORRECTED_STUDIES', native='NOT_RUN', windows='NOT_RUN', m24Complete=False)
with (ROOT / 'static-audit-v2.json').open('x') as stream:
    stream.write(json.dumps(result, indent=2) + '\n')
print(json.dumps(dict(status=result['status'], exactAcceptedBodyFrames=body_count,
    correctedRubbleFrames=40, minimumFootprintIoU=min(row['nativeCoarseFootprintIoU'] for row in checks))))
