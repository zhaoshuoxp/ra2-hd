"""Pin complete Urban structure mothers, native water ownership and accepted sea detail."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('root', type=Path)
parser.add_argument('water_profile', type=Path)
parser.add_argument('accepted_coast_profile', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
read = lambda path: json.loads(path.read_text())
source = read(args.root / 'source.json')
jobs = read(args.root / 'imagegen-jobs-v1.json')['jobs']
assert source['theater'] == 'URBAN' and len(source['members']) == 24 and len(jobs) == 20
assert {row['setIndex'] for row in source['members']} == {19, 25, 81, 82}
profile = read(args.water_profile)
assert profile['schema'] == 'm2-4-urban-structure-native-water-ownership-v1'
assert len(profile['mixedWaterMembers']) == 5
profile['nativeUrbanStructureMaterials'] = {
    row['member']: dict(sourceSha256=row['native']['sha256'],
        policy='REGISTERED_AUTHORED_MATERIAL_WITH_NATIVE_ALPHA_AND_CONTACT_LIGHT')
    for row in source['members']}
profile['motherAudits'] = {}
covered = []
for job in jobs:
    master = Path(job['destination'])
    receipt_file = args.root / (job['id'] + '-imagegen.json')
    receipt = read(receipt_file)
    capacity = read(args.root / (job['id'] + '-capacity-v1.json'))
    audit_file = Path(capacity['qaFile'])
    audit = read(audit_file)
    assert receipt['tool'] == 'Builtin imagegen' and sha(master) == receipt['masterSha256']
    assert sha(Path(job['reference'])) == job['referenceSha256']
    assert capacity['status'] == audit['status'] == 'PASS'
    assert capacity['masterSha256'] == audit['rawSha256'] == receipt['masterSha256']
    assert sha(audit_file) == capacity['qaSha256']
    assert all(row['capacity'] >= 4 for row in capacity['members'])
    profile['motherAudits'][str(master.resolve())] = dict(masterSha256=sha(master),
        audit=str(audit_file), auditSha256=sha(audit_file))
    covered.extend(job['members'])
assert len(covered) == len(set(covered)) == 24
assert set(covered) == {row['member'] for row in source['members']}
coast = read(args.accepted_coast_profile)
for key in ('waterAnchor', 'sharedUrbanWaterMaterial'):
    profile[key] = coast[key]
profile['nativeUrbanWaterMembers'] = {
    name: dict(sourceSha256=row['sourceSha256'], ownership=row['classification'])
    for name, row in profile['mixedWaterMembers'].items()}
profile['waterRegistrationMembers'] = list(profile['mixedWaterMembers'])
profile['provenance'] = dict(sourceSha256=sha(args.root / 'source.json'),
    jobsSha256=sha(args.root / 'imagegen-jobs-v1.json'),
    nativeWaterProfile=dict(file=str(args.water_profile), sha256=sha(args.water_profile)),
    acceptedSeaProfile=dict(file=str(args.accepted_coast_profile), sha256=sha(args.accepted_coast_profile)))
with args.output.open('x') as stream:
    stream.write(json.dumps(profile, indent=2) + '\n')
print(json.dumps(dict(status='PASS_COMPLETE_AUTHORING_INPUTS', members=24, mothers=20,
    waterMembers=5, profileSha256=sha(args.output))))
