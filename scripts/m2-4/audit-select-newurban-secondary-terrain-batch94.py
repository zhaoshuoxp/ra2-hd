"""Independently verify every crop and complete family before selecting the pack."""
import hashlib
import itertools
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image
from newurban_batch94_io import ROOT, GUIDE, assemble, crop, native, pin, read, sha, write

export = read(ROOT / 'export-and-preservation-v4.json')
pointer, baseline = export['candidate'], export['baseline']
base = Path('.local/terrain-packs') / baseline['revision']
destination = Path('.local/terrain-packs') / pointer['revision']
assert sha(destination / 'manifest.json') == pointer['sha256']
old, selected = read(base / 'manifest.json'), read(destination / 'manifest.json')
assert 64 < len(selected['groups']) <= 256
assert selected['deferredSources'] == old['deferredSources']
assert selected['groups'][:47] and len(old['groups']) == 47
prior_slots = 0
for before, after in zip(old['groups'], selected['groups'][:47], strict=True):
    assert {k: v for k, v in before.items() if k != 'variants'} == {k: v for k, v in after.items() if k != 'variants'}
    for member in before['members']:
        for density in [2, 4]:
            for frame in member['images']:
                assert np.array_equal(crop(baseline, member['member'], frame['subTile'], density),
                                      crop(pointer, member['member'], frame['subTile'], density))
                prior_slots += 1
for index, group in enumerate(selected['groups']):
    assert sorted(v['density'] for v in group['variants']) == [2, 4]
    for variant in group['variants']:
        file = destination / variant['file']
        assert sha(file) == variant['sha256'] and file.stat().st_size == np.prod(variant['size']) * 4
        old_limit = max(next(v for v in old['groups'][index]['variants'] if v['density'] == variant['density'])['size']) if index < 47 else 2048
        assert max(variant['size']) <= max(2048, old_limit)
        assert len(variant['rects']) == sum(len(m['images']) for m in group['members'])
sources = {s['member']: s for s in read(ROOT / 'source.json')['sources']}
assert len(sources) == len(export['records']) == 111
preparation = read(ROOT / 'source-preparation-v2.json')
assert all(f['targetDepth'] == f['donorDepth'] for row in preparation['records']
           for f in row['frames'] if f['nativePointer'] > 0)
counts, coverage = Counter(), []
for row in export['records']:
    source = sources[row['member']]
    definition, = [m for g in selected['groups'] if g['id'] == row['group'] for m in g['members'] if m['member'] == row['member']]
    assert definition['sourceHashes'] == dict(yr=source['sha256'])
    assert definition['images'] == [{k: v for k, v in image.items()
        if k not in ['nativeOffset', 'size', 'file', 'rgbaSha256']} for image in source['images']]
    for frame in row['frames']:
        density, slot = frame['density'], frame['subTile']
        pixels = crop(pointer, row['member'], slot, density)
        donor = crop(row['donorPack'], row['donorMember'], slot, density)
        assert hashlib.sha256(pixels.tobytes()).hexdigest() == frame['rgbaSha256']
        original = native(source, source['images'][slot])
        assert np.array_equal(pixels[..., 3], original[..., 3].repeat(density, 0).repeat(density, 1))
        if frame['nativePointer'] <= 0:
            assert np.array_equal(pixels, original.repeat(density, 0).repeat(density, 1))
            counts['originalCompatibilityDensitySlots'] += 1
        elif frame['policy'] == 'EXACT_REGISTERED_ACCEPTED_URBAN_RGBA':
            unchanged = (donor[..., 3] > 0) & (pixels[..., 3] > 0)
            assert np.array_equal(pixels[unchanged], donor[unchanged])
            counts['exactAcceptedDensitySlots' if np.array_equal(pixels, donor)
                   else 'boundedTargetCoverageDensitySlots'] += 1
        else:
            assert row['targetSet'] in [80, 87, 103] and np.array_equal(pixels[..., 3], donor[..., 3])
            counts['adaptedGrassDensitySlots'] += 1
        counts['densitySlots'] += 1
        if frame.get('targetCoverageAdapter'):
            coverage.append(dict(member=row['member'], **frame))
    for density in [2, 4]:
        panel, _ = assemble([(image, crop(pointer, source['member'], image['subTile'], density))
                             for image in source['images'] if image['nativeOffset'] > 0], density)
        folder = ROOT / 'registered-assemblies-v1'
        folder.mkdir(exist_ok=True)
        panel.save(folder / f'{source["member"]}-{density}x.png')
write(ROOT / 'static-audit-v2.json', dict(status='PASS_111_COMPLETE_SOURCES_ALL_NEW_AND_PRIOR_CROPS',
    candidate=pointer, members=111, completeNewLoadFamilies=export['completeNewLoadFamilies'],
    selectedGroups=len(selected['groups']), priorCroppedDensitySlotsExact=prior_slots,
    priorMemberMetadataExact=47, counts=dict(counts), targetCoverageAdapters=coverage,
    old4xRawBytesSaved=sum(row['savedRawBytes'] for row in export['losslessPriorPacking'] if row['density'] == 4),
    selectedNewMothers=0, memoryBudgets='UNCHANGED', windows='NOT_RUN', visual='PENDING_CHANGED_CONTEXT', m24Complete=False))

all_members = {row['member'] for row in export['records']}
maps = sorted({name for row in export['records'] for name in row['maps']})
cover = {name: {row['member'] for row in export['records'] if name in row['maps']} for name in maps}
solutions = []
for size in range(1, len(maps) + 1):
    solutions = [combination for combination in itertools.combinations(maps, size)
                 if set().union(*(cover[name] for name in combination)) == all_members]
    if solutions:
        break
chosen, remaining, cases = set(solutions[0]), set(all_members), []
while chosen:
    map_id = max(sorted(chosen), key=lambda name: len(cover[name] & remaining))
    new_members = sorted(cover[map_id] & remaining)
    captures = []
    for set_index in sorted({row['targetSet'] for row in export['records'] if row['member'] in new_members}):
        values = [row['member'] for row in export['records'] if row['member'] in new_members and row['targetSet'] == set_index]
        captures += values if set_index in [23, 80, 87, 103] else values[:1]
    cases.append(dict(mapId=map_id, newMembers=new_members, captureMembers=sorted(set(captures))))
    chosen.remove(map_id)
    remaining -= cover[map_id]
assert not remaining
write(ROOT / 'native-case-plan-v1.json', dict(status='MINIMUM_ORIGINAL_MAP_SOURCE_PATH_COVER', cases=cases,
    members=111, densityPaths=222, mapCount=len(cases), selectionBasis='Exhaustive source membership set cover; every original source path checked once per density, without repeated long matches.'))
assert read('.local/terrain-newurban-selection.json') == baseline
contract = read(ROOT / 'baseline-contract.json')
assert read('desktop/terrain-theater-hd-contracts.json') == contract
contract['NEWURBAN'] = pointer
Path('desktop/terrain-theater-hd-contracts.json').write_text(__import__('json').dumps(contract, indent=2) + '\n')
Path('.local/terrain-newurban-selection.json').write_text(__import__('json').dumps(pointer, indent=2) + '\n')
write(ROOT / 'selection-v2.json', dict(status='SELECTED_AFTER_INDEPENDENT_STATIC_AUDIT_NATIVE_PENDING',
    candidate=pointer, audit=pin(ROOT / 'static-audit-v2.json'), baseline=baseline, deferredOriginalSlopes=4,
    native='NOT_RUN', windows='NOT_RUN', m24Complete=False))
print(dict(status='PASS_STATIC_SELECTED', candidate=pointer, counts=dict(counts), priorSlotsExact=prior_slots,
    nativeCases=[dict(map=c['mapId'], paths=len(c['newMembers']), captures=len(c['captureMembers'])) for c in cases]))
