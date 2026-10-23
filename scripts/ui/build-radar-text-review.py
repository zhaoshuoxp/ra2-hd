"""Embed native radar and label captures for the bounded user correction."""
from pathlib import Path
from PIL import Image
import base64
import hashlib
import html
import io
import json

root = Path(__file__).resolve().parents[2]
art = root / '.artifacts/menu-ui'
old = art / 'runtime-screens-v7'
new = art / 'runtime-radar-text-v3'
out = art / 'feedback-radar-text-v1'
out.mkdir(exist_ok=True)


def picture(source, caption, width):
    buffer = io.BytesIO()
    if isinstance(source, Image.Image):
        source.save(buffer, format='PNG')
        data = buffer.getvalue()
    else:
        data = source.read_bytes()
    encoded = base64.b64encode(data).decode()
    return (f'<figure><figcaption>{html.escape(caption)}</figcaption>'
            f'<img alt="{html.escape(caption)}" style="width:calc({width}px * var(--scale))" '
            f'src="data:image/png;base64,{encoded}"></figure>')


parts = ['''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Radar black field and regular labels</title><style>
:root{--scale:1;color-scheme:dark;font:18px Arial,sans-serif;background:#202226;color:#eee}
body{margin:28px}h1{font-size:30px}h2{font-size:24px;margin-top:32px}
.row{display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start}figure{margin:0}
figcaption{font-size:16px;margin:8px 0;max-width:320px}img{display:block;height:auto}
button{font:inherit;padding:8px 16px}p{max-width:1000px;line-height:1.5}
</style><h1>Radar black field and regular labels</h1>
<p>Other reviewed art is accepted and unchanged. This page shows only the terminal radar
correction and thinner live labels. All images are embedded. 1x uses the 900-high logical
presentation; 2x is an inspection enlargement, not a camera or game-size change.</p>
<button onclick="document.documentElement.style.setProperty('--scale',1)">1x UI size</button>
<button onclick="document.documentElement.style.setProperty('--scale',2)">2x inspection</button>''']
comparison = {}
for side in ['allied', 'soviet', 'yuri']:
    parts.append(f'<h2>{side.title()} radar — frame 32</h2><div class="row">')
    parts.append(picture(art / f'ui-originals/{side}-radar-32.png', 'Retail source', 168))
    parts.append(picture(old / f'{side}-radar-32.png', 'Previous HD', 168))
    parts.append(picture(new / f'{side}-radar-32.png', 'Corrected HD', 168))
    parts.append('</div>')
    changed = []
    for frame in range(33):
        a = Image.open(old / f'{side}-radar-{frame}.png').convert('RGBA')
        b = Image.open(new / f'{side}-radar-{frame}.png').convert('RGBA')
        if a.tobytes() != b.tobytes():
            changed.append(frame)
    assert all(frame == 32 for frame in changed), (side, changed)
    state = json.loads((new / f'{side}-states.json').read_text())
    terminal = next(f['terminalBlack'] for f in state['frames'] if f.get('terminalBlack'))
    assert terminal['nonBlack'] == terminal['nonOpaque'] == 0
    comparison[side] = {'changedFrames': changed, 'terminalBlack': terminal}
    parts.append('<p>Display: 246,400 opaque black pixels. Frames 0–31 match the previous HD capture exactly.</p>')

for preset in ['1080p', '4k']:
    parts.append(f'<h2>Live sidebar labels — {preset} drawing buffer</h2><div class="row">')
    for directory, caption in [(old, 'Previous: Medium + 0.75 outline'), (new, 'Corrected: Regular + 0.3 outline')]:
        im = Image.open(directory / f'sidebar-fixture-{preset}.png')
        scale = im.height / 900
        crop = im.crop((round(im.width - 168 * scale), round(225 * scale), im.width, round(535 * scale)))
        parts.append(picture(crop, caption, 168))
    parts.append('</div>')
parts.append('<h2>Native unit tooltip labels</h2><div class="row">')
for unit in ['E1', 'E2', 'HTNK']:
    p = new / f'unit-label-{unit}.png'
    parts.append(picture(p, unit + ' — regular font', Image.open(p).width))
parts.append('''</div><p>12 accepted HD cameos are complete; 104 additional build-menu references remain,
including alternate and unsupported/missing-source entries. Command icons, flags and other small
raster families also remain pending. This is a partial delivery, not full UI completion.</p></html>''')
page = out / 'review.html'
page.write_text('\n'.join(parts))
(out / 'verification.json').write_text(json.dumps({
    'status': 'PASS_TERMINAL_BLACK_AND_UNCHANGED_PRIOR_FRAMES',
    'runtime': str(new.relative_to(root)), 'radar': comparison,
    'reviewSha256': hashlib.sha256(page.read_bytes()).hexdigest(),
    'embeddedImages': 16,
}, indent=2) + '\n')
print(page)
