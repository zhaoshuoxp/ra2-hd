"""Verify a returned CUDA video and mux the original local BIK audio once."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('receipt', type=Path)
parser.add_argument('--job', type=Path, required=True)
parser.add_argument('--validation', type=Path, required=True)
parser.add_argument('--work', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


r = json.loads(args.receipt.read_text())
assert sha(args.job) == r['jobSha256'] and json.loads(args.job.read_text()) == r['job']
validation = json.loads(args.validation.read_text())
assert validation['status'] == 'PASS_CUDA_REFERENCE_CLOCK_NATIVE_AND_RESUME'
assert r['job']['implementation'] == validation['implementation']
assert r['status'] == 'VIDEO_RENDERED_AWAITING_MAC_AUDIO_AND_FULL_FILM_AUDIT' and not r['job']['probe']
assert r['sourceRgbEquality'] == 'PASS_MAC_CANONICAL_RGB_SHA256' and r['memory']['cudaAllocatedAfterRelease'] == 0
assert r['packetClock'] == 'PASS_EVERY_PRESENTATION_TIMESTAMP' and r['decode'] == 'PASS_COMPLETE_VIDEO'
work, output = args.work.resolve(), args.output.resolve()
work.mkdir(parents=True, exist_ok=True)
output.parent.mkdir(parents=True, exist_ok=True)
video = args.receipt.resolve().parent / 'video.mp4'
assert sha(video) == r['file']['sha256']
inventory = json.loads((ROOT / 'docs/hd-movies-inventory-20261109.json').read_text())
movie = next(row for row in inventory['movies'] if row['identity'] == r['identity'])
assert r['job']['original']['sha256'] == movie['original']['sha256']
assert r['frames'] == movie['original']['video']['frames'] and r['fps'] == 15 and r['job']['sourceStartFrame'] == 0
recipe = dict(sourceSha256=movie['original']['sha256'], checkpointSha256=r['job']['checkpointSha256'], detailGain=.5,
              cleanThreshold=255, window=40, overlap=10, startFrame=0, frames=r['frames'], ignoreCuts=False,
              backend='cuda-ieee-fp32', implementation=r['job']['implementation'],
              canonicalRgbSha256=r['job']['input']['decodedRgbSha256'], remoteJobSha256=r['jobSha256'])
if r['job']['sourceVideoInput']:
    recipe['sourceVideoInput'] = r['job']['sourceVideoInput']
if r['job'].get('treatment'):
    recipe['sourceFidelity'] = dict(**r['job']['treatment'],
        originalEncodedSegmentsReused=sum(item is not None for item in r['job']['reuseSegments']),
        sourceSensitiveSegments=sum(item is None for item in r['job']['reuseSegments']),
        cachedSegmentsAtStart=r['reusedSegments'], recomputedOnThisRun=r['recomputedSegments'])
    recipe['finalizerImplementationSha256'] = sha(Path(__file__))
recipe_sha = hashlib.sha256(json.dumps(recipe, sort_keys=True).encode()).hexdigest()
if (work / 'receipt.json').exists():
    old = json.loads((work / 'receipt.json').read_text())
    assert old['recipeSha256'] == recipe_sha and sha(output) == old['file']['sha256']
    print('REUSED_VERIFIED_MAC_FINALIZATION')
    raise SystemExit(0)
assert not output.exists(), 'Inspect an unreceipted final movie first'
index = json.loads((ROOT / '.artifacts/hd-movies/production/source-index.json').read_text())
member = next(row for row in index['sources'] if row['identity'] == r['identity'])
source = work / 'original-audio-temporary.bik'
if not source.exists():
    with (ROOT / member['archive']).open('rb') as stream:
        stream.seek(member['offset']); source.write_bytes(stream.read(member['bytes']))
assert sha(source) == member['sha256'] == movie['original']['sha256']
ffmpeg = subprocess.check_output([str(ROOT / '.local/tooling/campaign-media/bin/python'), '-c',
                                  'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], text=True).strip()
seconds = r['frames'] / 15
partial = output.with_suffix('.partial.mp4')
partial.unlink(missing_ok=True)
subprocess.run([ffmpeg, '-nostdin', '-n', '-v', 'error', '-i', str(video), '-i', str(source), '-map', '0:v:0', '-map', '1:a:0',
                '-c:v', 'copy', '-bsf:v', 'setts=pts=N/(15*TB):dts=N/(15*TB):duration=1/(15*TB)', '-c:a', 'aac', '-b:a', '192k',
                '-t', str(seconds), '-movflags', '+faststart', '-video_track_timescale', '15360', '-colorspace', 'smpte170m',
                '-color_primaries', 'smpte170m', '-color_trc', 'bt709', '-color_range', 'tv', str(partial)], check=True)
packets = subprocess.check_output([ffmpeg, '-v', 'error', '-i', str(partial), '-map', '0:v:0', '-c:v', 'copy', '-f', 'framehash', '-'], text=True)
tb = next(line.split(': ', 1)[1] for line in packets.splitlines() if line.startswith('#tb 0:'))
numerator, denominator = map(int, tb.split('/'))
rows = [line for line in packets.splitlines() if line and not line.startswith('#')]
assert len(rows) == r['frames'] and all(abs(int(row.split(',')[2]) * numerator / denominator - n / 15) < .0001 for n, row in enumerate(rows))
decoded = subprocess.check_output([ffmpeg, '-v', 'error', '-xerror', '-i', str(partial), '-map', '0:v:0', '-map', '0:a:0',
                                   '-f', 'null', '-', '-progress', 'pipe:1', '-nostats'], text=True)
assert int([line.split('=', 1)[1] for line in decoded.splitlines() if line.startswith('frame=')][-1]) == r['frames']


def signal(file):
    data = subprocess.check_output([ffmpeg, '-v', 'error', '-i', str(file), '-map', '0:a:0', '-t', str(seconds),
                                    '-ac', '1', '-ar', '8000', '-c:a', 'pcm_f32le', '-f', 'f32le', '-'])
    return np.frombuffer(data, dtype=np.float32)


def pcm(file):
    return subprocess.check_output([ffmpeg, '-v', 'error', '-i', str(file), '-map', '0:a:0', '-af', f'atrim=end={seconds}',
                                    '-c:a', 'pcm_s16le', '-f', 'hash', '-hash', 'sha256', '-'], text=True).strip().split('=', 1)[1]


a, b = signal(source), signal(partial)
count = min(len(a), len(b))
assert abs(len(a) - len(b)) <= 16
ncc = float(np.dot(a[:count], b[:count]) / math.sqrt(float(np.dot(a[:count], a[:count])) * float(np.dot(b[:count], b[:count])))) if np.any(a) and np.any(b) else None
assert ncc is None or ncc > .98
partial.replace(output)
receipt = dict(schema='hd-movie-production-receipt-v1', identity=r['identity'], recipeSha256=recipe_sha, recipe=recipe,
               status='PRODUCED_AWAITING_FULL_FILM_AUDIT', original=movie['original'],
               file=dict(path=output.name, bytes=output.stat().st_size, sha256=sha(output)),
               video=dict(codec='h264', width=r['width'], height=r['height'], frames=r['frames'], fpsNumerator=15, fpsDenominator=1, durationSeconds=seconds),
               audio=dict(strategy='original-transcode', language='en', sourcePcmSha256=pcm(source), decodedPcmSha256=pcm(output),
                          mono8kZeroOffsetCorrelation=ncc, normalization='Original local BIK audio encoded once on the Mac; no server audio or speed change'),
               subtitles=movie['subtitles'], cuts=r['job']['cuts'], memory=r['memory'], windows=len(r['job']['plan']),
               loading=r['loading'], decode='PASS_ALL_VIDEO_AND_AUDIO', packetClock='PASS_EVERY_PRESENTATION_TIMESTAMP',
               visualAcceptance='REPRESENTATIVE_SETTINGS_ACCEPTED_FULL_FILM_AUDIT_PENDING',
               remoteExecution=dict(host=r['host'], gpu=r['gpu'], torch=r['torch'], cuda=r['cuda'], videoSha256=r['file']['sha256']),
               timeline=[dict(original=0, media=0), dict(original=seconds, media=seconds)])
(work / 'plan.json').write_text(json.dumps(dict(recipeSha256=recipe_sha, windows=r['job']['plan']), indent=2) + '\n')
(work / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
source.unlink()
print(json.dumps(dict(identity=r['identity'], status=receipt['status'], bytes=receipt['file']['bytes'])))
