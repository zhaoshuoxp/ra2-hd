"""Build an embedded road review with native captures and complete source boards."""
import base64
import hashlib
import html
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

root = Path('.artifacts/m2-4/desert-roads-batch78-20261019')
out = root/'review-v5'
out.mkdir(exist_ok=True)
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
receipt = read(root/'export-and-preservation-v1.json')
pack_root = Path('.local/terrain-packs')/receipt['candidate']['revision']
assert sha(pack_root/'manifest.json') == receipt['candidate']['sha256']
manifest = read(pack_root/'manifest.json')
group = next(g for g in manifest['groups'] if g['id'] == 'm2-4-desert-hybrid-roads-set20')
sources = {s['member']: s for s in read(root/'source.json')['sources']}
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 24)
boards, images = [], []
for density in [2, 4]:
    variant = next(v for v in group['variants'] if v['density'] == density)
    assert sha(pack_root/variant['file']) == variant['sha256']
    atlas = Image.frombytes('RGBA', tuple(variant['size']), (pack_root/variant['file']).read_bytes())
    offset = 0
    for member in group['members']:
        source = sources[member['member']]
        actual = [i for i in source['images'] if i['nativeOffset'] > 0]
        minx, miny = [min(i['origin'][axis]+i['offset'][axis] for i in actual) for axis in [0, 1]]
        width, height = [max(i['origin'][axis]+i['offset'][axis]+i['logical'][axis] for i in actual)
            - minimum for axis, minimum in [(0, minx), (1, miny)]]
        canvases = [Image.new('RGBA', (width*density, height*density)) for _ in range(2)]
        for image in actual:
            x, y, w, h = variant['rects'][offset+image['subTile']]
            original = Image.frombytes('RGBA', tuple(image['size']), (root/'native'/image['file']).read_bytes())
            samples = [original.resize((w, h), Image.Resampling.NEAREST), atlas.crop((x, y, x+w, y+h))]
            position = ((image['origin'][0]+image['offset'][0]-minx)*density,
                (image['origin'][1]+image['offset'][1]-miny)*density)
            for canvas, sample in zip(canvases, samples, strict=True):
                canvas.alpha_composite(sample, position)
        sheet = Image.new('RGB', (canvases[0].width*2+20, canvases[0].height+48), '#18222c')
        draw = ImageDraw.Draw(sheet)
        for index, (canvas, label) in enumerate(zip(canvases,
                ['Original / comparison enlargement only', f'{density}X / accepted materials'], strict=True)):
            x = index*(canvas.width+20)
            draw.text((x+8, 6), label, font=font, fill='white')
            sheet.paste(canvas, (x, 48), canvas)
        file = out/f'{member["member"]}-{density}x.png'
        sheet.save(file)
        record = next(r for r in receipt['records'] if r['member'] == member['member'])
        boards.append(dict(member=member['member'], density=density, file=str(file.resolve()),
            status=record['status'], actualSlots=len(actual), omittedZeroPointerSlots=len(source['images'])-len(actual)))
        offset += len(member['images'])
if '--boards-only' in sys.argv:
    (out/'boards.json').write_text(json.dumps(boards, indent=2)+'\n')
    print(json.dumps(dict(boards=len(boards), directory=str(out))))
    sys.exit(0)


def picture(file, label, density):
    image = Image.open(file)
    image.load()
    record = dict(file=str(file.resolve()), sha256=sha(file), bytes=file.stat().st_size,
        size=list(image.size), label=label, density=density)
    images.append(record)
    return (f'<figure class="d{density}"><figcaption>{html.escape(label)}</figcaption>'
        f'<img alt="{html.escape(label)}" width="{image.width}" height="{image.height}" '
        f'data-sha256="{record["sha256"]}" src="data:image/png;base64,{base64.b64encode(file.read_bytes()).decode()}"></figure>')


reports = {density: read(root/f'native-{density}x-v4/report.json') for density in [2, 4]}
assert all(r['status'] == 'PASS_SELECTED_NATIVE_CASES' and not r['errors'] for r in reports.values())
assert reports[2]['captureRoute'] == reports[4]['captureRoute']
original = read(root/'native-original-v4/report.json')
assert original['status'] == 'PASS_SELECTED_NATIVE_CASES' and not original['errors']
assert original['captureRoute'] == reports[2]['captureRoute']
sections = []
for index, camera in enumerate(reports[2]['captureRoute']):
    if index not in [0, 2, 7]:
        continue
    title = camera['name'].replace('m2-4-desert-hybrid-roads-set20-', '')
    panels = []
    for density in [4, 2]:
        file = root/f'native-{density}x-v4/{index:02d}-{camera["name"]}-framebuffer.png'
        panels.append(picture(file, f'Sahara Mirage / {title} / actual {density}X', density))
    file = root/f'native-original-v4/{index:02d}-{camera["name"]}-original-framebuffer.png'
    if not file.exists():
        file = root/f'native-original-v4/{index:02d}-{camera["name"]}-framebuffer.png'
    panels.append(picture(file, f'Sahara Mirage / {title} / Original', 'original'))
    sections.append(f'<details><summary>Game view / {html.escape(title)}</summary>{"".join(panels)}</details>')
for member in [r for r in receipt['records'] if r['status'] == 'DESERT_GROUND_MATERIAL_ADAPTATION']:
    panels = [picture(Path(b['file']), f'{b["member"]} / complete {b["density"]}X source board', b['density'])
        for b in boards if b['member'] == member['member']]
    sections.append(f'<section><h2>{html.escape(member["member"])}</h2>{"".join(panels)}</section>')
reuse = []
for member in [r for r in receipt['records'] if r['status'] == 'EXACT_ACCEPTED_PIXEL_REUSE']:
    panels = [picture(Path(b['file']), f'{b["member"]} / accepted unchanged {b["density"]}X', b['density'])
        for b in boards if b['member'] == member['member']]
    reuse.append(f'<details><summary>{html.escape(member["member"])} / unchanged donor pixels</summary>{"".join(panels)}</details>')
name = 'M2.4-Desert-Roads-Batch78-Embedded'
page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M2.4 Desert roads / Batch 78</title><style>
*{box-sizing:border-box}body{background:#121b23;color:#e9eef4;margin:0;font:20px/1.5 system-ui,sans-serif}
main{padding:24px;max-width:1760px;margin:auto}h1{font-size:36px}h2{font-size:28px}p{max-width:1120px}
input{margin:20px 6px 12px 24px}label{padding:8px;background:#283b4c;border-radius:6px;cursor:pointer}
section,details{margin:28px 0;border-top:1px solid #415268;padding-top:12px}summary{cursor:pointer;font-size:25px}
figure{margin:14px 0;overflow:auto;background:#18222c;padding:12px}img{display:block;max-width:none;height:auto}
figcaption{margin-bottom:10px}#two:checked~main figure:not(.d2),#four:checked~main figure:not(.d4),
#original:checked~main figure:not(.doriginal){display:none}#fit:checked~main img{max-width:100%;height:auto}
footer{color:#afc1d3;margin-top:30px}</style><body>
<input id="four" type="radio" name="mode" checked><label for="four">4X</label>
<input id="two" type="radio" name="mode"><label for="two">2X</label>
<input id="original" type="radio" name="mode"><label for="original">Original scenes</label>
<input id="all" type="radio" name="mode"><label for="all">Compare all</label>
<input id="fit" type="checkbox"><label for="fit">Fit images</label><main>
<h1>Desert paved roads / Batch 78</h1>
<p>One complete road family: 20 members, 170 actual source subtiles at 2X and 4X. Twelve members reuse accepted Temperate pixels exactly. Eight adapt the grass margins using the selected accepted Desert ground material. Review only those eight adaptations and their road-to-ground connections.</p>
<p>Road surfaces, markings and curves reuse accepted Temperate artwork. All target geometry, alpha, collision, tile numbering and gameplay remain unchanged. Fourteen unreferenced zero-pointer compatibility slots are excluded from artwork counts and all source boards.</p>
<p>Other scene objects are unchanged context. Uncovered objects retain Original and are outside this road review.</p>
<p>Game views retain native framebuffer scale. Source boards show each whole member at its labeled density; their Original half is enlarged only for comparison. Use Fit only when convenient. All images are embedded.</p>
'''+''.join(sections)+'<details><summary>Twelve accepted exact pixel reuses / no new visual approval needed</summary>'+''.join(reuse)+'''</details>
<footer>Mac Original / 2X / 4X, native bindings, release and reentry: PASS. Visual acceptance: PENDING. Windows: NOT_RUN. Remaining NewUrban / Desert coverage and M2.4 final delivery: INCOMPLETE. No new per-batch game package.</footer></main></body></html>'''
file = out/(name+'.html')
file.write_text(page)
metadata = dict(status='MAC_TECHNICAL_PASS_VISUAL_PENDING', candidate=receipt['candidate'],
    html=dict(file=str(file.resolve()), sha256=sha(file), bytes=file.stat().st_size),
    images=images, boards=boards, completeFamilies=1, completeMembers=20, actualSubtiles=170,
    unchangedAcceptedMembers=12, adaptedMembers=8, nativeSuiteSha256=sha(root/'native-suite-v4.json'),
    windows='NOT_RUN', userAcceptance='PENDING',
    m24Complete=False, perBatchGamePackageCreated=False)
(out/(name+'.json')).write_text(json.dumps(metadata, indent=2)+'\n')
print(json.dumps(dict(html=str(file), images=len(images), bytes=file.stat().st_size, sha256=sha(file))))
