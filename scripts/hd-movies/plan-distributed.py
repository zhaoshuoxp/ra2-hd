"""Balance remaining whole movies across the Mac and five measured CUDA lanes."""
import argparse
import hashlib
import json
from pathlib import Path
import time

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--directory', type=Path, required=True)
parser.add_argument('--adopted-pid', type=int, help='Verified PID of the existing Mac film worker')
args = parser.parse_args()
base = ROOT / '.artifacts/hd-movies/production'
ledger = json.loads((base / 'ledger.json').read_text())
validation_file = args.directory / 'validation.json'
validation = json.loads(validation_file.read_text())
assert validation['status'] == 'PASS_CUDA_REFERENCE_CLOCK_NATIVE_AND_RESUME'
inventory = json.loads((ROOT / 'docs/hd-movies-inventory-20261109.json').read_text())
qualified = {r['identity']: r for r in json.loads((base / 'source-qualification.json').read_text())['entries']}
done = {row['identity'] for row in ledger['completed']}
active = ledger['current']
assert not active or args.adopted_pid, 'Record the existing film worker before replacing its dispatcher'
active_movie = next(row for row in inventory['movies'] if row['identity'] == active['identity']) if active else None
progress_file = ROOT / active['progress'] if active else None
progress = json.loads(progress_file.read_text()) if progress_file and progress_file.exists() else {}
rates = {'local': {640: 2.36, 800: 4.576}, 'loki': {640: .917, 800: 1.409}, 'freya': {640: .854, 800: 1.338}}
lanes = [dict(host='local', gpu=None, seconds=0., jobs=0)]
lanes += [dict(host=host, gpu=gpu, seconds=0., jobs=0) for host, count in [('loki', 3), ('freya', 2)] for gpu in range(count)]
if active:
    v = active_movie['original']['video']
    remaining = v['frames'] - progress.get('completedFrames', 0)
    lanes[0]['seconds'] = remaining * 1.35 * rates['local'][v['width']] + 30
remaining = [m for m in inventory['movies'] if m['identity'] not in done and (not active or m['identity'] != active['identity'])]
assert all(m['original']['video']['width'] in (640, 800) for m in remaining), 'Radar CUDA admission is not validated'
remaining.sort(key=lambda m: -(m['original']['video']['frames'] * rates['loki'][m['original']['video']['width']]))
jobs = []
for movie in remaining:
    identity, v = movie['identity'], movie['original']['video']
    assert qualified[identity]['status'] == 'SOURCE_INPUT_REVIEWED_FOR_PIXEL_PRODUCTION'
    context = v['frames'] * 1.35 + 20
    costs = [context * rates[lane['host']][v['width']] + .05 * v['frames'] + 15 for lane in lanes]
    index = min(range(len(lanes)), key=lambda n: lanes[n]['seconds'] + costs[n])
    lane = lanes[index]
    jobs.append(dict(identity=identity, jobId=identity.replace(':', '-') + '-cuda-r1', host=lane['host'], gpu=lane['gpu'],
                     slotSequence=lane['jobs'], width=v['width'], frames=v['frames'], estimatedSeconds=round(costs[index], 1),
                     estimatedFinishSeconds=round(lane['seconds'] + costs[index], 1)))
    lane['seconds'] += costs[index]
    lane['jobs'] += 1
plan = dict(schema='hd-movie-distributed-plan-v1', createdUtc=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            sharedWorkspace='baldar/ra2-hd-movies-20261110-cuda-r1', validationSha256=hashlib.sha256(validation_file.read_bytes()).hexdigest(),
            implementation=validation['implementation'], baselineCompleted=ledger['completed'], oldDispatcherPid=ledger['pid'],
            adopted=active, adoptedPid=args.adopted_pid, adoptedProgress=progress, lanes=lanes, jobs=jobs, ratesSecondsPerContextFrame=rates,
            estimate='Measured 40-frame inference rates; source context estimated at 1.35x plus 20 frames. Transfer, audits and packaging are additional. Whole movies remain on one device.',
            expectedComputeSeconds=max(lane['seconds'] for lane in lanes))
file = args.directory / 'dispatch-plan.json'
file.write_text(json.dumps(plan, indent=2) + '\n')
print(json.dumps(dict(remaining=len(jobs), adopted=active, lanes=lanes, file=str(file))))
