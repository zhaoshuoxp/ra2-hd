"""Embed matched native road views and every complete adapted dirt-road member."""
import base64
import hashlib
import html
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path('.artifacts/m2-4/desert-dirt-roads-batch81-20261019')
out = root/'review-v7'
out.mkdir(exist_ok=False)
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
receipt = read(root/'export-and-preservation-v7.json')
pack = Path('.local/terrain-packs')/receipt['candidate']['revision']
assert sha(pack/'manifest.json') == receipt['candidate']['sha256']
manifest = read(pack/'manifest.json')
native_root = Path('.artifacts/m2-4/desert-native-v1')
sources = {s['member']: s for s in read(native_root/'source.json')['sources']}
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 24)
small_font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 19)
images, source_boards, cache = [], [], {}


def picture(file, label, density):
    im = Image.open(file)
    im.load()
    pin = dict(file=str(file.resolve()), sha256=sha(file), bytes=file.stat().st_size,
        size=list(im.size), label=label, density=density)
    images.append(pin)
    return (f'<figure class="d{density}"><figcaption>{html.escape(label)}</figcaption>'
        f'<img width="{im.width}" height="{im.height}" alt="{html.escape(label)}" '
        f'data-sha256="{pin["sha256"]}" src="data:image/png;base64,{base64.b64encode(file.read_bytes()).decode()}"></figure>')


def pair(left, right, file, labels):
    assert left.size == right.size
    sheet = Image.new('RGB', (left.width*2+20, left.height+48), '#18222c')
    draw = ImageDraw.Draw(sheet)
    for index, (im, label) in enumerate(zip([left, right], labels, strict=True)):
        x = index*(im.width+20)
        draw.text((x+8, 8), label, font=font, fill='white')
        sheet.paste(im, (x, 48), im.getchannel('A') if im.mode == 'RGBA' else None)
    sheet.save(file)


def capture(directory, index, box):
    file = next((root/directory).glob(f'{index:02d}-*-framebuffer.png'))
    return Image.open(file).convert('RGB').crop(box)


sections = []
for index, title, stem in [(2, 'Straight tracks and sand margins', 'straight'),
        (1, 'Curved track continuity', 'curve'), (0, 'Junctions and branching ruts', 'junction')]:
    panels = []
    box = (470, 350, 990, 770)
    original = capture('native-tour-original-v7', index, box)
    for density in [4, 2]:
        current = capture(f'native-tour-{density}x-v7', index, box)
        file = out/f'native-{stem}-{density}x.png'
        pair(original, current, file, ['Original / native scale', f'Batch 81 / {density}X / native scale'])
        panels.append(picture(file, title+f' / matched Original and {density}X', density))
    sections.append(f'<section><h2>{title}</h2>{"".join(panels)}</section>')

context = []
for stem, title in [('dryheat', 'Dry Heat'), ('sedona', 'Sedona Pass'),
        ('dune', 'A Little Piece of Dune'), ('sahara', 'Sahara Mirage')]:
    for index in [0, 1]:
        file = out/f'{stem}-context-{index}-4x.png'
        capture(f'native-{stem}-4x-v7', index, (210, 200, 1210, 920)).save(file)
        context.append(picture(file, f'{title} / native 4X / context {index+1}', 4))
sections.append('<details><summary>Other original maps / actual 4X connections</summary>'+''.join(context)+'</details>')

by_group = []
for group in [g for g in manifest['groups'] if g['id'] in receipt['newGroups']]:
    details, previews = [], []
    for member in group['members']:
        source = sources[member['member']]
        frames = [i for i in source['images'] if i['nativeOffset'] > 0]
        low = [min(i['origin'][axis]+i['offset'][axis] for i in frames) for axis in [0, 1]]
        high = [max(i['origin'][axis]+i['offset'][axis]+i['size'][axis] for i in frames) for axis in [0, 1]]
        dimensions = [high[axis]-low[axis] for axis in [0, 1]]
        panels = []
        for density in [4, 2]:
            original = Image.new('RGBA', tuple(v*density for v in dimensions))
            current = original.copy()
            variant = next(v for v in group['variants'] if v['density'] == density)
            file = pack/variant['file']
            if file not in cache:
                assert sha(file) == variant['sha256']
                cache[file] = Image.frombytes('RGBA', tuple(variant['size']), file.read_bytes())
            atlas = cache[file]
            offset = 0
            for other in group['members']:
                if other['member'] == member['member']:
                    break
                offset += len(other['images'])
            for frame in frames:
                path = native_root/'native'/frame['file']
                assert sha(path) == frame['rgbaSha256']
                guide = Image.frombytes('RGBA', tuple(frame['size']), path.read_bytes()).resize(
                    tuple(v*density for v in frame['size']), Image.Resampling.NEAREST)
                position = tuple((frame['origin'][axis]+frame['offset'][axis]-low[axis])*density for axis in [0, 1])
                original.alpha_composite(guide, position)
                x, y, w, h = variant['rects'][offset+frame['subTile']]
                current.alpha_composite(atlas.crop((x, y, x+w, y+h)), position)
            file = out/f'{member["member"]}-{density}x.png'
            pair(original, current, file, ['Original guide / inspection', f'Batch 81 / {density}X atlas pixels'])
            panels.append(picture(file, f'{member["member"]} / original guide and complete {density}X source', density))
            source_boards.append(dict(member=member['member'], density=density, actualSubtiles=len(frames)))
            if density == 4:
                previews.append((member['member'], current.copy()))
        details.append(f'<details id="{member["member"]}"><summary>{member["member"]}</summary>{"".join(panels)}</details>')
    columns, cell_w, cell_h = 4, 300, 195
    board = Image.new('RGB', (columns*cell_w, ((len(previews)+columns-1)//columns)*cell_h), '#18222c')
    draw = ImageDraw.Draw(board)
    for index, (name, im) in enumerate(previews):
        x, y = index % columns*cell_w, index//columns*cell_h
        draw.text((x+8, y+6), name, font=small_font, fill='white')
        im.thumbnail((cell_w-16, cell_h-40), Image.Resampling.LANCZOS)
        board.paste(im, (x+(cell_w-im.width)//2, y+32), im.getchannel('A'))
    file = out/f'{group["id"]}-overview.png'
    board.save(file)
    label = f'{group["id"]} / {len(group["members"])} members / overview thumbnails only'
    by_group.append(f'<details><summary>{group["id"]} / {len(group["members"])} members</summary>'
        +picture(file, label, 4)+''.join(details)+'</details>')
sections.append('<details><summary>All 81 complete members / quick overviews and optional source comparisons</summary>'
    +''.join(by_group)+'</details>')

name = 'M2.4-Desert-Dirt-Roads-Batch81-Embedded'
page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Desert dirt roads / Batch 81</title><style>
*{box-sizing:border-box}body{margin:0;background:#111a23;color:#e9eef4;font:20px/1.5 system-ui,sans-serif}
main{padding:24px;max-width:1760px;margin:auto}h1{font-size:36px;line-height:1.2}h2{font-size:28px}
p{max-width:1180px;color:#bdcbd9}input{margin:20px 6px 10px 24px}label{padding:8px 14px;background:#293e51;cursor:pointer;border-radius:6px}
section,details{margin:24px 0;border-top:1px solid #3d5062;padding-top:12px}summary{cursor:pointer;font-size:24px}
figure{margin:14px 0;padding:12px;overflow:auto;background:#18222c}figcaption{margin-bottom:10px}img{display:block;max-width:none;height:auto}
#two:checked~main .d4,#four:checked~main .d2{display:none}#zoom:checked~main img{zoom:2}
footer{margin:32px 0;color:#b1c1d1;font-size:18px}</style><body>
<input id="four" type="radio" name="density" checked><label for="four">4X</label>
<input id="two" type="radio" name="density"><label for="two">2X</label>
<input id="all" type="radio" name="density"><label for="all">Compare all</label>
<input id="zoom" type="checkbox"><label for="zoom">2x inspection zoom</label><main>
<h1>All remaining Desert dirt roads / Batch 81</h1>
<p>One combined review covers 81 members in three complete native sets: straight tracks, curves and junctions. Review the three matched game views first, focusing on rut continuity, clean edges and the sand transition. Existing paved-road R2 and other accepted artwork do not need another review.</p>
<p>Track detail reuses accepted Temperate artwork, with the accepted Desert sand mother supplying continuous ground material. Historical native-color contact guards are removed from this new adaptation. Native geometry, height, depth and alpha remain source controlled; original files and map contents are unchanged.</p>
<p>Game comparisons retain actual display scale and identical native camera positions. Optional atlas boards use full source pixels; Original guides are explicitly enlarged for inspection. Overview thumbnails and the optional 2x zoom are inspection tools. All images are embedded.</p>
'''+''.join(sections)+'''<footer>Mac: actual 4X bindings for all 81 members across five official maps, representative 2X, matched global Original, release and cross-theater reentry PASS. Visual acceptance PENDING USER. Windows NOT_RUN. No per-batch game package. M2.4 remains incomplete.</footer></main></body></html>'''
file = out/(name+'.html')
file.write_text(page)
metadata = dict(status='MATCHED_NATIVE_TECHNICAL_PASS_VISUAL_PENDING', candidate=receipt['candidate'],
    html=dict(file=str(file.resolve()), sha256=sha(file), bytes=file.stat().st_size), images=images,
    sourceBoards=source_boards, members=81, actualNativeSubtiles=521, actualDensitySubtiles=1042,
    compatibilitySlotsExcluded=173, actualGameScaleDefault=True, inspectionPanelsLabeled=True,
    visualAcceptance='PENDING', windows='NOT_RUN', m24Complete=False, perBatchMacPackageCreated=False)
(out/(name+'.json')).write_text(json.dumps(metadata, indent=2)+'\n')
print(json.dumps(dict(file=str(file), images=len(images), bytes=file.stat().st_size, sha256=sha(file))))
