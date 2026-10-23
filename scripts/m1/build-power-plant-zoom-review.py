"""Build a fixed-display-size review from unchanged actual-game camera captures."""
import argparse
import base64
import hashlib
import html
import json
from pathlib import Path

from PIL import Image, ImageChops

parser = argparse.ArgumentParser()
parser.add_argument('--run', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=False)
report = json.loads((args.run / 'result.json').read_text())
assert report['status'] == 'PASS_SAME_TICK_NATIVE_4K_CAMERA_COMPARISON'
a, b, restored = report['cases']
assert a['pngSha256'] == restored['pngSha256']
assert a['fullSha256'] == restored['fullSha256']
for case in report['cases']:
    for role in ['png', 'full']:
        assert hashlib.sha256((args.run / case[f'{role}File']).read_bytes()).hexdigest() == case[f'{role}Sha256']

# Explicit synthetic control: enlarge a matching region of the 1x screenshot.
# It is evidence processing, never an asset or substitute actual-engine capture.
v = a['worldViewport']
center = [2 * (v['x'] + v['width'] / 2), 2 * (v['y'] + v['height'] / 2)]
x, y, width, height = b['cropRect']
source_box = [center[0] + (2 * x - center[0]) / 2, center[1] + (2 * y - center[1]) / 2]
source_box += [source_box[0] + width, source_box[1] + height]
with Image.open(args.run / a['fullFile']) as full:
    enlarged = full.resize((1280, 1040), Image.Resampling.NEAREST, box=source_box)
enlarged.save(args.output / 'post-enlarged-control.png')
with Image.open(args.run / b['pngFile']) as actual:
    diff = ImageChops.difference(actual.convert('RGB'), enlarged.convert('RGB'))
    changed = sum(pixel != (0, 0, 0) for pixel in diff.getdata())

def embed(path):
    return 'data:image/png;base64,' + base64.b64encode(path.read_bytes()).decode()

images = [args.run / a['pngFile'], args.run / b['pngFile'], args.output / 'post-enlarged-control.png']
labels = ['A: Actual 4K / normal camera', 'B: Actual 4K / 2x camera', 'C: 1x screenshot enlarged 2x / synthetic control']
buttons = ''.join(f'<input type="radio" name="mode" id="m{i}" {"checked" if i == 1 else ""}>'
                  f'<label for="m{i}">{html.escape(label)}</label>' for i, label in enumerate(labels))
panels = ''.join(f'<figure class="p{i}"><figcaption>{html.escape(label)}</figcaption>'
                 f'<img alt="{html.escape(label)}" src="{embed(path)}" width="640" height="520"></figure>'
                 for i, (label, path) in enumerate(zip(labels, images)))
sizes = lambda c: ' x '.join(str(round(n)) for n in c['body']['outputSize'])
document = f'''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GAPOWR: native 4K and camera scale</title><style>
body{{background:#14212a;color:#eee;font:18px/1.5 system-ui;margin:24px;max-width:1400px}}
h1{{font-size:28px}}label{{display:inline-block;padding:8px;margin:4px;background:#304550;cursor:pointer}}
input:checked+label{{background:#176e82}}figure{{margin:0}}figcaption{{padding:8px 0;font-size:20px}}
.stage{{overflow-x:auto}}.stage figure{{display:none;width:640px}}
#m0:checked~.stage .p0,#m1:checked~.stage .p1,#m2:checked~.stage .p2{{display:block}}
img{{display:block;width:640px;height:520px;max-width:none}}a{{color:#9ee8ff}}
.pair{{display:flex;gap:24px;width:max-content}}.scroll{{overflow-x:auto}}
table{{border-collapse:collapse}}td,th{{padding:8px 16px;border:1px solid #52707b;text-align:left}}
</style><h1>Same artwork / real 4K / different camera scale</h1>
<p>Open at 100% browser zoom. Every crop displays at exactly 640 x 520 CSS pixels from a
1280 x 1040 PNG. Narrow windows scroll; images never shrink to fit. A/B are actual engine captures
at the same tick ({a['tick']}), body frame {a['body']['frame']} and activity frame {a['active']['frame']}.
Only the world camera zoom changes; UI scale, textures, lighting and output density stay unchanged.</p>
<table><tr><th>Case</th><th>Drawing buffer</th><th>Body output pixels</th></tr>
<tr><td>A: camera 1x</td><td>3840 x 2160</td><td>{sizes(a)}</td></tr>
<tr><td>B: camera 2x</td><td>3840 x 2160</td><td>{sizes(b)}</td></tr></table>
<p>The body atlas rectangle is 336 x 368 texels. B gives it approximately one output pixel per
texel along each axis; this does not imply identical appearance to an unlit generated reference.</p>
<h2>Switch in place</h2>{buttons}<div class="stage">{panels}</div>
<p>C is intentionally a nearest-neighbor enlargement of A's full screenshot, geometrically aligned
to B. It is not a separate engine run or the game's current rendering pipeline. Comparing B and C
at equal object size tests whether B reveals detail beyond merely enlarging the existing pixels.</p>
<h2>A and B side by side</h2><div class="scroll"><div class="pair">{panels[:panels.find('<figure class="p2"')]}</div></div>
<p>Observed world draws: {len(a['draws'])} (A), {len(b['draws'])} (B). Every captured world draw targets
the default framebuffer with viewport 3504 x 2096 inside the 3840 x 2160 buffer. Restoring the
normal camera reproduces the full baseline PNG exactly.</p>
<p>Diagnostic only: zoom halves the visible world span per axis. This is not production zoom,
interaction/culling acceptance, a new artwork approval, or proof about the separate Rhino pipeline.
Review question: does B expose the expected artwork detail, and is B materially better than C?</p>
</html>'''
(args.output / 'review.html').write_text(document)
(args.output / 'analysis.json').write_text(json.dumps({
    'status': 'PASS_EVIDENCE_REVIEW_BUILD', 'source': str(args.run),
    'bodyOutputNormal': a['body']['outputSize'], 'bodyOutputZoom2': b['body']['outputSize'],
    'syntheticControlSourceBox': source_box, 'syntheticControlSampling': 'nearest',
    'actualZoomVsPostEnlargedChangedPixels': changed,
    'pixelDifferenceIsNotQualityScore': True, 'visualStatus': 'AWAITING_USER_FEEDBACK',
}, indent=2) + '\n')
print(args.output / 'review.html')
