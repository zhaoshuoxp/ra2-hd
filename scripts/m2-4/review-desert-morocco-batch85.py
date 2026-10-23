"""Build one offline review for ten buildings, complete states and unscaled Mac views."""
import base64
import hashlib
import html
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path('scripts/m2/official-maps').resolve()))
from owner_review import compose_owner, frame_palette

ROOT = Path('.artifacts/m2-4/desert-morocco-batch85-20261020')
GUIDE = Path('.artifacts/m2-4/desert-morocco-native-batch85-v1')
OUT = ROOT / 'review-v2'
OUT.mkdir(exist_ok=False)
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
pin = lambda path: dict(file=str(path), sha256=sha(path), bytes=path.stat().st_size)
closure = read(ROOT / 'coverage-and-native-closure-v1.json')
contract = read(GUIDE / 'contract.json')
selected = read(Path('desktop/environment-desert-hd-contract.json'))
pack = Path('.local/environment-packs') / selected['selectedPack']['revision']
manifest = read(pack / 'manifest.json')
sources = {source['member']: source for source in read(GUIDE / 'source.json')['sources']}
reports = {density: read(ROOT / f'native-sahara-{density}x-v1/report.json') for density in [2, 4]}
images, crop_records = [], []


def figure(file, label, density, view, role):
    with Image.open(file) as image:
        size = list(image.size)
    images.append(dict(**pin(file), size=size, density=density, view=view, role=role))
    encoded = base64.b64encode(file.read_bytes()).decode()
    return (f'<figure data-density="{density}" data-view="{view}">'
            f'<figcaption>{html.escape(label)}</figcaption>'
            f'<img width="{size[0]}" height="{size[1]}" alt="{html.escape(label)}" '
            f'src="data:image/png;base64,{encoded}"></figure>')


def source_piece(member, slot, density, view):
    source = sources[member]
    frame = source['frames'][slot]
    width, height = frame['size']
    if view == 'original':
        original = GUIDE / 'native' / frame['file']
        assert sha(original) == frame['rgbaSha256']
        return Image.frombytes('RGBA', (width, height), original.read_bytes()).resize(
            (width * density, height * density), Image.Resampling.NEAREST)
    entry, = manifest['families'][contract['identities']['yr'][member.upper().replace('CG', 'CA', 1).split('.')[0]]]['members']
    metadata = pack / entry['path']
    variant, = [variant for variant in read(metadata)['variants'] if variant['density'] == density]
    cell, = [cell for cell in variant['frames'] if cell['nativeFrame'] == slot]
    x, y, width, height = cell['contentRect']
    folder = metadata.parent / str(density) / cell['page']
    base = Image.open(folder / 'base.png').convert('RGBA').crop((x, y, x + width, y + height))
    data = Image.open(folder / 'data.png').convert('RGBA').crop((x, y, x + width, y + height))
    colors = frame_palette(GUIDE, source, contract['sources'][member], slot, None)
    return compose_owner(base, data, colors)


scenes = []
for index, sample in enumerate(reports[4]['captureRoute']):
    if not sample['name'].startswith('CAMORR'):
        continue
    figures = []
    for density, view in [('any', 'original'), (2, 'new'), (4, 'new')]:
        folder = 'native-sahara-original-v1' if density == 'any' else f'native-sahara-{density}x-v1'
        file = ROOT / folder / f'{index:02d}-{sample["name"]}-framebuffer.png'
        target = OUT / f'{sample["name"]}-scene-{density}.png'
        Image.open(file).crop((180, 130, 1120, 810)).save(target)
        label = f'{sample["name"]} / ' + ('Original' if density == 'any' else f'New HD {density}X')
        figures.append(figure(target, label + ' / unscaled game pixels', density, view,
                              'ACTUAL_MAC_SOURCE_PLACEMENT_UNSCALED_CROP'))
    scenes.append(f'<article><h2>{sample["name"]} · original map placement</h2>'
                  f'<div class="comparisons">{"".join(figures)}</div></article>')
assert len(scenes) == 4

quick, complete = [], []
for number in range(1, 11):
    identity, member = f'CAMORR{number:02d}', f'cgmorr{number:02d}.shp'
    normal_figures, frame_figures, native_figures = [], [], []
    for density in [2, 4]:
        font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 24)
        for view in ['original', 'new']:
            piece = source_piece(member, 0, density, view)
            board = Image.new('RGBA', (piece.width + 32, piece.height + 62), (24, 31, 38, 255))
            ImageDraw.Draw(board).text((16, 10), identity, font=font, fill='white')
            board.alpha_composite(piece, (16, 46))
            file = OUT / f'{identity}-normal-{view}-{density}x.png'
            board.convert('RGB').save(file)
            label = 'New authored HD' if view == 'new' else 'Original guide, nearest display enlargement; not HD'
            normal_figures.append(figure(file, f'{label} / {density}X', density, view,
                'AUTHORED_SOURCE_PIXELS' if view == 'new' else 'ORIGINAL_GUIDE_ENLARGED_NOT_HD'))
        comparison = ROOT / f'comparisons-{density}x-v1' / f'{member}-{density}x.png'
        frame_figures.append(figure(comparison,
            f'{identity} / Original left, new HD right / all four source states / {density}X',
            density, 'all', 'COMPLETE_ORIGINAL_AND_HD_STATE_BOARD_ACTUAL_DENSITY'))
        row, = [row for row in reports[density]['newNativeStates']['buildings'] if row['normal']['name'] == identity]
        for state in ['normal', 'occupied', 'damaged', 'rubble']:
            capture = row[state + 'Capture']
            assert capture['rescaled'] is False
            source = ROOT / f'native-sahara-{density}x-v1' / capture['file']
            target = OUT / f'{identity}-{state}-{density}x-game.png'
            left, top, width, height = capture['source']
            box = [180, 140, 800, 650]
            if left == 0:
                box[0], box[2] = 0, 800
            elif left + width == capture['buffer'][0]:
                box[0], box[2] = 160, 960
            if top == 0:
                box[1] = 0
            elif top + height == capture['buffer'][1]:
                box[3] = 720
            Image.open(source).crop(tuple(box)).save(target)
            crop_records.append(dict(source=pin(source), target=pin(target), cropRect=box,
                nativeCapture=capture, identity=identity, state=state, density=density, rescaled=False))
            native_figures.append(figure(target, f'{identity} / native {state} / {density}X / unscaled',
                density, 'new', 'ACTUAL_MAC_LEGAL_STATE_FIXTURE_UNSCALED_CROP'))
    quick.append(f'<article><h2>{identity}</h2><div class="comparisons">{"".join(normal_figures)}</div></article>')
    complete.append(f'<details><summary>{identity} · all four states and native actions</summary>'
        '<p>Source states: normal, damaged, occupied, rubble. Original guides on the left are explicitly enlarged '
        'for comparison. HD source boards retain actual export pixels. Native pictures retain game display pixels.</p>'
        f'<div class="comparisons">{"".join(frame_figures)}</div>'
        '<p>State checks use separate legal duplicate foundations and ordinary native orders. Original map placements '
        'and rules remain unchanged. Each fixture is removed before the next case; native rubble and damage effects '
        'can remain visible in the surrounding scene. Only the named central building is under review.</p>'
        f'<div class="native-states">{"".join(native_figures)}</div></details>')

style = '''
body{margin:0;background:#10171c;color:#edf2f5;font:18px/1.55 system-ui,sans-serif}
main{max-width:1440px;margin:auto;padding:28px}h1{font-size:34px}h2{font-size:26px}
p{max-width:1150px}section,article,details{margin:22px 0;padding:18px;border:1px solid #45535c;
border-radius:9px;background:#19232b}nav{position:sticky;top:0;padding:10px;background:#25323d;z-index:2}
button{font:inherit;padding:8px 14px;margin:3px;border:1px solid #a0bbc8;border-radius:6px;cursor:pointer}
button[aria-pressed=true]{background:#c3e9fa}a{color:#b9e7ff;margin:0 10px}
figure{margin:10px 0;overflow:auto}figcaption{color:#c6dce7;margin-bottom:9px}
img{display:block;width:auto;height:auto;max-width:none}.comparisons{display:flex;gap:20px;overflow:auto;
align-items:flex-start}.native-states{display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start}
[hidden]{display:none!important}summary{font-size:25px;cursor:pointer;padding:8px}
pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:16px}.note{color:#c1dce9}
'''
script = '''
let density='4',view='new';
function refresh(){
  for(const figure of document.querySelectorAll('figure[data-density]')){
    const densityMatch=figure.dataset.density==='any'||figure.dataset.density===density;
    const viewMatch=view==='all'||figure.dataset.view==='all'||figure.dataset.view===view;
    figure.hidden=!(densityMatch&&viewMatch);
  }
  for(const button of document.querySelectorAll('button[data-d]'))
    button.setAttribute('aria-pressed',String(button.dataset.d===density));
  for(const button of document.querySelectorAll('button[data-v]'))
    button.setAttribute('aria-pressed',String(button.dataset.v===view));
}
for(const button of document.querySelectorAll('button[data-d]'))
  button.addEventListener('click',()=>{density=button.dataset.d;refresh()});
for(const button of document.querySelectorAll('button[data-v]'))
  button.addEventListener('click',()=>{view=button.dataset.v;refresh()});
refresh();
'''
document = f'''<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M2.4 Desert Moroccan Buildings · Batch 85</title><style>{style}</style>
<main><h1>Desert Moroccan Buildings · Batch 85</h1>
<p><b>Ten complete new families: CAMORR01–10, forty original body states and both 2X / 4X densities.</b>
Redrawn plaster, masonry, roofs, openings and edges replace the old RGB pixel blocks with continuous material.
Original architecture, dimensions, placement, shadows, owner-color indices and gameplay remain intact.</p>
<p>Review the ten-building summary first, then open individual complete-state panels where needed.
Accepted ore, bridges, roads, trees and faction artwork require no further review.</p>
<nav>Density: <button data-d="4" aria-pressed="true">4X</button><button data-d="2" aria-pressed="false">2X</button>
View: <button data-v="new" aria-pressed="true">New HD</button><button data-v="original" aria-pressed="false">Original</button>
<button data-v="all" aria-pressed="false">Compare all</button>
<a href="#summary">Ten buildings</a><a href="#game">Original map</a><a href="#states">All states</a></nav>
<section id="summary"><h2>Quick summary · all ten buildings</h2>{''.join(quick)}</section>
<section id="game"><h2>Actual Mac game · original map placements</h2>
<p>YR / saharami.map. Original, 2X and 4X use the same original source, output preset, seed and camera route.
Screenshots are crops of actual game pixels, with no enlargement. Controlled reveal and suspended bot AI are disclosed;
simulation ticks progress normally and no same-tick comparison is claimed.</p>{''.join(scenes)}</section>
<section id="states"><h2>Complete source states and native actions</h2>{''.join(complete)}</section>
<section><h2>Technical status and scope</h2>
<p>PASS: forty source states, eighty independent density frames, complete-family source/page/mask/owner/shadow closure,
20 loader tests / 320 assertions, entry typecheck, isolated build, Mac signature and resource registration.
All ten original placements and all four native states pass at both densities, including ordinary garrison, evacuation,
critical damage evacuation, destruction and visible rubble. Original fallback, reentry and Desert-to-NewUrban release pass.</p>
<p>World peak: 2X {closure['worldPeakBytes']['2']:,} / 536,870,912 bytes;
4X {closure['worldPeakBytes']['4']:,} / 1,342,177,280. Prepared peak:
{closure['preparedPeakBytes']:,} / 134,217,728. Budgets and core prepared inputs remain unchanged.
One internal Mac validation application is reused; this batch delivers no duplicate game or resource directory.</p>
<p>Ten exact source groups are exercised once on saharami.map. Identical groups on pcofdune.map and saharamimw.map
share the verified loading path and existing unified skirmish rules. No new map eligibility or gameplay adaptation occurs.</p>
<p>Technical: PASS. New artwork: PENDING USER REVIEW. Windows: NOT RUN. M2.4: INCOMPLETE.
Desert retains four authored building gaps; NewUrban retains 310 authored groups. Each environment also retains its
22 explicit conditional or unresolved dependency groups. This review does not claim surrounding unfinished objects as covered.</p>
<details><summary>Resource identity and retained attempts</summary>
<pre>{html.escape(json.dumps(dict(runtimeSourceCommit=closure['runtimeSourceCommit'],
    selectedEnvironment=closure['candidate'], priorFamiliesPreserved=80,
    originalBodyStates=40, originalShadowFrames=40,
    minimumMotherCapacity=read(Path('.artifacts/m2-4/desert-morocco-authoring-batch85-v1/mother-capacity-qa-v7.json'))['minimumActualCapacity'],
    attempts='Initial undersized mother, damaged-wall material interpretation and incomplete structural verifier metadata remain recorded. None is selected.',
    visualAcceptance='PENDING_TEN_NEW_FAMILIES_ONLY', windows='NOT_RUN'), indent=2))}</pre>
</details></section></main><script>{script}</script></html>
'''
review = OUT / 'M2.4-Desert-Morocco-Batch85-Embedded.html'
with review.open('x') as stream:
    stream.write(document)
metadata = dict(status='SELF_CONTAINED_TEN_BUILDING_VISUAL_REVIEW_PENDING', review=pin(review),
    images=images, embeddedPngs=len(images), closure=pin(ROOT / 'coverage-and-native-closure-v1.json'),
    sourceStateCount=40, densityFrameCount=80, nativeStateCrops=crop_records,
    supersededReview='review-v1 retained: fixed review crop clipped a viewport-edge building; original native captures and passing simulation remain valid.',
    windows='NOT_RUN', m24Complete=False)
with (OUT / 'review-metadata-v1.json').open('x') as stream:
    stream.write(json.dumps(metadata, indent=2) + '\n')
print(json.dumps(dict(review=pin(review), embeddedPngs=len(images))))
