"""Build one embedded review of nineteen unique newly authored NewUrban rubble states."""
import base64
import hashlib
import html
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path('scripts/m2/official-maps').resolve()))
from owner_review import compose_owner, frame_palette

ROOT = Path('.artifacts/m2-4/newurban-buildings-batch87-20261020')
GUIDE = Path('.artifacts/m2-4/newurban-building-rubble-native-batch87-v1')
ART = Path('.artifacts/m2-4/newurban-building-rubble-authoring-batch87-v1')
OUT = ROOT / 'review-v1'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
OUT.mkdir(exist_ok=False)
contract = read(GUIDE / 'contract.json')
sources = {s['member']: s for s in read(GUIDE / 'source.json')['sources']}
selected = read(Path('.local/environment-newurban-selection.json'))
pack = Path('.local/environment-packs') / selected['revision']
assert sha(pack / 'manifest.json') == selected['sha256']
entries = {e['member']: e for f in read(pack / 'manifest.json')['families'].values() for e in f['members']}
identities = {name: declaration['identities'][0] for name, declaration in contract['families'].items()}
names = [name for name in sources if name != 'cnnewy08.shp']
assert len(names) == 19
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 25)
images = []


def figure(file, title, density='any', view='new', role='AUTHORED_ATLAS_AT_ACTUAL_DENSITY'):
    with Image.open(file) as image:
        image.load()
        size = list(image.size)
    images.append(dict(**pin(file), size=size, density=density, view=view, role=role))
    data = 'data:image/png;base64,' + base64.b64encode(file.read_bytes()).decode()
    return (f'<figure data-density="{density}" data-view="{view}"><figcaption>{html.escape(title)}</figcaption>'
        f'<img src="{data}" width="{size[0]}" height="{size[1]}" alt="{html.escape(title)}"></figure>')


def source_picture(name, density, original):
    source, frame = sources[name], sources[name]['frames'][3]
    palette = frame_palette(GUIDE, source, contract['sources'][name], 3)
    width, height = frame['size']
    if original:
        indices = np.fromfile(GUIDE / 'native' / frame['indexFile'], np.uint8).reshape(height, width)
        rgba = np.zeros((height, width, 4), np.uint8)
        rgba[..., :3], rgba[..., 3] = palette[indices], (indices != 0) * 255
        image = Image.fromarray(rgba).resize((width * density, height * density), Image.Resampling.NEAREST)
    else:
        metadata = pack / entries[name]['path']
        variant, = [v for v in read(metadata)['variants'] if v['density'] == density]
        region, = [r for r in variant['frames'] if r['nativeFrame'] == 3]
        x, y, w, h = region['contentRect']
        folder = metadata.parent / str(density) / region['page']
        base = Image.open(folder / 'base.png').convert('RGBA').crop((x, y, x + w, y + h))
        data = Image.open(folder / 'data.png').convert('RGBA').crop((x, y, x + w, y + h))
        image = compose_owner(base, data, palette)
    background = Image.new('RGBA', image.size, (24, 31, 38, 255))
    background.alpha_composite(image)
    file = OUT / f'{name}-rubble-{density}x-{"original" if original else "hd"}.png'
    background.convert('RGB').save(file)
    return file


quick = Image.new('RGB', (2200, 5 * 290), '#111b24')
draw = ImageDraw.Draw(quick)
rows = []
for index, name in enumerate(names):
    identity = next(declaration['identities'][0] for declaration in contract['families'].values() if name in declaration['members'])
    figures = []
    for density in [2, 4]:
        for original in [True, False]:
            file = source_picture(name, density, original)
            figures.append(figure(file, f'{identity} / {"Original source guide" if original else "New HD"} / {density}X',
                density, 'original' if original else 'new',
                'ORIGINAL_ENLARGED_SOURCE_REFERENCE_NOT_HD' if original else 'AUTHORED_ATLAS_AT_ACTUAL_DENSITY'))
    image = Image.open(OUT / f'{name}-rubble-4x-hd.png').convert('RGB')
    image.thumbnail((400, 235), Image.Resampling.LANCZOS)
    left, top = (index % 5) * 440, (index // 5) * 290
    draw.text((left + 14, top + 10), identity, font=font, fill='white')
    quick.paste(image, (left + (440 - image.width) // 2, top + 48 + (235 - image.height) // 2))
    shared = ' This exact rubble is shared with CANEWY08 after original source/index/palette proof.' if name == 'cnnewy06.shp' else ''
    rows.append(f'<article id="{identity}"><h2>{identity} · rubble</h2><p>{html.escape(name)}.{shared}</p><div class="pair">{"".join(figures)}</div></article>')
quick_file = OUT / 'newurban-rubble-batch87-quick-summary.png'
quick.save(quick_file)
native = []
representatives = ['CANEWY20', 'CANEWY15', 'CAWASH08', 'CACHIG02']
native_reports = []
for density in [2, 4]:
    folder = ROOT / f'native-manhattan-{density}x-v1'
    report = read(folder / 'report.json')
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    native_reports.append(pin(folder / 'report.json'))
    for identity in representatives:
        row, = [row for row in report['newNativeStates']['buildings'] if row['normal']['name'] == identity]
        capture = row['rubbleCapture']
        assert capture['rescaled'] is False and row['destroyed']['rubble']['visible']
        native.append(figure(folder / capture['file'], f'{identity} / actual Mac {density}X / native destruction / unscaled',
            density, 'new', 'ACTUAL_MAC_NATIVE_DESTRUCTION_UNSCALED_FRAMEBUFFER_CROP'))
    folder = ROOT / f'native-original-rubble-{density}x-v1'
    report = read(folder / 'report.json')
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES'
    native_reports.append(pin(folder / 'report.json'))
    for row in report['originalRubble']:
        native.append(figure(folder / row['capture']['file'], f'{row["name"]} / actual Mac {density}X / original map starts as rubble / unscaled',
            density, 'new', 'ACTUAL_MAC_ORIGINAL_DESTROYED_MAP_PLACEMENT_UNSCALED_FRAMEBUFFER_CROP'))
quick_figure = figure(quick_file, 'All 19 unique new rubble studies · fitted thumbnails', role='FITTED_QUICK_SUMMARY_NOT_NATIVE_DISPLAY_SCALE')
body = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M2.4 NewUrban Buildings Batch 87</title><style>*{{box-sizing:border-box}}body{{margin:0;background:#10161c;color:#e6edf3;font:18px/1.5 system-ui}}header,main{{max-width:1600px;margin:auto;padding:24px}}header{{position:sticky;top:0;background:#10161cf5;z-index:1}}h1{{font-size:30px;margin:0 0 8px}}h2{{font-size:24px}}p{{max-width:1300px}}button{{font:inherit;background:#243341;color:white;border:1px solid #647786;border-radius:7px;padding:7px 15px;margin:3px;cursor:pointer}}button[aria-pressed=true]{{background:#167154}}.controls{{display:flex;flex-wrap:wrap;gap:16px}}figure{{margin:0;padding:12px;background:#18232d;border-radius:8px;max-width:100%;overflow:auto}}figcaption{{font-size:18px;margin-bottom:12px}}img{{display:block;max-width:none}}.pair,.native{{display:flex;flex-wrap:wrap;align-items:flex-start;gap:16px;margin-bottom:28px}}article{{margin:28px 0}}[hidden]{{display:none!important}}.summary img{{max-width:100%;height:auto}}summary{{font-size:22px;cursor:pointer}}details{{margin:30px 0}}</style>
<header><h1>NewUrban · Batch 87 · 19 unique rubble studies</h1><p>Review only the newly drawn rubble below. The batch completes 20 building families and adds 4 exact accepted full reuses. Sixty normal/damaged/occupied body states, three benches, the V3 rack, and the accepted Desert airport lettering do not need review.</p>
<div class="controls"><div data-control="density">Density: <button data-value="2">2X</button><button data-value="4">4X</button><button data-value="all">All</button></div><div data-control="view">View: <button data-value="all">Compare all</button><button data-value="new">New HD</button></div></div></header>
<main><section class="summary">{quick_figure}</section><p>The summary uses fitted thumbnails. Individual comparisons below retain actual 2X/4X atlas pixels; Original guides are labeled low-resolution controls. The original geometry, source indices, source colors, shadow dependencies and rubble placement remain unchanged.</p>
{''.join(rows)}<details><summary>Actual Mac display · representative native destruction and original map rubble</summary><div class="native">{''.join(native)}</div></details>
<p>CANEWY10 and CANEWY11 start destroyed on the unchanged Manhattan map. Their original rubble placements are observed directly; no intact map placement or artificial source state is introduced. Exact accepted body states and the normal native limits remain preserved.</p>
<p>Technical: 24 complete families, 172 density frames, 132 exact accepted frame reuses, 19 new material studies and one source-identical shared rubble pair. Mac native states, Original fallback, cross-environment release, static source/atlas checks and fixed budgets are verified separately from visual acceptance. Windows NOT_RUN. Desktop contains review files only. M2.4 remains incomplete.</p></main>
<script>const state={{density:'2',view:'all'}};function update(){{document.querySelectorAll('figure').forEach(f=>{{f.hidden=!['density','view'].every(k=>f.dataset[k]==='any'||state[k]==='all'||f.dataset[k]===state[k]);}});document.querySelectorAll('[data-control]').forEach(group=>group.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(state[group.dataset.control]===button.dataset.value))));}}document.querySelectorAll('[data-control] button').forEach(button=>button.addEventListener('click',()=>{{state[button.parentElement.dataset.control]=button.dataset.value;update();}}));update();</script></html>'''
file = OUT / 'M2.4-NewUrban-Buildings-Batch87-Embedded.html'
file.write_text(body)
metadata = dict(status='BATCH87_NEW_RUBBLE_VISUAL_REVIEW_PENDING', html=pin(file), images=images,
    candidate=selected, runtimeStage=pin(ROOT / 'active-stage-v1.json'), sourceGuide=pin(GUIDE / 'source.json'),
    sourceContract=pin(GUIDE / 'contract.json'), uniqueNewRubbleStudies=19, completeFamilies=24,
    sourceMembers=24, sourceBodySlots=86, densityFrames=172, acceptedDensityFramesReused=132,
    nativeReports=native_reports, nativeScope='Original map bindings and legal native state fixtures; no natural-match claim.',
    prompts=pin(ART / 'imagegen-jobs-v2.json'), mothers=pin(ART / 'mother-source-verification-v1.json'),
    userReviewScope='Only nineteen new rubble studies. All accepted bodies, whole-family reuses and Desert airport lettering remain accepted.',
    browserInteractive='NOT_RUN_LOCAL_PROTOCOL_RESTRICTION_RETAINED', windows='NOT_RUN', m24Complete=False)
with (OUT / 'review-metadata-v1.json').open('x') as stream:
    stream.write(json.dumps(metadata, indent=2) + '\n')
print(json.dumps(dict(html=pin(file), embeddedPngs=len(images), uniqueNewRubbleStudies=19)))
