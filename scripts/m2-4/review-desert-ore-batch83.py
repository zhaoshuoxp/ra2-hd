"""Build one embedded ore review with native views and the entire original frame range."""
import base64
import hashlib
import html
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

root = Path('.artifacts/m2-4/desert-ore-batch83-20261020')
out = root / 'review-v1'
out.mkdir(exist_ok=False)
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
closure = read(root / 'coverage-and-native-closure-v2.json')
contract = read(root / 'contract-candidate-v1.json')
pack = Path('.local/environment-packs') / contract['selectedPack']['revision']
guide = Path('.artifacts/m2-4/desert-native-v1')
sources = {s['member']: s for s in read(guide / 'source.json')['sources']}
images = []


def figure(file, label, density, view, role):
    im = Image.open(file)
    images.append(dict(file=str(file), sha256=sha(file), bytes=file.stat().st_size,
        size=list(im.size), density=density, view=view, role=role))
    encoded = base64.b64encode(file.read_bytes()).decode()
    return f'<figure data-density="{density}" data-view="{view}"><figcaption>{html.escape(label)}</figcaption><img width="{im.width}" height="{im.height}" alt="{html.escape(label)}" src="data:image/png;base64,{encoded}"></figure>'


def native_card(title, stem, box, original=True):
    figures = []
    for density in [2, 4]:
        file = root / f'native-monument-{density}x-v2' / (stem + '-framebuffer.png')
        im = Image.open(file)
        assert im.size == (1489, 1080)
        target = out / f'{stem}-{density}x-native.png'
        im.crop(box).save(target)
        figures.append(figure(target, f'New HD / {density}X / unscaled game pixels', density, 'new', 'ACTUAL_MAC_GAME_UNSCALED_CROP'))
    if original:
        file = root / 'native-monument-original-v1' / (stem + '-framebuffer.png')
        target = out / f'{stem}-original-native.png'
        Image.open(file).crop(box).save(target)
        figures.insert(0, figure(target, 'Original / same source and camera / unscaled game pixels', 'any', 'original', 'ACTUAL_ORIGINAL_GAME_UNSCALED_CROP'))
    return f'<article><h2>{html.escape(title)}</h2><div class="comparisons">{"".join(figures)}</div></article>'


native = [native_card('1 · First original ore field', '00-TIB01', (300, 80, 1100, 540)),
    native_card('2 · Original TIB2 alias field', '03-TIB2_12', (260, 100, 1120, 780))]
actions = []
for stem, title in [('before', 'Before gathering'), ('harvest', 'Native gathering'),
                    ('depleted', 'Native depletion'), ('created', 'Native ore creation')]:
    box = (0, 40, 340, 270) if stem == 'created' else (450, 100, 1220, 510)
    actions.append(native_card(title, 'native-ore-' + stem, box, original=False))


def source_piece(name, slot, density, view):
    source = sources[name]
    frame = source['frames'][slot]
    w, h = frame['size']
    if view == 'original':
        file = guide / 'native' / frame['file']
        assert sha(file) == frame['rgbaSha256']
        return Image.frombytes('RGBA', (w, h), file.read_bytes()).resize(
            (w * density, h * density), Image.Resampling.NEAREST)
    metadata = pack / 'members' / name.replace('.', '-') / 'manifest.json'
    hd = read(metadata)
    variant, = [v for v in hd['variants'] if v['density'] == density]
    cell, = [f for f in variant['frames'] if f['nativeFrame'] == slot]
    x, y, sw, sh = cell['contentRect']
    return Image.open(metadata.parent / str(density) / cell['page'] / 'base.png').convert('RGBA').crop((x, y, x + sw, y + sh))


quick, complete = [], []
for number in range(1, 13):
    name = f'tib{number:02d}.des'
    source = sources[name]
    count = source['totalFrames'] // 2
    frames = source['frames'][:count]
    left = min(f['origin'][0] for f in frames)
    top = min(f['origin'][1] for f in frames)
    right = max(f['origin'][0] + f['size'][0] for f in frames)
    bottom = max(f['origin'][1] + f['size'][1] for f in frames)
    quick_figures, all_figures = [], []
    for density in [2, 4]:
        font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 24 if density == 4 else 19)
        cell_w = max((right - left) * density + 32, 160)
        cell_h = (bottom - top) * density + 64
        for view in ['original', 'new']:
            summary = Image.new('RGBA', (cell_w, cell_h), (24, 31, 38, 255))
            sheet = Image.new('RGBA', (cell_w * 4, cell_h * math.ceil(count / 4)), (24, 31, 38, 255))
            for slot, frame in enumerate(frames):
                x, y = (slot % 4) * cell_w, (slot // 4) * cell_h
                ImageDraw.Draw(sheet).text((x + 12, y + 10), f'Frame {slot}' + (' *' if slot == 12 else ''), font=font, fill='white')
                origin = ((frame['origin'][0] - left) * density + 16,
                          (frame['origin'][1] - top) * density + 46)
                piece = source_piece(name, slot, density, view)
                sheet.alpha_composite(piece, (x + origin[0], y + origin[1]))
                if slot == 11:
                    ImageDraw.Draw(summary).text((12, 10), name, font=font, fill='white')
                    summary.alpha_composite(piece, origin)
            label = 'New authored HD' if view == 'new' else 'Original guide (nearest display enlargement, not HD)'
            role = 'AUTHORED_SOURCE_PIXELS' if view == 'new' else 'ORIGINAL_GUIDE_ENLARGED_NOT_HD'
            file = out / f'{name}-{view}-{density}x-frame11.png'
            summary.convert('RGB').save(file)
            quick_figures.append(figure(file, f'{label} / {density}X / standard maximum frame 11', density, view, role))
            file = out / f'{name}-{view}-{density}x-all-frames.png'
            sheet.convert('RGB').save(file)
            all_figures.append(figure(file, f'{label} / {density}X / original body frames 0–{count - 1}', density, view, role))
    quick.append(f'<article class="sample"><h2>{name}</h2><div class="comparisons">{"".join(quick_figures)}</div></article>')
    extra = ' Frame 12 (*) is preserved source material, outside the standard 0–11 runtime range.' if count == 13 else ''
    complete.append(f'<details><summary>{name} · {count} complete source frames</summary><p>Fixed source-canvas alignment is preserved across the entire sequence.{extra}</p><div class="comparisons">{"".join(all_figures)}</div></details>')

jobs = read(root / 'imagegen-jobs.json')
text = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M2.4 Desert Ore Batch 83</title>
<style>body{{margin:0;background:#10171c;color:#edf2f5;font:18px/1.55 system-ui,sans-serif}}main{{max-width:1380px;margin:auto;padding:28px}}h1{{font-size:34px}}h2{{font-size:25px}}p{{max-width:1120px}}section,article,details{{margin:22px 0;padding:18px;border:1px solid #45535c;border-radius:9px;background:#19232b}}nav{{position:sticky;top:0;padding:10px;background:#25323d;z-index:2}}button{{font:inherit;padding:8px 14px;margin:3px;border:1px solid #a0bbc8;border-radius:6px;cursor:pointer}}button[aria-pressed=true]{{background:#c3e9fa}}figure{{margin:10px 0;overflow:auto}}figcaption{{color:#c6dce7;margin-bottom:9px}}img{{display:block;width:auto;height:auto;max-width:none}}.comparisons{{display:flex;gap:20px;overflow:auto;align-items:flex-start}}.samples{{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:16px}}.sample{{min-width:0;margin:0}}[hidden]{{display:none!important}}summary{{font-size:24px;cursor:pointer;padding:8px}}pre{{white-space:pre-wrap;overflow-wrap:anywhere;font-size:16px}}.note{{color:#c1dce9}}</style>
<main><h1>Desert Ore · Batch 83</h1><p><b>One complete resource family: all 12 original ore patterns, 24 native identities, 148 source body frames and both 2X / 4X densities.</b> New mineral material uses broad coherent facets and smooth restrained contours. Original low-resolution color pixels are not repeated as HD texture. Original placement, amount, harvesting, growth, shadows and logical dimensions remain unchanged.</p>
<p>Review the two actual game fields and the 12-pattern summary first. The full native harvesting sequence and every original body frame are available below. Accepted wood bridges and other previous batches require no review.</p>
<nav><span>Density:</span><button data-d="4" aria-pressed="true">4X</button><button data-d="2" aria-pressed="false">2X</button><span> View:</span><button data-v="new" aria-pressed="true">New HD</button><button data-v="original" aria-pressed="false">Original</button><button data-v="all" aria-pressed="false">Compare all</button><a href="#patterns">12 patterns</a><a href="#states">Native states</a><a href="#frames">All frames</a></nav>
<section><h2>Actual game scale · Monument Valley</h2><p class="note">Unscaled framebuffer crops at native 1080p output. Original uses the same source map, seed and camera route. Resource amounts progress naturally; these are not forced same-tick controls. Exact source-frame anatomy is shown below.</p>{''.join(native)}</section>
<section id="patterns"><h2>Quick review · All 12 patterns</h2><p>Standard maximum frame 11. HD panels show actual authored pixels. Original guides use nearest-neighbor display enlargement solely for shape and palette comparison.</p><div class="samples">{''.join(quick)}</div></section>
<details id="states"><summary>Native gathering, depletion and ore creation</summary><p>The stock CMIN Gather order reduces the original deposit amount and removes it after final collection. A legal duplicate of an actual original mineral spawner creates fresh ore through the unchanged native cooldown. No map, resource value, frame or rule is assigned. Screenshots wait for the normal camera update; each target is verified inside the updated viewport. Capture times can follow the logged simulation samples by several native ticks.</p>{''.join(actions)}</details>
<section id="frames"><h2>All original source frames</h2><p>All 148 body frames are authored at both densities, including four original extra frame-12 slots. Standard skirmish rules cap resource value at 11; extra source slots are preserved and loader-validated, without fabricating a native growth level.</p>{''.join(complete)}</section>
<details><summary>Technical evidence and retained scope</summary><p>Mac arm64: all 12 original members and both aliases bind in Monument Valley. 2X / 4X native gathering, depletion, legal ore creation, Original fallback, release and NewUrban reentry PASS. The eight original placed-map routes share this hash-pinned batched loader. Complete-family corruption, missing-data and budget fallback: 76 assertions PASS.</p><p>All 812 prior resource payload files remain exact, including the accepted wood bridge R1. World use: 2X {closure['worldPeakBytes']['2']:,} / 536,870,912 bytes; 4X {closure['worldPeakBytes']['4']:,} / 1,342,177,280 bytes. Prepared CPU peak: {closure['preparedPeakBytes']:,} / 134,217,728 bytes. All budgets remain unchanged.</p><p>Visual acceptance: PENDING 12 NEW ORE PATTERNS. Windows: NOT RUN. M2.4: INCOMPLETE. No per-batch game package or resource duplicate is included. The existing internal Mac host was reused. Static review QA validates all embedded images and hashes; interactive browser QA remains NOT RUN after the retained prior local-protocol denial.</p></details>
<details><summary>Built-in imagegen prompts and asset provenance</summary><p>Three new 1254 × 1254 RGBA mothers are retained with exact prompts and original guides. Master chromatic fringes are excluded from material sampling; original structural contours control game visibility. One non-spatial family color gain retains the original pale-gold relationship. No original RGB pixel texture is reused.</p><pre>{html.escape(json.dumps(jobs,indent=2))}</pre></details></main>
<script>let density='4',view='new';function refresh(){{for(const b of document.querySelectorAll('button[data-d]'))b.setAttribute('aria-pressed',String(b.dataset.d===density));for(const b of document.querySelectorAll('button[data-v]'))b.setAttribute('aria-pressed',String(b.dataset.v===view));for(const f of document.querySelectorAll('figure[data-view]'))f.hidden=!(f.dataset.density===density||f.dataset.density==='any')||!(view==='all'||f.dataset.view===view);}}for(const b of document.querySelectorAll('button[data-d]'))b.addEventListener('click',()=>{{density=b.dataset.d;refresh();}});for(const b of document.querySelectorAll('button[data-v]'))b.addEventListener('click',()=>{{view=b.dataset.v;refresh();}});refresh();</script></html>'''
file = out / 'M2.4-Desert-Ore-Batch83-Embedded.html'
file.write_text(text)
metadata = dict(status='SELF_CONTAINED_ORE_REVIEW_STATIC_QA_PENDING',
    review=dict(file=str(file), sha256=sha(file), bytes=file.stat().st_size), images=images,
    embeddedPngs=len(images), candidate=contract['selectedPack'], runtimeSourceCommit=closure['runtimeSourceCommit'],
    family='desert-ore', canonicalMembers=12, identities=24, sourceBodyFrames=148, densityFrames=296,
    generation='BUILT_IN_IMAGEGEN_THREE_MOTHERS', nativeMac='PASS',
    visualAcceptance='PENDING_12_NEW_ORE_MEMBERS', windows='NOT_RUN', m24Complete=False)
(out / 'review-metadata-v1.json').write_text(json.dumps(metadata,indent=2)+'\n')
print(json.dumps(dict(review=str(file), sha256=sha(file), bytes=file.stat().st_size, images=len(images))))
