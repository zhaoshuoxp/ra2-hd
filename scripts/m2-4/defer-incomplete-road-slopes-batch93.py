"""Keep four unresolved slope projections explicit and return their complete family to Original."""
import copy
import json
import os
from pathlib import Path
from newurban_batch93_io import ROOT, pin, read, sha, write

previous = read(ROOT / 'export-and-preservation-v6.json')
assert read('.local/terrain-newurban-selection.json') == previous['candidate']
base = Path('.local/terrain-packs') / previous['candidate']['revision']
manifest = read(base / 'manifest.json')
deferred, = [g for g in manifest['groups'] if g['id'] == 'm2-4-newurban-accepted-road-set47']
names = [m['member'] for m in deferred['members']]
assert sorted(names) == [f'prslpe0{n}.ubn' for n in range(1, 5)]
revision = 'newurban-m2-4-accepted-road-network-batch93-v7'
destination = Path('.local/terrain-packs') / revision
destination.mkdir(exist_ok=False)
omitted = {v['file'] for v in deferred['variants']}
for file in base.iterdir():
    if file.is_file() and file.name != 'manifest.json' and file.name not in omitted:
        os.link(file, destination / file.name)
manifest['groups'] = [g for g in manifest['groups'] if g['id'] != deferred['id']]
manifest['revision'] = revision
manifest['deferredSources'] = dict(reason='UNRESOLVED_HD_SLOPE_PAINT_PROJECTION_AND_CONTACTS',
    members=names, rendering='COMPLETE_ORIGINAL_FAMILY', countedAsAuthored=False,
    mapsRetained=True, originalGeometryDepthAndRulesUnchanged=True)
write(destination / 'manifest.json', manifest)
candidate = dict(schemaVersion=1, revision=revision, sha256=sha(destination / 'manifest.json'))
export = copy.deepcopy(previous)
export['records'] = [r for r in export['records'] if r['member'] not in names]
assert len(export['records']) == 30
export.update(status='EXPORTED_30_ROAD_SOURCES_WITH_FOUR_EXPLICIT_UNRESOLVED_ORIGINAL_SLOPES',
    candidate=candidate, newMembers=30, totalMembers=34, newCompleteLoadFamilies=25,
    layouts=[r for r in previous['layouts'] if r['group'] != deferred['id']],
    inheritedNativeSourcePaths=30, updatedNativeSourcePaths=0,
    deferredSources=manifest['deferredSources'],
    sourceDensitySlots=548, authoredDensitySlots=508, originalUnreferencedCompatibilityDensitySlots=40)
write(ROOT / 'export-and-preservation-v7.json', export)
write(ROOT / 'explicit-slope-original-fallback-v1.json', dict(
    status='FOUR_NAMED_UNRESOLVED_FAMILIES_REMAIN_COVERAGE_GAPS_NOT_A_PASS',
    previous=previous['candidate'], candidate=candidate, deferredFamily=deferred,
    sourceMembers=names, completeFamilyFallback='ORIGINAL', countedAsCovered=False,
    visualFinding='The attempted transplanted projection and native-anchor stroke reconstruction did not produce acceptable complete slope contacts. Do not select their HD pixels or ask the user to approve a known incomplete result.',
    retainedAttempts=[pin(ROOT / name) for name in ['export-and-preservation-v4.json', 'export-and-preservation-v5.json',
        'export-and-preservation-v6.json', 'accepted-desert-slope-r2-reuse-v1.json', 'target-projected-slope-paint-v1.json']],
    maps='All eight original official NewUrban maps remain selectable and runnable. No source tile, map, native parameter or ordinary mechanism is removed or changed.',
    unchangedNewRoadSources=30, allPriorTerrainGroupsExact=22,
    remainingAuthoredNewUrbanGroups=184, remainingByKind=dict(tmp=168, building=13, infantry=2, overlay=1),
    nativeFallback='NOT_RUN', windows='NOT_RUN', mainIntegration='NOT_PERFORMED', m24Complete=False))
contract = read('desktop/terrain-theater-hd-contracts.json')
assert contract['NEWURBAN'] == previous['candidate']
contract['NEWURBAN'] = candidate
write(ROOT / 'contract-candidate-v4.json', contract)
write(ROOT / 'selection-v4.json', dict(status='SAFE_30_SOURCE_SELECTION_FOUR_SLOPES_EXPLICIT_ORIGINAL',
    candidate=candidate, previous=previous['candidate'], decision=pin(ROOT / 'explicit-slope-original-fallback-v1.json'),
    pending='Final selected-app fallback/lifecycle check and grouped review of the other thirty sources.',
    windows='NOT_RUN', m24Complete=False))
Path('desktop/terrain-theater-hd-contracts.json').write_text(json.dumps(contract, indent=2) + '\n')
Path('.local/terrain-newurban-selection.json').write_text(json.dumps(candidate, indent=2) + '\n')
print(dict(candidate=candidate, newCoveredSources=30, unresolvedOriginalSlopes=4, remainingAuthoredGroups=184))
