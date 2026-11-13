"""Run the approved local movie restoration sequentially with a durable progress ledger."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--directory', type=Path, required=True)
parser.add_argument('--revision', default='local-temporal-r1')
parser.add_argument('--radar-only', action='store_true')
parser.add_argument('--qualification', type=Path, help='Per-film source review and optional verified video input')
args = parser.parse_args()
assert args.revision.replace('-', '').isalnum() and args.revision.islower()
base = args.directory.resolve()
base.mkdir(parents=True, exist_ok=True)
lock = (base / 'batch.lock').open('a')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
validation = json.loads((base / 'long-sequence-validation.json').read_text())
assert validation['status'] == 'PASS_BOUNDED_CONTEXT_SEAMS_CLOCK_AUDIO_MEMORY_AND_RESUME'
assert (args.radar_only or args.qualification and 'qualified' in validation['allowedScopes']
        or 'all' in validation['allowedScopes']), 'Supply reviewed full-screen source qualifications'
for name, expected in validation['implementation'].items():
    assert hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest() == expected, 'Sequence validation is stale'
index = base / 'source-index.json'
inventory = json.loads((ROOT / 'docs/hd-movies-inventory-20261109.json').read_text())
movies = inventory['movies']
qualification = json.loads(args.qualification.read_text()) if args.qualification else None
qualified = {row['identity']: row for row in qualification['entries']} if qualification else {}
if qualification:
    assert qualification['schema'] == 'hd-movie-source-qualification-v1'
    assert qualification['inventorySha256'] == hashlib.sha256((ROOT / 'docs/hd-movies-inventory-20261109.json').read_bytes()).hexdigest()
    assert all(row['status'] == 'SOURCE_INPUT_REVIEWED_FOR_PIXEL_PRODUCTION' for row in qualified.values())
    movies = [movie for movie in movies if movie['identity'] in qualified]
if args.radar_only:
    movies = [movie for movie in movies if movie['original']['video']['width'] == 140]
def production_order(movie):
    return (movie['original']['video']['width'] != 140, -qualified.get(movie['identity'], {}).get('priority', 0),
            movie['original']['video']['frames'], movie['identity'])

movies = sorted(movies, key=production_order)
pack = ROOT / '.local/media/hd-movies' / args.revision
pack.mkdir(parents=True, exist_ok=True)
ledger = dict(schema='hd-movie-production-ledger-v1', status='RUNNING', revision=args.revision, pid=os.getpid(),
              scope='Pixel production and automatic integrity checks; per-film visual/cut/caption audits and formal selection remain separate.',
              startedUtc=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), total=len(movies), completed=[], current=None,
              totalSourceFrames=sum(movie['original']['video']['frames'] for movie in movies), selected=0, auditPreparationIssues=[], sourceBlockers=[])
ledger['qualification'] = str(args.qualification.resolve().relative_to(ROOT)) if args.qualification else None
ledger['unqualifiedIdentities'] = [row['identity'] for row in inventory['movies'] if qualification and row['identity'] not in qualified]
blocker_file = base / 'source-blockers.json'
blockers = {row['identity']: row for row in json.loads(blocker_file.read_text())['entries']} if blocker_file.exists() else {}

def save():
    temporary = base / 'ledger.json.writing'
    temporary.write_text(json.dumps(ledger, indent=2) + '\n')
    temporary.replace(base / 'ledger.json')

def admit_new_qualified_inputs():
    if not args.qualification:
        return
    incoming = json.loads(args.qualification.read_text())
    assert incoming['schema'] == qualification['schema'] and incoming['inventorySha256'] == qualification['inventorySha256']
    additions = {row['identity']: row for row in incoming['entries']}
    for identity, previous in qualified.items():
        assert identity in additions
        for key in ['originalSha256', 'videoSourceReceipt', 'workSuffix', 'status']:
            assert previous.get(key) == additions[identity].get(key), 'An admitted source changed during production'
    new = []
    for movie in inventory['movies']:
        if movie['identity'] in additions and movie['identity'] not in qualified:
            admission = additions[movie['identity']]
            assert admission['status'] == 'SOURCE_INPUT_REVIEWED_FOR_PIXEL_PRODUCTION'
            assert admission['originalSha256'] == movie['original']['sha256']
            if not args.radar_only or movie['original']['video']['width'] == 140:
                new.append(movie)
    movies.extend(sorted(new, key=lambda movie: (movie['original']['video']['width'] != 140,
                                                 movie['original']['video']['frames'], movie['identity'])))
    qualified.update(additions)
    finished = {row['identity'] for row in [*ledger['completed'], *ledger['sourceBlockers']]}
    movies[:] = [movie for movie in movies if movie['identity'] in finished] + sorted(
        [movie for movie in movies if movie['identity'] not in finished], key=production_order)
    ledger['total'] = len(movies)
    ledger['totalSourceFrames'] = sum(movie['original']['video']['frames'] for movie in movies)
    ledger['unqualifiedIdentities'] = [row['identity'] for row in inventory['movies'] if row['identity'] not in qualified]

try:
    for movie in movies:
        identity = movie['identity']
        admission = qualified.get(identity, {})
        if admission:
            assert admission['originalSha256'] == movie['original']['sha256']
        video_receipt = ROOT / admission['videoSourceReceipt'] if admission.get('videoSourceReceipt') else None
        if identity in blockers and not video_receipt:
            blocker = blockers[identity]
            assert blocker['sourceSha256'] == movie['original']['sha256']
            ledger['sourceBlockers'].append(blocker)
            save()
            print(json.dumps(dict(status='CONFIRMED_SOURCE_DECODE_BLOCKER', identity=identity)), flush=True)
            continue
        name = identity.replace(':', '-')
        suffix = admission.get('workSuffix', '')
        assert not suffix or suffix.startswith('-') and suffix[1:].replace('-', '').isalnum()
        work, output = base / 'films' / (name + suffix), pack / (name + '.mp4')
        ledger['current'] = dict(identity=identity, progress=str((work / 'progress.json').relative_to(ROOT)))
        save()
        command = [sys.executable, str(Path(__file__).with_name('production-film.py')), identity,
                   '--source-index', str(index), '--work', str(work), '--output', str(output)]
        if video_receipt:
            command.extend(['--video-source-receipt', str(video_receipt)])
        receipt_file = work / 'receipt.json'
        if receipt_file.exists():
            existing = json.loads(receipt_file.read_text())
            assert existing['recipe']['implementation'] in [validation['implementation'], *validation.get('previousImplementations', [])]
            assert existing['original']['sha256'] == movie['original']['sha256'] and existing['video']['frames'] == movie['original']['video']['frames']
            recipe = existing['recipe']
            assert recipe['detailGain'] == .5 and recipe['cleanThreshold'] == 255 and recipe['window'] == 40 and recipe['overlap'] == 10
            assert recipe['startFrame'] == 0 and recipe['frames'] == movie['original']['video']['frames'] and not recipe['ignoreCuts']
            derived = recipe.get('sourceVideoInput')
            assert bool(derived) == bool(video_receipt), 'Cached output uses another source treatment'
            if derived:
                assert derived['receiptSha256'] == hashlib.sha256(video_receipt.read_bytes()).hexdigest()
        else:
            with (base / (name + '.log')).open('a') as log:
                subprocess.run(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, check=True)
        receipt = json.loads((work / 'receipt.json').read_text())
        assert receipt['status'] == 'PRODUCED_AWAITING_FULL_FILM_AUDIT'
        with output.open('rb') as stream:
            assert hashlib.file_digest(stream, 'sha256').hexdigest() == receipt['file']['sha256']
        audit = [sys.executable, str(Path(__file__).with_name('production-audit.py')), str(work / 'receipt.json'),
                 '--source-index', str(index), '--directory', str(base / 'audits' / name), '--movie', str(output)]
        with (base / (name + '-audit.log')).open('a') as log:
            result = subprocess.run(audit, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
        if result.returncode:
            ledger['auditPreparationIssues'].append(dict(identity=identity, log=str((base / (name + '-audit.log')).relative_to(ROOT))))
        ledger['completed'].append(dict(identity=identity, file=str(output.relative_to(ROOT)), bytes=receipt['file']['bytes'],
                                        sha256=receipt['file']['sha256'], frames=receipt['video']['frames'], receipt=str((work / 'receipt.json').relative_to(ROOT))))
        admit_new_qualified_inputs()
        save()
        print(json.dumps(dict(status='MOVIE_PRODUCED_AUDIT_PENDING', identity=identity, completed=len(ledger['completed']), total=len(movies))), flush=True)
    ledger.update(status='QUALIFIED_PIXEL_PRODUCTION_COMPLETE_SOURCE_BLOCKERS_AND_AUDITS_PENDING' if ledger['sourceBlockers'] else 'PIXEL_PRODUCTION_COMPLETE_AUDITS_PENDING', current=None,
                  endedUtc=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
except BaseException as error:
    ledger.update(status='STOPPED_FOR_INVESTIGATION', error=str(error))
    raise
finally:
    save()
    fcntl.flock(lock, fcntl.LOCK_UN)
