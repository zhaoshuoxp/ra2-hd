"""Create one offline actual-density review of only the thirty-seven new rubble studies."""
import base64
import hashlib
import html
import json
from pathlib import Path

from PIL import Image

ROOT = Path('.artifacts/m2-4/newurban-buildings-batch88-20261020')
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


summary = figure(Path(audit['summary']['file']), 'All 37 new studies · fitted quick summary',
    role='FITTED_SUMMARY_NOT_NATIVE_DISPLAY_SCALE')
rows = [row for row in export['records'] if 'mother' in row]
assert len(rows) == 37
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
representatives = ['CAMIAM06', 'CAPARS06', 'CANWY05', 'CABUNK02', 'CABARN02', 'CATEXS04', 'CACHIG01']
for density in [2, 4]:
    folder = ROOT / f'native-{density}x-v2'
    file = folder / 'report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert sum(len(row['sources']) for row in report['maps']) == 39
    reports.append(pin(file))
    entries = {row['name']: (case['mapId'], row) for case in report['maps'] for row in case['sources']}
    for name in representatives:
        map_id, row = entries[name]
        capture = row['capture']
        assert not capture['rescaled'] and capture['activeNativeExplosionEffects'] == []
        native.append(figure(folder / capture['file'],
            f'{name} / {map_id} / actual Mac {density}X / native rubble after effects finish', density, 'new',
            'ACTUAL_MAC_UNSCALED_FRAMEBUFFER_CROP'))
prompts = '\n\n'.join(job['id'] + '\n' + job['request'] for job in read(ROOT / 'imagegen-jobs-v1.json')['jobs'])
page = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M2.4 NewUrban Buildings · Batch 88</title><style>*{{box-sizing:border-box}}body{{margin:0;background:#101820;color:#e6edf3;font:18px/1.5 system-ui}}header,main{{max-width:1660px;margin:auto;padding:24px}}header{{position:sticky;top:0;background:#101820f5;z-index:1}}h1{{font-size:30px;margin:0 0 8px}}h2{{font-size:25px}}p{{max-width:1450px}}button{{font:inherit;background:#243341;color:white;border:1px solid #647786;border-radius:7px;padding:7px 14px;margin:3px;cursor:pointer}}button[aria-pressed=true]{{background:#167154}}.controls{{display:flex;flex-wrap:wrap;gap:14px}}figure{{margin:0;padding:12px;background:#18232d;border-radius:8px;max-width:100%;overflow:auto}}figcaption{{font-size:18px;margin-bottom:12px}}img{{display:block;max-width:none}}.pair,.native{{display:flex;flex-wrap:wrap;align-items:flex-start;gap:16px;margin-bottom:28px}}article{{margin:30px 0;content-visibility:auto;contain-intrinsic-size:auto 650px}}[hidden]{{display:none!important}}.summary img{{max-width:100%;height:auto}}body[data-fit=on] figure img{{max-width:100%;height:auto}}summary{{font-size:22px;cursor:pointer}}details{{margin:30px 0}}pre{{white-space:pre-wrap;overflow-wrap:anywhere;font-size:15px}}a{{color:#9cd3f0}}</style>
<header><h1>NewUrban buildings · Batch 88</h1><p>Review 37 new rubble studies together: continuous structure, readable larger fragments, smooth edges and restrained material grain. The 117 accepted normal/damaged/occupied states need no repeat review.</p>
<div class="controls"><div data-control="density">Density: <button data-value="2">2X</button><button data-value="4">4X</button><button data-value="all">All</button></div><div data-control="view">View: <button data-value="all">Original / HD</button><button data-value="new">HD only</button></div><div data-control="fit">Scale: <button data-value="off">Actual pixels</button><button data-value="on">Fit</button></div></div></header>
<main><section class="summary">{summary}</section><p>The summary uses fitted thumbnails. Individual controls default to actual density pixels; Original is explicitly enlarged low-resolution source art. Fit is optional. New visual contours stay inside unchanged native logical frames. World size, placement, original shadows and game behavior are preserved.</p>
{''.join(cards)}<details><summary>Actual Mac display · four original maps and native destruction</summary><p>All 39 source paths are checked once per density across Rush Hour, Manhattan, Austin and Turfwar. These unscaled captures show seven representative structures after native explosion effects finish naturally. No effect is hidden. Original map files are unchanged. Reveal and stopped AI are controlled review fixtures, not a natural-match claim.</p><div class="native">{''.join(native)}</div></details>
<details><summary>Complete families, accepted reuse and production sources</summary><p>This batch completes 39 source families. All 117 accepted normal/damaged/occupied states (234 density frames) are byte-identical. CANEWY07 reuses the newly accepted source-identical R1 rubble (two density frames), retaining its own original origin and shadows. CAFARM02 preserves its unused source-identical rubble slot; original LeaveRubble remains disabled and destruction removes the object. These reused or unused slots need no visual review.</p><p>Nineteen built-in imagegen mothers provide 37 distinct new rubble studies and independent 2X/4X material exports. Full-master subject registration separates complete sprites before sampling. New continuous coverage replaces coarse source pixel holes only inside the exact original logical frame. Source SHP, indices, palettes, collision, picking and all 156 original shadow slots remain unchanged. Exact requests, project-bound raw outputs and source hashes are in the resource ledger.</p><pre>{html.escape(prompts)}</pre></details>
<p>Mac technical checks: PASS. New artwork: PENDING USER REVIEW. Windows: NOT_RUN. Desktop contains embedded HTML and metadata only; no per-batch game package. M2.4 remains incomplete.</p></main>
<script>const state={{density:'2',view:'all',fit:'off'}};function update(){{document.body.dataset.fit=state.fit;document.querySelectorAll('figure').forEach(f=>{{f.hidden=!['density','view'].every(k=>f.dataset[k]==='any'||state[k]==='all'||f.dataset[k]===state[k]);}});document.querySelectorAll('[data-control]').forEach(group=>group.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(state[group.dataset.control]===button.dataset.value))));}}document.querySelectorAll('[data-control] button').forEach(button=>button.addEventListener('click',()=>{{state[button.parentElement.dataset.control]=button.dataset.value;update();}}));update();</script></html>'''
file = OUT / 'M2.4-NewUrban-Buildings-Batch88-Embedded.html'
file.write_text(page)
metadata = dict(status='BATCH88_39_COMPLETE_FAMILIES_NATIVE_PASS_37_NEW_STUDIES_REVIEW_PENDING',
    html=pin(file), images=images, candidate=export['candidate'], stage=pin(ROOT / 'active-stage-v1.json'),
    staticAudit=pin(ROOT / 'static-audit-v2.json'), nativeReports=reports,
    prompts=pin(ROOT / 'imagegen-jobs-v1.json'), completeFamilies=39, newRubbleStudies=37,
    acceptedBodyStatesReused=117, newDensityFrames=74, nativeScreenshotScope=representatives,
    userReviewScope='Only 37 new rubble studies; all accepted bodies and shared R1 rubble need no repeat review.',
    browserInteractive='NOT_RUN_LOCAL_PROTOCOL_RESTRICTION_RETAINED', windows='NOT_RUN', m24Complete=False)
with (OUT / 'review-metadata-v1.json').open('x') as stream:
    stream.write(json.dumps(metadata, indent=2) + '\n')
print(json.dumps(dict(html=pin(file), embeddedPngs=len(images), newStudies=37)))
