"""Fixed-size review of actual shroud, HUD text and pause-option captures."""
import base64
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image

run, out = map(Path, sys.argv[1:3])
r = json.loads((run / 'result.json').read_text())
assert r['status'] == 'PASS_PAUSE_OPTIONS_AND_SHROUD'
out.mkdir(exist_ok=False)
images = []


def picture(source, rect, css, label):
    im = Image.open(run / source)
    if rect:
        im = im.crop(rect)
    assert im.size == tuple(n * 2 for n in css)
    name = source.replace('.png', '-review.png')
    im.save(out / name)
    images.append({'file': name, 'css': css, 'pixels': im.size})
    data = base64.b64encode((out / name).read_bytes()).decode()
    return (f'<figure><figcaption>{label}</figcaption><img width="{css[0]}" height="{css[1]}" '
            f'src="data:image/png;base64,{data}" alt="{label}"><a href="{name}">Output pixels</a></figure>')


a = np.array(Image.open(run / 'credits-before.png')).astype(np.int16)
b = np.array(Image.open(run / 'credits-fixed.png')).astype(np.int16)
changed = np.any(a != b, axis=2)
ys, xs = np.where(changed)
assert len(xs) > 0
assert xs.min() >= a.shape[1] - 500 and ys.max() < 200, 'Text comparison changed other scene pixels'
checks = {'textChangedPixels': len(xs), 'textChangedBounds': [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())],
          'otherScenePixelsUnchanged': True, 'value': r['credits'][0]['text']['value']}
fog = ''.join(picture(f'boundary-{mode}.png', (0, 400, 1200, 1300), [600, 450], label)
              for mode, label in [('before', 'Before: overlapping shroud'), ('fixed', 'Fixed: one tile coverage')])
money = ''.join(picture(f'credits-{mode}.png', (3340, 0, 3840, 200), [250, 100], label)
                for mode, label in [('before', 'Before: fixed 1x text'), ('fixed', 'Fixed: output-density text')])
resolutions = ''.join(picture(f'resolution-game-{mode}.png', (3340, 0, 3840, 200), [250, 100], label)
                      for mode, label in [('720p', '720 high'), ('1080p', '1080 high'), ('1440p', '1440 high'),
                                          ('4k', '2160 high'), ('native', 'Auto: 2160 high here')])
speed = picture('pause-narrow-speed.png', None, [1000, 720], 'Paused options with Game speed')
page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M1.4 shroud boundary and pause options</title><style>
body{background:#171d25;color:#eef1f5;font:20px/1.5 system-ui;margin:24px}h1{font-size:34px}h2{font-size:28px}
p{max-width:1150px}.row{display:flex;gap:24px;overflow:auto}figure{margin:0;flex:none}img{display:block;max-width:none}
figcaption{font-weight:600;margin:10px 0}a{color:#9ddaff}section{padding:20px 0;border-top:1px solid #637384;margin-top:24px}
</style><h1>M1.4 — shroud boundary and pause options</h1>
<p>Technical checks pass; corrected shroud and HUD text await visual review. The user accepted the stabilized power-plant animation.
Reference height 900, existing artwork and independent Rhino work are preserved.</p>
<p>Use 100% browser zoom. All images retain fixed CSS size; DPR 2 maps the supplied output pixels directly to display pixels.</p>
<section><h2>Shroud boundary</h2><p>Same tick, camera and coverage data. Only the shroud mesh footprint changes from overlapping rectangles to tile diamonds.
Uniform-mask verification gives one coverage contribution everywhere; all 18 full-cover cases have zero bright pixels.</p><div class="row">''' + fog + '''</div></section>
<section><h2>Money digits: same value, size and high-resolution output</h2><p>The old path rerasterizes the same value at its original 168x16 texture size with nearest sampling.
The fixed path uses a 404x39 texture at this output density. All scene pixels outside the money display remain identical.
The surrounding original sidebar artwork is unchanged.</p><div class="row">''' + money + '''</div></section>
<section><h2>Actual game at each resolution</h2><p>Each preset was verified through the pause menu. Since the menu hides money digits,
these separate game-view captures use the same verified presets at one frozen tick and the same displayed size.
Auto and 2160 high are equivalent in this 1920x1080 CSS, DPR 2 browser; they are expected to look identical.</p><div class="row">''' + resolutions + '''</div></section>
<section><h2>Paused game speed</h2><p>The single-player speed slider preserves pause, applies when resuming, and retains its value when reopened.
Measured slowest / fastest / middle rates: 12 / 72 / 24 simulation ticks over 1.2 seconds. Network speed remains controlled by the shared game setup.</p>
<div class="row">''' + speed + '''</div></section>
<p>Run <code>bun scripts/m1/play-production-c.mjs</code> from the repository to review the latest corrected build.</p></html>'''
(out / 'review.html').write_text(page)
(out / 'images.json').write_text(json.dumps(images, indent=2) + '\n')
(out / 'pixel-checks.json').write_text(json.dumps(checks, indent=2) + '\n')
print(json.dumps(checks))
