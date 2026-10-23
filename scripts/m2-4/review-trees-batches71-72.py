"""Build a single offline tree review with source sheets and native game evidence."""
import base64
import hashlib
import html
import io
import json
from pathlib import Path

from PIL import Image


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


base = Path('.artifacts/m2-4')
root = base / 'trees-review-batches71-72-v1'
root.mkdir(exist_ok=False)
images, sections, sources, evidence = [], [], [], []
plan = read(base / 'trees-batches71-72-native-plan-v2.json')


def picture(file, label, mode):
    data = file.read_bytes()
    with Image.open(io.BytesIO(data)) as pixels:
        pixels.load()
        size = list(pixels.size)
    images.append(dict(file=str(file.resolve()), label=label, mode=mode, bytes=len(data),
        sha256=hashlib.sha256(data).hexdigest(), size=size))
    return (f'<figure class="panel mode-{mode}"><figcaption>{html.escape(label)}</figcaption>'
        f'<img src="data:image/png;base64,{base64.b64encode(data).decode()}" '
        f'width="{size[0]}" height="{size[1]}" alt="{html.escape(label)}" loading="lazy"></figure>')


def row(title, panels, closed=False):
    content = '<div class="viewport"><div class="row">' + ''.join(panels) + '</div></div>'
    if closed:
        return f'<details><summary>{html.escape(title)}</summary>{content}</details>'
    return f'<section><h3>{html.escape(title)}</h3>{content}</section>'


for theater, batch, count in [('newurban', 71, 23), ('desert', 72, 16)]:
    native = base / f'{theater}-tree-native-batch{batch}-v1'
    guide = read(native / 'source.json')
    members = sorted(source['member'] for source in guide['sources'])
    assert len(members) == count
    parts = [f'<h2 id="{theater}">Batch {batch} / {theater.upper()} / {count} new tree families</h2>',
        '<p>Review only these new trees. Every species keeps its own original colors, anatomy, trunk, '
        'canopy openings and separate native shadow. Accepted ground, plants and buildings need no repeat review.</p>']
    parts.append(row('All new trees / exact source-density crops', [picture(
        native / f'quick-overview-{mode}x-v1.png',
        f'{theater.upper()} / every tree / Original beside HD {mode}X', mode) for mode in ['2', '4']]))
    parts.append('<p>Quick sheets crop exact source-board pixels without resizing. Original pixels '
        'are nearest-enlarged comparison controls. The game screenshots below retain exact native display pixels.</p>')
    parts.append('<details><summary>Actual Mac game scenes / unchanged official maps</summary>')
    selected_cases = [case for case in plan['cases'] if case['theater'] == theater.upper()]
    covered = {'2': set(), '4': set()}
    for map_name in dict.fromkeys(case['map'] for case in selected_cases):
        cases = [case for case in selected_cases if case['map'] == map_name]
        folders = {str(case['density']).lower(): Path(case['output']) for case in cases}
        reports = {mode: read(folder / 'report.json') for mode, folder in folders.items()}
        assert all(report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
            for report in reports.values())
        route = reports['2']['captureRoute']
        assert all(report['captureRoute'] == route for report in reports.values())
        for mode in ['2', '4']:
            trees = reports[mode]['urbanNativeTrees']
            assert trees['status'] == 'PASS_ORIGINAL_TREE_BINDINGS_AND_REPRESENTATIVE_NATIVE_WARHEAD_DAMAGE_REMOVAL'
            covered[mode].update(original['name'] for original in trees['originals'])
        for mode, folder in folders.items():
            evidence.append(dict(theater=theater.upper(), map=map_name, mode=mode,
                file=str(folder / 'report.json'), sha256=sha(folder / 'report.json')))
        for index, camera in enumerate(route):
            parts.append(row(f'YR / {map_name} / {camera["name"]}', [picture(
                folder / f'{index:02d}-{camera["name"]}-framebuffer.png',
                f'{map_name} / {camera["name"]} / {mode.upper() if mode == "original" else mode + "X"}', mode)
                for mode, folder in folders.items()], closed=True))
    parts.append('</details><details><summary>Representative native damage and removal</summary>'
        '<p>Original placements establish bindings. Actions use disclosed legal duplicates and unchanged '
        'native warheads. Each source has one body: native damage retains it until native removal. '
        'No extra damage artwork is invented. These controlled checks are separate from natural-match play.</p>')
    for case in selected_cases:
        if case['density'] != 2:
            continue
        folder2 = Path(case['output'])
        folder4 = Path(next(row['output'] for row in selected_cases
            if row['map'] == case['map'] and row['density'] == 4))
        reports = {mode: read(folder / 'report.json') for mode, folder in [('2', folder2), ('4', folder4)]}
        actions = {mode: {item['name']: item for item in report['urbanNativeTrees']['actions']}
            for mode, report in reports.items()}
        assert set(actions['2']) == set(actions['4']) == set(case['actions'])
        for name in case['actions']:
            for state in ['normal', 'damaged', 'removed']:
                panels = []
                for mode, folder in [('2', folder2), ('4', folder4)]:
                    capture = actions[mode][name][state + 'Capture']
                    assert capture['rescaled'] is False
                    panels.append(picture(folder / capture['file'], f'{name} / {state} / native {mode}X', mode))
                parts.append(row(f'{case["map"]} / {name} / {state}', panels, closed=True))
    assert covered['2'] == covered['4'] == set(plan['coveredNames'][theater.upper()])
    parts.append('</details><details><summary>Every complete source board / Original beside HD</summary>')
    boards = {mode: {item['member']: Path(item['file']) for item in
        read(native / f'source-boards-{mode}x-v1/index.json')} for mode in ['2', '4']}
    for member in members:
        parts.append(row(member, [picture(boards[mode][member], f'{member} / {mode}X source board', mode)
            for mode in ['2', '4']], closed=True))
        source = next(item for item in guide['sources'] if item['member'] == member)
        sources.append(dict(theater=theater.upper(), member=member, sha256=source['sha256'],
            palette=source['palette'], totalFrames=source['totalFrames']))
    parts.append('</details>')
    sections.extend(parts)

css = '''body{margin:0;background:#15191e;color:#e8edf2;font:18px/1.5 system-ui,sans-serif}
header,main{padding:24px}header{background:#202833}h1{font-size:32px}h2{font-size:28px;margin-top:44px}
h3{font-size:22px}a{color:#9cceff}body>input{margin:12px 5px 12px 22px}label{cursor:pointer}
.viewport{overflow:auto;border:1px solid #485462;border-radius:6px;margin:14px 0}.row{display:flex;gap:16px;padding:12px}
.panel{flex:0 0 auto;margin:0}.panel img{display:block;max-width:none;height:auto}figcaption{padding:8px 0;color:#bfd3e7}
details{margin:18px 0;padding:14px;border:1px solid #3b4654;border-radius:6px}summary{cursor:pointer;font-size:21px}
#view-original:checked~main .panel:not(.mode-original),#view-2:checked~main .panel:not(.mode-2),
#view-4:checked~main .panel:not(.mode-4){display:none}#fit:checked~main .panel{flex:1 1 0;min-width:0}
#fit:checked~main .panel img{max-width:100%;height:auto}.note{padding:16px;background:#243044;border-radius:6px}'''
header = '''<header><h1>M2.4 / NewUrban and Desert remaining trees / Batches 71-72</h1>
<p>One review for 39 complete new families: 23 NewUrban, 16 Desert. Independent 2X and 4X artwork.</p>
<p><a href="#newurban">NewUrban</a> · <a href="#desert">Desert</a> · <a href="#status">Status</a></p>
<p class="note">Review only the new tree materials, colors and shapes. All previously accepted art remains
accepted. Quick source sheets are open; full source boards and actual game evidence are optional.
Native pixels are the default; Fit is optional. All images are embedded for offline use.</p></header>
<input type="radio" id="view-original" name="view"><label for="view-original">Original scenes</label>
<input type="radio" id="view-2" name="view"><label for="view-2">2X</label>
<input type="radio" id="view-4" name="view" checked><label for="view-4">4X</label>
<input type="radio" id="view-all" name="view"><label for="view-all">Compare all</label>
<input type="checkbox" id="fit"><label for="fit">Fit images</label><main>'''
status = '''<section id="status"><h2>Status</h2><p>Mac original placements, 2X/4X, native damage/removal,
Original controls, unchanged budgets, reset/reentry and cross-theater release: PASS.
New artwork: PENDING USER REVIEW. Windows: NOT_RUN.</p><p>The CIVP ownership decision and historical
Batch59 acceptance remain separate. Rejected Desert roads remain unselected. Remaining source gaps and
final independent milestone delivery are incomplete.</p><p>HTML and JSON only; no per-batch game copy.
Interactive browser QA: NOT_RUN under the existing local-file protocol denial. Embedded PNGs and static
controls are verified separately.</p></section>'''
file = root / 'M2.4-NewUrban-Desert-Trees-Batches71-72-Embedded.html'
file.write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" '
    'content="width=device-width,initial-scale=1"><title>M2.4 tree review</title><style>'
    + css + '</style><body>' + header + ''.join(sections) + status + '</main></body></html>')
report = dict(schema='m2-4-tree-embedded-review-v1', status='MAC_TECHNICAL_PASS_VISUAL_PENDING',
    batches=[71, 72], families=39, members=sources, nativeReports=evidence, images=images,
    embeddedPngs=len(images), html=dict(file=str(file), bytes=file.stat().st_size, sha256=sha(file)),
    perBatchGamePackageCreated=False, windows='NOT_RUN', m24Complete=False,
    browser='NOT_RUN_LOCAL_FILE_PROTOCOL_BLOCKED_BY_BROWSER_TOOL')
with file.with_suffix('.json').open('x') as stream:
    stream.write(json.dumps(report, indent=2) + '\n')
print(json.dumps(dict(file=str(file), bytes=file.stat().st_size, embeddedPngs=len(images), sha256=sha(file))))
