"""Keep Mac restoration, shared CUDA inputs and original-audio finalization running together."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = Path(__file__).parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--directory', type=Path, required=True)
args = parser.parse_args()
directory = args.directory.resolve()
base = ROOT / '.artifacts/hd-movies/production'
plan = json.loads((directory / 'dispatch-plan.json').read_text())
validation_file = directory / 'validation.json'
assert hashlib.sha256(validation_file.read_bytes()).hexdigest() == plan['validationSha256']
assert json.loads(validation_file.read_text())['status'] == 'PASS_CUDA_REFERENCE_CLOCK_NATIVE_AND_RESUME'
lock = (base / 'batch.lock').open('a')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
ledger_file = base / 'ledger.json'
previous = json.loads(ledger_file.read_text())
assert previous['completed'] == plan['baselineCompleted'] and previous['current'] == plan['adopted'], 'Dispatcher advanced; replan before taking over'
qualified = {r['identity']: r for r in json.loads((base / 'source-qualification.json').read_text())['entries']}
pack = ROOT / '.local/media/hd-movies/local-temporal-r1'
shared = plan['sharedWorkspace']
bundle = directory / 'bundle'
remote_jobs = sorted([job for job in plan['jobs'] if job['host'] != 'local'], key=lambda job: (job['slotSequence'], -job['estimatedSeconds']))
local_jobs = sorted([job for job in plan['jobs'] if job['host'] == 'local'], key=lambda job: job['slotSequence'])
ledger = {**previous, 'pid': os.getpid(), 'status': 'RUNNING_DISTRIBUTED_PIXEL_PRODUCTION', 'distributedPlan': str((directory / 'dispatch-plan.json').relative_to(ROOT)),
          'workers': {}, 'inputsReady': [], 'remoteVideosReady': [], 'current': plan['adopted']}
mutex = threading.RLock()


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def save(**values):
    with mutex:
        ledger.update(values, updatedUtc=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
        temporary = ledger_file.with_suffix('.json.writing')
        temporary.write_text(json.dumps(ledger, indent=2) + '\n')
        temporary.replace(ledger_file)


def run(command, log):
    with log.open('a') as stream:
        subprocess.run([str(value) for value in command], cwd=ROOT, stdout=stream, stderr=subprocess.STDOUT, check=True)


def ssh(script):
    return subprocess.check_output(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', 'loki', 'python3', '-'],
                                   input=script, text=True, timeout=45)


def rsync(source, target):
    subprocess.run(['rsync', '-a', '--partial', '--delay-updates', '-e', 'ssh -o BatchMode=yes -o ConnectTimeout=10', str(source), str(target)], check=True, timeout=1800)


def audit_and_record(identity, receipt_file, output):
    receipt = json.loads(receipt_file.read_text())
    assert receipt['identity'] == identity and receipt['status'] == 'PRODUCED_AWAITING_FULL_FILM_AUDIT'
    assert sha(output) == receipt['file']['sha256']
    log = base / (identity.replace(':', '-') + '-audit.log')
    try:
        run([sys.executable, SCRIPTS / 'production-audit.py', receipt_file, '--source-index', base / 'source-index.json',
             '--directory', base / 'audits' / identity.replace(':', '-'), '--movie', output], log)
    except subprocess.CalledProcessError:
        with mutex:
            ledger['auditPreparationIssues'].append(dict(identity=identity, log=str(log.relative_to(ROOT))))
    with mutex:
        assert identity not in {r['identity'] for r in ledger['completed']}
        ledger['completed'].append(dict(identity=identity, file=str(output.relative_to(ROOT)), bytes=receipt['file']['bytes'],
                                       sha256=receipt['file']['sha256'], frames=receipt['video']['frames'], receipt=str(receipt_file.relative_to(ROOT))))
        save()
    print(json.dumps(dict(status='MOVIE_PRODUCED_AUDIT_PENDING', identity=identity, completed=len(ledger['completed']))), flush=True)


def prepare_remote():
    for job in remote_jobs:
        job_file = bundle / 'jobs' / (job['jobId'] + '.json')
        run([sys.executable, SCRIPTS / 'prepare-cuda-job.py', job['identity'], '--directory', bundle, '--job-id', job['jobId']],
            directory / ('prepare-' + job['jobId'] + '.log'))
        record = json.loads(job_file.read_text())
        input_dir = Path(record['input']['file']).parent
        ssh('from pathlib import Path\np=Path.home()/' + repr(shared + '/' + str(input_dir)) + '\np.mkdir(parents=True,exist_ok=True)\n')
        rsync(str(bundle / input_dir) + '/', 'loki:' + shared + '/' + str(input_dir) + '/')
        rsync(job_file, 'loki:' + shared + '/jobs/' + job_file.name)
        with mutex:
            ledger['inputsReady'].append(job['identity'])
            save()
        print(json.dumps(dict(status='SHARED_INPUT_READY', identity=job['identity'])), flush=True)


def restore_local():
    adopted = plan['adopted']
    if adopted:
        work = (ROOT / adopted['progress']).parent
        while not (work / 'receipt.json').exists():
            # The old dispatcher was stopped; its already-running movie remains intact.
            try:
                os.kill(plan['adoptedPid'], 0)
            except ProcessLookupError:
                assert (work / 'receipt.json').exists(), 'The adopted Mac film stopped before writing its receipt'
            time.sleep(5)
        audit_and_record(adopted['identity'], work / 'receipt.json', pack / (adopted['identity'].replace(':', '-') + '.mp4'))
    for job in local_jobs:
        identity = job['identity']
        name = identity.replace(':', '-')
        q = qualified[identity]
        work, output = base / 'films' / (name + q.get('workSuffix', '')), pack / (name + '.mp4')
        save(current=dict(identity=identity, progress=str((work / 'progress.json').relative_to(ROOT))))
        command = [sys.executable, SCRIPTS / 'production-film.py', identity, '--source-index', base / 'source-index.json', '--work', work, '--output', output]
        if q.get('videoSourceReceipt'):
            command += ['--video-source-receipt', ROOT / q['videoSourceReceipt']]
        run(command, base / (name + '.log'))
        audit_and_record(identity, work / 'receipt.json', output)
    save(current=None)


def finalize(job):
    job_id = job['jobId']
    returned = directory / 'returned' / job_id
    returned.mkdir(parents=True, exist_ok=True)
    subprocess.run(['rsync', '-a', '--partial', '--include=receipt.json', '--include=video.mp4', '--exclude=*',
                    '-e', 'ssh -o BatchMode=yes -o ConnectTimeout=10', 'loki:' + shared + '/outputs/' + job_id + '/', str(returned) + '/'], check=True, timeout=1800)
    name = job['identity'].replace(':', '-')
    work, output = base / 'films' / (name + '-cuda-r1'), pack / (name + '.mp4')
    run([sys.executable, SCRIPTS / 'finalize-cuda.py', returned / 'receipt.json', '--job', bundle / 'jobs' / (job_id + '.json'),
         '--validation', validation_file, '--work', work, '--output', output], directory / ('finalize-' + job_id + '.log'))
    audit_and_record(job['identity'], work / 'receipt.json', output)


save()
pool = ThreadPoolExecutor(max_workers=3)
try:
    preparing = pool.submit(prepare_remote)
    local = pool.submit(restore_local)
    returning = None
    queued = set()
    while True:
        for future in (preparing, local, returning):
            if future and future.done():
                future.result()
        if len(ledger['completed']) == ledger['total']:
            break
        script = ('import json\nfrom pathlib import Path\nr=Path.home()/' + repr(shared) + '\n'
                  'plan=json.loads((r/"state/dispatch-plan.json").read_text())\n'
                  'lanes={p.stem:json.loads(p.read_text()) for p in (r/"state").glob("*-gpu*.json")}\n'
                  'ready=[j["jobId"] for j in plan["jobs"] if j["host"]!="local" and (r/"outputs"/j["jobId"]/"receipt.json").exists()]\n'
                  'progress={j["jobId"]:json.loads((r/"outputs"/j["jobId"]/"progress.json").read_text()) for j in plan["jobs"] if j["host"]!="local" and (r/"outputs"/j["jobId"]/"progress.json").exists()}\n'
                  'print(json.dumps(dict(lanes=lanes,ready=ready,progress=progress)))\n')
        try:
            snapshot = json.loads(ssh(script))
        except (subprocess.SubprocessError, json.JSONDecodeError) as error:
            save(lastConnectionIssue=str(error))
            time.sleep(15)
            continue
        save(workers=snapshot['lanes'], remoteProgress=snapshot['progress'], remoteVideosReady=snapshot['ready'])
        assert all(row['status'] != 'STOPPED_FOR_INVESTIGATION' for row in snapshot['lanes'].values()), 'Remote lane requires investigation'
        if returning is None or returning.done():
            job = next((job for job in remote_jobs if job['jobId'] in snapshot['ready'] and job['jobId'] not in queued), None)
            if job:
                queued.add(job['jobId'])
                returning = pool.submit(finalize, job)
        time.sleep(15)
    save(status='PIXEL_PRODUCTION_COMPLETE_AUDITS_PENDING', current=None)
except BaseException as error:
    save(status='STOPPED_FOR_INVESTIGATION', error=str(error))
    raise
finally:
    pool.shutdown(wait=False, cancel_futures=True)
