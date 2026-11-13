"""Publish source-sensitive shot repairs while retaining every unaffected encoded segment."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = Path(__file__).parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--directory', type=Path, required=True)
parser.add_argument('--screen', type=Path)
parser.add_argument('--manual', type=Path)
parser.add_argument('--pilot', action='store_true')
args = parser.parse_args()
base = ROOT / '.artifacts/hd-movies/production'
bundle = ROOT / '.artifacts/hd-movies/cuda-r1/bundle'
shared = 'baldar/ra2-hd-movies-20261110-cuda-r1'
args.directory.mkdir(parents=True, exist_ok=True)
ledger = json.loads((base / 'ledger.json').read_text())
rows = {r['identity']: r for r in ledger['completed']}
manual = {r['identity']: r['frames'] for r in json.loads(args.manual.read_text())['entries']} if args.manual else {}
screen = {r['identity']: r for r in json.loads(args.screen.read_text())['entries']} if args.screen else {}
if args.pilot:
    manual = {'ra2:a04_f03e': [0]}


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def ssh(script):
    return subprocess.check_output(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', 'loki', 'python3', '-'],
                                   input=script, text=True, timeout=60)


def upload(source, target, segments=False):
    options = ['--include=segment-*.mp4', '--exclude=*'] if segments else []
    subprocess.run(['rsync', '-a', '--partial', '--delay-updates', *options,
                    '-e', 'ssh -o BatchMode=yes -o ConnectTimeout=10', str(source), 'loki:' + shared + '/' + target], check=True)


requests = []
for identity, row in rows.items():
    plan = json.loads((ROOT / row['receipt']).parent.joinpath('plan.json').read_text())['windows']
    shots = set(screen.get(identity, {}).get('affectedShots', []))
    shots.update(next(w['shot'] for w in plan if w['start'] <= frame < w['flushEnd']) for frame in manual.get(identity, []))
    if not shots:
        continue
    frames = sum(w['end'] - w['start'] for w in plan if w['shot'] in shots)
    receipt = json.loads((ROOT / row['receipt']).read_text())
    cost = frames * (1.4 if receipt['original']['video']['width'] == 800 else .9)
    requests.append(dict(identity=identity, shots=sorted(shots), contextFrames=frames, estimatedSeconds=cost))
requests.sort(key=lambda r: -r['estimatedSeconds'])
(args.directory / ('pilot-plan.json' if args.pilot else 'plan.json')).write_text(json.dumps(dict(
    schema='hd-movie-source-fidelity-repair-plan-v1', entries=requests,
    strategy='Bypass learned image cleaning for complete source-sensitive production shots; retain GAN temporal reconstruction, gain0.5 and every unaffected segment byte.'), indent=2) + '\n')

for request in requests:
    identity = request['identity']; row = rows[identity]
    source_name = identity.replace(':', '-')
    source_job_id = source_name + '-fidelity-source-r2'
    source_job_file = bundle / 'jobs' / (source_job_id + '.json')
    with (args.directory / (source_name + '-prepare.log')).open('a') as log:
        subprocess.run([sys.executable, str(SCRIPTS / 'prepare-cuda-job.py'), identity, '--directory', str(bundle),
                        '--job-id', source_job_id], stdout=log, stderr=subprocess.STDOUT, check=True)
    job = json.loads(source_job_file.read_text())
    original_receipt_file = ROOT / row['receipt']
    original_receipt = json.loads(original_receipt_file.read_text())
    original_work = original_receipt_file.parent
    plan = json.loads((original_work / 'plan.json').read_text())['windows']
    assert plan == job['plan'], 'Source/window plan changed before repair'
    assert job['sourceVideoInput'] == original_receipt['recipe'].get('sourceVideoInput')
    remote_root = 'outputs/' + source_name + '-cuda-r1'
    is_cuda = original_receipt['recipe'].get('backend') == 'cuda-ieee-fp32'
    if is_cuda:
        old_returned = ROOT / '.artifacts/hd-movies/cuda-r1/returned' / (source_name + '-cuda-r1') / 'receipt.json'
        old_cuda = json.loads(old_returned.read_text())
        script = ('import json\nfrom pathlib import Path\nr=Path.home()/' + repr(shared + '/' + remote_root) + '\n'
                  'print(json.dumps([json.loads(p.read_text()) for p in sorted(r.glob("segment-*.json"))]))\n')
        metadata = json.loads(ssh(script))
        assert all(m['jobSha256'] == old_cuda['jobSha256'] for m in metadata)
    else:
        remote_root = 'inputs/original-segments/' + source_name
        ssh('from pathlib import Path\n(Path.home()/' + repr(shared + '/' + remote_root) + ').mkdir(parents=True,exist_ok=True)\n')
        upload(str(original_work) + '/', remote_root + '/', segments=True)
        metadata = [json.loads(p.read_text()) for p in sorted(original_work.glob('segment-*.json'))]
        assert all(m['recipeSha256'] == original_receipt['recipeSha256'] for m in metadata)
    assert len(metadata) == len(plan)
    reuse = []
    for n, (window, m) in enumerate(zip(plan, metadata)):
        assert m['window'] == window
        first = plan[n - 1]['flushEnd'] if n else 0
        assert m['first'] == first and m['last'] == window['flushEnd']
        reuse.append(None if window['shot'] in request['shots'] else dict(
            file=remote_root + '/' + m['file'], sha256=m['sha256'], bytes=m['bytes'], first=m['first'], last=m['last'],
            originalReceiptSha256=sha(original_receipt_file)))
    job['jobId'] = 'fidelity-pilot-r2' if args.pilot else 'fidelity-r2-' + source_name
    job['treatment'] = dict(strategy='bypass-learned-image-cleaning', shots=request['shots'],
                            originalCandidateSha256=row['sha256'], originalReceiptSha256=sha(original_receipt_file),
                            reason='Independent native inspections and coherent source-color screen')
    job['settings']['cleaningBypassShots'] = request['shots']
    job['reuseSegments'] = reuse
    job['estimatedSeconds'] = request['estimatedSeconds']
    job['implementation'] = {f'worker/{name}': sha(SCRIPTS / name)
                             for name in ['cuda-fidelity-render.py', 'temporal-model.py', 'production_plan.py']}
    job_file = args.directory / (job['jobId'] + '.json')
    job_file.write_text(json.dumps(job, indent=2) + '\n')
    input_dir = Path(job['input']['file']).parent
    ssh('from pathlib import Path\n(Path.home()/' + repr(shared + '/' + str(input_dir)) + ').mkdir(parents=True,exist_ok=True)\n')
    upload(str(bundle / input_dir) + '/', str(input_dir) + '/')
    upload(job_file, 'jobs/' + job_file.name)
    print(json.dumps(dict(jobId=job['jobId'], identity=identity, shots=request['shots'],
                          reusedSegments=sum(m is not None for m in reuse), totalSegments=len(plan))), flush=True)
if not args.pilot:
    ssh('import json\nfrom pathlib import Path\np=Path.home()/' + repr(shared + '/state/fidelity-inputs-ready.json')
        + '\np.write_text(json.dumps(dict(status="ALL_FIDELITY_INPUTS_PUBLISHED",total=' + str(len(requests)) + '))+"\\n")\n')
