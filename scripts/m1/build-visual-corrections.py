"""Native-size before/after shroud and animation review from actual renderer captures."""
import base64
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image

run, out = map(Path, sys.argv[1:3])
r = json.loads((run / 'result.json').read_text())
assert r['status'] == 'PASS_SHROUD_COVERAGE_AND_STABLE_ANIMATION_REVIEW_PENDING'
out.mkdir(parents=True, exist_ok=False)
images = []


def crop_image(file, rect, css, label):
    image = Image.open(run / file).crop(rect).convert('RGB')
    name = file.replace('.png', '-crop.png')
    image.save(out / name)
    pixels = image.size
    assert pixels == tuple(n * 2 for n in css)
    images.append({'file': name, 'css': css, 'pixels': pixels, 'label': label})
    encoded = base64.b64encode((out / name).read_bytes()).decode()
    return (f'<figure><figcaption>{label}</figcaption><img width="{css[0]}" height="{css[1]}" '
            f'style="width:{css[0]}px;height:{css[1]}px" alt="{label}" '
            f'src="data:image/png;base64,{encoded}"><a href="{name}">Output-pixel crop</a></figure>')


shroud = ''.join(crop_image('shroud-' + mode + '.png', (0, 400, 1200, 1300), [600, 450], label)
                 for mode, label in [('before', 'Before — unexplored terrain'), ('fixed', 'Fixed — same tick and camera')])
sections = [f'<section><h2>Unexplored terrain</h2><p>600x450 CSS pixels; 1200x900 render pixels. '
            f'The speckles are inside unexplored terrain, not only its boundary.</p><div class="row">{shroud}</div></section>']
checks = []
for state in ['normal', 'damaged']:
    pairs = [p for p in r['animation'] if p['state'] == state]
    model = next(m for m in pairs[0]['cases'][1]['models'] if m['offset'] == 3)
    bounds = model['displayBounds']
    center = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2]
    left, top = round(center[0] - 210), round(center[1] - 160)
    rect = (left * 2, top * 2, (left + 420) * 2, (top + 320) * 2)
    reference = np.asarray(Image.open(run / pairs[0]['cases'][1]['file']))
    frames = []
    for p in pairs:
        before, fixed = p['cases']
        a = np.asarray(Image.open(run / before['file']))
        b = np.asarray(Image.open(run / fixed['file']))
        if p['phase'] == 0:
            assert np.array_equal(a, b), 'Selected reference frame must remain pixel-identical'
        # Only the upper active-layer region may vary in this frozen full scene.
        x0, y0, x1, y1 = bounds
        allowed = np.zeros(b.shape[:2], dtype=bool)
        allowed[max(0, int(y0 * 2) - 3):int((y0 + (y1 - y0) * .55) * 2) + 3,
                max(0, int(x0 * 2) - 3):int(x1 * 2) + 3] = True
        delta = np.abs(b.astype(np.int16) - reference.astype(np.int16)).max(axis=2)
        changed = delta > 0
        outside = int((changed & ~allowed).sum())
        # Identical texels at different atlas UVs can round by one output code
        # value. Retain that measured residual rather than claim exact equality.
        outside_max = int(delta[~allowed].max())
        assert outside_max <= 1, (state, p['phase'], outside, outside_max)
        checks.append({'state': state, 'phase': p['phase'], 'changedPixels': int(changed.sum()),
                       'outsideEffectsRegion': outside, 'outsideMaxChannelDelta': outside_max})
        content = crop_image(before['file'], rect, [420, 320], f'Before — {state} phase {p["phase"]}')
        content += crop_image(fixed['file'], rect, [420, 320], f'Fixed — {state} phase {p["phase"]}')
        frames.append(f'<div class="frame row" data-phase="{p["phase"]}" {"hidden" if p["phase"] else ""}>{content}</div>')
    sections.append(f'<section class="animation"><h2>{state.title()} animation</h2>'
        '<p>Matched render phases, each crop 420x320 CSS pixels. Structure uses existing phase 0 (normal) or 8 (damaged); '
        'fire/glow continues inside a common emissive mask. These controlled phase previews run at 150 ms per frame; '
        'use the playable build for unchanged native game timing. Damaged frames are a render-only control.</p>'
        '<button class="play">Play comparison</button> <input class="phase" type="range" min="0" max="7" value="0">'
        + ''.join(frames) + '</section>')
page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M1.4 shroud and animation corrections</title><style>
body{background:#171d25;color:#eef1f5;font:20px/1.5 system-ui;margin:24px}h1{font-size:34px}h2{font-size:28px}
p{max-width:1150px}.row{display:flex;gap:24px;overflow:auto}.row[hidden]{display:none}figure{margin:0;flex:none}
img{display:block;max-width:none}figcaption{font-weight:600;margin:10px 0}a{color:#9ddaff}section{padding:20px 0;border-top:1px solid #637384;margin-top:24px}
button,input{font:inherit;margin:8px 0}button{padding:8px 12px}input{width:250px}code{font-size:18px}
</style><h1>M1.4 — shroud and animation corrections</h1>
<p><b>Technical checks pass; animation visual review remains open.</b> Reference height 900 and the accepted C sampling remain unchanged.
No authored source or exported pack is overwritten. This review separates the unexplored-terrain leak from the authored animation's structural variation.</p>
<p>Structure, alpha and remap texels are identical across each corrected cycle. Actual rendering retains at most 16 isolated pixels
outside the effects region differing by one 8-bit color step between atlas positions; this is recorded sampling rounding, not structural motion.</p>
<p>Keep browser zoom at 100%. Images have fixed CSS dimensions and never shrink to fit. At DPR 2, output pixels map directly to display pixels.
The full-cover probe reports zero bright pixels for all six output presets at three camera offsets.</p>
<p>Run <code>bun scripts/m1/play-production-c.mjs</code> from the repository for the corrected isolated build. Ctrl+C closes that session.</p>
''' + ''.join(sections) + '''<script>
for(const section of document.querySelectorAll('.animation')){
 const slider=section.querySelector('.phase'),button=section.querySelector('.play');let timer;
 const show=()=>section.querySelectorAll('.frame').forEach(f=>f.hidden=Number(f.dataset.phase)!==Number(slider.value));
 slider.oninput=show;button.onclick=()=>{if(timer){clearInterval(timer);timer=undefined;button.textContent='Play comparison';}
 else{timer=setInterval(()=>{slider.value=(Number(slider.value)+1)%8;show();},150);button.textContent='Pause';}};
}
</script></html>'''
(out / 'review.html').write_text(page)
(out / 'images.json').write_text(json.dumps(images, indent=2) + '\n')
(out / 'pixel-checks.json').write_text(json.dumps({'status':'PASS_EFFECTS_ONLY_TEMPORAL_CHANGE','checks':checks},indent=2)+'\n')
print(json.dumps({'images':len(images),'temporalChecks':len(checks),'review':str(out/'review.html')}))
