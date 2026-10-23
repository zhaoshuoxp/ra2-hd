"""Fixed-CSS camera diagnostic; label 2D targets and synthetic enlargement explicitly."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFont

parser = argparse.ArgumentParser()
parser.add_argument('--run', default='.artifacts/m1-3-zoom/capture-v2')
parser.add_argument('--output', default='.artifacts/m1-3-zoom/review-v1')
args = parser.parse_args()
run, out = Path(args.run), Path(args.output)
out.mkdir(parents=True, exist_ok=False)
report = json.loads((run / 'result.json').read_text())
assert report['status'] == 'PASS_SAME_TICK_RHINO_NATIVE_4K_CAMERA_COMPARISON'
art = Path('.artifacts/m1-3a/review-v2')
target = json.loads((art / 'export.json').read_text())['poses'][0]
source_hash = hashlib.sha256(Path(target['source']).read_bytes()).hexdigest()
assert source_hash == '9162a8950bc397e26a806e87abf9a7c2e47fa4616507543ab75142cf310f5e38'
reference = json.loads(Path('.artifacts/m1-3a/references-v1/result.json').read_text())['sets'][0]
normal = next(c for c in report['cases'] if c['variant'] == 'original' and c['label'] == 'normal')
zoomed = next(c for c in report['cases'] if c['variant'] == 'original' and c['label'] == 'zoom2')
assert reference['camera']['matrix'] == normal['camera']['matrix']
viewport = normal['viewport']
center = [viewport['x'] + viewport['width'] / 2, viewport['y'] + viewport['height'] / 2]
box_start = [(center[a] + (zoomed['cropRect'][a] - center[a]) / 2) * 2 for a in [0, 1]]
source_box = [*box_start, box_start[0] + 360, box_start[1] + 260]
analysis = {'status': 'PASS_STATIC_REVIEW_EXPORT', 'visualStatus': 'DISPLAY_DIAGNOSTIC_REVIEW_PENDING',
            'acceptedTargetSha256': source_hash, 'syntheticControlSourceBox': source_box,
            'syntheticControlSampling': 'nearest; explicitly not the runtime pipeline', 'assets': {}}
assets = {}

for variant in ['original', 'runtime']:
    cases = {c['label']: c for c in report['cases'] if c['variant'] == variant}
    images = {name: Image.open(run / cases[key]['pngFile']).convert('RGB')
              for name, key in [('normal', 'normal'), ('zoom2', 'zoom2')]}
    full = Image.open(run / cases['normal']['fullFile']).convert('RGB')
    images['post'] = full.resize((720, 520), Image.Resampling.NEAREST, box=source_box)
    assets[variant] = images

target_images = {}
target_full = None
for case, density in [(normal, 2), (zoomed, 4)]:
    zoom = case['zoom']
    full = Image.open(run / case['backgroundFullFile']).convert('RGBA')
    sprite = Image.open(art / f'primary-{density}x.png').convert('RGBA')
    original_origin = [reference['crop'][a] + target['exportOriginInSceneCss'][a] for a in [0, 1]]
    origin = [round((center[a] + zoom * (original_origin[a] - center[a])) * 2) for a in [0, 1]]
    full.alpha_composite(sprite, origin)
    x, y, width, height = case['cropRect']
    target_images[case['label']] = full.crop((x * 2, y * 2, (x + width) * 2, (y + height) * 2)).convert('RGB')
    if zoom == 1:
        target_full = full.convert('RGB')
target_images['post'] = target_full.resize((720, 520), Image.Resampling.NEAREST, box=source_box)
assets['target'] = target_images

for variant, images in assets.items():
    for mode, image in images.items():
        assert image.size == (720, 520)
        image.save(out / f'{variant}-{mode}.png')
    delta = ImageChops.difference(images['zoom2'], images['post'])
    changed = sum(1 for pixel in delta.getdata() if pixel != (0, 0, 0))
    analysis['assets'][variant] = {'zoomVsPostChangedPixels': changed, 'differenceIsNotQualityScore': True,
                                   'panelPixels': [720, 520], 'panelCss': [360, 260]}
    if variant != 'target':
        case = next(c for c in report['cases'] if c['variant'] == variant and c['label'] == 'normal')
        analysis['assets'][variant]['partOutputNormal'] = [p['outputSize'] for p in case['parts']]


def embed(variant, mode, extra=''):
    file = out / f'{variant}-{mode}.png'
    data = base64.b64encode(file.read_bytes()).decode()
    return f'<img class="native {extra}" alt="{variant} {mode}" src="data:image/png;base64,{data}">'


def pair_board(variant):
    result = Image.new('RGB', (1440, 600), '#182027')
    draw = ImageDraw.Draw(result)
    font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 32)
    small = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
    for i, mode in enumerate(['zoom2', 'post']):
        title = 'B - Camera 2x, real 4K' if mode == 'zoom2' else 'C - Screenshot enlarged 2x'
        subtitle = 'Actual engine capture' if mode == 'zoom2' else 'SYNTHETIC nearest control'
        draw.text((i * 720 + 12, 4), title, font=font, fill='white')
        draw.text((i * 720 + 12, 45), subtitle, font=small, fill='#f8d684')
        result.paste(assets[variant][mode], (i * 720, 80))
    result.save(out / f'{variant}-zoom-vs-post-pair.png')


for variant in ['original', 'runtime']:
    pair_board(variant)

page = ['''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Rhino native 4K camera diagnosis</title>
<style>body{font:18px/1.5 system-ui,sans-serif;background:#182027;color:#edf1f4;margin:24px}
main{max-width:1160px;margin:auto}h1{font-size:30px}h2{font-size:25px}h3{font-size:21px}a{color:#9ed2ff}
.notice{color:#f8d684}.scroll{max-width:100%;overflow:auto}.row{display:flex;gap:16px;width:max-content}
figure{width:360px;flex:none;margin:0}figcaption{height:80px}.native{display:block;width:360px;height:260px}
.stack{width:360px;height:260px}.stack img{display:none}.toggle label{display:inline-block;background:#334552;padding:8px}
.a:checked~.scroll .normal,.b:checked~.scroll .zoom2,.c:checked~.scroll .post{display:block}.toggle{margin:20px 0}
table{border-collapse:collapse}th,td{border:1px solid #58616a;padding:8px}code{overflow-wrap:anywhere}</style>
<main><h1>Rhino: real camera zoom versus screenshot enlargement</h1>
<p><strong>DISPLAY_DIAGNOSTIC_REVIEW_PENDING.</strong> No new asset or default camera change. The earlier runtime candidate remains rejected; the art target remains accepted.</p>
<p>Use 100% browser zoom. All panels are <strong>360×260 CSS pixels</strong> from 720×520 output pixels.
A uses the original game scale. B uses an actual 2× camera at the same 3840×2160 buffer. C enlarges the matching part of A's full screenshot with nearest sampling. B and C have equal object scale. C is an explicit synthetic control.</p>
<p class="notice">Camera 2× doubles object width/height and uses four times the output area, while halving visible world span in each direction.
It is not the original native game scale. The target panels below are labeled 2D composites; they are not vehicle-engine captures.</p>
<h2>Compare assets at the same 2× camera scale</h2><div class="scroll"><div class="row">''']
titles = {'original': 'Original Rhino', 'runtime': 'Earlier runtime candidate (rejected)', 'target': 'Accepted art target'}
for variant in ['original', 'runtime', 'target']:
    subtitle = 'Actual engine capture' if variant != 'target' else '2D ART COMPOSITE — NOT IN-ENGINE HD'
    page.append(f'<figure><figcaption>{titles[variant]}<br><small>{subtitle}</small></figcaption>{embed(variant,"zoom2")}</figure>')
page.append('</div></div>')

for variant in ['original', 'runtime', 'target']:
    page.append(f'<h2>{titles[variant]}: A / B / C</h2>')
    if variant == 'target':
        page.append('<p class="notice">All three are 2D ART COMPOSITES — NOT IN-ENGINE HD. A uses the accepted 2x export; B uses its directly authored 4x export at twice the display scale. C enlarges A. Same captured original shadow/background; no new artwork or inferred 3D view.</p>')
    page.append('<div class="scroll"><div class="row">')
    labels = [('normal', 'A · Normal scale', '4K output / camera 1×'),
              ('zoom2', 'B · Twice the display scale', '4K output / camera 2×' if variant != 'target' else 'Direct 4x art sample / 2D composite'),
              ('post', 'C · Screenshot enlarged 2×', 'SYNTHETIC nearest control')]
    for mode, title, subtitle in labels:
        page.append(f'<figure><figcaption>{title}<br><small>{subtitle}</small></figcaption>{embed(variant,mode)}</figure>')
    page.append('</div></div><div class="toggle">')
    for letter, (mode, title, _) in zip(['a', 'b', 'c'], labels):
        checked = 'checked' if letter == 'a' else ''
        page.append(f'<input class="{letter}" id="{variant}-{letter}" name="{variant}" type="radio" {checked}>'
                    f'<label for="{variant}-{letter}">{title}</label>')
    page.append('<div class="scroll"><div class="stack">')
    for mode, _, _ in labels:
        page.append(embed(variant, mode, mode))
    page.append('</div></div></div>')
    if variant != 'target':
        page.append(f'<p><a href="{variant}-zoom-vs-post-pair.png">Direct B/C pair (display at 720×300 CSS)</a></p>')

page.append('''<h2>Measured rendering path</h2><p>All seven captures share one simulation tick. Each has 60 world-color draws directly to the default framebuffer, viewport 3504×2096 within the 3840×2160 drawing buffer. Four additional draws are positively identified inside the shadow renderer, using an 8192×8192 shadow target. They are not a low-resolution world-color intermediate.</p>
<p>The context reports antialias=false and zero default-framebuffer samples. Antialiasing is unchanged in this experiment; its independent contribution is not measured.
Geometry, material, palette, owner, light, world matrices and logical selection bounds remain fixed within each asset's camera comparison. Original and candidate restore byte-for-byte, then the original is restored again.</p>
<p>The display diagnostic does not add the target's missing panels, hatch geometry or wear to the old candidate. Decide visual benefit from B versus C, then assess the remaining candidate-to-target gap at the same scale. Changed-pixel counts are not quality scores.</p>
<p><a href="../capture-v2/result.json">Actual draw and camera evidence</a> · <a href="analysis.json">Review sampling metadata</a> · <a href="../build-identity.json">Preserved build identity</a></p>
<h2>Visual decision</h2><p>Does real camera zoom B meaningfully improve Rhino clarity over synthetic enlargement C? At the same 2× scale, does the rejected runtime candidate still fall short of the accepted target? Feedback is open; no asset route or default camera change is selected by this diagnostic.</p></main></html>''')
document = ''.join(page)
(out / 'review.html').write_text(document)
analysis['imageCount'] = document.count('<img ')
(out / 'analysis.json').write_text(json.dumps(analysis, indent=2) + '\n')
print(json.dumps(analysis))
