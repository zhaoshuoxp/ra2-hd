"""Prepare full-frame/native repair review as each verified corrected film returns."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--directory', type=Path, required=True)
args = parser.parse_args()
repair = args.directory.resolve()
output = ROOT / '.artifacts/hd-movies/final-qa-r2'
output.mkdir(exist_ok=True)
base = json.loads((ROOT / '.artifacts/hd-movies/production/ledger.json').read_text())
plan = json.loads((repair / 'plan.json').read_text())
expected = {r['identity'] for r in plan['entries']}
manual = {r['identity']: set(r['frames']) for r in json.loads((repair / 'manual-checkpoints.json').read_text())['entries']}
screen = json.loads((ROOT / '.artifacts/hd-movies/coherent-color-r3/summary.json').read_text())
for row in screen['entries']:
    if row['identity'] in expected:
        manual.setdefault(row['identity'], set()).update(p['frame'] for p in row['worstFrames'])
extra = repair / 'final-native-checkpoints.json'
extra.write_text(json.dumps(dict(entries=[dict(identity=k, frames=sorted(v)) for k, v in sorted(manual.items())]), indent=2) + '\n')
state = dict(schema='hd-movie-corrected-qa-preparation-v1', status='RUNNING', pid=os.getpid(), completed=[], total=len(expected))


def save():
    state['updatedUtc'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    file = output / 'watch-state.json'; temporary = file.with_suffix('.json.writing')
    temporary.write_text(json.dumps(state, indent=2) + '\n'); temporary.replace(file)


try:
    while len(state['completed']) < len(expected):
        ready = {}
        for identity in expected:
            file = repair / 'films' / identity.replace(':', '-') / 'receipt.json'
            audit_file = repair / 'audits' / identity.replace(':', '-') / 'audit-input.json'
            if not file.exists() or not audit_file.exists():
                continue
            receipt, audit = json.loads(file.read_text()), json.loads(audit_file.read_text())
            assert receipt['file']['sha256'] == audit['candidateSha256']
            ready[identity] = dict(identity=identity,
                file=str(Path('.local/media/hd-movies/local-natural-r2') / receipt['file']['path']),
                receipt=str(file.relative_to(ROOT)), bytes=receipt['file']['bytes'], sha256=receipt['file']['sha256'], frames=receipt['video']['frames'])
        for identity in sorted(set(ready) - set(state['completed'])):
            snapshot = {**base, 'completed': [ready.get(r['identity'], r) for r in base['completed']],
                        'scope': 'Staging review snapshot; unrepaired baseline holds remain unadmitted. Only the explicit review target is examined.'}
            staging = repair / 'qa-staging-ledger.json'; staging.write_text(json.dumps(snapshot, indent=2) + '\n')
            target = repair / 'qa-target.json'; target.write_text(json.dumps(dict(entries=[dict(identity=identity)])) + '\n')
            with (output / (identity.replace(':', '-') + '.log')).open('a') as log:
                subprocess.run([sys.executable, str(Path(__file__).with_name('final-quality.py')), '--directory', str(output),
                    '--ledger', str(staging), '--audit-root', str(repair / 'audits'), '--extra-points', str(extra),
                    '--identities', str(target), '--workers', '1'], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, check=True)
            assert (output / identity.replace(':', '-') / 'scan.json').exists()
            state['completed'].append(identity); save()
            print(json.dumps(dict(identity=identity, prepared=len(state['completed']), total=len(expected))), flush=True)
        save(); time.sleep(15)
    state['status'] = 'ALL_REPAIRED_FILMS_READY_FOR_SOURCE_MATCHED_VISUAL_REVIEW'; save()
except BaseException as error:
    state.update(status='STOPPED_FOR_INVESTIGATION', error=str(error)); save()
    raise
