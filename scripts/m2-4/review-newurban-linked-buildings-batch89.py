"""Create one offline actual-density review of only the twelve new rubble studies and complete stadium context."""
import base64
import hashlib
import html
import json
from pathlib import Path

from PIL import Image

ROOT = Path('.artifacts/m2-4/newurban-linked-buildings-batch89-20261020')
OUT = ROOT / 'review-v1'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
export = read(ROOT / 'export-and-preservation-v2.json')
audit = read(ROOT / 'static-audit-v2.json')
OUT.mkdir(exist_ok=False)
images, reports = [], []


def figure(file, title, density='any', view='any', role='AUTHORED_ACTUAL_DENSITY_PIXELS'):
    with Image.open(file) as image:
        image.load()
        size = list(image.size)
    images.append(dict(**pin(file), size=size, density=density, view=view, role=role))
    data = 'data:image/png;base64,' + base64.b64encode(file.read_bytes()).decode()
    return (f'<figure data-density="{density}" data-view="{view}"><figcaption>{html.escape(title)}</figcaption>'
        f'<img src="{data}" width="{size[0]}" height="{size[1]}" loading="lazy" decoding="async" alt="{html.escape(title)}"></figure>')


summary = figure(Path(audit['summary']['file']), 'All 12 new studies · fitted quick summary',
    role='FITTED_SUMMARY_NOT_NATIVE_DISPLAY_SCALE')
rows = [row for row in export['records'] if 'mother' in row]
assert len(rows) == 12
cards = []
for row in rows:
    comparisons = []
    for density in [2, 4]:
        for view, title in [('original', 'Original low-resolution control'), ('new', 'New continuous HD')]:
            suffix = 'original' if view == 'original' else 'hd'
            file = ROOT / f'actual-density-atlas-v2/{row["member"]}-rubble-{density}x-{suffix}.png'
            role = 'ORIGINAL_ENLARGED_REFERENCE_NOT_HD' if view == 'original' else 'AUTHORED_ACTUAL_DENSITY_PIXELS'
            comparisons.append(figure(file, f'{row["identity"]} / {title} / {density}X', density, view, role))
    maps = ', '.join(row['maps'])
    cards.append(f'<article id="{row["identity"]}"><h2>{row["identity"]}</h2><p>{html.escape(row["member"])} · {html.escape(maps)}</p>'
        f'<div class="pair">{"".join(comparisons)}</div></article>')
native = []
representatives = ['CASTL05A', 'CASTL05D', 'CASTL05G', 'CAMACH', 'CALA10', 'CAMORR04', 'CAHSE06']
for density in [2, 4]:
    folder = ROOT / ('native-2x-v2' if density == 2 else 'native-4x-v1')
    file = folder / 'report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert sum(len(row['sources']) for row in report['maps']) == 12
    reports.append(pin(file))
    entries = {row['name']: (case['mapId'], row) for case in report['maps'] for row in case['sources']}
    for name in representatives:
        map_id, row = entries[name]
        capture = row['capture']
        assert not capture['rescaled'] and capture['activeNativeExplosionEffects'] == []
        native.append(figure(folder / capture['file'],
            f'{name} / {map_id} / actual Mac {density}X / native rubble after effects finish', density, 'new',
            'ACTUAL_MAC_UNSCALED_FRAMEBUFFER_CROP'))
stadium = []
for density in [2, 4]:
    folder = ROOT / ('native-2x-v2' if density == 2 else 'native-4x-v1')
    report = read(folder / 'report.json')
    case, = [case for case in report['maps'] if case['mapId'] == 'yr:rushhr.map']
    for state in ['normal', 'damaged']:
        capture = case[state + 'Stadium']
        assert len(capture['sections']) == 8 and capture['originalMapPositionsUnchanged']
        stadium.append(figure(folder / capture['file'],
            f'Complete original stadium / {state} / actual Mac {density}X', density, 'new',
            'ACTUAL_MAC_UNSCALED_FRAMEBUFFER_EIGHT_ORIGINAL_SECTIONS'))
    if density == 4:
        for state in ['originalNormal', 'originalDamaged']:
            capture = report['originalStadium'][state + 'Stadium']
            stadium.append(figure(folder / capture['file'], f'Complete original stadium / {state} / actual Original',
                density, 'original', 'ACTUAL_MAC_ORIGINAL_FRAMEBUFFER_EIGHT_ORIGINAL_SECTIONS'))
damaged = []
for density in [2, 4]:
    for view, suffix in [('original', 'original'), ('new', 'hd')]:
        file = ROOT / f'actual-density-atlas-v2/stadium-d-damaged-{density}x-{suffix}.png'
        damaged.append(figure(file, f'Stadium D damaged / {view} / {density}X', density, view,
            'ORIGINAL_ENLARGED_REFERENCE_NOT_HD' if view == 'original' else 'EXACT_ACCEPTED_STADIUM_D_MATERIAL_SEMANTIC_MAPPING_CONTEXT'))
prompts = '\n\n'.join(job['id'] + '\n' + job['request'] for job in read(ROOT / 'imagegen-jobs-v2.json')['jobs'])
page = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M2.4 NewUrban Buildings · Batch 89</title><style>*{{box-sizing:border-box}}body{{margin:0;background:#101820;color:#e6edf3;font:18px/1.5 system-ui}}header,main{{max-width:1660px;margin:auto;padding:24px}}header{{position:sticky;top:0;background:#101820f5;z-index:1}}h1{{font-size:30px;margin:0 0 8px}}h2{{font-size:25px}}p{{max-width:1450px}}button{{font:inherit;background:#243341;color:white;border:1px solid #647786;border-radius:7px;padding:7px 14px;margin:3px;cursor:pointer}}button[aria-pressed=true]{{background:#167154}}.controls{{display:flex;flex-wrap:wrap;gap:14px}}figure{{margin:0;padding:12px;background:#18232d;border-radius:8px;max-width:100%;overflow:auto}}figcaption{{font-size:18px;margin-bottom:12px}}img{{display:block;max-width:none}}.pair,.native{{display:flex;flex-wrap:wrap;align-items:flex-start;gap:16px;margin-bottom:28px}}article{{margin:30px 0;content-visibility:auto;contain-intrinsic-size:auto 650px}}[hidden]{{display:none!important}}.summary img{{max-width:100%;height:auto}}body[data-fit=on] figure img{{max-width:100%;height:auto}}summary{{font-size:22px;cursor:pointer}}details{{margin:30px 0}}pre{{white-space:pre-wrap;overflow-wrap:anywhere;font-size:15px}}a{{color:#9cd3f0}}</style>
<header><h1>NewUrban buildings · Batch 89</h1><p>Review 12 new rubble studies together: continuous structure, readable larger fragments, smooth edges and restrained material grain. Accepted body materials and complete linked loops need no repeat review.</p>
<div class="controls"><div data-control="density">Density: <button data-value="2">2X</button><button data-value="4">4X</button><button data-value="all">All</button></div><div data-control="view">View: <button data-value="all">Original / HD</button><button data-value="new">HD only</button></div><div data-control="fit">Scale: <button data-value="off">Actual pixels</button><button data-value="on">Fit</button></div></div></header>
<main><section class="summary">{summary}</section><p>The summary uses fitted thumbnails. Individual controls default to actual density pixels; Original is explicitly enlarged low-resolution source art. Fit is optional. New visual contours stay inside unchanged native logical frames. World size, placement, original shadows and game behavior are preserved.</p>
{''.join(cards)}<details><summary>Actual Mac display · three original maps and native destruction</summary><p>All 12 source paths are checked once per density across Rush Hour, Downtown and Turfwar. These unscaled captures show seven representative structures after native explosion effects finish naturally. No effect is hidden. Original map files are unchanged. Reveal and stopped AI are controlled review fixtures, not a natural-match claim.</p><div class="native">{''.join(native)}</div></details>
<details><summary>Complete stadium and unchanged accepted body context</summary><p>All eight sections keep their original Rush Hour positions and native prohibition on garrisoning. Original and HD normal/damaged views provide assembly context; accepted body materials need no repeat review. The D advertising panel has the same geometry and ship identity in both original variants. Its 23 small indexed differences, including five pixel holes, use the accepted continuous HD sign through a separately recorded semantic mapping. Original source, shadows and gameplay remain exact.</p><div class="native">{''.join(stadium)}</div><div class="pair">{''.join(damaged)}</div></details><details><summary>Complete families, accepted reuse and production sources</summary><p>This batch completes twelve families and fourteen source members: CASTL05A-H, CAMACH with its complete flag, CALA10 with the accepted aligned animation, CAMORR04 and CAHSE06. Twelve new rubble studies provide 24 independent density frames. The 222 exact accepted density slots include 32 intentionally empty native flag slots; four further D damaged slots retain exact accepted HD pixels through the explicit semantic source mapping. All 93 original separate shadow slots, 175 prior families, source SHPs, indices, palettes, native logical frames, collision, picking and clocks remain unchanged.</p><p>Six built-in imagegen mothers supply newly authored continuous rubble contours and material detail. A single frame-level color gain retains broad source color without stamping the old native mask into new RGB. Source capacity is at least 4.90X. All 16 visible flag phases, 16 empty flag slots and the full 45-frame aligned CALA10 animation retain exact accepted payloads. Previous full-cycle evidence is reused; new-theater binding and ordinary tick advance pass at both densities. No per-batch Mac application or resource copy is created. Requests and project-bound raw outputs are retained in the resource ledger.</p><pre>{html.escape(prompts)}</pre></details>
<p>Mac technical checks: PASS. New artwork: PENDING USER REVIEW. Windows: NOT_RUN. Desktop contains embedded HTML and metadata only; no per-batch game package. M2.4 remains incomplete.</p></main>
<script>const state={{density:'2',view:'all',fit:'off'}};function update(){{document.body.dataset.fit=state.fit;document.querySelectorAll('figure').forEach(f=>{{f.hidden=!['density','view'].every(k=>f.dataset[k]==='any'||state[k]==='all'||f.dataset[k]===state[k]);}});document.querySelectorAll('[data-control]').forEach(group=>group.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(state[group.dataset.control]===button.dataset.value))));}}document.querySelectorAll('[data-control] button').forEach(button=>button.addEventListener('click',()=>{{state[button.parentElement.dataset.control]=button.dataset.value;update();}}));update();</script></html>'''
file = OUT / 'M2.4-NewUrban-Buildings-Batch89-Embedded.html'
file.write_text(page)
metadata = dict(status='BATCH89_12_COMPLETE_FAMILIES_NATIVE_PASS_12_NEW_STUDIES_REVIEW_PENDING',
    html=pin(file), images=images, candidate=export['candidate'], stage=pin(ROOT / 'active-stage-v2.json'),
    staticAudit=pin(ROOT / 'static-audit-v2.json'), nativeReports=reports,
    prompts=pin(ROOT / 'imagegen-jobs-v2.json'), completeFamilies=12, newRubbleStudies=12,
    exactAcceptedDensitySlots=222, semanticAdaptedDensitySlots=4, acceptedBodyStatesReused=34, newDensityFrames=24, nativeScreenshotScope=representatives,
    userReviewScope='Only twelve new rubble studies; exact accepted body and linked-loop materials need no repeat review. Stadium D semantic mapping is separately disclosed in Original/HD context.',
    browserInteractive='NOT_RUN_LOCAL_PROTOCOL_RESTRICTION_RETAINED', windows='NOT_RUN', m24Complete=False)
with (OUT / 'review-metadata-v1.json').open('x') as stream:
    stream.write(json.dumps(metadata, indent=2) + '\n')
print(json.dumps(dict(html=pin(file), embeddedPngs=len(images), newStudies=12)))
