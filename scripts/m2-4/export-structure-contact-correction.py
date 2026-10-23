"""Publish source-pinned structure contact corrections into versioned task packs."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--theater', required=True, choices=['NEWURBAN', 'DESERT'])
parser.add_argument('--revision', required=True)
args = parser.parse_args()
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
name = args.theater.lower()
evidence = Path('.artifacts/m2-4/structures-material-seams-r1-20261019')
root = Path(f'.artifacts/m2-4/{name}-structures-contact-r1-authoring-20261019')
old = Path('.artifacts/m2-4') / ('newurban-structures-authoring-batch76-v1'
    if name == 'newurban' else 'desert-structures-authoring-batch77-v2')
native = Path('.artifacts/m2-4') / ('newurban-structures-native-batch76-v1'
    if name == 'newurban' else 'desert-structures-native-batch77-v2')
feedback = read(evidence / 'feedback.json')
pointer = feedback['baselineSelections'][name]
assert read(Path(f'.local/terrain-{name}-selection.json')) == pointer
base_file = evidence / f'{name}-baseline-pointer.json'
if not base_file.exists():
    with base_file.open('x') as stream:
        stream.write(json.dumps(pointer, indent=2) + '\n')
root.mkdir(exist_ok=True)
replacement_jobs = read(evidence / 'remake-jobs.json')['jobs']
replacement_jobs = [row for row in replacement_jobs if row['theater'] == args.theater]
replaced_masters = {row['board'] for row in replacement_jobs}
for file in old.iterdir():
    if file.is_file() and file.name not in replaced_masters and not (root / file.name).exists():
        (root / file.name).symlink_to(file.resolve())
source = read(root / 'source.json')
profile = read(old / f'material-profile-continuous-v{4 if name == "newurban" else 2}.json')
profile['nativeContinuousStructureContacts'] = {row['member']: row['native']['sha256']
    for row in source['members'] if row['member'] != 'ovrps02.ubn'}
audits = {}
for path, declaration in profile['motherAudits'].items():
    board = Path(path).name
    target = root / board
    replacement = next((job for job in replacement_jobs if job['board'] == board), None)
    if replacement:
        receipt = read(root / (replacement['id'] + '-capacity-v1.json'))
        if receipt['status'] != 'PASS':
            receipt = read(root / (replacement['id'] + '-gutter-v2.json'))
            assert receipt['status'] == 'PASS_MEASURED_CLEAR_GUTTERS_AND_CAPACITY'
            assert all(row['capacity'] >= 4 for row in receipt['members'])
        assert sha(target) == receipt['masterSha256']
        declaration = dict(masterSha256=sha(target), audit=receipt['qaFile'], auditSha256=receipt['qaSha256'])
    else:
        assert sha(target) == declaration['masterSha256']
    audits[str(target)] = declaration
profile['motherAudits'] = audits
profile_file = evidence / f'{name}-material-profile-{args.revision}.json'
with profile_file.open('x') as stream:
    stream.write(json.dumps(profile, indent=2) + '\n')
sets = [19, 25, 115, 117, 119] if name == 'newurban' else [25]
subprocess.run(['python3', 'scripts/m2/export-showcase-tmp.py', args.revision,
    '--root', str(root), '--prepared', str(native), '--base-pointer', str(base_file),
    '--set-indices', *map(str, sets), '--group-prefix', f'm2-4-{name}-structures', '--max-groups', '64',
    '--material-profile', str(profile_file), '--replace-selected-groups'], check=True)
subprocess.run(['python3', 'scripts/m2/verify-showcase-tmp.py', args.revision,
    '--root', str(root), '--prepared', str(native)], check=True)
print(json.dumps(dict(theater=args.theater, validation=read(root / args.revision / 'validation.json')['status'],
    revision=args.revision, selected=False)))
