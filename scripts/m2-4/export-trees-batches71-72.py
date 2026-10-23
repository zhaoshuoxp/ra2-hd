"""Export and validate all remaining NewUrban or Desert tree families."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--theater', required=True, choices=['NEWURBAN', 'DESERT'])
parser.add_argument('--boards-only', action='store_true', help='Resume comparisons after a verified export')
args = parser.parse_args()
name = args.theater.lower()
batch = 71 if name == 'newurban' else 72
root = Path(f'.artifacts/m2-4/{name}-tree-authoring-batch{batch}-v1')
native = Path(f'.artifacts/m2-4/{name}-tree-native-batch{batch}-v1')
contract_file = native / 'contract-full.json'
contract = read(contract_file)
work = read(root / 'worklist.json')
members = {row['member'] for row in work['members']}
families = sorted(key for key, row in contract['families'].items() if set(row['members']) <= members)
assert len(families) == len(members)
jobs = read(root / 'imagegen-jobs.json')
assert jobs['worklistSha256'] == sha(root / 'worklist.json')
for job in jobs['jobs']:
    receipt = read(root / (job['id'] + '-capacity-v1.json'))
    assert receipt['status'] == 'PASS' and sha(Path(job['destination'])) == receipt['masterSha256']
    assert read(root / (job['id'] + '-qa-v1.json'))['status'] == 'PASS'
revision = f'{name}-environment-trees-batch{batch}-v1'
if not args.boards_only:
    subprocess.run(['python3', 'scripts/m2/export-showcase-shp.py', revision, '--root', str(root),
        '--prepared', str(native), '--contract', str(contract_file), '--families', *families,
        '--material-profile', str(root / 'material-profile.json')], check=True)
    subprocess.run(['python3', 'scripts/m2/verify-showcase-shp.py',
        f'.local/environment-packs/{revision}', str(root / 'verification-v1.json'),
        '--prepared', str(native), '--contract', str(contract_file)], check=True)
    subprocess.run(['bun', 'scripts/m2/validate-showcase-environment.ts', revision,
        str(root / 'loading-v1.json'), f'--theater={args.theater}', f'--contract={contract_file}',
        f'--prepared={native}', '--families=' + ','.join(families)], check=True)
else:
    verification = read(root / 'verification-v1.json')
    assert verification['status'] == 'PASS' and verification['sha256'] == sha(
        Path(verification['pack']) / 'manifest.json')
    assert read(root / 'loading-v1.json')['status'] == 'PASS_COMPLETE_FAMILIES_DENSITIES_ALLOCATION_FALLBACK_DISPOSAL'
for density in [2, 4]:
    subprocess.run(['python3', 'scripts/m2/official-maps/review-exported-shp.py',
        f'.local/environment-packs/{revision}', str(native / f'source-boards-{density}x-v1'),
        '--prepared', str(native), '--contract', str(contract_file), '--members', *sorted(members),
        '--frames', '0', '--density', str(density)], check=True)
print(json.dumps(dict(theater=args.theater, revision=revision, families=len(families), status='PASS')))
