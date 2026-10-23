"""Export complete source-pinned ground groups after every mother passes capacity QA."""
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
parser.add_argument('--theater', choices=['NEWURBAN', 'DESERT'], required=True)
args = parser.parse_args()
theater = args.theater.lower()
batch = 69 if theater == 'newurban' else 70
root = Path(f'.artifacts/m2-4/{theater}-ground-transitions-authoring-batch{batch}-v1')
native = Path(f'.artifacts/m2-4/{theater}-ground-transitions-native-batch{batch}-v1')
source = read(root / 'source.json')
profile = dict(schema='m2-4-native-theater-ground-form-materials-v1', nativeSubTileContacts=True,
    nativeTheaterGroundForms={member['member']: dict(sourceSha256=member['native']['sha256'],
        region='FULL_NATIVE_GROUND_COLOR_AND_MATERIAL_BOUNDARIES') for member in source['members']},
    motherAudits={})
jobs = read(root / 'imagegen-jobs.json')
assert jobs['sourceSha256'] == sha(root / 'source.json')
assert jobs['layoutSha256'] == sha(root / 'layout.json')
for job in jobs['jobs']:
    master = root / Path(job['destination']).name
    qa = root / (job['id'] + '-qa-v1.json')
    capacity = read(root / (job['id'] + '-capacity-v1.json'))
    assert capacity['status'] == 'PASS' and sha(master) == capacity['masterSha256']
    assert read(qa)['status'] == 'PASS'
    profile['motherAudits'][str(master)] = dict(masterSha256=sha(master), audit=str(qa), auditSha256=sha(qa))
profile_file = root / 'material-profile.json'
with profile_file.open('x') as stream:
    stream.write(json.dumps(profile, indent=2) + '\n')
revision = f'{theater}-m2-4-ground-transitions-batch{batch}-v1'
subprocess.run(['python3', 'scripts/m2/export-showcase-tmp.py', revision, '--root', str(root),
    '--prepared', str(native), '--base-pointer', f'.local/terrain-{theater}-selection.json',
    '--set-indices', '13', '14', '33', '34', '39', '41', '42', '46',
    '--group-prefix', f'm2-4-{theater}-ground', '--max-groups', '64',
    '--material-profile', str(profile_file)], check=True)
subprocess.run(['python3', 'scripts/m2/verify-showcase-tmp.py', revision,
    '--root', str(root), '--prepared', str(native)], check=True)
validation = read(root / revision / 'validation.json')
assert validation['newMembers'] == 152
print(json.dumps(dict(theater=args.theater, status=validation['status'], revision=revision)))
