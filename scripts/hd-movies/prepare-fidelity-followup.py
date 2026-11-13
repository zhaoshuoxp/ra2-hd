"""Append a verified shot repair without modifying any already published job."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
from production_plan import windows

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--previous-job', type=Path, required=True)
parser.add_argument('--previous-return', type=Path, required=True)
parser.add_argument('--previous-receipt', type=Path, required=True)
parser.add_argument('--frames', required=True)
parser.add_argument('--name', required=True)
parser.add_argument('--directory', type=Path, required=True)
parser.add_argument('--boundaries', help='Additional source-authoritative temporal context boundaries')
parser.add_argument('--boundary-kind', choices=['dissolve', 'static'], default='dissolve')
args = parser.parse_args()
assert re.fullmatch('[a-z0-9-]+', args.name)
args.directory.mkdir(parents=True, exist_ok=True)
shared = 'baldar/ra2-hd-movies-20261110-cuda-r1'


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


job = json.loads(args.previous_job.read_text())
remote = json.loads(args.previous_return.read_text())
receipt = json.loads(args.previous_receipt.read_text())
assert remote['jobSha256'] == sha(args.previous_job)
assert receipt['recipe']['remoteJobSha256'] == remote['jobSha256']
assert job['identity'] == receipt['identity'] == remote['identity']
previous_id = job['jobId']
old_plan = job['plan']
frames = sorted({int(n) for n in args.frames.split(',')})
assert frames and all(0 <= n < job['video']['frames'] for n in frames)
boundaries = sorted({int(n) for n in args.boundaries.split(',')}) if args.boundaries else []
old_shots = {next(w['shot'] for w in old_plan if w['start'] <= n < w['flushEnd']) for n in frames}
previous_treatment = job['treatment']
if boundaries:
    assert all(0 < n < job['video']['frames'] for n in boundaries)
    for boundary in boundaries:
        old_shots.add(next(w['shot'] for w in old_plan if w['start'] <= boundary < w['flushEnd']))
    cuts = sorted({r['frame'] for r in job['cuts']['candidates']} | set(boundaries))
    job['plan'] = windows(job['video']['frames'], cuts, 40, 10)
    affected_ranges = [(min(w['start'] for w in old_plan if w['shot'] == shot),
                        max(w['end'] for w in old_plan if w['shot'] == shot)) for shot in old_shots]
    shots = sorted({w['shot'] for w in job['plan'] if any(a <= w['start'] < b for a, b in affected_ranges)})
    job['cuts']['candidates'] += [dict(frame=n, sourceReason='Independently inspected authored ' + args.boundary_kind + ' boundary') for n in boundaries
                                if n not in {r['frame'] for r in job['cuts']['candidates']}]
    job['cuts']['candidates'].sort(key=lambda r: r['frame'])
else:
    shots = sorted(old_shots)
    assert not set(shots) & set(previous_treatment['shots']), 'Already treated shots need a distinct diagnosis'
script = ('import json\nfrom pathlib import Path\nr=Path.home()/' + repr(shared + '/outputs/' + previous_id) + '\n'
          'print(json.dumps([json.loads(p.read_text()) for p in sorted(r.glob("segment-*.json"))]))\n')
metadata = json.loads(subprocess.check_output(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10',
    'loki', 'python3', '-'], input=script, text=True, timeout=60))
assert len(metadata) == len(old_plan)
reuse = []
for window, segment in zip(old_plan, metadata):
    assert segment['jobSha256'] == remote['jobSha256'] and segment['window'] == window
signature = lambda w: tuple(w[k] for k in ['start', 'end', 'leftOverlap', 'rightOverlap', 'flushEnd'])
lookup = {signature(m['window']): m for m in metadata}
for index, window in enumerate(job['plan']):
    if window['shot'] in shots:
        reuse.append(None); continue
    segment = lookup[signature(window)]
    assert segment['first'] == (job['plan'][index - 1]['flushEnd'] if index else 0)
    reuse.append(dict(file='outputs/' + previous_id + '/' + segment['file'],
        sha256=segment['sha256'], bytes=segment['bytes'], first=segment['first'], last=segment['last'],
        originalReceiptSha256=sha(args.previous_receipt)))
prior_shots = previous_treatment.get('effectiveBypassShots', previous_treatment['shots'])
prior_ranges = [(min(w['start'] for w in old_plan if w['shot'] == shot),
                 max(w['end'] for w in old_plan if w['shot'] == shot)) for shot in prior_shots]
retained_shots = {w['shot'] for w in job['plan'] if any(a <= w['start'] < b for a, b in prior_ranges)}
job['jobId'] = 'fidelity-r2-' + job['identity'].replace(':', '-') + '-' + args.name
job['treatment'] = dict(strategy='bypass-learned-image-cleaning', shots=shots,
    effectiveBypassShots=sorted(retained_shots | set(shots)),
    retainedTreatment=dict(jobId=previous_id, jobSha256=remote['jobSha256'], shots=prior_shots,
        receiptSha256=sha(args.previous_receipt)),
    originalCandidateSha256=receipt['file']['sha256'], originalReceiptSha256=sha(args.previous_receipt),
    checkpointFrames=sorted(set(frames) | set(previous_treatment.get('checkpointFrames', []))), additionalTemporalBoundaries=boundaries,
    boundaryKind=args.boundary_kind if boundaries else None,
    reason='Source-authored ' + args.boundary_kind + ' context isolation' if boundaries else 'Independent native source-detail review of residual pre-cleaning face facets')
job['settings']['cleaningBypassShots'] = shots
job['reuseSegments'] = reuse
job['estimatedSeconds'] = sum(w['end'] - w['start'] for w in job['plan'] if w['shot'] in shots) * (1.4 if job['video']['width'] == 800 else .9)
for file, digest in job['implementation'].items():
    assert sha(ROOT / 'scripts/hd-movies' / Path(file).name) == digest
file = args.directory / (job['jobId'] + '.json')
assert not file.exists(), 'Published follow-up jobs are immutable'
file.write_text(json.dumps(job, indent=2) + '\n')
subprocess.run(['rsync', '-a', '--delay-updates', '-e', 'ssh -o BatchMode=yes -o ConnectTimeout=10',
    str(file), 'loki:' + shared + '/jobs/' + file.name], check=True)
print(json.dumps(dict(status='IMMUTABLE_FOLLOWUP_PUBLISHED', jobId=job['jobId'], identity=job['identity'],
    shots=shots, retainedBypassShots=prior_shots, contextFrames=sum(w['end'] - w['start'] for w in job['plan'] if w['shot'] in shots),
    reusedSegments=sum(item is not None for item in reuse), totalSegments=len(reuse), jobSha256=sha(file))))
