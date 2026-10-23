"""Deliver a single embedded repaint review with honest reused Original controls."""
import base64
import hashlib
import html
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

root = Path('.artifacts/m2-4/desert-low-bridge-continuous-r1-20261020')
prior = Path('.artifacts/m2-4/desert-low-bridge-batch82-20261019')
out = root / 'review-v1'
out.mkdir(exist_ok=False)
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
closure = read(root / 'coverage-and-native-closure-v1.json')
before = read(root / 'baseline-contract.json')
current = read(root / 'contract-candidate-v1.json')
packs = {view: Path('.local/environment-packs') / contract['selectedPack']['revision']
         for view, contract in [('previous', before), ('new', current)]}
guide_root = Path('.artifacts/m2-4/desert-native-v1')
sources = {s['member']: s for s in read(guide_root / 'source.json')['sources']}
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 24)
images = []


def figure(file, label, density, view, role):
    im = Image.open(file)
    images.append(dict(file=str(file), sha256=sha(file), bytes=file.stat().st_size,
        size=list(im.size), density=density, view=view, role=role))
    encoded = base64.b64encode(file.read_bytes()).decode()
    return f'<figure data-density="{density}" data-view="{view}"><figcaption>{html.escape(label)}</figcaption><img width="{im.width}" height="{im.height}" alt="{html.escape(label)}" src="data:image/png;base64,{encoded}"></figure>'


def native_card(title, stem, box, original_file=None, broken_name=None):
    figures = []
    for density in [2, 4]:
        for view in ['previous', 'new']:
            if broken_name:
                folder = (prior / f'native-broken-ends-{density}x-v2' if view == 'previous'
                          else root / f'native-broken-ends-{density}x-v1')
                file = folder / f'{broken_name}-framebuffer.png'
            else:
                folder = (prior / f'native-deathvalley-{density}x-v2' if view == 'previous'
                          else root / f'native-deathvalley-{density}x-v1')
                file = folder / f'low-wood-bridge-{stem}-framebuffer.png'
            im = Image.open(file)
            assert im.size == (1489, 1080)
            target = out / f'{stem}-{view}-{density}x-native.png'
            im.crop(box).save(target)
            figures.append(figure(target, f'{"R1 repaint" if view == "new" else "Previous HD"} / {density}X / native pixels', density, view, 'ACTUAL_MAC_GAME_UNSCALED_CROP'))
    if original_file:
        target = out / f'{stem}-original-native.png'
        Image.open(original_file).crop(box).save(target)
        figures.insert(0, figure(target, 'Original / reused unchanged source control / native pixels', 'any', 'original', 'REUSED_SOURCE_IDENTICAL_ORIGINAL_GAME'))
    return f'<article><h2>{html.escape(title)}</h2><div class="comparisons">{"".join(figures)}</div></article>'


native_cards = [native_card('1 · Complete bridge surface and continuous straps', 'standing', (260, 390, 1050, 950),
    prior / 'native-deathvalley-original-v2/00-low-wood-bridge-context-framebuffer.png'),
    native_card('2 · Native damaged bridge: long splits and coherent wood', 'damaged', (260, 390, 1050, 950))]
for name, box in {'LOBRDG20': (300, 650, 870, 980), 'LOBRDG22': (300, 650, 870, 980),
                  'LOBRDG24': (280, 330, 870, 650), 'LOBRDG26': (530, 320, 1130, 660)}.items():
    native_cards.append(native_card(name + ' · broken-end context', name.lower(), box,
        prior / 'native-broken-ends-original-v2' / (name + '-framebuffer.png'), name))

cards = {}
for number in range(1, 27):
    name = f'lobrdg{number:02d}.des'
    source = sources[name]
    slot, = [f['slot'] for f in source['frames'][:3] if not f['empty']]
    native = source['frames'][slot]
    figures = []
    for density in [2, 4]:
        for view in ['original', 'previous', 'new']:
            w, h = native['size']
            if view == 'original':
                file = guide_root / 'native' / native['file']
                assert sha(file) == native['rgbaSha256']
                piece = Image.frombytes('RGBA', (w, h), file.read_bytes()).resize((w * density, h * density), Image.Resampling.NEAREST)
            else:
                pack = packs[view]
                metadata = pack / 'members' / name.replace('.', '-') / 'manifest.json'
                hd = read(metadata)
                variant, = [v for v in hd['variants'] if v['density'] == density]
                frame = variant['frames'][slot]
                x, y, sw, sh = frame['contentRect']
                piece = Image.open(metadata.parent / str(density) / frame['page'] / 'base.png').convert('RGBA').crop((x, y, x + sw, y + sh))
            board = Image.new('RGBA', (piece.width + 40, piece.height + 88), (24, 30, 35, 255))
            board.alpha_composite(piece, (20, 64))
            label = 'Original guide (display enlargement)' if view == 'original' else 'R1 repaint' if view == 'new' else 'Previous HD'
            ImageDraw.Draw(board).text((20, 15), f'{name} / {density}X', font=font, fill='white')
            file = out / f'{name}-{view}-{density}x-source.png'
            board.convert('RGB').save(file)
            figures.append(figure(file, label + (' — source guide only, not HD' if view == 'original' else ' — actual authored pixels'),
                density, view, 'ORIGINAL_GUIDE_ENLARGED_NOT_HD' if view == 'original' else 'AUTHORED_SOURCE_PIXELS'))
    cards[number] = f'<article><h2>{name} · native frame {slot}</h2><div class="comparisons">{"".join(figures)}</div></article>'

representatives = [1, 7, 8, 10, 19, 21]
jobs = read(root / 'imagegen-jobs.json')
text = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M2.4 Wood Bridge Continuous Structure R1</title>
<style>body{{margin:0;background:#10171c;color:#edf2f5;font:18px/1.55 system-ui,sans-serif}}main{{max-width:1380px;margin:auto;padding:28px}}h1{{font-size:34px}}h2{{font-size:25px}}p{{max-width:1100px}}section,article{{margin:24px 0;padding:20px;border:1px solid #45535c;border-radius:9px;background:#19232b}}nav{{position:sticky;top:0;padding:10px;background:#25323d;z-index:2}}button{{font:inherit;padding:8px 14px;margin:3px;border:1px solid #a0bbc8;border-radius:6px;cursor:pointer}}button[aria-pressed=true]{{background:#c3e9fa}}figure{{margin:10px 0;overflow:auto}}figcaption{{color:#c6dce7;margin-bottom:9px}}img{{display:block;width:auto;height:auto;max-width:none}}.comparisons{{display:flex;gap:20px;overflow:auto;align-items:flex-start}}[hidden]{{display:none!important}}summary{{font-size:24px;cursor:pointer;padding:10px}}pre{{white-space:pre-wrap;overflow-wrap:anywhere;font-size:16px}}.note{{color:#c1dce9}}</style>
<main><h1>Wood Bridge · Continuous HD Structure R1</h1><p><b>All 26 Desert bridge members are repainted.</b> The prior visual submission is rejected for excessive grain and pixelation. New imagegen mothers replace the old speckled material with broad coherent wood, long restrained fibers, clean strap lines and smoother contours. Original dimensions, missing sections, source slots, shadows and gameplay remain intact.</p>
<p>Please first compare the actual game views below, then the six representative source sprites. The remaining 20 corrected members are included in one expandable section. No other accepted resource requires review.</p>
<nav><span>Density:</span><button data-d="4" aria-pressed="true">4X</button><button data-d="2" aria-pressed="false">2X</button><span> View:</span><button data-v="new" aria-pressed="true">R1 repaint</button><button data-v="previous" aria-pressed="false">Previous HD</button><button data-v="original" aria-pressed="false">Original</button><button data-v="all" aria-pressed="false">Compare all</button></nav>
<section><h2>Actual game scale</h2><p class="note">Game images are unscaled framebuffer crops. Original controls are reused from the source-identical previous app path. Same-state Original gameplay controls cover intact and broken ends; the damaged-state comparison shows Previous HD / R1. The original source-frame guides below cover every member.</p>{''.join(native_cards)}</section>
<section><h2>Representative source structure</h2><p>New source images show actual authored pixels. Original guides are explicitly enlarged for anatomy comparison only.</p>{''.join(cards[n] for n in representatives)}</section>
<details><summary>All remaining 20 corrected members</summary>{''.join(cards[n] for n in range(1,27) if n not in representatives)}</details>
<section><h2>Validation and retained scope</h2><p>Mac arm64: both densities, native passage, damage, demolition, engineer repair, all four broken ends, Original reset and cross-theater release PASS. 132 complete-family loader assertions PASS. All 682 unrelated payload files remain exact. Prepared core is unchanged; new RGBA pages are validated from their new content hashes.</p>
<p>World peaks: 2X {closure['worldPeakBytes']['2']:,} / 536,870,912 bytes; 4X {closure['worldPeakBytes']['4']:,} / 1,342,177,280 bytes. Prepared peak: {closure['preparedPeakBytes']:,} / 134,217,728 bytes. Budgets are unchanged.</p><p>Visual acceptance: PENDING ALL 26 CORRECTED MEMBERS. Windows: NOT RUN. M2.4: INCOMPLETE. No extra game package is included; this HTML embeds every review image.</p><p>Static HTML checks cover decoded image hashes, dimensions and external dependencies. Interactive browser QA is not claimed; the prior local-protocol denial is retained without a bypass.</p></section>
<details><summary>Built-in imagegen production prompts and asset provenance</summary><p>Four new material mothers are retained in the isolated task with original references and SHA-256 hashes. Generated halo pixels are excluded from material sampling; target native structural contours determine game visibility. No native RGB pixels are copied into the new material.</p><pre>{html.escape(json.dumps(jobs,indent=2))}</pre></details></main>
<script>let density='4',view='new';function refresh(){{for(const b of document.querySelectorAll('button[data-d]'))b.setAttribute('aria-pressed',String(b.dataset.d===density));for(const b of document.querySelectorAll('button[data-v]'))b.setAttribute('aria-pressed',String(b.dataset.v===view));for(const f of document.querySelectorAll('figure[data-view]'))f.hidden=!(f.dataset.density===density||f.dataset.density==='any')||!(view==='all'||f.dataset.view===view);}}for(const b of document.querySelectorAll('button[data-d]'))b.addEventListener('click',()=>{{density=b.dataset.d;refresh();}});for(const b of document.querySelectorAll('button[data-v]'))b.addEventListener('click',()=>{{view=b.dataset.v;refresh();}});refresh();</script></html>'''
file = out / 'M2.4-Desert-Wood-Bridge-Continuous-R1-Embedded.html'
file.write_text(text)
metadata = dict(status='SELF_CONTAINED_REPAINT_REVIEW_STATIC_QA_PENDING',
    review=dict(file=str(file), sha256=sha(file), bytes=file.stat().st_size), images=images, embeddedPngs=len(images),
    candidate=current['selectedPack'], runtimeSourceCommit=closure['runtimeSourceCommit'], correctedMembers=26,
    generation='BUILT_IN_IMAGEGEN_FOUR_MOTHERS', originalEvidence='REUSED_SOURCE_IDENTICAL_CONTROLS_NOT_RERUN',
    nativeMac='PASS', visualAcceptance='PENDING_ALL_26_CORRECTED_MEMBERS', windows='NOT_RUN', m24Complete=False)
(out / 'review-metadata-v1.json').write_text(json.dumps(metadata,indent=2)+'\n')
print(json.dumps(dict(review=str(file), sha256=sha(file), bytes=file.stat().st_size, images=len(images))))
