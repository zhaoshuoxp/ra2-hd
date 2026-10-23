"""Carry accepted credits forward without losing official identities or conditional rows."""
from collections import Counter
from pathlib import Path
from newurban_batch89_io import pin, read, write
from newurban_batch97_materials import ROOT

parent_file = Path('.artifacts/m2-4/newurban-final-terrain-reuse-batch96-20261021/inventory-reconciliation-v1.json')
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
keys = {g['key'] for g in remaining}
covered = [g for g in parent['remainingGaps'] if g['key'] not in keys]
exported = read(ROOT / 'export-and-preservation-v4.json')
assert len(raw) == 51 and len(remaining) == 3 and len(covered) == 13
assert {g['member'] for g in covered} == {r['member'] for r in exported['records'] if r['member'] != 'cgslab_f.shp'}
assert {g['member'] for g in remaining} == {'civ1.shp', 'dnoa.shp', 'ggfwll.shp'}
assert current['selectedResources']['theaters']['NEWURBAN']['environment'] == exported['candidate']
write(ROOT / 'inventory-reconciliation-v1.json', dict(
    status='PASS_13_BUILDING_SOURCES_ALL_EIGHT_OFFICIAL_MAP_IDENTITIES_RETAINED',
    currentInventory=pin(current_file), parentReconciliation=pin(parent_file), priorInventory=parent['currentInventory'],
    rawScannerMissingAuthoredGroups=51, unchangedAcceptedFactionGroupsCredited=len(credits),
    creditedSourceGroups=list(credits.values()), acceptedFactionEvidence=parent['acceptedFactionEvidence'],
    newCoveredSourceGroups=covered, newLinkedSourceMembers=['cgslab_f.shp'],
    remainingAuthoredGaps=3, remainingByKind=dict(Counter(g['kind'] for g in remaining)), remainingGaps=remaining,
    unresolvedDependencyGroups=parent['unresolvedDependencyGroups'],
    **{key: parent[key] for key in ['directoryEntries', 'uniqueMapFiles', 'uniqueMapStreams', 'selectableMaps',
        'sourceModeVariants', 'overlappingSourceModeLabels']},
    disclosure='Thirteen building source groups and one linked loop now have complete candidate density pairs. Three actor/overlay source gaps remain. Twenty-two inherited conditional scanner dependencies are retained for explicit runtime-route reconciliation; no map is dropped and they are not automatically new-art gaps.',
    native='REPORTED_SEPARATELY_IN_CLOSURE', visual='PENDING_13_BUILDINGS_AND_LAB_LOOP',
    windows='NOT_RUN', mainIntegration='NOT_PERFORMED', m24Complete=False))
print(dict(newBuildingSources=13, linked=1, remaining=3, byKind=dict(Counter(g['kind'] for g in remaining))))
