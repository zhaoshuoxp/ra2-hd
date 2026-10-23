"""Build an offline grouped review from the complete copied resource payload."""
import argparse
import hashlib
import html
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from owner_review import compose_owner, frame_palette

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('receipt', type=Path)
parser.add_argument('--prepared', type=Path, required=True)
args = parser.parse_args()
receipt = json.loads(args.receipt.read_text())
output = Path(receipt['folder']) / 'M2.3-Grouped-Review'
output.mkdir(exist_ok=False)
resources = Path(receipt['resources'])
contract = json.loads(Path('desktop/environment-hd-contract.json').read_text())
selection = json.loads((resources / 'environment-selection.json').read_text())
pack = resources / 'environment-packs' / selection['revision']
manifest = json.loads((pack / 'manifest.json').read_text())
baseline = json.loads(Path('.local/environment-packs/environment-m2-2-complete-v10/manifest.json').read_text())
sources = {s['member']: s for s in json.loads((args.prepared / 'source.json').read_text())['sources']}
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
assert sha(pack / 'manifest.json') == selection['sha256']
records = []
for identity, family in manifest['families'].items():
    if identity in baseline['families']:
        continue
    members = []
    for entry in family['members']:
        name = entry['member']
        source = sources[name]
        file = pack / entry['path']
        assert sha(file) == entry['sha256']
        hd = json.loads(file.read_text())
        count = len(hd['logical']['frames'])
        frames = list(range(count)) if count <= 4 else sorted({0, count // 2, count - 1})
        if any(binding['kind'] == 'infantry' for binding in source['bindings']):
            frames = sorted({0, 8, 56, 71, min(116, count - 1), count - 1})
        member = dict(member=name, manifestSha256=entry['sha256'], sourceSha256=source['sha256'],
                      nativeCanvas=source['canvas'], bodyFrames=count, sampledFrames=frames, images={})
        for density in [2, 4]:
            variant = next(v for v in hd['variants'] if v['density'] == density)
            pages = {}
            samples = []
            for number in frames:
                frame = source['frames'][number]
                width, height = frame['size']
                rgba = args.prepared / 'native' / frame['file']
                assert sha(rgba) == frame['rgbaSha256']
                native = Image.frombytes('RGBA', (width, height), rgba.read_bytes())
                palette = contract['sources'][name].get('framePalettes', {}).get(str(number))
                if palette:
                    file = args.prepared / 'native' / palette['member']
                    if not file.exists():
                        file = args.prepared / 'native' / (palette['sha256'] + '.pal')
                    assert sha(file) == palette['sha256']
                    colors = np.frombuffer(file.read_bytes(), np.uint8).reshape(256, 3) * 4
                    index = args.prepared / 'native' / frame['indexFile']
                    assert sha(index) == frame['indexSha256']
                    indices = np.frombuffer(index.read_bytes(), np.uint8).reshape(height, width)
                    pixels = np.zeros((height, width, 4), np.uint8)
                    pixels[..., :3] = colors[indices]
                    pixels[..., 3] = (indices != 0).astype(np.uint8) * 255
                    native = Image.fromarray(pixels)
                native = native.resize((width * density, height * density), Image.Resampling.NEAREST)
                declaration = next(f for f in variant['frames'] if f['nativeFrame'] == number)
                page_id = declaration['page']
                if page_id not in pages:
                    page = next(p for p in variant['pages'] if p['id'] == page_id)
                    page_file = pack / entry['path'].removesuffix('manifest.json') / str(density) / page_id / 'base.png'
                    assert sha(page_file) == page['baseSha256']
                    data_file = page_file.with_name('data.png')
                    assert sha(data_file) == page['dataSha256']
                    pages[page_id] = (Image.open(page_file).convert('RGBA'), Image.open(data_file).convert('RGBA'))
                x, y, w, h = declaration['contentRect']
                base, data_map = pages[page_id]
                palette_colors = frame_palette(args.prepared, source, contract['sources'][name], number)
                authored = compose_owner(base.crop((x, y, x + w, y + h)),
                    data_map.crop((x, y, x + w, y + h)), palette_colors)
                assert native.size == authored.size
                samples.append((number, frame, native, authored))
            pw = max(300, max(im.width for _, _, im, _ in samples) + 20)
            heights = [max(80, im.height + 58) for _, _, im, _ in samples]
            board = Image.new('RGB', (pw * 2, sum(heights)), (28, 28, 28))
            draw = ImageDraw.Draw(board)
            top = 0
            for (number, frame, native, authored), row_height in zip(samples, heights):
                draw.text((8, top + 6), f'Frame {number}: Native {density}X', font_size=22, fill='white')
                draw.text((pw + 8, top + 6), f'HD {density}X', font_size=22, fill='white')
                draw.text((8, top + 32), f"Native origin: {frame['origin']}", font_size=16, fill='#bbbbbb')
                board.paste(native, ((pw - native.width) // 2, top + 56), native)
                board.paste(authored, (pw + (pw - authored.width) // 2, top + 56), authored)
                top += row_height
            folder = output / 'environment' / identity
            folder.mkdir(parents=True, exist_ok=True)
            picture = folder / f'{name}-{density}x.png'
            board.save(picture)
            member['images'][str(density)] = dict(file=picture.relative_to(output).as_posix(), sha256=sha(picture),
                                                size=board.size, resizing=False)
        members.append(member)
    kind = sources[family['members'][0]['member']]['bindings'][0]['kind']
    records.append(dict(identity=identity, kind=kind, familyHash=family['familyHash'], members=members,
                        runtimeAcceptance='See focused native evidence', userVisualAcceptance=False))
index = dict(schema='m2-3-grouped-offline-review-v1', environmentSelection=selection, families=records,
             policy='Native body crops and independently exported HD at actual density; browser image scaling is disabled. Canvas, origins, states and alpha were verified in separate pinned export receipts.',
             userVisualAcceptance=False)
(output / 'review-index.json').write_text(json.dumps(index, indent=2) + '\n')
data = json.dumps(index, separators=(',', ':')).replace('<', '\\u003c')
document = '''<!doctype html><html lang="en"><meta charset="utf-8"><title>M2.3 Grouped Offline Review</title>
<style>body{margin:24px;background:#17191b;color:#eee;font:20px system-ui}h1{font-size:34px}label,button,select{font:20px system-ui;margin-right:12px}button,select{padding:8px}nav{position:sticky;top:0;background:#17191b;padding:14px 0}article{border-top:1px solid #555;padding:16px 0}small{font-size:16px;color:#ccc}.image{overflow:auto;max-height:900px;background:#1c1c1c;margin:12px 0}img{max-width:none;display:block}p{max-width:1100px;line-height:1.5}</style>
<h1>M2.3 Grouped Offline Review</h1><p>New reusable TEMPERATE content in the complete copied Mac application. Compare native pixels with independent HD exports at their actual density. Images scroll without scaling. Existing accepted families are retained. Static checks, native runtime evidence and your visual acceptance are separate.</p>
<nav><label>Category <select id="kind"></select></label><label>Density <select id="density"><option>2</option><option>4</option></select>X</label><span id="count"></span></nav><main></main>
<script>const review=DATA;const kinds=[...new Set(review.families.map(f=>f.kind))].sort();const select=document.querySelector('#kind');select.innerHTML='<option value="">All new families</option>'+kinds.map(k=>`<option>${k}</option>`).join('');function render(){const density=document.querySelector('#density').value;const list=review.families.filter(f=>!select.value||f.kind===select.value);document.querySelector('#count').textContent=list.length+' families';document.querySelector('main').innerHTML=list.map(f=>`<article><h2>${f.identity}</h2><small>Complete family hash: ${f.familyHash}</small>${f.members.map(m=>`<h3>${m.member}</h3><small>${m.bodyFrames} native body frames; samples ${m.sampledFrames.join(', ')}; source ${m.sourceSha256}</small><div class="image"><img loading="lazy" src="${m.images[density].file}" alt="Native and HD ${density}X ${m.member}"></div>`).join('')}</article>`).join('')}select.onchange=render;document.querySelector('#density').onchange=render;render();</script></html>'''.replace('DATA', data)
(output / 'index.html').write_text(document)
print(json.dumps(dict(output=str(output), newFamilies=len(records), members=sum(len(r['members']) for r in records))))
