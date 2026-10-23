"""Export ten small authored source families with continuous independent density detail."""
import copy
import os
from pathlib import Path

import numpy as np
from PIL import Image
from newurban_batch89_io import atlas, logical, pin, read, sha, write
from newurban_rubble_r1_materials import register_subjects
from showcase_registration import capacity, independently_sample

ROOT = Path('.artifacts/m2-4/newurban-rock-crates-batch90-20261020')
REVISION = 'newurban-environment-rock-crates-batch90-v1-combined'
prep = read(ROOT / 'source-preparation-v1.json')
sources = {s['member']: s for s in read(ROOT / 'source.json')['sources']}
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
    assert receipt['sha256'] == sha(file) and receipt['request'] == job['request']
    assert receipt['mode'] == 'BUILT_IN_IMAGEGEN'
    master = Image.open(file).convert('RGBA')
    for name, material in zip(job['members'], register_subjects(master, len(job['members'])), strict=True):
        record, = [r for r in prep['records'] if r['member'] == name]
        available = capacity(material['rect'], record['originalBounds'])
        assert available >= 4, (name, available)
        materials[name] = dict(**material, mother=pin(file), availableDensity=available)
        mothers.append(dict(member=name, mother=pin(file), rect=material['rect'], actualSize=list(master.size),
            availableDensity=available, nativeBounds=record['originalBounds'],
            subjectComponents=material['subjectComponents'], registeredBodyPixels=material['registeredBodyPixels']))
assert len(materials) == 10
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
records = []
for record in prep['records']:
    name = record['member']
    source = sources[name]
    assert source['totalFrames'] == 2 and source['hasShadow'] and not source['remapable']
    assert sha(ROOT / 'native' / source['nativeFile']) == source['sha256']
    frame = source['frames'][0]
    indices = np.fromfile(ROOT / 'native' / frame['indexFile'], np.uint8).reshape(frame['size'][::-1])
    palette = np.fromfile(ROOT / 'native' / (source['palette']['sha256'] + '.pal'), np.uint8)
    palette = palette.reshape(256, 3).astype(np.uint16) * 4
    material = materials[name]
    stem = name.replace('.', '-')
    folder = destination / 'members' / stem
    folder.mkdir(parents=True)
    frames = [logical(frame)]
    metadata = dict(schemaVersion=2, packId='environment-' + stem, packRevision=REVISION,
        source=dict(member=name, sha256=source['sha256'], theater='NEWURBAN', kind='resolved-shp-member'),
        logical=dict(canvas=source['canvas'], frames=frames),
        color=dict(representation='authored-sRGB-RGBA8-plus-RGBA8-data', authoredFrameCoverage={'0': dict(
            schema='registered-authored-sprite-coverage-v1', sourceSha256=source['sha256'],
            sourceIndexSha256=frame['indexSha256'], mother=material['mother'], logicalBounds=frame['size'],
            nativeOrigin=frame['origin'], alphaCutoff=180,
            pixelMaskPolicy='Continuous authored silhouette with smooth material edges; no original pixel mask stamped into visual RGB or alpha.',
            unchanged='Original logical frame, separate native shadow, collision, picking and stock crate behavior.')}),
        variants=[], authored=dict(batch90=dict(preparation=pin(ROOT / 'source-preparation-v1.json'),
            material=material['mother'], sourcePalette=source['palette'])))
    row = dict(member=name, identity=record['identity'], family=record['family'], sourceSha256=source['sha256'],
        maps=record['mapIds'], mother=material['mother'], motherRect=material['rect'],
        availableDensity=material['availableDensity'], originalShadowSlots=[1], frames=[])
    for density in [2, 4]:
        left, top, right, bottom = record['originalBounds']
        sampled = independently_sample(material['plate'], ((right - left) * density, (bottom - top) * density))
        alpha = np.asarray(material['alpha'].resize((sampled.shape[1], sampled.shape[0]), Image.Resampling.LANCZOS))
        native_mean = palette[indices][indices != 0].mean(0)
        authored_mean = sampled[alpha >= 180].mean(0)
        gain = .25 + .75 * native_mean / np.maximum(authored_mean, 1)
        rgb = np.uint8(np.clip(sampled.astype(float) * gain, 0, 255))
        w, h = [n * density for n in frames[0]['legacyRenderSize']]
        base = np.zeros((h, w, 4), np.uint8)
        base[top * density:bottom * density, left * density:right * density] = np.dstack((rgb, alpha))
        data = np.zeros_like(base)
        data[..., 3] = 255
        metadata['variants'].append(atlas(folder, frames, {0: (base, data)}, density))
        row['frames'].append(dict(density=density, nativeMean=native_mean.tolist(), authoredMean=authored_mean.tolist(),
            gain=gain.tolist(), nativeRgbPixelsCopied=0, oldBodyMaskAppliedToRgb=False, nativeIndex12BodyPixels=int((indices == 12).sum())))
    file = folder / 'manifest.json'
    write(file, metadata)
    row['metadata'] = pin(file)
    records.append(row)
    manifest['families'][record['family']] = dict(familyHash=contract['families'][record['family']]['familyHash'],
        members=[dict(member=name, path=str(file.relative_to(destination)), sha256=sha(file))])
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
combined['extensions']['newurbanRockCratesBatch90'] = dict(source=pin(ROOT / 'source.json'),
    completeFamilies=10, sourceMembers=10, independentDensityFrames=20, nativeShadowSlots=10)
write(ROOT / 'contract-candidate-v1.json', combined)
write(ROOT / 'export-and-preservation-v1.json', dict(status='EXPORTED_TEN_COMPLETE_ROCK_AND_CRATE_FAMILIES_NOT_SELECTED',
    baseline=baseline['selectedPack'], candidate=candidate, source=pin(ROOT / 'source.json'),
    records=records, motherRows=mothers, completeFamilies=10, sourceMembers=10, newDensityFrames=20,
    originalShadowSlots=10, unchangedPriorFamilies=len(baseline['families']), preservedPayloadHashes=preserved,
    native='NOT_RUN', visual='PENDING_TEN_NEW_STUDIES', windows='NOT_RUN', m24Complete=False))
print(dict(candidate=candidate, newFamilies=10, minimumMotherDensity=min(r['availableDensity'] for r in mothers)))
