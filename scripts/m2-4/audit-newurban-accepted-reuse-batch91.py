"""Verify every inherited sample and the two native semantic adapters independently."""
import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from newurban_batch89_io import crop, logical, pin, read, sha, write

ROOT = Path('.artifacts/m2-4/newurban-anchored-buildings-batch91-20261020')
export = read(ROOT / 'export-and-preservation-v2.json')
prep = read(ROOT / 'source-preparation-v2.json')
contract = read(ROOT / 'contract-candidate-v2.json')
baseline = read(ROOT / 'baseline-contract.json')
sources = {source['member']: source for source in read(ROOT / 'source.json')['sources']}
pack = Path('.local/environment-packs') / export['candidate']['revision']
assert sha(pack / 'manifest.json') == export['candidate']['sha256']
manifest = read(pack / 'manifest.json')
assert len(contract['families']) == len(baseline['families']) + 6 == 203
for key in ['sources', 'families']:
    assert all(contract[key][name] == value for name, value in baseline[key].items())
for edition in ['ra2', 'yr']:
    assert all(contract['identities'][edition][name] == value for name, value in baseline['identities'][edition].items())
for relative, digest in export['preservedPayloadHashes'].items():
    assert sha(pack / relative) == digest
for original in prep['originalFiles']:
    assert pin(Path(original['file'])) == original
out = ROOT / 'accepted-density-inspection-v2'
out.mkdir(exist_ok=False)
counts = dict(exact=0, oilShade=0, hospitalContact=0, empty=0, shadows=0, rubbleExact=0)
rows = []
for record in export['records']:
    source = sources[record['member']]
    donor = Path(record['donorMetadata']['file'])
    file = Path(record['metadata']['file'])
    assert pin(donor) == record['donorMetadata'] and pin(file) == record['metadata']
    metadata = read(file)
    assert re.fullmatch('[a-z0-9-]+', metadata['packId'])
    assert metadata['logical'] == dict(canvas=source['canvas'], frames=[logical(frame)
        for frame in source['frames'][:len(metadata['logical']['frames'])]])
    assert metadata['source'] == dict(member=source['member'], sha256=source['sha256'],
        theater='NEWURBAN', kind='resolved-shp-member')
    assert metadata['color']['acceptedArtworkRegistration']['newMothersUsed'] == 0
    count = len(metadata['logical']['frames'])
    counts['shadows'] += source['totalFrames'] - count
    assert sorted(variant['density'] for variant in metadata['variants']) == [2, 4]
    row = dict(member=source['member'], frames=[])
    for density in [2, 4]:
        variant, = [variant for variant in metadata['variants'] if variant['density'] == density]
        for page in variant['pages']:
            assert max(page['size']) <= 2048
            for role in ['base', 'data']:
                image_file = file.parent / str(density) / page['id'] / (role + '.png')
                assert sha(image_file) == page[role + 'Sha256']
                with Image.open(image_file) as image:
                    image.load()
                    assert list(image.size) == page['size']
        for slot in range(count):
            b, d = crop(file, slot, density), crop(file, slot, density, 'data')
            before_b, before_d = crop(donor, slot, density), crop(donor, slot, density, 'data')
            expected_b, expected_d = before_b.copy(), before_d.copy()
            mode = 'exact'
            if source['member'] == 'cnoild.shp' and slot in [1, 2]:
                region = expected_d[50 * density:51 * density, 46 * density:47 * density]
                region[..., 1][region[..., 0] > 0] = 14
                mode = 'oilShade'
            if source['member'] == 'cnhosp.shp' and slot == 0:
                frame = source['frames'][slot]
                indices = np.fromfile(ROOT / 'native' / frame['indexFile'], np.uint8).reshape(frame['size'][::-1])
                assert int((indices == 12).sum()) == 313
                mask = (indices == 12).repeat(density, 0).repeat(density, 1)
                expected_b[:mask.shape[0], :mask.shape[1]][mask] = [0, 0, 0, 255]
                expected_d[:mask.shape[0], :mask.shape[1]][mask] = [0, 0, 0, 255]
                mode = 'hospitalContact'
            assert np.array_equal(b, expected_b) and np.array_equal(d, expected_d), (source['member'], slot, density)
            assert d[..., 1].max(initial=0) <= 15 and not d[..., 2].any() and (d[..., 3] == 255).all()
            counts[mode] += 1
            if source['frames'][slot]['empty']:
                assert not b[..., 3].any()
                counts['empty'] += 1
            if not record['linked'] and slot == 3:
                assert np.array_equal(b, before_b) and np.array_equal(d, before_d)
                counts['rubbleExact'] += 1
            row['frames'].append(dict(slot=slot, density=density, mode=mode,
                changedRgbaSamples=int((b != before_b).any(2).sum()),
                changedAuxiliarySamples=int((d != before_d).any(2).sum())))
        if not record['linked']:
            for slot in [0, 3]:
                b = crop(file, slot, density)
                background = Image.new('RGBA', (b.shape[1], b.shape[0]), '#101820')
                background.alpha_composite(Image.fromarray(b))
                background.convert('RGB').save(out / f'{source["member"]}-{slot}-{density}x-hd.png')
    rows.append(row)
assert counts['exact'] == 354 and counts['oilShade'] == 4 and counts['hospitalContact'] == 2
assert counts['rubbleExact'] == 12 and sum(counts[key] for key in ['exact', 'oilShade', 'hospitalContact']) == 360
write(ROOT / 'static-audit-v2.json', dict(
    status='PASS_SIX_COMPLETE_FAMILIES_ALL_ACCEPTED_SAMPLES_AND_BOUNDED_NATIVE_SEMANTICS',
    candidate=export['candidate'], export=pin(ROOT / 'export-and-preservation-v2.json'), counts=counts,
    completeFamilies=6, sourceMembers=12, sourceDensitySlots=360, inheritedPriorFamilies=197,
    priorPayloadFiles=len(export['preservedPayloadHashes']), selectedNewMothers=0,
    inspectionFiles=[pin(file) for file in sorted(out.glob('*.png'))], rows=rows,
    decision=pin(ROOT / 'accepted-art-reuse-decision-v1.json'),
    newArtworkReview='NOT_REQUIRED_ACCEPTED_ART_REUSED_NATIVE_MAPPING_CHECK_PENDING',
    native='NOT_RUN', windows='NOT_RUN', m24Complete=False))
print(dict(status='PASS_STATIC_ACCEPTED_REUSE', families=6, members=12, counts=counts, newArtwork=0))
