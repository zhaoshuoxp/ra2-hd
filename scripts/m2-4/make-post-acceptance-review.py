"""Embed native correction captures; crops retain exact pixels without resampling."""
import base64
import hashlib
import html
import io
import json
from pathlib import Path
import sys
from PIL import Image

base, output = map(Path, sys.argv[1:3])
output.mkdir(parents=True, exist_ok=False)
pins = []


def figure(file, caption, ratio=2, crop=None):
    raw = file.read_bytes()
    image = Image.open(io.BytesIO(raw))
    if crop:
        image = image.crop(crop)
        encoded = io.BytesIO()
        image.save(encoded, format='PNG')
        raw = encoded.getvalue()
    pins.append(dict(source=str(file), sourceSha256=hashlib.sha256(file.read_bytes()).hexdigest(),
                     embeddedSha256=hashlib.sha256(raw).hexdigest(), size=image.size, crop=crop,
                     displayWidth=image.width / ratio, resampled=False))
    uri = 'data:image/png;base64,' + base64.b64encode(raw).decode()
    return f'<figure><figcaption>{html.escape(caption)}</figcaption><img style="width:calc({image.width / ratio}px * var(--zoom))" src="{uri}" alt="{html.escape(caption)}"></figure>'


native = base / 'desktop-input-ui/yr-4x'
if not native.exists():
    native = base / 'native-v4/yr-4x'
default = base / 'desktop-default'
old = base / 'baseline-native-v5/clock-opacity-0.5.png'
size = Image.open(old).size
crop = (round(size[0] * .904), round(size[1] * .25), round(size[0] * .99), round(size[1] * .385))
sections = ['<section><h2>Recharge mask and ready lettering</h2><p>The clock remains 50% transparent. Its existing shape is a neutral dark shade. Ready and held labels use the same size with a narrow dark outline. Captures below are native pixels; the earlier and current fixtures use separate charge states.</p><div class="row">',
            figure(old, 'Previous colored mask', crop=crop), figure(native / 'clock-0.6.png', 'Current mask and outlined ready label'), '</div>',
            '<details><summary>Other native recharge phases</summary><div class="row">']
sections.extend(figure(native / f'clock-{phase}.png', f'Charge phase {phase}') for phase in [.15, .35, .85])
sections += ['</div></details></section>', '<section><h2>Result backgrounds</h2><p>Accepted R5 lettering is unchanged. The complete background now remains visible when world HD is off. Under UI budget pressure the application selects the accepted 2X background; releasing that pressure restores 4X.</p><div class="row">',
             figure(native / 'result-hd.png', 'HD enabled'), figure(native / 'result-original.png', 'World HD disabled'),
             '</div><details><summary>Budget fallback and recovery</summary><div class="row">',
             figure(native / 'result-busy-budget.png', 'Complete 2X background under controlled budget pressure'),
             figure(native / 'result-restored.png', '4X restored after pressure release'), '</div></details></section>',
             '<section><h2>Persistent notice on the edition selector</h2><p>The previously accepted wording follows the language selector. The selector stays open until a game is chosen; shorter windows can scroll through the complete notice.</p>']
for language in ['zh-CN', 'zh-TW', 'en-US']:
    sections += [f'<details{ " open" if language == "zh-CN" else "" }><summary>{language}</summary>',
                 figure(default / f'notice-{language}.png', f'Complete notice: {language}'), '</details>']
sections += ['<details><summary>Full selector and short-window control</summary>',
             figure(default / 'selector-en-US.png', 'English selector'),
             figure(default / 'selector-short-window.png', 'Scrollable 768 x 600 selector', ratio=1), '</details></section>',
             '<section><h2>A-key controls</h2><table><tr><th>Input</th><th>Behavior</th></tr><tr><td>A, then click ground</td><td>Move toward that point and attack enemies along the route</td></tr><tr><td>A, then click an enemy unit or building</td><td>Attack the chosen target</td></tr><tr><td>Escape or right click while armed</td><td>Cancel the pending command</td></tr><tr><td>Ctrl + click</td><td>Existing force attack</td></tr></table><p>A replaces the inherited Alliance default. Custom A assignments and explicitly saved Attack Move keys are preserved; both commands remain configurable.</p></section>']
document = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M2.4 v0.2 corrections R1</title><style>
:root { color-scheme:dark; --zoom:1; font:18px/1.55 Arial,sans-serif; color:#eee; background:#191b20; }
body { max-width:1400px; margin:auto; padding:28px; } h1 { font-size:32px; } h2 { font-size:25px; }
section { margin:30px 0; padding:20px; background:#24272e; border:1px solid #555b65; border-radius:8px; }
.row { display:flex; flex-wrap:wrap; gap:28px; align-items:flex-start; } figure { margin:12px 0; max-width:100%; overflow:auto; }
figcaption { margin-bottom:10px; font-size:18px; color:#e2c980; } img { display:block; height:auto; max-width:100%; }
button { font:inherit; padding:7px 14px; margin:0 10px 8px 0; cursor:pointer; } summary { cursor:pointer; padding:8px 0; }
table { border-collapse:collapse; width:100%; } td,th { text-align:left; padding:10px; border:1px solid #606672; }
.status { color:#c8deb6; } @media(max-width:700px) { body { padding:12px; } section { padding:14px; } }
</style><h1>M2.4 v0.2 corrections R1</h1>
<p class="status">Mac technical checks passed. New presentation and physical-input acceptance remain open. Windows was not run.</p>
<p>Review only the recharge shade, status-label contrast, result-background visibility and persistent notice placement. Accepted map artwork, result lettering and notice wording need no repeat review. Every image is embedded.</p>
<button onclick="document.documentElement.style.setProperty('--zoom',1)">Game display size</button>
<button onclick="document.documentElement.style.setProperty('--zoom',2)">2x inspection</button>
'''
(output / 'M2.4-Post-Acceptance-R1-Embedded.html').write_text(document + '\n'.join(sections) + '</html>')
(output / 'Image-Inventory.json').write_text(json.dumps(dict(images=pins, count=len(pins), policy='Review-only native pixel crops; production artwork is unchanged.'), indent=2) + '\n')
print(json.dumps(dict(images=len(pins), htmlBytes=(output / 'M2.4-Post-Acceptance-R1-Embedded.html').stat().st_size)))
