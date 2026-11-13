"""Screen coherent color-region changes separately from source compression and thin sampling noise."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import subprocess
import numpy as np
from production_source import video_input

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--directory', type=Path, required=True)
parser.add_argument('--workers', type=int, default=4)
parser.add_argument('--ledger', type=Path)
args = parser.parse_args()
args.directory.mkdir(parents=True, exist_ok=True)
base = ROOT / '.artifacts/hd-movies/production'
ledger = json.loads((args.ledger or base / 'ledger.json').read_text())
inventory = {r['identity']: r for r in json.loads((ROOT / 'docs/hd-movies-inventory-20261109.json').read_text())['movies']}
members = {r['identity']: r for r in json.loads((base / 'source-index.json').read_text())['sources']}
ffmpeg = subprocess.check_output([str(ROOT / '.local/tooling/campaign-media/bin/python'), '-c',
    'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], text=True).strip()


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def scan(row):
    work = args.directory / row['identity'].replace(':', '-')
    work.mkdir(exist_ok=True)
    output = work / 'scan.json'
    if output.exists():
        prior = json.loads(output.read_text())
        assert prior['candidateSha256'] == row['sha256'] and prior['implementationSha256'] == sha(Path(__file__))
        return prior
    movie, member = inventory[row['identity']], members[row['identity']]
    receipt = json.loads((ROOT / row['receipt']).read_text())
    original = work / 'source-temporary.bik'
    assert not original.exists()
    with (ROOT / member['archive']).open('rb') as stream:
        stream.seek(member['offset']); original.write_bytes(stream.read(member['bytes']))
    assert sha(original) == member['sha256']
    derived = receipt['recipe'].get('sourceVideoInput')
    source, provenance = video_input(ROOT, original, movie, ROOT / derived['receiptFile'] if derived else None)
    assert provenance == derived
    original_width, original_height = movie['original']['video']['width'], movie['original']['video']['height']
    width = max(70, original_width // 4)
    height = round(width * original_height / original_width)
    threshold = 4
    children, logs = [], []
    rows, flagged = [], []
    try:
        for kind, file in [('original', source), ('candidate', ROOT / row['file'])]:
            log = (work / (kind + '-decode.log')).open('ab'); logs.append(log)
            children.append(subprocess.Popen([ffmpeg, '-nostdin', '-v', 'error', '-xerror', '-threads', '2',
                '-i', str(file), '-an', '-vf', f'scale={width}:{height}:flags=area', '-fps_mode', 'passthrough',
                '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], stdout=subprocess.PIPE, stderr=log))
        for frame in range(row['frames']):
            data = [p.stdout.read(width * height * 3) for p in children]
            assert all(len(v) == width * height * 3 for v in data)
            a, b = [np.frombuffer(v, dtype=np.uint8).astype(np.float32).reshape(-1, 3) / 255 for v in data]
            high, low = a.max(1), a.min(1)
            saturation = (high - low) / (high + .001)
            error = np.max(np.abs(b - a), 1)
            protected = (saturation > .5) & (high > .15)
            chroma_a = a / (a.sum(1, keepdims=True) + .01)
            chroma_b = b / (b.sum(1, keepdims=True) + .01)
            hue_error = np.max(np.abs(chroma_a - chroma_b), 1)
            mask = (protected & (error > .09) & (hue_error > .22)).reshape(height, width)
            interior = np.ones((height - 2, width - 2), dtype=bool)
            for dy in range(3):
                for dx in range(3):
                    interior &= mask[dy:dy + height - 2, dx:dx + width - 2]
            count = int(np.count_nonzero(interior))
            item = dict(frame=frame, coherentColorPixels=count, sourceSaturatedPixels=int(np.count_nonzero(protected)))
            rows.append(item)
            if count >= threshold:
                flagged.append(item)
        assert all(not p.stdout.read(1) and p.wait() == 0 for p in children)
    finally:
        for p in children:
            p.stdout.close()
            if p.poll() is None:
                p.kill(); p.wait()
        for log in logs:
            log.close()
        original.unlink()
    plan = json.loads((ROOT / row['receipt']).parent.joinpath('plan.json').read_text())['windows']
    bad_frames = {r['frame'] for r in flagged}
    shots = sorted({w['shot'] for w in plan if any(n in bad_frames for n in range(w['start'], w['flushEnd']))})
    record = dict(schema='hd-movie-coherent-color-screen-v3', identity=row['identity'],
        candidateSha256=row['sha256'], originalSha256=movie['original']['sha256'], implementationSha256=sha(Path(__file__)),
        status='REVIEW_SATURATED_SOURCE_CHANGES' if flagged else 'PASS_COLOR_FIDELITY_SCREEN', frames=row['frames'],
        sourceDimensions=[original_width, original_height], analysisDimensions=[width, height], protectedPixelThreshold=threshold,
        rule='Area-filtered source saturation>0.5,value>0.15,channel deviation>0.09,chromaticity deviation>0.22; require four 3x3-mask interiors. Excludes isolated sampling noise; screening followed by native inspection.',
        flaggedFrames=flagged, affectedShots=shots, worstFrames=sorted(rows, key=lambda r: -r['coherentColorPixels'])[:5],
        scope='Every decoded source-clock frame; identifies conservative cleaning-bypass candidates, never establishes user acceptance.')
    (work / 'frame-metrics.json').write_text(json.dumps(rows, separators=(',', ':')) + '\n')
    output.write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps(dict(identity=row['identity'], flaggedFrames=len(flagged), affectedShots=shots)), flush=True)
    return record


with ThreadPoolExecutor(max_workers=args.workers) as pool:
    entries = list(pool.map(scan, ledger['completed']))
(args.directory / 'summary.json').write_text(json.dumps(dict(schema='hd-movie-coherent-color-library-screen-v3',
    entries=entries, frames=sum(r['frames'] for r in entries)), indent=2) + '\n')
