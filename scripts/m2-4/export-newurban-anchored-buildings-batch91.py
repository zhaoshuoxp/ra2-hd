"""Rebase proven accepted pixels to target native headers and author seven source states."""
import copy
import os
from pathlib import Path

import numpy as np
from PIL import Image
from newurban_batch89_io import atlas, crop, logical, pin, read, sha, write
from newurban_batch91_materials import authored_frame, capacity, register_subjects

ROOT = Path('.artifacts/m2-4/newurban-anchored-buildings-batch91-20261020')
REVISION = 'newurban-environment-anchored-buildings-batch91-v1-combined'
prep = read(ROOT / 'source-preparation-v1.json')
sources = {source['member']: source for source in read(ROOT / 'source.json')['sources']}
contract = read(ROOT / 'contract.json')
baseline = read(ROOT / 'baseline-contract.json')
assert baseline['selectedPack'] == read('.local/environment-newurban-selection.json')
base = Path('.local/environment-packs') / baseline['selectedPack']['revision']
assert sha(base / 'manifest.json') == baseline['selectedPack']['sha256']
manifest = read(base / 'manifest.json')
materials, mothers = {}, []
for job in read(ROOT / 'imagegen-jobs-v2.json')['jobs']:
    file = Path(job['destination'])
    receipt = read(ROOT / job['receiptFile'])
    assert receipt['sha256'] == sha(file) and receipt['mode'] == 'BUILT_IN_IMAGEGEN'
    assert receipt['request'] == job['request']
    assert pin(Path(job['originalReference']['file'])) == job['originalReference']
    with Image.open(file) as master:
        size = list(master.size)
        registered = register_subjects(master, len(job['subjects']))
    for study, material in zip(job['subjects'], registered, strict=True):
        available = capacity(material['rect'], study['nativeBounds'])
        assert available >= 4, (study['member'], study['slot'], available)
        material.update(mother=pin(file), availableDensity=available)
        key = (study['member'], study['slot'])
        assert key not in materials
        materials[key] = material
        mothers.append(dict(member=study['member'], slot=study['slot'], mother=pin(file),
            rect=material['rect'], actualSize=size, availableDensity=available,
            nativeBounds=study['nativeBounds'], subjectComponents=material['subjectComponents']))
assert len(materials) == 7
destination = Path('.local/environment-packs') / REVISION
destination.mkdir(exist_ok=False)
preserved = {}
for file in sorted(base.rglob('*')):
    if not file.is_file() or file == base / 'manifest.json':
        continue
    relative = file.relative_to(base)
    target = destination / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    os.link(file, target)
    preserved[str(relative)] = sha(file)
records, adaptations = [], []
anchor_proof = read(Path(prep['anchorProof']['file']))
for record in prep['records']:
    name = record['member']
    source = sources[name]
    file = Path(record['donorMetadata']['file'])
    assert pin(file) == record['donorMetadata']
    donor = read(file)
    proof, = [row for row in anchor_proof['rows'] if row['member'] == name]
    candidate, = [candidate for candidate in proof['candidates'] if candidate['theater'] == record['donorTheater']]
    frames = [logical(frame) for frame in source['frames'][:record['bodySlots']]]
    stem = name.replace('.', '-').replace('_', '-')
    folder = destination / 'members' / stem
    folder.mkdir(parents=True)
    metadata = copy.deepcopy(donor)
    metadata.update(packId='environment-' + stem, packRevision=REVISION,
        source=dict(member=name, sha256=source['sha256'], theater='NEWURBAN', kind='resolved-shp-member'),
        logical=dict(canvas=source['canvas'], frames=frames))
    row = dict(member=name, identity=record['identity'], identities=record['identities'],
        family='newurban-' + record['identity'].lower(), linked=record['linked'],
        sourceSha256=source['sha256'], donorMetadata=record['donorMetadata'],
        exactAnchoredSlots=record['exactAnchoredSlots'], maps=record['mapIds'],
        originalShadowSlots=source['totalFrames'] - record['bodySlots'],
        nativeEmptySlots=[frame['slot'] for frame in source['frames'][:record['bodySlots']] if frame['empty']],
        frames=[])
    for slot in record['exactAnchoredSlots']:
        detail = candidate['slots'][slot]
        assert detail['exactAnchoredBody']
        if not source['frames'][slot]['empty']:
            assert detail['sameAnchoredTrim']
        assert frames[slot]['trimSize'] == donor['logical']['frames'][slot]['trimSize']
        assert frames[slot]['legacyRenderSize'] == donor['logical']['frames'][slot]['legacyRenderSize']
    if record['linked']:
        for item in file.parent.rglob('*'):
            if not item.is_file() or item == file:
                continue
            target = folder / item.relative_to(file.parent)
            target.parent.mkdir(parents=True, exist_ok=True)
            os.link(item, target)
        metadata['color']['acceptedAnchoredLinkedReuse'] = dict(donor=record['donorMetadata'],
            sourceProof=prep['anchorProof'], nativeHeaderRebased=True, allTexturePagesExact=True,
            nativeTimingUnchanged=True, targetNativeEmptySlots=row['nativeEmptySlots'])
    else:
        variants = []
        studies = {study['slot']: study for study in prep['studies'] if study['member'] == name}
        for density in [2, 4]:
            images = {}
            for slot in range(record['bodySlots']):
                if slot in studies:
                    frame = source['frames'][slot]
                    study = studies[slot]
                    indices = np.fromfile(ROOT / 'native' / frame['indexFile'], np.uint8).reshape(frame['size'][::-1])
                    palette = np.fromfile(ROOT / 'native' / (study['palette']['sha256'] + '.pal'), np.uint8)
                    palette = palette.reshape(256, 3).astype(np.uint16) * 4
                    material = materials[name, slot]
                    b, d, evidence = authored_frame(material, indices, study['nativeBounds'], palette, density, body=slot == 0)
                    width, height = [value * density for value in frames[slot]['legacyRenderSize']]
                    base_pixels, data_pixels = np.zeros((height, width, 4), np.uint8), np.zeros((height, width, 4), np.uint8)
                    data_pixels[..., 3] = 255
                    base_pixels[:b.shape[0], :b.shape[1]], data_pixels[:d.shape[0], :d.shape[1]] = b, d
                    images[slot] = base_pixels, data_pixels
                    row['frames'].append(dict(slot=slot, density=density, mother=material['mother'],
                        availableDensity=material['availableDensity'], **evidence))
                else:
                    images[slot] = crop(file, slot, density), crop(file, slot, density, 'data')
                    if name == 'cnoild.shp' and slot in [1, 2]:
                        base_pixels, data_pixels = images[slot]
                        region = data_pixels[50 * density:51 * density, 46 * density:47 * density]
                        mask = region[..., 0] > 0
                        changed = int((mask & (region[..., 1] != 14)).sum())
                        region[..., 1][mask] = 14
                        adaptations.append(dict(member=name, slot=slot, density=density, nativeCell=[46, 50],
                            nativeOwnerIndex=30, changedShadeSamples=changed, baseRgbAndAlphaExact=True,
                            ownerWeightAndAllOtherAuxiliaryChannelsExact=True))
                    else:
                        assert slot in record['exactAnchoredSlots']
            variants.append(atlas(folder, frames, images, density))
        metadata['variants'] = variants
        metadata['color']['acceptedNativeBodyFrames'] = dict(donor=record['donorMetadata'],
            slots=record['exactAnchoredSlots'], proof=prep['anchorProof'], anchoredGeometryExact=True)
        metadata['color']['structuralCoverage']['appliesToNativeFrames'] = record['exactAnchoredSlots']
        metadata['color']['authoredFrameCoverage'] = {str(slot): dict(
            schema='registered-authored-sprite-coverage-v1', sourceSha256=source['sha256'],
            sourceIndexSha256=source['frames'][slot]['indexSha256'], mother=materials[name, slot]['mother'],
            logicalBounds=source['frames'][slot]['size'], nativeOrigin=source['frames'][slot]['origin'],
            alphaCutoff=180, pixelMaskPolicy='Continuous authored visual contour and uniform RGB gain. Exact original contact cells and bounded original owner mask are semantic channels, not body texture.',
            unchanged='Original logical dimensions, separate shadows, collision, picking, timing and rules.') for slot in studies}
        if name == 'cnoild.shp':
            metadata['color']['singleCellOwnerShadeRegistration'] = dict(nativeCell=[46, 50], nativeIndex=30,
                slots=[1, 2], proof=prep['anchorProof'], rgbAlphaAndMechanismUnchanged=True,
                policy='The sole original difference adds one owner-color index 30. Only existing accepted owner-weight samples inside that native cell receive shade 14. No owner area, material pixel, contour, contact or mechanism is changed.')
    metadata.setdefault('authored', {})['newurbanBatch91'] = dict(sourcePreparation=pin(ROOT / 'source-preparation-v1.json'),
        targetNativeSource=pin(ROOT / 'source.json'), anchorProof=prep['anchorProof'], donor=record['donorMetadata'])
    out = folder / 'manifest.json'
    write(out, metadata)
    row['metadata'] = pin(out)
    records.append(row)
for family, definition in contract['families'].items():
    assert family not in manifest['families']
    members = [row for row in records if row['family'] == family]
    assert sorted(row['member'] for row in members) == definition['members']
    manifest['families'][family] = dict(familyHash=definition['familyHash'], members=[dict(member=row['member'],
        path=str(Path(row['metadata']['file']).relative_to(destination)), sha256=row['metadata']['sha256']) for row in members])
manifest['revision'] = REVISION
write(destination / 'manifest.json', manifest)
candidate = dict(schemaVersion=1, revision=REVISION, sha256=sha(destination / 'manifest.json'))
combined = copy.deepcopy(baseline)
for key in ['sources', 'families']:
    assert not set(combined[key]) & set(contract[key])
    combined[key].update(contract[key])
for edition in ['ra2', 'yr']:
    assert not set(combined['identities'][edition]) & set(contract['identities'][edition])
    combined['identities'][edition].update(contract['identities'][edition])
combined['selectedPack'] = candidate
combined['extensions']['newurbanAnchoredBuildingsBatch91'] = dict(source=pin(ROOT / 'source.json'),
    sourceProof=prep['anchorProof'], completeFamilies=6, sourceMembers=12, newStudies=7,
    nativeCanvasHeadersAuthoritative=True, completeAcceptedLinkedTexturesExact=True)
write(ROOT / 'contract-candidate-v1.json', combined)
write(ROOT / 'export-and-preservation-v1.json', dict(status='EXPORTED_SIX_COMPLETE_ANCHORED_FAMILIES_NOT_SELECTED',
    baseline=baseline['selectedPack'], candidate=candidate, records=records, motherRows=mothers,
    ownerShadeAdaptations=adaptations, completeFamilies=6, sourceMembers=12, newArtStudies=7,
    newDensityFrames=14, originalShadowSlots=sum(row['originalShadowSlots'] for row in records),
    sourceDensitySlots=sum(row['bodySlots'] for row in prep['records']) * 2,
    unchangedPriorFamilies=len(baseline['families']), preservedPayloadHashes=preserved,
    native='NOT_RUN', visual='PENDING_SEVEN_NEW_STUDIES_AND_MAPPING_CONTEXT', windows='NOT_RUN', m24Complete=False))
print(dict(candidate=candidate, newFamilies=6, members=12, newStudies=7,
    minimumDensity=min(row['availableDensity'] for row in mothers)))
