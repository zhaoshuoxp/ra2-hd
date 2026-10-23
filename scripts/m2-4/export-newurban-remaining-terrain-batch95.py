"""Reuse accepted cliff structures, preserving original target geometry and dependencies."""
from collections import defaultdict
from copy import deepcopy
import hashlib
import json
import os
from pathlib import Path
import numpy as np
from scipy import ndimage
from newurban_batch95_io import ROOT, GUIDE, adapt_cliff_grass, adapt_rock_ground, crop, grass_field, layout, native, pack, pin, read, register_canvas, sha, write

baseline = read(ROOT / 'baseline-selector.json')
assert read('.local/terrain-newurban-selection.json') == read(ROOT / 'selection-v2.json')['candidate']
assert read('desktop/terrain-theater-hd-contracts.json')['NEWURBAN'] == read(ROOT / 'selection-v2.json')['candidate']
base = Path('.local/terrain-packs') / baseline['revision']
assert sha(base / 'manifest.json') == baseline['sha256']
manifest = read(base / 'manifest.json')
sources = {s['member']: s for s in read(GUIDE / 'source.json')['sources']}
donors = {(s['theater'], s['member']): s for s in read(ROOT / 'accepted-native-donors-v1/source.json')['sources']}
missing = read('.artifacts/m2-4/newurban-secondary-terrain-reuse-batch94-20261021/inventory-reconciliation-v1.json')['remainingGaps']
chosen = [r for r in missing if r['kind'] == 'tmp' and (r['member'].startswith('cliffx')
    or r['member'] in ['wclifx10.ubn', 'baseb01.ubn', 'droadc09.ubn'])]
assert len(chosen) == 36
revision = 'newurban-m2-4-extended-cliff-reuse-batch95-v4'
destination = Path('.local/terrain-packs') / revision
destination.mkdir(exist_ok=False)
fields = {density: grass_field(baseline, density) for density in [2, 4]}
for density, field in fields.items():
    with (ROOT / f'accepted-newurban-grass-{density}x-v4.npy').open('xb') as stream:
        np.save(stream, field)
records, cohorts = [], defaultdict(list)
for gap in chosen:
    source = sources[gap['member']]
    assert sha(GUIDE / 'native' / source['nativeFile']) == source['sha256'] == gap['sha256']
    low_rocks = source['member'] in ['cliffx33.ubn', 'cliffx34.ubn', 'cliffx39.ubn', 'cliffx40.ubn']
    theater = 'DESERT' if low_rocks else 'TEMPERATE' if source['member'].startswith(('cliffx', 'wclifx')) else 'URBAN'
    extension = {'DESERT': '.des', 'TEMPERATE': '.tem', 'URBAN': '.urb'}[theater]
    donor_name = source['member'].replace('.ubn', extension).replace('cliffx', 'cliff').replace('wclifx', 'wcliff')
    donor = donors[theater, donor_name]
    assert pin(donor['original']['file']) == donor['original']
    assert len(source['images']) == len(donor['images'])
    metadata = [{k: v for k, v in image.items() if k not in ['nativeOffset', 'size', 'file', 'rgbaSha256']}
                for image in source['images']]
    definition = dict(member=source['member'], sourceHashes=dict(yr=source['sha256']), images=metadata)
    record = dict(member=source['member'], sourceSha256=source['sha256'], targetSet=source['setIndex'],
        original=pin(GUIDE / 'native' / source['nativeFile']), donorOriginal=donor['original'],
        donorPack=donor['pointer'], donorTheater=theater, donorMember=donor_name, maps=gap['maps'], frames=[])
    pieces = {2: [], 4: []}
    for density in [2, 4]:
        for image, donor_image in zip(source['images'], donor['images'], strict=True):
            original = native(source, image)
            for key in ['subTile', 'grid', 'block', 'origin', 'height', 'rampType', 'hasZData']:
                assert image[key] == donor_image[key], (source['member'], image['subTile'], key)
            pixels = crop(donor['pointer'], donor_name, image['subTile'], density)
            donor_digest = hashlib.sha256(pixels.tobytes()).hexdigest()
            detail = dict(policy='REGISTERED_ACCEPTED_HD_STRUCTURE', originalRgbUsedAsDetail=False)
            if image['nativeOffset'] <= 0:
                pixels = original.repeat(density, 0).repeat(density, 1)
                detail['policy'] = 'UNREFERENCED_ZERO_POINTER_ORIGINAL_COMPATIBILITY_ONLY'
            else:
                pixels = register_canvas(pixels, image, donor_image, density)
                if image['size'] != donor_image['size'] or image['offset'] != donor_image['offset']:
                    detail['canvasRegistration'] = dict(targetSize=image['size'], donorSize=donor_image['size'],
                        targetOffset=image['offset'], donorOffset=donor_image['offset'])
                if low_rocks:
                    pixels, detail['grassMaterial'] = adapt_rock_ground(pixels, image, density, fields[density])
                else:
                    pixels, detail['grassMaterial'] = adapt_cliff_grass(pixels, image, density, fields[density])
                alpha = original[..., 3].repeat(density, 0).repeat(density, 1)
                differences = pixels[..., 3] != alpha
                missing_samples = (pixels[..., 3] == 0) & (alpha > 0)
                if missing_samples.any():
                    nearest = ndimage.distance_transform_edt(pixels[..., 3] == 0, return_distances=False, return_indices=True)
                    pixels[missing_samples, :3] = pixels[tuple(nearest)][missing_samples, :3]
                pixels[..., 3] = alpha
                if differences.any():
                    detail['targetCoverage'] = dict(changedSamples=int(differences.sum()),
                        addedSamples=int(missing_samples.sum()), material='NEAREST_ALREADY_ACCEPTED_HD_SURFACE',
                        nativeRgbUsed=False)
            assert pixels.shape[:2] == tuple(n * density for n in image['size'][::-1])
            assert np.array_equal(pixels[..., 3], original[..., 3].repeat(density, 0).repeat(density, 1))
            pieces[density].append(pixels)
            record['frames'].append(dict(density=density, subTile=image['subTile'], nativePointer=image['nativeOffset'],
                acceptedDonorRgbaSha256=donor_digest, rgbaSha256=hashlib.sha256(pixels.tobytes()).hexdigest(), **detail))
    records.append(record)
    cohorts[(source['setIndex'], tuple(sorted(gap['maps'])))].append((definition, pieces, record))

preservation = []
for group in manifest['groups']:
    old_variants = deepcopy(group['variants'])
    group['variants'] = []
    for variant in old_variants:
        density = variant['density']
        pieces = [crop(baseline, member['member'], frame['subTile'], density)
                  for member in group['members'] for frame in member['images']]
        limit = max(2048, *variant['size'])
        placement = layout(pieces, limit)
        previous_bytes = int(np.prod(variant['size']) * 4)
        if placement and int(np.prod(placement[2]) * 4) < previous_bytes:
            result = pack(destination, group, density, pieces, limit)
        else:
            assert sha(base / variant['file']) == variant['sha256']
            os.link(base / variant['file'], destination / variant['file'])
            group['variants'].append(variant)
            result = dict(group=group['id'], density=density, slots=len(pieces), rawBytes=previous_bytes)
        preservation.append(dict(**result, previousRawBytes=previous_bytes, savedRawBytes=previous_bytes-result['rawBytes']))
new_groups, layouts = [], []
for cohort, ((set_index, maps), entries) in enumerate(sorted(cohorts.items()), 1):
    chunks, chunk = [], []
    for entry in entries:
        if chunk and layout([p for _, values, _ in chunk+[entry] for p in values[4]]) is None:
            chunks.append(chunk)
            chunk = []
        chunk.append(entry)
    chunks.append(chunk)
    for part, chunk in enumerate(chunks, 1):
        group = dict(id=f'm2-4-newurban-extended-set{set_index:03d}-cohort{cohort:02d}-part{part}',
            scope='COMPLETE_PHYSICAL_TMP_FAMILIES_REGISTERED_ACCEPTED_HD_STRUCTURE_TARGET_OWNED_RULES',
            members=[definition for definition, _, _ in chunk], variants=[])
        for density in [2, 4]:
            layouts.append(pack(destination, group, density, [p for _, values, _ in chunk for p in values[density]]))
        for _, _, record in chunk:
            record['group'] = group['id']
        new_groups.append(group)
manifest['revision'] = revision
manifest['groups'] += new_groups
assert len(manifest['groups']) <= 256
with (destination/'manifest.json').open('x') as stream:
    json.dump(manifest, stream, separators=(',', ':')); stream.write('\n')
assert (destination/'manifest.json').stat().st_size <= 2*1024**2
candidate = dict(schemaVersion=1, revision=revision, sha256=sha(destination/'manifest.json'))
assert read(ROOT/'source.json')['sources'] == [sources[r['member']] for r in records]
write(ROOT/'export-and-preservation-v4.json', dict(status='EXPORTED_36_COMPLETE_SOURCE_MEMBERS_NOT_SELECTED',
    baseline=baseline, candidate=candidate, records=records, layouts=layouts, losslessPriorPacking=preservation,
    sourceMembers=len(records), completeNewLoadFamilies=len(new_groups), priorGroups=92,
    totalGroups=len(manifest['groups']), selectedNewMothers=0, originalRgbUsedAsNewDetail=False,
    memoryBudgets='UNCHANGED_512_1280_MIB_WORLD_128_MIB_PREPARED_16_MIB_UI',
    targetMetadataRulesDepth='UNCHANGED_ORIGINAL_TARGET', windows='NOT_RUN', visual='PENDING_CHANGED_CONTEXT',
    mainIntegration='NOT_PERFORMED', m24Complete=False))
print(dict(candidate=candidate, sourceMembers=len(records), newGroups=len(new_groups), totalGroups=len(manifest['groups']),
    savedPrior4xRawBytes=sum(r['savedRawBytes'] for r in preservation if r['density']==4),
    new4xRawBytes=sum(r['rawBytes'] for r in layouts if r['density']==4)))
