"""Build one offline original/previous/corrected review for all nineteen reopened studies."""
import base64
import hashlib
import html
import json
from pathlib import Path

from PIL import Image

ROOT = Path('.artifacts/m2-4/newurban-rubble-continuous-r1-20261020')
PRIOR = Path('.artifacts/m2-4/newurban-buildings-batch87-20261020/review-v1')
OUT = ROOT / 'review-v2'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
audit = read(ROOT / 'static-audit-v2.json')
guide = read(Path(audit['sourceGuide']['file']))
sources = {s['member']: s for s in guide['sources']}
names = [name for name in sources if name != 'cnnewy08.shp']
assert len(names) == 19
OUT.mkdir(exist_ok=False)
images, reports = [], []


def figure(file, title, density='any', view='new', role='AUTHORED_AT_ACTUAL_DENSITY'):
    with Image.open(file) as image:
        image.load()
        size = list(image.size)
    images.append(dict(**pin(file), size=size, density=density, view=view, role=role))
    data = 'data:image/png;base64,' + base64.b64encode(file.read_bytes()).decode()
    return (f'<figure data-density="{density}" data-view="{view}"><figcaption>{html.escape(title)}</figcaption>'
        f'<img src="{data}" width="{size[0]}" height="{size[1]}" alt="{html.escape(title)}"></figure>')


summary = figure(Path(audit['summary']['file']), 'All 19 corrected studies · fitted thumbnails',
    role='FITTED_QUICK_SUMMARY_NOT_NATIVE_DISPLAY_SCALE')
cards = []
for name in names:
    identity, = sorted({binding['id'] for binding in sources[name]['bindings']})
    comparisons = []
    for density in [2, 4]:
        comparisons.append(figure(PRIOR / f'{name}-rubble-{density}x-original.png',
            f'{identity} / Original low-resolution guide / {density}X control', density, 'original',
            'ORIGINAL_ENLARGED_SOURCE_REFERENCE_NOT_HD'))
        comparisons.append(figure(PRIOR / f'{name}-rubble-{density}x-hd.png',
            f'{identity} / Previous HD · rejected / {density}X', density, 'previous', 'REJECTED_PREVIOUS_HD'))
        comparisons.append(figure(ROOT / f'actual-density-atlas-v2/{name}-rubble-{density}x-r1.png',
            f'{identity} / Corrected R1 / {density}X · actual density pixels', density, 'new'))
    shared = ' The identical source rubble is also used by CANEWY08.' if name == 'cnnewy06.shp' else ''
    cards.append(f'<article id="{identity}"><h2>{identity}</h2><p>{html.escape(name)}.{shared}</p>'
        f'<div class="pair">{"".join(comparisons)}</div></article>')
native = []
representatives = ['CANEWY20', 'CANEWY15', 'CANWY26', 'CAWASH08', 'CANEWY10', 'CANEWY11']
for density in [2, 4]:
    functional_file = ROOT / f'native-{density}x-v1/report.json'
    functional = read(functional_file)
    assert functional['status'] == 'PASS_SELECTED_NATIVE_CASES' and len(functional['correctedRubble']) == 20
    reports.append(pin(functional_file))
    folder = ROOT / f'native-settled-{density}x-v1'
    file = folder / 'report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert len(report['correctedRubble']) == 6
    reports.append(pin(file))
    for name in representatives:
        row, = [row for row in report['correctedRubble'] if row['name'] == name]
        capture = row['capture']
        assert capture['rescaled'] is False and capture['rubble']['visible']
        assert capture['activeNativeExplosionEffects'] == []
        state = 'original map starts destroyed' if row['alreadyDestroyed'] else 'native destruction of original placement'
        native.append(figure(folder / capture['file'], f'{name} / actual Mac {density}X / {state} / unscaled',
            density, 'new', 'ACTUAL_MAC_UNSCALED_FRAMEBUFFER_CROP'))
jobs = read(ROOT / 'imagegen-jobs-v2.json')['jobs']
prompts = '\n\n'.join(job['id'] + '\n' + job['request']['prompt'] for job in jobs)
page = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M2.4 NewUrban Rubble · Continuous R1</title><style>*{{box-sizing:border-box}}body{{margin:0;background:#10161c;color:#e6edf3;font:18px/1.5 system-ui}}header,main{{max-width:1660px;margin:auto;padding:24px}}header{{position:sticky;top:0;background:#10161cf5;z-index:1}}h1{{font-size:30px;margin:0 0 8px}}h2{{font-size:25px}}p{{max-width:1400px}}button{{font:inherit;background:#243341;color:white;border:1px solid #647786;border-radius:7px;padding:7px 14px;margin:3px;cursor:pointer}}button[aria-pressed=true]{{background:#167154}}.controls{{display:flex;flex-wrap:wrap;gap:14px}}figure{{margin:0;padding:12px;background:#18232d;border-radius:8px;max-width:100%;overflow:auto}}figcaption{{font-size:18px;margin-bottom:12px}}img{{display:block;max-width:none}}.pair,.native{{display:flex;flex-wrap:wrap;align-items:flex-start;gap:16px;margin-bottom:28px}}article{{margin:30px 0}}[hidden]{{display:none!important}}.summary img{{max-width:100%;height:auto}}body[data-fit=on] figure img{{max-width:100%;height:auto}}summary{{font-size:22px;cursor:pointer}}details{{margin:30px 0}}pre{{white-space:pre-wrap;overflow-wrap:anywhere;font-size:15px}}</style>
<header><h1>NewUrban rubble · Continuous structure R1</h1><p>All 19 new rubble studies are repainted. Review clearer material, quieter debris, smooth lines and complete continuous edges. The 60 accepted building body states and all other accepted artwork stay unchanged.</p>
<div class="controls"><div data-control="density">Density: <button data-value="2">2X</button><button data-value="4">4X</button><button data-value="all">All</button></div><div data-control="view">View: <button data-value="all">Compare all</button><button data-value="new">Corrected R1</button></div><div data-control="fit">Scale: <button data-value="off">Actual pixels</button><button data-value="on">Fit</button></div></div></header>
<main><section class="summary">{summary}</section><p>The summary uses fitted thumbnails. Individual comparisons below default to actual density pixels; Original controls are explicitly enlarged low-resolution references. Fit is optional. New outlines follow the repainted structures inside the unchanged original game frame. Original world size, placement, shadows and gameplay remain unchanged.</p>
{''.join(cards)}<details><summary>Actual Mac display · original map placements and native destruction</summary><p>Both densities exercise all 20 complete source paths on the unchanged Manhattan map. CANEWY10 and CANEWY11 already start destroyed. These captures are unscaled framebuffer crops. Inherited reveal and stopped AI are controlled review fixtures; no natural-match claim.</p><div class="native">{''.join(native)}</div></details>
<details><summary>Production sources and review scope</summary><p>Built-in imagegen provides ten selected source mothers plus one retained layout repair. Exact prompts, raw source copies, original guides and failures are pinned in the task resource ledger. A failed native pixel-mask attempt and an unselected cross-row export are retained. Final registration separates complete subjects before sampling independent 2X/4X outputs. Only corrected rubble slot 3 changes; accepted body frames, native owner/contact data, logical frames and original shadow sources remain exact.</p><pre>{html.escape(prompts)}</pre></details>
<p>Mac technical checks: PASS. Corrected artwork: PENDING USER REVIEW. Windows: NOT_RUN. No per-batch game package. M2.4 remains incomplete.</p></main>
<script>const state={{density:'2',view:'all',fit:'off'}};function update(){{document.body.dataset.fit=state.fit;document.querySelectorAll('figure').forEach(f=>{{f.hidden=!['density','view'].every(k=>f.dataset[k]==='any'||state[k]==='all'||f.dataset[k]===state[k]);}});document.querySelectorAll('[data-control]').forEach(group=>group.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(state[group.dataset.control]===button.dataset.value))));}}document.querySelectorAll('[data-control] button').forEach(button=>button.addEventListener('click',()=>{{state[button.parentElement.dataset.control]=button.dataset.value;update();}}));update();</script></html>'''
file = OUT / 'M2.4-NewUrban-Rubble-Continuous-R1-Embedded.html'
file.write_text(page)
metadata = dict(status='CORRECTED_19_STUDIES_NATIVE_PASS_VISUAL_PENDING', html=pin(file), images=images,
    candidate=read(ROOT / 'selection-v1.json')['candidate'], stage=pin(ROOT / 'active-stage-v1.json'),
    staticAudit=pin(ROOT / 'static-audit-v2.json'), nativeReports=reports, prompts=pin(ROOT / 'imagegen-jobs-v2.json'),
    feedback=pin(ROOT / 'user-feedback-20261020.json'), correctedStudies=19, completeFamilies=20,
    correctedDensityFrames=40, exactAcceptedBodyDensityFrames=120,
    userReviewScope='Only nineteen corrected rubble studies; do not review accepted building bodies or unrelated artwork again.',
    browserInteractive='NOT_RUN_LOCAL_PROTOCOL_RESTRICTION_RETAINED', windows='NOT_RUN', m24Complete=False)
with (OUT / 'review-metadata-v1.json').open('x') as stream:
    stream.write(json.dumps(metadata, indent=2) + '\n')
print(json.dumps(dict(html=pin(file), embeddedPngs=len(images), correctedStudies=19)))
