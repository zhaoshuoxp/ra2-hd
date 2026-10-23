"""Make a focused embedded review of the corrected airport numeral surfaces."""
import base64
import hashlib
import html
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path('scripts/m2/official-maps').resolve()))
from owner_review import compose_owner, frame_palette

ROOT = Path('.artifacts/m2-4/desert-airport-markings-r1-20261020')
GUIDE = Path('.artifacts/m2-4/desert-final-buildings-native-batch86-v1')
OUT = ROOT / 'review-v1'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
OUT.mkdir(exist_ok=False)
selection = read(ROOT / 'selection-v1.json')
current = read(Path('.local/environment-desert-selection.json'))
contract = read(GUIDE / 'contract.json')
source = next(s for s in read(GUIDE / 'source.json')['sources'] if s['member'] == 'cdairp.shp')
assert current == selection['candidate']
old_root = Path('.local/environment-packs') / selection['previousContract']['selectedPack']['revision']
new_root = Path('.local/environment-packs') / current['revision']
colors = {'red': [255, 0, 0], 'blue': [54, 95, 255], 'green': [0, 210, 76]}
images = []


def figure(file, label, density='any', view='new', color='any', role='SOURCE_ATLAS_PIXELS'):
    with Image.open(file) as picture:
        picture.load()
        size = list(picture.size)
    images.append(dict(**pin(file), size=size, density=density, view=view, color=color, role=role))
    data = 'data:image/png;base64,' + base64.b64encode(file.read_bytes()).decode()
    return (f'<figure data-density="{density}" data-view="{view}" data-color="{color}">'
        f'<figcaption>{html.escape(label)}</figcaption><img width="{size[0]}" height="{size[1]}" '
        f'alt="{html.escape(label)}" src="{data}"></figure>')


def picture(number, density, view, color, crop=True):
    frame = source['frames'][number]
    palette = frame_palette(GUIDE, source, contract['sources']['cdairp.shp'], number, colors[color])
    width, height = frame['size']
    if view == 'original':
        indices = np.fromfile(GUIDE / 'native' / frame['indexFile'], np.uint8).reshape(height, width)
        rgba = np.zeros((height, width, 4), np.uint8)
        rgba[..., :3], rgba[..., 3] = palette[indices], (indices != 0) * 255
        image = Image.fromarray(rgba).resize((width * density, height * density), Image.Resampling.NEAREST)
    else:
        root = old_root if view == 'before' else new_root
        entry, = [m for m in read(root / 'manifest.json')['families']['desert-caairp']['members'] if m['member'] == 'cdairp.shp']
        metadata = root / entry['path']
        variant, = [v for v in read(metadata)['variants'] if v['density'] == density]
        region, = [r for r in variant['frames'] if r['nativeFrame'] == number]
        x, y, w, h = region['contentRect']
        page = metadata.parent / str(density) / region['page']
        base = Image.open(page / 'base.png').convert('RGBA').crop((x, y, x + w, y + h))
        data = Image.open(page / 'data.png').convert('RGBA').crop((x, y, x + w, y + h))
        image = compose_owner(base, data, palette)
    if crop:
        image = image.crop(tuple(n * density for n in [12, 37, 45, 112]))
    background = Image.new('RGBA', image.size, (24, 31, 38, 255))
    background.alpha_composite(image)
    file = OUT / f'CAAIRP-{number}-{density}x-{view}-{color}-{"tower" if crop else "body"}.png'
    background.convert('RGB').save(file)
    return file


quick = []
for number, state in [(0, 'Normal'), (1, 'Damaged')]:
    figures = []
    for density in [2, 4]:
        for color in colors:
            for view, title in [('original', 'Original source guide'), ('before', 'Previous HD: rejected overlap'), ('new', 'Corrected HD')]:
                file = picture(number, density, view, color)
                figures.append(figure(file, f'{title} / {state} / {color} / {density}X', density, view, color,
                    'ORIGINAL_ENLARGED_REFERENCE_NOT_HD' if view == 'original' else 'EXACT_ATLAS_NATIVE_OWNER_EQUATION'))
    quick.append(f'<article><h2>{state} tower</h2><div class="comparisons">{"".join(figures)}</div></article>')
native = []
reports = []
for density in [2, 4]:
    folder = ROOT / f'native-{density}x-v{3 if density == 2 else 1}'
    report = read(folder / 'report.json')
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['selectedEnvironmentRevision'] == current['revision']
    assert report['environment']['density'] == density
    reports.append(pin(folder / 'report.json'))
    case, = report['newNativeTechnology']['cases']
    assert case['name'] == 'CAAIRP' and case['captureEngineerConsumed'] and case['repairEngineerConsumed']
    for key, label in [('neutralCapture', 'Neutral normal'), ('capturedCapture', 'Engineer captured normal'),
                       ('damagedCapture', 'Captured damaged'), ('repairedCapture', 'Engineer repaired')]:
        sample = case[key]
        assert sample['rescaled'] is False
        native.append(figure(folder / sample['file'], f'Actual Mac {density}X / {label} / unscaled framebuffer',
            density, 'new', role='ACTUAL_MAC_ORIGINAL_PLACEMENT_NATIVE_ACTIONS'))
full = []
for number, state in [(0, 'normal'), (1, 'damaged')]:
    for density in [2, 4]:
        file = picture(number, density, 'new', 'red', crop=False)
        full.append(figure(file, f'Corrected complete body / {state} / {density}X', density, 'new', 'red'))
body = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M2.4 Desert Airport Marking R1</title><style>
*{{box-sizing:border-box}}body{{font:18px/1.5 system-ui;margin:0;background:#10161c;color:#e6edf3}}
header,main{{max-width:1500px;margin:auto;padding:24px}}header{{position:sticky;top:0;background:#10161cf5;z-index:1}}
h1{{font-size:30px;margin:0 0 10px}}h2{{font-size:24px}}p{{max-width:1100px}}button{{font:inherit;padding:7px 15px;margin:3px;border-radius:7px;border:1px solid #6a7c8a;background:#243341;color:white;cursor:pointer}}
button[aria-pressed=true]{{background:#167154}}.controls{{display:flex;flex-wrap:wrap;gap:14px}}
.comparisons{{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start}}figure{{margin:0 0 20px;padding:14px;background:#18232d;border-radius:9px;max-width:100%;overflow:auto}}
figcaption{{margin-bottom:12px;font-size:18px;color:#c0d6e5}}img{{display:block;max-width:none}}[hidden]{{display:none!important}}details{{margin:26px 0}}summary{{font-size:22px;cursor:pointer}}
</style><header><h1>CAAIRP tower numerals · R1</h1><p>Review only the tower lettering on normal and damaged bodies. The original owner-color numerals remain authoritative; the displaced inscription and gray residue are removed. Other accepted airport artwork and batch 86 families do not need review.</p>
<div class="controls"><div data-control="density">Density: <button data-value="2">2X</button><button data-value="4">4X</button><button data-value="all">All</button></div>
<div data-control="view">View: <button data-value="all">Compare all</button><button data-value="new">Corrected</button></div>
<div data-control="color">Owner: <button data-value="red">Red</button><button data-value="blue">Blue</button><button data-value="green">Green</button></div></div></header>
<main>{''.join(quick)}<p>Tower crops and body sprites retain actual 2X/4X pixels. Original guides are explicitly enlarged low-resolution controls. Color variants use the runtime owner replacement equation, not new artwork or gameplay settings.</p>
<details><summary>Actual Mac capture, damage and repair</summary><div class="comparisons">{''.join(native)}</div></details>
<details><summary>Complete bodies, changed region in context</summary><div class="comparisons">{''.join(full)}</div></details>
<p>Technical scope: four density/frame pairs, exact owner data and alpha, unchanged unused slot/rubble/flag/radar/paving, and 93 other Desert families preserved. Mac 2X/4X checks pass. Visual decision pending for these tower markings only. Windows NOT_RUN. No per-batch game copy. M2.4 remains incomplete.</p></main>
<script>const state={{density:'4',view:'all',color:'red'}};function update(){{document.querySelectorAll('figure').forEach(f=>{{f.hidden=!['density','view','color'].every(k=>state[k]==='all'||f.dataset[k]==='any'||f.dataset[k]===state[k]);}});document.querySelectorAll('[data-control]').forEach(group=>group.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(state[group.dataset.control]===button.dataset.value))));}}document.querySelectorAll('[data-control] button').forEach(button=>button.addEventListener('click',()=>{{state[button.parentElement.dataset.control]=button.dataset.value;update();}}));update();</script></html>'''
file = OUT / 'M2.4-Desert-Airport-Marking-R1-Embedded.html'
file.write_text(body)
write = lambda p, v: p.write_text(json.dumps(v, indent=2) + '\n')
write(OUT / 'review-metadata-v1.json', dict(status='TECHNICAL_PASS_TOWER_MARKING_VISUAL_REVIEW_PENDING',
    html=pin(file), candidate=current, runtimeStage=pin(ROOT / 'active-stage-v1.json'),
    source=pin(GUIDE / 'source.json'), reports=reports, images=images,
    motherPrompts=pin(ROOT / 'imagegen-jobs-v1.json'), motherOutputs=pin(ROOT / 'mother-retention-v1.json'),
    inheritedAcceptance='Unchanged batch 86 material remains accepted. Only normal/damaged tower numeral surfaces are reopened.',
    browserInteractive='NOT_RUN_LOCAL_PROTOCOL_RESTRICTION_RETAINED', windows='NOT_RUN', m24Complete=False))
print(json.dumps(dict(html=pin(file), embeddedPngs=len(images))))
