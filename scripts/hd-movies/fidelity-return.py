"""Return corrected videos, verify original audio, and prepare the complete final candidate ledger."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = Path(__file__).parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--directory', type=Path, required=True)
args = parser.parse_args()
directory = args.directory.resolve()
base = ROOT / '.artifacts/hd-movies/production'
original = json.loads((base / 'ledger.json').read_text())
plan = json.loads((directory / 'plan.json').read_text())
jobs = {r['identity']: 'fidelity-r2-' + r['identity'].replace(':', '-') for r in plan['entries']}
pack = ROOT / '.local/media/hd-movies/local-natural-r2'
pack.mkdir(parents=True, exist_ok=True)
shared = 'baldar/ra2-hd-movies-20261110-cuda-r1'
state = dict(schema='hd-movie-fidelity-return-v1', status='RUNNING', pid=os.getpid(), completed=[], total=len(jobs), errors=[])


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def save(file, value):
    temporary = file.with_suffix(file.suffix + '.writing')
    temporary.write_text(json.dumps(value, indent=2) + '\n'); temporary.replace(file)


def persist():
    state['updatedUtc'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    save(directory / 'return-state.json', state)


def run(command, log):
    with log.open('a') as stream:
        subprocess.run([str(v) for v in command], cwd=ROOT, stdout=stream, stderr=subprocess.STDOUT, check=True)


for row in original['completed']:
    if row['identity'] in jobs:
        continue
    source, target = ROOT / row['file'], pack / Path(row['file']).name
    if not target.exists():
        subprocess.run(['cp', '-c', str(source), str(target)], check=True)
    assert sha(target) == row['sha256'], 'Untreated candidate changed'
previous_state = directory / 'return-state.json'
if previous_state.exists():
    prior = json.loads(previous_state.read_text())
    assert prior['total'] == len(jobs)
    for identity in prior['completed']:
        assert identity in jobs
        receipt = json.loads((directory / 'films' / identity.replace(':', '-') / 'receipt.json').read_text())
        audit = json.loads((directory / 'audits' / identity.replace(':', '-') / 'audit-input.json').read_text())
        assert sha(pack / (identity.replace(':', '-') + '.mp4')) == receipt['file']['sha256'] == audit['candidateSha256']
        state['completed'].append(identity)
    state['resumedFrom'] = dict(status=prior['status'], verifiedCompleted=len(state['completed']))
persist()
try:
    while len(state['completed']) < len(jobs):
        script = ('import json\nfrom pathlib import Path\nr=Path.home()/' + repr(shared) + '\n'
                  'jobs=' + repr(list(jobs.values())) + '\n'
                  'ready=[j for j in jobs if (r/"outputs"/j/"receipt.json").exists()]\n'
                  'workers={p.stem:json.loads(p.read_text()) for p in (r/"state").glob("fidelity-*-gpu*.json")}\n'
                  'print(json.dumps(dict(ready=ready,workers=workers)))\n')
        snapshot = json.loads(subprocess.check_output(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10',
                                                       'loki', 'python3', '-'], input=script, text=True, timeout=45))
        state['workers'] = snapshot['workers']
        assert all(w['status'] != 'STOPPED_FOR_INVESTIGATION' for w in snapshot['workers'].values()), 'A fidelity worker stopped'
        for identity, job_id in jobs.items():
            if identity in state['completed'] or job_id not in snapshot['ready']:
                continue
            returned = directory / 'returned' / job_id
            returned.mkdir(parents=True, exist_ok=True)
            subprocess.run(['rsync', '-a', '--partial', '--include=receipt.json', '--include=video.mp4', '--exclude=*',
                '-e', 'ssh -o BatchMode=yes -o ConnectTimeout=10', 'loki:' + shared + '/outputs/' + job_id + '/',
                str(returned) + '/'], check=True, timeout=1800)
            work = directory / 'films' / identity.replace(':', '-')
            target = pack / (identity.replace(':', '-') + '.mp4')
            run([sys.executable, SCRIPTS / 'finalize-cuda.py', returned / 'receipt.json', '--job', directory / (job_id + '.json'),
                 '--validation', directory / 'validation.json', '--work', work, '--output', target], directory / (job_id + '-finalize.log'))
            run([sys.executable, SCRIPTS / 'production-audit.py', work / 'receipt.json', '--source-index', base / 'source-index.json',
                 '--directory', directory / 'audits' / identity.replace(':', '-'), '--movie', target], directory / (job_id + '-audit.log'))
            state['completed'].append(identity); persist()
            print(json.dumps(dict(status='REPAIRED_FILM_RETURNED_AUDIT_PENDING', identity=identity, completed=len(state['completed']), total=len(jobs))), flush=True)
        persist(); time.sleep(15)
    entries = []
    for row in original['completed']:
        identity = row['identity']
        receipt_file = directory / 'films' / identity.replace(':', '-') / 'receipt.json' if identity in jobs else ROOT / row['receipt']
        receipt = json.loads(receipt_file.read_text())
        target = pack / (identity.replace(':', '-') + '.mp4')
        assert sha(target) == receipt['file']['sha256']
        entries.append(dict(identity=identity, file=str(target.relative_to(ROOT)), bytes=target.stat().st_size,
            sha256=receipt['file']['sha256'], frames=receipt['video']['frames'], receipt=str(receipt_file.relative_to(ROOT))))
    save(directory / 'final-ledger.json', dict(schema='hd-movie-production-ledger-v1',
        status='PIXEL_PRODUCTION_COMPLETE_AUDITS_PENDING', revision='local-natural-r2', completed=entries, total=136,
        scope='All source-faithful corrected and untouched candidates. Final per-film engineering review and user delivery review remain separate.'))
    state['status'] = 'ALL_CORRECTED_CANDIDATES_RETURNED_AUDIT_PENDING'; persist()
except BaseException as error:
    state.update(status='STOPPED_FOR_INVESTIGATION', error=str(error)); persist()
    raise
