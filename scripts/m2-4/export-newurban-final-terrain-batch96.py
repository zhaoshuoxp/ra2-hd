"""Add complete source cohorts without changing any accepted atlas or guard."""
from collections import defaultdict
from copy import deepcopy
import json
import os
from pathlib import Path
import sys

import numpy as np
from newurban_batch95_io import layout
from newurban_batch96_io import BASELINE, GUIDE, ROOT, SOURCES, pack, pin, read, sha, write

version = sys.argv[1] if len(sys.argv) > 1 else 'v2'
author_version = sys.argv[2] if len(sys.argv) > 2 else 'v6'
authoring = read(ROOT / f'authoring-{author_version}.json')
expected_selection = BASELINE if version == 'v1' else read(ROOT / 'selection-v1.json')['candidate']
assert authoring['baseline'] == BASELINE
assert read('.local/terrain-newurban-selection.json') == expected_selection
base = Path('.local/terrain-packs') / BASELINE['revision']
assert sha(base / 'manifest.json') == BASELINE['sha256']
old = read(base / 'manifest.json')
manifest = deepcopy(old)
revision = f'newurban-m2-4-final-terrain-batch96-{version}'
destination = Path('.local/terrain-packs') / revision
destination.mkdir(exist_ok=False)
preserved = []
for group in old['groups']:
    for variant in group['variants']:
        file = base / variant['file']
        assert sha(file) == variant['sha256']
        os.link(file, destination / file.name)
        preserved.append(pin(destination / file.name))

cohorts = defaultdict(list)
records = deepcopy(authoring['records'])
for row in records:
    source = SOURCES[row['member']]
    assert row['sourceSha256'] == source['sha256'] == sha(GUIDE / 'native' / source['nativeFile'])
    definition = dict(member=source['member'], sourceHashes=dict(yr=source['sha256']),
        images=[{k: v for k, v in f.items() if k not in ['nativeOffset', 'size', 'file', 'rgbaSha256']}
                for f in source['images']])
    pieces = {}
    for density in [2, 4]:
        frames = [f for f in row['frames'] if f['density'] == density]
        assert [f['subTile'] for f in frames] == [f['subTile'] for f in source['images']]
        pieces[density] = []
        for frame in frames:
            assert pin(frame['output']['file']) == frame['output']
            pixels = np.fromfile(frame['output']['file'], np.uint8).reshape(*reversed(frame['size']), 4)
            pieces[density].append(pixels)
            frame['rgbaSha256'] = frame['output']['sha256']
            frame['nativePointer'] = source['images'][frame['subTile']]['nativeOffset']
    cohorts[source['setIndex'], tuple(sorted(row['maps']))].append((definition, pieces, row))

new_groups, layouts = [], []
for cohort, ((set_index, maps), entries) in enumerate(sorted(cohorts.items()), 1):
    chunks, chunk = [], []
    for entry in entries:
        if chunk and layout([p for _, values, _ in chunk + [entry] for p in values[4]]) is None:
            chunks.append(chunk); chunk = []
        chunk.append(entry)
    chunks.append(chunk)
    for part, chunk in enumerate(chunks, 1):
        group = dict(id=f'm2-4-newurban-final-set{set_index:03d}-cohort{cohort:02d}-part{part}',
            scope='COMPLETE_PHYSICAL_TMP_FAMILIES_ACCEPTED_HD_SURFACES_AND_REGISTERED_NATIVE_GUIDED_MASTERS',
            members=[definition for definition, _, _ in chunk], variants=[])
        if any(definition['member'] == 'cliffa07.ubn' for definition, _, _ in chunk):
            assert len(chunk) == 1
            group['contourReconstruction'] = dict(schema='hd-extra-contours-v1', maximumNativeDistance=1, protectMainBlock=True)
        for density in [2, 4]:
            layouts.append(pack(destination, group, density, [p for _, values, _ in chunk for p in values[density]]))
        for _, _, row in chunk:
            row['group'] = group['id']
        new_groups.append(group)

manifest['revision'] = revision
manifest['groups'] += new_groups
del manifest['deferredSources']
assert len(manifest['groups']) <= 256
with (destination / 'manifest.json').open('x') as stream:
    json.dump(manifest, stream, separators=(',', ':')); stream.write('\n')
assert (destination / 'manifest.json').stat().st_size <= 2 * 1024 ** 2
candidate = dict(schemaVersion=1, revision=revision, sha256=sha(destination / 'manifest.json'))
write(ROOT / f'source-{version}.json', dict(schema=1, theater='NEWURBAN', originalGuide=pin(GUIDE / 'source.json'),
    sources=[SOURCES[r['member']] for r in records]))
write(ROOT / f'export-{version}.json', dict(status='EXPORTED_21_COMPLETE_SOURCE_MEMBERS_NOT_SELECTED',
    baseline=BASELINE, candidate=candidate, authoring=pin(ROOT / f'authoring-{author_version}.json'),
    records=records, layouts=layouts, priorGroups=old['groups'], inheritedAtlasesExact=preserved,
    newSourceMembers=len(records), completeNewLoadFamilies=len(new_groups), selectedGroups=len(manifest['groups']),
    newMotherCount=2, resolvedPriorOriginalOnlyMembers=old['deferredSources']['members'],
    originalRgbUsedAsNewDetail=False, nativeMetadataAndDepth='ORIGINAL_TARGET',
    memoryBudgets='UNCHANGED_512_1280_MIB_WORLD_128_MIB_PREPARED_16_MIB_UI',
    native='NOT_RUN', visual='PENDING_CHANGED_CONTEXT', windows='NOT_RUN', m24Complete=False))
print(dict(candidate=candidate, sources=len(records), newGroups=len(new_groups),
    new4xRawBytes=sum(v['rawBytes'] for v in layouts if v['density'] == 4),
    groups=len(manifest['groups']), manifestBytes=(destination / 'manifest.json').stat().st_size))
