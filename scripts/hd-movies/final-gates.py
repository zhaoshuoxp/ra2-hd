"""Wait for preferred final candidates, stage the immutable revision and run full automatic gates."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--directory', type=Path, required=True)
parser.add_argument('--revision', default='local-natural-r4')
parser.add_argument('--reuse-gates', type=Path)
args = parser.parse_args()
directory = args.directory.resolve(); directory.mkdir(parents=True, exist_ok=True)
repair = ROOT / '.artifacts/hd-movies/fidelity-repair'
plan = repair / 'followup/active-plan.json'
requests = json.loads(plan.read_text())['entries']
state = dict(schema='hd-movie-final-automatic-gates-v1', status='WAITING_FOR_FINAL_CANDIDATES')


def save(status, **values):
    state.update(status=status, updatedUtc=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), **values)
    file = directory / 'state.json'; temporary = file.with_suffix('.json.writing')
    temporary.write_text(json.dumps(state, indent=2) + '\n'); temporary.replace(file)


def run(name, command):
    with (directory / (name + '.log')).open('a') as log:
        subprocess.run([str(p) for p in command], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, check=True)


try:
    while True:
        pending = []
        for request in requests:
            file = ROOT / request['directory'] / 'state.json'
            record = json.loads(file.read_text()) if file.exists() else dict(status='NOT_YET_RETURNED')
            assert record['status'] != 'STOPPED_FOR_INVESTIGATION', str(request) + ':' + str(record)
            if record['status'] != 'READY_FOR_INDEPENDENT_SOURCE_FIDELITY_REVIEW':
                pending.append(request['identity'])
        save('WAITING_FOR_FINAL_CANDIDATES', pending=pending, ready=len(requests) - len(pending), total=len(requests))
        if not pending:
            break
        time.sleep(15)
    ledger = directory / 'delivery-ledger.json'
    save('STAGING_FRESH_IMMUTABLE_REVISION')
    run('stage', [sys.executable, ROOT / 'scripts/hd-movies/stage-final-pack.py', '--baseline-ledger', repair / 'final-ledger.json',
        '--followups', plan, '--output-ledger', ledger, '--revision', args.revision])
    if args.reuse_gates:
        rows = json.loads(ledger.read_text())['completed']
        sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
        technical_impl = sha(ROOT / 'scripts/hd-movies/verify-final-library.py')
        color_impl = sha(ROOT / 'scripts/hd-movies/coherent-color-scan.py')
        reused_technical, reused_color = [], []
        (directory / 'technical').mkdir(exist_ok=True); (directory / 'color').mkdir(exist_ok=True)
        for row in rows:
            identity = row['identity']; name = identity.replace(':', '-')
            prior = args.reuse_gates / 'technical' / (name + '.json')
            check = json.loads(prior.read_text())
            if (check['candidateSha256'] == row['sha256'] and check['productionReceiptSha256'] == sha(ROOT / row['receipt'])
                    and check['implementationSha256'] == technical_impl):
                shutil.copyfile(prior, directory / 'technical' / prior.name); reused_technical.append(identity)
            prior_dir = args.reuse_gates / 'color' / name
            check = json.loads((prior_dir / 'scan.json').read_text())
            if check['candidateSha256'] == row['sha256'] and check['implementationSha256'] == color_impl:
                shutil.copytree(prior_dir, directory / 'color' / name); reused_color.append(identity)
        (directory / 'verified-reuse.json').write_text(json.dumps(dict(
            source=str(args.reuse_gates.resolve().relative_to(ROOT)), technicalIdentities=reused_technical,
            colorIdentities=reused_color, policy='Only identical candidate, receipt and checker implementation hashes reuse same-run completed verification. The final checker rehashes every delivered payload.'), indent=2) + '\n')
    save('VERIFYING_ALL_136_AUDIO_VIDEO_CLOCKS_AND_SOURCE_COLOR', ledger=str(ledger.relative_to(ROOT)))
    commands = [
        ('technical', [sys.executable, ROOT / 'scripts/hd-movies/verify-final-library.py', '--ledger', ledger,
                       '--directory', directory / 'technical', '--workers', '3']),
        ('color', [sys.executable, ROOT / 'scripts/hd-movies/coherent-color-scan.py', '--ledger', ledger,
                   '--directory', directory / 'color', '--workers', '2']),
    ]
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda pair: run(*pair), commands))
    save('READY_FOR_INDEPENDENT_ENGINEERING_SEAL', pending=[],
        technical=str((directory / 'technical/summary.json').relative_to(ROOT)),
        colorScreen=str((directory / 'color/summary.json').relative_to(ROOT)),
        scope='All candidates staged and automatic gates finished; this state does not select the pack or substitute for independent source-fidelity review.')
except BaseException as error:
    save('STOPPED_FOR_INVESTIGATION', error=str(error)); raise
