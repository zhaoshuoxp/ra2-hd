"""Resume a stopped immutable job, then return its GPU to the balanced queue."""
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
file = root / 'state' / (name + '.json')
state = json.loads(file.read_text()); assert state['status'] == 'STOPPED_FOR_INVESTIGATION'
history = root / 'state/recovery'; history.mkdir(exist_ok=True)
(history / (name + '-' + time.strftime('%Y%m%dT%H%M%S') + '.json')).write_text(json.dumps(state, indent=2) + '\n')
job_file = root / 'jobs' / (state['jobId'] + '.json')
job = json.loads(job_file.read_text())


def save(status, **values):
    state.update(status=status, pid=os.getpid(), updatedUtc=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), **values)
    temporary = file.with_suffix('.json.writing')
    temporary.write_text(json.dumps(state, indent=2) + '\n'); temporary.replace(file)


try:
    save('RESTORING_SOURCE_SENSITIVE_SHOTS', error=None, cachePriming=seed_reuse(root, job))
    with (root / 'logs' / (job['jobId'] + '.log')).open('a') as log:
        child = subprocess.Popen([sys.executable, str(root / 'worker/cuda-fidelity-render.py'), str(job_file),
            '--workspace', str(root), '--gpu', str(args.gpu)], stdout=log, stderr=subprocess.STDOUT)
        save('RESTORING_SOURCE_SENSITIVE_SHOTS', childPid=child.pid)
        assert child.wait() == 0, 'Resumed immutable job failed'
    receipt = json.loads((root / 'outputs' / job['jobId'] / 'receipt.json').read_text())
    assert receipt['jobSha256'] == hashlib.sha256(job_file.read_bytes()).hexdigest()
    save('VIDEO_READY_FOR_MAC_FINALIZATION', childPid=None)
except BaseException as error:
    save('STOPPED_FOR_INVESTIGATION', error=str(error)); raise
lock.close()
os.execv(sys.executable, [sys.executable, str(root / 'worker/fidelity-queue.py'), '--workspace', str(root), '--gpu', str(args.gpu)])
