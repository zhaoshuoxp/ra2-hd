"""Create one embedded native-scale review for all 39 new ground effects."""
import base64
import hashlib
import html
import io
import json
from pathlib import Path

from PIL import Image, ImageDraw


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


root = Path('.artifacts/m2-4/ground-effects-review-batches67-68-v2')
root.mkdir(exist_ok=False)
images, sources, native_cases, sections = [], [], [], []


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


for theater, batch, stem, map_name in [('newurban', 67, 'rush', 'rushhr.map'),
        ('desert', 68, 'monument', 'monumentvalley.map')]:
    native = Path(f'.artifacts/m2-4/{theater}-smudge-native-batch{batch}-v1')
    directories = {mode: native / f'native-{stem}-{suffix}-v1' for mode, suffix in
        [('original', 'original'), ('2', '2x'), ('4', '4x')]}
    reports = {mode: read(folder / 'report.json') for mode, folder in directories.items()}
    assert all(report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
        for report in reports.values())
    route = reports['2']['captureRoute']
    assert all(report['captureRoute'] == route for report in reports.values())
    contract = read(Path(f'desktop/environment-{theater}-hd-contract.json'))
    guide = read(native / 'source.json')
    by_name = {source['member']: source for source in guide['sources']}
    member_names = sorted(by_name)
    parts = [f'<h2 id="{theater}">Batch {batch} / {theater.upper()} / {len(member_names)} families</h2>',
        '<p>Review only the new scorch marks and impact craters. Ground, plants, buildings and '
        'vehicles retain prior accepted artwork or Original. Empty second slots remain empty.</p>']
    overview = []
    boards = {mode: {item['member']: Path(item['file']) for item in
        read(native / f'source-boards-{mode}x-v1/index.json')} for mode in ['2', '4']}
    assert set(boards['2']) == set(boards['4']) == set(member_names)
    for mode in ['2', '4']:
        density = int(mode)
        width, row_height, body_height = 1280, 300, 240
        sheet = Image.new('RGB', (width, row_height * ((len(member_names) + 1) // 2)), (28, 28, 28))
        draw = ImageDraw.Draw(sheet)
        for index, member in enumerate(member_names):
            source = by_name[member]
            frame = source['frames'][0]
            board = Image.open(boards[mode][member])
            x, y = index % 2 * 640, index // 2 * row_height
            draw.text((x + 8, y + 4), f'{member} / Original {mode}X | HD {mode}X',
                fill='white', font_size=22)
            ox, oy = frame['origin']
            w, h = frame['size']
            cw, _ = source['canvas']
            panel_width = max(cw * density, 240)
            for column in range(2):
                left = column * panel_width + (panel_width - cw * density) // 2 + ox * density
                top = 56 + oy * density
                crop = board.crop((left, top, left + w * density, top + h * density))
                assert crop.width <= 320 and crop.height <= body_height
                sheet.paste(crop, (x + column * 320 + (320 - crop.width) // 2,
                    y + 50 + (body_height - crop.height) // 2))
        file = root / f'{theater}-overview-{mode}x.png'
        sheet.save(file)
        overview.append(picture(file, f'{theater.upper()} / all new source sprites / {mode}X', mode))
    parts.append('<p>The quick sheet crops exact source-board pixels without resizing. Original pixels '
        'are nearest-enlarged comparison controls, not new art. These source-density sheets are separate '
        'from the unscaled actual game captures below.</p>')
    parts.append(row('All new source materials', overview))
    parts.append('<details><summary>Actual Mac game scenes / Original, 2X and 4X</summary>')
    for index, camera in enumerate(route):
        name = camera['name']
        parts.append(row(f'YR / {map_name} / {name}', [picture(folder / f'{index:02d}-{name}-framebuffer.png',
            f'{theater.upper()} / {name} / {mode.upper() if mode == "original" else mode + "X"}', mode)
            for mode, folder in directories.items()]))
    parts.append('</details><details><summary>Every new effect in the actual game / 2X and 4X</summary>'
        '<p>Each effect is created and removed through the native smudge renderer on a legal open tile. '
        'These controlled fixtures prove native bindings and visibility; they are not a naturally played '
        'match or a new weapon-generation test. Captures retain exact framebuffer pixels.</p>')
    cases = {mode: {case['name']: case for case in reports[mode]['newNativeDecals']['cases']}
        for mode in ['2', '4']}
    expected = {member.split('.')[0].upper() for member in member_names}
    assert set(cases['2']) == set(cases['4']) == expected
    for name in sorted(expected):
        parts.append(row(name, [picture(directories[mode] / f'{name}-native-detail.png',
            f'{theater.upper()} / {name} / native {mode}X', mode) for mode in ['2', '4']], closed=True))
        native_cases.append(dict(theater=theater.upper(), name=name,
            samples={mode: cases[mode][name] for mode in ['2', '4']}))
    parts.append('</details><details><summary>Complete source boards / all new members</summary>')
    for member in member_names:
        parts.append(row(member, [picture(boards[mode][member], f'{member} / {mode}X source board', mode)
            for mode in ['2', '4']], closed=True))
        sources.append(dict(theater=theater.upper(), member=member, sha256=by_name[member]['sha256'],
            family=contract['identities']['yr'][member.split('.')[0].upper()]))
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
header = '''<header><h1>M2.4 / NewUrban and Desert ground effects / Batches 67-68</h1>
<p>One review for 39 complete new families: NewUrban 24, Desert 15. Every family has independent 2X and 4X art.</p>
<p><a href="#newurban">NewUrban</a> · <a href="#desert">Desert</a> · <a href="#status">Status</a></p>
<p class="note">Review only the new ground-effect materials. Four exact accepted reuse families, Batch64-65
direction samples and all earlier accepted art do not need another review. Quick source sheets are open;
actual game scenes and per-family detail are optional. Native pixels are the default; Fit is optional.
All images are embedded for offline use.</p></header>
<input type="radio" id="view-original" name="view"><label for="view-original">Original scenes</label>
<input type="radio" id="view-2" name="view"><label for="view-2">2X</label>
<input type="radio" id="view-4" name="view" checked><label for="view-4">4X</label>
<input type="radio" id="view-all" name="view"><label for="view-all">Compare all</label>
<input type="checkbox" id="fit"><label for="fit">Fit images</label><main>'''
status = '''<section id="status"><h2>Status</h2><p>Mac Original/2X/4X native checks, complete-family fallback,
source hashes, allocation and disposal: PASS. New art: PENDING USER REVIEW. Windows: NOT_RUN.</p>
<p>The CIVP original-owner decision is separate and pending. Rejected Desert road mothers remain unselected.
Remaining NewUrban and Desert production and final independent milestone delivery are incomplete.</p>
<p>Only HTML and JSON are delivered for this batch. No additional game package. Interactive browser QA is
NOT_RUN because the Browser tool denies local file URLs. Embedded images and static controls are verified.</p></section>'''
file = root / 'M2.4-NewUrban-Desert-Ground-Effects-Batches67-68-Embedded.html'
file.write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" '
    'content="width=device-width,initial-scale=1"><title>M2.4 ground effects review</title><style>'
    + css + '</style><body>' + header + ''.join(sections) + status + '</main></body></html>')
report = dict(schema='m2-4-ground-effects-embedded-review-v1', status='MAC_TECHNICAL_PASS_VISUAL_PENDING',
    batches=[67, 68], families=39, members=sources, nativeCases=native_cases, images=images,
    embeddedPngs=len(images), html=dict(file=str(file), bytes=file.stat().st_size, sha256=sha(file)),
    perBatchGamePackageCreated=False, windows='NOT_RUN', m24Complete=False,
    browser='NOT_RUN_LOCAL_FILE_PROTOCOL_BLOCKED_BY_BROWSER_TOOL')
file.with_suffix('.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(dict(file=str(file), bytes=file.stat().st_size, embeddedPngs=len(images), sha256=sha(file))))
