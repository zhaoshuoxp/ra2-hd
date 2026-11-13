"""Balance source-fidelity repairs by claiming the next largest shared job on one GPU."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
from fidelity_cache import seed_reuse

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--workspace', type=Path, required=True)
parser.add_argument('--gpu', type=int, required=True)
args = parser.parse_args()
root = args.workspace.resolve()
host = socket.gethostname().removeprefix('cvmed-')
name = f'fidelity-{host}-gpu{args.gpu}'
lock = (root / 'state' / (name + '.lock')).open('a')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
state = dict(schema='hd-movie-fidelity-worker-v1', host=host, gpu=args.gpu, pid=os.getpid(), completed=[])
claims = root / 'state/fidelity-claims'
claims.mkdir(exist_ok=True)


def save(status, **values):
    state.update(status=status, updatedUtc=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), **values)
    file = root / 'state' / (name + '.json')
    temporary = file.with_suffix('.json.writing')
    temporary.write_text(json.dumps(state, indent=2) + '\n'); temporary.replace(file)


try:
    while True:
        candidates = [(f, json.loads(f.read_text())) for f in (root / 'jobs').glob('fidelity-r2-*.json')]
        candidates.sort(key=lambda pair: -pair[1]['estimatedSeconds'])
        selected = None
        for file, job in candidates:
            claim = claims / job['jobId']
            try:
                claim.mkdir()
            except FileExistsError:
                continue
            (claim / 'owner.json').write_text(json.dumps(dict(host=host, gpu=args.gpu, pid=os.getpid())) + '\n')
            selected = file, job
            break
        if selected is None:
            marker = root / 'state/fidelity-inputs-ready.json'
            if marker.exists() and all((claims / job['jobId']).exists() for _, job in candidates):
                save('ALL_AVAILABLE_JOBS_CLAIMED', current=None)
                break
            save('WAITING_FOR_INPUT', current=None)
            time.sleep(5)
            continue
        file, job = selected
        save('RESTORING_SOURCE_SENSITIVE_SHOTS', current=job['identity'], jobId=job['jobId'])
        save('RESTORING_SOURCE_SENSITIVE_SHOTS', cachePriming=seed_reuse(root, job))
        with (root / 'logs' / (job['jobId'] + '.log')).open('a') as log:
            child = subprocess.Popen([sys.executable, str(root / 'worker/cuda-fidelity-render.py'), str(file),
                                      '--workspace', str(root), '--gpu', str(args.gpu)], stdout=log, stderr=subprocess.STDOUT)
            save('RESTORING_SOURCE_SENSITIVE_SHOTS', childPid=child.pid)
            assert child.wait() == 0, f'Inspect failed job {job["jobId"]}'
        receipt = json.loads((root / 'outputs' / job['jobId'] / 'receipt.json').read_text())
        assert receipt['jobSha256'] == hashlib.sha256(file.read_bytes()).hexdigest()
        state['completed'].append(job['identity'])
        save('VIDEO_READY_FOR_MAC_FINALIZATION', childPid=None)
except BaseException as error:
    save('STOPPED_FOR_INVESTIGATION', error=str(error))
    raise
