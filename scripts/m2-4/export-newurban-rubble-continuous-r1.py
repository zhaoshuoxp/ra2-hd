"""Replace only reopened rubble material and visual coverage in complete source families."""
import copy
import hashlib
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image

from newurban_rubble_r1_materials import register_rubble, register_subjects
from showcase_registration import capacity

ROOT = Path('.artifacts/m2-4/newurban-rubble-continuous-r1-20261020')
GUIDE = Path('.artifacts/m2-4/newurban-building-rubble-native-batch87-v1')
REVISION = 'newurban-environment-rubble-continuous-r1-v2-combined'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)


def write(file, value):
    with file.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


contract = read(ROOT / 'baseline-contract.json')
baseline = contract['selectedPack']
assert baseline == read(Path('.local/environment-newurban-selection.json'))
assert baseline['sha256'] == '3481d855362fef34c90337213ddeecd7c81f4305f1bafa52f2e87b92aa23bbc0'
base = Path('.local/environment-packs') / baseline['revision']
assert sha(base / 'manifest.json') == baseline['sha256']
manifest = read(base / 'manifest.json')
sources = {source['member']: source for source in read(GUIDE / 'source.json')['sources']}
work = read(ROOT / 'worklist.json')
jobs = read(ROOT / 'imagegen-jobs-v2.json')['jobs']
members = {entry['member']: (family, entry) for family, declaration in manifest['families'].items()
           for entry in declaration['members'] if entry['member'] in sources}
assert len(members) == len(sources) == 20
masters, mother_rows = {}, []
for job in jobs:
    file = Path(job['destination'])
    receipt = read(ROOT / job.get('receiptFile', job['id'] + '-output-v1.json'))
    assert receipt['mode'] == 'BUILT_IN_IMAGEGEN' and receipt['request'] == job['request']
    assert sha(file) == receipt['sha256']
    assert sha(Path(job['oldMaster']['file'])) == job['oldMaster']['sha256']
    assert sha(Path(job['originalReference']['file'])) == job['originalReference']['sha256']
    image = Image.open(file).convert('RGBA')
    assert image.getchannel('A').getextrema() == (0, 255)
    materials = register_subjects(image, len(job['members']))
    for key, material in zip(job['members'], materials, strict=True):
        info = work['slots'][key]
        rect, plate = material['rect'], material['plate']
        available = capacity(rect, info['nativeBounds'])
        assert available >= 4, (key, available)
        masters[info['member']] = dict(plate=plate, alpha=material['alpha'],
            mother=pin(file), motherRect=rect, availableDensity=available, key=key)
        mother_rows.append(dict(key=key, mother=pin(file), actualSize=list(image.size), rect=rect,
            nativeBounds=info['nativeBounds'], availableDensity=available,
            subjectComponents=material['subjectComponents'], dominantComponents=material['dominantComponents'],
            registeredBodyPixels=material['registeredBodyPixels']))
assert len(masters) == 19
assert sources['cnnewy06.shp']['frames'][3]['size'] == sources['cnnewy08.shp']['frames'][3]['size']
assert sources['cnnewy06.shp']['frames'][3]['indexSha256'] == sources['cnnewy08.shp']['frames'][3]['indexSha256']
masters['cnnewy08.shp'] = masters['cnnewy06.shp']

changed = set()
for name, (family, entry) in members.items():
    assert contract['families'][family]['members'] == [name]
    metadata_file = base / entry['path']
    assert sha(metadata_file) == entry['sha256']
    metadata = read(metadata_file)
    changed.add(entry['path'])
    for variant in metadata['variants']:
        frame, = [frame for frame in variant['frames'] if frame['nativeFrame'] == 3]
        changed.add(str(Path(entry['path']).parent / str(variant['density']) / frame['page'] / 'base.png'))
destination = Path('.local/environment-packs') / REVISION
destination.mkdir(exist_ok=False)
preserved = {}
for file in sorted(base.rglob('*')):
    if not file.is_file() or file == base / 'manifest.json':
        continue
    relative = str(file.relative_to(base))
    if relative not in changed:
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        os.link(file, target)
        preserved[relative] = sha(file)

records = []
for name, (family, entry) in members.items():
    source = sources[name]
    frame = source['frames'][3]
    metadata = read(base / entry['path'])
    assert metadata['source']['sha256'] == source['sha256']
    assert sha(GUIDE / 'native' / source['nativeFile']) == source['sha256']
    assert metadata['logical']['frames'][3]['trimSize'] == frame['size']
    index_file = GUIDE / 'native' / frame['indexFile']
    assert sha(index_file) == frame['indexSha256']
    indices = np.fromfile(index_file, np.uint8).reshape(frame['size'][::-1])
    descriptor = contract['sources'][name]['framePalettes']['3']
    assert descriptor['remapable'] is False and descriptor['role'] == 'rubble'
    palette_file = GUIDE / 'native' / (descriptor['sha256'] + '.pal')
    assert sha(palette_file) == descriptor['sha256']
    palette = np.fromfile(palette_file, np.uint8).reshape(256, 3).astype(np.uint16) * 4
    master = masters[name]
    info = work['slots'][master['key']]
    row = dict(member=name, family=family, sourceSha256=source['sha256'], originalIndexSha256=frame['indexSha256'],
        mother=master['mother'], motherRect=master['motherRect'], availableDensity=master['availableDensity'],
        canonicalMember='cnnewy06.shp' if name == 'cnnewy08.shp' else name, frames=[])
    for variant in metadata['variants']:
        density = variant['density']
        region, = [region for region in variant['frames'] if region['nativeFrame'] == 3]
        page, = [page for page in variant['pages'] if page['id'] == region['page']]
        old_file = (base / entry['path']).parent / str(density) / region['page'] / 'base.png'
        pixels = np.array(Image.open(old_file).convert('RGBA'))
        x, y, width, height = region['contentRect']
        assert [width, height] == [value * density for value in frame['size']]
        rgba, evidence = register_rubble(master['plate'], indices, info['nativeBounds'], density,
            palette, master['alpha'])
        assert evidence['coverage'] == 'AUTHORED_CONTINUOUS_RUBBLE_WITHIN_UNCHANGED_NATIVE_LOGICAL_BOUNDS'
        assert not (indices == 12).any()
        sx, sy, sample_width, sample_height = region['sampleRect']
        assert (sx, sy) == (x, y)
        padded = np.pad(rgba, ((2, sample_height - height + 2), (2, sample_width - width + 2), (0, 0)), mode='edge')
        padded[..., 3] = 0
        padded[2:height + 2, 2:width + 2] = rgba
        pixels[y - 2:y + sample_height + 2, x - 2:x + sample_width + 2] = padded
        file = destination / old_file.relative_to(base)
        file.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(pixels).save(file)
        page['baseSha256'], page['baseBytes'] = sha(file), file.stat().st_size
        variant['nativeFrameToneEvidence']['3'] = evidence['tone']
        # These measurements disclose the intentional visual-contour correction;
        # original simulation/picking/shadow geometry still uses untouched source data.
        native_area = int((indices != 0).sum())
        ratio = float(rgba[..., 3].sum() / 255 / density ** 2 / native_area)
        row['frames'].append(dict(density=density, slot=3, output=pin(file),
            nativeAlphaAreaRatio=ratio, nativeBodyPixels=native_area,
            authoredAlphaPixels=float(rgba[..., 3].sum() / 255), **evidence))
    metadata['packRevision'] = REVISION
    metadata['color']['structuralCoverage']['appliesToNativeFrames'] = [0, 1, 2]
    metadata['color']['authoredFrameCoverage'] = {'3': dict(schema='registered-authored-sprite-coverage-v1',
        sourceSha256=source['sha256'], sourceIndexSha256=frame['indexSha256'], mother=master['mother'],
        logicalBounds=frame['size'], nativeOrigin=frame['origin'], alphaCutoff=180,
        pixelMaskPolicy='Visual continuous shape from the new builtin mother; original coarse pixel cutouts are not retained.',
        unchanged='Native logical bounds, transforms, original collision/picking/shadow and gameplay data.')}
    metadata.setdefault('authored', {})['newurbanRubbleContinuousR1'] = dict(mother=master['mother'],
        motherRect=master['motherRect'], minimumDensity=master['availableDensity'],
        nativeRgbCopiedPixels=0, changedNativeBodySlots=[3], exactAcceptedSlotsPreserved=[0, 1, 2],
        feedback=pin(ROOT / 'user-feedback-20261020.json'))
    target = destination / entry['path']
    target.parent.mkdir(parents=True, exist_ok=True)
    write(target, metadata)
    manifest['families'][family]['members'] = [dict(member=name, path=entry['path'], sha256=sha(target))]
    records.append(row)
manifest['revision'] = REVISION
write(destination / 'manifest.json', manifest)
candidate = dict(schemaVersion=1, revision=REVISION, sha256=sha(destination / 'manifest.json'))
candidate_contract = copy.deepcopy(contract)
candidate_contract['selectedPack'] = candidate
candidate_contract['extensions']['batch87RubbleContinuousR1'] = dict(baseline=baseline,
    correctedFamilies=sorted(family for family, _ in members.values()), changedNativeBodySlots=[3],
    state='STATIC_EXPORT_NATIVE_AND_VISUAL_PENDING')
write(ROOT / 'contract-candidate-v2.json', candidate_contract)
result = dict(status='ALL_19_REPAINTED_20_COMPLETE_FAMILIES_EXPORTED_NOT_SELECTED',
    baseline=baseline, candidate=candidate, sourceGuide=pin(GUIDE / 'source.json'),
    sourceContract=pin(GUIDE / 'contract.json'), motherRows=mother_rows, records=records,
    completeFamilies=20, uniqueNewMothers=10, uniqueRubbleStudies=19, densityFramesChanged=40,
    acceptedBodyDensityFramesPreserved=120, unaffectedCompleteFamilies=116,
    preservedPayloadHashes=preserved, changedPayloadFiles=sorted(changed),
    rawSourceMapsChanged=False, rawSourceArchivesChanged=False, preparedCoreChanged=False,
    visualCoverage='User-requested continuous rubble shape within unchanged logical frame. Source pixel-alpha cutouts are intentionally superseded only for the 20 reopened rubble slots.',
    failedPrototype='probe-v1 retains the unsuccessful new-RGB/native-pixel-contour attempt; probe-v2 demonstrates why authored visual coverage is necessary.',
    native='NOT_RUN', visual='PENDING_CORRECTED_19_STUDIES', windows='NOT_RUN', m24Complete=False)
write(ROOT / 'export-and-preservation-v2.json', result)
print(json.dumps(dict(candidate=candidate, repaintedFamilies=20, studies=19,
    preservedPayloadFiles=len(preserved), changedPayloadFiles=len(changed),
    minimumMotherDensity=min(row['availableDensity'] for row in mother_rows),
    alphaAreaRatioRange=[min(f['nativeAlphaAreaRatio'] for r in records for f in r['frames']),
                        max(f['nativeAlphaAreaRatio'] for r in records for f in r['frames'])])))
