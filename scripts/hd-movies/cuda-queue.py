"""Run one assigned GPU lane from a shared immutable dispatch plan."""
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

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--workspace', type=Path, required=True)
parser.add_argument('--host', choices=['loki', 'freya'], required=True)
parser.add_argument('--gpu', type=int, required=True)
args = parser.parse_args()
root = args.workspace.resolve()
plan_file = root / 'state/dispatch-plan.json'
plan = json.loads(plan_file.read_text())
assert plan['schema'] == 'hd-movie-distributed-plan-v1'
validation_file = root / 'state/validation.json'
assert hashlib.sha256(validation_file.read_bytes()).hexdigest() == plan['validationSha256']
validation = json.loads(validation_file.read_text())
assert validation['status'] == 'PASS_CUDA_REFERENCE_CLOCK_NATIVE_AND_RESUME'
assert validation['implementation'] == plan['implementation']
assert socket.gethostname().endswith(args.host), 'Wrong physical host for this lane'
lane = f'{args.host}-gpu{args.gpu}'
lock = (root / 'state' / (lane + '.lock')).open('a')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
jobs = sorted([job for job in plan['jobs'] if job['host'] == args.host and job['gpu'] == args.gpu], key=lambda job: job['slotSequence'])
state = dict(schema='hd-movie-cuda-lane-v1', host=args.host, gpu=args.gpu, pid=os.getpid(), completed=[], total=len(jobs), current=None,
             planSha256=hashlib.sha256(plan_file.read_bytes()).hexdigest())


def save(status, **values):
    state.update(status=status, updatedUtc=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), **values)
    file = root / 'state' / (lane + '.json')
    temporary = file.with_suffix('.json.writing')
    temporary.write_text(json.dumps(state, indent=2) + '\n')
    temporary.replace(file)
    print(json.dumps(state), flush=True)


try:
    for assigned in jobs:
        job_file = root / 'jobs' / (assigned['jobId'] + '.json')
        save('WAITING_FOR_VERIFIED_INPUT', current=assigned['identity'])
        while not job_file.exists():
            time.sleep(5)
        job = json.loads(job_file.read_text())
        assert job['identity'] == assigned['identity'] and job['jobId'] == assigned['jobId'] and not job['probe']
        assert job['implementation'] == plan['implementation']
        claim = root / 'state' / (assigned['jobId'] + '.claim')
        try:
            claim.mkdir()
        except FileExistsError:
            owner = json.loads((claim / 'owner.json').read_text())
            assert owner['host'] == args.host and owner['gpu'] == args.gpu, 'Assigned job belongs to another lane'
        (claim / 'owner.json').write_text(json.dumps(dict(host=args.host, gpu=args.gpu, pid=os.getpid())) + '\n')
        save('RESTORING', childPid=None)
        with (root / 'logs' / (assigned['jobId'] + '.log')).open('a') as log:
            env = {**os.environ, 'OMP_NUM_THREADS': '8', 'MKL_NUM_THREADS': '8', 'OPENBLAS_NUM_THREADS': '8'}
            child = subprocess.Popen([sys.executable, str(root / 'worker/cuda-render.py'), str(job_file),
                                      '--workspace', str(root), '--gpu', str(args.gpu)], stdout=log, stderr=subprocess.STDOUT, env=env)
            save('RESTORING', childPid=child.pid)
            assert child.wait() == 0, f'CUDA render failed: {assigned["jobId"]}; inspect its log'
        receipt = json.loads((root / 'outputs' / assigned['jobId'] / 'receipt.json').read_text())
        assert receipt['jobSha256'] == hashlib.sha256(job_file.read_bytes()).hexdigest()
        state['completed'].append(assigned['identity'])
        save('VIDEO_READY_FOR_MAC_AUDIO', childPid=None)
    save('ALL_ASSIGNED_VIDEOS_RENDERED', current=None)
except BaseException as error:
    save('STOPPED_FOR_INVESTIGATION', error=str(error))
    raise
