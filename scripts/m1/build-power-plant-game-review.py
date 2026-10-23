"""Build a static review from measured local gameplay captures; no authored pixels change."""
import argparse
import base64
import html
import json
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser()
parser.add_argument('--output', default='.artifacts/m1-2/game-review-v1')
args = parser.parse_args()
root = Path('.artifacts/m1-2')
out = Path(args.output)
out.mkdir(parents=True, exist_ok=False)
hd = root / 'game-combined-v1'
original = root / 'game-original-v1'
blue = root / 'game-blue-occlusion-v1'
report = json.loads((hd / 'result.json').read_text())
control = json.loads((original / 'result.json').read_text())
assert report['status'] == control['status'] == 'PASS_BOUNDED_GAMEPLAY'
for key in ('tick', 'frame', 'body', 'hit', 'camera'):
    assert report['buildingScale'][1][key] == control['buildingScale'][1][key]
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 26)
small = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 21)
entries = []


def crop(path, box):
    image = Image.open(path).convert('RGB')
    ratio = image.width / 1920
    return image.crop(tuple(round(v * ratio) for v in box))


def board(name, title, panels, note, columns=2):
    width, height = 660, 740
    rows = (len(panels) + columns - 1) // columns
    image = Image.new('RGB', (columns * width, 100 + rows * height), '#111a25')
    draw = ImageDraw.Draw(image)
    draw.text((20, 14), title, font=font, fill='white')
    draw.multiline_text((20, 48), '\n'.join(textwrap.wrap(note, 112)), font=small, spacing=3, fill='#aebdce')
    for i, (label, source, box) in enumerate(panels):
        x, y = i % columns * width, 100 + i // columns * height
        draw.text((x + 16, y), label, font=font, fill='white')
        detail = crop(source, box).resize((660, 660), Image.Resampling.NEAREST)
        image.paste(detail, (x, y + 45))
    target = out / name
    image.save(target)
    entries.append({'file': name, 'sources': [str(p[1]) for p in panels], 'cropLogical': [p[2] for p in panels],
                    'displayDetail': '3x logical size, nearest-neighbor evidence magnification'})
    return target


box = (510, 350, 730, 570)
initial = (930, 350, 1150, 570)
comparison = board('original-vs-hd.png', 'Original art and accepted HD art / actual game', [
    ('Original GAPOWR + Conscript', original / 'building-same-frame-4k.png', box),
    ('4x authored GAPOWR + Conscript', hd / 'building-same-frame-4k.png', box)],
    'Separate fixed-seed matches; both 4K output; identical tick, building frame, geometry and camera.')
density = board('same-art-output-density.png', 'Same HD artwork / different output density', [
    ('1920 x 1080 drawing buffer', hd / 'building-same-frame-1080p.png', box),
    ('3840 x 2160 drawing buffer', hd / 'building-same-frame-4k.png', box)],
    'One synchronous game tick; equal 1920 x 1080 CSS viewport and hit coordinates; 3x detail.')
states = board('gameplay-states.png', 'Native game transitions / accepted HD family', [
    ('Construction / second plant', hd / 'construction-0.png', box),
    ('Normal / selected', hd / 'normal-selected.png', initial),
    ('Damaged / 41.33% health', hd / 'damaged.png', box),
    ('Repaired / 100% health', hd / 'repaired.png', box),
    ('Selling / reverse buildup', hd / 'selling.png', box),
    ('Destroyed / original shared effects', hd / 'destroyed.png', box)],
    'Normal production, attack, repair, sell and destruction actions; screenshots are representative samples.')
colors = board('owner-colors.png', 'Owner colors / normal gameplay', [
    ('Red owner / selected', hd / 'normal-selected.png', initial),
    ('Blue owner / selected', blue / 'normal-selected.png', initial)],
    'Separate games; native owner remap regions and original shadow path retained.')
normal_crop = out / 'normal-size-scene.png'
crop(hd / 'building-same-frame-4k.png', (320, 320, 820, 660)).save(normal_crop)


def figure(path, caption, width=None):
    encoded = base64.b64encode(path.read_bytes()).decode()
    style = f' style="width:{width}px;max-width:100%"' if width else ''
    return f'<figure><img{style} src="data:image/png;base64,{encoded}" alt="{html.escape(caption)}"><figcaption>{html.escape(caption)}</figcaption></figure>'


body = '<h1>M1.2 GAPOWR / actual-game review</h1><p>Accepted artwork with the accepted HD Conscript. '
body += 'Local macOS Chrome evidence; this page works offline without JavaScript. '
body += 'Eight cross-faction Conscripts are explicitly spawned test fixtures; building production and combat rules are unchanged.</p>'
body += '<h2>Actual scene at native logical size</h2><p>The crop below is displayed at 500 CSS pixels, matching its 500-pixel region in the game viewport. '
body += 'The full screenshot scales to this page; open its PNG for the complete output.</p>'
body += figure(normal_crop, '500 x 340 logical scene; 1000 x 680 source pixels at 4K output.', 500)
body += figure(hd / 'building-same-frame-4k.png', 'Complete 3840 x 2160 drawing buffer; page overview is reduced.')
body += '<h2>Artwork comparison</h2>' + figure(comparison, 'Original vs authored pixels, both at 4K output. Detail crops are enlarged equally.')
body += '<h2>Output-density comparison</h2>' + figure(density, 'Same accepted art, same tick and camera; only drawing-buffer density changes.')
body += '<h2>State coverage</h2>' + figure(states, 'Representative native game transitions. Construction/sale timing is verified in the retained trace.')
body += '<h2>Owner colors and occlusion</h2>' + figure(colors, 'Red and blue owner remap in actual games.')
occlusion = json.loads((blue / 'result.json').read_text())
assert occlusion['status'].startswith('PASS')
probe = next(p for p in occlusion['occlusion'] if p['unobstructedBodyPixels'] > p['visibleBodyPixels'])
body += '<p>Actual-scene occlusion probe: '+str(probe['visibleBodyPixels'])+' visible Conscript pixels with GAPOWR present, '
body += str(probe['unobstructedBodyPixels'])+' with GAPOWR temporarily hidden at the same tick; visibility restored immediately. '
body += 'Conscript page 0/1 transitions and all live building page bindings passed.</p>'
body += figure(blue / f"occlusion-{occlusion['occlusion'].index(probe)+1}.png", 'Actual scene after the restored-visibility occlusion measurement.')
body += '<h2>Measured boundaries</h2><p>Combined HD pages: 69 MiB at 4x, 24 MiB at 2x. '
body += 'Both full control runs pass native state transitions, all six rendering presets, 4K input and teardown. '
body += '4K at a 1280 x 960 logical viewport is 2880 x 2160, preserving aspect ratio. '
body += 'Windows, external monitors, manual play, long-duration combat and GPU recovery were not run. '
body += 'Generated fine-detail variation was disclosed and accepted during complete artwork review.</p>'
(out / 'review.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
    '<title>M1.2 GAPOWR gameplay review</title><style>body{max-width:1320px;margin:24px auto;padding:0 20px;background:#111a25;color:#eaf0f7;'
    'font:20px/1.5 system-ui}h1{font-size:38px}h2{font-size:28px;margin-top:44px}figure{margin:24px 0}img{display:block;width:100%;height:auto}'
    'figcaption{font-size:17px;color:#aebdce;margin-top:8px}</style>'+body+'</html>')
(out / 'review-evidence.json').write_text(json.dumps({'status': 'GENERATED_FROM_GAMEPLAY', 'entries': entries,
    'sameTick': report['buildingScale'][0]['tick'], 'logicalViewport': [1920, 1080]}, indent=2)+'\n')
print(out)
