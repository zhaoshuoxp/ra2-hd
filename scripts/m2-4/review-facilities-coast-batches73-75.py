"""Create one offline review for facilities and complete coastal families."""
import ast
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


base = Path('.artifacts/m2-4')
root = base / 'facilities-coast-review-batches73-75-v1'
root.mkdir(exist_ok=False)
images, sources, sections, evidence, exact_crops = [], [], [], [], []


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


def native_evidence(folder, **identity):
    file = folder / 'report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    evidence.append(dict(**identity, file=str(file), sha256=sha(file)))
    return report


native = base / 'newurban-facilities-native-batch73-v1'
guide = read(native / 'source.json')
members = sorted(source['member'] for source in guide['sources'])
assert len(members) == 19
boards = {mode: {record['member']: Path(record['file']) for record in
    read(native / f'source-boards-{mode}x-v1/index.json')} for mode in ['2', '4']}
sections.extend(['<h2 id="facilities">Batch 73 / NewUrban / 19 road facilities</h2>',
    '<p>All signs, traffic lights, streetlights and poles below are new. Compare each Original body '
    'with its own HD counterpart. Native separate shadows and single-body damage behavior are retained. '
    'Quick sheets contain exact source-board crops, without resizing.</p>'])
for mode in ['2', '4']:
    density, tiles = int(mode), []
    for member in members:
        source = next(item for item in guide['sources'] if item['member'] == member)
        frame = source['frames'][0]
        width, height = frame['size']
        rgba = Image.frombytes('RGBA', (width, height), (native / 'native' / frame['file']).read_bytes())
        bounds = rgba.getbbox()
        cw = source['canvas'][0] * density
        panel_width = max(cw, 240)
        ox = (panel_width - cw) // 2 + frame['origin'][0] * density
        oy = 56 + frame['origin'][1] * density
        rect = [ox + bounds[0]*density, oy + bounds[1]*density,
            ox + bounds[2]*density, oy + bounds[3]*density]
        board = Image.open(boards[mode][member]).convert('RGB')
        parts = [board.crop((rect[0] + shift, rect[1], rect[2] + shift, rect[3]))
            for shift in [0, panel_width]]
        tile = Image.new('RGB', (max(270, sum(part.width for part in parts) + 36),
            max(part.height for part in parts) + 84), (28, 28, 28))
        draw = ImageDraw.Draw(tile)
        draw.text((8, 8), member, fill='white', font_size=24)
        draw.text((8, 40), f'Original / HD {mode}X', fill='#bfd3e7', font_size=22)
        left = 12
        for part in parts:
            tile.paste(part, (left, 76))
            left += part.width + 12
        tiles.append(tile)
        exact_crops.append(dict(member=member, density=density, source=str(boards[mode][member]),
            originalRect=rect, hdRect=[rect[0]+panel_width, rect[1], rect[2]+panel_width, rect[3]], rescaled=False))
    cell_width, cell_height = max(tile.width for tile in tiles), max(tile.height for tile in tiles)
    columns = 5
    sheet = Image.new('RGB', (columns*cell_width, ((len(tiles)+columns-1)//columns)*cell_height), (28, 28, 28))
    for index, tile in enumerate(tiles):
        sheet.paste(tile, ((index % columns)*cell_width, (index//columns)*cell_height))
    file = root / f'facilities-quick-{mode}x.png'
    sheet.save(file)
    sections.append(row(f'All 19 new facilities / {mode}X', [picture(file,
        f'NEWURBAN / all 19 facilities / Original beside HD {mode}X', mode)]))
sections.append('<details><summary>Actual Mac game scenes and native damage/removal</summary>'
    '<p>Original map placements establish every binding. Six representative actions use disclosed '
    'legal duplicates and unchanged native warheads. There is one native body until removal; no '
    'extra damage state is invented. Controlled reveal and stopped AI are disclosed.</p>')
plan = read(native / 'native-plan-v2.json')
for map_name in dict.fromkeys(case['map'] for case in plan['cases']):
    cases = [case for case in plan['cases'] if case['map'] == map_name]
    folders = {str(case['density']).lower(): Path(case['output']) for case in cases}
    reports = {mode: native_evidence(folder, batch=73, map=map_name, density=mode)
        for mode, folder in folders.items()}
    assert all(report['captureRoute'] == reports['2']['captureRoute'] for report in reports.values())
    actions = next(case['actions'] for case in cases if case['density'] == 2)
    for name in actions:
        index = next(index for index, camera in enumerate(reports['2']['captureRoute']) if camera['name'] == name)
        sections.append(row(f'{map_name} / original placement / {name}', [picture(
            folder / f'{index:02d}-{name}-framebuffer.png', f'{map_name} / {name} / {mode}', mode)
            for mode, folder in folders.items()], closed=True))
        for state in ['normal', 'damaged', 'removed']:
            panels = []
            for mode in ['2', '4']:
                action = next(item for item in reports[mode]['urbanNativeProps']['actions'] if item['name'] == name)
                capture = action[state + 'Capture']
                assert capture['rescaled'] is False
                panels.append(picture(folders[mode] / capture['file'], f'{name} / {state} / native {mode}X', mode))
            sections.append(row(f'{name} / {state}', panels, closed=True))
sections.append('</details><details><summary>Every complete facility source board</summary>')
for member in members:
    sections.append(row(member, [picture(boards[mode][member], f'{member} / source {mode}X', mode)
        for mode in ['2', '4']], closed=True))
    source = next(item for item in guide['sources'] if item['member'] == member)
    sources.append(dict(batch=73, theater='NEWURBAN', member=member, sourceSha256=source['sha256']))
sections.append('</details>')

sets = {10: 'Cliffs', 12: 'Shoreline', 15: 'Cliff/water contacts', 21: 'Water and original reefs'}
for theater, batch, stem, map_name in [('newurban', 74, 'manhattan', 'manhatta.map'),
        ('desert', 75, 'dune', 'pcofdune.map')]:
    native = base / f'{theater}-coast-native-batch{batch}-v1'
    folders = {mode: native / f'native-{stem}-{suffix}-v1' for mode, suffix in
        [('original', 'original'), ('2', '2x'), ('4', '4x')]}
    reports = {mode: native_evidence(folder, batch=batch, map=map_name, density=mode)
        for mode, folder in folders.items()}
    route = reports['2']['captureRoute']
    assert all(report['captureRoute'] == route for report in reports.values())
    boards = {mode: {record['member']: record for record in
        read(native / f'source-boards-{mode}x-v1/index.json')['records']} for mode in ['2', '4']}
    assert len(boards['2']) == len(boards['4']) == 92
    groups = sorted({record['group'] for record in boards['4'].values()})
    sections.extend([f'<h2 id="{theater}">Batch {batch} / {theater.upper()} / {len(groups)} groups / 92 members</h2>',
        '<p>Review the new cliff, coast and water materials. Original contact geometry, elevations, '
        'shadows and environmental character are retained. Buildings, roads and accepted trees are context.</p>'])
    for group in groups:
        number = int(group.split('set')[-1])
        members = sorted(name for name, board in boards['4'].items() if board['group'] == group)
        representatives = sorted({members[0], members[len(members)//3], members[2*len(members)//3], members[-1]})
        if theater == 'newurban' and number == 21:
            representatives = ['water04.ubn', 'water07.ubn', 'water08.ubn', 'water14.ubn']
        panels = []
        for mode in ['2', '4']:
            tiles = [Image.open(boards[mode][member]['file']).convert('RGB') for member in representatives]
            sheet = Image.new('RGB', (sum(tile.width for tile in tiles), max(tile.height for tile in tiles)), (28, 28, 28))
            left = 0
            for tile in tiles:
                sheet.paste(tile, (left, 0))
                left += tile.width
            file = root / f'{theater}-set{number}-{mode}x-overview.png'
            sheet.save(file)
            panels.append(picture(file, f'{theater.upper()} / {sets[number]} / source {mode}X', mode))
        sections.append(row(f'Set {number}: {sets[number]} / {len(members)} members', panels))
        for index, camera in enumerate(route):
            if camera['name'] != group and not camera['name'].startswith(group + '-'):
                continue
            sections.append(row(f'Actual Mac game / YR / {map_name} / {camera["name"]}', [picture(
                folder / f'{index:02d}-{camera["name"]}-framebuffer.png',
                f'{map_name} / {camera["name"]} / {mode}', mode) for mode, folder in folders.items()], closed=True))
        sections.append('<details><summary>Every member in this complete family</summary>')
        for member in members:
            sections.append(row(member, [picture(Path(boards[mode][member]['file']),
                f'{member} / complete source board {mode}X', mode) for mode in ['2', '4']], closed=True))
            sources.append(dict(batch=batch, theater=theater.upper(), member=member,
                group=group, sourceSha256=boards['4'][member]['sourceSha256']))
        sections.append('</details>')

# Keep the previously delivered static controls and native-pixel layout exactly.
previous = ast.parse(Path('scripts/m2-4/review-trees-batches71-72.py').read_text())
css = next(ast.literal_eval(node.value) for node in previous.body if isinstance(node, ast.Assign)
    and any(isinstance(target, ast.Name) and target.id == 'css' for target in node.targets))
header = '''<header><h1>M2.4 / NewUrban facilities and coastal terrain / Batches 73-75</h1>
<p>One review / 26 complete new families / 203 members / independent 2X and 4X artwork.</p>
<p><a href="#facilities">19 facilities</a> · <a href="#newurban">NewUrban coast</a> ·
<a href="#desert">Desert coast</a> · <a href="#status">Status</a></p>
<p class="note">Review only the new facilities, cliffs, coast and water. Previously accepted art needs
no repeat review. Quick sheets are open; actual game scenes, native action details and all individual
source boards are optional. Native display pixels are the default. Fit is optional. All images are embedded.
Source controls enlarge Original pixels only for comparison; the HD assets contain new authored detail.</p></header>
<input type="radio" id="view-original" name="view"><label for="view-original">Original scenes</label>
<input type="radio" id="view-2" name="view"><label for="view-2">2X</label>
<input type="radio" id="view-4" name="view" checked><label for="view-4">4X</label>
<input type="radio" id="view-all" name="view"><label for="view-all">Compare all</label>
<input type="checkbox" id="fit"><label for="fit">Fit images</label><main>'''
status = '''<section id="status"><h2>Status</h2><p>Mac Original/2X/4X, complete facility bindings,
native damage/removal, all seven coastal group paths and three original NewUrban reefs, unchanged budgets,
Original reset/reentry and bidirectional map switching/disposal: PASS. New artwork: PENDING USER REVIEW.
Windows: NOT_RUN.</p><p>NewUrban and Desert scoped original maps remain selectable with zero parser issues.
Remaining authored gaps: NewUrban 417, Desert 223. These source-member counts are not family or map totals.
CIVP ownership, historical Batch59 acceptance and rejected Desert roads remain separate unresolved items.
M2.4 and its final independent app/resource delivery remain incomplete.</p><p>HTML/JSON only; no per-batch
game package. Interactive browser QA: NOT_RUN under the existing local-file protocol denial. All embedded
PNGs, exact hashes, decoded dimensions and static controls are independently checked.</p></section>'''
file = root / 'M2.4-NewUrban-Desert-Facilities-Coast-Batches73-75-Embedded.html'
file.write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" '
    'content="width=device-width,initial-scale=1"><title>M2.4 facilities and coast review</title><style>'
    + css + '</style><body>' + header + ''.join(sections) + status + '</main></body></html>')
assert len(sources) == 203 and len(evidence) == 13
report = dict(schema='m2-4-facilities-coast-embedded-review-v1', status='MAC_TECHNICAL_PASS_VISUAL_PENDING',
    batches=[73, 74, 75], families=26, memberCount=203, members=sources, nativeReports=evidence,
    images=images, embeddedPngs=len(images), exactCrops=exact_crops,
    html=dict(file=str(file), bytes=file.stat().st_size, sha256=sha(file)),
    perBatchGamePackageCreated=False, windows='NOT_RUN', m24Complete=False,
    browser='NOT_RUN_LOCAL_FILE_PROTOCOL_BLOCKED_BY_BROWSER_TOOL')
with file.with_suffix('.json').open('x') as stream:
    stream.write(json.dumps(report, indent=2) + '\n')
print(json.dumps(dict(file=str(file), bytes=file.stat().st_size, embeddedPngs=len(images), sha256=sha(file))))
