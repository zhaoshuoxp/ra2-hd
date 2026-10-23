"""Verify complete new cohorts and immutable inherited atlases before selection."""
from collections import Counter
import hashlib
import itertools
import json
from pathlib import Path
import sys

import numpy as np
from scipy import ndimage
from newurban_batch96_io import BASELINE, PRIOR, ROOT, SOURCES, crop, native, pin, read, sha, write

version = sys.argv[1] if len(sys.argv) > 1 else 'v2'
export = read(ROOT / f'export-{version}.json')
assert read(ROOT / f'target-native-metadata-{version}.json')['candidate'] == export['candidate']
candidate = export['candidate']
base, destination = [Path('.local/terrain-packs') / p['revision'] for p in [BASELINE, candidate]]
assert sha(base / 'manifest.json') == BASELINE['sha256']
assert sha(destination / 'manifest.json') == candidate['sha256']
old, current = [read(p / 'manifest.json') for p in [base, destination]]
assert current['groups'][:len(old['groups'])] == old['groups'] == export['priorGroups']
assert len(old['groups']) == 98 and len(current['groups']) == 110
preserved = []
for group in old['groups']:
    for variant in group['variants']:
        assert sha(base / variant['file']) == sha(destination / variant['file']) == variant['sha256']
        preserved.append(dict(group=group['id'], density=variant['density'], atlas=pin(destination / variant['file'])))

inventory_file = Path('.artifacts/m2-4/newurban-secondary-terrain-reuse-batch94-20261021/inventory-newurban-v2/inventory.json')
inventory = read(inventory_file)
counts, coverage = Counter(), []
for row in export['records']:
    source = SOURCES[row['member']]
    assert pin(row['original']['file']) == row['original']
    member, = [m for g in current['groups'] if g['id'] == row['group'] for m in g['members'] if m['member'] == row['member']]
    assert member['sourceHashes'] == dict(yr=source['sha256'])
    assert member['images'] == [{k: v for k, v in f.items() if k not in ['nativeOffset', 'size', 'file', 'rgbaSha256']} for f in source['images']]
    for frame in row['frames']:
        d, slot = frame['density'], frame['subTile']
        p = crop(candidate, row['member'], slot, d)
        assert hashlib.sha256(p.tobytes()).hexdigest() == frame['rgbaSha256']
        original = native(source, source['images'][slot])
        alpha = original[..., 3].repeat(d, 0).repeat(d, 1)
        if frame['nativePointer'] <= 0:
            assert np.array_equal(p, original.repeat(d, 0).repeat(d, 1))
            usages = [r['usage'] for r in inventory['rows'] if r['kind'] == 'tmp' and r['source']['member'] == row['member']]
            assert usages and all(slot not in value['values'] for usage in usages for value in usage.values())
            counts['unreferencedOriginalCompatibilityDensitySlots'] += 1
        else:
            assert not frame['originalRgbUsedAsNewDetail']
            if row['member'] == 'cliffa07.ubn' and slot == 1:
                assert np.array_equal(p[59 * d:, :, 3], alpha[59 * d:])
                extra = (p[..., 3] > 128) & (alpha == 0)
                distance = ndimage.distance_transform_edt(alpha == 0) / d
                maximum = float(distance[extra].max()) if extra.any() else 0
                assert maximum <= 1.1
                coverage.append(dict(member=row['member'], subTile=slot, density=d,
                    smoothExtraEdgeInsideOriginalCanvas=True, addedOpaqueSamples=int(extra.sum()),
                    maximumAddedDistanceNativePixels=maximum, nativeMainDiamondExact=True))
            else:
                assert np.array_equal(p[..., 3], alpha)
            counts['authoredDensitySlots'] += 1
        counts['densitySlots'] += 1

for group in current['groups']:
    assert sorted(v['density'] for v in group['variants']) == [2, 4]
    for variant in group['variants']:
        file = destination / variant['file']
        assert sha(file) == variant['sha256'] and file.stat().st_size == int(np.prod(variant['size']) * 4)
        assert len(variant['rects']) == sum(len(m['images']) for m in group['members'])
        for x, y, w, h in variant['rects']:
            assert x >= 2 and y >= 2 and w > 0 and h > 0
            assert x + w + 2 <= variant['size'][0] and y + h + 2 <= variant['size'][1]

write(ROOT / f'static-audit-{version}.json', dict(status='PASS_21_COMPLETE_SOURCES_AND_ALL_98_INHERITED_ATLASES_EXACT',
    candidate=candidate, newMembers=21, newCompleteLoadFamilies=12, totalGroups=110,
    inheritedGroupMetadataExact=98, inheritedCompleteAtlasesExact=len(preserved),
    inheritedDensitySamplesAndFilterGuardsExact=sum(len(v['rects']) for g in old['groups'] for v in g['variants']),
    inheritedEvidence=pin(PRIOR / 'static-audit-v3.json'), preservationBasis='ENTIRE_ATLAS_BYTES_AND_RECTS_EXACT',
    preservedAtlases=preserved, counts=dict(counts), smoothExtraEdgeAdapters=coverage,
    nativeMetadata=pin(ROOT / f'target-native-metadata-{version}.json'), originalMapsModified=False,
    manifestBytes=(destination / 'manifest.json').stat().st_size, budgets='UNCHANGED',
    native='NOT_RUN', visual='PENDING_CHANGED_CONTEXT', windows='NOT_RUN', m24Complete=False))

members = {r['member'] for r in export['records']}
maps = sorted({m for r in export['records'] for m in r['maps']})
cover = {m: {r['member'] for r in export['records'] if m in r['maps']} for m in maps}
for size in range(1, len(maps) + 1):
    solutions = [c for c in itertools.combinations(maps, size) if set.union(*(cover[m] for m in c)) == members]
    if solutions:
        break
chosen = ('yr:downtown.map', 'yr:manhatta.map', 'yr:rushhr.map', 'yr:turfwar.map')
assert chosen in solutions and size == 4
remaining, cases = set(members), []
for map_id in chosen:
    added = sorted(cover[map_id] & remaining)
    cases.append(dict(mapId=map_id, newMembers=added, captureMembers=added))
    remaining -= set(added)
assert not remaining
write(ROOT / f'native-case-plan-{version}.json', dict(status='MINIMUM_FOUR_ORIGINAL_MAP_SOURCE_PATH_COVER',
    cases=cases, sourceMembers=21, densityPaths=42, mapCount=4,
    selectionBasis='Exhaustive minimum cover over original source dependencies; Downtown contains all four wide-road orientations. Each newly selected source receives one actual-map binding and native-tick check per density. Original return and cross-theater release are incremental lifecycle checks.'))

expected_selection = BASELINE if version == 'v1' else read(ROOT / 'selection-v1.json')['candidate']
assert read('.local/terrain-newurban-selection.json') == expected_selection
contract = read('desktop/terrain-theater-hd-contracts.json')
expected_contract = read(ROOT / 'baseline-contract.json'); expected_contract['NEWURBAN'] = expected_selection
assert contract == expected_contract
contract['NEWURBAN'] = candidate
Path('desktop/terrain-theater-hd-contracts.json').write_text(json.dumps(contract, indent=2) + '\n')
Path('.local/terrain-newurban-selection.json').write_text(json.dumps(candidate, indent=2) + '\n')
write(ROOT / f'selection-{version}.json', dict(status='SELECTED_AFTER_STATIC_AUDIT_NATIVE_PENDING', candidate=candidate,
    baseline=BASELINE, audit=pin(ROOT / f'static-audit-{version}.json'), native='NOT_RUN', windows='NOT_RUN', m24Complete=False))
print(dict(status='PASS_STATIC_SELECTED_NATIVE_PENDING', counts=dict(counts),
    cases=[dict(map=c['mapId'], paths=len(c['newMembers'])) for c in cases]))
