"""Export complete continuous structures, retaining all accepted terrain bytes."""
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
parser.add_argument('--base-pointer', type=Path)
args = parser.parse_args()
name = args.theater.lower()
batch, version, count, sets = (76, 1, 54, [19, 25, 115, 117, 119]) if name == 'newurban' else (77, 2, 10, [25])
root = Path(f'.artifacts/m2-4/{name}-structures-authoring-batch{batch}-v{version}')
native = Path(f'.artifacts/m2-4/{name}-structures-native-batch{batch}-v{version}')
source = read(root / 'source.json')
jobs = read(root / f'imagegen-jobs-continuous-v{3 if name == "desert" else 2}.json')
assert jobs['sourceSha256'] == sha(root / 'source.json') and jobs['layoutSha256'] == sha(root / 'layout.json')
assert source['theater'] == args.theater and len(source['members']) == count
assert {row['setIndex'] for row in source['members']} == set(sets)
assert all(row['member'] != 'wbrdge01.des' for row in source['members'])
profile = dict(schema='m2-4-continuous-theater-structures-v1', motherAudits={},
    nativeTheaterStructureMaterials={row['member']: dict(sourceSha256=row['native']['sha256'],
        policy='REGISTERED_AUTHORED_MATERIAL_WITH_CONTINUOUS_EXTRA_CONTOURS') for row in source['members']},
    authoredSurfaceReconstruction={row['member']: row['native']['sha256'] for row in source['members']})
overrides = {}
for job in jobs['jobs']:
    master, audit = Path(job['destination']), root / (job['id'] + '-qa-v1.json')
    capacity = read(root / (job['id'] + '-capacity-v1.json'))
    assert sha(master) == capacity['masterSha256']
    if capacity['status'] != 'PASS':
        gutter = read(root / (job['id'] + '-gutter-registration-v2.json'))
        assert gutter['status'] == 'PASS_MEASURED_TRANSPARENT_GUTTERS_AND_4X_CAPACITY'
        assert gutter['masterSha256'] == sha(master)
        assert {row['member'] for row in gutter['members']} == set(job['members'])
        assert all(row['capacity'] >= 4 for row in gutter['members'])
        audit = Path(gutter['qa'])
        assert sha(audit) == gutter['qaSha256']
        overrides.update(gutter['overrides'])
    assert read(audit)['status'] == 'PASS'
    used_master = root / overrides.get(job['members'][0], {}).get('board', master.name)
    profile['motherAudits'][str(used_master)] = dict(masterSha256=sha(master),
        audit=str(audit), auditSha256=sha(audit))
override_file = root / 'slot-overrides.json'
if override_file.exists():
    assert read(override_file) == overrides
elif overrides:
    with override_file.open('x') as stream:
        stream.write(json.dumps(overrides, indent=2) + '\n')
if name == 'newurban':
    ownership = read(root / 'native-water-ownership-v7.json')
    assert ownership['status'] == 'PASS_NATIVE_TMP_LAYER_AND_PALETTE_OWNERSHIP'
    assert ownership['sourceSha256'] == sha(root / 'source.json')
    water = read(root / 'water-material-profile-v7.json')
    assert set(water['mixedWaterMembers']) == {'ovrps02.ubn', 'ovrps05.ubn'}
    profile.update(water)
    profile['nativeTheaterWaterMembers'] = {row['member']: dict(
        sourceSha256=profile['mixedWaterMembers'][row['member']]['sourceSha256'],
        ownership=row['classification']) for row in ownership['records'] if row['waterPixels']}
    accepted = read(Path('.artifacts/m2-4/newurban-coast-authoring-batch74-v1/material-profile-continuous-r1.json'))
    profile['waterAnchor'] = accepted['waterAnchor']
    profile['sharedTheaterWaterMaterial'] = accepted['sharedTheaterWaterMaterial']
profile_file = root / f'material-profile-continuous-v{4 if name == "newurban" else 2}.json'
if profile_file.exists():
    assert read(profile_file) == profile, 'Reuse only an identical source-pinned profile'
else:
    with profile_file.open('x') as stream:
        stream.write(json.dumps(profile, indent=2) + '\n')
revision = f'{name}-m2-4-structures-batch{batch}-v{4 if name == "newurban" else 1}'
subprocess.run(['python3', 'scripts/m2/export-showcase-tmp.py', revision, '--root', str(root),
    '--prepared', str(native), '--base-pointer', str(args.base_pointer or f'.local/terrain-{name}-selection.json'),
    '--set-indices', *map(str, sets), '--group-prefix', f'm2-4-{name}-structures', '--max-groups', '64',
    '--material-profile', str(profile_file)], check=True)
subprocess.run(['python3', 'scripts/m2/verify-showcase-tmp.py', revision,
    '--root', str(root), '--prepared', str(native)], check=True)
report = read(root / revision / 'validation.json')
assert report['newMembers'] == count
print(json.dumps(dict(theater=args.theater, status=report['status'], revision=revision)))
