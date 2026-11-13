"""Build a self-contained review of actual installed downloaded masters and the Yuri title."""
import argparse
import base64
import concurrent.futures
import hashlib
import html
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def build(work):
    ffmpeg = Path(subprocess.check_output([str(ROOT / '.local/tooling/campaign-media/bin/python'), '-c',
                                          'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], text=True).strip())
    selection = json.loads((ROOT / '.local/hd-movie-selection.json').read_text())
    manifest_file = ROOT / '.local' / selection['manifest']
    assert sha(manifest_file) == selection['sha256']
    manifest = json.loads(manifest_file.read_text())
    entries = {entry['edition'] + ':' + entry['id']: entry for entry in manifest['entries']}
    samples = json.loads((work / 'independent-yr/bounded-sequences.json').read_text())['samples']
    chosen = [samples[0], next(row for row in samples if 'late' in row['label']),
              next(row for row in samples if row['identity'] == 'yr:a01_f00e'),
              next(row for row in samples if row['identity'] == 'yr:s08_f00e')]
    controls = [{'identity': row['identity'], 'label': row['label'], 'start': row['sourceFrames'][0] / 60} for row in chosen]
    controls += [{'identity': 'ra2:a00_f00e', 'label': 'RA2 intro camera movement', 'start': 165},
                 {'identity': 'ra2:s01_f00e', 'label': 'RA2 Soviet briefing movement', 'start': 95},
                 {'identity': 'ra2:s03_p01e', 'label': 'RA2 retained HD radar', 'start': 0},
                 {'identity': 'yr:s03_p01e', 'label': 'YR retained HD radar', 'start': 0}]
    media = work / 'review-media'
    media.mkdir(exist_ok=True)

    def render(control):
        entry = entries[control['identity']]
        source = manifest_file.parent / entry['file']['path']
        name = control['identity'].replace(':', '-') + '-' + str(int(control['start'] * 60))
        output = media / (name + '.mp4')
        if not output.exists():
            subprocess.run([str(ffmpeg), '-nostdin', '-n', '-v', 'error', '-ss', f"{control['start']:.9f}",
                            '-i', str(source), '-t', '3', '-map', '0:v:0', '-map', '0:a:0',
                            '-vf', 'setparams=range=limited:color_primaries=smpte170m:color_trc=bt709:colorspace=smpte170m',
                            '-c:v', 'libx264', '-crf', '14', '-preset', 'fast', '-threads', '3',
                            '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', str(output)], check=True)
        fps = entry['video']['fpsNumerator'] / entry['video']['fpsDenominator']
        return {**control, 'width': entry['video']['width'], 'height': entry['video']['height'], 'fps': fps,
                'sourceSha256': entry['file']['sha256'], 'source': str(source.relative_to(ROOT)),
                'preview': str(output.relative_to(ROOT)), 'previewSha256': sha(output),
                'data': 'data:video/mp4;base64,' + base64.b64encode(output.read_bytes()).decode()}

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        clips = list(pool.map(render, controls))
    screenshot = work / 'menu-title-preview/yr-home-return.png'
    menu = 'data:image/png;base64,' + base64.b64encode(screenshot.read_bytes()).decode()
    options = ''.join(f'<option value="{index}">{html.escape(clip["label"])} - {clip["identity"]}</option>'
                      for index, clip in enumerate(clips))
    inventory = json.loads((ROOT / 'docs/hd-movies-inventory-20261109.json').read_text())
    roles = {row['identity']: row['role'] for row in inventory['movies']}
    rows = []
    for identity, entry in entries.items():
        kind = 'Downloaded full-screen' if entry['provenance'].get('sourceType') == 'user-selected-downloaded-fullscreen' else (
            'Retained HD radar' if roles[identity] == 'transmission' else 'Retained library exception')
        fps = entry['video']['fpsNumerator'] / entry['video']['fpsDenominator']
        rows.append(f'<tr><td>{html.escape(identity)}</td><td>{kind}</td><td>{entry["video"]["width"]}x{entry["video"]["height"]}</td><td>{fps:g}</td></tr>')
    page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M3.4 downloaded movies and Yuri menu</title><style>
*{box-sizing:border-box}body{margin:0;background:#11171c;color:#e5edf4;font:18px/1.5 system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:24px}h1{font-size:32px;color:#f0d28b}h2{font-size:25px}select,button{font:inherit;padding:9px;background:#26333f;color:white;border:1px solid #8092a2;border-radius:5px}select{max-width:100%}.controls{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}.stage{width:100%;max-height:80vh;overflow:auto;background:black}video{display:block;width:min(100%,960px);max-height:72vh;object-fit:contain;margin:auto}video.native{width:var(--native-width);max-width:none;max-height:none;margin:0}img{display:block;width:100%;height:auto}table{width:100%;border-collapse:collapse;font-size:16px}td,th{text-align:left;border-bottom:1px solid #354554;padding:9px}.table{overflow:auto}.note{color:#bdcbd6}video:fullscreen{width:100%;height:100%;max-height:none;object-fit:contain}
</style><main><h1>M3.4 - Downloaded movies and Yuri menu</h1>
<p>51 downloaded full-screen movies, 83 retained HD radar movies and two retained library exceptions. The app keeps the original dialogue and game caption clock.</p>
<p class="note">Downloaded motion, interpolation, cut blends and MRZJL watermark are preserved. These excerpts are review copies of the installed full masters; complete-film visual review remains pending.</p>
<select id="clip" aria-label="Review clip">__REVIEW_OPTIONS__</select><div class="controls"><button id="play">Play / pause</button><button id="native">Native dimensions</button><button id="fullscreen">Fullscreen</button></div>
<p id="facts"></p><div class="stage"><video id="preview" controls playsinline preload="metadata"></video></div>
<h2>Yuri main-menu title</h2><img alt="Native Yuri main menu with expansion title" src="__REVIEW_MENU_IMAGE__">
<h2>Complete library coverage</h2><p class="note">The supplied packages lack RA2 emprtrlr.bik and YR renegade.bik. Their existing HD library entries remain available. Existing localized captions are rendered by the app.</p>
<div class="table"><table><thead><tr><th>Identity</th><th>Selected source</th><th>Dimensions</th><th>FPS</th></tr></thead><tbody>__REVIEW_ROWS__</tbody></table></div>
<script>const clips=__REVIEW_CLIPS__,video=document.getElementById('preview'),select=document.getElementById('clip');
function load(){video.pause();video.removeAttribute('src');video.load();const c=clips[Number(select.value)];video.src=c.data;video.style.setProperty('--native-width',c.width+'px');document.getElementById('facts').textContent=c.identity+' | '+c.width+'x'+c.height+' | '+c.fps+' fps | source '+c.start.toFixed(3)+'s';video.load()}
select.addEventListener('change',load);document.getElementById('play').onclick=()=>video.paused?video.play():video.pause();document.getElementById('native').onclick=()=>video.classList.toggle('native');document.getElementById('fullscreen').onclick=()=>document.fullscreenElement?document.exitFullscreen():video.requestFullscreen();video.volume=.65;load();</script></main></html>'''
    page = page.replace('__REVIEW_OPTIONS__', options).replace('__REVIEW_MENU_IMAGE__', menu)
    page = page.replace('__REVIEW_ROWS__', ''.join(rows)).replace('__REVIEW_CLIPS__', json.dumps(clips))
    output = ROOT / '.artifacts/hd-movies/review/M3.4-Downloaded-Movies-r1.html'
    output.write_text(page)
    record = {'schema': 'downloaded-movie-review-v1', 'page': str(output.relative_to(ROOT)), 'sha256': sha(output),
              'bytes': output.stat().st_size, 'selection': selection, 'clips': [{k: v for k, v in clip.items() if k != 'data'} for clip in clips],
              'menu': {'file': str(screenshot.relative_to(ROOT)), 'sha256': sha(screenshot)},
              'coverage': {'total': 136, 'downloadedFullscreen': 51, 'retainedRadar': 83, 'retainedLibrary': 2},
              'policy': 'Fully embedded local review; excerpts are derived viewing copies. Formal masters preserve original AAC packets and source-frame order.'}
    output.with_suffix('.json').write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps({k: record[k] for k in ['page', 'sha256', 'bytes']}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('work', type=Path)
    build(parser.parse_args().work.resolve())
