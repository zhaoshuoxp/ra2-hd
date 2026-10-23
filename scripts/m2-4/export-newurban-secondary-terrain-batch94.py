"""Reuse complete accepted Urban source families with target-owned NewUrban metadata."""
import hashlib
import os
from collections import defaultdict
from pathlib import Path

import numpy as np
from scipy import ndimage
from newurban_batch94_io import ROOT, GUIDE, adapt_grass, crop, grass_field, layout, native, pack, pin, read, sha, write

proof = read(ROOT / 'source-preparation-v2.json')
baseline = proof['baseline']
assert read('.local/terrain-newurban-selection.json') == baseline
assert read('desktop/terrain-theater-hd-contracts.json') == read(ROOT / 'baseline-contract.json')
base = Path('.local/terrain-packs') / baseline['revision']
assert sha(base / 'manifest.json') == baseline['sha256']
manifest = read(base / 'manifest.json')
sources = {s['member']: s for s in read(GUIDE / 'source.json')['sources']}
inventory = read('.artifacts/m2-4/newurban-tmp-material-reuse-batch93-20261020/inventory-newurban-v2/inventory.json')
revision = 'newurban-m2-4-secondary-terrain-reuse-batch94-v2'
destination = Path('.local/terrain-packs') / revision
destination.mkdir(exist_ok=False)
fields = {density: grass_field(baseline, density) for density in [2, 4]}
for density, field in fields.items():
    with (ROOT / f'accepted-newurban-grass-periodic-{density}x-v2.npy').open('xb') as stream:
        np.save(stream, field)
cohorts = defaultdict(list)
records = []
for row in proof['records']:
    source = sources[row['member']]
    assert source['sha256'] == row['sourceSha256'] == sha(row['targetOriginal']['file'])
    metadata = [{k: v for k, v in image.items() if k not in ['nativeOffset', 'size', 'file', 'rgbaSha256']}
                for image in source['images']]
    member = dict(member=source['member'], sourceHashes=dict(yr=source['sha256']), images=metadata)
    pieces = {2: [], 4: []}
    record = dict(member=source['member'], sourceSha256=source['sha256'], donorMember=row['donorMember'],
        donorGroup=row['donorGroup'], donorPack=proof['acceptedUrban'], targetSet=source['setIndex'],
        adaptation=row['adaptation'], maps=row['maps'], frames=[])
    for density in [2, 4]:
        for image in source['images']:
            original = native(source, image)
            pixels = crop(proof['acceptedUrban'], row['donorMember'], image['subTile'], density)
            assert pixels.shape[:2] == tuple(n * density for n in image['size'][::-1])
            donor_sha = hashlib.sha256(pixels.tobytes()).hexdigest()
            if image['nativeOffset'] <= 0:
                usages = [r['usage'] for r in inventory['rows'] if r['kind'] == 'tmp'
                          and r['source']['member'] == source['member']]
                assert usages and all(image['subTile'] not in value['values'] for use in usages for value in use.values())
                pixels = original.repeat(density, 0).repeat(density, 1)
                detail = dict(policy='UNREFERENCED_ZERO_POINTER_ORIGINAL_COMPATIBILITY_ONLY')
            elif row['adaptation'] == 'EXACT_ACCEPTED_URBAN_RGBA':
                detail = dict(policy='EXACT_REGISTERED_ACCEPTED_URBAN_RGBA', changedVisiblePixels=0)
            else:
                pixels, detail = adapt_grass(pixels, image, density, fields[density])
                detail['policy'] = row['adaptation']
            alpha = original[..., 3].repeat(density, 0).repeat(density, 1)
            changed_alpha = pixels[..., 3] != alpha
            if changed_alpha.any():
                missing = (pixels[..., 3] == 0) & (alpha > 0)
                nearest = ndimage.distance_transform_edt(pixels[..., 3] == 0,
                    return_distances=False, return_indices=True)
                pixels[missing, :3] = pixels[tuple(nearest)][missing, :3]
                pixels[..., 3] = alpha
                detail['targetCoverageAdapter'] = dict(changedSamples=int(changed_alpha.sum()),
                    addedVisibleSamples=int(missing.sum()), material='NEAREST_EXISTING_ACCEPTED_HD_SURFACE')
            assert np.array_equal(pixels[..., 3], alpha), source['member']
            record['frames'].append(dict(density=density, subTile=image['subTile'], nativePointer=image['nativeOffset'],
                rgbaSha256=hashlib.sha256(pixels.tobytes()).hexdigest(), acceptedDonorRgbaSha256=donor_sha, **detail))
            pieces[density].append(pixels)
    cohorts[source['setIndex']].append((member, pieces, record))
    records.append(record)

new_groups, layouts, partitions = [], [], []
for set_index, entries in sorted(cohorts.items()):
    chunks, chunk = [], []
    for entry in entries:
        proposed = [p for _, values, _ in chunk + [entry] for p in values[4]]
        if chunk and layout(proposed) is None:
            chunks.append(chunk)
            chunk = []
        chunk.append(entry)
    chunks.append(chunk)
    for index, chunk in enumerate(chunks):
        group = dict(id=f'm2-4-newurban-secondary-set{set_index:03d}-part{index + 1}',
            scope='COMPLETE_PHYSICAL_TMP_FAMILIES_ACCEPTED_URBAN_ART_TARGET_OWNED_NATIVE_RULES',
            members=[member for member, _, _ in chunk], variants=[])
        for density in [2, 4]:
            layouts.append(pack(destination, group, density, [p for _, values, _ in chunk for p in values[density]]))
        for _, _, record in chunk:
            record['group'] = group['id']
        new_groups.append(group)
    partitions.append(dict(setIndex=set_index, sourceMembers=len(entries), completeLoadFamilies=len(chunks)))
assert len(manifest['groups']) + len(new_groups) <= 64, 'Keep the existing loader group limit'
preserved = []
for group in manifest['groups']:
    for variant in group['variants']:
        file = base / variant['file']
        assert sha(file) == variant['sha256']
        os.link(file, destination / variant['file'])
        preserved.append(pin(file))
manifest['groups'] += new_groups
manifest['revision'] = revision
write(destination / 'manifest.json', manifest)
candidate = dict(schemaVersion=1, revision=revision, sha256=sha(destination / 'manifest.json'))
write(ROOT / 'source.json', dict(schema='m2-4-pinned-newurban-secondary-terrain-v1', theater='NEWURBAN',
    originalGuide=pin(GUIDE / 'source.json'), sources=[sources[row['member']] for row in proof['records']]))
frames = [frame for row in records for frame in row['frames']]
write(ROOT / 'export-and-preservation-v2.json', dict(
    status='EXPORTED_111_COMPLETE_ACCEPTED_SOURCE_FAMILIES_NOT_SELECTED', baseline=baseline, candidate=candidate,
    preparation=pin(ROOT / 'source-preparation-v2.json'), acceptedUrban=proof['acceptedUrban'], records=records,
    layouts=layouts, partitions=partitions, members=len(records), completeNewLoadFamilies=len(new_groups),
    priorGroupsExact=len(manifest['groups']) - len(new_groups), densitySlots=len(frames),
    authoredDensitySlots=sum(f['nativePointer'] > 0 for f in frames),
    compatibilityDensitySlots=sum(f['nativePointer'] <= 0 for f in frames),
    exactAcceptedDensitySlots=sum(f['policy'] == 'EXACT_REGISTERED_ACCEPTED_URBAN_RGBA' for f in frames),
    adaptedGrassDensitySlots=sum(f['policy'].startswith('ACCEPTED_NEWURBAN_GRASS') for f in frames),
    preservedPayloads=preserved, grassMaterial=baseline, selectedNewMothers=0,
    originalRgbUsedAsHdDetail=False, targetGeometryRulesDepth='UNCHANGED_TARGET_ORIGINAL',
    maximumAtlasSide=2048, maximumGroups=64, native='NOT_RUN', visual='PENDING_CHANGED_CONTEXT',
    windows='NOT_RUN', mainIntegration='NOT_PERFORMED', m24Complete=False))
print(dict(candidate=candidate, members=len(records), newGroups=len(new_groups), totalGroups=len(manifest['groups']),
    densitySlots=len(frames), authored=sum(f['nativePointer'] > 0 for f in frames), partitions=partitions))
