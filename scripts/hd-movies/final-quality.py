"""Prepare bounded visual lookups and scan every delivered frame against its approved source."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import subprocess
import time
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from production_source import video_input

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--directory', type=Path, required=True)
parser.add_argument('--workers', type=int, default=4)
parser.add_argument('--contacts-only', action='store_true')
parser.add_argument('--ledger', type=Path, help='A complete final candidate ledger; defaults to original production')
parser.add_argument('--audit-root', type=Path, help='Prefer corrected matching audit inputs here')
parser.add_argument('--extra-points', type=Path, help='Native source-sensitive checkpoint frames per identity')
parser.add_argument('--identities', type=Path, help='Review only identities listed by a repair plan')
args = parser.parse_args()
directory = args.directory.resolve()
directory.mkdir(parents=True, exist_ok=True)
production = ROOT / '.artifacts/hd-movies/production'
ledger = json.loads((args.ledger or production / 'ledger.json').read_text())
assert ledger['status'] == 'PIXEL_PRODUCTION_COMPLETE_AUDITS_PENDING' and len(ledger['completed']) == 136
inventory = {r['identity']: r for r in json.loads((ROOT / 'docs/hd-movies-inventory-20261109.json').read_text())['movies']}
members = {r['identity']: r for r in json.loads((production / 'source-index.json').read_text())['sources']}
extra_points = {r['identity']: r['frames'] for r in json.loads(args.extra_points.read_text())['entries']} if args.extra_points else {}
identities = {r['identity'] for r in json.loads(args.identities.read_text())['entries']} if args.identities else None
ffmpeg = subprocess.check_output([str(ROOT / '.local/tooling/campaign-media/bin/python'), '-c',
                                  'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], text=True).strip()
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 24)
small = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 20)


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def save(file, value):
    temporary = file.with_suffix(file.suffix + '.writing')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.replace(file)


def prepare(row):
    identity = row['identity']
    movie = inventory[identity]
    work = directory / identity.replace(':', '-')
    work.mkdir(exist_ok=True)
    receipt = json.loads((ROOT / row['receipt']).read_text())
    audits = sorted((production / 'audits' / identity.replace(':', '-')).rglob('audit-input.json'))
    if args.audit_root:
        audits += sorted((args.audit_root / identity.replace(':', '-')).rglob('audit-input.json'))
    audit_file = next(p for p in reversed(audits) if json.loads(p.read_text())['candidateSha256'] == row['sha256'])
    audit = json.loads(audit_file.read_text())
    points = {p['frame']: p for p in audit['checkpoints']}
    frames = row['frames']
    selected = [0, frames // 4, frames // 2, frames * 3 // 4, frames - 1]
    if identity == 'ra2:s10_f00e':
        selected = [0, 271, 272, 311, 312, frames // 2, frames - 1]
    selected = sorted(set(selected))
    lookup = sorted({min(points, key=lambda available: abs(available - frame)) for frame in selected})
    selected = sorted(set(selected) | set(extra_points.get(identity, [])))
    assert all(0 <= point < frames for point in selected)
    # These are lookup images only. Native source and output PNGs are exported by the scan.
    sheet = Image.new('RGB', (640, 78 + len(lookup) * 276), '#111820')
    draw = ImageDraw.Draw(sheet)
    draw.text((10, 6), identity + ' | Original source / Natural restoration', font=font, fill='#edf2f7')
    draw.text((10, 39), 'Lookup only; inspect native PNGs for fine detail.', font=small, fill='#b9c8d6')
    for n, frame in enumerate(lookup):
        point = points[frame]
        for column, kind in enumerate(['original', 'candidate']):
            image = point['images'][kind]
            file = audit_file.parent / image['file']
            assert sha(file) == image['sha256']
            with Image.open(file) as opened:
                preview = opened.convert('RGB')
            preview.thumbnail((320, 240), Image.Resampling.LANCZOS)
            sheet.paste(preview, (column * 320, 78 + n * 276))
        draw.text((10, 78 + n * 276 + 242), f'Frame {frame} | {frame / 15:.3f} s', font=small, fill='#edf2f7')
    sheet.save(work / 'contact.jpg', quality=96, subsampling=0)
    context = dict(identity=identity, candidateSha256=row['sha256'], originalSha256=movie['original']['sha256'],
                   auditFile=str(audit_file.relative_to(ROOT)), selectedFrames=selected, lookupFrames=lookup,
                   originalVideo=movie['original']['video'], outputVideo=receipt['video'])
    save(work / 'context.json', context)
    return row, work, receipt, context


prepared = list(ThreadPoolExecutor(max_workers=args.workers).map(prepare,
    [r for r in ledger['completed'] if identities is None or r['identity'] in identities]))
save(directory / 'index.json', dict(schema='hd-movie-final-qa-index-v1',
                                  entries=[dict(directory=str(w.relative_to(ROOT)), **context)
                                           for r, w, _, context in prepared]))
print(json.dumps(dict(status='ALL_136_VISUAL_LOOKUPS_READY', directory=str(directory))), flush=True)
if args.contacts_only:
    raise SystemExit(0)


def scan(prepared):
    row, work, receipt, context = prepared
    movie, member = inventory[row['identity']], members[row['identity']]
    target = work / 'scan.json'
    if target.exists():
        old = json.loads(target.read_text())
        assert old['candidateSha256'] == row['sha256'] and old['implementationSha256'] == sha(Path(__file__))
        return old
    original = work / 'original-temporary.bik'
    assert not original.exists(), 'Inspect interrupted QA extraction first'
    with (ROOT / member['archive']).open('rb') as stream:
        stream.seek(member['offset']); original.write_bytes(stream.read(member['bytes']))
    assert sha(original) == movie['original']['sha256']
    derived = receipt['recipe'].get('sourceVideoInput')
    source, provenance = video_input(ROOT, original, movie, ROOT / derived['receiptFile'] if derived else None)
    assert provenance == derived
    candidate = ROOT / row['file']
    assert sha(candidate) == row['sha256']
    width, height = (140, 110) if movie['original']['video']['width'] == 140 else (160, 120)
    expression = '+'.join(f'eq(n,{n})' for n in context['selectedFrames'])
    graph = f"[0:v]split=2[a][b];[a]scale={width}:{height}:flags=area,format=rgb24[scan];[b]select='{expression}'[native]"
    children, logs = [], []
    try:
        for kind, file in [('original', source), ('candidate', candidate)]:
            log = (work / (kind + '-decode.log')).open('ab'); logs.append(log)
            children.append(subprocess.Popen([ffmpeg, '-nostdin', '-y', '-v', 'error', '-xerror', '-threads', '2',
                '-filter_complex_threads', '1', '-i', str(file), '-filter_complex', graph,
                '-map', '[native]', '-fps_mode', 'vfr', '-c:v', 'png', '-threads', '1', '-compression_level', '1',
                str(work / (kind + '-native-%02d.png')), '-map', '[scan]', '-fps_mode', 'passthrough',
                '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], stdout=subprocess.PIPE, stderr=log))
        metrics, previous, flagged = [], None, []
        started = time.perf_counter()
        for frame in range(row['frames']):
            data = [p.stdout.read(width * height * 3) for p in children]
            assert all(len(d) == width * height * 3 for d in data), (row['identity'], frame, 'Frame count differs')
            a, b = [np.frombuffer(d, dtype=np.uint8).astype(np.float32).reshape(-1, 3) / 255 for d in data]
            error = b - a
            mae = float(np.abs(error).mean())
            la, lb = a @ np.array([.299, .587, .114], dtype=np.float32), b @ np.array([.299, .587, .114], dtype=np.float32)
            aa, bb = la - la.mean(), lb - lb.mean()
            ncc = float(np.dot(aa, bb) / np.sqrt(np.dot(aa, aa) * np.dot(bb, bb))) if aa.std() > .025 and bb.std() > .025 else None
            change = float(np.abs(error - previous).mean()) if previous is not None else 0.
            values = dict(frame=frame, rgbMae=mae, lumaNcc=ncc, residualTemporalMae=change)
            if mae > .045 or ncc is not None and ncc < .90 or change > .04:
                flagged.append(values)
            metrics.append(values); previous = error
        assert all(not p.stdout.read(1) and p.wait() == 0 for p in children)
    finally:
        for p in children:
            p.stdout.close()
            if p.poll() is None:
                p.kill(); p.wait()
        for log in logs:
            log.close()
        original.unlink()
    record = dict(schema='hd-movie-all-frame-fidelity-scan-v1', identity=row['identity'], candidateSha256=row['sha256'],
                  originalSha256=movie['original']['sha256'], implementationSha256=sha(Path(__file__)),
                  status='REVIEW_FLAGGED_FRAMES' if flagged else 'PASS_COARSE_REFERENCE_FIDELITY_SCAN',
                  frames=len(metrics), decodedDimensions=[width, height], sourceVideoInput=provenance,
                  meanRgbMae=float(np.mean([r['rgbMae'] for r in metrics])), maxRgbMae=max(r['rgbMae'] for r in metrics),
                  minimumTexturedLumaNcc=min((r['lumaNcc'] for r in metrics if r['lumaNcc'] is not None), default=None),
                  maxResidualTemporalMae=max(r['residualTemporalMae'] for r in metrics), flaggedFrames=flagged,
                  nativeFrames=context['selectedFrames'], seconds=time.perf_counter() - started,
                  scope='Every delivered frame against the approved source clock at reduced resolution. Flags require visual review; this scan does not establish facial detail, dialogue comprehension or user acceptance.')
    save(work / 'frame-metrics.json', metrics)
    save(target, record)
    print(json.dumps(dict(identity=row['identity'], status=record['status'], flags=len(flagged))), flush=True)
    return record


with ThreadPoolExecutor(max_workers=args.workers) as pool:
    results = list(pool.map(scan, prepared))
save(directory / 'scan-summary.json', dict(schema='hd-movie-library-fidelity-scan-v1', entries=results,
                                         frames=sum(r['frames'] for r in results), total=len(results),
                                         flaggedFilms=[r['identity'] for r in results if r['flaggedFrames']]))
