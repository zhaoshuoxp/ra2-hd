"""Finalize a reviewed lower-gain local movie with fresh original BIK audio."""
import argparse
import copy
import hashlib
import json
import math
from pathlib import Path
import subprocess
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--variant', type=Path, required=True)
parser.add_argument('--previous-receipt', type=Path, required=True)
parser.add_argument('--approval', type=Path, required=True)
parser.add_argument('--directory', type=Path, required=True)
args = parser.parse_args()
directory = args.directory.resolve(); directory.mkdir(parents=True, exist_ok=True)
variant, previous, approval = [json.loads(p.read_text()) for p in [args.variant, args.previous_receipt, args.approval]]
execution = json.loads((args.variant.parent.parent / 'summary.json').read_text())
assert execution['identity'] == variant['identity'] and execution['allocatedAfterRelease'] == 0
assert approval['status'] == 'PASS_SOURCE_FIDELITY_DETAIL_CALIBRATION'
assert approval['candidateSha256'] == variant['candidateSha256'] and approval['detailGain'] == variant['detailGain']
assert previous['identity'] == variant['identity'] and previous['original']['sha256'] == variant['originalSha256']
assert previous['video']['frames'] == variant['video']['frames'] and 0 < variant['detailGain'] < .5
video = ROOT / variant['video']['file']


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


assert sha(video) == variant['candidateSha256']
member = next(r for r in json.loads((ROOT / '.artifacts/hd-movies/production/source-index.json').read_text())['sources']
              if r['identity'] == variant['identity'])
raw = directory / 'source-audio-temporary.bik'
with (ROOT / member['archive']).open('rb') as stream:
    stream.seek(member['offset']); raw.write_bytes(stream.read(member['bytes']))
assert sha(raw) == member['sha256'] == variant['originalSha256']
ffmpeg = subprocess.check_output([str(ROOT / '.local/tooling/campaign-media/bin/python'), '-c',
    'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], text=True).strip()
output = directory / (variant['identity'].replace(':', '-') + '.mp4')
assert not output.exists()
seconds = variant['video']['frames'] / 15
try:
    subprocess.run([ffmpeg, '-nostdin', '-n', '-v', 'error', '-i', str(video), '-i', str(raw), '-map', '0:v:0', '-map', '1:a:0',
        '-c:v', 'copy', '-bsf:v', 'setts=pts=N/(15*TB):dts=N/(15*TB):duration=1/(15*TB)', '-c:a', 'aac', '-b:a', '192k',
        '-t', str(seconds), '-movflags', '+faststart', '-video_track_timescale', '15360', '-colorspace', 'smpte170m',
        '-color_primaries', 'smpte170m', '-color_trc', 'bt709', '-color_range', 'tv', str(output)], check=True)
    signals, hashes = [], []
    for file in [raw, output]:
        prefix = [ffmpeg, '-v', 'error', '-i', str(file), '-map', '0:a:0']
        hashes.append(subprocess.check_output([*prefix, '-af', f'atrim=end={seconds}', '-c:a', 'pcm_s16le',
            '-f', 'hash', '-hash', 'sha256', '-'], text=True).strip().split('=', 1)[1])
        signals.append(np.frombuffer(subprocess.check_output([*prefix, '-t', str(seconds), '-ac', '1', '-ar', '8000',
            '-c:a', 'pcm_f32le', '-f', 'f32le', '-']), dtype=np.float32))
    a, b = signals; n = min(len(a), len(b)); assert abs(len(a) - len(b)) <= 16
    correlation = float(np.dot(a[:n], b[:n]) / math.sqrt(float(np.dot(a[:n], a[:n])) * float(np.dot(b[:n], b[:n]))))
    assert correlation > .98 and hashes[0] == previous['audio']['sourcePcmSha256']
    decoded = subprocess.check_output([ffmpeg, '-nostdin', '-v', 'error', '-xerror', '-i', str(output),
        '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-', '-progress', 'pipe:1', '-nostats'], text=True)
    assert int([s.split('=', 1)[1] for s in decoded.splitlines() if s.startswith('frame=')][-1]) == variant['video']['frames']
    clock = subprocess.check_output([ffmpeg, '-v', 'error', '-i', str(output), '-map', '0:v:0', '-c:v', 'copy', '-f', 'framehash', '-'], text=True)
    num, den = map(int, next(s.split(': ', 1)[1] for s in clock.splitlines() if s.startswith('#tb 0:')).split('/'))
    packets = [s.split(',') for s in clock.splitlines() if s and not s.startswith('#')]
    assert len(packets) == variant['video']['frames'] and all(abs(int(p[2]) * num / den - i / 15) < .0001 for i, p in enumerate(packets))
finally:
    raw.unlink()
receipt = copy.deepcopy(previous)
receipt['file'] = dict(path=output.name, bytes=output.stat().st_size, sha256=sha(output))
recipe = receipt['recipe'] = dict(sourceSha256=variant['originalSha256'], checkpointSha256=variant['checkpointSha256'],
    detailGain=variant['detailGain'], cleanThreshold=255, window=40, overlap=10, startFrame=0, frames=variant['video']['frames'],
    ignoreCuts=False, backend='mps-source-fidelity-calibration', implementation=dict(calibration=variant['implementationSha256'],
        model=variant['modelImplementationSha256'], finalizer=sha(Path(__file__))),
    sourceFidelity=dict(strategy='bypass-learned-image-cleaning-and-reduce-detail',
        reason='Source-matched review found structured facial grain after bypass; lower gain reduces introduced texture',
        detailGain=variant['detailGain'], acceptedMaximumDetailGain=.5, calibrationReceiptSha256=sha(args.variant),
        engineeringApprovalSha256=sha(args.approval), originalCandidateSha256=previous['file']['sha256']))
if previous['recipe'].get('sourceVideoInput'):
    recipe['sourceVideoInput'] = previous['recipe']['sourceVideoInput']
receipt['recipeSha256'] = hashlib.sha256(json.dumps(recipe, sort_keys=True).encode()).hexdigest()
receipt['audio'].update(sourcePcmSha256=hashes[0], decodedPcmSha256=hashes[1], mono8kZeroOffsetCorrelation=correlation,
    normalization='Original local BIK audio encoded once; source sample rate/channels and source clock preserved')
receipt['loading'] = variant['modelLoading']
receipt.pop('remoteExecution', None)
receipt['memory'] = dict(backend='mps', allocatedAfterRelease=execution['allocatedAfterRelease'],
    qualification='Complete short-film inference release; physical8/16GiB machines not tested')
(directory / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
(directory / 'plan.json').write_text(json.dumps(dict(recipeSha256=receipt['recipeSha256'], windows=variant['contextPlan']), indent=2) + '\n')
print(json.dumps(dict(status='LOWER_GAIN_ORIGINAL_AUDIO_CANDIDATE_READY', identity=receipt['identity'],
    sha256=receipt['file']['sha256'], mono8kZeroOffsetCorrelation=correlation)))
