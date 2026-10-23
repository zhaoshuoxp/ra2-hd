"""Credit complete target-registered families without dropping any uncovered source."""
import collections
import subprocess
from pathlib import Path
from newurban_batch89_io import pin, read, write

ROOT = Path('.artifacts/m2-4/newurban-cross-name-reuse-batch92-20261020')
parent = Path('.artifacts/m2-4/newurban-anchored-buildings-batch91-20261020/inventory-reconciliation-v1.json')
prior = read(parent)
file = ROOT / 'inventory-newurban-v1/inventory.json'
inventory = read(file)
assert pin(prior['currentInventory']['file']) == prior['currentInventory']
old = read(prior['currentInventory']['file'])
assert inventory['archivePins'] == old['archivePins']
assert not inventory['issues'] and len(inventory['maps']) == 8
identity = lambda rows: {r['mapId']: {k: r[k] for k in ['source', 'catalogSource', 'declaration',
    'classification', 'gameplayStatus']} for r in rows}
assert identity(inventory['maps']) == identity(old['maps'])
raw = [g for g in inventory['resourceGroups'] if g['theater'] == 'NEWURBAN' and 'MISSING_AUTHORED_FAMILY' in g['decisions']]
credit = {g['key']: g for g in prior['creditedSourceGroups']}
rows, old_rows = {r['key']: r for r in inventory['rows']}, {r['key']: r for r in old['rows']}
fields = ['edition', 'theater', 'kind', 'id', 'source', 'dependencies', 'palette', 'hasShadow',
    'remapable', 'drawOffset', 'paletteType', 'nativeArt', 'nativeRules']
for group in raw:
    if group['key'] in credit:
        assert group['member'] == credit[group['key']]['member'] and group['sha256'] == credit[group['key']]['sha256']
        assert all(rows[key].get(field) == old_rows[key].get(field) for key in group['rowKeys'] for field in fields)
remaining = [g for g in raw if g['key'] not in credit]
covered = [g for g in prior['remainingGaps'] if g['key'] not in {r['key'] for r in remaining}]
export = read(ROOT / 'export-and-preservation-v2.json')
records = {r['member']: r for r in export['records']}
assert len(raw) == 262 and len(remaining) == 214 and len(covered) == 5
assert set(records) == {g['member'] for g in covered}
contract = read('desktop/environment-newurban-hd-contract.json')
for group in covered:
    assert contract['sources'][group['member']]['sha256'] == group['sha256']
    assert all(contract['identities']['yr'][name] == records[group['member']]['family'] for name in group['identities'])
runtime = read(ROOT / 'active-stage-v2.json')['runtimeSourceHead']
changes = subprocess.check_output(['git', 'diff', prior['sourceRuntimeCommit'], runtime,
    '--name-only', '--', 'src', 'desktop'], text=True).splitlines()
assert changes == ['desktop/environment-newurban-hd-contract.json']
write(ROOT / 'inventory-reconciliation-v1.json', dict(status='PASS_EIGHT_ORIGINAL_MAPS_FIVE_COMPLETE_NEW_SOURCE_BINDINGS',
    currentInventory=pin(file), parentReconciliation=pin(parent), priorInventory=prior['currentInventory'],
    rawScannerMissingAuthoredGroups=len(raw), unchangedAcceptedFactionGroupsCredited=len(credit),
    creditedSourceGroups=list(credit.values()), acceptedFactionEvidence=prior['acceptedFactionEvidence'],
    sourceRuntimeCommit=runtime, unchangedSharedRuntimeComparedWith=prior['sourceRuntimeCommit'],
    applicationDifferences=changes, newCoveredSourceGroups=covered, remainingAuthoredGaps=len(remaining),
    remainingByKind=dict(collections.Counter(g['kind'] for g in remaining)), remainingGaps=remaining,
    unresolvedDependencyGroups=prior['unresolvedDependencyGroups'],
    **{k: prior[k] for k in ['directoryEntries', 'uniqueMapFiles', 'uniqueMapStreams', 'selectableMaps',
        'sourceModeVariants', 'overlappingSourceModeLabels']},
    disclosure='All source/map identities and unresolved groups remain explicit. Forty-eight unchanged accepted faction routes retain their prior authorities. Four building and one overlay groups now resolve through complete target-registered accepted-art families. No failed or missing source is removed.',
    windows='NOT_RUN', visual='CHANGED_WARM_MATERIAL_AND_NATIVE_CONTEXT_PENDING_USER_REVIEW', m24Complete=False))
print(dict(covered=len(covered), remaining=len(remaining), byKind=dict(collections.Counter(g['kind'] for g in remaining))))
