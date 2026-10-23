"""Native-size A/B/C review and unchanged-background checks, from game captures."""
import base64
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image

run, out = map(Path, sys.argv[1:3])
report = json.loads((run / 'result.json').read_text())
assert report['status'] == 'PASS_BOUNDED_EDGE_DIAGNOSTIC_REVIEW_PENDING'
out.mkdir(parents=True, exist_ok=False)
production = report['scope'].startswith('A legacy / B accepted')
labels = (['A — Legacy', 'B — Accepted experimental C', 'C — Production C'] if production else
          ['A — Original', 'B — Filtered color', 'C — Filtered + soft edges'])
images, checks, groups = [], [], []
normal = report['sets'][0]['cases'][0]
bounds = np.array([m['displayBounds'] for m in normal['models']])
center = (bounds[:, :2].min(0) + bounds[:, 2:].max(0)) / 2
left, top = np.floor(center - [210, 160]).astype(int)
crop_css = [int(left), int(top), int(left + 420), int(top + 320)]

for group in report['sets']:
    cases = group['cases']
    arrays = [np.array(Image.open(run / c['file']).convert('RGB')) for c in cases]
    if production:
        assert np.array_equal(arrays[1], arrays[2]), f'Production differs from accepted C: {group["name"]}'
    h, w = arrays[0].shape[:2]
    mask = np.zeros((h, w), dtype=bool)
    ratio = w / cases[0]['display'][2]
    for model in cases[0]['models']:
        x0, y0, x1, y1 = model['displayBounds']
        x0, y0 = np.maximum(0, np.floor(np.array([x0, y0]) * ratio - 4)).astype(int)
        x1, y1 = np.minimum([w, h], np.ceil(np.array([x1, y1]) * ratio + 4)).astype(int)
        mask[y0:y1, x0:x1] = True
    for i in [1, 2]:
        changed = np.any(arrays[i] != arrays[0], axis=2)
        outside = int((changed & ~mask).sum())
        assert outside == 0, f'Changed non-HD background: {group["name"]} {labels[i]}: {outside}'
        checks.append({'set': group['name'], 'mode': 'ABC'[i], 'changedPixels': int(changed.sum()), 'outsideHdBounds': outside})
    rows = []
    for c, label, pixels in zip(cases, labels, arrays):
        original = run / c['file']
        target = out / c['file']; target.write_bytes(original.read_bytes())
        crop = Image.fromarray(pixels).crop(tuple(round(n * ratio) for n in crop_css))
        name = c['file'].replace('.png', '-crop.png'); crop.save(out / name)
        image = {'set': group['name'], 'label': label, 'file': name, 'full': c['file'], 'css': [420, 320],
                 'pixels': list(crop.size), 'tick': c['tick'], 'ratio': ratio,
                 'sha256': hashlib.sha256((out / name).read_bytes()).hexdigest()}
        images.append(image)
        data = base64.b64encode((out / name).read_bytes()).decode()
        rows.append(f'<figure><figcaption>{label}</figcaption><img width="420" height="320" '
            f'alt="{group["name"]} {label}" src="data:image/png;base64,{data}">'
            f'<a href="{name}">Crop PNG</a> · <a href="{c["file"]}">Full scene</a></figure>')
    content = f'<div class="row">{"".join(rows)}</div>'
    groups.append((group['name'], content, cases[0]['tick']))

sections = []
titles = {'normal-2160': '1. Normal — High output', 'normal-1080': '2. Normal — 1080p output',
          'blue-remap-2160': '3. Blue owner-color control', 'exposed-flank': '4. Exposed flank',
          'partly-occluded': '5. Partial building occlusion', 'rear-flank': '6. Rear flank',
          'firing': '7. Actual firing', 'damaged': '8. Damaged body and activity', 'after-live-C': '9. After live C playback'}
for name, content, tick in groups:
    if name.startswith('move-'):
        continue
    sections.append(f'<section><h2>{titles.get(name, name)}</h2><p>Same tick {tick} in all three columns.</p>{content}</section>')
motion = [(name, content, tick) for name, content, tick in groups if name.startswith('move-')]
frames = ''.join(f'<div class="motion-frame" data-index="{i}" {"hidden" if i else ""}>'
    f'<p>Sample {i + 1}, actual game tick {tick}</p>{content}</div>' for i, (name, content, tick) in enumerate(motion))
sections.insert(3, '<section id="motion"><h2>Sampled actual movement — synchronized A/B/C</h2>'
    '<p>These are sampled moving-game states, not a real-time video. Playback holds each state for 500 ms; '
    'all three treatments use the same pose and tick. The playable scene is the continuous-motion check.</p>'
    f'<button id="play">Play samples</button> <input id="frame" type="range" min="0" max="{len(motion) - 1}" value="0">'
    f'{frames}<noscript><p>JavaScript is off: the first movement sample remains visible.</p></noscript></section>')
page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M1.4 sampling and soft-edge experiment</title><style>
body{margin:24px;background:#151b24;color:#f0f3f6;font:20px/1.45 system-ui}h1{font-size:32px}h2{font-size:26px}
p{max-width:1160px}section{border-top:1px solid #596675;padding:20px 0;margin-top:24px}.row{display:flex;gap:20px;overflow:auto}
figure{margin:0;flex:none;width:420px}img{display:block;width:420px;height:320px;max-width:none}figcaption{margin:8px 0;font-weight:bold}
a{color:#9bd4ff;font-size:17px}button,input{font:inherit}button{padding:6px 12px}input{width:260px}code{font-size:17px}
</style><h1>M1.4 — sampling and soft-edge experiment</h1>
<p><b>REVIEW OPEN — no treatment selected.</b> A is the unchanged production baseline. B averages resolved color
with the existing hard coverage. C adds fractional edge coverage using opaque interiors and depth-tested blended edges.
Artwork, 900-high reference, camera, geometry, owner shading, light multipliers and original shadows are unchanged.</p>
<p>Keep browser zoom at 100%. Each crop occupies exactly 420×320 CSS pixels for the captured 1920×1080 game area;
High contains 840×640 output pixels and 1080p contains 420×320. Narrow windows scroll. No crop is stretched to look sharper.
At DPR 2, High maps directly to display pixels. Physical panel/compositor output and Windows are unverified.</p>
<p>Compare thin lines and highlights, contour softness, background integration, team-color edges and building/infantry
occlusion. Reduced aliasing can also soften fine texture; these are visual choices, not automatic quality scores.
The blue row temporarily selects an existing blue palette for HD meshes without changing ownership or rules.</p>
<p>Playable experiment: <code>bun scripts/m1/play-display-edges.mjs</code> from the repository. Use the A/B/C overlay
or Alt+1 / Alt+2 / Alt+3. Compare 1080p and High; the filter trial is bounded to these output conditions. Ctrl+C closes the isolated session.
The normal launcher and default renderer still use A.</p>
''' + ''.join(sections) + '''<script>
const slider=document.getElementById('frame'),button=document.getElementById('play');let timer;
function show(){document.querySelectorAll('.motion-frame').forEach((f,i)=>f.hidden=i!==Number(slider.value));}
slider.oninput=show;button.onclick=()=>{if(timer){clearInterval(timer);timer=undefined;button.textContent='Play samples';}
else{timer=setInterval(()=>{slider.value=(Number(slider.value)+1)%(Number(slider.max)+1);show();},500);button.textContent='Pause';}};
</script></html>'''
if production:
    page = page.replace('M1.4 sampling and soft-edge experiment', 'M1.4 production C verification')
    page = page.replace('M1.4 — sampling and soft-edge experiment', 'M1.4 — production C verification')
    start = page.index('<p><b>REVIEW OPEN')
    end = page.index('<p>Keep browser zoom', start)
    page = page[:start] + ('<p><b>C VISUAL DIRECTION ACCEPTED — production integration verification.</b> '
        'A is legacy rendering; B is the accepted experimental C; C is the production implementation. '
        'The paired B/C full scenes are pixel-identical in all 19 captured cases. '
        'Existing artwork, 900-high presentation, geometry, owner colors and lighting are unchanged.</p>') + page[end:]
    start = page.index('<p>Playable experiment:')
    end = page.index('</p>', start) + 4
    page = page[:start] + ('<p>Playable production build: <code>bun scripts/m1/play-production-c.mjs</code>. '
        'C is active automatically when the existing HD packs are selected. '
        'Ctrl+C closes the isolated session. The historical experiment and build remain preserved.</p>') + page[end:]
(out / 'review.html').write_text(page)
(out / 'review-images.json').write_text(json.dumps(images, indent=2) + '\n')
(out / 'pixel-checks.json').write_text(json.dumps({'status': 'PASS_UNCHANGED_NON_HD_BACKGROUND', 'checks': checks}, indent=2) + '\n')
print(json.dumps({'review': str(out / 'review.html'), 'images': len(images), 'pixelChecks': len(checks)}))
