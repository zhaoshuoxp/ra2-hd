"""Native-size review of a live mesh/material proof against the accepted 2D target."""
import base64
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFont

run = Path('.artifacts/m1-3b/game-v4')
out = Path('.artifacts/m1-3b/review-v1')
out.mkdir(parents=True, exist_ok=False)
report = json.loads((run / 'result.json').read_text())
assert report['status'] == 'PASS_BOUNDED_RENDERER_TRANSFER_CHECKS'
art = Path('.artifacts/m1-3a/review-v2')
export = json.loads((art / 'export.json').read_text())['poses'][0]
target_source = Path(export['source'])
assert hashlib.sha256(target_source.read_bytes()).hexdigest() == export['sourceSha256']
validation = {'status': 'PASS_REVIEW_EXPORT_ONLY', 'sets': [], 'acceptedSourceSha256': export['sourceSha256']}


def embed(file, native=True, width=None, height=None):
    data = base64.b64encode(Path(file).read_bytes()).decode()
    dimensions = f'width="{width}" height="{height}"' if width else ''
    css = 'native' if native else 'detail'
    return f'<img class="{css}" {dimensions} alt="{Path(file).stem}" src="data:image/png;base64,{data}">'


def board(files, labels, density, filename):
    image = Image.new('RGB', (360 * density * len(files), 300 * density), '#182027')
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 17 * density)
    small = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 11 * density)
    for i, (file, (title, subtitle)) in enumerate(zip(files, labels)):
        x = i * 360 * density
        draw.text((x + 8 * density, 3 * density), title, font=font, fill='white')
        draw.text((x + 8 * density, 24 * density), subtitle, font=small, fill='#f8d684')
        panel = Image.open(file).convert('RGB')
        assert panel.size == (360 * density, 260 * density)
        image.paste(panel, (x, 40 * density))
    image.save(out / filename)


page = ['''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Rhino runtime transfer review</title>
<style>body{font:18px/1.5 system-ui,sans-serif;background:#182027;color:#eef1f4;margin:24px}
main{max-width:1160px;margin:auto}h1{font-size:30px}h2{font-size:25px}h3{font-size:21px}a{color:#9ed2ff}
.notice{color:#f8d684}.scroll{max-width:100%;overflow:auto}.row{display:flex;gap:16px;width:max-content}
figure{width:360px;margin:0;flex:none}figcaption{height:76px}.native{width:360px;height:260px;display:block}
.stack{width:360px;height:260px}.stack img{display:none}.toggle label{display:inline-block;background:#334552;padding:8px}
.toggle .a:checked~.scroll .original,.toggle .t:checked~.scroll .target,.toggle .r:checked~.scroll .runtime{display:block}
.toggle{margin:20px 0}summary{cursor:pointer}code{overflow-wrap:anywhere}</style>
<main><h1>Rhino: accepted art to real rendering</h1>
<p><strong>ART_TARGET_ACCEPTED / PARTIAL_RUNTIME_TRANSFER / RUNTIME_VISUAL_REVIEW_PENDING</strong></p>
<p>A: original game capture. T: accepted 2D art target, recomposited on this capture's background and original shadow.
R: real engine rendering of source-derived geometry and a candidate-only matte armor material. Original Rhino remains active by default.</p>
<p class="notice">The runtime proof retains original part structure and independent aim. It does not yet reproduce the target's full panel, hatch and weathering detail. Technical checks are not visual acceptance.</p>
<p>Use 100% browser zoom. Every scene panel is 360×260 CSS pixels: the original gameplay size. Narrow windows scroll without shrinking.
The 4K condition uses 720×520 source pixels per panel; 1080p uses 360×260. Enlarged detail is supplementary.</p>''']

for preset, density in [('4k', 2), ('1080p', 1)]:
    page.append(f'<h2>{"Primary 4K condition" if density == 2 else "1080p repeat at the same gameplay scale"}</h2>')
    for item in [s for s in report['sets'] if s['preset'] == preset]:
        rows = {r['label']: r for r in item['rows']}
        key = f'{preset}-{item["body"]}-{item["turret"]}'
        files = [run / rows[k]['file'] for k in ['A', 'B']]
        images = [Image.open(f).convert('RGBA') for f in files]
        delta = ImageChops.difference(*[i.convert('RGB') for i in images])
        bounds = delta.getbbox()
        assert bounds is not None
        css_bounds = [v / density for v in bounds]
        assert 130 <= css_bounds[0] < css_bounds[2] <= 240
        assert 80 <= css_bounds[1] < css_bounds[3] <= 185
        labels = [('A - Original', 'ACTUAL ENGINE CAPTURE'), ('R - Runtime proof', 'ACTUAL ENGINE CAPTURE')]
        board(files, labels, density, f'{key}-original-runtime.png')
        page.append(f'<h3>Body {item["body"]}° / turret and barrel {item["turret"]}°</h3>')
        panels = [(files[0], 'A · Original', 'Actual engine capture', 'original')]
        if item['body'] == 0 and item['turret'] == 0:
            target = Image.open(run / rows['A']['targetBackgroundFile']).convert('RGBA')
            sprite = Image.open(art / f'primary-{density}x.png').convert('RGBA')
            origin = [int(v * density) for v in export['exportOriginInSceneCss']]
            target.alpha_composite(sprite, origin)
            target_file = out / f'{preset}-accepted-target.png'
            target.save(target_file)
            panels.append((target_file, 'T · Accepted art target', '2D ART COMPOSITE — NOT IN-ENGINE HD', 'target'))
            board([target_file, files[1]], [('T - Accepted target', '2D ART COMPOSITE — NOT IN-ENGINE HD'), labels[1]],
                  density, f'{preset}-target-runtime.png')
            if density == 2:
                detail = Image.new('RGB', (900, 220), '#182027')
                for i, image in enumerate([images[0], target, images[1]]):
                    crop = image.crop((290, 210, 440, 320)).resize((300, 220), Image.Resampling.NEAREST)
                    detail.paste(crop.convert('RGB'), (i * 300, 0))
                detail.save(out / 'primary-detail-4css.png')
        panels.append((files[1], 'R · Runtime proof', 'Actual engine capture', 'runtime'))
        page.append('<div class="scroll"><div class="row">')
        for file, title, subtitle, _ in panels:
            page.append(f'<figure><figcaption>{title}<br><small>{subtitle}</small></figcaption>{embed(file)}</figure>')
        page.append('</div></div><div class="toggle">')
        for n, (_, title, _, role) in enumerate(panels):
            letter = {'original': 'a', 'target': 't', 'runtime': 'r'}[role]
            checked = 'checked' if n == 0 else ''
            page.append(f'<input class="{letter}" id="{key}-{letter}" name="{key}" type="radio" {checked}>'
                        f'<label for="{key}-{letter}">{title}</label>')
        page.append('<div class="scroll"><div class="stack">')
        for file, _, _, role in panels:
            page.append(embed(file).replace('class="native"', f'class="native {role}"'))
        page.append('</div></div></div>')
        page.append(f'<p><a href="{key}-original-runtime.png">Direct original/runtime pair</a></p>')
        validation['sets'].append({'name': key, 'changedBoundsCss': css_bounds,
                                   'sceneOutsideTankAndShadowUnchanged': True})

page.append('''<details><summary>4× logical-size inspection: original / accepted target / runtime</summary>
<p>Equal magnification only. The center image is a 2D target, not an engine render. The runtime lacks its authored panel and wear detail.</p>
<div class="scroll">''')
page.append(embed(out / 'primary-detail-4css.png', False, 900, 220))
page.append('''</div></details><h2>What transferred, and what did not</h2>
<p>The runtime preserves source occupancy structure, source palette regions, owner colors and independent body/turret/barrel transforms.
Half-voxel surface extraction and locally averaged normals reduce some stepped edges. A local material clone reduces only the armor's VPL half-vector highlight term to 15%; the scene light, diffuse term and non-armor response stay unchanged.</p>
<p>The result approaches the target's matte armor treatment, but the target's broad panel boundaries, hatch profile, fine wear and track detail are not reproduced.
There is no lit PNG texture, inferred unseen surface, baked image lighting or billboard. The candidate uses real engine depth and casts its own shadow.
The middle target panel reuses the original shadow only as a disclosed comparison aid.</p>
<p>These are synchronous diagnostic render poses, not movement, firing, multi-unit performance or full vehicle acceptance.
The candidate contains substantially more triangles; that is a cost, not evidence of a worthwhile visual improvement.</p>
<p><a href="../game-v4/result.json">Runtime checks</a> · <a href="../candidate-v3/summary.json">Geometry provenance</a> ·
<a href="review-validation.json">Review export checks</a></p>
<h2>Visual decision</h2><p>Is the actual runtime result worth continuing toward the accepted target at native gameplay size?
No answer is preselected. The accepted 2D target remains accepted; this runtime proof needs its own decision. No default override or further production is started.</p></main></html>''')
document = ''.join(page)
(out / 'review.html').write_text(document)
validation['imageCount'] = document.count('<img ')
(out / 'review-validation.json').write_text(json.dumps(validation, indent=2) + '\n')
print(json.dumps(validation))
