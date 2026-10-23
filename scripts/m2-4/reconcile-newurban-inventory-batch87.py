"""Reconcile the fresh static scan with immutable, source-identical accepted faction evidence."""
import collections
import hashlib
import json
import subprocess
from pathlib import Path

BASE = Path('.artifacts/m2-4')
ROOT = BASE / 'newurban-buildings-batch87-20261020'
OLD = BASE / 'desert-final-buildings-batch86-20261020/coverage-and-native-closure-v1.json'
INVENTORY = ROOT / 'inventory-newurban-v1/inventory.json'
AUTHORITIES = [BASE / 'accepted-faction-routing-batches79-80-20261019/coverage-and-native-closure-v1.json',
    BASE / 'legacy-faction-reuse-batch84-20261020/coverage-and-native-closure-v1.json']
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
old, inventory = read(OLD), read(INVENTORY)
before = next(row for row in old['theaters'] if row['theater'] == 'NEWURBAN')
prior_inventory = Path(old['currentInventory']['file'])
assert sha(prior_inventory) == old['currentInventory']['sha256']
prior = read(prior_inventory)
assert inventory['archivePins'] == prior['archivePins']
assert not inventory['issues'] and len(inventory['maps']) == 8
raw = [g for g in inventory['resourceGroups'] if g['theater'] == 'NEWURBAN'
       and 'MISSING_AUTHORED_FAMILY' in g['decisions']]
before_keys = {g['key'] for g in before['remainingGaps']}
extra = {g['key']: g for g in raw if g['key'] not in before_keys}
assert len(raw) == 334 and len(extra) == 48
accepted, evidence = {}, []
for file in AUTHORITIES:
    authority = read(file)
    assert authority['status'].startswith('PASS_')
    table = next(t for t in authority['theaters'] if t['theater'] == 'NEWURBAN')
    assert len(table['coveredSourceGroups']) == (34 if '79-80' in str(file) else 14)
    for group in table['coveredSourceGroups']:
        assert group['key'] not in accepted
        accepted[group['key']] = group
    changes = subprocess.check_output(['git', 'diff', authority['runtimeSourceCommit'], 'fcb48291',
        '--name-only', '--', 'src', 'desktop'], text=True).splitlines()
    assert set(changes).issubset({'desktop/environment-desert-hd-contract.json',
        'desktop/environment-newurban-hd-contract.json', 'desktop/terrain-theater-hd-contracts.json'})
    reports = authority['nativeReports']
    for report in reports:
        if report.get('theater') not in (None, 'NEWURBAN'):
            continue
        target = Path(report['file'])
        assert sha(target) == report['sha256']
        assert read(target)['status'] == 'PASS_SELECTED_NATIVE_CASES'
    evidence.append(dict(authority=pin(file), sourceRuntimeCommit=authority['runtimeSourceCommit'],
        currentRuntimeCommit='fcb48291', applicationDifferences=changes, policy='Resource declarations only; shared faction runtime source is unchanged.'))
assert set(extra) == set(accepted)
original_rows = {row['key']: row for row in prior['rows']}
current_rows = {row['key']: row for row in inventory['rows']}
fields = ['edition', 'theater', 'kind', 'id', 'source', 'dependencies', 'palette', 'hasShadow',
    'remapable', 'drawOffset', 'paletteType', 'nativeArt', 'nativeRules']
for key, group in extra.items():
    assert group['member'] == accepted[key]['member'] and group['sha256'] == accepted[key]['sha256']
    for row_key in group['rowKeys']:
        a, b = original_rows[row_key], current_rows[row_key]
        assert all(a.get(field) == b.get(field) for field in fields), row_key
remaining = [group for group in raw if group['key'] not in extra]
covered = [group for group in before['remainingGaps'] if group['key'] not in {g['key'] for g in remaining}]
patch = read(Path('desktop/environment-newurban-hd-contract.json'))
selection = read(ROOT / 'selection-v1.json')
assert len(covered) == 24 and len(remaining) == 286
for group in covered:
    assert group['kind'] == 'building'
    assert patch['sources'][group['member']]['sha256'] == group['sha256']
    assert set(group['identities']).issubset(patch['identities']['yr'])
    assert all(patch['identities']['yr'][name] in selection['newFamilies'] for name in group['identities'])
result = dict(status='PASS_EXPLICIT_STATIC_SCAN_AND_ACCEPTED_FACTION_SOURCE_RECONCILIATION',
    currentInventory=pin(INVENTORY), priorInventory=pin(prior_inventory), priorClosure=pin(OLD),
    rawScannerMissingAuthoredGroups=len(raw), unchangedAcceptedFactionGroupsCredited=len(extra),
    creditedSourceGroups=list(accepted.values()), evidence=evidence,
    newCoveredSourceGroups=covered, remainingAuthoredGaps=286,
    remainingByKind=dict(collections.Counter(g['kind'] for g in remaining)), remainingGaps=remaining,
    unresolvedDependencyGroups=before['unresolvedDependencyGroups'],
    directoryEntries=before['directoryEntries'], uniqueMapFiles=before['uniqueMapFiles'],
    uniqueMapStreams=before['uniqueMapStreams'], selectableMaps=before['selectableMaps'],
    sourceModeVariants=before['sourceModeVariants'], overlappingSourceModeLabels=before['overlappingSourceModeLabels'],
    disclosure='Raw static inventory is retained unchanged. Its generic building classifier does not credit the 48 existing faction routes already proven by batches 79/80/84. Credit requires identical complete original source/context rows, archive hashes, unchanged shared runtime and immutable passing native evidence. No failure or map is removed.',
    runtimeStatus='NEW_FAMILY_NATIVE_CHECKS_PENDING', windows='NOT_RUN', m24Complete=False)
with (ROOT / 'inventory-reconciliation-v1.json').open('x') as stream:
    stream.write(json.dumps(result, indent=2) + '\n')
print(json.dumps(dict(status=result['status'], rawScannerGroups=len(raw),
    inheritedFactionGroups=len(extra), newSourceGroups=24, remaining=286, remainingByKind=result['remainingByKind'])))
