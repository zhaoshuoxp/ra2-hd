"""Credit ten complete overlay families without losing prior accepted source authorities."""
import collections
import subprocess
from pathlib import Path

from newurban_batch89_io import pin, read, sha, write

ROOT = Path('.artifacts/m2-4/newurban-rock-crates-batch90-20261020')
PRIOR = Path('.artifacts/m2-4/newurban-linked-buildings-batch89-20261020/inventory-reconciliation-v1.json')
prior = read(PRIOR)
inventory_file = ROOT / 'inventory-newurban-v1/inventory.json'
inventory = read(inventory_file)
old_file = Path(prior['currentInventory']['file'])
assert pin(old_file) == prior['currentInventory']
old = read(old_file)
assert inventory['archivePins'] == old['archivePins']
assert len(inventory['maps']) == 8 and not inventory['issues']
map_identity = lambda rows: {row['mapId']: {key: row[key] for key in
    ['source', 'catalogSource', 'declaration', 'classification', 'gameplayStatus']} for row in rows}
assert map_identity(inventory['maps']) == map_identity(old['maps'])
raw = [group for group in inventory['resourceGroups'] if group['theater'] == 'NEWURBAN'
       and 'MISSING_AUTHORED_FAMILY' in group['decisions']]
credit = {group['key']: group for group in prior['creditedSourceGroups']}
assert len(credit) == 48
rows = {row['key']: row for row in inventory['rows']}
old_rows = {row['key']: row for row in old['rows']}
fields = ['edition', 'theater', 'kind', 'id', 'source', 'dependencies', 'palette', 'hasShadow',
    'remapable', 'drawOffset', 'paletteType', 'nativeArt', 'nativeRules']
for group in raw:
    if group['key'] not in credit:
        continue
    accepted = credit[group['key']]
    assert group['member'] == accepted['member'] and group['sha256'] == accepted['sha256']
    for key in group['rowKeys']:
        assert all(rows[key].get(field) == old_rows[key].get(field) for field in fields), key
remaining = [group for group in raw if group['key'] not in credit]
assert len(raw) == 273 and len(remaining) == 225
covered = [group for group in prior['remainingGaps'] if group['key'] not in {r['key'] for r in remaining}]
assert len(covered) == 10
contract = read('desktop/environment-newurban-hd-contract.json')
export = read(ROOT / 'export-and-preservation-v1.json')
assert contract['selectedPack'] == export['candidate']
records = {row['member']: row for row in export['records']}
assert set(records) == {group['member'] for group in covered}
for group in covered:
    assert group['kind'] == 'overlay' and contract['sources'][group['member']]['sha256'] == group['sha256']
    assert all(contract['identities']['yr'][name] == records[group['member']]['family'] for name in group['identities'])
runtime = read(ROOT / 'active-stage-v1.json')['runtimeSourceHead']
parent_runtime = '8addd36816339f8444a9bc3f838abf4885b292e5'
differences = subprocess.check_output(['git', 'diff', parent_runtime, runtime,
    '--name-only', '--', 'src', 'desktop'], text=True).splitlines()
assert set(differences) == {'desktop/environment-newurban-hd-contract.json'}
result = dict(status='PASS_FRESH_EIGHT_MAP_SOURCE_SCOPE_AND_TEN_COMPLETE_ROCK_AND_CRATE_FAMILIES',
    currentInventory=pin(inventory_file), parentReconciliation=pin(PRIOR), priorInventory=prior['currentInventory'],
    rawScannerMissingAuthoredGroups=len(raw), unchangedAcceptedFactionGroupsCredited=48,
    creditedSourceGroups=list(credit.values()), acceptedFactionEvidence=prior['acceptedFactionEvidence'],
    sourceRuntimeCommit=runtime, unchangedSharedRuntimeComparedWith=parent_runtime,
    applicationDifferences=differences, newCoveredSourceGroups=covered, remainingAuthoredGaps=len(remaining),
    remainingByKind=dict(collections.Counter(group['kind'] for group in remaining)), remainingGaps=remaining,
    unresolvedDependencyGroups=prior['unresolvedDependencyGroups'],
    directoryEntries=prior['directoryEntries'], uniqueMapFiles=prior['uniqueMapFiles'],
    uniqueMapStreams=prior['uniqueMapStreams'], selectableMaps=prior['selectableMaps'],
    sourceModeVariants=prior['sourceModeVariants'], overlappingSourceModeLabels=prior['overlappingSourceModeLabels'],
    disclosure='Raw scanner results remain visible. The 48 accepted faction groups retain exact original archive, source and context rows and unchanged shared application source. Ten overlay groups now resolve through complete authored 2X/4X families. No map or gap is removed.',
    windows='NOT_RUN', visual='PENDING_TEN_NEW_ROCK_AND_CRATE_STUDIES', m24Complete=False)
write(ROOT / 'inventory-reconciliation-v1.json', result)
print(dict(status=result['status'], rawScannerGroups=len(raw), creditedFactionGroups=48,
    newlyCovered=10, remaining=len(remaining), remainingByKind=result['remainingByKind']))
