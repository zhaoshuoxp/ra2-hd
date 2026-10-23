"""Reject unproven rubble sharing through the actual production exporter."""
import argparse
import copy
import hashlib
import json
import subprocess
import sys
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('authoring', type=Path)
parser.add_argument('prepared', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
args.output.mkdir(exist_ok=False)
profile_file = args.authoring / 'material-profile-v3.json'
profile = json.loads(profile_file.read_text())
target = next(iter(profile['sharedNativeRubbleFrames']))
cases = [
    ('wrong-source', 'sourceSha256', '0' * 64, "native[name]['sha256'] == declaration['sourceSha256']"),
    ('wrong-index', 'indexSha256', '0' * 64, "a['indexSha256'] == b['indexSha256']"),
    ('wrong-palette', 'paletteSha256', '0' * 64, "['sha256'] == declaration['paletteSha256']"),
    ('recursive-sharing', 'canonicalMember', target, 'canonical != name and canonical not in shared_rubble'),
]
reports = []
for identity, field, value, assertion in cases:
    candidate = copy.deepcopy(profile)
    candidate['sharedNativeRubbleFrames'][target][field] = value
    file = args.output / (identity + '.json')
    file.write_text(json.dumps(candidate, indent=2) + '\n')
    revision = 'shared-rubble-negative-' + identity
    destination = Path('.local/environment-packs') / revision
    assert not destination.exists()
    result = subprocess.run([sys.executable, 'scripts/m2/export-showcase-shp.py', revision,
        '--root', str(args.authoring), '--material-profile', str(file), '--prepared', str(args.prepared),
        '--contract', str(args.prepared / 'contract.json')], capture_output=True, text=True)
    log = args.output / (identity + '.log')
    log.write_text(result.stdout + result.stderr)
    assert result.returncode != 0 and 'AssertionError' in result.stderr and assertion in result.stderr
    assert not destination.exists(), 'An invalid declaration must not publish any resource files.'
    reports.append(dict(case=identity, status='PASS_REJECTED_BEFORE_PUBLICATION', log=str(log),
        logSha256=hashlib.sha256(log.read_bytes()).hexdigest()))
receipt = dict(status='PASS_FOUR_EXPORTER_PROVENANCE_GUARDS', cases=reports,
    validExport='The independent full-pack verifier separately checks both density crops and native geometry.')
(args.output / 'report.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
