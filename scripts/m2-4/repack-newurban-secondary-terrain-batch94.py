"""Preserve every sample while limiting residency to complete source dependencies."""
from collections import defaultdict
from copy import deepcopy
import os
from pathlib import Path

from newurban_batch94_io import ROOT, crop, layout, pack, pin, read, sha, write

prior = read(ROOT / 'export-and-preservation-v2.json')
baseline = prior['baseline']
old_root = Path('.local/terrain-packs') / baseline['revision']
new_root = Path('.local/terrain-packs') / prior['candidate']['revision']
old = read(old_root / 'manifest.json')
source = read(new_root / 'manifest.json')
revision = 'newurban-m2-4-secondary-terrain-reuse-batch94-v4'
destination = Path('.local/terrain-packs') / revision
destination.mkdir(exist_ok=False)
manifest = deepcopy(old)
old_audits, layouts = [], []
for group in manifest['groups']:
    previous = deepcopy(group['variants'])
    group['variants'] = []
    for variant in previous:
        density = variant['density']
        pieces = [crop(baseline, member['member'], frame['subTile'], density)
                  for member in group['members'] for frame in member['images']]
        maximum_side = max(2048, *variant['size'])
        placement = layout(pieces, maximum_side)
        old_bytes = variant['size'][0] * variant['size'][1] * 4
        if placement and placement[2][0] * placement[2][1] * 4 < old_bytes:
            row = pack(destination, group, density, pieces, maximum_side)
            row['previousRawBytes'] = old_bytes
            row['savedRawBytes'] = old_bytes - row['rawBytes']
            old_audits.append(row)
        else:
            file = old_root / variant['file']
            assert sha(file) == variant['sha256']
            os.link(file, destination / variant['file'])
            group['variants'].append(variant)
            old_audits.append(dict(group=group['id'], density=density, slots=len(pieces),
                previousRawBytes=old_bytes, rawBytes=old_bytes, savedRawBytes=0))
records = deepcopy(prior['records'])
definitions = {m['member']: m for g in source['groups'][47:] for m in g['members']}
cohorts = defaultdict(list)
for row in records:
    pieces = {density: [crop(prior['candidate'], row['member'], frame['subTile'], density)
                        for frame in definitions[row['member']]['images']] for density in [2, 4]}
    # Dependency sets determine residency, never artwork coordinates or map edits.
    cohorts[(row['targetSet'], tuple(sorted(row['maps'])))].append((row, pieces))
new_groups = []
for number, ((set_index, maps), entries) in enumerate(sorted(cohorts.items()), 1):
    chunks, chunk = [], []
    for entry in entries:
        if chunk and layout([p for _, values in chunk + [entry] for p in values[4]]) is None:
            chunks.append(chunk)
            chunk = []
        chunk.append(entry)
    chunks.append(chunk)
    for index, chunk in enumerate(chunks):
        group = dict(id=f'm2-4-newurban-secondary-set{set_index:03d}-cohort{number:02d}-part{index + 1}',
            scope='COMPLETE_PHYSICAL_TMP_FAMILIES_SHARED_NATIVE_DEPENDENCY_SET',
            members=[definitions[row['member']] for row, _ in chunk], variants=[])
        for density in [2, 4]:
            layouts.append(pack(destination, group, density, [p for _, values in chunk for p in values[density]]))
        for row, _ in chunk:
            row['group'] = group['id']
        new_groups.append(group)
manifest['groups'] += new_groups
assert len(manifest['groups']) <= 256
manifest['revision'] = revision
write(destination / 'manifest.json', manifest)
candidate = dict(schemaVersion=1, revision=revision, sha256=sha(destination / 'manifest.json'))
write(ROOT / 'export-and-preservation-v4.json', dict(prior,
    status='EXPORTED_111_COMPLETE_FAMILIES_WITH_LOSSLESS_RESIDENCY_PACKING_NOT_SELECTED',
    candidate=candidate, initialCandidate=prior['candidate'], records=records, layouts=layouts,
    priorGroupsExact=None, priorMemberMetadataExact=47, priorCroppedPayloadsExact=True,
    losslessPriorPacking=old_audits, completeNewLoadFamilies=len(new_groups), totalGroups=len(manifest['groups']),
    maximumGroups=256, memoryBudgets='UNCHANGED_512_1280_MIB_WORLD_128_MIB_PREPARED_16_MIB_UI',
    maximumNewAtlasSide=2048,
    maximumAtlasSide=max(max(v['size']) for g in manifest['groups'] for v in g['variants']),
    policy='Every existing and new logical crop is retained. Only duplicate samples, empty atlas space and co-residency change. Each physical source remains complete. Deferred Original slopes and all expected resources remain explicit.'))
print(dict(candidate=candidate, newLoadGroups=len(new_groups), totalGroups=len(manifest['groups']),
    savedPrior4xRawBytes=sum(r['savedRawBytes'] for r in old_audits if r['density'] == 4)))
