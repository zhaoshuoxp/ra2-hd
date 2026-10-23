"""Export density-qualified representative previews and one offline review; no runtime catalogs."""
import base64
import hashlib
import html
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'allied-units'))
from scipy import ndimage

root = Path('.artifacts/yuri-units')
version = sys.argv[1] if len(sys.argv) > 1 else 'v8'
assert version.replace('-', '').isalnum(), 'Invalid review version'
output = root / f'review-{version}'
output.mkdir(exist_ok=False)
shp = {r['id']: r for r in json.loads((root / 'shp-references-v1/selection.json').read_text())}
vxl = {r['id']: r for r in json.loads((root / 'vxl-references-v1/vehicle-selection.json').read_text())}
init_masters = ['INIT-ready-native-v8.png', 'INIT-walk-native-v9.png',
                'INIT-fire-native-v8.png', 'INIT-die-native-v8.png']
selected = {'INIT': init_masters[0], 'YURIPR': 'YURIPR-ready-native-v11.png', 'BRUTE': 'BRUTE-v2-raw.png',
            'LTNK': 'LTNK-raw.png', 'DISK': 'DISK-raw.png', 'BSUB': 'BSUB-raw.png', 'SMIN': 'SMIN-raw.png'}
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
embed = lambda p: 'data:image/png;base64,' + base64.b64encode(p.read_bytes()).decode()
def isolate(master_path, grid, count):
    master = Image.open(master_path).convert('RGBA')
    assert master.getchannel('A').getextrema()[0] == 0, f'{master_path}: generated transparency missing'
    pixels = np.asarray(master).copy()
    labels, _ = ndimage.label(pixels[..., 3] > 128, np.ones((3, 3)))
    sizes = np.bincount(labels.ravel()); sizes[0] = 0
    # Reuse the accepted component-size filter, assigning occupied subjects in row/x order.
    buckets = {}
    for label, bounds in enumerate(ndimage.find_objects(labels), 1):
        if bounds is None or sizes[label] < max(12, sizes.max() * .002):
            continue
        ys, xs = bounds
        key = (min(grid[1]-1, int((ys.start+ys.stop)/2/master.height*grid[1])),
               min(grid[0]-1, int((xs.start+xs.stop)/2/master.width*grid[0])))
        buckets.setdefault(key, []).append(label)
    subjects = []
    for key, ids in sorted(buckets.items()):
        mask = np.isin(labels, ids)
        ys, xs = np.nonzero(mask)
        bounds = [int(xs.min()), int(ys.min()), int(xs.max())+1, int(ys.max())+1]
        assert bounds[0]>0 and bounds[1]>0 and bounds[2]<master.width and bounds[3]<master.height, (master_path, 'Clipped master')
        rgba = pixels.copy(); rgba[..., 3] *= ndimage.binary_dilation(mask, iterations=2)
        subjects.append((Image.fromarray(rgba).crop(bounds), bounds))
    assert len(subjects) == count, (master_path, 'Subject count mismatch', len(subjects), count)
    return subjects

entries = []
for identity, filename in selected.items():
    is_shp = identity in shp
    meta = (shp if is_shp else vxl)[identity]
    master_path = root / 'representatives-v1' / filename
    count = 1 if identity in ('INIT', 'YURIPR') else len(meta['cells'])
    grid = (1, 1) if identity in ('INIT', 'YURIPR') else (3, 2) if is_shp else (2, 2 if count > 2 else 1)
    master_paths = [root / 'representatives-v1' / f for f in init_masters] if identity == 'INIT' else [master_path]
    subjects = [isolate(p, (1, 1), 1)[0] for p in master_paths] if identity == 'INIT' else isolate(master_path, grid, count)
    entry = {'id': identity, 'master': str(master_path), 'masterSha256': sha(master_path),
             'status': 'REPRESENTATIVE_MATERIAL_ONLY_NOT_COMPLETE_ANIMATION_OR_RUNTIME', 'samples': [],
             'reference': str(root / ('shp-references-v1' if is_shp else 'vxl-references-v1') / meta['reference'])}
    if identity == 'INIT':
        entry['masters'] = [{'index': i, 'path': str(p), 'sha256': sha(p)} for i, p in enumerate(master_paths)]
    if identity == 'BRUTE':
        override = root / 'representatives-v1/BRUTE-death-front-v3.png'
        subjects[4] = isolate(override, (1, 1), 1)[0]
        entry['override'] = {'index': 4, 'path': str(override), 'sha256': sha(override),
                             'reason': 'Front-facing backward fall replaces the rejected fifth master cell.'}
    (output / identity).mkdir()
    # Only selected ready/heading references enter native-size preview. Other raw cells are material references.
    indices = [0, 1, 2, 3] if identity == 'INIT' else [0, 2, 4] if identity == 'BRUTE' else [0] if identity == 'YURIPR' else [0, 1]
    for index in indices:
        cell = meta['cells'][index]
        detail, authored_bounds = subjects[index]
        if is_shp:
            original_path = root / 'shp-references-v1' / cell['source']
            original = Image.open(original_path).convert('RGBA')
            row = json.loads((root / 'source-v2/inventory.json').read_text())['families']
            member = next(r['members'][0] for r in row if r['id'] == identity)
            source = json.loads((root / 'source-v2' / (member + '.json')).read_text())
            native = source['frames'][cell['frame']]
            palette_indices = np.asarray(native['pixels']).reshape(native['height'], native['width'])
            mask = (palette_indices != 0) & (palette_indices != 12)
            bounds = Image.fromarray(mask.astype('uint8') * 255).getbbox()
            bounds = [bounds[0] + native['x'], bounds[1] + native['y'],
                      bounds[2] + native['x'], bounds[3] + native['y']]
            ratio = 1.0
            label = f'{cell["state"]} / native slot {cell["frame"]}'
            native_shadow = Image.new('RGBA', original.size)
            shadow_tile = Image.new('RGBA', (native['width'], native['height']))
            shadow_tile.putalpha(Image.fromarray((palette_indices == 12).astype('uint8') * 255))
            native_shadow.alpha_composite(shadow_tile, (native['x'], native['y']))
        else:
            original_path = Path(cell['source'])
            original = Image.open(original_path).convert('RGBA')
            pixels = np.asarray(original).copy()
            pixels[..., 3] = (np.max(np.abs(pixels[..., :3].astype(int) - [72, 88, 78]), axis=2) > 8).astype('uint8') * 255
            original = Image.fromarray(pixels)
            bounds = original.getchannel('A').getbbox()
            capture_dir = original_path.parent
            report = json.loads((capture_dir / 'result.json').read_text())
            view = next(v for r in report['units'] if r['name'] == identity for v in r['views'] if v['heading'] == cell['heading'])
            ratio = view['ratio']
            label = f'Complete / native yaw {cell["heading"]}'
        width, height = (bounds[2] - bounds[0]) / ratio, (bounds[3] - bounds[1]) / ratio
        preserve_aspect = identity in ('INIT', 'YURIPR')
        native_width = width
        if preserve_aspect:
            width = detail.width / detail.height * height
        available = min(detail.width / width, detail.height / height)
        assert available >= 4, (identity, index, 'Insufficient authored detail', available)
        sample = {'index': index, 'label': label, 'logicalCanvas': [round(original.width / ratio), round(original.height / ratio)],
                  'nativeOutputRatio': ratio, 'nativeBodyBounds': list(bounds), 'masterSize': list(detail.size),
                  'authoredBounds': authored_bounds, 'availableDensity': available, 'variants': {},
                  'registration': 'UNIFORM_NATIVE_BODY_HEIGHT_CENTER_AND_BOTTOM' if preserve_aspect else 'LEGACY_NATIVE_EXTENT_REVIEW',
                  'displayBodySize': [width, height]}
        if preserve_aspect:
            sample['previewShadow'] = 'EXACT_SOURCE_PALETTE_INDEX_12_UNDER_AUTHORED_BODY'
        if identity == 'INIT':
            sample['master'] = str(master_paths[index]); sample['masterSha256'] = sha(master_paths[index])
        for density in (2, 4):
            canvas = tuple(round(v / ratio * density) for v in original.size)
            size = (max(1, round(width * density)), max(1, round(height * density)))
            sprite = detail.convert('RGBa').resize(size, Image.Resampling.LANCZOS).convert('RGBA')
            candidate = Image.new('RGBA', canvas)
            if preserve_aspect:
                candidate.alpha_composite(native_shadow.resize(canvas, Image.Resampling.NEAREST))
            left = (bounds[0] / ratio + (native_width - width) / 2) if preserve_aspect else bounds[0] / ratio
            anchor = (round(left * density), round(bounds[1] / ratio * density))
            assert anchor[0] >= 0 and anchor[1] >= 0
            assert anchor[0] + size[0] <= canvas[0] and anchor[1] + size[1] <= canvas[1]
            candidate.alpha_composite(sprite, anchor)
            old = original.resize(canvas, Image.Resampling.NEAREST)
            pair = Image.new('RGBA', (canvas[0] * 2, canvas[1]), (72, 88, 78, 255))
            pair.alpha_composite(old, (0, 0))
            pair.alpha_composite(candidate, (canvas[0], 0))
            path = output / identity / f'{index}-{density}x-pair.png'
            pair.save(path)
            sample['variants'][str(density)] = {'path': str(path), 'sha256': sha(path), 'size': list(pair.size),
                                               'density': density, 'masterDownsampleOnly': True}
        entry['samples'].append(sample)
    entries.append(entry)

cards = []
for entry in entries:
    samples = []
    for sample in entry['samples']:
        first = sample['variants']['4']
        second = sample['variants']['2']
        canvas = sample['logicalCanvas']
        samples.append(f'<div class="sample"><p>{html.escape(sample["label"])} — Original | HD candidate</p>'
                       f'<img class="pair" data-2="{embed(Path(second["path"]))}" data-4="{embed(Path(first["path"]))}" '
                       f'src="{embed(Path(first["path"]))}" data-width="{canvas[0]*2}" data-height="{canvas[1]}" '
                       f'width="{canvas[0]*2}" height="{canvas[1]}" alt="{entry["id"]} native preview"></div>')
    note = {'YURIPR': 'New source-frame redraw: native angled facing, dark narrow lower cylinder, red post ornaments and bottom band. Invented gold clothing trim and exposed central engine removed. Aspect ratio is preserved; final matte, complete animation and acceptance remain pending.',
            'INIT': 'All four poses redrawn separately from their exact source frames. Original bend/head/backpack placement and small shared firing flash guide the candidates. Uniform body-height registration preserves each master aspect ratio; no independent width stretching. Visual fidelity remains for user review.',
            'BRUTE': 'The first four master cells are preserved. The rejected fifth cell is superseded by the separate front-facing backward-fall image below.'}.get(entry['id'], '')
    override_html = ''
    if 'override' in entry:
        override_html = f'<figure><figcaption>{html.escape(entry["override"]["reason"])}</figcaption><img src="{embed(Path(entry["override"]["path"]))}" alt="{entry["id"]} corrected pose"></figure>'
    master_html = ''.join(f'<figure><figcaption>Source-guided candidate / pose {m["index"]+1}</figcaption>'
                          f'<img src="{embed(Path(m["path"]))}" alt="{entry["id"]} master pose {m["index"]+1}"></figure>'
                          for m in entry['masters']) if 'masters' in entry else (
        f'<figure><figcaption>HD material candidate — other cells do not certify animation registration</figcaption>'
        f'<img src="{embed(Path(entry["master"]))}" alt="{entry["id"]} master"></figure>')
    cards.append(f'<article id="{entry["id"]}"><h2>{entry["id"]}</h2><p>{note}</p><div class="samples">{"".join(samples)}</div>'
                 f'<details><summary>Full-resolution master and native component reference</summary><div class="boards">'
                 f'{master_html}{override_html}'
                 f'<figure><figcaption>Original source reference</figcaption><img src="{embed(Path(entry["reference"]))}" '
                 f'alt="{entry["id"]} original reference"></figure></div></details></article>')
page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Task D — Yuri Unit Representative Review VERSION</title><style>
body{margin:0;background:#17211f;color:#edf2ef;font:18px system-ui}main{max-width:1250px;margin:auto;padding:24px}
h1{font-size:32px;margin:0 0 14px}h2{font-size:26px;margin:0}p{line-height:1.45;margin:12px 0}
nav{position:sticky;top:0;background:#17211f;padding:14px 0;display:flex;gap:18px;align-items:center;flex-wrap:wrap;z-index:2}
a{color:#b6e6d6}select{font:inherit;padding:5px}article{border-top:1px solid #496159;padding:20px 0;scroll-margin-top:95px}
.samples,.boards{display:flex;gap:18px;flex-wrap:wrap}.sample{overflow:auto;max-width:100%}.pair{display:block;image-rendering:auto}
.boards figure{margin:12px 0;flex:1 1 450px}.boards img{width:100%;height:auto;background:#48584e}summary{cursor:pointer;margin:12px 0}
figcaption{margin:12px 0;color:#bacdc5}.notice{border-left:4px solid #d4ba79;padding-left:14px}
</style><main><h1>Task D — Yuri Unit Representative Review VERSION</h1>
<p class="notice">Representative direction only. Seven distinct art mechanisms; 19 audited roots and two required children.
No new family is enabled. The five redrawn INIT/YURIPR poses preserve master aspect ratio and align native body height and center, with the exact original embedded shadow underneath. Other families retain their previous preview registration. This is an offline illustration, not an in-match HD binding.
Full animation, owner masks, 2x/4x family completeness, runtime water/depth and combined memory remain pending.</p>
<p>Default: native logical size, 4x detail. At scale 1, compare actual-size readability; larger scale is a separate detail inspection.
Originals are source sprites or measured original in-match VXL crops. Texture density never changes logical geometry.</p><nav>
<label>Preview scale <select id="scale"><option value="1">Native size</option><option value="2">2x inspection</option><option value="4">4x inspection</option></select></label>
<label>Authored density <select id="density"><option value="4">4x</option><option value="2">2x</option></select></label>LINKS</nav>CARDS
<p>Accepted source-matched reuse: YURI, CCOMAND, PTROOP, CIVAN; YENGINEER matches SENGINEER but its alias still requires integration.
New identity-specific production retains native silhouettes; approval of representative material direction never approves missing frames or new gameplay.</p></main>
<script>const update=()=>{const s=Number(document.querySelector('#scale').value),d=document.querySelector('#density').value;
for(const im of document.querySelectorAll('.pair')){im.src=im.dataset[d];im.width=Number(im.dataset.width)*s;im.height=Number(im.dataset.height)*s;}};
document.querySelector('#scale').onchange=update;document.querySelector('#density').onchange=update;</script></html>'''
links = ''.join(f'<a href="#{entry["id"]}">{entry["id"]}</a>' for entry in entries)
file = root / f'Yuri-Units-Representative-Review-{version}.html'
file.write_text(page.replace('VERSION', version).replace('LINKS', links).replace('CARDS', ''.join(cards)))
report = {'schemaVersion': 1, 'status': 'GROUPED_REPRESENTATIVE_REVIEW_PENDING', 'review': str(file),
          'reviewSha256': sha(file), 'families': entries, 'completeNewRuntimeFamilies': 0,
          'disclosure': 'New bitmap masters via built-in image_gen. Deterministic review export, not runtime activation or animation acceptance.'}
(output / 'manifest.json').write_text(json.dumps(report, indent=2) + '\n')
print('Exported', len(entries), 'representatives;', sum(len(e['samples']) for e in entries), 'native-size comparisons')
