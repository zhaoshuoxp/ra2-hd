"""Prepare exact-source cut/end/seam thumbnails and a playable per-film audit page."""
import argparse
import hashlib
import html
import json
import os
from pathlib import Path
import subprocess
from production_source import video_input

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('receipt', type=Path)
parser.add_argument('--source-index', type=Path, required=True)
parser.add_argument('--directory', type=Path, required=True)
parser.add_argument('--movie', type=Path, required=True)
args = parser.parse_args()
receipt = json.loads(args.receipt.read_text())
assert receipt['status'] == 'PRODUCED_AWAITING_FULL_FILM_AUDIT'
directory = args.directory.resolve()
directory.mkdir(parents=True, exist_ok=True)
movie = args.movie.resolve()

def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

assert sha(movie) == receipt['file']['sha256']
curation_file = ROOT / 'docs/hd-movies-source-motion-curation-20261110.json'
curation = next((row for row in json.loads(curation_file.read_text())['entries']
                 if row['identity'] == receipt['identity']), None) if curation_file.exists() else None
survey_sha = curation['surveySha256'] if curation else None
if curation:
    assert curation['originalSha256'] == receipt['original']['sha256']
    assert sha(ROOT / curation['surveyFile']) == survey_sha
    if (directory / 'audit-input.json').exists():
        prior = json.loads((directory / 'audit-input.json').read_text())
        if prior.get('sourceSurveySha256') != survey_sha:
            directory = directory / 'source-reviewed-r2'
            directory.mkdir(exist_ok=True)
if (directory / 'audit-input.json').exists():
    existing = json.loads((directory / 'audit-input.json').read_text())
    assert existing['candidateSha256'] == receipt['file']['sha256']
    for checkpoint in existing['checkpoints']:
        for image in checkpoint['images'].values():
            assert sha(directory / image['file']) == image['sha256']
    print(json.dumps(dict(identity=receipt['identity'], status='REUSED_VERIFIED_AUDIT_INPUTS')))
    raise SystemExit(0)
index = json.loads(args.source_index.read_text())
member = next(row for row in index['sources'] if row['identity'] == receipt['identity'])
source = directory / 'source-temporary.bik'
assert not source.exists(), 'Inspect an interrupted audit input first'
with (ROOT / member['archive']).open('rb') as stream, source.open('xb') as destination:
    stream.seek(member['offset']); remaining = member['bytes']
    while remaining:
        chunk = stream.read(min(4 * 1024 * 1024, remaining))
        assert chunk
        destination.write(chunk); remaining -= len(chunk)
assert sha(source) == member['sha256'] == receipt['original']['sha256']
derived = receipt['recipe'].get('sourceVideoInput')
reference, reference_record = video_input(ROOT, source, receipt, ROOT / derived['receiptFile'] if derived else None)
if derived:
    assert derived == reference_record, 'Source-reference provenance changed after production'
frames = receipt['video']['frames']
plan = json.loads((args.receipt.parent / 'plan.json').read_text())['windows']
seams = [window['flushEnd'] for window in plan[:-1] if window['rightOverlap']]
selected_seams = sorted({seams[index] for index in [0, len(seams) // 2, len(seams) - 1]}) if seams else []
extra = []
if curation:
    extra += [point for shot in curation['shots'] for point in [shot['first'], shot['lastExclusive'] - 1]]
if derived:
    proof = json.loads((ROOT / derived['receiptFile']).read_text())
    extra += derived['boundaries'] + [row['frame'] for row in proof.get('holds', [])]
    if proof['schema'] == 'hd-movie-raw-sector-recovery-v1':
        sector_proof = json.loads((ROOT / proof['proofFile']).read_text())
        assert sha(ROOT / proof['proofFile']) == proof['proofSha256']
        extra += sector_proof['videoPacketDifferences']
    if proof['schema'] == 'hd-movie-localized-source-recovery-v1':
        extra += [point for row in proof['patchedRanges']
                  for point in [row['first'], row['lastExclusive'] - 1, row['lastExclusive']]]
points = sorted({0, frames // 4, frames // 2, frames * 3 // 4, frames - 1,
                 *(point for cut in receipt['cuts']['candidates'] for point in [cut['frame'] - 1, cut['frame']]),
                 *(point for frame in extra for point in [frame - 1, frame, frame + 1, frame + 15] if 0 <= point < frames),
                 *(point for seam in selected_seams for point in [seam - 1, seam, seam + 1] if 0 <= point < frames)})
ffmpeg = subprocess.check_output([str(ROOT / '.local/tooling/campaign-media/bin/python'), '-c',
                                  'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], text=True).strip()
expression = '+'.join(f'eq(n,{point})' for point in points)
radar = receipt['video']['width'] == 560 and receipt['original']['video']['width'] == 140
width, height = (280, 220) if radar else (320, 240)
try:
    for kind, file in [('original', reference), ('candidate', movie)]:
        subprocess.run([ffmpeg, '-nostdin', '-n', '-v', 'error', '-i', str(file), '-map', '0:v:0',
                        '-vf', f"select='{expression}',scale={width}:{height}:flags=area", '-fps_mode', 'vfr',
                        str(directory / (kind + '-%04d.png'))], check=True)
finally:
    source.unlink()
rows = []
for number, frame in enumerate(points, 1):
    images = {kind: dict(file=f'{kind}-{number:04}.png', sha256=sha(directory / f'{kind}-{number:04}.png'))
              for kind in ['original', 'candidate']}
    rows.append(dict(frame=frame, seconds=frame / 15, images=images))
record = dict(schema='hd-movie-film-audit-input-v1', identity=receipt['identity'],
              status='AWAITING_VISUAL_CUT_DIALOGUE_CAPTION_AUDIT', candidateSha256=sha(movie), originalSha256=member['sha256'],
              automaticIntegrity=dict(decode=receipt['decode'], packetClock=receipt['packetClock'], audio=receipt['audio']),
              referenceInput=reference_record,
              sourceSurveySha256=survey_sha,
              sourceSurveyBoundaries=sorted({point for shot in curation['shots']
                                              for point in [shot['first'], shot['lastExclusive'] - 1]}) if curation else [],
              thumbnailScope='Endpoints/quarters, independently surveyed source intervals, detected discontinuities, repair boundaries and selected temporal seams. Thumbnails are lookup aids; use full-resolution playback for visual decisions.',
              detectedCuts=[row['frame'] for row in receipt['cuts']['candidates']], selectedSeams=selected_seams,
              checkpoints=rows, visualAudit=None, burnedInCaptionAudit=None, dialogueAudit=None)
(directory / 'audit-input.json').write_text(json.dumps(record, indent=2) + '\n')
heading = html.escape(receipt['identity'])
reference_note = html.escape(reference_record['method'] if reference_record else 'Original retail source')
video_path = html.escape(os.path.relpath(movie, directory), quote=True)
body = ''.join(f'<section><button data-time="{row["seconds"]}">Frame {row["frame"]} · {row["seconds"]:.3f} s</button>'
               + '<div class="pair">' + ''.join(f'<figure><img loading="lazy" src="{row["images"][kind]["file"]}"><figcaption>{kind}</figcaption></figure>' for kind in ['original', 'candidate']) + '</div></section>' for row in rows)
document = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M3.4 Film Audit · {heading}</title><style>body{{background:#121920;color:#edf1f5;font:18px/1.5 system-ui;margin:24px}}main{{max-width:1300px;margin:auto}}video{{width:100%;max-height:75vh;object-fit:contain;background:#000}}.pair{{display:grid;grid-template-columns:1fr 1fr;gap:18px}}figure{{margin:12px 0}}img{{max-width:100%}}button{{font:inherit;padding:8px}}section{{border-top:1px solid #607080;padding-top:16px;margin-top:24px}}</style>
<main><h1>M3.4 Full Film Audit · {heading}</h1><p>Awaiting per-film visual, cut, dialogue and caption audit. Automatic decoding, packet-clock and original-audio checks passed. The representative settings are user accepted.</p>
<video controls preload="metadata" src="{video_path}"></video><p>Source reference left; production candidate right. Reference: {reference_note}. These thumbnails identify checkpoints. Inspect full-resolution playback and continuous seams before recording a decision.</p>{body}</main>
<script>const video=document.querySelector('video');for(const button of document.querySelectorAll('[data-time]'))button.onclick=()=>{{video.currentTime=Number(button.dataset.time);video.scrollIntoView({{block:'center'}});}};</script></html>'''
(directory / 'index.html').write_text(document)
print(json.dumps(dict(identity=receipt['identity'], page=str(directory / 'index.html'), checkpoints=len(points), status=record['status'])))
