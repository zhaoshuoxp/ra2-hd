"""Create one self-contained, native-density review for both structure batches."""
import base64
import hashlib
import html
import io
import json
from pathlib import Path

from PIL import Image

read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
evidence = Path('.artifacts/m2-4/structures-batches76-77-v1')
root = Path('.artifacts/m2-4/structures-review-batches76-77-v2')
root.mkdir(exist_ok=False)
images, sources, sections, native_reports = [], [], [], []
suite = read(evidence / 'native-suite-v1.json')
assert suite['status'] == 'PASS_FIVE_NATIVE_MAPS_ORIGINAL_2X_4X' and len(suite['cases']) == 15


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


sets = {19: 'Concrete overpasses and abutments', 25: 'Retaining and rock ramps',
    115: 'Natural cliff ramps', 117: 'Paved slopes and variants', 119: 'Military barricades'}
for theater, batch, version, count in [('newurban', 76, 1, 54), ('desert', 77, 2, 10)]:
    author = Path(f'.artifacts/m2-4/{theater}-structures-authoring-batch{batch}-v{version}')
    source = read(author / 'source.json')
    assert len(source['members']) == count
    boards = {mode: {row['member']: row for row in read(
        evidence / f'{theater}-source-boards-{mode}x/index.json')['records']} for mode in ['2', '4']}
    if theater == 'newurban':
        assert read(evidence / 'water-export-difference-audit-final-v2.json')['unaffectedNewMembers'] == 52
        for mode in ['2', '4']:
            boards[mode].update({row['member']: row for row in read(
                evidence / f'newurban-water-source-boards-{mode}x-v4/index.json')['records']})
    assert set(boards['2']) == set(boards['4']) == {member['member'] for member in source['members']}
    sections.append(f'<h2 id="{theater}">Batch {batch} / {theater.upper()} / {count} members</h2>')
    for number in sorted({member['setIndex'] for member in source['members']}):
        members = sorted(member['member'] for member in source['members'] if member['setIndex'] == number)
        representatives = ['ovrps02.ubn', 'ovrps05.ubn'] if number == 19 else sorted({members[0], members[-1]})
        for member in representatives:
            sections.append(row(f'{sets[number]} / {member}', [picture(Path(boards[mode][member]['file']),
                f'{member} / Original and authored {mode}X / actual source pixels', mode) for mode in ['2', '4']]))
        sections.append(f'<details><summary>All {len(members)} members / {html.escape(sets[number])}</summary>')
        for member in members:
            original = next(record['native'] for record in source['members'] if record['member'] == member)
            assert all(boards[mode][member]['sourceSha256'] == original['sha256'] for mode in ['2', '4'])
            if member not in representatives:
                sections.append(row(member, [picture(Path(boards[mode][member]['file']),
                    f'{member} / Original and authored {mode}X', mode) for mode in ['2', '4']], closed=True))
            sources.append(dict(theater=theater.upper(), member=member, set=number,
                sourceSha256=original['sha256']))
        sections.append('</details>')

sections.append('<h2 id="native-scenes">Actual Mac game scenes</h2><p>Same official map, camera route, '
    'logical scale and output pixels. Original controls are matched to the 2X route. Map reveal and '
    'suspended bot AI are controlled inspection fixtures; these checks establish native rendering and '
    'simulation progress, rather than natural-match or visual acceptance.</p>')
for stem in ['fight', 'downtown', 'manhattan', 'rush', 'dryheat']:
    folders = {mode: evidence / f'native-{stem}-{suffix}-v1' for mode, suffix in
        [('original', 'original'), ('2', '2x'), ('4', '4x')]}
    reports = {mode: read(folder / 'report.json') for mode, folder in folders.items()}
    route = reports['2']['captureRoute']
    assert all(report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
        and report['captureRoute'] == route for report in reports.values())
    native_reports.extend(dict(mode=mode, file=str(folder / 'report.json'),
        sha256=sha(folder / 'report.json')) for mode, folder in folders.items())
    for index, sample in enumerate(route):
        sections.append(row(f'YR / {reports["2"]["selectedMap"]} / {sample["name"]}', [picture(
            folder / f'{index:02d}-{sample["name"]}-framebuffer.png',
            f'{stem} / {mode.upper() if mode == "original" else mode + "X"} / actual Mac game', mode)
            for mode, folder in folders.items()], closed=True))

sections.append('<h2 id="temperate-reference">Accepted Temperate HD style references</h2><p>Reference '
    'only; these accepted resources need no repeat approval. Exact visible/depth matches are reused. '
    'Different source materials retain their native theater identity while following this HD treatment.</p>')
for record in read(evidence / 'temperate-style-4x/index.json')['records']:
    sections.append(row(record['member'], [picture(Path(record['file']),
        record['member'] + ' / accepted Temperate 4X reference', '4')], closed=True))

css = '''body{margin:0;background:#15191e;color:#e8edf2;font:18px/1.5 system-ui,sans-serif}
header,main{padding:24px}header{background:#202833}h1{font-size:32px}h2{font-size:28px;margin-top:44px}
h3{font-size:22px}a{color:#9cceff}body>input{margin:12px 5px 12px 22px}label{cursor:pointer}
.viewport{overflow:auto;border:1px solid #485462;border-radius:6px;margin:14px 0}.row{display:flex;gap:16px;padding:12px}
.panel{flex:0 0 auto;margin:0}.panel img{display:block;max-width:none;height:auto}figcaption{padding:8px 0;color:#bfd3e7}
details{margin:18px 0;padding:14px;border:1px solid #3b4654;border-radius:6px}summary{cursor:pointer;font-size:21px}
#view-original:checked~main .panel:not(.mode-original),#view-2:checked~main .panel:not(.mode-2),
#view-4:checked~main .panel:not(.mode-4){display:none}#fit:checked~main .panel{flex:1 1 0;min-width:0}
#fit:checked~main .panel img{max-width:100%;height:auto}.note{padding:16px;background:#243044;border-radius:6px}'''
header = '''<header><h1>M2.4 / NewUrban and Desert structures / Batches 76-77</h1>
<p>Six complete resource groups / 64 members / independent 2X and 4X exports.</p>
<p><a href="#newurban">NewUrban</a> · <a href="#desert">Desert</a> · <a href="#native-scenes">Game scenes</a> ·
<a href="#temperate-reference">Temperate reference</a> · <a href="#status">Status</a></p>
<p class="note">Review only these new ramps, paved slopes, abutments and barricades. Already accepted
art and neighboring uncovered Original resources remain scene context; those tracked gaps are still incomplete.
Each group opens with two quick comparisons; all members, game scenes and
Temperate references can be expanded. Source boards enlarge Original pixels for comparison only.
HD samples and game captures retain their native output pixels. Fit is optional. All images are embedded.</p></header>
<input type="radio" id="view-original" name="view"><label for="view-original">Original scenes</label>
<input type="radio" id="view-2" name="view"><label for="view-2">2X</label>
<input type="radio" id="view-4" name="view" checked><label for="view-4">4X</label>
<input type="radio" id="view-all" name="view"><label for="view-all">Compare all</label>
<input type="checkbox" id="fit"><label for="fit">Fit images</label><main>'''
status = '''<section id="status"><h2>Status</h2><p>Mac Original/2X/4X, all six new groups, source metadata,
bounded extra contours, complete-family fallback, unchanged budgets and both cross-theater disposal
directions: PASS. New artwork: PENDING USER REVIEW. Windows: NOT_RUN.</p><p>The updated scoped inventory
has zero parse issues. Remaining authored gaps: NewUrban 363 and Desert 202. Twelve equivalent Desert
road members await their eight different siblings before complete-family publication. Full M2.4 coverage,
acceptance and final independent app/resource delivery remain incomplete.</p><p>This batch delivers embedded
HTML and JSON only. The existing internal Mac validation host is reused. Interactive browser QA is
NOT_RUN under the existing local-file protocol denial. Embedded bytes, decoded dimensions and static
controls are independently checked.</p></section>'''
file = root / 'M2.4-NewUrban-Desert-Structures-Batches76-77-Embedded.html'
file.write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" '
    'content="width=device-width,initial-scale=1"><title>M2.4 structures review</title><style>'
    + css + '</style><body>' + header + ''.join(sections) + status + '</main></body></html>')
report = dict(schema='m2-4-structures-embedded-review-v1', status='MAC_TECHNICAL_PASS_VISUAL_PENDING',
    batches=[76, 77], families=6, memberCount=64, members=sources, nativeReports=native_reports,
    images=images, embeddedPngs=len(images), html=dict(file=str(file), bytes=file.stat().st_size, sha256=sha(file)),
    runtimeSourceHead=suite['runtimeSourceHead'], windows='NOT_RUN', m24Complete=False,
    perBatchGamePackageCreated=False, browser='NOT_RUN_LOCAL_FILE_PROTOCOL_BLOCKED_BY_BROWSER_TOOL')
file.with_suffix('.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(dict(file=str(file), bytes=file.stat().st_size, embeddedPngs=len(images), sha256=sha(file))))
