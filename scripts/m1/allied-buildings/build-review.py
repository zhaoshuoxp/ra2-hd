"""Create an immutable offline representative review, not runtime family packs."""
import base64
import hashlib
import html
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path('.artifacts/allied-buildings')
OUT = ROOT / 'review-v1'
OUT.mkdir(exist_ok=False)
SOURCE = ROOT / 'source-v2'
inventory = json.loads((SOURCE / 'inventory.json').read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 21)
records = []


def uri(path):
    return 'data:image/png;base64,' + base64.b64encode(path.read_bytes()).decode()


def covered_box(image, threshold=64):
    a = np.array(image.getchannel('A'))
    y, x = np.where(a > threshold)
    if not len(x):
        raise ValueError('Empty source')
    return (int(x.min()), int(y.min()), int(x.max()) + 1, int(y.max()) + 1)


def row_for(identity, theater='TEMPERATE'):
    return next(r for r in inventory['matrix'] if r['edition'] == 'yr' and r['theater'] == theater and r['id'] == identity)


def native_reference(key):
    identity = key.split('-')[0]
    if identity in ['NASAM', 'GTGCAN']:
        p = ROOT / 'turret-references-v3' / identity / '0.png'
        a = np.array(Image.open(p).convert('RGBA'))
        rgb = a[:, :, :3].astype(float)
        # Remove the flat green fixture background and its green native shadow.
        green = (rgb[:, :, 1] > rgb[:, :, 0] * 1.12) & (rgb[:, :, 1] > rgb[:, :, 2] * 1.08)
        a[:, :, 3] = np.where(green, 0, 255)
        native = Image.fromarray(a).resize((200, 180), Image.Resampling.LANCZOS)
        return native, p, 'Native R6 single pose, downsampled from actual drawing-buffer capture; fixture background/shadow removed. Heading sweep remains unresolved.'
    theater = 'SNOW' if key.endswith('-SNOW') else 'TEMPERATE'
    p = ROOT / 'references-v1' / f'{identity}-{theater}' / 'normal.png'
    return Image.open(p).convert('RGBA'), p, 'Decoded native layers; isolated source comparison, not new-HD gameplay.'


for raw in sorted((ROOT / 'art-v1').glob('*/normal-raw.png')):
    key = raw.parent.name
    if key.endswith('-OPEN'):
        continue
    native, native_path, boundary = native_reference(key)
    image = Image.open(raw).convert('RGBA')
    raw_box = covered_box(image)
    image = image.crop(raw_box)
    native_box = covered_box(native)
    target_w, target_h = native_box[2] - native_box[0], native_box[3] - native_box[1]
    scale = min(target_w / image.width, target_h / image.height)
    width, height = round(image.width * scale * 2), round(image.height * scale * 2)
    candidate = Image.new('RGBA', (native.width * 2, native.height * 2))
    offset = (round((native_box[0] + (target_w - width / 2) / 2) * 2), round(native_box[3] * 2 - height))
    candidate.alpha_composite(image.resize((width, height), Image.Resampling.LANCZOS), offset)
    p_native, p_hd = OUT / f'{key}-original.png', OUT / f'{key}-candidate-2x.png'
    native.save(p_native)
    candidate.save(p_hd)
    records.append({'key': key, 'identity': key.split('-')[0], 'size': list(native.size),
        'native': p_native.name, 'candidate': p_hd.name, 'raw': str(raw), 'rawSha256': sha(raw),
        'nativeSource': str(native_path), 'nativeSourceSha256': sha(native_path),
        'rawCrop': raw_box, 'coverageThreshold': 64, 'nativeBox': native_box,
        'scale': scale, 'offset2x': offset, 'boundary': boundary,
        'candidateSha256': sha(p_hd), 'direction': 'PENDING', 'runtime': 'NOT_ACTIVATED'})

# A changed mechanical endpoint is a pose sample, never a fabricated motion loop.
raw = ROOT / 'art-v1/GACSPH-OPEN/normal-raw.png'
image = Image.open(raw).convert('RGBA')
image = image.crop(covered_box(image))
normal = next(r for r in records if r['key'] == 'GACSPH')
box = normal['nativeBox']
scale = min((box[2] - box[0]) / image.width, (box[3] - box[1]) / image.height)
size = (round(image.width * scale * 2), round(image.height * scale * 2))
opened = Image.new('RGBA', tuple(n * 2 for n in normal['size']))
opened.alpha_composite(image.resize(size, Image.Resampling.LANCZOS),
    (round((box[0] + (box[2] - box[0] - size[0] / 2) / 2) * 2), round(box[3] * 2 - size[1])))
opened.save(OUT / 'GACSPH-open-candidate-2x.png')

cards = []
for r in records:
    w, h = r['size']
    original, candidate = uri(OUT / r['native']), uri(OUT / r['candidate'])
    cards.append(f'''<article id="{r['key']}"><h2>{r['key']}</h2>
<p>{html.escape(row_for(r['identity'])['rules']['Name'])}</p>
<div class="pair"><figure><figcaption>Original · native canvas</figcaption><img width="{w}" height="{h}" src="{original}"></figure>
<figure><figcaption>Candidate · same logical size</figcaption><img width="{w}" height="{h}" src="{candidate}"></figure></div>
<details><summary>Enlarged inspection · 2× logical size</summary><div class="pair"><img width="{w*2}" height="{h*2}" src="{original}"><img width="{w*2}" height="{h*2}" src="{candidate}"></div></details>
<p class="boundary">{html.escape(r['boundary'])}</p></article>''')

w, h = normal['size']
mechanism = f'''<article><h2>Chronosphere opening · endpoint direction</h2>
<p>Native opening sequence below; candidate closed and open endpoints underneath. These are two authored poses, not validated animation. Fixed foundation registration and intermediate articulation remain production work.</p>
<img width="{w*3}" src="{uri(ROOT / 'references-v1/GACSPH-TEMPERATE/GACSPH_F-endpoints.png')}">
<div class="pair"><figure><figcaption>Candidate closed</figcaption><img width="{w}" height="{h}" src="{uri(OUT / normal['candidate'])}"></figure>
<figure><figcaption>Candidate open</figcaption><img width="{w}" height="{h}" src="{uri(OUT / 'GACSPH-open-candidate-2x.png')}"></figure></div></article>'''
links = ' · '.join(f'<a href="#{r["key"]}">{r["key"]}</a>' for r in records)
page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Allied Buildings — Representative Batch v1</title><style>
*{box-sizing:border-box}body{margin:0;background:#182329;color:#e6edef;font:18px/1.5 system-ui,sans-serif}main{max-width:1180px;margin:auto;padding:28px}h1{font-size:34px}h2{font-size:25px;margin:0 0 8px}a{color:#89ccea}article{margin:22px 0;padding:24px;background:#24343a;border:1px solid #52636a;border-radius:9px}figure{margin:0;display:flex;flex-direction:column;align-items:center}figcaption{margin-bottom:12px;color:#c5d5dc}.pair{display:flex;gap:32px;flex-wrap:wrap;align-items:flex-end;padding:20px;background:#34483d;overflow:auto}img{object-fit:contain;flex-shrink:0}details{margin-top:16px}summary{cursor:pointer}.boundary{font-size:15px;color:#aebfc7}.notice{padding:18px;border-left:5px solid #efb765;background:#34332b}nav{line-height:2;font-size:16px}li{margin:8px 0}
</style><main><h1>Allied building representatives</h1><p>Task A · main baseline 41d44aa · 19 new image families · two snow treatments · one opening endpoint.</p>
<div class="notice"><strong>REPRESENTATIVE_REVIEW_PENDING — no new runtime family is active.</strong><p>Review the material direction and proportions at native size. One batch decision may name exceptions. Existing accepted GAPOWR and Soviet artwork are retained; they are not approval questions here.</p></div>
<p>All images are embedded. Open this file directly; no server or network is needed. Native size means the source logical canvas at browser zoom 100%, with a 2× candidate texture. These are isolated source comparisons, not gameplay proof.</p><nav>'''+links+'''</nav>'''+''.join(cards)+mechanism+'''
<article><h2>Coverage and outstanding work</h2><ul><li>RA2: 20 rule identities; YR: 21. Total 186 edition/theater cells. GAAIRC and AMRADR share artwork while retaining their country gates.</li><li>Accepted temperate GAPOWR is unchanged. Snow and distinct construction coverage will be added without regenerating accepted art.</li><li>GAREFNL4 and GAGAP_A are declared but unresolved by native lookup. Keep these explicit until their actual native role is resolved.</li><li>NASAM and GTGCAN have native VXL/HVA dependencies. Their current art is one material pose; repeated-heading capture attempts failed and do not establish rotation coverage.</li><li>Complete construction/selling, damaged, functional and destruction mappings, owner masks, runtime activation, four combined smoke runs, mixed-world memory and final Mac build remain after the representative decision.</li><li>Snow samples establish direction only. Distinct snow silhouettes and member mappings still require complete compatible exports.</li></ul></article></main></html>'''
(OUT / 'Allied-Buildings-Representative-Review.html').write_text(page)
(OUT / 'review.json').write_text(json.dumps({'status': 'REPRESENTATIVE_REVIEW_PENDING', 'runtimeActivated': False,
    'records': records, 'mechanicalEndpoint': {'raw': str(raw), 'sha256': sha(raw), 'completeMotion': False},
    'htmlSha256': sha(OUT / 'Allied-Buildings-Representative-Review.html')}, indent=2) + '\n')

base = [r for r in records if '-SNOW' not in r['key']]
board = Image.new('RGB', (1500, ((len(base) + 2) // 3) * 260), '#24343a')
draw = ImageDraw.Draw(board)
for i, r in enumerate(base):
    x, y = i % 3 * 500, i // 3 * 260
    draw.text((x + 10, y + 8), r['key'] + '   Original / Candidate', fill='white', font=font)
    for column, field in enumerate(['native', 'candidate']):
        im = Image.open(OUT / r[field]).convert('RGBA').resize(tuple(r['size']), Image.Resampling.LANCZOS)
        board.paste(im, (x + 8 + column * 245, y + 42), im)
board.save(OUT / 'native-overview.png')
print(json.dumps({'normalFamilies': len(base), 'snowSamples': len(records) - len(base), 'htmlBytes': len(page), 'status': 'REPRESENTATIVE_REVIEW_PENDING'}))
