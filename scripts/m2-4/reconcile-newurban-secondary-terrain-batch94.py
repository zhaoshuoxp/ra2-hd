"""Reconcile the unchanged official catalog against 111 complete reused terrain sources."""
from collections import Counter
import subprocess
from pathlib import Path
from newurban_batch94_io import ROOT, pin, read, write

parent_file = Path('.artifacts/m2-4/newurban-tmp-material-reuse-batch93-20261020/inventory-reconciliation-v3.json')
parent = read(parent_file)
current_file = ROOT / 'inventory-newurban-v2/inventory.json'
current, old = read(current_file), read(parent['currentInventory']['file'])
assert pin(parent['currentInventory']['file']) == parent['currentInventory']
assert current['archivePins'] == old['archivePins'] and not current['issues']
identity = lambda data: {m['mapId']: {key: m[key] for key in ['source', 'catalogSource', 'declaration',
    'classification', 'gameplayStatus']} for m in data['maps']}
assert identity(current) == identity(old) and len(current['maps']) == 8
credits = {row['key']: row for row in parent['creditedSourceGroups']}
raw = [group for group in current['resourceGroups'] if group['theater'] == 'NEWURBAN'
       and 'MISSING_AUTHORED_FAMILY' in group['decisions']]
rows, before = {r['key']: r for r in current['rows']}, {r['key']: r for r in old['rows']}
fields = ['edition', 'theater', 'kind', 'id', 'source', 'dependencies', 'palette', 'hasShadow',
          'remapable', 'drawOffset', 'paletteType', 'nativeArt', 'nativeRules']
for group in raw:
    if group['key'] in credits:
        assert group['sha256'] == credits[group['key']]['sha256']
        assert all(rows[key].get(field) == before[key].get(field) for key in group['rowKeys'] for field in fields)
remaining = [group for group in raw if group['key'] not in credits]
remaining_keys = {row['key'] for row in remaining}
covered = [row for row in parent['remainingGaps'] if row['key'] not in remaining_keys]
export = read(ROOT / 'export-and-preservation-v5.json')
assert len(raw) == 121 and len(remaining) == 73 and len(covered) == 111
assert {row['member'] for row in covered} == {row['member'] for row in export['records']}
assert all(row['kind'] == 'tmp' for row in covered)
assert current['selectedResources']['theaters']['NEWURBAN']['terrain'] == export['candidate']
slopes = {'prslpe01.ubn', 'prslpe02.ubn', 'prslpe03.ubn', 'prslpe04.ubn'}
assert slopes <= {row['member'] for row in remaining}
runtime = read(ROOT / 'active-stage-v2.json')['runtimeSourceHead']
changes = subprocess.check_output(['git', 'diff', parent['sourceRuntimeCommit'], runtime,
    '--name-only', '--', 'src', 'desktop'], text=True).splitlines()
assert sorted(changes) == sorted(['desktop/terrain-theater-hd-contracts.json',
    'src/engine/renderable/entity/map/TerrainHd.ts', 'src/engine/renderable/entity/map/terrainHdContract.ts'])
write(ROOT / 'inventory-reconciliation-v1.json', dict(
    status='PASS_111_NEW_TERRAIN_SOURCES_ALL_EIGHT_OFFICIAL_MAP_IDENTITIES_RETAINED',
    currentInventory=pin(current_file), parentReconciliation=pin(parent_file), priorInventory=parent['currentInventory'],
    rawScannerMissingAuthoredGroups=len(raw), unchangedAcceptedFactionGroupsCredited=len(credits),
    creditedSourceGroups=list(credits.values()), acceptedFactionEvidence=parent['acceptedFactionEvidence'],
    sourceRuntimeCommit=runtime, applicationDifferences=changes,
    sharedLoaderChange='Bounded declaration admission 64 to 256; validation, budgets, fallback, simulation and source metadata are unchanged.',
    newCoveredSourceGroups=covered, remainingAuthoredGaps=len(remaining),
    remainingByKind=dict(Counter(row['kind'] for row in remaining)), remainingGaps=remaining,
    deferredSlopes=sorted(slopes), unresolvedDependencyGroups=parent['unresolvedDependencyGroups'],
    **{key: parent[key] for key in ['directoryEntries', 'uniqueMapFiles', 'uniqueMapStreams', 'selectableMaps',
        'sourceModeVariants', 'overlappingSourceModeLabels']},
    disclosure='111 complete source groups add both densities. Existing cropped artwork and filter guards remain exact. Four unresolved wide-road slopes remain missing and Original. No map, source, mechanism or conditional dependency is dropped.',
    windows='NOT_RUN', visual='PENDING_CHANGED_GRASS_AND_NATIVE_CONTEXT', mainIntegration='NOT_PERFORMED', m24Complete=False))
print(dict(covered=111, remaining=73, byKind=dict(Counter(row['kind'] for row in remaining))))
