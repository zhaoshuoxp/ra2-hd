"""Reconcile a fresh eight-map scan without losing accepted faction source authorities."""
import collections
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path('.artifacts/m2-4/newurban-linked-buildings-batch89-20261020')
PRIOR = Path('.artifacts/m2-4/newurban-buildings-batch88-20261020/inventory-reconciliation-v1.json')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
prior = read(PRIOR)
inventory_file = ROOT / 'inventory-newurban-v2/inventory.json'
inventory = read(inventory_file)
old = read(Path(prior['currentInventory']['file']))
assert sha(Path(prior['currentInventory']['file'])) == prior['currentInventory']['sha256']
assert inventory['archivePins'] == old['archivePins']
assert len(inventory['maps']) == 8 and not inventory['issues']
map_identity = lambda rows: {row['mapId']: {key: row[key] for key in
    ['source', 'catalogSource', 'declaration', 'classification', 'gameplayStatus']} for row in rows}
assert map_identity(inventory['maps']) == map_identity(old['maps'])
raw = [group for group in inventory['resourceGroups'] if group['theater'] == 'NEWURBAN'
       and 'MISSING_AUTHORED_FAMILY' in group['decisions']]
credit = {group['key']: group for group in prior['creditedSourceGroups']}
assert len(credit) == 48
current_rows = {row['key']: row for row in inventory['rows']}
old_rows = {row['key']: row for row in old['rows']}
fields = ['edition', 'theater', 'kind', 'id', 'source', 'dependencies', 'palette', 'hasShadow',
    'remapable', 'drawOffset', 'paletteType', 'nativeArt', 'nativeRules']
for group in raw:
    if group['key'] not in credit:
        continue
    accepted = credit[group['key']]
    assert group['member'] == accepted['member'] and group['sha256'] == accepted['sha256']
    for key in group['rowKeys']:
        assert all(current_rows[key].get(field) == old_rows[key].get(field) for field in fields), key
remaining = [group for group in raw if group['key'] not in credit]
assert len(raw) == 283 and len(remaining) == 235
covered = [group for group in prior['remainingGaps'] if group['key'] not in {r['key'] for r in remaining}]
assert len(covered) == 12
contract = read(Path('desktop/environment-newurban-hd-contract.json'))
export = read(ROOT / 'export-and-preservation-v2.json')
assert contract['selectedPack'] == export['candidate']
records = {row['member']: row for row in export['records'] if not row['linked']}
assert set(records) == {group['member'] for group in covered}
for group in covered:
    assert group['kind'] == 'building' and contract['sources'][group['member']]['sha256'] == group['sha256']
    assert all(contract['identities']['yr'][name] == records[group['member']]['family'] for name in group['identities'])
runtime = read(ROOT / 'active-stage-v2.json')['runtimeSourceHead']
differences = subprocess.check_output(['git', 'diff', '5dbcbc7ed17a95102c09f2567002dd1f19a52c1a',
    runtime, '--name-only', '--', 'src', 'desktop'], text=True).splitlines()
assert set(differences) == {'desktop/environment-newurban-hd-contract.json'}
result = dict(status='PASS_FRESH_EIGHT_MAP_SOURCE_SCOPE_AND_12_NEW_COMPLETE_FAMILIES_WITH_TWO_LINKED_MEMBERS',
    currentInventory=pin(inventory_file), parentReconciliation=pin(PRIOR), priorInventory=prior['currentInventory'],
    rawScannerMissingAuthoredGroups=len(raw), unchangedAcceptedFactionGroupsCredited=48,
    creditedSourceGroups=list(credit.values()), acceptedFactionEvidence=prior['acceptedFactionEvidence'],
    sourceRuntimeCommit=runtime, unchangedSharedRuntimeComparedWith='5dbcbc7ed17a95102c09f2567002dd1f19a52c1a',
    applicationDifferences=differences, newCoveredSourceGroups=covered, remainingAuthoredGaps=len(remaining),
    remainingByKind=dict(collections.Counter(group['kind'] for group in remaining)), remainingGaps=remaining,
    unresolvedDependencyGroups=prior['unresolvedDependencyGroups'],
    directoryEntries=prior['directoryEntries'], uniqueMapFiles=prior['uniqueMapFiles'],
    uniqueMapStreams=prior['uniqueMapStreams'], selectableMaps=prior['selectableMaps'],
    sourceModeVariants=prior['sourceModeVariants'], overlappingSourceModeLabels=prior['overlappingSourceModeLabels'],
    disclosure='The raw scanner remains unchanged and visible. Its 48 accepted faction routes retain the prior explicit native authorities, identical archive/source/context rows and unchanged shared application source. No failed map or resource is removed.',
    windows='NOT_RUN', visual='PENDING_TWELVE_NEW_RUBBLE_STUDIES_AND_D_SIGN_CONTEXT', m24Complete=False)
with (ROOT / 'inventory-reconciliation-v1.json').open('x') as stream:
    stream.write(json.dumps(result, indent=2) + '\n')
print(json.dumps(dict(status=result['status'], rawScannerGroups=len(raw), creditedFactionGroups=48,
    newlyCovered=12, remaining=len(remaining), remainingByKind=result['remainingByKind'])))
