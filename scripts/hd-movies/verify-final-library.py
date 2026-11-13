"""Fresh complete-library integrity, frame-clock and original-audio verification."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
import math
from pathlib import Path
import subprocess
import time
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--ledger', type=Path, required=True)
parser.add_argument('--directory', type=Path, required=True)
parser.add_argument('--workers', type=int, default=4)
args = parser.parse_args()
args.directory.mkdir(parents=True, exist_ok=True)
ledger = json.loads(args.ledger.read_text())
inventory = {m['identity']: m for m in json.loads((ROOT / 'docs/hd-movies-inventory-20261109.json').read_text())['movies']}
members = {m['identity']: m for m in json.loads((ROOT / '.artifacts/hd-movies/production/source-index.json').read_text())['sources']}
assert len(ledger['completed']) == 136 and {r['identity'] for r in ledger['completed']} == set(inventory)
ffmpeg = subprocess.check_output([str(ROOT / '.local/tooling/campaign-media/bin/python'), '-c',
    'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], text=True).strip()


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def save(file, value):
    temporary = file.with_suffix(file.suffix + '.writing')
    temporary.write_text(json.dumps(value, indent=2) + '\n'); temporary.replace(file)


implementation = sha(Path(__file__))


def check(row):
    identity = row['identity']; movie, member = inventory[identity], members[identity]
    file, receipt_file = ROOT / row['file'], ROOT / row['receipt']
    assert file.stat().st_size == row['bytes'] and sha(file) == row['sha256']
    receipt = json.loads(receipt_file.read_text())
    assert receipt['file']['sha256'] == row['sha256']
    assert receipt['original']['sha256'] == member['sha256'] == movie['original']['sha256']
    assert receipt['recipe']['startFrame'] == 0 and 0 < receipt['recipe']['detailGain'] <= .5
    if receipt['recipe']['detailGain'] != .5:
        assert receipt['recipe']['sourceFidelity']['strategy'] == 'bypass-learned-image-cleaning-and-reduce-detail'
        assert receipt['recipe']['sourceFidelity']['engineeringApprovalSha256']
    count, seconds = movie['original']['video']['frames'], movie['original']['video']['frames'] / 15
    assert row['frames'] == count == receipt['video']['frames']
    scale = 4 if movie['original']['video']['width'] == 140 else 2
    assert [receipt['video'][k] for k in ['width', 'height']] == [movie['original']['video'][k] * scale for k in ['width', 'height']]
    result_file = args.directory / (identity.replace(':', '-') + '.json')
    if result_file.exists():
        prior = json.loads(result_file.read_text())
        assert prior['candidateSha256'] == row['sha256'] and prior['implementationSha256'] == implementation
        assert prior['productionReceiptSha256'] == sha(receipt_file)
        return prior
    raw = args.directory / (identity.replace(':', '-') + '-source-temporary.bik')
    assert not raw.exists(), 'Inspect an interrupted source extraction first'
    with (ROOT / member['archive']).open('rb') as stream:
        stream.seek(member['offset']); raw.write_bytes(stream.read(member['bytes']))
    assert sha(raw) == member['sha256']
    try:
        decoded = subprocess.check_output([ffmpeg, '-nostdin', '-v', 'error', '-xerror', '-threads', '2', '-i', str(file),
            '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-', '-progress', 'pipe:1', '-nostats'], text=True)
        assert int([line.split('=', 1)[1] for line in decoded.splitlines() if line.startswith('frame=')][-1]) == count
        clock = subprocess.check_output([ffmpeg, '-nostdin', '-v', 'error', '-i', str(file), '-map', '0:v:0',
            '-c:v', 'copy', '-f', 'framehash', '-'], text=True)
        numerator, denominator = map(int, next(line.split(': ', 1)[1] for line in clock.splitlines() if line.startswith('#tb 0:')).split('/'))
        packets = [line.split(',') for line in clock.splitlines() if line and not line.startswith('#')]
        assert len(packets) == count
        assert all(abs(int(p[2]) * numerator / denominator - n / 15) < .0001 for n, p in enumerate(packets))
        signals, pcm_hashes = [], []
        for original in [True, False]:
            media = raw if original else file
            prefix = [ffmpeg, '-nostdin', '-v', 'error', *(['-ss', '0'] if original and receipt['recipe'].get('backend') != 'cuda-ieee-fp32' else []), '-i', str(media), '-map', '0:a:0']
            pcm = subprocess.check_output([*prefix, '-af', f'atrim=end={seconds}', '-c:a', 'pcm_s16le', '-f', 'hash', '-hash', 'sha256', '-'], text=True).strip().split('=', 1)[1]
            assert pcm == receipt['audio']['sourcePcmSha256' if original else 'decodedPcmSha256']
            pcm_hashes.append(pcm)
            data = subprocess.check_output([*prefix, '-t', str(seconds), '-ac', '1', '-ar', '8000', '-c:a', 'pcm_f32le', '-f', 'f32le', '-'])
            signals.append(np.frombuffer(data, dtype=np.float32))
        a, b = signals; n = min(len(a), len(b)); assert abs(len(a) - len(b)) <= 16 and n > 0
        correlation = float(np.dot(a[:n], b[:n]) / math.sqrt(float(np.dot(a[:n], a[:n])) * float(np.dot(b[:n], b[:n])))) if np.any(a) and np.any(b) else None
        assert correlation is None or correlation > .98
    finally:
        raw.unlink()
    result = dict(identity=identity, status='PASS_COMPLETE_FILE_FRAME_CLOCK_AND_ORIGINAL_AUDIO',
        candidateSha256=row['sha256'], originalSha256=member['sha256'], frames=count, bytes=row['bytes'],
        sourcePcmSha256=pcm_hashes[0], decodedPcmSha256=pcm_hashes[1], mono8kZeroOffsetCorrelation=correlation,
        productionReceiptSha256=sha(receipt_file), implementationSha256=implementation,
        checkedUtc=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
    save(result_file, result); return result


results = []
with ThreadPoolExecutor(max_workers=args.workers) as pool:
    for future in as_completed([pool.submit(check, row) for row in ledger['completed']]):
        result = future.result(); results.append(result)
        print(json.dumps(dict(identity=result['identity'], complete=len(results), total=136)), flush=True)
baseline = json.loads((ROOT / '.artifacts/hd-movies/baseline.json').read_text())
protected = []
for group in ['preexistingWorkingFiles', 'resourceSelectionFiles']:
    for row in baseline[group]:
        file = ROOT / row['file']
        assert sha(file) == row['sha256'], 'Protected file changed: ' + row['file']
        protected.append(dict(file=row['file'], sha256=row['sha256']))
summary = dict(schema='hd-movie-final-library-verification-v1', status='PASS_ALL_136_FILES_AUDIO_AND_SOURCE_CLOCKS',
    entries=sorted(results, key=lambda r: r['identity']), counts=dict(ra2=80, yr=56, fullscreen=53, radar=83,
        frames=sum(r['frames'] for r in results), bytes=sum(r['bytes'] for r in results)),
    minimumAudioNcc=min(r['mono8kZeroOffsetCorrelation'] for r in results if r['mono8kZeroOffsetCorrelation'] is not None),
    protectedFilesAndSelectors=protected, ledgerSha256=sha(args.ledger), implementationSha256=implementation,
    scope='Fresh full audiovisual decode, every video presentation timestamp, both original/candidate PCM hashes and zero-offset audio correlation. Visual review and native story playback have separate receipts.')
save(args.directory / 'summary.json', summary)
print(json.dumps({k: summary[k] for k in ['status', 'counts', 'minimumAudioNcc']}))
