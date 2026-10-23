"""Reuse complete accepted linked members and export twelve continuous rubble states."""
import copy
import hashlib
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image

from newurban_batch89_io import ROOT, atlas, crop, logical, pin, read, sha, write
from newurban_rubble_r1_materials import register_subjects
from showcase_registration import capacity, independently_sample

REVISION = 'newurban-environment-linked-buildings-batch89-v2-combined'
prep = read(ROOT / 'source-preparation-v2.json')
sources = {s['member']: s for s in read(ROOT / 'source.json')['sources']}
contract = read(ROOT / 'contract.json')
baseline = read(ROOT / 'baseline-contract.json')
assert baseline['selectedPack'] == read('.local/environment-newurban-selection.json')
base = Path('.local/environment-packs') / baseline['selectedPack']['revision']
assert sha(base / 'manifest.json') == baseline['selectedPack']['sha256']
manifest = read(base / 'manifest.json')
materials, mother_rows = {}, []
for job in read(ROOT / 'imagegen-jobs-v2.json')['jobs']:
    file = Path(job['destination'])
    receipt = read(ROOT / job['receiptFile'])
    assert receipt['sha256'] == sha(file) and receipt['request'] == job['request']
    assert receipt['mode'] == 'BUILT_IN_IMAGEGEN'
    assert pin(Path(job['originalReference']['file'])) == job['originalReference']
    master = Image.open(file).convert('RGBA')
    for name, material in zip(job['members'], register_subjects(master, len(job['members'])), strict=True):
        record, = [r for r in prep['records'] if r['member'] == name]
        available = capacity(material['rect'], record['rubbleBounds'])
        assert available >= 4, (name, available)
        materials[name] = dict(**material, mother=pin(file), availableDensity=available)
        mother_rows.append(dict(member=name, mother=pin(file), rect=material['rect'], actualSize=list(master.size),
            availableDensity=available, nativeBounds=record['rubbleBounds'],
            subjectComponents=material['subjectComponents'], registeredBodyPixels=material['registeredBodyPixels']))
assert len(materials) == 12
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

# The original difference is confined to the tiny blue ship advertising panel.
# Preserve the accepted coherent sign rather than rebuilding five retail pixel holes.
d_record, = [r for r in prep['records'] if r['member'] == 'cnstl05d.shp']
proof = read(Path(d_record['proof']['file']))
d_proof, = [r for r in proof['rows'] if r['member'] == 'cnstl05d.shp']
d_candidate, = d_proof['candidates']
assert d_candidate['exactSlots'] == [0]
for slot in [1, 2]:
    detail = d_candidate['slots'][slot]
    assert detail['sameGeometry'] and detail['differingRgb'] == detail['differingIndices'] == 23
    assert detail['differingAlpha'] == 5 and detail['differingOwner'] == detail['differingContact'] == 0
    assert all(132 <= p['x'] <= 140 and 45 <= p['y'] <= 56 for p in detail['differences'])
semantic = dict(status='EXPLICIT_BOUNDED_SEMANTIC_DONOR_ADAPTATION_NOT_EXACT_ORIGINAL_REUSE',
    member='cnstl05d.shp', slots=[1, 2], nativeDifferentIndicesPerSlot=23,
    nativeDifferentAlphaPixelsPerSlot=5, affectedLocalBounds=[132, 45, 141, 57],
    nativeBodyBoundsUnchanged=True, ownerAndContactUnchanged=True, donor=d_record['donorMetadata'],
    sourceProof=d_record['proof'], originalControl=pin(ROOT / 'stadium-d-original-damaged-4x-corrected.png'),
    acceptedControl=pin(ROOT / 'stadium-d-accepted-damaged-4x.png'),
    decision='Both originals depict the same blue advertising panel and ship in the same position. The 23 differing indexed details, including five small source-alpha holes, are resolution-level sign details. Reuse the accepted continuous HD sign and architecture exactly inside the target native logical bounds. This is an explicit semantic artwork adaptation, not an exact original-pixel equivalence claim.',
    visualReview='Include the D damaged Original/HD comparison and whole-stadium context in the grouped review.',
    originalMapsArchivesRulesShadowsModified=False)
semantic_file = ROOT / 'stadium-d-semantic-reuse-v1.json'
if semantic_file.exists():
    assert read(semantic_file) == semantic
else:
    write(semantic_file, semantic)


def register_rubble(material, indices, bounds, palette, density):
    """Use a single frame-wide color gain; never stamp the old body mask into new RGB."""
    left, top, right, bottom = bounds
    h, w = indices.shape
    sampled = independently_sample(material['plate'], ((right - left) * density, (bottom - top) * density))
    alpha = np.asarray(material['alpha'].resize((sampled.shape[1], sampled.shape[0]), Image.Resampling.LANCZOS))
    native_mean = palette[indices][indices != 0].mean(0)
    authored_mean = sampled[alpha >= 180].mean(0)
    gain = .25 + .75 * native_mean / np.maximum(authored_mean, 1)
    registered = np.uint8(np.clip(sampled.astype(float) * gain, 0, 255))
    rgba = np.zeros((h * density, w * density, 4), np.uint8)
    rgba[top * density:bottom * density, left * density:right * density] = np.dstack((registered, alpha))
    evidence = dict(policy='AUTHORED_CONTINUOUS_ALPHA_UNIFORM_FRAME_COLOR_GAIN_NO_NATIVE_PIXEL_MASK_IN_RGB',
        nativeMean=native_mean.tolist(), authoredMean=authored_mean.tolist(), gain=gain.tolist(),
        originalRgbPixelsCopied=0, oldBodyMaskAppliedToRgb=False, originalIndex12BodyPixels=int((indices == 12).sum()))
    return rgba, evidence


records = []
for record in prep['records']:
    name = record['member']
    source = sources[name]
    donor_file = Path(record['donorMetadata']['file'])
    assert pin(donor_file) == record['donorMetadata']
    donor = read(donor_file)
    frames = [logical(frame) for frame in source['frames'][:record['bodySlots']]]
    assert (frames if record['linked'] else frames[:3]) == (
        donor['logical']['frames'] if record['linked'] else donor['logical']['frames'][:3])
    assert donor['logical']['canvas'] == source['canvas']
    stem = name.replace('.', '-')
    folder = destination / 'members' / stem
    folder.mkdir(parents=True)
    metadata = copy.deepcopy(donor)
    metadata.update(packId='environment-' + stem.replace('_', '-'), packRevision=REVISION)
    metadata['logical'] = dict(canvas=source['canvas'], frames=frames)
    metadata['source'] = dict(member=name, sha256=source['sha256'], theater='NEWURBAN', kind='resolved-shp-member')
    row = dict(member=name, identity=record['identity'], family='newurban-' + record['identity'].lower(),
        linked=record['linked'], sourceSha256=source['sha256'], donorMetadata=record['donorMetadata'],
        exactAcceptedSlots=record['exactAcceptedSlots'], originalShadowSlots=source['totalFrames'] - record['bodySlots'],
        nativeEmptySlots=[f['slot'] for f in source['frames'][:record['bodySlots']] if f['empty']],
        maps=record['mapIds'], frames=[])
    if record['linked']:
        assert source['sha256'] == donor['source']['sha256']
        for file in donor_file.parent.rglob('*'):
            if not file.is_file() or file == donor_file:
                continue
            target = folder / file.relative_to(donor_file.parent)
            target.parent.mkdir(parents=True, exist_ok=True)
            os.link(file, target)
        metadata['color']['acceptedLinkedReuse'] = dict(donor=record['donorMetadata'], originalProof=record['proof'],
            allFramesAndEmptySlotsExact=True, nativeTimingUnchanged=True)
    else:
        assert record['exactAcceptedSlots'] == ([0] if name == 'cnstl05d.shp' else [0, 1, 2])
        frame = source['frames'][3]
        indices = np.fromfile(ROOT / 'native' / frame['indexFile'], np.uint8).reshape(frame['size'][::-1])
        palette = np.fromfile(ROOT / 'native' / (record['rubblePalette']['sha256'] + '.pal'), np.uint8)
        palette = palette.reshape(256, 3).astype(np.uint16) * 4
        material = materials[name]
        variants = []
        for density in [2, 4]:
            images = {i: (crop(donor_file, i, density), crop(donor_file, i, density, 'data')) for i in range(3)}
            rgba, evidence = register_rubble(material, indices, record['rubbleBounds'], palette, density)
            w, h = [n * density for n in frames[3]['legacyRenderSize']]
            b = np.zeros((h, w, 4), np.uint8)
            b[:rgba.shape[0], :rgba.shape[1]] = rgba
            data = np.zeros_like(b)
            data[..., 3] = 255
            images[3] = b, data
            variant = atlas(folder, frames, images, density)
            variants.append(variant)
            row['frames'].append(dict(density=density, slot=3, **evidence))
        metadata['variants'] = variants
        metadata['color']['structuralCoverage']['appliesToNativeFrames'] = record['exactAcceptedSlots']
        metadata['color']['acceptedNativeBodyFrames'] = dict(donor=record['donorMetadata'],
            slots=record['exactAcceptedSlots'], proof=record['proof'])
        metadata['color']['authoredFrameCoverage'] = {'3': dict(schema='registered-authored-sprite-coverage-v1',
            sourceSha256=source['sha256'], sourceIndexSha256=frame['indexSha256'], mother=material['mother'],
            logicalBounds=frame['size'], nativeOrigin=frame['origin'], alphaCutoff=180,
            pixelMaskPolicy='Continuous authored visual contour; no old body mask stamped into RGB or alpha.',
            unchanged='Native logical frame, original shadows, collision, picking, timing and rules.')}
        if name == 'cnstl05d.shp':
            for slot in ['1', '2']:
                metadata['color']['authoredFrameCoverage'][slot] = dict(
                    schema='bounded-semantic-accepted-art-reuse-v1', sourceSha256=source['sha256'],
                    sourceIndexSha256=source['frames'][int(slot)]['indexSha256'],
                    evidence=pin(ROOT / 'stadium-d-semantic-reuse-v1.json'), donor=record['donorMetadata'],
                    policy=semantic['decision'])
            row['semanticAcceptedSlots'] = [1, 2]
        row.update(mother=material['mother'], motherRect=material['rect'], availableDensity=material['availableDensity'])
    metadata.setdefault('authored', {})['newurbanBatch89'] = dict(sourcePreparation=pin(ROOT / 'source-preparation-v2.json'),
        source=pin(ROOT / 'source.json'), donor=record['donorMetadata'], linked=record['linked'])
    file = folder / 'manifest.json'
    write(file, metadata)
    row['metadata'] = pin(file)
    records.append(row)
for family, definition in contract['families'].items():
    assert family not in manifest['families']
    members = [row for row in records if row['family'] == family]
    assert sorted(r['member'] for r in members) == definition['members']
    manifest['families'][family] = dict(familyHash=definition['familyHash'], members=[dict(member=r['member'],
        path=str(Path(r['metadata']['file']).relative_to(destination)), sha256=r['metadata']['sha256']) for r in members])
manifest['revision'] = REVISION
write(destination / 'manifest.json', manifest)
candidate = dict(schemaVersion=1, revision=REVISION, sha256=sha(destination / 'manifest.json'))
combined = copy.deepcopy(baseline)
for key in ['sources', 'families']:
    assert not (set(combined[key]) & set(contract[key]))
    combined[key].update(contract[key])
for edition in ['ra2', 'yr']:
    assert not (set(combined['identities'][edition]) & set(contract['identities'][edition]))
    combined['identities'][edition].update(contract['identities'][edition])
combined['selectedPack'] = candidate
combined['extensions']['newurbanLinkedBuildingsBatch89'] = dict(source=pin(ROOT / 'source.json'),
    completeFamilies=12, sourceMembers=14, newRubbleStudies=12, linkedMembers=2,
    semanticBodyAdaptation=pin(ROOT / 'stadium-d-semantic-reuse-v1.json'))
write(ROOT / 'contract-candidate-v1.json', combined)
write(ROOT / 'export-and-preservation-v1.json', dict(status='EXPORTED_TWELVE_COMPLETE_LINKED_FAMILIES_NOT_SELECTED',
    baseline=baseline['selectedPack'], candidate=candidate, preparation=pin(ROOT / 'source-preparation-v2.json'),
    records=records, motherRows=mother_rows, completeFamilies=12, sourceMembers=14, newRubbleDensityFrames=24,
    exactAcceptedDensityFrames=222, semanticAcceptedDensityFrames=4, nativeEmptyDensityFrames=32,
    originalShadowSlots=sum(r['originalShadowSlots'] for r in records), unchangedPriorFamilies=len(baseline['families']),
    preservedPayloadHashes=preserved, native='NOT_RUN', visual='PENDING_NEW_RUBBLE_AND_D_ADAPTATION',
    windows='NOT_RUN', m24Complete=False))
print(json.dumps(dict(candidate=candidate, newFamilies=12, members=14, newRubbleStudies=12,
    minimumDensity=min(row['availableDensity'] for row in mother_rows))))
