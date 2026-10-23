"""Build a no-JavaScript, native CSS size review from unmodified WebGL captures."""
import base64
import hashlib
import json
from pathlib import Path
import sys
from PIL import Image

run, out = map(Path, sys.argv[1:3])
out.mkdir(parents=True, exist_ok=False)
report = json.loads((run / 'result.json').read_text())
assert report['status'] == 'DISPLAY_CONTRACT_PASS'
sections, images = [], []


def group(title, captures, labels, description):
    first = captures[0]
    # Cover both selected families and neighboring original artwork; identical CSS crop per group.
    bounds = [m['displayBounds'] for m in first['models']]
    cx = (min(b[0] for b in bounds) + max(b[2] for b in bounds)) / 2
    cy = (min(b[1] for b in bounds) + max(b[3] for b in bounds)) / 2
    x, y = max(0, round((cx - 330) / 3) * 3), max(0, round((cy - 225) / 3) * 3)
    rect = (x, y, x + 660, y + 450)
    index = len(sections)
    buttons, frames, fulls, css = [], [], [], []
    for i, (capture, label) in enumerate(zip(captures, labels)):
        file = capture['file']
        source = Image.open(run / file)
        ratio = source.width / capture['display'][2]
        crop = source.crop(tuple(round(v * ratio) for v in rect))
        name = file.replace('.png', '-crop.png')
        crop.save(out / name)
        (out / file).write_bytes((run / file).read_bytes())
        encoded = base64.b64encode((out / name).read_bytes()).decode()
        full = base64.b64encode((run / file).read_bytes()).decode()
        key = f'g{index}v{i}'
        buttons.append(f'<input type="radio" name="g{index}" id="{key}" {"checked" if i == 0 else ""}><label for="{key}">{label}</label>')
        frames.append(f'<figure class="v{i}"><img alt="{label}" src="data:image/png;base64,{encoded}" width="660" height="450"><figcaption>{label}: {crop.width} x {crop.height} pixels at 660 x 450 CSS pixels. <a href="{name}">PNG crop</a> · <a href="{file}">Full PNG</a></figcaption></figure>')
        css.append(f'#{key}:checked ~ .views .v{i} {{display:block}}')
        fulls.append(f'<figure><figcaption>{label} — full scene at 1920 x 1080 CSS pixels</figcaption><img alt="{label} full scene" src="data:image/png;base64,{full}" width="1920" height="1080"></figure>')
        images.append({'file': name, 'source': file, 'cropCssRect': rect, 'css': [660, 450],
                       'pixels': [crop.width, crop.height], 'pixelToCssRatio': ratio, 'tick': capture['tick'],
                       'sha256': hashlib.sha256((out / name).read_bytes()).hexdigest()})
    sections.append(f'<section><h2>{title}</h2><p>{description}</p><style>{"".join(css)}</style>{"".join(buttons)}<div class="views">{"".join(frames)}</div><details><summary>Full scenes: verify field of view and UI</summary><div class="fulls">{"".join(fulls)}</div></details></section>')


group('1. Sampling only', report['comparisons'], ['1080p', '1440p', 'High 2160'],
      'Same frozen simulation tick, frames, camera, lighting, owner and existing 4x artwork. Only output resolution changes. The full capture proves the fixed field of view.')
group('2. Existing artwork only', [report['artwork']['hd'], report['artwork']['original']], ['Existing HD', 'Original indexed art'],
      'Same tick and high output. Native indexed body builders temporarily replace existing HD bodies; all geometry, shadows and game state stay fixed. The HD full PNG restores exactly.')
group('3. Damaged building', [report['damaged']['hd'], report['damaged']['original']], ['Existing HD damaged', 'Original damaged'],
      'A separate damaged-state same-tick pair. This is a representative state check, not a complete animation recertification.')
group('4. Motion and combat', [report['walk'], report['fire']], ['Walking', 'Firing'],
      'Different gameplay ticks: representative animation regression only, not a controlled visual pair. Same camera and output policy; both use existing HD.')
html = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M1.4 display and existing HD review</title>
<style>body{margin:24px;background:#141820;color:#edf1f5;font:20px/1.45 system-ui}h1{font-size:32px}h2{font-size:26px}p{max-width:1000px}a{color:#87cfff}section{margin:28px 0;padding:18px;border:1px solid #596675}input{margin:0 6px 0 18px}label{cursor:pointer}.views{overflow:auto;margin-top:16px}.views figure{display:none;width:660px;margin:0}img{max-width:none;flex:none;display:block}.views img{width:660px;height:450px}figcaption{font-size:18px;white-space:normal}.fulls{overflow:auto}.fulls img{width:1920px;height:1080px}.fulls figure{margin:16px 0}summary{cursor:pointer;margin-top:16px}</style>
<h1>M1.4 — Display scale and existing HD artwork</h1><p><b>Visual review pending.</b> Start at 100% browser zoom. Crops always display at 660 x 450 CSS pixels; narrow windows scroll. No image is silently fitted to your window. Controls work without JavaScript or network requests. This review assumes the captured 1920 x 1080 CSS game area; use the playable build to assess your actual display size.</p>
<p>Review three things independently: overall unit/UI scale, Conscript appearance, and GAPOWR appearance. Higher sample count is not artwork approval. Original terrain, construction yard, shadows and retail effects remain. Cross-faction Conscripts are an explicitly diagnostic fixture; production rules are unchanged. Windows and physical panel/compositor output are unverified.</p>
<p>Playable scene: <code>cd /Users/Aone/RA2remaster/ra2-hd &amp;&amp; bun scripts/m1/play-display-review.mjs</code>. The isolated Chrome profile automatically creates both assets with 4x HD switches. Allow local resource loading and normal production to finish. Ctrl+C closes the task-owned browser and server. Use Options to switch Auto / 1080p / 1440p / High.</p>
''' + '\n'.join(sections) + '</html>'
(out / 'review.html').write_text(html)
(out / 'review-images.json').write_text(json.dumps(images, indent=2) + '\n')
print(out / 'review.html')
