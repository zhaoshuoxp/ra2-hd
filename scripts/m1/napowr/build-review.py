"""Build a self-contained, fixed-size review from measured world-rendered samples."""
import base64
import hashlib
import html
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path('.artifacts/m1-6a')
runtime = root / 'runtime-candidate-v2'
out = root / 'review-v1'
out.mkdir(exist_ok=False)
report = json.loads((runtime / 'result.json').read_text())
exports = json.loads((root / 'exports-v1/report.json').read_text())
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 20)
font_small = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 16)
states = ['normal', 'active-09', 'damaged', 'buildup-12']
labels = ['Normal', 'Activity phase 09', 'Damaged', 'Construction frame 12']
# Logical crop, independent of drawing-buffer density and identical for every case.
crop = (420, 290, 820, 550)
images = {}
for sample in report['samples']:
    im = Image.open(runtime / sample['filename'])
    ratio = sample['buffer'][1] / 900
    bounds = tuple(round(n * ratio) for n in crop)
    cropped = im.crop(bounds)
    target = out / sample['filename']
    cropped.save(target)
    images[(sample['name'], sample['mode'], sample['density'])] = target

for state in ['normal', 'damaged', 'buildup-12']:
    Image.open(runtime / f'{state}-4k-hd4.png').crop((1080, 760, 1632, 1200)).save(out / f'{state}-detail.png')

# A direct-link board uses 1x logical-size resampling for convenience only.
# The HTML below embeds the original High and 1080p crops at the same CSS size.
board = Image.new('RGB', (824, 4 * 304 + 42), '#17212a')
draw = ImageDraw.Draw(board)
draw.text((12, 9), 'Original | Candidate - 900-reference display size', font=font, fill='white')
for row, (state, label) in enumerate(zip(states, labels)):
    y = 42 + row * 304
    draw.text((12, y), label, font=font, fill='white')
    for col, density in enumerate([1, 4]):
        im = Image.open(images[(state, '4k', density)]).resize((400, 260), Image.Resampling.LANCZOS)
        board.paste(im, (8 + col * 408, y + 32))
board.save(out / 'native-size-overview.png')

# Source/export/runtime trace at matched apparent sprite size. These isolated
# background composites are expressly not additional world-rendered samples.
trace = Image.new('RGB', (750, 550), '#34483d')
td = ImageDraw.Draw(trace)
for col, label in enumerate(['Authored source', '4x export', 'Runtime (High)']):
    td.text((col * 250 + 14, 12), label, font=font, fill='white')
for row, (name, label) in enumerate([('normal', 'Normal'), ('damaged', 'Damaged'), ('buildup', 'Construction')]):
    sample = next(s for s in exports['samples'] if s['name'] == name)
    raw = Image.open(root / 'art-v1' / f'{name}-raw.png').crop(sample['sourceCrop'])
    scale = sample['uniformScaleToLogical']
    raw = raw.resize(tuple(round(v * scale) for v in raw.size), Image.Resampling.LANCZOS)
    target = Image.open(root / 'exports-v1' / f'{name}-4x.png')
    target = target.resize(tuple(n // 4 for n in target.size), Image.Resampling.LANCZOS)
    for col, im in enumerate([raw, target]):
        trace.paste(im, (col * 250 + 66, 65 + row * 155), im)
    state = 'buildup-12' if name == 'buildup' else name
    scene = Image.open(images[(state, '4k', 4)]).resize((400,260),Image.Resampling.LANCZOS)
    # Native bounding region with the unchanged surrounding terrain.
    scene = scene.crop((65,65,205,175))
    trace.paste(scene, (550, 60 + row * 155))
    td.text((10, 171 + row * 155), label, font=font_small, fill='white')
trace.save(out / 'source-export-runtime.png')

def embed(path, width, height, alt):
    data = base64.b64encode(path.read_bytes()).decode()
    return f'<img src="data:image/png;base64,{data}" width="{width}" height="{height}" alt="{html.escape(alt)}">'

sections = []
for state, label in zip(states, labels):
    content = f'<section><h2>{label}</h2>'
    for mode, mode_label in [('4k','High: 3840 x 2160 buffer'),('1080p','1080p: 1920 x 1080 buffer')]:
        content += f'<h3>{mode_label}</h3><div class="scroll"><div class="pair">'
        for density, caption in [(1,'Original'),(4,'Representative HD (4x export)')]:
            content += '<figure><figcaption>'+caption+'</figcaption>'+embed(images[(state,mode,density)],400,260,caption+' '+label)+'</figure>'
        content += '</div></div>'
    content += '<details><summary>2x export control at High output</summary><div class="scroll">'+embed(images[(state,'4k',2)],400,260,'2x export control')+'</div></details></section>'
    sections.append(content)
body = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M1.6a NAPOWR representative review</title>
<style>body{font:18px/1.5 system-ui,sans-serif;background:#17212a;color:#e9edf1;margin:24px;max-width:1120px}h1{font-size:30px}h2{font-size:25px}h3{font-size:20px}a{color:#89d5ff}.scroll{overflow-x:auto;max-width:100%}.pair{display:flex;width:816px;gap:16px}figure{margin:0;width:400px;flex:none}figcaption{padding:8px 0}img{display:block;max-width:none;flex:none}section{margin:32px 0;padding-top:12px;border-top:1px solid #526171}summary{cursor:pointer;margin:12px 0}.notice{padding:16px;background:#2b3945}p{max-width:960px}code{font-size:16px}</style>
<h1>M1.6a - Soviet Tesla Reactor representative review</h1>
<p class="notice"><strong>REPRESENTATIVE_ART_REVIEW_PENDING</strong><br>Diagnostic partial family only. No normal-game registration, complete-family approval or new desktop app yet.</p>
<p>View at 100% browser zoom. Every scene below occupies exactly 400 x 260 CSS pixels. The building occupies about 115 x 94 logical pixels at the unchanged 1600 x 900 presentation and ordinary camera. High and 1080p use identical tick, camera and native geometry. Narrow windows scroll rather than shrink. These are actual world renders through the current production-C path, not pasted artwork.</p>
<p>The building was naturally produced and legally placed in a Soviet match. The review then freezes the animation loop and selects render frames without changing health or rules. The complete authored active master sits at the native activity depth; a transparent diagnostic body keeps its original indexed shadow. Construction uses its original layer. This temporary composition does not validate powered-off body art, complete animation, repair, sale, destruction or final gameplay.</p>
<p>Original Construction Yard, Rhino and terrain are controls. Conscripts use the accepted HD pack. Existing accepted Rhino/GAPOWR scene references were inspected separately. No asset or camera scale was enlarged for these comparisons.</p>
'''+''.join(sections)+'''
<section><h2>Source / export / runtime trace</h2><p>All three columns use matched apparent size. The first two are static image composites; only the last is a crop of the actual world render. Raw 1387 x 1134 artwork supports 4x export without upsampling. Uniform registration preserves proportions; no nonuniform warp or enlarged retail-pixel fill is used.</p><div class="scroll">'''+embed(out/'source-export-runtime.png',750,550,'Source export runtime trace')+'''</div></section>
<section><h2>Supplementary detail</h2><p>These 2.4x detail crops are supplemental, not the standard-size judgment above.</p><div class="scroll">'''+embed(out/'normal-detail.png',552,440,'Supplementary normal detail')+'''</div></section>
<section><h2>Scope and decision</h2><p>Normal, locally varied activity, damage and one meaningful construction phase are authored. The electrical sample retains exactly unchanged RGB outside its documented effect mask and identical alpha. Full loop continuity, all 67 planned member slots, final body/activity decomposition, owner-color acceptance and ordinary-game integration remain pending representative approval.</p><p>The normal raw outline touches the image bounds; no missing extension was invented. Source alpha is preserved with premultiplied linear-light resampling. The four raw outputs and exact prompts remain immutable. Early failed texture-cloning captures are retained separately and are not used in this review.</p><p>Judge whether the direction is worthwhile at ordinary gameplay size, remains recognizable as NAPOWR, and fits the accepted assets. Approval authorizes the already-scoped full-family work. Rejection keeps the baseline and requires a specific revision direction.</p></section></html>'''
(out / 'review.html').write_text(body)
(out / 'review-receipt.json').write_text(json.dumps({'status':'REPRESENTATIVE_ART_REVIEW_PENDING','runtime':str(runtime),'logicalCrop':list(crop),'sceneCss':[400,260],'rawImageCount':4,'runtimeCaptures':len(report['samples']), 'reviewSha256':hashlib.sha256(body.encode()).hexdigest()},indent=2)+'\n')
print(out / 'review.html')
