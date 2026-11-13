"""Return one chained repair into isolated staging and prepare its source-matched native review."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = Path(__file__).parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--job', type=Path, required=True)
parser.add_argument('--directory', type=Path, required=True)
args = parser.parse_args()
job_file, directory = args.job.resolve(), args.directory.resolve()
job = json.loads(job_file.read_text())
directory.mkdir(parents=True, exist_ok=True)
shared = 'baldar/ra2-hd-movies-20261110-cuda-r1'
state = dict(schema='hd-movie-fidelity-followup-return-v1', status='WAITING_FOR_REMOTE_VIDEO',
             identity=job['identity'], jobId=job['jobId'])


def save(file, value):
    temporary = file.with_suffix(file.suffix + '.writing')
    temporary.write_text(json.dumps(value, indent=2) + '\n'); temporary.replace(file)


def persist(status):
    state.update(status=status, updatedUtc=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
    save(directory / 'state.json', state)


try:
    while True:
        script = ('from pathlib import Path\np=Path.home()/' + repr(shared + '/outputs/' + job['jobId'] + '/receipt.json')
                  + '\nprint(int(p.exists()))\n')
        ready = subprocess.check_output(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10',
            'loki', 'python3', '-'], input=script, text=True, timeout=45).strip() == '1'
        if ready:
            break
        persist('WAITING_FOR_REMOTE_VIDEO'); time.sleep(15)
    returned = directory / 'returned'; returned.mkdir(exist_ok=True)
    subprocess.run(['rsync', '-a', '--partial', '--include=receipt.json', '--include=video.mp4', '--exclude=*',
        '-e', 'ssh -o BatchMode=yes -o ConnectTimeout=10', 'loki:' + shared + '/outputs/' + job['jobId'] + '/',
        str(returned) + '/'], check=True, timeout=1800)
    persist('VERIFYING_ORIGINAL_AUDIO_AND_CLOCK')
    work, output = directory / 'film', directory / 'pack' / (job['identity'].replace(':', '-') + '.mp4')
    output.parent.mkdir(exist_ok=True)
    subprocess.run([sys.executable, SCRIPTS / 'finalize-cuda.py', returned / 'receipt.json', '--job', job_file,
        '--validation', ROOT / '.artifacts/hd-movies/fidelity-repair/validation.json', '--work', work, '--output', output], check=True)
    receipt = json.loads((work / 'receipt.json').read_text())
    audit = directory / 'audits' / job['identity'].replace(':', '-')
    subprocess.run([sys.executable, SCRIPTS / 'production-audit.py', work / 'receipt.json',
        '--source-index', ROOT / '.artifacts/hd-movies/production/source-index.json', '--directory', audit, '--movie', output], check=True)
    ledger = json.loads((ROOT / '.artifacts/hd-movies/production/ledger.json').read_text())
    for row in ledger['completed']:
        if row['identity'] == job['identity']:
            row.update(file=str(output.relative_to(ROOT)), bytes=output.stat().st_size, sha256=receipt['file']['sha256'],
                frames=receipt['video']['frames'], receipt=str((work / 'receipt.json').relative_to(ROOT)))
    save(directory / 'ledger.json', ledger)
    original_points = json.loads((ROOT / '.artifacts/hd-movies/fidelity-repair/final-native-checkpoints.json').read_text())
    points = set(job['treatment']['checkpointFrames'])
    points.update(next(r['frames'] for r in original_points['entries'] if r['identity'] == job['identity']))
    save(directory / 'points.json', dict(entries=[dict(identity=job['identity'], frames=sorted(points))]))
    save(directory / 'target.json', dict(entries=[dict(identity=job['identity'])]))
    persist('CAPTURING_NATIVE_SOURCE_MATCHED_CHECKPOINTS')
    subprocess.run([sys.executable, SCRIPTS / 'final-quality.py', '--ledger', directory / 'ledger.json',
        '--audit-root', directory / 'audits', '--extra-points', directory / 'points.json', '--identities', directory / 'target.json',
        '--directory', directory / 'qa', '--workers', '1'], check=True)
    state.update(candidateSha256=receipt['file']['sha256'], ledger=str((directory / 'ledger.json').relative_to(ROOT)),
                 qa=str((directory / 'qa').relative_to(ROOT)))
    persist('READY_FOR_INDEPENDENT_SOURCE_FIDELITY_REVIEW')
except BaseException as error:
    state['error'] = str(error); persist('STOPPED_FOR_INVESTIGATION'); raise
