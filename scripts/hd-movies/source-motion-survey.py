"""Prepare original full-screen shot checkpoints for selective source-motion treatment."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import numpy as np
from source_contacts import make_contacts
from production_source import video_input

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('identity')
parser.add_argument('--source-index', type=Path, required=True)
parser.add_argument('--directory', type=Path, required=True)
parser.add_argument('--video-source-receipt', type=Path)
args = parser.parse_args()
directory = args.directory.resolve()
directory.mkdir(parents=True, exist_ok=True)
inventory = json.loads((ROOT / 'docs/hd-movies-inventory-20261109.json').read_text())
movie = next(row for row in inventory['movies'] if row['identity'] == args.identity)
index = json.loads(args.source_index.read_text())
member = next(row for row in index['sources'] if row['identity'] == args.identity)
frames = movie['original']['video']['frames']
width, height = movie['original']['video']['width'], movie['original']['video']['height']
assert movie['original']['video']['width'] > 140, 'This survey is for full-screen source treatment'

def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

record_file = directory / 'survey.json'
if record_file.exists():
    record = json.loads(record_file.read_text())
    assert record['schema'] == 'hd-movie-original-motion-survey-v2' and record['originalSha256'] == member['sha256']
    if args.video_source_receipt:
        assert record['referenceInput']['receiptSha256'] == sha(args.video_source_receipt)
    else:
        assert not record.get('referenceInput')
    for point in record['checkpoints']:
        assert sha(directory / point['file']) == point['sha256']
    make_contacts(record_file)
    print(json.dumps(dict(identity=args.identity, status='REUSED_VERIFIED_SOURCE_SURVEY')))
    raise SystemExit(0)
source = directory / 'source-temporary.bik'
assert not source.exists(), 'Inspect an interrupted source survey first'
with (ROOT / member['archive']).open('rb') as stream, source.open('xb') as destination:
    stream.seek(member['offset']); remaining = member['bytes']
    while remaining:
        chunk = stream.read(min(4 * 1024 * 1024, remaining))
        assert chunk
        destination.write(chunk); remaining -= len(chunk)
assert sha(source) == member['sha256']
reference, reference_record = video_input(ROOT, source, movie, args.video_source_receipt)
ffmpeg = subprocess.check_output([str(ROOT / '.local/tooling/campaign-media/bin/python'), '-c',
                                  'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], text=True).strip()
cuts, previous, previous_histogram, previous_difference = [], None, None, 0.
previous_native, comb_scores = None, []
try:
    with (directory / 'analysis.log').open('w') as log:
        child = subprocess.Popen([ffmpeg, '-nostdin', '-v', 'error', '-threads', '2', '-i', str(reference), '-map', '0:v:0', '-an',
                                  '-vf', 'idet,metadata=print:key=lavfi.idet.single.current_frame:file=idet.txt',
                                  '-fps_mode', 'passthrough', '-pix_fmt', 'gray', '-f', 'rawvideo', 'pipe:1'],
                                 cwd=directory, stdout=subprocess.PIPE, stderr=log)
        try:
            for frame in range(frames):
                data = child.stdout.read(width * height)
                assert len(data) == width * height, 'Source survey ended early'
                native = np.frombuffer(data, dtype=np.uint8).reshape(height, width).astype(np.int16)
                current = native[::8, ::8].astype(np.float32)
                histogram = np.bincount((current.astype(np.uint8) // 16).ravel(), minlength=16) / current.size
                score = 0.
                if previous_native is not None:
                    upper = native[1:-1] - native[:-2]
                    lower = native[1:-1] - native[2:]
                    extrema = ((upper > 12) & (lower > 12)) | ((upper < -12) & (lower < -12))
                    mask = extrema & (np.abs(native[:-2] - native[2:]) < 8) & (np.abs(native[1:-1] - previous_native[1:-1]) > 8)
                    integral = np.pad(mask, ((1, 0), (1, 0))).cumsum(axis=0, dtype=np.int32).cumsum(axis=1, dtype=np.int32)
                    blocks = integral[32::8, 32::8] - integral[:-32:8, 32::8] - integral[32::8, :-32:8] + integral[:-32:8, :-32:8]
                    score = float(blocks.max() / 1024)
                comb_scores.append(score)
                previous_native = native
                if previous is not None:
                    difference = float(np.abs(current - previous).mean() / 255)
                    distance = float(np.abs(histogram - previous_histogram).sum() / 2)
                    if difference > .18 or difference > .055 and difference - previous_difference > .04 or difference > .08 and distance > .25:
                        cuts.append(frame)
                    previous_difference = difference
                previous, previous_histogram = current, histogram
            assert not child.stdout.read(1) and child.wait() == 0
        finally:
            child.stdout.close()
            if child.poll() is None:
                child.kill(); child.wait()
    metadata = (directory / 'idet.txt').read_text()
    types = re.findall(r'^lavfi\.idet\.single\.current_frame=(\w+)$', metadata, re.M)
    assert len(types) == frames, 'Field-analysis clock differs'
    shots, points = [], set()
    boundaries = [0, *cuts, frames]
    for number, (first, last) in enumerate(zip(boundaries, boundaries[1:])):
        midpoint = (first + last - 1) // 2
        field_points = [frame for frame in range(first, last) if types[frame] in ['tff', 'bff']]
        worst = max(range(first, last), key=lambda frame: comb_scores[frame])
        chosen = sorted({first, midpoint, last - 1, worst,
                         *([min(field_points, key=lambda frame: abs(frame - midpoint))] if field_points else [])})
        points.update(chosen)
        shots.append(dict(number=number, first=first, lastExclusive=last, seconds=[first / 15, last / 15],
                          singleFrameTypes={kind: types[first:last].count(kind) for kind in ['tff', 'bff', 'progressive', 'undetermined']},
                          motionCombCandidate=dict(frame=worst, score=comb_scores[worst]),
                          checkpoints=chosen, contentClassification='PENDING', treatmentDecision='PENDING'))
    points = sorted(points)
    expression = '+'.join(f'eq(n,{frame})' for frame in points)
    subprocess.run([ffmpeg, '-nostdin', '-n', '-v', 'error', '-i', str(reference), '-map', '0:v:0',
                    '-vf', f"select='{expression}'", '-fps_mode', 'vfr', str(directory / 'original-%04d.png')], check=True)
    checkpoints = [dict(frame=frame, seconds=frame / 15, file=f'original-{number:04}.png',
                        sha256=sha(directory / f'original-{number:04}.png')) for number, frame in enumerate(points, 1)]
    record = dict(schema='hd-movie-original-motion-survey-v2', identity=args.identity, originalSha256=member['sha256'], frames=frames,
                  fps=15, status='AWAITING_SHOT_CONTENT_AND_SOURCE_TREATMENT_REVIEW', shots=shots, checkpoints=checkpoints,
                  referenceInput=reference_record,
                  qualification='Cut, field and moving local vertical-extremum scores are lookup aids, not treatment decisions. Source-motion treatment requires reviewed frame intervals and fixed parity; progressive CGI remains untreated by default.')
    record_file.write_text(json.dumps(record, indent=2) + '\n')
finally:
    source.unlink()
make_contacts(record_file)
print(json.dumps(dict(identity=args.identity, shots=len(shots), checkpoints=len(checkpoints), directory=str(directory), status=record['status'])))
