"""Prepare a canonical lossless RGB movie input and a portable CUDA job on the Mac."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
from production_plan import windows
from production_source import video_input
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('identity')
parser.add_argument('--directory', type=Path, required=True)
parser.add_argument('--job-id', required=True)
parser.add_argument('--reference', type=Path, help='Use the exact original-source clip and plan of an existing MPS probe')
args = parser.parse_args()
directory = args.directory.resolve()
assert args.job_id.replace('-', '').replace('_', '').isalnum()
inventory = json.loads((ROOT / 'docs/hd-movies-inventory-20261109.json').read_text())
movie = next(row for row in inventory['movies'] if row['identity'] == args.identity)
index = json.loads((ROOT / '.artifacts/hd-movies/production/source-index.json').read_text())
member = next(row for row in index['sources'] if row['identity'] == args.identity)
q = json.loads((ROOT / '.artifacts/hd-movies/production/source-qualification.json').read_text())
entry = next(row for row in q['entries'] if row['identity'] == args.identity)
reference = json.loads(args.reference.read_text()) if args.reference else None
start = reference['recipe']['startFrame'] if reference else 0
frames = reference['video']['frames'] if reference else movie['original']['video']['frames']
video = movie['original']['video']
width, height = video['width'], video['height']
input_id = args.identity.replace(':', '-') + (f'-probe-{start}-{frames}' if reference else '')
work = directory / 'inputs' / input_id
work.mkdir(parents=True, exist_ok=True)
(directory / 'jobs').mkdir(parents=True, exist_ok=True)


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def save(file, value):
    temporary = file.with_suffix(file.suffix + '.writing')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.replace(file)


derived = reference['recipe'].get('sourceVideoInput') if reference else None
receipt_path = ROOT / derived['receiptFile'] if derived else (
    ROOT / entry['videoSourceReceipt'] if not reference and entry.get('videoSourceReceipt') else None)
expected_receipt_sha = sha(receipt_path) if receipt_path else None
if derived:
    assert expected_receipt_sha == derived['receiptSha256'], 'Referenced source provenance changed'
record_file = work / 'canonical.json'
if not record_file.exists():
    original = work / 'original-temporary.bik'
    assert not original.exists(), 'Inspect an interrupted extraction first'
    with (ROOT / member['archive']).open('rb') as stream, original.open('xb') as target:
        stream.seek(member['offset'])
        target.write(stream.read(member['bytes']))
    assert sha(original) == member['sha256'] == movie['original']['sha256']
    decode_source, input_record = video_input(ROOT, original, movie, receipt_path, probe=bool(reference))
    ffmpeg = subprocess.check_output([str(ROOT / '.local/tooling/campaign-media/bin/python'), '-c',
                                      'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], text=True).strip()
    canonical = work / 'source.mkv'
    assert not canonical.exists(), 'Inspect an unreceipted canonical source first'
    trim = f'trim=start_frame={start}:end_frame={start + frames},setpts=PTS-STARTPTS'
    if not reference and decode_source.suffix == '.mkv':
        os.link(decode_source, canonical)
    else:
        graph = trim + ',format=rgb24,format=bgr0,setparams=range=full:color_primaries=smpte170m:color_trc=bt709:colorspace=0'
        subprocess.run([ffmpeg, '-nostdin', '-n', '-v', 'error', '-i', str(decode_source), '-map', '0:v:0', '-an',
                        '-vf', graph, '-fps_mode', 'passthrough', '-c:v', 'ffv1', '-threads', '4', '-level', '3', '-g', '1',
                        '-pix_fmt', 'bgr0', '-colorspace', '0', '-color_range', 'pc', '-color_primaries', 'smpte170m',
                        '-color_trc', 'bt709', str(canonical)], check=True)

    def rgb_hash(file, graph=None):
        child = subprocess.Popen([ffmpeg, '-nostdin', '-v', 'error', '-xerror', '-i', str(file), '-map', '0:v:0', '-an',
                                  *(['-vf', graph] if graph else []), '-fps_mode', 'passthrough', '-pix_fmt', 'rgb24',
                                  '-f', 'rawvideo', 'pipe:1'], stdout=subprocess.PIPE)
        digest, count = hashlib.sha256(), 0
        try:
            while data := child.stdout.read(4 * 1024 * 1024):
                digest.update(data); count += len(data)
            assert child.wait() == 0 and count == frames * width * height * 3
        finally:
            child.stdout.close()
            if child.poll() is None:
                child.kill(); child.wait()
        return digest.hexdigest()

    digest = rgb_hash(canonical)
    assert digest == rgb_hash(decode_source, trim), 'Canonical normalization changed RGB pixels'
    if reference:
        plan = json.loads((args.reference.parent / 'plan.json').read_text())['windows']
        cuts = reference['cuts']
    else:
        candidates, previous, previous_hist = [], None, None
        child = subprocess.Popen([ffmpeg, '-nostdin', '-v', 'error', '-xerror', '-i', str(decode_source), '-an',
                                  '-vf', trim + ',scale=96:72:flags=area', '-fps_mode', 'passthrough',
                                  '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], stdout=subprocess.PIPE)
        try:
            for frame in range(frames):
                data = child.stdout.read(96 * 72 * 3)
                assert len(data) == 96 * 72 * 3
                current = np.frombuffer(data, dtype=np.uint8).reshape(72, 96, 3)
                histogram = np.bincount((current.mean(2).astype(np.uint8) // 16).ravel(), minlength=16) / (96 * 72)
                if previous is not None:
                    difference = float(np.abs(current.astype(np.float32) - previous).mean() / 255)
                    distance = float(np.abs(histogram - previous_hist).sum() / 2)
                    if difference > .18 or difference > .10 and distance > .35:
                        candidates.append(dict(frame=frame, rgbDifference=difference, histogramDistance=distance))
                previous, previous_hist = current.astype(np.float32), histogram
            assert not child.stdout.read(1) and child.wait() == 0
        finally:
            child.stdout.close()
            if child.poll() is None:
                child.kill(); child.wait()
        boundaries = [row['frame'] for row in candidates]
        if input_record:
            boundaries += [point for point in input_record['boundaries'] if 0 < point < frames]
        plan = windows(frames, sorted(set(boundaries)), 40, 10)
        cuts = dict(decodedFrames=frames, candidates=candidates, method='Same original-input RGB/histogram cut analysis as the MPS producer')
    record = dict(schema='hd-movie-canonical-cuda-source-v1', identity=args.identity, original=movie['original'],
                  sourceStartFrame=start, frames=frames, width=width, height=height, fps=15,
                  input=dict(file=str(canonical.relative_to(directory)), bytes=canonical.stat().st_size,
                             sha256=sha(canonical), decodedRgbSha256=digest),
                  sourceVideoInput=input_record, plan=plan, cuts=cuts, originalSubtitles=movie['subtitles'],
                  rgbEquality='PASS_EVERY_RGB_BYTE_AGAINST_APPROVED_LOCAL_DECODE',
                  referenceReceiptSha256=sha(args.reference) if reference else None)
    save(record_file, record)
    original.unlink()
record = json.loads(record_file.read_text())
assert record['identity'] == args.identity and record['original']['sha256'] == movie['original']['sha256']
assert [record[key] for key in ['sourceStartFrame', 'frames', 'width', 'height', 'fps']] == [start, frames, width, height, 15]
assert record['referenceReceiptSha256'] == (sha(args.reference) if reference else None)
assert (record['sourceVideoInput']['receiptSha256'] if record['sourceVideoInput'] else None) == expected_receipt_sha
assert sha(directory / record['input']['file']) == record['input']['sha256']
if 'frameRgbSha256' not in record['input']:
    ffmpeg = subprocess.check_output([str(ROOT / '.local/tooling/campaign-media/bin/python'), '-c',
                                      'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], text=True).strip()
    hashes = subprocess.check_output([ffmpeg, '-v', 'error', '-xerror', '-i', str(directory / record['input']['file']),
                                      '-an', '-pix_fmt', 'rgb24', '-f', 'framehash', '-hash', 'sha256', '-'], text=True)
    rows = [row for row in hashes.splitlines() if row and not row.startswith('#')]
    assert len(rows) == frames
    record['input']['frameRgbSha256'] = [row.split(',')[-1].strip() for row in rows]
    save(record_file, record)
worker_files = ['cuda-render.py', 'temporal-model.py', 'production_plan.py']
job = dict(schema='hd-movie-cuda-job-v1', jobId=args.job_id, identity=args.identity, original=record['original'],
           sourceStartFrame=start, input=record['input'], sourceVideoInput=record['sourceVideoInput'],
           video=dict(frames=frames, width=width, height=height), plan=record['plan'], cuts=record['cuts'],
           subtitles=record['originalSubtitles'], checkpointSha256='52f77c2c835aaa3fe675b3959b2f85010a6c6f63f77f7e279394646e55a4e376',
           settings=dict(detailGain=.5, cleanThreshold=255, window=40, overlap=10, fps=15, precision='ieee-fp32'),
           implementation={f'worker/{name}': sha(Path(__file__).with_name(name)) for name in worker_files},
           probe=bool(reference), canonicalReceipt=str(record_file.relative_to(directory)))
save(directory / 'jobs' / (args.job_id + '.json'), job)
print(json.dumps(dict(jobId=args.job_id, identity=args.identity, input=record['input']['file'], frames=frames,
                      sourceRgbSha256=record['input']['decodedRgbSha256'], windows=len(record['plan']))))
