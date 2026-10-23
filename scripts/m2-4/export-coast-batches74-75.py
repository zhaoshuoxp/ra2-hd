"""Export source-owned coastal materials after all native and mother audits pass."""
import argparse
import json
import hashlib
import subprocess
import shutil
from pathlib import Path


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--theater', required=True, choices=['NEWURBAN', 'DESERT'])
args = parser.parse_args()
name = args.theater.lower()
batch = 74 if name == 'newurban' else 75
root = Path(f'.artifacts/m2-4/{name}-coast-authoring-batch{batch}-v1')
native = Path(f'.artifacts/m2-4/{name}-coast-native-batch{batch}-v1')
source = read(root / 'source.json')
layout_file = root / 'layout.json'
layout = read(layout_file)
jobs = read(root / 'imagegen-jobs.json')
assert jobs['sourceSha256'] == sha(root / 'source.json') and jobs['layoutSha256'] == sha(layout_file)
reef = Path('.artifacts/m2-4/newurban-reef-bodies-batch74-v2')
profile = read(reef / 'water-material-profile-v4.json' if name == 'newurban' else root / 'water-material-profile-v3.json')
ownership = read(root / 'native-water-ownership-v3.json')
profile.update(schema='m2-4-source-owned-theater-coast-materials-v1', motherAudits={},
    nativeTheaterCoastMaterials={row['member']: dict(sourceSha256=row['native']['sha256'],
        policy='REGISTERED_AUTHORED_MATERIAL_WITH_NATIVE_ALPHA_AND_CONTACT_LIGHT') for row in source['members']},
    nativeTheaterWaterMembers={row['member']: dict(
        sourceSha256=next(member['native']['sha256'] for member in source['members'] if member['member'] == row['member']),
        ownership=row['classification']) for row in ownership['records']
        if row['classification'] in ['PURE_NATIVE_WATER', 'NATIVE_THEATER_COAST_WITH_WATER']})
for job in jobs['jobs']:
    master, audit = Path(job['destination']), root / (job['id'] + '-qa-v1.json')
    capacity = read(root / (job['id'] + '-capacity-v1.json'))
    assert capacity['status'] == 'PASS' and sha(master) == capacity['masterSha256']
    assert read(audit)['status'] == 'PASS'
    profile['motherAudits'][str(root / master.name)] = dict(masterSha256=sha(master), audit=str(audit), auditSha256=sha(audit))
extension = 'ubn' if name == 'newurban' else 'des'
anchor = f'water04.{extension}'
original = next(row['native'] for row in source['members'] if row['member'] == anchor)
master = root / layout[anchor]['board']
anchor_job = next(job for job in jobs['jobs'] if anchor in job['members'])
profile['waterAnchor'] = dict(classification='SOURCE_PINNED_EXISTING_AUTHORED_WATER_MATERIAL',
    prepared=str(native), preparedSourceSha256=sha(native / 'source.json'), member=anchor,
    sourceSha256=original['sha256'], layout=str(layout_file), layoutSha256=sha(layout_file),
    master=str(master), masterSha256=sha(master), boardSize=anchor_job['boardSize'],
    nativeAssembly=str(root / (anchor + '-native.png')), nativeAssemblySha256=sha(root / (anchor + '-native.png')))
profile['sharedTheaterWaterMaterial'] = dict(policy='PINNED_SHARED_WATER_DETAIL_ON_NATIVE_MAIN_LAYER', anchorMember=anchor)
if name == 'newurban':
    registered = read(reef / 'gutter-layout-v2.json')
    assert registered['status'] == 'PASS_MEASURED_TRANSPARENT_GUTTERS_AND_CAPACITY'
    master, audit = reef / 'reef-bodies-master.png', reef / 'reef-qa-v2.json'
    assert sha(master) == registered['masterSha256'] and read(audit)['status'] == 'PASS'
    profile['nativeTheaterReefMaterials'] = {row['member']: {**row,
        'policy': 'SEPARATE_AUTHORED_BODY_WITH_NATIVE_SEA_AND_SHADOW_OWNERSHIP',
        'master': str(master.resolve()), 'masterSha256': sha(master), 'audit': str(audit.resolve()), 'auditSha256': sha(audit),
        'boardSize': [1254, 1254], 'layout': registered['overrides'][row['member']]}
        for row in read(reef / 'native-body-ownership-v1.json')['members']}
for declaration in profile['mixedWaterMembers'].values():
    file = Path(declaration['mask']['file'])
    if file.is_absolute():
        target = root / file.name
        if not target.exists():
            shutil.copyfile(file, target)
        assert sha(target) == sha(file) == declaration['mask']['sha256']
        declaration['mask']['file'] = target.name
profile_file = root / ('material-profile-v3.json' if name == 'newurban' else 'material-profile-v2.json')
if profile_file.exists():
    assert read(profile_file) == profile, 'Reuse only the exact unchanged source/mother profile'
else:
    with profile_file.open('x') as stream:
        stream.write(json.dumps(profile, indent=2) + '\n')
revision = f'{name}-m2-4-coast-batch{batch}-v{3 if name == "newurban" else 1}'
sets = ['10', '12', '15', '21'] if name == 'newurban' else ['10', '12', '21']
subprocess.run(['python3', 'scripts/m2/export-showcase-tmp.py', revision, '--root', str(root),
    '--prepared', str(native), '--base-pointer', f'.local/terrain-{name}-selection.json',
    '--set-indices', *sets, '--group-prefix', f'm2-4-{name}-coast', '--max-groups', '64',
    '--material-profile', str(profile_file)], check=True)
subprocess.run(['python3', 'scripts/m2/verify-showcase-tmp.py', revision,
    '--root', str(root), '--prepared', str(native)], check=True)
report = read(root / revision / 'validation.json')
assert report['newMembers'] == 92
print(json.dumps(dict(theater=args.theater, status=report['status'], revision=revision)))
