"""Record the representative checkpoint separately from runtime acceptance."""
import csv
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path('.artifacts/m1-6c')
inventory = json.loads((ROOT / 'source-v2/inventory.json').read_text())
receipt = json.loads((ROOT / 'review-v1/review-receipt.json').read_text())
browser = json.loads((ROOT / 'review-v1/browser-check.json').read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def checkout(path):
    def git(*args):
        return subprocess.check_output(['git', '-C', path, *args], text=True).strip()
    return {'path': path, 'head': git('rev-parse', 'HEAD'), 'branch': git('branch', '--show-current'),
            'status': git('status', '--short')}


assert browser['status'] == 'PASS_OFFLINE_NATIVE_SIZE_AND_ANIMATION_CONTROLS'
assert sha(ROOT / 'review-v1/Soviet-Buildings-Representative-Review.html') == receipt['reviewSha256']
for filename, digest in receipt['preservedInputs'].items():
    assert sha(Path(filename)) == digest, f'Accepted input changed: {filename}'
protected = [checkout('/Users/Aone/RA2remaster/ra2-hd'), checkout('/Users/Aone/RA2remaster/ra2-hd-editions')]
# Another task may advance independently. Record its state without treating
# unrelated working files as ours or overwriting them to manufacture cleanliness.
subprocess.run(['git', '-C', protected[1]['path'], 'merge-base', '--is-ancestor',
                inventory['baseline'], protected[1]['head']], check=True)
assets = []
for directory in ['source-v2', 'authoring-v1', 'references-v1', 'review-v1']:
    for file in sorted((ROOT / directory).rglob('*')):
        if file.is_file():
            assets.append({'path': str(file), 'bytes': file.stat().st_size, 'sha256': sha(file)})
with Path('docs/m1-6c-coverage-matrix.csv').open('w', newline='') as stream:
    writer = csv.writer(stream)
    writer.writerow(['edition', 'theater', 'identity', 'members', 'member_hashes', 'aggregate_frames',
                     'palette_member', 'palette_hash', 'source_disposition', 'current_runtime_evidence', 'new_acceptance'])
    for row in inventory['matrix']:
        writer.writerow([row['edition'], row['theater'], row['id'],
                         ';'.join(m['source']['member'] for m in row['members']),
                         ';'.join(m['source']['sha256'] for m in row['members']), row['aggregateFrames'],
                         row['palette']['member'], row['palette']['sha256'], row['fallbackReason'],
                         'NOT_RUN_THIS_CONTINUATION', 'PENDING_ONLY_FOR_NEW_SCOPE'])
failures = [
    {'scope': 'Source audit v1', 'reason': 'BuildingTypes included entries without a rules section',
     'resolution': 'Deduplicate registry and exclude undefined sections; v2 inventories 162 cells', 'retained': '.artifacts/m1-6c/audit.log'},
    {'scope': 'NAINDP artwork v1-v3', 'reason': 'Extra housings/slats, then silhouette proportion drift',
     'resolution': 'Selected v4; all raw candidates and prompts retained', 'retained': '.artifacts/m1-6c/authoring-v1/NAINDP'},
    {'scope': 'NAREFN reference v1', 'reason': 'Generic preview stacked mutually exclusive ACTIVE storage layers',
     'resolution': 'Final comparison decodes empty body/bib only; no resource or gameplay change',
     'retained': '.artifacts/m1-6c/references-v1/NAREFN-SNOW/normal.png'},
    {'scope': 'Browser initial launch', 'reason': 'Restricted macOS launch exited SIGABRT / EPERM',
     'resolution': 'Authorized isolated temporary-profile browser launch passed at three viewport sizes'},
    {'scope': 'Retained unit regression', 'reason': 'New worktree lacked .artifacts/m1-7 test output directory',
     'resolution': 'Created the output directory in this worktree; the one failed test passed on rerun',
     'retained': '.artifacts/m1-6c/representative-regression.log'},
    {'scope': 'Checkpoint preservation assertion', 'reason': 'Independent edition task advanced to b02b4da and added an untracked loading validator',
     'resolution': 'Verified descendant ancestry and documentation-only commit; record the independent state without modifying it'}]
ledger = []
for identity in inventory['union']:
    rows = [r for r in inventory['matrix'] if r['id'] == identity]
    samples = [r for r in receipt['samples'] if r['id'] == identity]
    ledger.append({'identity': identity, 'editions': sorted({r['edition'] for r in rows}),
                   'priorTemperateAcceptance': identity not in ['NAINDP', 'NABNKR'],
                   'representativeTheaters': [r['theater'] for r in samples],
                   'newScopeStatus': 'REPRESENTATIVE_PENDING' if samples else 'AWAITING_REPRESENTATIVE_GATE',
                   'runtime': 'NOT_RUN_THIS_CONTINUATION', 'finalAcceptance': 'PENDING_NEW_SCOPE'})
evidence = {'status': 'REPRESENTATIVE_REVIEW_PENDING', 'baseline': inventory['baseline'],
            'protectedCheckouts': protected, 'sourceMatrixCells': len(inventory['matrix']),
            'uniqueSourceMembers': len(inventory['uniqueMembers']), 'rosters': {e: len(r) for e, r in inventory['catalogs'].items()},
            'review': str(ROOT / 'review-v1/Soviet-Buildings-Representative-Review.html'),
            'reviewSha256': receipt['reviewSha256'], 'samples': receipt['samples'],
            'powerVariant': receipt['powerVariant'], 'browser': browser,
            'tests': {'typecheckEntry': 'PASS', 'uniqueTestsPassed': 60, 'initialPass': 59,
                      'initialFixtureFailures': 1, 'failedTestRerunPassed': 1,
                      'logs': ['.artifacts/m1-6c/representative-regression.log',
                               '.artifacts/m1-6c/representative-regression-retry.log']},
            'priorAcceptedUnitExceptions': ['SQD', 'YURIPR'], 'optionalTextureBudgetBytes': 268435456,
            'candidateRuntimeAllocationBytes': 0, 'gameplayValidation': 'PENDING_FULL_PRODUCTION',
            'macPackage': 'PENDING_REPRESENTATIVE_APPROVAL_AND_COMPLETE_FAMILIES',
            'familyLedger': ledger, 'failures': failures, 'immutableArtifacts': assets}
Path('docs/m1-6c-representative-evidence.json').write_text(json.dumps(evidence, indent=2) + '\n')
print(json.dumps({'status': evidence['status'], 'immutableFiles': len(assets), 'matrixCells': len(inventory['matrix'])}))
