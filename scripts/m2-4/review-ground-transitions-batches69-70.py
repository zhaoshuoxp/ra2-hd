"""Create a compact embedded review with all original/native-density comparisons."""
import base64
import hashlib
import html
import io
import json
from pathlib import Path

from PIL import Image

read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
root = Path('.artifacts/m2-4/ground-transitions-review-batches69-70-v1')
root.mkdir(exist_ok=False)
images, sources, sections, native_reports = [], [], [], []


def picture(file, label, mode):
    data = file.read_bytes()
    with Image.open(io.BytesIO(data)) as pixels:
        pixels.load()
        size = list(pixels.size)
    images.append(dict(file=str(file.resolve()), label=label, mode=mode,
        bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), size=size))
    return (f'<figure class="panel mode-{mode}"><figcaption>{html.escape(label)}</figcaption>'
        f'<img src="data:image/png;base64,{base64.b64encode(data).decode()}" '
        f'width="{size[0]}" height="{size[1]}" alt="{html.escape(label)}" loading="lazy"></figure>')


def row(title, panels, closed=False):
    content = '<div class="viewport"><div class="row">' + ''.join(panels) + '</div></div>'
    if closed:
        return f'<details><summary>{html.escape(title)}</summary>{content}</details>'
    return f'<section><h3>{html.escape(title)}</h3>{content}</section>'


sets = {13: 'Thick ground', 14: 'Thick-ground transitions', 33: 'Rough ground',
    34: 'Rough-ground transitions', 39: 'Pavement transitions', 41: 'Sand',
    42: 'Sand transitions', 46: 'Pavement'}
for theater, batch, stem, map_name in [('newurban', 69, 'rush', 'rushhr.map'),
        ('desert', 70, 'dune', 'pcofdune.map')]:
    native = Path(f'.artifacts/m2-4/{theater}-ground-transitions-native-batch{batch}-v1')
    folders = {mode: native / f'native-{stem}-{suffix}-v1' for mode, suffix in
        [('original', 'original'), ('2', '2x'), ('4', '4x')]}
    reports = {mode: read(folder / 'report.json') for mode, folder in folders.items()}
    assert all(report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
        for report in reports.values())
    route = reports['2']['captureRoute']
    assert len(route) == 8 and all(report['captureRoute'] == route for report in reports.values())
    native_reports.extend(dict(theater=theater.upper(), mode=mode,
        file=str(folder / 'report.json'), sha256=sha(folder / 'report.json')) for mode, folder in folders.items())
    boards = {mode: {row['member']: row for row in read(native / f'source-boards-{mode}x-v1/index.json')['records']}
        for mode in ['2', '4']}
    assert set(boards['2']) == set(boards['4']) and len(boards['2']) == 152
    parts = [f'<h2 id="{theater}">Batch {batch} / {theater.upper()} / 8 groups / 152 members</h2>',
        '<p>Review the new ground materials and transitions. Roads, cliffs, objects and all previously '
        'accepted artwork remain scene context. Original material regions and variant directions are preserved.</p>']
    for number, title in sets.items():
        group = f'm2-4-{theater}-ground-set{number}'
        members = sorted(name for name, board in boards['4'].items() if board['group'] == group)
        assert members
        representatives = sorted({members[0], members[len(members)//3], members[2*len(members)//3], members[-1]})
        previews = []
        for mode in ['2', '4']:
            tiles = [Image.open(boards[mode][member]['file']).convert('RGB') for member in representatives]
            sheet = Image.new('RGB', (sum(tile.width for tile in tiles), max(tile.height for tile in tiles)), (28, 28, 28))
            left = 0
            for tile in tiles:
                sheet.paste(tile, (left, 0))
                left += tile.width
            file = root / f'{theater}-set{number}-{mode}x-source-overview.png'
            sheet.save(file)
            previews.append(picture(file, f'{theater.upper()} / {title} / {mode}X source overview', mode))
        parts.append(row(f'Set {number}: {title} / {len(members)} members', previews))
        index = next(i for i, camera in enumerate(route) if camera['name'] == group)
        parts.append(row(f'{title}: actual game / YR / {map_name}', [picture(
            folder / f'{index:02d}-{group}-framebuffer.png',
            f'{theater.upper()} / {title} / {mode.upper() if mode == "original" else mode + "X"}', mode)
            for mode, folder in folders.items()], closed=True))
        parts.append('<details><summary>Every member in this complete family</summary>')
        for member in members:
            parts.append(row(member, [picture(Path(boards[mode][member]['file']),
                f'{member} / {mode}X complete source board', mode) for mode in ['2', '4']], closed=True))
            sources.append(dict(theater=theater.upper(), member=member, group=group,
                sourceSha256=boards['4'][member]['sourceSha256']))
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
header = '''<header><h1>M2.4 / NewUrban and Desert ground transitions / Batches 69-70</h1>
<p>16 complete new families / 304 members / independent 2X and 4X artwork.</p>
<p><a href="#newurban">NewUrban</a> · <a href="#desert">Desert</a> · <a href="#status">Status</a></p>
<p class="note">Review only the new ground and transition materials. Batches64-68 and earlier accepted
artwork need no repeat review. Each group opens with four representative source comparisons; actual game
scenes and all individual members are optional. Source boards enlarge Original pixels for comparison only.
Game captures retain the original camera, output pixels and display ratio. Fit is optional. All images are embedded.</p></header>
<input type="radio" id="view-original" name="view"><label for="view-original">Original scenes</label>
<input type="radio" id="view-2" name="view"><label for="view-2">2X</label>
<input type="radio" id="view-4" name="view" checked><label for="view-4">4X</label>
<input type="radio" id="view-all" name="view"><label for="view-all">Compare all</label>
<input type="checkbox" id="fit"><label for="fit">Fit images</label><main>'''
status = '''<section id="status"><h2>Status</h2><p>Mac Original/2X/4X, all eight new groups per theater,
native source/geometry/alpha, complete-family fallback, budgets and cross-theater disposal: PASS.
New artwork: PENDING USER REVIEW. Windows: NOT_RUN.</p><p>The separate CIVP owner decision, unselected
rejected Desert roads, historical pending Batch59 and remaining source gaps are unchanged. Full M2.4
coverage and final independent delivery remain incomplete.</p><p>This batch delivers HTML and JSON only;
no game package. Interactive browser QA is NOT_RUN under the existing local-file protocol denial.
Embedded image bytes, decoded dimensions and static controls are verified.</p></section>'''
file = root / 'M2.4-NewUrban-Desert-Ground-Transitions-Batches69-70-Embedded.html'
file.write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" '
    'content="width=device-width,initial-scale=1"><title>M2.4 ground transitions review</title><style>'
    + css + '</style><body>' + header + ''.join(sections) + status + '</main></body></html>')
report = dict(schema='m2-4-ground-transitions-embedded-review-v1', status='MAC_TECHNICAL_PASS_VISUAL_PENDING',
    batches=[69, 70], families=16, memberCount=304, members=sources, nativeReports=native_reports,
    images=images, embeddedPngs=len(images), html=dict(file=str(file), bytes=file.stat().st_size, sha256=sha(file)),
    windows='NOT_RUN', m24Complete=False, perBatchGamePackageCreated=False,
    browser='NOT_RUN_LOCAL_FILE_PROTOCOL_BLOCKED_BY_BROWSER_TOOL')
file.with_suffix('.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(dict(file=str(file), bytes=file.stat().st_size, embeddedPngs=len(images), sha256=sha(file))))
