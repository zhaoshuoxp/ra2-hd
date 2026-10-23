"""Embed matched road seam/color comparisons and all affected source members."""
import base64
import hashlib
import html
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

root = Path('.artifacts/m2-4/desert-road-network-r1-20261019')
out = root/'review-v3'
out.mkdir(exist_ok=False)
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
receipt = read(root/'export-and-preservation-v3.json')
suite = read(root/'native-suite-v3.json')
assert suite['status'] == 'PASS_MATCHED_NATIVE_2X_4X_ORIGINAL_AND_CROSS_THEATER_RELEASE'
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 24)
images, boards = [], []


def picture(file, label, density):
    image = Image.open(file)
    image.load()
    record = dict(file=str(file.resolve()), sha256=sha(file), bytes=file.stat().st_size,
        size=list(image.size), density=density, label=label)
    images.append(record)
    return (f'<figure class="d{density}"><figcaption>{html.escape(label)}</figcaption>'
        f'<img width="{image.width}" height="{image.height}" alt="{html.escape(label)}" '
        f'data-sha256="{record["sha256"]}" src="data:image/png;base64,{base64.b64encode(file.read_bytes()).decode()}"></figure>')


def pair(a, b, file, labels):
    assert a.size == b.size
    sheet = Image.new('RGB', (a.width*2+20, a.height+48), '#18222c')
    draw = ImageDraw.Draw(sheet)
    for index, (image, label) in enumerate(zip([a, b], labels, strict=True)):
        x = index*(image.width+20)
        draw.text((x+8, 7), label, fill='white', font=font)
        sheet.paste(image, (x, 48), image if image.mode == 'RGBA' else None)
    sheet.save(file)


def capture(directory, index, box):
    file = next((root/directory).glob(f'{index:02d}-*-framebuffer.png'))
    return Image.open(file).convert('RGB').crop(box)


sections = []
for index, title, stem, box in [
    (2, 'Reported slope / continuous lanes', 'reported-slope', (400, 420, 810, 750)),
    (4, 'Reported curve / color at both straight connections', 'reported-curve', (420, 470, 1050, 800)),
    (0, 'Additional slope direction 1', 'slope-direction-1', (300, 330, 1100, 850)),
    (1, 'Additional slope direction 2', 'slope-direction-2', (300, 330, 1100, 850)),
    (3, 'Additional slope direction 4', 'slope-direction-4', (300, 330, 1100, 850)),
]:
    before = capture('native-before-4x-v1', index, box)
    after = capture('native-after-4x-v3', index, box)
    file = out/f'{stem}-comparison-4x.png'
    pair(before, after, file, ['Batch 78 / before / 4X', 'R1 / corrected / 4X'])
    panels = picture(file, title+' / same-position 4X before and after', 4)
    file = out/f'{stem}-after-2x.png'
    capture('native-after-2x-v3', index, box).save(file)
    panels += picture(file, title+' / corrected actual 2X', 2)
    if index in [2, 4]:
        file = out/f'{stem}-original.png'
        capture('native-original-v3', index, box).save(file)
        panels += '<details><summary>Original control / same native camera</summary>'
        panels += picture(file, title+' / unchanged Original source', 'original')+'</details>'
        sections.append(f'<section><h2>{title}</h2>{panels}</section>')
    else:
        sections.append(f'<details><summary>{title}</summary>{panels}</details>')

context = []
for density in [4, 2]:
    file = out/f'slope-network-context-{density}x.png'
    capture(f'native-after-{density}x-v3', 2, (0, 150, 1280, 1000)).save(file)
    context.append(picture(file, f'Whole slope network / corrected {density}X / native scale', density))
sections.append('<details><summary>Whole road network / native scale context</summary>'+''.join(context)+'</details>')

native = {r['member']: r for r in read(Path('.artifacts/m2-4/desert-native-v1/source.json'))['sources']}
names = sorted({r['member'] for r in receipt['records'] if r.get('status') != 'EXACT_BODY_PRESERVED'})
assert len(names) == 16
source_sections = []
for name in names:
    frames = [i for i in native[name]['images'] if i['nativeOffset'] > 0]
    minx, miny = [min(i['origin'][axis]+i['offset'][axis] for i in frames) for axis in [0, 1]]
    width, height = [max(i['origin'][axis]+i['offset'][axis]+i['logical'][axis] for i in frames)-minimum
        for axis, minimum in [(0, minx), (1, miny)]]
    panels = []
    for density in [4, 2]:
        samples = []
        for pointer in [receipt['baseline'], receipt['candidate']]:
            pack = Path('.local/terrain-packs')/pointer['revision']
            assert sha(pack/'manifest.json') == pointer['sha256']
            manifest = read(pack/'manifest.json')
            group = next(g for g in manifest['groups'] if any(m['member'] == name for m in g['members']))
            variant = next(v for v in group['variants'] if v['density'] == density)
            assert sha(pack/variant['file']) == variant['sha256']
            atlas = Image.frombytes('RGBA', tuple(variant['size']), (pack/variant['file']).read_bytes())
            offset = 0
            for member in group['members']:
                if member['member'] == name:
                    break
                offset += len(member['images'])
            canvas = Image.new('RGBA', (width*density, height*density))
            for image in frames:
                x, y, w, h = variant['rects'][offset+image['subTile']]
                position = ((image['origin'][0]+image['offset'][0]-minx)*density,
                    (image['origin'][1]+image['offset'][1]-miny)*density)
                canvas.alpha_composite(atlas.crop((x, y, x+w, y+h)), position)
            samples.append(canvas)
        file = out/f'{name}-{density}x.png'
        pair(*samples, file, [f'Before / {density}X', f'R1 / {density}X'])
        panels.append(picture(file, f'{name} / complete source member / {density}X', density))
        boards.append(dict(member=name, density=density, activeSubtiles=len(frames)))
    source_sections.append(f'<details><summary>{name}</summary>{"".join(panels)}</details>')
sections.append('<details><summary>All 16 affected members / optional complete source comparison</summary>'
    +''.join(source_sections)+'</details>')

name = 'M2.4-Desert-Road-Network-R1-Embedded'
page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Desert road network / Batch 78 R1</title><style>
*{box-sizing:border-box}body{margin:0;background:#111a23;color:#e9eef4;font:20px/1.5 system-ui,sans-serif}
main{padding:24px;max-width:1760px;margin:auto}h1{font-size:36px;line-height:1.2}h2{font-size:28px}
p{max-width:1140px;color:#bbcad8}input{margin:20px 6px 10px 24px}label{padding:8px 14px;background:#293e51;cursor:pointer;border-radius:6px}
section,details{margin:24px 0;border-top:1px solid #3d5062;padding-top:12px}summary{cursor:pointer;font-size:24px}
figure{margin:14px 0;padding:12px;overflow:auto;background:#18222c}figcaption{margin-bottom:10px}img{display:block;max-width:none;height:auto}
#two:checked~main .d4,#four:checked~main .d2{display:none}#zoom:checked~main img{zoom:2}
footer{margin:32px 0;color:#b1c1d1;font-size:18px}</style><body>
<input id="four" type="radio" name="density" checked><label for="four">4X</label>
<input id="two" type="radio" name="density"><label for="two">2X</label>
<input id="all" type="radio" name="density"><label for="all">Compare all</label>
<input id="zoom" type="checkbox"><label for="zoom">2× inspection zoom</label><main>
<h1>Slope seams and curve color / Batch 78 R1</h1>
<p>Review the two reported locations first: slope lane joins, then curve color at both straight-road connections. Four slope members and twelve non-straight road members now share accepted asphalt detail. The eight straight-road bodies remain exact.</p>
<p>Actual before/after captures use the same original map positions. Native slope geometry, alpha and broad slope lighting remain source controlled. TMP sampling gutters now follow the accepted Temperate packing method. Sand, curbs, accepted bridge artwork and gameplay are retained.</p>
<p>Default images retain native display scale. 4X has before/after pairs; 2X shows freshly checked corrected views. Original controls and the other slope directions are optional. Unreferenced legacy zero-pointer slots are excluded from artwork boards. All images are embedded.</p>
'''+''.join(sections)+'''<footer>Mac 2X / 4X / Original, 1,001 actual road and slope placements per HD case, complete-family fallback and cross-theater release: PASS. Visual acceptance: PENDING USER. Windows: NOT_RUN. M2.4 remains incomplete. No new per-batch game package.</footer></main></body></html>'''
file = out/(name+'.html')
file.write_text(page)
metadata = dict(status='MATCHED_NATIVE_TECHNICAL_PASS_VISUAL_PENDING', candidate=receipt['candidate'],
    html=dict(file=str(file.resolve()), sha256=sha(file), bytes=file.stat().st_size), images=images, boards=boards,
    sourceMembersChanged=16, exactStraightBodies=8, newCoverageGroups=0, nativeSuiteSha256=sha(root/'native-suite-v3.json'),
    nativeScale=True, visualAcceptance='PENDING', windows='NOT_RUN', m24Complete=False, perBatchMacPackageCreated=False)
(out/(name+'.json')).write_text(json.dumps(metadata, indent=2)+'\n')
print(json.dumps(dict(file=str(file), images=len(images), bytes=file.stat().st_size, sha256=sha(file))))
