"""Build a compact local review page using canonical movie files without copying them."""
import argparse
import hashlib
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--inventory', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--candidates', type=Path)
parser.add_argument('--native-report', type=Path)
parser.add_argument('--approval', type=Path)
args = parser.parse_args()
inventory = json.loads(args.inventory.read_text())
candidates = json.loads(args.candidates.read_text()) if args.candidates else {}
native = json.loads(args.native_report.read_text()) if args.native_report else None
approval = json.loads(args.approval.read_text()) if args.approval else None
approved = {sample['identity']: sample for sample in approval['samples']} if approval else {}
if approval:
    assert approval['status'] == 'REPRESENTATIVE_VISUAL_DIRECTION_ACCEPTED'
    assert set(approved) == set(candidates), 'Approval identities differ from the reviewed candidates'
if native:
    assert native['status'].startswith('PASS_'), 'Native review evidence must pass'
args.output.parent.mkdir(parents=True, exist_ok=True)
samples = [
    ('ra2:s01_f00e', 'RA2 live action', 35, 8, 'fullscreen'),
    ('ra2:a00_f00e', 'RA2 CGI and motion', 25, 8, 'fullscreen'),
    ('yr:a00_f00e', 'YR introduction and transitions', 25, 8, 'fullscreen'),
    ('ra2:s03_p01e', 'RA2 native radar communication', 0, 5, 'radar'),
    ('yr:s03_p01e', 'YR native radar communication', 0, 3, 'radar'),
]
rows = []
for identity, title, start, length, placement in samples:
    movie = next(movie for movie in inventory['movies'] if movie['identity'] == identity)
    source = ROOT / '.local' / movie['fallback']['localPath']
    candidate = candidates.get(identity)
    if candidate:
        source = Path(candidate['original']).resolve()
    accepted = approved.get(identity)
    if accepted:
        assert hashlib.sha256(Path(candidate['file']).read_bytes()).hexdigest() == accepted['candidateSha256']
        assert candidate['sourceStart'] == accepted['sourceStartFrame'] / accepted['fps']
        assert candidate['length'] == accepted['seconds']
    rows.append(dict(identity=identity, title=candidate.get('title', title) if candidate else title,
                     start=candidate.get('start', start) if candidate else start,
                     length=candidate.get('length', length) if candidate else length, placement=placement,
                     sourceStart=candidate.get('sourceStart') if candidate else None,
                     visualAccepted=bool(accepted),
                     original=os.path.relpath(source, args.output.parent),
                     originalBytes=source.stat().st_size,
                     candidate=os.path.relpath(Path(candidate['file']).resolve(), args.output.parent) if candidate else None,
                     originalSpec=movie['original']['video'], bytes=movie['fallback']['bytes'],
                     candidateSpec=candidate.get('spec') if candidate else None,
                     native=[dict(kind=clip['kind'], file=os.path.relpath(args.native_report.parent / clip['screenshot'], args.output.parent),
                                  viewport=clip['viewport'], bounds=clip['videoBounds'])
                             for clip in native['clips'] if clip['identity'] == identity] if native else []))
data = json.dumps(rows).replace('<', '\\u003c')
title = 'M3.4 Temporal Movie Samples' if candidates else 'M3.4 Movie Source Review'
intro = '''<p>Both panels use the same bounded excerpt from the original local retail BIK archive.
Candidates use the <a href="https://github.com/open-mmlab/RealBasicVSR">official RealBasicVSR model</a>,
with the original 15 fps and identical original audio. No external remastered movie is included.
Full-screen exports use 2X dimensions; radar exports use 4X dimensions. Visual approval is pending.</p>''' if candidates else '''<p>All originals link to the current local installation. No movie is copied into this page.
Review both panels at the same source time. Candidate approval is a separate user decision.</p>
<p>Source: <a href="https://www.bilibili.com/video/BV1iP411g7zm/">KingsZHNONE author release</a> ·
<a href="https://pan.quark.cn/s/11453ba6735a">Author download</a>.
Current guest access permits installer headers; the movie data volume exceeds the guest download limit.</p>'''
if approval:
    intro = intro.replace('Visual approval is pending.',
                          'The five reviewed windows are visually accepted. Complete-film production remains pending.')
document = r'''<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>__TITLE__</title>
<style>
body{margin:0;background:#101419;color:#e9edf0;font:18px/1.5 system-ui,sans-serif}
main{max-width:1360px;margin:auto;padding:28px}
h1{font-size:30px;margin:0 0 12px}h2{font-size:23px;margin:0}p{max-width:1000px}
button,select{font:inherit;padding:7px 12px;color:inherit;background:#29333d;
    border:1px solid #60717e;border-radius:5px;cursor:pointer}
header,.tools{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
article{border:1px solid #3f4a54;border-radius:8px;padding:20px;margin:24px 0;background:#182028}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:14px 0}
.screen{background:#000;aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;overflow:hidden}
video{display:block;width:100%;height:100%;object-fit:contain}
.radar .screen{aspect-ratio:auto;height:220px;align-items:flex-start;justify-content:flex-start}
.radar video{width:140px;height:110px}.radar.enlarged video{width:280px;height:220px}
video:fullscreen{width:100%;height:100%;object-fit:contain;background:#000}
.empty{color:#b7c1c9;padding:18px}.spec{font-size:15px;color:#bdcbd5}a{color:#9dd9ff}
.native{display:grid;grid-template-columns:1fr 1fr;gap:18px}.native img{display:block;width:100%;height:auto}
@media(max-width:700px){.pair{grid-template-columns:1fr}main{padding:14px}}
</style><main><h1>__TITLE__</h1>
<p id="status"></p>
__INTRO__
<div id="samples"></div></main><script>
const rows = __DATA__;
document.querySelector('#status').textContent = rows.some(row => row.candidate)
    ? rows.every(row => row.visualAccepted)
        ? 'LOCAL TEMPORAL RESTORATION SAMPLES — Five reviewed windows visually accepted. Complete HD movies: 0.'
        : 'LOCAL TEMPORAL RESTORATION SAMPLES — Pending user visual review. Complete HD movies: 0.'
    : 'SOURCE FOOTAGE ONLY — HD movie data is unavailable. No HD candidate or visual acceptance is claimed.';
for (const row of rows) {
    const article = document.createElement('article');
    article.className = row.placement === 'radar' ? 'radar' : '';
    const header = document.createElement('header'), title = document.createElement('h2');
    title.textContent = row.title + ' · ' + row.identity;
    header.append(title); article.append(header);
    const pair = document.createElement('div'), videos = [];
    pair.className = 'pair'; article.append(pair);
    for (const kind of ['original', 'candidate']) {
        const panel = document.createElement('div'), label = document.createElement('div');
        label.textContent = kind === 'original' ? 'Original' : 'Candidate'; panel.append(label);
        const screen = document.createElement('div');
        screen.className = 'screen'; panel.append(screen);
        if (row[kind]) {
            const video = document.createElement('video');
            video.src = row[kind]; video.preload = 'metadata'; video.playsInline = true;
            video.controls = row.placement !== 'radar'; video.muted = kind === 'candidate';
            screen.append(video); videos.push(video);
            video.onloadedmetadata = () => { video.currentTime = row.start; };
        } else {
            const empty = document.createElement('p');
            empty.className = 'empty'; empty.textContent = 'Awaiting source movie data. No candidate has been produced.';
            screen.append(empty);
        }
        pair.append(panel);
    }
    const spec = document.createElement('p'), s = row.originalSpec;
    spec.className = 'spec';
    spec.textContent = `Original: ${s.width} × ${s.height}, ${s.fpsNumerator}/${s.fpsDenominator} fps, `
        + `${s.durationSeconds.toFixed(3)} s; current fallback ${(row.bytes / 1048576).toFixed(2)} MiB. `
        + `Review window ${row.start}–${row.start + row.length} s.`;
    if (row.candidateSpec) {
        const candidate = row.candidateSpec;
        spec.textContent = `Source time ${row.sourceStart}–${row.sourceStart + row.length} s · `
            + `Original ${s.width} × ${s.height}, ${(row.originalBytes / 1048576).toFixed(2)} MiB · `
            + `Candidate ${candidate.width} × ${candidate.height}, `
            + `${candidate.fps} fps, ${row.length} s, ${(candidate.bytes / 1048576).toFixed(2)} MiB. `
            + 'RealBasicVSR; original audio; no interpolation. '
            + (row.visualAccepted ? 'Reviewed window accepted; full movie pending.' : 'Visual approval pending.');
    }
    article.append(spec);
    const tools = document.createElement('div'); tools.className = 'tools'; article.append(tools);
    const button = (label, handler) => {
        const control = document.createElement('button'); control.textContent = label; control.onclick = handler; tools.append(control);
    };
    button('Play matching interval', async () => {
        for (const video of videos) { video.pause(); video.currentTime = row.start; }
        await Promise.all(videos.map(video => video.play()));
    });
    button('Pause', () => videos.forEach(video => video.pause()));
    button('Full screen original', () => videos[0]?.requestFullscreen());
    if (videos[1]) button('Full screen candidate', () => videos[1].requestFullscreen());
    if (row.placement === 'radar') button('Radar 1× / 2×', () => article.classList.toggle('enlarged'));
    for (const video of videos) video.addEventListener('timeupdate', () => {
        if (video.currentTime >= row.start + row.length) videos.forEach(video => video.pause());
    });
    if (row.native.length) {
        const detail = document.createElement('details'), summary = document.createElement('summary');
        summary.textContent = 'Actual campaign surface captures'; detail.append(summary);
        const explanation = document.createElement('p'); explanation.className = 'spec';
        explanation.textContent = 'Independent short-sample preview on the actual HUD; simulation paused. '
            + 'These captures document layout and captions. They do not claim a native mission trigger or complete HD movie.';
        detail.append(explanation);
        const panels = document.createElement('div'); panels.className = 'native'; detail.append(panels);
        for (const capture of row.native) {
            const panel = document.createElement('div'), label = document.createElement('p');
            label.className = 'spec'; label.textContent = `${capture.kind} · viewport ${capture.viewport.join(' × ')} · `
                + `surface ${Math.round(capture.bounds.width)} × ${Math.round(capture.bounds.height)}`;
            const link = document.createElement('a'), image = document.createElement('img');
            link.href = image.src = capture.file; image.alt = row.identity + ' ' + capture.kind + ' actual campaign surface';
            image.loading = 'lazy'; link.append(image); panel.append(label, link); panels.append(panel);
        }
        article.append(detail);
    }
    document.querySelector('#samples').append(article);
}
</script></html>'''
args.output.write_text(document.replace('__DATA__', data).replace('__TITLE__', title).replace('__INTRO__', intro))
print(json.dumps(dict(output=str(args.output.resolve()), originals=len(rows), candidates=sum(bool(row['candidate']) for row in rows),
                      scope='Five accepted short samples; complete-film HD production remains pending' if approval
                      else 'Paired temporal short samples; no production HD coverage or user visual acceptance' if candidates
                      else 'Local source review scaffolding; no production HD coverage or native-radar acceptance')))
