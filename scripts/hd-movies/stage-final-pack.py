"""Clone verified final candidates into a fresh immutable pack revision; do not select it."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--baseline-ledger', type=Path, required=True)
parser.add_argument('--followups', type=Path, required=True)
parser.add_argument('--output-ledger', type=Path, required=True)
parser.add_argument('--revision', default='local-natural-r4')
args = parser.parse_args()
assert re.fullmatch('[a-z0-9][a-z0-9_-]{0,79}', args.revision)
baseline = json.loads(args.baseline_ledger.read_text())
plan = json.loads(args.followups.read_text())
assert baseline['status'] == 'PIXEL_PRODUCTION_COMPLETE_AUDITS_PENDING' and len(baseline['completed']) == 136


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


overrides = {}
for request in plan['entries']:
    directory = ROOT / request['directory']
    state = json.loads((directory / 'state.json').read_text())
    assert state['status'] == 'READY_FOR_INDEPENDENT_SOURCE_FIDELITY_REVIEW' and state['identity'] == request['identity']
    ledger = json.loads((directory / 'ledger.json').read_text())
    row = next(r for r in ledger['completed'] if r['identity'] == request['identity'])
    assert row['sha256'] == state['candidateSha256'] and state['jobId'] == request['jobId']
    overrides[request['identity']] = row
assert len(overrides) == len(plan['entries'])
pack = ROOT / '.local/media/hd-movies' / args.revision
pack.mkdir(parents=True, exist_ok=True)
assert not (pack / 'manifest.json').exists(), 'Do not modify an admitted immutable pack'
rows = []
for original in baseline['completed']:
    row = dict(overrides.get(original['identity'], original))
    source, destination = ROOT / row['file'], pack / (row['identity'].replace(':', '-') + '.mp4')
    receipt = json.loads((ROOT / row['receipt']).read_text())
    assert source.stat().st_size == row['bytes'] and sha(source) == row['sha256'] == receipt['file']['sha256']
    if not destination.exists():
        subprocess.run(['/bin/cp', '-c', str(source), str(destination)], check=True)
    assert sha(destination) == row['sha256']
    row['file'] = str(destination.relative_to(ROOT)); rows.append(row)
record = dict(schema='hd-movie-production-ledger-v1', status='PIXEL_PRODUCTION_COMPLETE_AUDITS_PENDING',
    revision=args.revision, total=136, completed=rows, baselineLedgerSha256=sha(args.baseline_ledger),
    followupPlanSha256=sha(args.followups), scope='Final candidates in a fresh immutable revision. Engineering admission and user complete-film acceptance remain separate.')
args.output_ledger.write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(dict(status='FINAL_REVISION_STAGED_UNSELECTED', revision=args.revision,
    identities=136, chainedRepairs=len(overrides), bytes=sum(r['bytes'] for r in rows))))
