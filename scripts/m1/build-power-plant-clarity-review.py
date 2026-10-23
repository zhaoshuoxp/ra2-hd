"""Lossless evidence crops and native-CSS-size review; no production artwork is edited."""
import argparse
import base64
import hashlib
import html
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser()
parser.add_argument('--run', type=Path, default=Path('.artifacts/m1-2a/candidates-v4'))
parser.add_argument('--output', type=Path, default=Path('.artifacts/m1-2a/review-v2'))
args = parser.parse_args()
run, out = args.run, args.output
report = json.loads((run / 'result.json').read_text())
assert report['status'] == 'PASS_DIAGNOSTIC_CAPTURE_ONLY'
out.mkdir(parents=True, exist_ok=False)
sets = {row['name']: row['cases'] for row in report['sets']}
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
labels = {'A': 'Current accepted renderer', 'B': 'Resolved-color bilinear sampling',
          'C': 'Selective non-owner shadow lift', 'D': 'Inward alpha threshold 0.50'}
checks = []
for name, cases in sets.items():
    a = np.array(Image.open(run / f'{name}-A.png')).astype(int)
    reference = cases[1]
    ratio = reference['buffer'][0] / 1920
    x0, y0 = reference['cropLogical'][:2]
    bounds = np.array([reference[key]['projectedBounds'] for key in ('body', 'active')])
    x, y = np.floor((bounds[:, :2].min(axis=0) - [x0, y0]) * ratio - 2).astype(int)
    right, bottom = np.ceil((bounds[:, 2:].max(axis=0) - [x0, y0]) * ratio + 2).astype(int)
    allowed = np.zeros(a.shape[:2], bool)
    allowed[max(0, y):min(a.shape[0], bottom), max(0, x):min(a.shape[1], right)] = True
    for mode in 'BCD':
        candidate = np.array(Image.open(run / f'{name}-{mode}.png')).astype(int)
        diff = np.abs(a - candidate)
        changed = np.any(diff[:, :, :3], axis=2)
        outside = int((changed & ~allowed).sum())
        assert outside == 0, (name, mode, outside)
        checks.append({'set': name, 'candidate': mode, 'changedPixels': int(changed.sum()),
                       'maxChannelDifference': int(diff.max()), 'outsideBuildingPixels': outside})

uploads = []
for frame in report['textureFrames']:
    prefix = f"{frame['member']}-{frame['frame']:03}"
    for role in ['base', 'data']:
        decoded = np.frombuffer((run / f'{prefix}-{role}.rgba').read_bytes(), dtype=np.uint8).reshape(frame['height'], frame['width'], 4)
        exported = np.array(Image.open(Path('.artifacts/m1-2/full-art-review-v1') / f'{prefix}-4x-{role}.png'))
        diff = np.abs(decoded.astype(int) - exported.astype(int))
        if role == 'data':
            assert not diff.any(), 'Discrete owner data changed in browser decode'
        assert not diff[:, :, 3].any(), 'Alpha changed during browser decode'
        Image.fromarray(decoded).save(out / f'{prefix}-uploaded-{role}.png')
        visible = exported[:, :, 3] >= 13
        uploads.append({'frame': prefix, 'role': role, 'alphaMaxDifference': int(diff[:, :, 3].max()),
                        'allChannelMaxDifference': int(diff.max()), 'visibleRgbMaxDifference': int(diff[visible, :3].max()),
                        'changedVisibleRgbPixels': int(np.any(diff[:, :, :3], axis=2)[visible].sum())})

font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 26)
small = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 20)
normal = sets['normal-4k'][1]
ratio = normal['buffer'][0] / 1920
left, top = normal['cropLogical'][:2]
bounds = normal['body']['projectedBounds']
detail_box = tuple(round(v) for v in [(bounds[0] - left - 10) * ratio, (bounds[1] - top - 12) * ratio,
                                     (bounds[2] - left + 15) * ratio, (bounds[3] - top + 12) * ratio])
board = Image.new('RGB', (1000, 730), '#141e2c')
draw = ImageDraw.Draw(board)
draw.text((18, 10), 'M1.2a / 4K output / enlarged diagnostic ONLY', fill='white', font=font)
draw.text((18, 45), 'Use review.html for the 500 CSS pixel native-size scene and same-position toggle.', fill='#b9c6d5', font=small)
for i, mode in enumerate('ABCD'):
    x, y = i % 2 * 500, 90 + i // 2 * 320
    draw.text((x + 14, y), mode + ' / ' + labels[mode], fill='white', font=small)
    source = Image.open(run / f'normal-4k-{mode}.png').crop(detail_box).convert('RGB')
    board.paste(source, (x + 115, y + 35))
board.save(out / 'diagnostic-detail.png')

animation_files = {}
for prefix in ['normal-stationary', 'normal-moving', 'damaged-stationary', 'damaged-moving']:
    names = sorted(name for name in sets if name.startswith(prefix))
    assert len(names) >= 8
    frames = [sets[name][1]['active']['frame'] for name in names]
    assert all(b == ((a + 1) % 8 + (8 if prefix.startswith('damaged') else 0)) for a, b in zip(frames, frames[1:]))
    positions = [sets[name][1]['camera']['position'] for name in names]
    assert (len(set(map(tuple, positions))) > 1) == ('moving' in prefix)
    for mode in 'ABCD':
        images = [Image.open(run / f'{name}-{mode}.png').convert('RGBA') for name in names]
        target = out / f'{prefix}-{mode}.png'
        images[0].save(target, save_all=True, append_images=images[1:], duration=180, loop=0, disposal=0, blend=0)
        animation_files[prefix, mode] = target


def uri(path):
    return 'data:image/png;base64,' + base64.b64encode(path.read_bytes()).decode()


styles = []
image_count = 0


def toggle(name, title, paths):
    global image_count
    radios, images = '', ''
    for mode, path in paths.items():
        checked = ' checked' if mode == 'A' else ''
        radios += f'<input type="radio" name="{name}" id="{name}-{mode}"{checked}><label for="{name}-{mode}">{mode}</label>'
        images += f'<img class="frame frame-{mode}" src="{uri(path)}" alt="{html.escape(title)} / {mode}">'
        styles.append(f'#{name}-{mode}:checked~.scroll .frame-{mode}{{display:block}}')
        image_count += 1
    return f'<section class="panel"><h2>{title}</h2>{radios}<div class="scroll"><div class="stack">{images}</div></div></section>'


body = '''<h1>M1.2a / native-size clarity review</h1>
<p><strong>VISUAL REVIEW OPEN.</strong> The same accepted artwork is used throughout. No candidate is a production default.
All compared columns in the primary review use 3840 x 2160 output at a 1920 x 1080 logical viewport.</p>
<p>Set browser zoom to <strong>100%</strong>. Every scene below is exactly <strong>500 x 340 CSS pixels</strong>;
its 4K source crop is 1000 x 680 pixels. A raw PNG opened at 1000 pixels is twice the intended logical width.
On a narrow window, scroll the scene horizontally: it does not shrink. We have not verified your monitor or personal viewing scale.</p>
<p id="scale">Script-free view: images retain the explicit CSS dimensions. OS scaling and browser zoom must be checked by the viewer.</p>
<ul><li><strong>A:</strong> Current accepted renderer and art.</li>
<li><strong>B:</strong> Bilinear interpolation of resolved colors; valid owner shade lookup occurs before interpolation.
Nearest alpha, geometry and textures remain unchanged. No mipmaps.</li>
<li><strong>C:</strong> Up to 28% linear-light lift limited to dark non-owner pixels; existing sampling and alpha remain unchanged.
This is a tonal diagnostic, not a repainted native-size art candidate.</li>
<li><strong>D:</strong> Discard coverage below 0.50 instead of 0.05; no silhouette expansion or smoothing. A deliberately limited edge diagnostic.</li></ul>
<p>Switch A/B/C/D at the same position. First judge tower and machinery readability, separation from the background and owner color.
Then inspect the damaged example and motion. The Conscript, yard, terrain and shadows are unchanged references.</p>'''
body += toggle('normal4k', 'Normal / fixed 4K / same tick and active frame 2', {m: run / f'normal-4k-{m}.png' for m in 'ABCD'})
body += '<details><summary>Adjacent A/B at native CSS size (horizontal scrolling on narrow windows)</summary><div class="scroll"><div class="pair">'
for m in 'AB':
    body += f'<figure><figcaption>{m} / {labels[m]}</figcaption><img class="native" src="{uri(run / f"normal-4k-{m}.png")}" alt="Adjacent {m}"></figure>'
    image_count += 1
body += '</div></div></details>'
body += toggle('damaged4k', 'Damaged / fixed 4K / same tick and active frame 8', {m: run / f'damaged-4k-{m}.png' for m in 'ABCD'})
body += toggle('normal1080', 'Separate robustness check / all alternatives at 1080p', {m: run / f'normal-1080p-{m}.png' for m in 'ABCD'})
body += '''<h2>Short animation checks</h2><p>Lossless animated PNGs assembled from consecutive native active-frame IDs, at 180 ms per review frame.
All alternatives at each index are rendered synchronously. These loops are frame-order reviews, not a real-time performance capture.
Moving-camera crops track the building during ordinary browser edge scrolling; camera matrices and native ticks are retained.</p>'''.replace('\n',' ')
for prefix in ['normal-stationary', 'normal-moving', 'damaged-stationary', 'damaged-moving']:
    body += toggle(prefix, prefix.replace('-', ' ').title() + ' / all at 4K', {m: animation_files[prefix, m] for m in 'ABCD'})
body += '''<h2>Pipeline trace / intended native dimensions</h2><p>Source and exported member frames below are shown at the corresponding native trim size.
They are separate sprite layers; the actual game above composites body plus active animation, owner remap, light and original shadow.
Export-to-atlas pixel difference is zero. Browser alpha and remap data are checked separately from base RGB decode rounding.</p>'''.replace('\n',' ')
trace = json.loads(Path('.artifacts/m1-2a/trace-v2/trace.json').read_text())
body += '<div class="trace">'
for f in trace['frames'][:2]:
    prefix = f"{f['member'][:-4]}-{f['nativeFrame']:03}"
    w, h = f['nativeTrim']['width'], f['nativeTrim']['height']
    for stage, path in [('Generated crop', Path('.artifacts/m1-2a/trace-v2') / f'{prefix}-generated-crop.png'),
                        ('Export / atlas identical', Path(f['export']))]:
        display_w = w if stage == 'Generated crop' else w + w % 2
        display_h = h if stage == 'Generated crop' else h + h % 2
        body += f'<figure><figcaption>{prefix}<br>{stage}<br>{display_w} x {display_h} CSS px</figcaption><img style="width:{display_w}px;height:{display_h}px" src="{uri(path)}" alt="{prefix} {stage}"></figure>'
        image_count += 1
body += '</div><details><summary>Enlarged diagnostic only</summary>'
body += f'<img style="width:1000px;max-width:100%" src="{uri(out / "diagnostic-detail.png")}" alt="Enlarged diagnostic"><p>This enlarged board is not native-size acceptance.</p></details>'
image_count += 1
body += '''<h2>Decision requested</h2><p>Which direction is clearer at the stated native size: A (keep current), B (sampling), C (shadow separation),
or none convincingly better? D is included to test edge coverage, not presumed beneficial. Mention any lost fine features, halos,
washed-out red, overly dark regions or distracting flicker. No visual PASS is inferred from the pixel checks or from silence.</p>'''.replace('\n',' ')
css = '''body{max-width:1100px;margin:24px auto;padding:0 20px;font:19px/1.5 system-ui;background:#141e2c;color:#edf2f7}
h1{font-size:34px}h2{font-size:25px;margin-top:32px}summary,label{cursor:pointer}label{display:inline-block;padding:6px 18px;margin:0 12px 10px 4px;background:#273b50;border-radius:5px}
input:checked+label{background:#3675a8}.scroll{max-width:100%;overflow-x:auto}.stack{position:relative;width:500px;height:340px;background:#000}
.frame{display:none;position:absolute;inset:0;width:500px;height:340px;max-width:none}.native{width:500px;height:340px;max-width:none}
.pair{display:flex;width:1020px;gap:20px}figure{margin:12px 0}figcaption{font-size:17px;margin-bottom:8px}.trace{display:flex;gap:30px;flex-wrap:wrap}.trace img{background:#26392f}details{margin:24px 0}
'''
script = '''<script>const image=document.querySelector('.frame');document.getElementById('scale').textContent=
`Measured image CSS width: ${getComputedStyle(image).width}; source: ${image.naturalWidth}px; devicePixelRatio: ${devicePixelRatio}; visualViewport scale: ${visualViewport.scale}. Desktop browser zoom must be 100%.`;</script>'''
(out / 'review.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>M1.2a clarity review</title><style>'+css+'\n'.join(styles)+'</style>'+body+script+'</html>')
(out / 'analysis.json').write_text(json.dumps({'status': 'PASS_CONTROL_AND_SCOPE_CHECKS_ONLY', 'visualStatus': 'REVIEW_OPEN',
    'sourceRun': str(run), 'sourceResultSha256': sha(run / 'result.json'), 'imageCount': image_count,
    'normalLogicalSize': [500, 340], 'checks': checks, 'browserDecode': uploads}, indent=2)+'\n')
print(json.dumps({'output': str(out), 'images': image_count, 'browserDecode': uploads}, indent=2))
