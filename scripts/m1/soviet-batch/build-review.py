"""One self-contained fixed-size board, with independently reported family evidence."""
import base64
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

root = Path('.artifacts/m1-6b')
run = root / (sys.argv[1] if len(sys.argv) > 1 else 'runtime-candidate-v2')
out = root / (sys.argv[2] if len(sys.argv) > 2 else 'review-v1')
out.mkdir(exist_ok=False)
report = json.loads((run / 'result.json').read_text())
checks = json.loads((run / 'evidence-check.json').read_text())
ledger = json.loads((root / 'ledger.json').read_text())
assert checks['status'] == 'PASS_CONSOLIDATED_REPRESENTATIVE_INVARIANTS'
inventory = json.loads((root / 'source-v1/inventory.json').read_text())
states = json.loads((root / 'references-v1/states.json').read_text())
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 20)
labels = {'NAHAND': 'Barracks', 'NAREFN': 'Ore Refinery', 'NAWEAP': 'War Factory', 'NACNST': 'Construction Yard'}
counts = {'NAHAND': 28, 'NAREFN': 76, 'NAWEAP': 52, 'NACNST': 101}
normal_board = Image.new('RGB', (720, 1240), '#17232a')
state_board = normal_board.copy()
normal_draw, state_draw = ImageDraw.Draw(normal_board), ImageDraw.Draw(state_board)
image_count = 0

def embed(file, label):
    global image_count
    image_count += 1
    p = out / file
    mime = 'image/webp' if p.suffix == '.webp' else 'image/png'
    data = base64.b64encode(p.read_bytes()).decode()
    return f'<figure><img width="340" height="260" alt="{label}" src="data:{mime};base64,{data}"><figcaption>{label}</figcaption></figure>'

html = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M1.6b consolidated representative review</title>
<style>body{background:#17232a;color:#eef2ec;font:18px/1.5 system-ui;margin:24px;max-width:1120px}h1{font-size:29px}h2{font-size:25px;margin-top:38px}h3{font-size:21px}p{max-width:1040px}section{display:flex;gap:18px;flex-wrap:wrap}figure{margin:0 0 22px}img{display:block;width:340px;height:260px}figcaption{font-size:16px;max-width:340px}summary{cursor:pointer;font-weight:600;padding:12px 0}table{border-collapse:collapse}th,td{padding:10px;text-align:left;border-bottom:1px solid #586667}a{color:#a6d7ff}.scroll{overflow:auto}.note{color:#c9d6d3}</style>
<h1>M1.6b — four-family representative review</h1>
<p><strong>Consolidated representative decision pending.</strong> Four normal masters and four damage/functional samples, shown through the accepted Mac renderer. These are partial diagnostic bindings; ordinary games still use Original for all four families. Full-family production, normal-game integration, combined memory validation and the new combined app follow approval.</p>
<p>View at 100% browser zoom. Every scene is fixed at 340 × 260 reference pixels with the accepted 900-high presentation and unchanged camera. High means a 2160-high drawing buffer at the captured aspect; it is not a physical 4K-panel claim. Original and HD use verified distinct materials and identical tick, geometry, pose and camera. Native shadows and surrounding accepted assets remain controls.</p>
<table><tr><th>Family</th><th>Sample</th><th>Technical evidence</th><th>Full-family slots</th></tr>'''
for id in labels:
    secondary = next(s['state'] for s in report['families'][id]['samples'] if s['state'] != 'normal')
    decision = ledger['families'][id].get('reviewDecision', 'PENDING_USER')
    html += f'<tr><td><a href="#{id}">{id} · {labels[id]}</a></td><td>Normal + {secondary}</td><td>Technical PASS; {decision}</td><td>{counts[id]}</td></tr>'
html += '</table><p class="note">The counts are conservative source coverage targets, not newly authored independent images. Per-family source hashes, frame mappings, provenance and failures are retained in the batch ledger. No batch average replaces an individual result.</p>'
for row, (id, family) in enumerate(report['families'].items()):
    directory = out / id
    directory.mkdir()
    samples = family['samples']
    normal = next(s for s in samples if s['state'] == 'normal' and s['mode'] == '4k' and s['density'] == 1)
    xs, ys = zip(*normal['points'])
    center = ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)
    panels = {}
    for sample in samples:
        sx = sample['buffer'][0] / sample['logical'][0]
        sy = sample['buffer'][1] / sample['logical'][1]
        x, y = center
        im = Image.open(run / id / sample['file']).crop((round((x-170)*sx), round((y-130)*sy), round((x+170)*sx), round((y+130)*sy)))
        file = f'{id}/{sample["file"]}'
        im.save(out / file)
        panels[(sample['state'], sample['mode'], sample['density'])] = file
    secondary = next(s['state'] for s in samples if s['state'] != 'normal')
    decision = ledger['families'][id].get('reviewDecision', 'PENDING_USER')
    html += f'<h2 id="{id}">{labels[id]} · {id}</h2><p>Normal and {secondary}; sample checks PASS. Representative decision: {decision}. '
    if id == 'NACNST':
        html += ('Revision 2 omitted the forearm/grabber and was rejected by the user. Revision 3 restores the complete articulated arm toward the entrance, using native production frame 6 after inspecting all 21 frames. Earlier outputs remain preserved. '
                 if report.get('exports') == 'exports-v3' else 'Earlier crane revisions remain preserved; consult the ledger for the latest decision. ')
    if id == 'NAREFN':
        html += 'The unloading sample adds an independently authored local ore-grain sprite; it reuses the normal building. '
    html += 'These snapshots do not certify completed animation or native functional gameplay.</p>'
    for state in ['normal', secondary]:
        html += f'<h3>{state} · High sampling</h3><section>'
        for density in [1, 4]:
            name = 'Original' if density == 1 else 'HD 4× representative'
            file = panels[(state, '4k', density)]
            html += embed(file, f'{id} · {state} · {name}')
            im = Image.open(out / file).resize((340, 260), Image.Resampling.LANCZOS)
            board, draw = (normal_board, normal_draw) if state == 'normal' else (state_board, state_draw)
            column = 0 if density == 1 else 1
            board.paste(im, (10 + 350*column, 40 + 300*row))
            draw.text((10 + 350*column, 10 + 300*row), f'{id} {state if state != "normal" else ""} {"Original" if density == 1 else "HD"}', font=font, fill='white')
        html += '</section>'
    html += '<details><summary>Matched 1080p and 2×/4× export checks</summary>'
    for state in ['normal', secondary]:
        for mode in ['1080p', '4k']:
            html += f'<h3>{state} · {mode}</h3><section>'
            for density in [1, 2, 4]:
                html += embed(panels[(state, mode, density)], f'{id} · {state} · {mode} · {"Original" if density == 1 else str(density)+"× candidate"}')
            html += '</section>'
    html += '</details>'
    # Original motion controls use decoded native pixels, clearly separated from runtime captures.
    raw = {m['source']['member']: json.loads((root/'source-v1'/id/(m['source']['member']+'.json')).read_text()) for m in inventory['families'][id]['members']}
    def indexed(member, frame):
        source = raw[member]; f = source['frames'][frame]
        indices = np.array(f['pixels'], dtype=np.uint8).reshape(f['height'], f['width'])
        palette = np.array(source['palette'], dtype=np.uint8)
        pixels = np.dstack([palette[indices], (indices != 0).astype(np.uint8)*255])
        pixels[indices == 0] = 0
        im = Image.new('RGBA', source['canvas'])
        im.paste(Image.fromarray(pixels), (f['x'], f['y']))
        return im
    build = next(m for m in inventory['families'][id]['members'] if 'BUILDUP' in m['roles'])
    sequence = []
    for frame in range(build['aggregateVisibleFrames']):
        im = indexed(build['source']['member'], frame)
        panel = Image.new('RGBA', (340, 260), '#34483d')
        panel.alpha_composite(im, ((340-im.width)//2, (260-im.height)//2))
        sequence.append(panel.convert('RGB'))
    duration = round(1000 / (build['aggregateVisibleFrames'] / (60*inventory['buildupTime']) * normal['animationSpeed']))
    for role, images in [('construction', sequence), ('sale', sequence[::-1])]:
        file = f'{id}/original-{role}.webp'
        images[0].save(out/file, save_all=True, append_images=images[1:], duration=duration, loop=0, lossless=True)
    html += '<details><summary>Native construction and sale motion references</summary><p>Decoded Original source frames at the current default speed; plain-background reference only, not HD or world-rendered evidence. Full HD sequences are intentionally deferred until representative approval.</p><section>'
    html += embed(f'{id}/original-construction.webp', f'{id} · Original construction reference')
    html += embed(f'{id}/original-sale.webp', f'{id} · Original reversed sale reference')
    html += '</section></details>'
    if id == 'NACNST' and report.get('exports') == 'exports-v3':
        production = []
        for frame in range(21):
            im = indexed('ngcnst.shp', 0)
            im.alpha_composite(indexed('ngcnst_b.shp', frame))
            im.alpha_composite(indexed('ngcnst_a.shp', 0))
            panel = Image.new('RGBA', (340, 260), '#34483d')
            panel.alpha_composite(im, ((340-im.width)//2, (260-im.height)//2))
            production.append(panel.convert('RGB'))
        production[0].save(directory/'original-production.webp', save_all=True, append_images=production[1:], duration=round(1000/(200/60*normal['animationSpeed'])), loop=0, lossless=True)
        html += '<h3>Original crane motion reference</h3><p>All 21 native production frames at the captured animation speed. The corrected HD still uses frame 6, where the complete forearm approaches the entrance. This is an Original reference loop; the HD loop is not yet authored.</p>'
        html += embed('NACNST/original-production.webp', 'Original production loop; HD still uses frame 6')
html += '''<h2>Decision and retained boundaries</h2><p>Approve the group or name individual exceptions. Approval authorizes continuous full-family work on accepted buildings; a rejected family remains Original while independent approved families continue. This representative page does not activate an incomplete family.</p><p>Native planes, anchors, even padding and indexed shadows are preserved. Some representative layers use shared-master crops or transparent diagnostic placeholders; final moving-part separation, vehicle occlusion, all owner colors and powered/damaged transitions still require full-family work. No camera, gameplay rule, production timing or existing resource was changed.</p><p>Each family has eight matched Original/HD checks (two states × two outputs × two pack densities), with positive building differences and zero changes outside its bounding region. Actual logical viewport: 1242.72 × 900; CSS 1279.99 × 927; DPR 2; buffers 1491 × 1080 and 2982 × 2160. All representative textures released. Physical mouse/Pointer Lock, final app, complete-family fallback and combined production allocation are not certified by these snapshots.</p><p>Exact prompts and raw outputs: .artifacts/m1-6b/art-v1/; batch ledger: .artifacts/m1-6b/ledger.json. Ordinary games retain the accepted NAPOWR revision 2 and all previous assets. Keep batch feedback in this task.</p></html>'''
if report.get('exports') == 'exports-v3':
    html = html.replace('Consolidated representative decision pending.', 'Three representatives accepted; corrected construction-yard crane awaits decision.')
    html = html.replace('Full-family production, normal-game integration, combined memory validation and the new combined app follow approval.', 'Full production is authorized for the three accepted families. NACNST remains pending the corrected crane decision. No complete-family activation is claimed.')
(out/'review.html').write_text(html)
normal_board.save(out/'normal-overview.png')
state_board.save(out/'state-overview.png')
(out/'review.json').write_text(json.dumps({'status':ledger['status'],'runtimeSource':str(run),'fixedPanel':[340,260],'images':image_count,'families':checks['families']},indent=2)+'\n')
print(out/'review.html', 'embedded images:', image_count)
