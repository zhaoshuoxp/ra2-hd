"""Build an embedded review from actual framebuffer crops; no artwork edits."""
import base64
import html
import io
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

source = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
output.mkdir(parents=True, exist_ok=True)
report = json.loads((source / 'result.json').read_text())
assert report['status'] == 'PASS_NATIVE_STATE_SCENARIOS'
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 24)
body = ['<!doctype html><html lang="en"><meta charset="utf-8">',
        '<title>Conscript native-state validation</title>',
        '<style>body{background:#151c24;color:#eef2f7;font:19px/1.5 system-ui;max-width:1100px;margin:32px auto;padding:0 20px}',
        'h1{font-size:34px}h2{font-size:26px}img,video{max-width:100%;height:auto}a{color:#98d4ff}figure{margin:28px 0}</style>',
        '<h1>Conscript HD: native-state validation</h1>',
        '<p>Actual 3840 × 2160 WebGL output; 900-high presentation. Paired images use the same tick, pose and camera. ',
        'Each crop retains framebuffer pixels at 1:1; labels are outside the image. No artwork was retouched.</p>',
        '<p>The fixture places actors on original MP23T4 terrain and advances native simulation ticks. ',
        'Movement, cloak powerups, parachute tasks, temporal attacks, damage and disposal use native code. ',
        'This is scripted acceptance, not an unassisted human playthrough.</p>']
video = source / 'scenarios.webm'
assert video.stat().st_size > 1000
body += ['<h2>Native simulation recording</h2>',
         '<p>A moving 768 × 432 crop of the 4K framebuffer, with a separate label strip. ',
         'Playback is accelerated; native tick numbers identify progression. Public death/parachute/chrono effects remain original assets.</p>',
         '<video controls preload="metadata" width="768" src="data:video/webm;base64,'
         + base64.b64encode(video.read_bytes()).decode() + '"></video>',
         '<h2>Same-state original / HD comparisons</h2>']
labels = []
for row in report['captures']:
    label = row['label']
    cx, cy = row['center']
    box = (round(cx)-192, round(cy)-180, round(cx)+192, round(cy)+108)
    board = Image.new('RGB', (768, 326), '#202833')
    draw = ImageDraw.Draw(board)
    for i, mode in enumerate(['original', 'hd']):
        image = Image.open(source / f'{label}-{mode}.png')
        assert image.size == (3840, 2160)
        board.paste(image.crop(box).convert('RGB'), (384*i, 38))
        draw.text((384*i+12, 5), mode.upper(), font=font, fill='white')
    board.save(output / f'{label}.png')
    encoded = io.BytesIO()
    board.save(encoded, format='PNG')
    body += [f'<figure><h3>{html.escape(label)}</h3><img width="768" alt="{html.escape(label)}" src="data:image/png;base64,'
             + base64.b64encode(encoded.getvalue()).decode() + '"></figure>']
    labels.append(label)
body += ['<h2>Measured results</h2><pre style="white-space:pre-wrap">',
         html.escape(json.dumps(report['checks'], indent=2)), '</pre>',
         '<p>Desktop packaging, Windows, all maps and every simultaneous effect combination are outside this bounded run.</p></html>']
(output / 'review.html').write_text('\n'.join(body))
(output / 'review-evidence.json').write_text(json.dumps({'status':'PASS_ARTIFACT_STRUCTURE',
    'source':str(source),'labels':labels,'videoBytes':video.stat().st_size,'pairedCropSize':[768,326]},indent=2)+'\n')
print(output / 'review.html')
