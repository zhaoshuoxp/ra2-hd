"""Build a self-contained review of four adapted ends and original-map context."""
import base64
import hashlib
import html
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

root = Path('.artifacts/m2-4/desert-low-bridge-batch82-20261019')
output = root / 'review-v2'
output.mkdir(exist_ok=False)
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
export = read(root / 'export-and-preservation-v2.json')
closure = read(root / 'coverage-and-native-closure-v2.json')
pack = Path('.local/environment-packs') / export['candidate']['revision']
guide_root = Path('.artifacts/m2-4/desert-native-v1')
sources = {s['member']: s for s in read(guide_root / 'source.json')['sources']}
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 24)
images, cards = [], []


def embed(file, label, role):
    im = Image.open(file)
    images.append(dict(file=str(file), sha256=sha(file), bytes=file.stat().st_size, size=list(im.size), label=label, role=role))
    return f'<img alt="{html.escape(label)}" width="{im.width}" height="{im.height}" src="data:image/png;base64,{base64.b64encode(file.read_bytes()).decode()}">'


def figure(file, label, mode, role):
    return f'<figure data-mode="{mode}"><figcaption>{html.escape(label)}</figcaption>{embed(file, label, role)}</figure>'


for name in export['newVisualMembers']:
    hd = read(pack / 'members' / name.replace('.', '-') / 'manifest.json')
    native = sources[name]
    slot, = [f['slot'] for f in native['frames'][:3] if not f['empty']]
    figures = []
    for density in [2, 4]:
        variant, = [v for v in hd['variants'] if v['density'] == density]
        frame = variant['frames'][slot]
        atlas = Image.open(pack / 'members' / name.replace('.', '-') / str(density) / frame['page'] / 'base.png').convert('RGBA')
        x, y, w, h = frame['contentRect']
        piece = atlas.crop((x, y, x + w, y + h))
        board = Image.new('RGBA', (w + 48, h + 100), (24, 30, 35, 255))
        board.alpha_composite(piece, (24, 70))
        ImageDraw.Draw(board).text((24, 20), f'{name} / {density}X / native frame {slot}', font=font, fill='white')
        file = output / f'{name}-{density}x-source.png'
        board.convert('RGB').save(file)
        figures.append(figure(file, f'{density}X authored pixels; no display enlargement', f'{density}x', 'AUTHORED_SOURCE_PIXELS'))
    frame = native['frames'][slot]
    file = guide_root / 'native' / frame['file']
    assert sha(file) == frame['rgbaSha256']
    w, h = frame['size']
    piece = Image.frombytes('RGBA', (w, h), file.read_bytes())
    board = Image.new('RGBA', (w * 4 + 48, h * 4 + 100), (24, 30, 35, 255))
    board.alpha_composite(piece.resize((w * 4, h * 4), Image.Resampling.NEAREST), (24, 70))
    ImageDraw.Draw(board).text((24, 20), f'{name} / Original guide (4x display)', font=font, fill='white')
    file = output / f'{name}-original-guide.png'
    board.convert('RGB').save(file)
    figures.insert(0, figure(file, 'Original source guide, nearest enlarged for shape comparison only', 'original', 'ORIGINAL_GUIDE_ENLARGED_NOT_HD'))
    cards.append(f'<article><h2>{name} · broken end, frame {slot}</h2><p>Accepted Temperate wood at unchanged canvas coordinates; Desert gaps and target contour retained. No owner-color area added. Other native slots remain empty.</p><div class="comparisons">{"".join(figures)}</div></article>')

crop_boxes = {
    'LOBRDG20': (300, 650, 870, 980), 'LOBRDG22': (300, 650, 870, 980),
    'LOBRDG24': (280, 330, 870, 650), 'LOBRDG26': (530, 320, 1130, 660),
}
contexts = []
for name, box in crop_boxes.items():
    figures = []
    for mode in ['original', '2x', '4x']:
        file = root / f'native-broken-ends-{mode}-v2' / f'{name}-framebuffer.png'
        original = Image.open(file)
        assert original.size == (1489, 1080)
        target = output / f'{name}-{mode}-native-crop.png'
        original.crop(box).save(target)
        figures.append(figure(target, f'{mode.upper()} · original-map demolition · framebuffer crop, 1:1 pixels', mode, 'ACTUAL_MAC_GAME_UNSCALED_CROP'))
    contexts.append(f'<article><h2>{name} · native bridge-end context</h2><p>Both river banks are included where visible. The four ends arise from the original repair-hut demolition mechanism, at the same original object IDs and tiles.</p><div class="comparisons">{"".join(figures)}</div></article>')

states = []
for state in ['standing', 'damaged', 'demolished', 'repaired']:
    file = root / 'native-deathvalley-4x-v2' / f'low-wood-bridge-{state}-framebuffer.png'
    crop = output / f'native-4x-{state}-context.png'
    Image.open(file).crop((260, 390, 1050, 950)).save(crop)
    states.append(f'<figure><figcaption>4X native {state}; unchanged accepted bridge members provide context.</figcaption>{embed(crop, state, "ACTUAL_MAC_GAME_STATE_CONTEXT")}</figure>')

text = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M2.4 Desert Low Wood Bridge — Batch 82</title>
<style>body{{margin:0;background:#10171c;color:#edf2f5;font:18px/1.55 system-ui,sans-serif}}main{{max-width:1380px;margin:auto;padding:30px}}h1{{font-size:34px}}h2{{font-size:25px}}p{{max-width:1000px}}article,section{{margin:26px 0;padding:22px;border:1px solid #45535c;border-radius:10px;background:#19232b}}nav{{position:sticky;top:0;padding:12px;background:#25323d;z-index:2}}button{{font:inherit;margin:3px;padding:8px 17px;border:1px solid #92afbd;border-radius:6px;cursor:pointer}}button[aria-pressed=true]{{background:#bce8fa}}figure{{margin:10px 0;overflow:auto}}figcaption{{margin-bottom:10px;color:#c5d9e4}}img{{display:block;width:auto;height:auto;max-width:none}}.comparisons{{display:flex;gap:22px;overflow:auto;align-items:flex-start}}[hidden]{{display:none!important}}a{{color:#b6e2fa}}.note{{color:#b9d6e7}}summary{{cursor:pointer;font-size:23px}}</style>
<main><h1>Desert Low Wood Bridge · Batch 82</h1><p>Complete family: <b>26 members, both 2X and 4X.</b> Please review only the <b>four Desert-specific broken ends</b> below. Twenty-two members reuse accepted Temperate PNGs exactly and need no new visual approval. Batch 81 dirt roads and accepted paved roads remain unchanged.</p>
<p class="note">Technical: Mac arm64 native passage, damage, demolition, engineer repair, both bridge directions, all four changed ends, global Original fallback and cross-theater release PASS. Visual: pending these four adapted ends. Windows: NOT RUN. M2.4: INCOMPLETE.</p>
<nav aria-label="Comparison controls"><button data-choice="4x" aria-pressed="true">4X</button><button data-choice="2x" aria-pressed="false">2X</button><button data-choice="original" aria-pressed="false">Original</button><button data-choice="all" aria-pressed="false">Compare all</button> · Native images display at 1:1 pixels; scroll to inspect.</nav>
<section><h2>Quick source review</h2><p>Look at complete planks, iron straps, missing pieces and clean structural edges. The original guide is explicitly enlarged only as a shape reference; the new source boards show actual authored pixels.</p>{''.join(cards)}</section>
<section><h2>Actual original-map transitions</h2><p>YR / deathvalleygirl.map. Same source map, original object IDs, camera route and 1489 × 1080 output at all three settings. These are unscaled framebuffer crops.</p>{''.join(contexts)}</section>
<details><summary>Native intact, damaged, demolished and repaired bridge context</summary>{''.join(states)}</details>
<section><h2>Evidence and limits</h2><p>132 loader assertions passed. Existing world limits remain 512 MiB at 2X and 1280 MiB at 4X; recorded world peaks: {closure['worldPeakBytes']['2']:,} / {closure['worldPeakBytes']['4']:,} bytes. Prepared peak: {closure['preparedPeakBytes']:,} bytes under 128 MiB. The original maps, archives, source shadows, gameplay and camera are unchanged.</p><p>No per-batch game package or resource copy is delivered. All images are embedded in this HTML. The accompanying hash ledger identifies complete selected resources and authoring dependencies. Browser interaction QA is not claimed; all embedded PNGs, dimensions and hashes are statically checked.</p><p>Remaining after technical closure: 40 Desert source groups (12 ore, 28 buildings), 324 NewUrban source groups, and separately retained unresolved/conditional inventory groups. Visual acceptance of these four ends is still required.</p></section></main>
<script>const controls=[...document.querySelectorAll('button[data-choice]')];function choose(value){{for(const button of controls)button.setAttribute('aria-pressed',String(button.dataset.choice===value));for(const figure of document.querySelectorAll('figure[data-mode]'))figure.hidden=value!=='all'&&figure.dataset.mode!==value;}}for(const button of controls)button.addEventListener('click',()=>choose(button.dataset.choice));choose('4x');</script></html>'''
file = output / 'M2.4-Desert-Low-Bridge-Batch82-Embedded.html'
file.write_text(text)
metadata = dict(status='SELF_CONTAINED_REVIEW_STATIC_QA_PENDING', review=dict(file=str(file), sha256=sha(file), bytes=file.stat().st_size),
    images=images, embeddedPngs=len(images), candidate=export['candidate'], runtimeSourceCommit=closure['runtimeSourceCommit'],
    visualScope=export['newVisualMembers'], exactReuseMembers=22, completeFamilyMembers=26,
    native='PASS', visualAcceptance='PENDING', windows='NOT_RUN', m24Complete=False)
(output / 'review-metadata-v2.json').write_text(json.dumps(metadata, indent=2) + '\n')
print(json.dumps(dict(review=str(file), sha256=sha(file), bytes=file.stat().st_size, images=len(images))))
