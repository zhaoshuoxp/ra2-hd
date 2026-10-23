"""Reconcile all eight unchanged map streams against complete accepted road sources."""
import collections
import subprocess
from pathlib import Path
from newurban_batch93_io import ROOT, pin, read, write

parent = Path('.artifacts/m2-4/newurban-cross-name-reuse-batch92-20261020/inventory-reconciliation-v1.json')
prior = read(parent)
file = ROOT / 'inventory-newurban-v2/inventory.json'
inventory, old = read(file), read(prior['currentInventory']['file'])
assert pin(prior['currentInventory']['file']) == prior['currentInventory']
assert inventory['archivePins'] == old['archivePins'] and not inventory['issues']
identity = lambda rows: {r['mapId']: {k: r[k] for k in ['source', 'catalogSource', 'declaration',
    'classification', 'gameplayStatus']} for r in rows}
assert identity(inventory['maps']) == identity(old['maps']) and len(inventory['maps']) == 8
raw = [g for g in inventory['resourceGroups'] if g['theater'] == 'NEWURBAN' and 'MISSING_AUTHORED_FAMILY' in g['decisions']]
credits = {g['key']: g for g in prior['creditedSourceGroups']}
rows, before = {r['key']: r for r in inventory['rows']}, {r['key']: r for r in old['rows']}
fields = ['edition', 'theater', 'kind', 'id', 'source', 'dependencies', 'palette', 'hasShadow',
          'remapable', 'drawOffset', 'paletteType', 'nativeArt', 'nativeRules']
for group in raw:
    if group['key'] in credits:
        assert group['member'] == credits[group['key']]['member'] and group['sha256'] == credits[group['key']]['sha256']
        assert all(rows[key].get(field) == before[key].get(field) for key in group['rowKeys'] for field in fields)
remaining = [g for g in raw if g['key'] not in credits]
covered = [g for g in prior['remainingGaps'] if g['key'] not in {r['key'] for r in remaining}]
export = read(ROOT / 'export-and-preservation-v7.json')
assert len(raw) == 232 and len(remaining) == 184 and len(covered) == 30
assert {g['member'] for g in covered} == {r['member'] for r in export['records']}
manifest = read(Path('.local/terrain-packs') / export['candidate']['revision'] / 'manifest.json')
members = {m['member']: m for g in manifest['groups'] for m in g['members']}
for group in covered:
    assert group['kind'] == 'tmp' and members[group['member']]['sourceHashes']['yr'] == group['sha256']
runtime = read(ROOT / 'active-stage-v5.json')['runtimeSourceHead']
changes = subprocess.check_output(['git', 'diff', prior['sourceRuntimeCommit'], runtime,
    '--name-only', '--', 'src', 'desktop'], text=True).splitlines()
assert changes == ['desktop/terrain-theater-hd-contracts.json']
write(ROOT / 'inventory-reconciliation-v3.json', dict(status='PASS_30_ROAD_SOURCES_FOUR_SLOPES_EXPLICITLY_REMAIN_MISSING',
    currentInventory=pin(file), parentReconciliation=pin(parent), priorInventory=prior['currentInventory'],
    rawScannerMissingAuthoredGroups=len(raw), unchangedAcceptedFactionGroupsCredited=len(credits),
    creditedSourceGroups=list(credits.values()), acceptedFactionEvidence=prior['acceptedFactionEvidence'],
    sourceRuntimeCommit=runtime, unchangedSharedRuntimeComparedWith=prior['sourceRuntimeCommit'],
    applicationDifferences=changes, newCoveredSourceGroups=covered, remainingAuthoredGaps=len(remaining),
    remainingByKind=dict(collections.Counter(g['kind'] for g in remaining)), remainingGaps=remaining,
    deferredSlopes=read(ROOT / 'explicit-slope-original-fallback-v1.json')['sourceMembers'],
    unresolvedDependencyGroups=prior['unresolvedDependencyGroups'],
    **{k: prior[k] for k in ['directoryEntries', 'uniqueMapFiles', 'uniqueMapStreams', 'selectableMaps',
        'sourceModeVariants', 'overlappingSourceModeLabels']},
    disclosure='All eight source map streams, rule contexts and unresolved groups remain explicit. Thirty complete road source groups now have both densities. The four accepted bridge-contact core sources and all prior groups remain unchanged; no failed map, source or rule is removed.',
    windows='NOT_RUN', visual='PENDING_GROUPED_ROAD_CONTEXT_AND_BATCH92_MATERIAL_REVIEW', m24Complete=False))
print(dict(covered=30, remaining=184, byKind=dict(collections.Counter(g['kind'] for g in remaining))))
