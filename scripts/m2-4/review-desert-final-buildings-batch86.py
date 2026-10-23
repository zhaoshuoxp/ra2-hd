"""Build one self-contained review of new Desert airport, pyramid and house states."""
import base64
import hashlib
import html
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path('scripts/m2/official-maps').resolve()))
from owner_review import compose_owner, frame_palette

ROOT = Path('.artifacts/m2-4/desert-final-buildings-batch86-20261020')
GUIDE = Path('.artifacts/m2-4/desert-final-buildings-native-batch86-v1')
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
entries = {member['member']: member for family in manifest['families'].values() for member in family['members']}
sources = {source['member']: source for source in read(GUIDE / 'source.json')['sources']}
reports = {(label, density): read(ROOT / f'native-{label}-{density}x-v{2 if label == "sahara" else 1}/report.json')
           for label in ['sahara', 'sedona', 'egypt'] for density in [2, 4]}
images, videos = [], []
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 25)


def data_url(file, mime):
    return f'data:{mime};base64,' + base64.b64encode(file.read_bytes()).decode()


def figure(file, label, density, view, role):
    with Image.open(file) as image:
        size = list(image.size)
    images.append(dict(**pin(file), size=size, density=density, view=view, role=role))
    return (f'<figure data-density="{density}" data-view="{view}"><figcaption>{html.escape(label)}</figcaption>'
        f'<img width="{size[0]}" height="{size[1]}" alt="{html.escape(label)}" '
        f'src="{data_url(file, "image/png")}"></figure>')


def source_picture(member, number, density, original):
    source, frame = sources[member], sources[member]['frames'][number]
    width, height = frame['size']
    colors = frame_palette(GUIDE, source, contract['sources'][member], number)
    if original:
        import numpy as np
        indices = np.fromfile(GUIDE / 'native' / frame['indexFile'], np.uint8).reshape(height, width)
        rgba = np.zeros((height, width, 4), np.uint8)
        rgba[..., :3], rgba[..., 3] = colors[indices], (indices != 0) * 255
        picture = Image.fromarray(rgba).resize((width * density, height * density), Image.Resampling.NEAREST)
    else:
        metadata = pack / entries[member]['path']
        variant, = [item for item in read(metadata)['variants'] if item['density'] == density]
        cell, = [item for item in variant['frames'] if item['nativeFrame'] == number]
        x, y, width, height = cell['contentRect']
        page = metadata.parent / str(density) / cell['page']
        base = Image.open(page / 'base.png').convert('RGBA').crop((x, y, x + width, y + height))
        data = Image.open(page / 'data.png').convert('RGBA').crop((x, y, x + width, y + height))
        picture = compose_owner(base, data, colors)
    canvas = Image.new('RGBA', tuple(value * density for value in source['canvas']), (24, 31, 38, 255))
    canvas.alpha_composite(picture, tuple(value * density for value in frame['origin']))
    board = Image.new('RGB', (canvas.width + 32, canvas.height + 66), (24, 31, 38))
    ImageDraw.Draw(board).text((16, 10), f'{member} / state {number}', font=font, fill='white')
    board.paste(canvas.convert('RGB'), (16, 50))
    file = OUT / f'{member}-{number}-{"original" if original else "hd"}-{density}x.png'
    board.save(file)
    return file


quick = []
for title, member, number in [('CAAIRP / new airport body', 'cdairp.shp', 0),
    ('CAEGYP02 / fine sandstone courses', 'cgegyp02.shp', 0),
    ('CAHSE06 / new occupied state', 'cdhse06.shp', 2), ('CAHSE06 / new rubble state', 'cdhse06.shp', 3)]:
    figures = []
    for density in [2, 4]:
        for original in [True, False]:
            file = source_picture(member, number, density, original)
            label = ('Original source guide, enlarged; not HD' if original else 'New authored HD source pixels')
            figures.append(figure(file, f'{label} / {density}X', density,
                'original' if original else 'new', 'ORIGINAL_GUIDE_NOT_HD' if original else 'AUTHORED_ATLAS_ACTUAL_DENSITY'))
    quick.append(f'<article><h2>{title}</h2><div class="comparisons">{"".join(figures)}</div></article>')

scenes = []
for label, identity in [('sahara', 'CAAIRP'), ('egypt', 'CAEGYP02'), ('sedona', 'CAHSE06')]:
    figures = []
    for density in [2, 4]:
        report = reports[label, density]
        index, sample = next((index, sample) for index, sample in enumerate(report['captureRoute']) if sample['name'] == identity)
        folder = ROOT / f'native-{label}-{density}x-v{2 if label == "sahara" else 1}'
        file = folder / f'{index:02d}-{identity}-framebuffer.png'
        figures.append(figure(file, f'{identity} / {report["selectedMap"]} / Mac {density}X / unscaled', density, 'new',
            'ACTUAL_MAC_ORIGINAL_PLACEMENT_UNSCALED_FRAMEBUFFER'))
        if density == 4 and label != 'sedona':
            original = ROOT / f'native-{label}-original-v1' / file.name
            figures.append(figure(original, f'{identity} / actual Original / unscaled', 'any', 'original',
                'ACTUAL_MAC_ORIGINAL_RENDERER_UNSCALED_FRAMEBUFFER'))
    scenes.append(f'<article><h2>{identity} · original map placement</h2><div class="comparisons">{"".join(figures)}</div></article>')

motion = []
for state in ['normal', 'damaged']:
    motion_videos, motion_stills = [], []
    for density in ['any', 2, 4]:
        folder = ROOT / ('native-sahara-original-v1' if density == 'any' else f'native-sahara-{density}x-v2')
        report = read(folder / 'report.json')
        cycle, = [cycle for cycle in report['linkedBuildingCycles'] if cycle['member'] == 'cdairp_a.shp'
                  and cycle['state'] == state and cycle.get('originalCapturedPlacement')]
        assert cycle['status'] == 'PASS_ALL_ORIGINAL_PHASES_AND_NATIVE_LOOP_RETURN'
        assert cycle['expectedPhases'] == list(range(9))
        file = folder / cycle['videoFile']
        view = 'original' if density == 'any' else 'new'
        name = 'Original' if density == 'any' else f'New HD {density}X'
        video = dict(**pin(file), density=density, view=view, state=state,
            capture=cycle['videoCapture'], phases=cycle['expectedPhases'], role='ACTUAL_MAC_NATIVE_FULL_LOOP_VIDEO')
        videos.append(video)
        poster = folder / cycle['captures'][0]['file']
        video['poster'] = pin(poster)
        motion_videos.append(f'<figure data-density="{density}" data-view="{view}"><figcaption>{name} / {state} / actual native loop</figcaption>'
            f'<video controls loop preload="metadata" width="720" height="640" '
            f'poster="{data_url(poster, "image/png")}" src="{data_url(file, "video/webm")}"></video></figure>')
        for phase in [0, 4, 8]:
            capture, = [capture for capture in cycle['captures'] if capture['phase'] == phase]
            motion_stills.append(figure(folder / capture['file'], f'{name} / {state} / native phase {phase} / unscaled',
                density, view, 'ACTUAL_MAC_SAME_PHASE_UNSCALED_CAPTURE'))
    motion.append(f'<details open><summary>Airport · {state} loop</summary><div class="comparisons">{"".join(motion_videos)}</div>'
        f'<details><summary>Same-phase inspection · phases 0, 4 and 8</summary><div class="comparisons">{"".join(motion_stills)}</div></details></details>')

states = []
for label, identity, member in [('sahara', 'CAAIRP', 'cdairp.shp'), ('sedona', 'CAHSE06', 'cdhse06.shp'),
                              ('egypt', 'CAEGYP02', 'cgegyp02.shp')]:
    figures = []
    for density in [2, 4]:
        comparison = ROOT / f'comparisons-{density}x-v2' / f'{member}-{density}x.png'
        figures.append(figure(comparison, f'{identity} / all original slots / Original left, HD right / {density}X',
            density, 'all', 'COMPLETE_SOURCE_STATE_BOARD_ACTUAL_DENSITY'))
        row, = [row for row in reports[label, density]['newNativeStates']['buildings'] if row['normal']['name'] == identity]
        folder = ROOT / f'native-{label}-{density}x-v{2 if label == "sahara" else 1}'
        names = ['damaged', 'rubble'] if identity == 'CAAIRP' else ['occupied', 'rubble'] if identity == 'CAHSE06' else ['normal', 'occupied', 'damaged', 'rubble']
        for state in names:
            capture = row[state + 'Capture']
            assert capture['rescaled'] is False
            figures.append(figure(folder / capture['file'], f'{identity} / native {state} / Mac {density}X / unscaled',
                density, 'new', 'ACTUAL_MAC_LEGAL_NATIVE_STATE_FIXTURE_UNSCALED'))
    states.append(f'<details><summary>{identity} · complete states and native actions</summary>'
        '<p>Separate legal duplicate foundations exercise native state changes. Original map placements, objects, '
        'geometry and rules remain unchanged. Other native units and effects can appear around the fixture.</p>'
        f'<div class="comparisons">{"".join(figures)}</div></details>')

style = '''body{margin:0;background:#10171c;color:#edf2f5;font:18px/1.55 system-ui,sans-serif}
main{max-width:1440px;margin:auto;padding:28px}h1{font-size:34px}h2{font-size:26px}
article,section,details{margin:22px 0;padding:18px;border:1px solid #45535c;border-radius:9px;background:#19232b}
nav{position:sticky;top:0;padding:10px;background:#25323d;z-index:2}button{font:inherit;padding:8px 14px;margin:3px;
border:1px solid #a0bbc8;border-radius:6px;cursor:pointer}button[aria-pressed=true]{background:#c3e9fa}
a{color:#b9e7ff;margin:0 9px}figure{margin:10px 0;overflow:auto;flex:none}figcaption{color:#c6dce7;margin-bottom:9px}
img,video{display:block;width:auto;height:auto;max-width:none}.comparisons{display:flex;gap:20px;overflow:auto;align-items:flex-start}
[hidden]{display:none!important}summary{font-size:25px;cursor:pointer;padding:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:16px}'''
script = '''let density='4',view='new';
function refresh(){for(const f of document.querySelectorAll('figure[data-density]')){
f.hidden=!((f.dataset.density==='any'||f.dataset.density===density)&&(view==='all'||f.dataset.view==='all'||f.dataset.view===view));
for(const v of f.querySelectorAll('video'))if(f.hidden)v.pause();}
for(const b of document.querySelectorAll('button[data-d]'))b.setAttribute('aria-pressed',String(b.dataset.d===density));
for(const b of document.querySelectorAll('button[data-v]'))b.setAttribute('aria-pressed',String(b.dataset.v===view));}
for(const b of document.querySelectorAll('button[data-d]'))b.addEventListener('click',()=>{density=b.dataset.d;refresh()});
for(const b of document.querySelectorAll('button[data-v]'))b.addEventListener('click',()=>{view=b.dataset.v;refresh()});refresh();'''
document = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M2.4 Desert Final Buildings · Batch 86</title><style>{style}</style><main>
<h1>Desert Final Buildings · Batch 86</h1>
<p><b>Review new airport material and animation, the four pyramid states, and two differing mobile-home states.</b>
The complete four-family batch also includes the exact accepted bench, sixteen airport flag phases and house normal/damaged states;
those unchanged accepted pictures require no new approval.</p>
<p>All images and six actual Mac recordings are embedded. Begin with the summary and airport videos; open full-state panels as needed.
Images retain source/export pixels or actual game display pixels. Original source enlargements are explicitly labeled.</p>
<nav>Density: <button data-d="4" aria-pressed="true">4X</button><button data-d="2" aria-pressed="false">2X</button>
View: <button data-v="new" aria-pressed="true">New HD</button><button data-v="original" aria-pressed="false">Original</button>
<button data-v="all" aria-pressed="false">Compare all</button><a href="#summary">Summary</a><a href="#motion">Airport motion</a>
<a href="#game">In game</a><a href="#states">All states</a></nav>
<section id="summary"><h2>Quick review · changed artwork only</h2>{''.join(quick)}</section>
<section id="motion"><h2>Airport · fixed surface, radar and native lights</h2>
<p>The neutral NeedsEngineer airport is naturally idle. Ordinary engineer capture enables its radar. One fixed authored paving surface
is shared by body and animation; only native light illumination and the dish pose change. Both Original and HD currently use
phases 0–8 at Rate 50 in normal and damaged observations. All twenty raw source slots remain intact, including unused marker/empty slots.</p>
<p>Videos retain the original clock and show a complete loop returning to its initial phase. Fixed pedestal material is registered
after owner-boundary underpaint. The accepted flag remains unchanged and its sixteen-phase loop is technically verified.</p>{''.join(motion)}</section>
<section id="game"><h2>Actual Mac · original map placements</h2><p>Three unmodified official maps, native simulation ticks,
controlled reveal and suspended bot AI. Identical source groups on other maps reuse the proven load/rules path.
Original mobile-home state evidence is reused from its prior unchanged observation; new HD actions are separately verified.</p>{''.join(scenes)}</section>
<section id="states"><h2>Complete source states and legal native actions</h2>
<p>The airport's source slot 2 is retained as an unused original slot, not a garrison feature. The bench has one original state and
no nonfatal damage or rubble state. House normal/damaged artwork is exact accepted reuse; only its occupied/rubble art is new.</p>{''.join(states)}</section>
<section><h2>Technical status</h2><p>PASS: four complete families, six original members, 49 source body slots, 98 density slots,
29 original shadow frames, exact accepted base/data reuse, native masks/owners/pages, eight loader tests / 136 assertions,
entry typecheck, isolated build, Mac signature, three source-map paths at both densities, applicable garrison/evacuation/damage/rubble,
airport engineer capture/repair and full loops, Original, reentry and Desert-to-NewUrban resource release.</p>
<p>World peak: 2X {closure['worldPeakBytes']['2']:,} / 536,870,912 bytes; 4X {closure['worldPeakBytes']['4']:,} / 1,342,177,280.
Prepared peak: {closure['preparedPeakBytes']:,} / 134,217,728. Budgets and core prepared inputs remain unchanged.</p>
<p>A retained 4X run passed artwork/state/motion checks and then failed an incorrectly named next-map assertion. Its passing sections
are explicitly reused. A separate light run on the inventory-verified fight.map target passes lifecycle without repeating those state suites.
An earlier neutral-airport observation and the first static export also remain as retained validation attempts.</p>
<p>New artwork: PENDING USER REVIEW. Windows: NOT RUN. No per-batch game or resource copy. M2.4: INCOMPLETE.
Desert authored source-group gaps are now zero technically; its 22 conditional/unresolved groups remain open. NewUrban retains
310 authored source groups plus its separate conditional groups. No full-milestone acceptance or main integration is claimed.</p>
<details><summary>Source and resource identity</summary><pre>{html.escape(json.dumps(dict(runtimeSourceCommit=closure['runtimeSourceCommit'],
    selectedEnvironment=closure['candidate'], priorFamiliesHashPreserved=90, independentAcceptedDensityFrames=38,
    preparedIndex=read(ROOT/'active-stage-v1.json')['preparedRegistration'],
    reviewScope='New airport, pyramid and two house states only; exact accepted artwork does not require re-review.',
    windows='NOT_RUN', m24Complete=False), indent=2))}</pre></details></section></main><script>{script}</script></html>'''
review = OUT / 'M2.4-Desert-Final-Buildings-Batch86-Embedded.html'
with review.open('x') as stream:
    stream.write(document)
metadata = dict(status='SELF_CONTAINED_NEW_DESERT_BUILDING_ART_REVIEW_PENDING', review=pin(review),
    images=images, videos=videos, embeddedPngs=len(images) + len(videos), embeddedVideos=len(videos),
    closure=pin(ROOT / 'coverage-and-native-closure-v1.json'), sourceBodySlots=49, densityFrames=98,
    visualAcceptance='PENDING_NEW_AIRPORT_PYRAMID_AND_TWO_HOUSE_STATES',
    perBatchGamePackage=False, windows='NOT_RUN', m24Complete=False)
with (OUT / 'review-metadata-v1.json').open('x') as stream:
    stream.write(json.dumps(metadata, indent=2) + '\n')
print(json.dumps(dict(review=pin(review), images=len(images), videos=len(videos))))
