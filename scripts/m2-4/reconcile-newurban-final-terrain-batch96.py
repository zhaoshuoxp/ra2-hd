"""Reconcile source coverage without dropping any official map identity or gap."""
from collections import Counter
from pathlib import Path
import subprocess
from newurban_batch96_io import PRIOR, ROOT, pin, read, write

parent_file = PRIOR / 'inventory-reconciliation-v1.json'
parent = read(parent_file)
current_file = ROOT / 'inventory-newurban-v1/inventory.json'
current, before = read(current_file), read(parent['currentInventory']['file'])
assert pin(parent['currentInventory']['file']) == parent['currentInventory']
assert current['archivePins'] == before['archivePins'] and not current['issues']
identity = lambda data: {m['mapId']: {k: m[k] for k in
    ['source', 'catalogSource', 'declaration', 'classification', 'gameplayStatus']} for m in data['maps']}
assert identity(current) == identity(before) and len(current['maps']) == 8
credits = {g['key']: g for g in parent['creditedSourceGroups']}
raw = [g for g in current['resourceGroups'] if g['theater'] == 'NEWURBAN' and 'MISSING_AUTHORED_FAMILY' in g['decisions']]
now_rows, old_rows = [{r['key']: r for r in data['rows']} for data in [current, before]]
fields = ['edition', 'theater', 'kind', 'id', 'source', 'dependencies', 'palette', 'hasShadow',
          'remapable', 'drawOffset', 'paletteType', 'nativeArt', 'nativeRules']
for group in raw:
    if group['key'] in credits:
        assert group['sha256'] == credits[group['key']]['sha256']
        assert all(now_rows[key].get(field) == old_rows[key].get(field)
                   for key in group['rowKeys'] for field in fields)
remaining = [g for g in raw if g['key'] not in credits]
remaining_keys = {g['key'] for g in remaining}
covered = [g for g in parent['remainingGaps'] if g['key'] not in remaining_keys]
export = read(ROOT / 'export-v2.json')
assert len(raw) == 64 and len(remaining) == 16 and len(covered) == 21
assert {g['member'] for g in covered} == {r['member'] for r in export['records']}
assert all(g['kind'] == 'tmp' for g in covered)
assert all(g['kind'] != 'tmp' for g in remaining)
assert current['selectedResources']['theaters']['NEWURBAN']['terrain'] == export['candidate']
runtime = read(ROOT / 'active-stage-v1.json')['runtimeSourceHead']
changes = subprocess.check_output(['git', 'diff', parent['sourceRuntimeCommit'], runtime,
    '--name-only', '--', 'src', 'desktop'], text=True).splitlines()
assert changes == ['desktop/terrain-theater-hd-contracts.json']
write(ROOT / 'inventory-reconciliation-v1.json', dict(
    status='PASS_21_TERRAIN_SOURCES_ALL_EIGHT_OFFICIAL_MAP_IDENTITIES_RETAINED',
    currentInventory=pin(current_file), parentReconciliation=pin(parent_file), priorInventory=parent['currentInventory'],
    rawScannerMissingAuthoredGroups=64, unchangedAcceptedFactionGroupsCredited=len(credits),
    creditedSourceGroups=list(credits.values()), acceptedFactionEvidence=parent['acceptedFactionEvidence'],
    sourceRuntimeCommit=runtime, applicationDifferences=changes, sharedRuntimeCodeChanged=False,
    newCoveredSourceGroups=covered, remainingAuthoredGaps=16,
    remainingByKind=dict(Counter(g['kind'] for g in remaining)), remainingGaps=remaining,
    deferredSlopes=[], unresolvedDependencyGroups=parent['unresolvedDependencyGroups'],
    **{key: parent[key] for key in ['directoryEntries', 'uniqueMapFiles', 'uniqueMapStreams', 'selectableMaps',
                                   'sourceModeVariants', 'overlappingSourceModeLabels']},
    disclosure='All remaining physical TMP sources now have complete density candidates. Forty unused zero-pointer slots retain Original compatibility data without HD credit. All native map identities, declarations, rules and mechanisms remain. Sixteen non-terrain source gaps and conditional dependencies remain explicit; visual acceptance and full M2.4 closure are separate.',
    native='REPORTED_SEPARATELY_IN_CLOSURE', windows='NOT_RUN', visual='PENDING_NEW_CONTEXT',
    mainIntegration='NOT_PERFORMED', m24Complete=False))
print(dict(newTerrain=21, remaining=16, byKind=dict(Counter(g['kind'] for g in remaining))))
