"""Embed all ten new object studies and actual Mac observations in one offline page."""
import base64
import html
from pathlib import Path

from PIL import Image
from newurban_batch89_io import pin, read, write

ROOT = Path('.artifacts/m2-4/newurban-rock-crates-batch90-20261020')
OUT = ROOT / 'review-v2'
OUT.mkdir(exist_ok=False)
export = read(ROOT / 'export-and-preservation-v1.json')
audit = read(ROOT / 'static-audit-v1.json')
images, reports = [], []


def figure(file, title, density='any', view='any', role='AUTHORED_ACTUAL_DENSITY_PIXELS'):
    with Image.open(file) as image:
        image.load()
        size = list(image.size)
    images.append(dict(**pin(file), size=size, density=density, view=view, role=role))
    data = 'data:image/png;base64,' + base64.b64encode(file.read_bytes()).decode()
    return (f'<figure data-density="{density}" data-view="{view}"><figcaption>{html.escape(title)}</figcaption>'
        f'<img src="{data}" width="{size[0]}" height="{size[1]}" loading="lazy" decoding="async" alt="{html.escape(title)}"></figure>')


summary = figure(Path(audit['summary']['file']), 'All ten new studies / actual 4X sprite pixels',
    role='ACTUAL_4X_SPRITES_SUMMARY_BOARD_OPTIONALLY_FITTED')
cards = []
for row in export['records']:
    comparisons = []
    for density in [2, 4]:
        for view, suffix, title in [('original', 'original', 'Original low-resolution control'),
                                    ('new', 'hd', 'New continuous HD')]:
            file = ROOT / f'actual-density-atlas-v1/{row["member"]}-{density}x-{suffix}.png'
            role = 'ORIGINAL_ENLARGED_REFERENCE_NOT_HD' if view == 'original' else 'AUTHORED_ACTUAL_DENSITY_PIXELS'
            comparisons.append(figure(file, f'{row["identity"]} / {title} / {density}X', density, view, role))
    cards.append(f'<article id="{row["identity"]}"><h2>{row["identity"]}</h2>'
        f'<p>{html.escape(row["member"])} / {html.escape(", ".join(row["maps"]))}</p>'
        f'<div class="pair">{"".join(comparisons)}</div></article>')
rocks, crates = [], []
for density in [2, 4]:
    folder = ROOT / ('native-2x-v3' if density == 2 else 'native-4x-v1')
    report_file = folder / 'report.json'
    report = read(report_file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert len(report['sourcePaths']) == 10
    reports.append(pin(report_file))
    evidence = report['newNativeOverlayObjects']
    assert evidence['status'] == 'PASS_ALL_8_ORIGINAL_ROCKS_AND_NATIVE_LAND_WATER_CRATE_PICKUP'
    for row in evidence['rocks']:
        capture = row['capture']
        assert not capture['rescaled']
        rocks.append(figure(folder / capture['file'],
            f'{row["name"]} / original Rush Hour placement / actual Mac {density}X', density, 'new',
            'ACTUAL_MAC_UNSCALED_FRAMEBUFFER_CROP'))
for density in [2, 4]:
    folder = ROOT / ('native-2x-v3' if density == 2 else 'native-4x-v1')
    evidence = read(folder / 'report.json')['newNativeOverlayObjects']
    for row in evidence['crates']:
        for key, title in [('beforeCapture', 'Stock generator / before pickup'),
                           ('afterCapture', 'Ordinary collector Move / after pickup')]:
            capture = row[key]
            assert not capture['rescaled']
            crates.append(figure(folder / capture['file'],
                f'{row["name"]} / {title} / actual Mac {density}X', density, 'new',
                'ACTUAL_MAC_UNSCALED_FRAMEBUFFER_CROP'))
prompts = '\n\n'.join(job['id'] + '\n' + job['request'] for job in read(ROOT / 'imagegen-jobs-v2.json')['jobs'])
page = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M2.4 NewUrban Rocks and Crates / Batch 90</title><style>*{{box-sizing:border-box}}body{{margin:0;background:#101820;color:#e6edf3;font:18px/1.5 system-ui}}header,main{{max-width:1660px;margin:auto;padding:24px}}header{{position:sticky;top:0;background:#101820f5;z-index:1}}h1{{font-size:30px;margin:0 0 8px}}h2{{font-size:25px}}p{{max-width:1450px}}button{{font:inherit;background:#243341;color:white;border:1px solid #647786;border-radius:7px;padding:7px 14px;margin:3px;cursor:pointer}}button[aria-pressed=true]{{background:#167154}}.controls{{display:flex;flex-wrap:wrap;gap:14px}}figure{{margin:0;padding:12px;background:#18232d;border-radius:8px;max-width:100%;overflow:auto}}figcaption{{font-size:18px;margin-bottom:12px}}img{{display:block;max-width:none}}.pair,.native{{display:flex;flex-wrap:wrap;align-items:flex-start;gap:16px;margin-bottom:28px}}article{{margin:30px 0;content-visibility:auto;contain-intrinsic-size:auto 350px}}[hidden]{{display:none!important}}.summary img{{max-width:100%;height:auto}}body[data-fit=on] figure img{{max-width:100%;height:auto}}summary{{font-size:22px;cursor:pointer}}details{{margin:30px 0}}pre{{white-space:pre-wrap;overflow-wrap:anywhere;font-size:15px}}a{{color:#9cd3f0}}</style>
<header><h1>NewUrban rocks and crates / Batch 90</h1><p>Review all eight new rock types and both crates together: continuous contours, clear larger forms, smooth edges and quiet material. Previously accepted families need no repeat review.</p>
<div class="controls"><div data-control="density">Density: <button data-value="2">2X</button><button data-value="4">4X</button><button data-value="all">All</button></div><div data-control="view">View: <button data-value="all">Original / HD</button><button data-value="new">HD only</button></div><div data-control="fit">Scale: <button data-value="off">Actual pixels</button><button data-value="on">Fit</button></div></div></header>
<main><section class="summary">{summary}</section><p>The summary places actual 4X sprites on one board; the board may fit the window. Individual comparisons default to actual density pixels. Original controls are explicitly enlarged low-resolution source art. Fit is optional. The native warm tan, golden ochre and orange-brown palette relationships are retained.</p>
{''.join(cards)}<details><summary>Actual Mac display / all eight original rock placements</summary><p>One unchanged official Rush Hour map contains every rock source. Both densities are checked against exact original member, SHA, palette and loading route. Other placements sharing these inputs use the same tested path. These 640 by 480 crops copy the actual framebuffer without resizing. Reveal and stopped AI are controlled review fixtures, not a natural-match claim.</p><div class="native">{''.join(rocks)}</div></details>
<details><summary>Actual Mac display / land and water crate pickup</summary><p>The existing crates option is enabled. Both crates are created by the stock generator with the existing Money powerup on legal land and water tiles. Ordinary CMIN and DLPH Move orders collect them. The native reward, pickup counter, tracked powerup removal and batched display removal pass at both densities. No map, rule, source or cooldown is changed.</p><div class="native">{''.join(crates)}</div></details>
<details><summary>Complete families and production sources</summary><p>Ten complete families add twenty independently sampled body density frames from five retained built-in imagegen mothers, with at least 13.12X source capacity. The original pixel grid is not copied into new RGB or visual alpha. One frame-wide color gain registers broad material color. All ten separate native shadow slots, original logical frames, palettes, 187 accepted prior families, collision, picking and clocks remain unchanged. Source preparation, requests, raw outputs and hashes are retained in the resource ledger.</p><pre>{html.escape(prompts)}</pre></details>
<p>Mac technical checks: PASS. New artwork: PENDING USER REVIEW. Windows: NOT_RUN. Desktop contains embedded HTML and metadata only; no per-batch game package. M2.4 remains incomplete.</p></main>
<script>const state={{density:'2',view:'all',fit:'off'}};function update(){{document.body.dataset.fit=state.fit;document.querySelectorAll('figure').forEach(f=>{{f.hidden=!['density','view'].every(k=>f.dataset[k]==='any'||state[k]==='all'||f.dataset[k]===state[k]);}});document.querySelectorAll('[data-control]').forEach(group=>group.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(state[group.dataset.control]===button.dataset.value))));}}document.querySelectorAll('[data-control] button').forEach(button=>button.addEventListener('click',()=>{{state[button.parentElement.dataset.control]=button.dataset.value;update();}}));update();</script></html>'''
file = OUT / 'M2.4-NewUrban-Rocks-Crates-Batch90-Embedded.html'
file.write_text(page)
write(OUT / 'review-metadata-v1.json', dict(
    status='BATCH90_TEN_COMPLETE_FAMILIES_NATIVE_PASS_TEN_NEW_STUDIES_REVIEW_PENDING',
    html=pin(file), images=images, candidate=export['candidate'], stage=pin(ROOT / 'active-stage-v1.json'),
    staticAudit=pin(ROOT / 'static-audit-v1.json'), nativeReports=reports,
    prompts=pin(ROOT / 'imagegen-jobs-v2.json'), completeFamilies=10, sourceMembers=10,
    newDensityFrames=20, nativeShadowSlots=10, unchangedPriorFamilies=187,
    userReviewScope='Only eight new rocks and both crates. All prior accepted art and unchanged native shadows need no repeat review.',
    browserInteractive='NOT_RUN_LOCAL_PROTOCOL_RESTRICTION_RETAINED', windows='NOT_RUN', m24Complete=False))
print(dict(html=pin(file), embeddedPngs=len(images), newStudies=10))
