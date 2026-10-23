"""Build a local, non-runtime comparison for six authorized sample exports."""
import argparse
import hashlib
import html
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser()
parser.add_argument('export', type=Path)
parser.add_argument('--source', type=Path, default=Path('.artifacts/m1-1/conscript-source.json'))
args = parser.parse_args()
report = json.loads((args.export / 'review-export.json').read_text())
source = json.loads(args.source.read_text())
density = report['density']
assert report['activationAllowed'] is False and len(report['frames']) == 6
font_path = '/System/Library/Fonts/Supplemental/Arial.ttf'
font = ImageFont.truetype(font_path, 22)
small = ImageFont.truetype(font_path, 17)
board = Image.new('RGB', (1120, 1140), '#192128')
draw = ImageDraw.Draw(board)
draw.text((24, 15), 'CONSCRIPT / SIX-FRAME EXTRACTION REVIEW', font=font, fill='white')
draw.text((24, 49), 'Review only. Full artwork and gameplay acceptance remain open.', font=small, fill='#bac8d2')
columns = [(120, 'Original / 4x'), (340, 'Authored / 4x'), (560, 'Blue remap / 4x'),
           (780, 'Light / 4x'), (1000, 'Native / 1x')]
for x, label in columns:
    draw.text((x, 83), label, font=small, fill='white')
checks = []
rows = []
for n, item in enumerate(report['frames']):
    frame = source['frames'][item['nativeFrame']]
    base = Image.open(args.export / item['files']['base']['file']).convert('RGBA')
    data = Image.open(args.export / item['files']['data']['file']).convert('RGBA')
    original = Image.new('RGBA', (frame['width'], frame['height']))
    original.putdata([(*source['palette'][index], 255) if index else (0, 0, 0, 0)
                      for index in frame['pixels']])
    blue = base.copy()
    for y in range(base.height):
        for x in range(base.width):
            r, g, b, a = base.getpixel((x, y))
            mask, shade, reserved, data_alpha = data.getpixel((x, y))
            assert mask in (0, 255) and 0 <= shade <= 15 and reserved == 0 and data_alpha == 255
            inside = x < frame['width'] * density and y < frame['height'] * density
            original_index = frame['pixels'][(y // density) * frame['width'] + x // density] if inside else 0
            assert not a or original_index, 'Alpha must stay inside original coverage.'
            assert not mask or a, 'Remap must stay inside authored alpha.'
            band = item.get('remapBandYAtDensity', item.get('remapBandYAt2x'))
            in_band = band[0] <= y < band[1]
            assert not (in_band and a and r > 40 and r > 1.5 * g and r > 1.3 * b) or mask
            if mask:
                # Same integer factor formula as Palette.remap, diagnostic owner RGB=(64,128,255).
                factor = source['palette'][16 + shade][0]
                blue.putpixel((x, y), (int(64 / 255 * factor), int(128 / 255 * factor), factor, a))
    blue_name = f'frame-{frame["nativeFrame"]:03d}-{density}x-blue-preview.png'
    blue.save(args.export / blue_name)
    canvases = []
    for sprite, sprite_density in [(original, 1), (base, density), (blue, density)]:
        canvas = Image.new('RGBA', (40 * sprite_density, 40 * sprite_density))
        canvas.alpha_composite(sprite, ((frame['x'] - 18) * sprite_density, (frame['y'] - 18) * sprite_density))
        canvases.append(canvas)
    y = 118 + n * 167
    action = 'FIRE' if frame['nativeFrame'] >= 164 else 'WALK' if frame['nativeFrame'] >= 8 else 'STAND'
    draw.text((18, y + 45), f'{action}\n{frame["nativeFrame"]:03d}', font=small, fill='white')
    for col, canvas in enumerate([canvases[0], canvases[1], canvases[2], canvases[1]]):
        bg = Image.new('RGB', (160, 160), '#c9d2da' if col == 3 else '#35413a')
        sprite = canvas.resize((160, 160), Image.Resampling.NEAREST)
        bg.paste(sprite, (0, 0), sprite)
        board.paste(bg, (columns[col][0], y))
    native = canvases[1].resize((40, 40), Image.Resampling.BOX)
    board.paste(native, (1020, y + 40), native)
    native.save(args.export / f'frame-{frame["nativeFrame"]:03d}-1x-preview.png')
    checks.append({'nativeFrame': frame['nativeFrame'], 'status': 'PASS_STRUCTURAL_ONLY',
                   'checks': ['original coverage and even padding', 'remap channels',
                              'red detection coverage', 'remap inside alpha'],
                   'sourceCoverageRetained': item['sourceCoverageRetained']})
    pictures = ''.join(f'<figure><figcaption>{label}</figcaption><img src="{html.escape(name)}"></figure>'
                       for name, label in [(item['files']['base']['file'], 'Authored'),
                                           (blue_name, 'Blue remap'),
                                           (item['files']['data']['file'], 'Remap data')])
    rows.append(f'<section><h2>{action} / {frame["nativeFrame"]:03d}</h2><div>{pictures}</div></section>')
board.save(args.export / 'comparison.png')
(args.export / 'validation.json').write_text(json.dumps({
    'status': 'PASS_STRUCTURAL_ONLY', 'frames': checks, 'artAcceptance': 'PENDING',
    'gameplayAcceptance': 'NOT_RUN', 'activationAllowed': False,
    'exportSha256': hashlib.sha256((args.export / 'review-export.json').read_bytes()).hexdigest()
}, indent=2) + '\n')
(args.export / 'review.html').write_text('''<!doctype html><html lang="en"><meta charset="utf-8">
<title>Conscript sample extraction review</title><style>
body{font:18px system-ui;background:#192128;color:#eee;margin:28px}h1{font-size:28px}
.controls{display:flex;gap:24px;align-items:center;margin:20px 0}main{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
section{background:#29313a;padding:16px}h2{font-size:20px}section>div{display:flex;gap:12px}
figure{margin:0;min-width:85px}figcaption{font-size:14px;margin-bottom:12px}
img{image-rendering:pixelated;background:repeating-conic-gradient(#bbb 0% 25%,#eee 0% 50%) 0/12px 12px;object-fit:contain}
a{color:#9dd5ff}p{max-width:1000px;line-height:1.5}</style>
<h1>Conscript / six-frame extraction review</h1>
<p>Approved v3 colors with deterministic matte removal and original coverage constraints.
Coverage differs from the original and some firing ammunition is clipped. This is a conversion review,
not complete artwork or gameplay acceptance. Blue uses the engine palette factor formula with diagnostic owner RGB (64,128,255).</p>
<div class="controls"><label>Display <select id="scale"><option value="1">Native display</option><option value="2">2x display zoom</option><option value="4" selected>4x display zoom</option></select></label>
<label>Background <select id="bg"><option value="checker">Checkerboard</option><option value="#35413a">Dark green</option><option value="#c9d2da">Light gray</option><option value="#7c367e">Purple</option></select></label>
<a href="comparison.png">Comparison sheet</a><a href="validation.json">Structural checks</a></div><main>'''
    + ''.join(rows) + '''</main><script>
const imgs=[...document.querySelectorAll('img')],scale=document.querySelector('#scale'),bg=document.querySelector('#bg');
function update(){for(const img of imgs){img.style.width=img.naturalWidth*Number(scale.value)/ASSET_DENSITY+'px';img.style.height=img.naturalHeight*Number(scale.value)/ASSET_DENSITY+'px';img.style.background=bg.value==='checker'?'':bg.value}}
for(const img of imgs)img.onload=update;scale.onchange=update;bg.onchange=update;update();
</script></html>\n'''.replace('ASSET_DENSITY', str(density)))
print(json.dumps({'status': 'PASS_STRUCTURAL_ONLY', 'frames': len(checks),
                  'review': str(args.export / 'review.html')}))
