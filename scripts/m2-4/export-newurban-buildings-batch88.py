"""Build complete NewUrban families from accepted bodies and continuous authored rubble."""
import copy
import hashlib
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image

from newurban_rubble_r1_materials import register_subjects
from newurban_rubble_batch88_materials import register_iso_rubble
from showcase_registration import capacity

ROOT = Path('.artifacts/m2-4/newurban-buildings-batch88-20261020')
PREP = Path('.artifacts/m2-4/newurban-building-references-batch88-v1')
R1 = Path('.artifacts/m2-4/newurban-rubble-continuous-r1-20261020')
REVISION = 'newurban-environment-buildings-batch88-v3-combined'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)


def write(file, value):
    with file.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


def crop(metadata_file, number, density, role):
    metadata = read(metadata_file)
    variant, = [v for v in metadata['variants'] if v['density'] == density]
    region, = [f for f in variant['frames'] if f['nativeFrame'] == number]
    page, = [p for p in variant['pages'] if p['id'] == region['page']]
    file = metadata_file.parent / str(density) / page['id'] / (role + '.png')
    assert sha(file) == page[role + 'Sha256']
    x, y, width, height = region['sampleRect']
    return np.asarray(Image.open(file).convert('RGBA'))[y:y + height, x:x + width].copy()


def logical(frame):
    return dict(nativeFrame=frame['slot'], trimOrigin=frame['origin'], trimSize=frame['size'],
        legacyRenderSize=[n + n % 2 for n in frame['size']], empty=frame['empty'])


def atlas(folder, frames, images, density):
    sizes = [[n * density for n in frame['legacyRenderSize']] for frame in frames]
    width = ((max(w for w, _ in sizes) + 4 + 63) // 64) * 64
    assert width <= 2048
    pages, declarations, placements = [], [], []
    y, page_index = 2, 0

    def flush():
        height = max(py + sizes[number][1] + 2 for number, py in placements)
        base = np.zeros((height, width, 4), np.uint8)
        data = np.zeros_like(base)
        data[..., 3] = 255
        for number, py in placements:
            b, d = images[number]
            h, w = b.shape[:2]
            padded = np.pad(b, ((2, 2), (2, 2), (0, 0)), mode='edge')
            padded[..., 3] = 0
            padded[2:h + 2, 2:w + 2] = b
            base[py - 2:py + h + 2, :w + 4] = padded
            data[py:py + h, 2:w + 2] = d
        target = folder / str(density) / f'p{page_index}'
        target.mkdir(parents=True)
        page = dict(id=f'p{page_index}', size=[width, height])
        for role, array in [('base', base), ('data', data)]:
            file = target / (role + '.png')
            Image.fromarray(array).save(file)
            page[role] = f'{density}-p{page_index}-{role}.png'
            page[role + 'Sha256'], page[role + 'Bytes'] = sha(file), file.stat().st_size
        pages.append(page)

    for number, (w, h) in enumerate(sizes):
        assert h + 4 <= 2048
        if y + h + 2 > 2048:
            flush()
            placements, y, page_index = [], 2, page_index + 1
        declarations.append(dict(nativeFrame=number, page=f'p{page_index}', sampleRect=[2, y, w, h],
            contentRect=[2, y, *[n * density for n in frames[number]['trimSize']]]))
        placements.append((number, y))
        y += h + 4
    flush()
    return dict(density=density, pages=pages, frames=declarations)


baseline_contract = read(ROOT / 'baseline-contract.json')
baseline = baseline_contract['selectedPack']
assert baseline == read(Path('.local/environment-newurban-selection.json'))
assert read(R1 / 'user-acceptance-20261020.json')['candidate'] == baseline
base = Path('.local/environment-packs') / baseline['revision']
assert sha(base / 'manifest.json') == baseline['sha256']
manifest = read(base / 'manifest.json')
prepared = read(PREP / 'source-preparation-v1.json')
sources = {source['member']: source for source in read(ROOT / 'source.json')['sources']}
contract = read(ROOT / 'contract.json')
jobs_file = ROOT / ('imagegen-jobs-v2.json' if (ROOT / 'imagegen-jobs-v2.json').exists() else 'imagegen-jobs-v1.json')
masters, mother_rows = {}, []
for job in read(jobs_file)['jobs']:
    file = Path(job['destination'])
    receipt = read(ROOT / job['receiptFile'])
    assert receipt['mode'] == 'BUILT_IN_IMAGEGEN' and receipt['request'] == job['request']
    assert receipt['sha256'] == sha(file)
    assert pin(Path(job['originalReference']['file'])) == job['originalReference']
    image = Image.open(file).convert('RGBA')
    assert image.getchannel('A').getextrema() == (0, 255)
    for name, material in zip(job['members'], register_subjects(image, len(job['members'])), strict=True):
        record, = [r for r in prepared['records'] if r['member'] == name]
        bounds = record['originalBounds']
        available = capacity(material['rect'], bounds)
        assert available >= 4, (name, available)
        masters[name] = dict(**material, mother=pin(file), availableDensity=available)
        mother_rows.append(dict(member=name, mother=pin(file), rect=material['rect'], actualSize=list(image.size),
            availableDensity=available, nativeBounds=bounds, subjectComponents=material['subjectComponents'],
            dominantComponents=material['dominantComponents'], registeredBodyPixels=material['registeredBodyPixels']))
assert len(masters) == 37
destination = Path('.local/environment-packs') / REVISION
destination.mkdir(exist_ok=False)
preserved = {}
for file in sorted(base.rglob('*')):
    if not file.is_file() or file == base / 'manifest.json':
        continue
    relative = str(file.relative_to(base))
    target = destination / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    os.link(file, target)
    preserved[relative] = sha(file)
shared_entry, = manifest['families']['newurban-canewy06']['members']
shared_file = base / shared_entry['path']
assert sha(shared_file) == shared_entry['sha256']
shared_source = read(shared_file)['source']['sha256']
r1_export = read(R1 / 'export-and-preservation-v2.json')
shared_proof, = [r for r in r1_export['records'] if r['member'] == 'cnnewy06.shp']
records = []
for record in prepared['records']:
    name = record['member']
    source = sources[name]
    native = ROOT / 'native'
    assert sha(native / source['nativeFile']) == source['sha256']
    donor_file = Path(record['donorMetadata']['file'])
    assert pin(donor_file) == record['donorMetadata']
    donor = read(donor_file)
    frames = [logical(frame) for frame in source['frames'][:4]]
    assert source['canvas'] == donor['logical']['canvas']
    assert frames[:3] == donor['logical']['frames'][:3]
    family, = [key for key, value in contract['families'].items() if value['members'] == [name]]
    assert family not in manifest['families'] and name not in baseline_contract['sources']
    stem = name.replace('.', '-')
    folder = destination / 'members' / stem
    folder.mkdir(parents=True)
    metadata = dict(schemaVersion=2, packId='environment-' + stem, packRevision=REVISION,
        source=dict(member=name, sha256=source['sha256'], theater='NEWURBAN', kind='resolved-shp-member'),
        logical=dict(canvas=source['canvas'], frames=frames),
        color=dict(representation=donor['color']['representation'],
            structuralCoverage={**donor['color']['structuralCoverage'], 'appliesToNativeFrames': [0, 1, 2]},
            acceptedNativeBodyFrames=dict(manifest=record['donorMetadata'], slots=[0, 1, 2], proof=record['bodyProof'])),
        variants=[])
    index_frame = source['frames'][3]
    assert sha(native / index_frame['indexFile']) == index_frame['indexSha256']
    indices = np.fromfile(native / index_frame['indexFile'], np.uint8).reshape(index_frame['size'][::-1])
    palette_file = native / (record['rubblePalette']['sha256'] + '.pal')
    assert sha(palette_file) == record['rubblePalette']['sha256']
    palette = np.fromfile(palette_file, np.uint8).reshape(256, 3).astype(np.uint16) * 4
    row = dict(member=name, identity=record['identity'], family=family, sourceSha256=source['sha256'],
        originalSource=pin(native / source['nativeFile']), donorMetadata=record['donorMetadata'],
        exactAcceptedBodySlots=[0, 1, 2], originalShadowSlots=[4, 5, 6, 7],
        maps=record['mapIds'], rubblePolicy=record['rubble'], frames=[])
    if name == 'cnnewy07.shp':
        assert index_frame['indexSha256'] == shared_proof['originalIndexSha256']
        assert index_frame['size'] == read(shared_file)['logical']['frames'][3]['trimSize']
        row['rubblePolicy'] = 'ACCEPTED_R1_SOURCE_IDENTICAL_RUBBLE_REUSE'
        row['acceptedRubbleDonor'] = pin(shared_file)
        row['rubbleAcceptance'] = pin(R1 / 'user-acceptance-20261020.json')
    if name == 'cnfarm02.shp':
        assert source['sha256'] == donor['source']['sha256']
        assert frames == donor['logical']['frames']
        assert source['nativeRules'].get('LeaveRubble', '').lower() != 'yes'
    for density in [2, 4]:
        images = {i: (crop(donor_file, i, density, 'base'), crop(donor_file, i, density, 'data')) for i in range(3)}
        w, h = [n * density for n in frames[3]['legacyRenderSize']]
        if name == 'cnfarm02.shp':
            b, d = crop(donor_file, 3, density, 'base'), crop(donor_file, 3, density, 'data')
            evidence = dict(policy='UNUSED_SOURCE_IDENTICAL_ACCEPTED_SLOT_PRESERVED', runtimeUsed=False)
        elif name == 'cnnewy07.shp':
            b, d = crop(shared_file, 3, density, 'base'), crop(shared_file, 3, density, 'data')
            assert b.shape == (h, w, 4)
            evidence = dict(policy='EXACT_ACCEPTED_R1_SOURCE_IDENTICAL_FRAME', donor=pin(shared_file))
        else:
            master = masters[name]
            rgba, evidence = register_iso_rubble(master['plate'], indices, record['originalBounds'], density,
                palette, master['alpha'])
            assert evidence['coverage'] == 'AUTHORED_CONTINUOUS_RUBBLE_WITHIN_UNCHANGED_NATIVE_LOGICAL_BOUNDS'
            b, d = np.zeros((h, w, 4), np.uint8), np.zeros((h, w, 4), np.uint8)
            d[..., 3] = 255
            b[:rgba.shape[0], :rgba.shape[1]] = rgba
        images[3] = b, d
        assert b.shape == d.shape == (h, w, 4)
        variant = atlas(folder, frames, images, density)
        if name in masters:
            variant['nativeFrameToneEvidence'] = {'3': evidence['tone']}
        metadata['variants'].append(variant)
        rgba_hash = hashlib.sha256(b.tobytes()).hexdigest()
        row['frames'].append(dict(density=density, slot=3, sampleRgbaSha256=rgba_hash, **evidence))
    if name in masters:
        master = masters[name]
        row.update(mother=master['mother'], motherRect=master['rect'], availableDensity=master['availableDensity'])
        metadata['color']['authoredFrameCoverage'] = {'3': dict(schema='registered-authored-sprite-coverage-v1',
            sourceSha256=source['sha256'], sourceIndexSha256=index_frame['indexSha256'], mother=master['mother'],
            logicalBounds=index_frame['size'], nativeOrigin=index_frame['origin'], alphaCutoff=180,
            pixelMaskPolicy='New continuous visual contour; original coarse square holes and pixel fragments are not retained.',
            nativeIndex12Policy='Visible Iso-palette body material; no Unit-palette contact interpretation. Original separate shadow slots remain exact.',
            unchanged='Native logical bounds, source collision/picking/shadows and gameplay data.')}
    elif name == 'cnnewy07.shp':
        metadata['color']['authoredFrameCoverage'] = {'3': dict(
            read(shared_file)['color']['authoredFrameCoverage']['3'], sourceSha256=source['sha256'],
            nativeOrigin=index_frame['origin'], acceptedSharedDonor=pin(shared_file))}
    else:
        metadata['color']['structuralCoverage']['appliesToNativeFrames'] = [0, 1, 2, 3]
        metadata['color']['unusedSourceIdenticalRubble'] = dict(sourceSha256=source['sha256'],
            donor=record['donorMetadata'], runtimeUsed=False, originalLeaveRubble=source['nativeRules'].get('LeaveRubble'))
    metadata['authored'] = dict(batch88CompleteFamily=dict(sourcePreparation=pin(PREP / 'source-preparation-v1.json'),
        source=pin(ROOT / 'source.json'), exactAcceptedBodyDensityFrames=6, rubblePolicy=row['rubblePolicy']))
    file = folder / 'manifest.json'
    write(file, metadata)
    manifest['families'][family] = dict(familyHash=contract['families'][family]['familyHash'],
        members=[dict(member=name, path=str(file.relative_to(destination)), sha256=sha(file))])
    row['metadata'] = pin(file)
    records.append(row)
manifest['revision'] = REVISION
write(destination / 'manifest.json', manifest)
candidate = dict(schemaVersion=1, revision=REVISION, sha256=sha(destination / 'manifest.json'))
combined = copy.deepcopy(baseline_contract)
for key in ['sources', 'families']:
    assert not (set(combined[key]) & set(contract[key]))
    combined[key].update(contract[key])
for edition in ['ra2', 'yr']:
    assert not (set(combined['identities'][edition]) & set(contract['identities'][edition]))
    combined['identities'][edition].update(contract['identities'][edition])
combined['selectedPack'] = candidate
combined['extensions']['newurbanBuildingsBatch88'] = dict(source=pin(ROOT / 'source.json'),
    sourceContract=pin(ROOT / 'contract.json'), completeFamilies=39, newRubbleStudies=37,
    exactAcceptedBodyStates=117, acceptedR1SharedRubble=1, nativeUnusedRubbleSlots=1,
    state='STATIC_EXPORT_NOT_SELECTED_NATIVE_AND_VISUAL_PENDING')
write(ROOT / 'contract-candidate-v2.json', combined)
write(ROOT / 'export-and-preservation-v2.json', dict(status='EXPORTED_39_COMPLETE_FAMILIES_NOT_SELECTED',
    baseline=baseline, candidate=candidate, source=pin(ROOT / 'source.json'), contract=pin(ROOT / 'contract.json'),
    jobs=pin(jobs_file), motherRows=mother_rows, records=records, completeFamilies=39,
    newRubbleStudies=37, newRubbleDensityFrames=74, exactAcceptedBodyDensityFrames=234,
    acceptedSharedRubbleDensityFrames=2, unusedPreservedRubbleDensityFrames=2, originalShadowSlots=156,
    retainedUnselectedAttempts=[pin(ROOT / 'export-attempt-v1.json'), pin(ROOT / 'export-attempt-v2.json')],
    unaffectedCompleteFamilies=len(baseline_contract['families']), preservedPayloadHashes=preserved,
    native='NOT_RUN', visual='PENDING_37_NEW_STUDIES', windows='NOT_RUN', m24Complete=False))
print(json.dumps(dict(candidate=candidate, completeFamilies=39, exactAcceptedBodyDensityFrames=234,
    newRubbleDensityFrames=74, minimumMotherDensity=min(r['availableDensity'] for r in mother_rows))))
