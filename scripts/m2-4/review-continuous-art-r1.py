"""Embed corrected source members and matched native views in one review."""
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
source_root = base / 'continuous-art-correction-r3-20261018'
root = base / 'continuous-art-review-r4-20261018'
root.mkdir(exist_ok=False)
images, parts, members, evidence = [], [], [], []


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
    return (f'<details><summary>{html.escape(title)}</summary>{content}</details>' if closed else
        f'<section><h3>{html.escape(title)}</h3>{content}</section>')


specs = [
    ('facilities', 73, 'newurban-facilities-native-batch73-v1',
        ['lt_gen01.ubn', 'lt_sgn03.ubn', 'pole01.ubn', 'sign01.ubn', 'trff01.ubn', 'trff03.ubn']),
    ('newurban', 74, 'newurban-coast-native-batch74-v1',
        ['cliff01.ubn', 'cliff21.ubn', 'wcliff15.ubn', 'shore01.ubn', 'water08.ubn']),
    ('desert', 75, 'desert-coast-native-batch75-v1',
        ['cliff04.des', 'cliff20.des', 'shore01.des', 'water04.des']),
]
for kind, batch, old_native, examples in specs:
    native = base / old_native
    guide = {item['member']: item for item in read(native / 'source.json')['sources']}
    new_boards, old_boards = {}, {}
    for mode in ['2', '4']:
        for target, folder in [(new_boards, source_root / f'{kind}-boards-{mode}x'),
                (old_boards, native / f'source-boards-{mode}x-v1')]:
            index = read(folder / 'index.json')
            target[mode] = {item['member']: item for item in (index if isinstance(index, list) else index['records'])}
    assert set(new_boards['2']) == set(new_boards['4']) == set(guide)
    parts.extend([f'<h2 id="{kind}">Batch {batch} / {kind.upper()} / {len(guide)} corrected members</h2>',
        '<p>Quick comparisons show Original, the rejected previous HD and corrected R1, at exact '
        'source-density pixels. Review continuous structure, clean small edges and authored material '
        'detail. No image is enlarged to imply new detail.</p>'])
    for member in examples:
        panels = []
        for mode in ['2', '4']:
            density = int(mode)
            old = Image.open(old_boards[mode][member]['file']).convert('RGB')
            new = Image.open(new_boards[mode][member]['file']).convert('RGB')
            assert old.size == new.size
            if kind == 'facilities':
                source = guide[member]
                frame = source['frames'][0]
                panel_width = old.width//2
                cw = source['canvas'][0]*density
                x = (panel_width-cw)//2 + frame['origin'][0]*density
                y = 56 + frame['origin'][1]*density
                width, height = [value*density for value in frame['size']]
                crops = [old.crop((x, y, x+width, y+height)),
                    old.crop((panel_width+x, y, panel_width+x+width, y+height)),
                    new.crop((panel_width+x, y, panel_width+x+width, y+height))]
            else:
                height = old.height//2
                crops = [old.crop((0, 0, old.width, height)), old.crop((0, height, old.width, old.height)),
                    new.crop((0, height, new.width, new.height))]
            cell_width = max(220, max(crop.width for crop in crops)+24)
            sheet = Image.new('RGB', (3*cell_width, max(crop.height for crop in crops)+70), (28, 28, 28))
            draw = ImageDraw.Draw(sheet)
            for index, (title, crop) in enumerate(zip(['Original', 'Previous HD', 'R1 / corrected'], crops)):
                draw.text((index*cell_width+12, 8), title, font_size=22, fill='white')
                sheet.paste(crop, (index*cell_width+12, 54))
            file = root / f'{member}-{mode}x-comparison.png'
            sheet.save(file)
            panels.append(picture(file, f'{member} / Original, previous HD, corrected R1 / {mode}X', mode))
        parts.append(row(member, panels))
    parts.append('<details><summary>All corrected complete source boards / Original beside R1</summary>')
    for member in sorted(guide):
        parts.append(row(member, [picture(Path(new_boards[mode][member]['file']),
            f'{member} / corrected R1 source board / {mode}X', mode) for mode in ['2', '4']], closed=True))
        members.append(dict(batch=batch, member=member, sourceSha256=guide[member]['sha256']))
    parts.append('</details>')

parts.append('<h2 id="native">Actual Mac game / matched camera / Original, previous HD and R1</h2>'
    '<p>Game captures retain native output pixels and the original camera. Buildings and accepted '
    'art and not-yet-authored ramp pieces are context. Prior native facility actions, original placements and map/rule simulation '
    'are reused because source identity and gameplay are unchanged.</p>')
native_plan = read(source_root / 'native-plan.json')
for kind, original, wanted in [
        ('newurban', base / 'newurban-coast-native-batch74-v1/native-manhattan-original-v1', [0, 1, 2, 4]),
        ('desert', base / 'desert-coast-native-batch75-v1/native-dune-original-v1', [0, 2]),
        ('facilities', base / 'newurban-facilities-native-batch73-v1/native-downtown-original-v2', [2, 4])]:
    cases = [case for case in native_plan['cases'] if Path(case['output']).name.startswith('native-'+kind+'-')]
    assert len(cases) == 2
    folders = {str(case['density']): Path(case['output']) for case in cases}
    reports = {mode: read(folder / 'report.json') for mode, folder in folders.items()}
    control = read(original / 'report.json')
    route = reports['2']['captureRoute']
    assert control['captureRoute'] == route == reports['4']['captureRoute']
    for case in cases:
        file = Path(case['output']) / 'report.json'
        assert read(file)['status'] == 'PASS_SELECTED_NATIVE_CASES' and not read(file)['errors']
        evidence.append(dict(file=str(file), sha256=sha(file), density=case['density']))
    for index in wanted:
        name = route[index]['name']
        file_name = f'{index:02d}-{name}-framebuffer.png'
        panels = [picture(original / file_name, f'{kind} / {name} / Original', 'original')]
        for case in cases:
            mode = str(case['density'])
            previous = Path(case['priorReport']).parent
            panels.append(picture(previous / file_name, f'{kind} / {name} / previous HD {mode}X', mode))
            panels.append(picture(folders[mode] / file_name, f'{kind} / {name} / corrected R1 {mode}X', mode))
        parts.append(row(f'{kind.upper()} / {name}', panels, closed=True))

previous = ast.parse(Path('scripts/m2-4/review-trees-batches71-72.py').read_text())
css = next(ast.literal_eval(node.value) for node in previous.body if isinstance(node, ast.Assign)
    and any(isinstance(target, ast.Name) and target.id == 'css' for target in node.targets))
header = '''<header><h1>M2.4 / Continuous HD structure correction / Batches 73-75 / R1</h1>
<p>26 complete corrected families / 203 members / independent 2X and 4X exports.</p>
<p><a href="#facilities">Small facilities</a> · <a href="#newurban">NewUrban cliffs and coast</a> ·
<a href="#desert">Desert cliffs and coast</a> · <a href="#native">Actual game</a> · <a href="#status">Status</a></p>
<p class="note">Review the changed outlines, small-object structure and cliff materials. R1 removes
retail pixel-color restoration and reconstructs visual contours. Authored master detail is preserved.
Quick Original / rejected HD / R1 comparisons are open; full source boards and game evidence are optional.
Ground tile footprint, source maps, heights, collision, shadows and gameplay remain unchanged.
All images are embedded; native pixels are the default. Fit is optional.</p></header>
<input type="radio" id="view-original" name="view"><label for="view-original">Original scenes</label>
<input type="radio" id="view-2" name="view"><label for="view-2">2X</label>
<input type="radio" id="view-4" name="view" checked><label for="view-4">4X</label>
<input type="radio" id="view-all" name="view"><label for="view-all">Compare all</label>
<input type="checkbox" id="fit"><label for="fit">Fit images</label><main>'''
status = '''<section id="status"><h2>Status</h2><p>Independent complete-family exports, bounded visual
contours, exact main ground footprint, unchanged source metadata, loader fallback/disposal, budgets and
six focused native Mac render cases: PASS. Corrected artwork: PENDING USER REVIEW. Previous Batches73-75
artwork: REJECTED for retained retail pixel structure. Windows: NOT_RUN.</p><p>No per-batch game package.
Interactive browser QA: NOT_RUN under the existing local-file protocol denial. PNG bytes, dimensions,
hashes and static controls are independently verified. M2.4 remains incomplete; separate ownership,
historical acceptance and remaining source gaps are unchanged.</p></section>'''
file = root / 'M2.4-Continuous-HD-Structure-R1-Embedded.html'
file.write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" '
    'content="width=device-width,initial-scale=1"><title>M2.4 continuous artwork R1</title><style>'
    + css + '</style><body>' + header + ''.join(parts) + status + '</main></body></html>')
assert len(members) == 203 and len(evidence) == 6
report = dict(schema='m2-4-continuous-art-review-v1', status='MAC_TECHNICAL_PASS_CORRECTED_ART_PENDING',
    families=26, memberCount=203, members=members, nativeReports=evidence, images=images,
    embeddedPngs=len(images), html=dict(file=str(file), bytes=file.stat().st_size, sha256=sha(file)),
    perBatchGamePackageCreated=False, windows='NOT_RUN', m24Complete=False)
with file.with_suffix('.json').open('x') as stream:
    stream.write(json.dumps(report, indent=2) + '\n')
print(json.dumps(dict(file=str(file), bytes=file.stat().st_size, embeddedPngs=len(images), sha256=sha(file))))
