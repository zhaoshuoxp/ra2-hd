"""Build one self-contained, native-size review for both remaining theater directions."""
import base64
import hashlib
import html
import io
import json
from pathlib import Path

from PIL import Image

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
escape = html.escape
root = Path('.artifacts/m2-4/remaining-representatives-review-batches64-65-v1')
root.mkdir(exist_ok=False)
records, scenes, details, source_boards = [], [], [], []


def picture(file, label, mode):
    pixels = file.read_bytes()
    with Image.open(io.BytesIO(pixels)) as image:
        image.load()
        width, height = image.size
    record = dict(file=str(file.resolve()), sha256=sha(file), bytes=len(pixels),
        size=[width, height], label=label, mode=mode, rescaled=False)
    records.append(record)
    encoded = base64.b64encode(pixels).decode()
    return (f'<figure class="panel mode-{mode}"><figcaption>{escape(label)}</figcaption>'
        f'<img width="{width}" height="{height}" loading="lazy" alt="{escape(label)}" '
        f'data-sha256="{record["sha256"]}" src="data:image/png;base64,{encoded}"></figure>')


def row(title, panels, closed=False):
    content = f'<div class="viewport"><div class="row">{"".join(panels)}</div></div>'
    if closed:
        return f'<details><summary>{escape(title)}</summary>{content}</details>'
    return f'<section><h3>{escape(title)}</h3>{content}</section>'


sections = []
for theater, batch, map_name, stem in [('newurban', 64, 'rushhr.map', 'rush'),
                                      ('desert', 65, 'pcofdune.map', 'dune')]:
    native = Path(f'.artifacts/m2-4/{theater}-representative-native-batch{batch}-v1')
    directories = {mode: native / f'native-{stem}-{suffix}-v1' for mode, suffix in
        [('original', 'original'), ('2', '2x'), ('4', '4x')]}
    reports = {mode: read(folder / 'report.json') for mode, folder in directories.items()}
    assert all(report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
        for report in reports.values())
    reference = reports['2']['captureRoute']
    assert all(report['captureRoute'] == reference for report in reports.values())
    parts = [f'<h2 id="{theater}">{theater.upper()} / YR / {map_name}</h2>',
        '<p>Review only the new terrain and three plants. Other objects are unchanged scene context; '
        'uncovered families retain Original. The last building view reuses accepted artwork.</p>']
    for index, camera in enumerate(reference):
        name = camera['name']
        title = name.replace('m2-4-' + theater + '-', '')
        panels = [picture(folder / f'{index:02d}-{name}-framebuffer.png',
            f'{theater.upper()} / {title} / {mode.upper() if mode == "original" else mode + "X"}', mode)
            for mode, folder in directories.items()]
        parts.append(row(title, panels, closed=name in ['CAWT01', 'CAOILD']))
        scenes.append(dict(theater=theater.upper(), map=map_name, camera=camera, modes=list(directories)))
    parts.append('<details><summary>Native plant damage and removal checks</summary>'
        '<p>Unscaled game crops. The original plant has one body frame; damage retains its actual '
        'native appearance until removal. No extra damage state is invented.</p>')
    actions = {mode: {action['name']: action for action in reports[mode]['urbanNativeTrees']['actions']}
        for mode in ['2', '4']}
    assert set(actions['2']) == set(actions['4']) and len(actions['2']) == 3
    for name in actions['2']:
        for state in ['normal', 'damaged', 'removed']:
            panels = []
            for mode in ['2', '4']:
                capture = actions[mode][name][state + 'Capture']
                assert capture['rescaled'] is False
                panels.append(picture(directories[mode] / capture['file'], f'{name} / {state} / {mode}X', mode))
            parts.append(row(f'{name} / {state}', panels, closed=True))
            details.append(dict(theater=theater.upper(), identity=name, state=state))
    parts.append('</details><details><summary>All source members: Original versus authored 2X / 4X</summary>'
        '<p>These optional boards show complete source sprites at the labeled density. Their Original '
        'pixels are enlarged for comparison only; they are never claimed as new artwork. '
        'Select 2X, 4X or Compare all. Game scenes above retain the native display scale.</p>')
    indices = {mode: read(native / f'all-terrain-{mode}x/index.json')['records'] for mode in ['2', '4']}
    assert [r['member'] for r in indices['2']] == [r['member'] for r in indices['4']]
    for a, b in zip(indices['2'], indices['4'], strict=True):
        parts.append(row(a['member'], [picture(Path(record['file']), a['member'] + ' / ' + mode + 'X source board', mode)
            for mode, record in [('2', a), ('4', b)]], closed=True))
        source_boards.append(dict(theater=theater.upper(), member=a['member'], kind='tmp'))
    trees = ['tree01.ubn', 'tree05.ubn', 'tree11.ubn'] if theater == 'newurban' else [
        'tree05.des', 'tree22.des', 'tree32.des']
    for member in trees:
        files = {mode: native / f'trees-{mode}x/{member}-{mode}x.png' for mode in ['2', '4']}
        if not all(file.exists() for file in files.values()):
            files = {mode: next((native / f'trees-{mode}x').glob(member + '*.png')) for mode in ['2', '4']}
        parts.append(row(member, [picture(file, member + ' / ' + mode + 'X source board', mode)
            for mode, file in files.items()], closed=True))
        source_boards.append(dict(theater=theater.upper(), member=member, kind='shp'))
    parts.append('</details>')
    sections.extend(parts)

css = '''body{margin:0;background:#15191e;color:#e8edf2;font:18px/1.5 system-ui,sans-serif}
header,main{padding:24px}header{background:#202833}h1{font-size:32px}h2{font-size:28px;margin-top:44px}
h3{font-size:21px}a{color:#9cceff}body>input{margin:12px 5px 12px 22px}label{cursor:pointer}
.viewport{overflow:auto;border:1px solid #485462;border-radius:6px;margin:14px 0}.row{display:flex;gap:16px;padding:12px}
.panel{flex:0 0 auto;margin:0}.panel img{display:block;max-width:none;height:auto}figcaption{padding:8px 0;color:#bfd3e7}
details{margin:18px 0;padding:14px;border:1px solid #3b4654;border-radius:6px}summary{cursor:pointer;font-size:20px}
#view-original:checked~main .panel:not(.mode-original),#view-2:checked~main .panel:not(.mode-2),
#view-4:checked~main .panel:not(.mode-4){display:none}#fit:checked~main .panel{flex:1 1 0;min-width:0}
#fit:checked~main .panel img{max-width:100%;height:auto}.note{padding:16px;background:#243044;border-radius:6px}
table{border-collapse:collapse}td,th{padding:10px 16px;border:1px solid #485462;text-align:left}'''
body = '''<header><h1>M2.4 / NewUrban and Desert direction review / Batches 64–65</h1>
<p>13 complete new families: 224 terrain members and six plants, each with independent 2X and 4X artwork.</p>
<p><a href="#newurban">NewUrban</a> · <a href="#desert">Desert</a> · <a href="#status">Status</a></p>
<p class="note">Review the new materials, source colors, slopes, seams and plant detail. Prior accepted buildings,
vehicles, flags and oil animations do not require another review. Native display scale is the default;
enable Fit only for convenience. This page contains every image and needs no network connection.</p></header>
<input type="radio" id="view-original" name="view"><label for="view-original">Original</label>
<input type="radio" id="view-2" name="view"><label for="view-2">2X</label>
<input type="radio" id="view-4" name="view" checked><label for="view-4">4X</label>
<input type="radio" id="view-all" name="view"><label for="view-all">Compare all</label>
<input type="checkbox" id="fit"><label for="fit">Fit images</label><main>'''
status = '''<section id="status"><h2>Delivery status</h2><table>
<tr><th>Item</th><th>Status</th></tr><tr><td>Mac arm64 native samples / Original / 2X / 4X</td><td>PASS</td></tr>
<tr><td>Tree damage, removal, Original reset and cross-theater release</td><td>PASS</td></tr>
<tr><td>New artwork acceptance</td><td>PENDING USER REVIEW</td></tr><tr><td>Windows execution</td><td>NOT_RUN</td></tr>
<tr><td>Desert road-slope family</td><td>Original; two mothers rejected for changed lane markings</td></tr>
<tr><td>Rush Hour three Americans-owned CIVP placements</td><td>Separate original-owner mapping decision pending</td></tr>
<tr><td>Full NewUrban / Desert coverage and final M2.4 delivery</td><td>INCOMPLETE</td></tr></table>
<p>Only HTML and JSON are delivered for this batch. No additional game package. Interactive browser QA was
not run because the Browser tool disallows local file URLs; all embedded images and static controls are verified.</p></section>'''
file = root / 'M2.4-NewUrban-Desert-Batches64-65-Embedded.html'
file.write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" '
    'content="width=device-width,initial-scale=1"><title>M2.4 NewUrban and Desert review</title><style>'
    + css + '</style><body>' + body + ''.join(sections) + status + '</main></body></html>')
record = dict(schema='m2-4-remaining-theater-combined-review-v1', status='MAC_TECHNICAL_PASS_VISUAL_PENDING',
    batches=[64, 65], families=13, terrainMembers=224, plantMembers=6, embeddedPngs=len(records),
    nativeCameraViews=scenes, nativeStateCrops=details, sourceBoards=source_boards, images=records,
    html=dict(file=str(file), sha256=sha(file), bytes=file.stat().st_size),
    windows='NOT_RUN', m24Complete=False, perBatchGamePackageCreated=False,
    browser='NOT_RUN_LOCAL_FILE_PROTOCOL_BLOCKED_BY_BROWSER_TOOL')
(root / file.with_suffix('.json').name).write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(dict(html=str(file), sha256=sha(file), bytes=file.stat().st_size,
    embeddedPngs=len(records), sourceMembers=len(source_boards))))
