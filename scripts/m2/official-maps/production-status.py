"""Refresh batch progress without treating generated candidates as accepted exports."""
import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--jobs', type=Path, default=Path('.artifacts/m2-3/authoring-jobs-v3.json'))
parser.add_argument('--ledger', type=Path, default=Path('docs/m2-3-production-acceptance.json'))
parser.add_argument('--markers', type=Path)
args = parser.parse_args()
jobs = json.loads(args.jobs.read_text())['jobs']
ledger = json.loads(args.ledger.read_text())
sharing_file = args.jobs.parent / 'exact-authored-plate-sharing-v1.json'
sharing = json.loads(sharing_file.read_text())['aliases'] if sharing_file.exists() else {}
marker_file = args.markers or args.jobs.parent / 'native-palette-markers-v1.json'
markers = set(json.loads(marker_file.read_text())['preservedSlots']) if marker_file.exists() else set()
complete, pending, formats, shared, preserved = Counter(), Counter(), Counter(), Counter(), Counter()
for job in jobs:
    image, receipt = Path(job['destination']), Path(job['provenance'])
    if image.exists() and receipt.exists():
        record = json.loads(receipt.read_text())
        declared = [record[key] for key in ('masterSha256', 'sha256') if key in record]
        actual = hashlib.sha256(image.read_bytes()).hexdigest()
        assert declared and all(value == actual for value in declared), job['id']
        complete[job['group']] += 1
        formats[job['format']] += 1
    elif job['format'] == 'shp' and all(
            f'{slot["member"]}-{slot["frame"]:03}' in markers for slot in job['members']):
        preserved[job['group']] += 1
    elif job['format'] == 'shp' and all(
            f'{slot["member"]}-{slot["frame"]:03}' in sharing for slot in job['members']):
        shared[job['group']] += 1
    else:
        pending[job['group']] += 1
ledger['production']['generatedMasters'] = sum(complete.values())
ledger['production']['otherShp']['generatedMasters'] = formats['shp']
ledger['production']['otherShp']['status'] = 'BATCH_AUTHORING_AND_COMPLETE_FAMILY_EXPORT_IN_PROGRESS'
ledger['production']['tmp']['generatedMasters'] = formats['tmp']
ledger['production']['tmp']['status'] = 'BATCH_AUTHORING_AND_COMPLETE_GROUP_EXPORT_IN_PROGRESS'
ledger['production']['jobs'] = {
    'path': str(args.jobs.resolve()), 'generatedCandidatesByGroup': dict(complete),
    'remainingCandidatesByGroup': dict(pending), 'exactSharedSheetsByGroup': dict(shared),
    'preservedNativeMarkerSheetsByGroup': dict(preserved),
    'exactSharedSlots': len(sharing), 'generatedCandidateStatus': 'EXPORT_AND_VISUAL_QA_REQUIRED'}
args.ledger.write_text(json.dumps(ledger, indent=2) + '\n')
print(json.dumps(ledger['production']['jobs']))
