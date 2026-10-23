"""Build an embedded, JavaScript-free review with fixed native CSS dimensions."""
import argparse
import base64
import html
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFont

parser = argparse.ArgumentParser()
parser.add_argument('--run', default='.artifacts/m1-3/candidate-game-v2')
parser.add_argument('--output', default='.artifacts/m1-3/review-v1')
parser.add_argument('--reviewed-no-direction', action='store_true')
args = parser.parse_args()
run, output = Path(args.run), Path(args.output)
output.mkdir(parents=True, exist_ok=False)
report = json.loads((run / 'result.json').read_text())
assert report['status'] == 'PASS_PHASE_A_DIAGNOSTIC'
analysis = {'candidateIdentity': report['candidate'], 'sets': []}
parts = ['<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
'''<title>Rhino Phase A native-size review</title><style>
body{font:18px/1.5 system-ui,sans-serif;margin:24px;background:#161b20;color:#e8edf1}main{max-width:1100px;margin:auto}
h1{font-size:30px}h2{font-size:25px}h3{font-size:21px}a{color:#94cffb}.scroll{overflow:auto;max-width:100%}
.pair{display:flex;gap:16px;width:736px}.pair figure{margin:0;width:360px;flex:none}img.native{width:360px;height:260px;display:block}
.toggle{margin:16px 0}.toggle label{display:inline-block;padding:7px 16px;background:#354554;cursor:pointer}
.stack{width:360px;height:260px}.toggle .b{display:none}.toggle input:last-of-type:checked~.stack .a{display:none}
.toggle input:last-of-type:checked~.stack .b{display:block}summary{cursor:pointer}code{overflow-wrap:anywhere}
</style><main><h1>Rhino: original versus authored geometry</h1>
<p><strong>Phase A only. Visual decision pending. Original Rhino remains the default.</strong></p>
<p>View at 100% browser zoom. Every primary image is exactly <strong>360 × 260 CSS pixels</strong>, the same logical size as its in-game crop.
The 4K sources contain 720 × 520 physical pixels and must not be judged at their raw file width. Narrow windows scroll; tanks are never resized to fit.</p>
<p>A is the original VXL. B is one continuous chamfered-mesh study, revision 2: open tracks and road wheels, sloped hull/turret panels and a round stepped cannon.
It uses the existing vehicle meshes, HVA transforms, palette/VPL shader, light, depth and shadows. One explicitly spawned cross-faction HTNK stands beside the original Allied MCV in the South Pacific skirmish.</p>
<p><strong>Provisional assessment:</strong> B makes the track run and gun shape easier to separate, but broad bright surfaces and a blockier turret lose some of the original Rhino character.
This is not yet a demonstrated worthwhile HD improvement. Retaining A is a valid outcome. Polygon count and the enlarged supplement are not visual acceptance.</p>
<p>Each A/B pair is captured synchronously with identical simulation tick, owner, ground, lighting, camera, selection bounds and output density.
The body headings and independent gun pose are diagnostic render poses, not movement or firing acceptance. This host's ordinary vehicle path is non-batched.</p>''']


def embed(path, cls='', width=None, height=None):
    data = base64.b64encode(path.read_bytes()).decode()
    dimensions = f' width="{width}" height="{height}"' if width else ''
    return f'<img class="{cls}"{dimensions} alt="{html.escape(path.stem)}" src="data:image/png;base64,{data}">'


for preset in ['4k', '1080p']:
    parts.append(f'<h2>{"Primary: 4K output" if preset == "4k" else "Small repeat: 1080p output"}</h2>')
    for s in [s for s in report['sets'] if s['preset'] == preset]:
        rows = {r['label']: r for r in s['rows']}
        a, b = [run / rows[k]['file'] for k in ['A', 'B']]
        ai, bi = Image.open(a).convert('RGB'), Image.open(b).convert('RGB')
        bbox = ImageChops.difference(ai, bi).getbbox()
        key = f'{preset}-{s["body"]}-{s["turret"]}'
        title = f'Body {s["body"]}° / turret and barrel {s["turret"]}°'
        parts.append(f'<h3>{title}</h3><div class="scroll"><div class="pair">'
                     f'<figure><figcaption>A · Original</figcaption>{embed(a,"native")}</figure>'
                     f'<figure><figcaption>B · Candidate revision 2</figcaption>{embed(b,"native")}</figure></div></div>')
        parts.append(f'<div class="toggle"><input type="radio" name="{key}" id="{key}-A" checked>'
                     f'<label for="{key}-A">A: same position</label><input type="radio" name="{key}" id="{key}-B">'
                     f'<label for="{key}-B">B: same position</label><div class="scroll"><div class="stack">'
                     f'{embed(a,"native a")}{embed(b,"native b")}</div></div></div>')
        # The stack is nested in a scroll wrapper; use the adjacent sibling wrapper selectors.
        analysis['sets'].append({'name': key, 'changedPixelBounds': bbox, 'rows': s['rows']})
        pair = Image.new('RGB',(ai.width*2,ai.height+48),'#161b20')
        pair.paste(ai,(0,48));pair.paste(bi,(ai.width,48))
        draw=ImageDraw.Draw(pair)
        font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',24)
        draw.text((12,8),'A - Original',font=font,fill='white')
        draw.text((ai.width+12,8),'B - Candidate revision 2',font=font,fill='white')
        pair.save(output/f'{key}-pair.png')
        if preset=='4k' and s['body']==0:
            # Equal 3x logical-size crops; explicitly supplemental.
            detail=Image.new('RGB',(660,240),'#161b20')
            for i,im in enumerate([ai,bi]):
                detail.paste(im.crop((250,180,470,340)).resize((330,240),Image.Resampling.NEAREST),(i*330,0))
            detail.save(output/'detail-3x.png')
parts.append('<style>.toggle input:last-of-type:checked~.scroll .a{display:none}.toggle input:last-of-type:checked~.scroll .b{display:block}</style>')
parts.append('<h2>Supplement: enlarged detail</h2><p>3× logical size, equal enlargement on both sides. A left, B right. This is not the acceptance size.</p>'
             '<div class="scroll">'+embed(output/'detail-3x.png',width=660,height=240)+'</div>')
parts.append('<details><summary>Full original game context, 1920 × 1080 CSS pixels</summary><div class="scroll">'
             +embed(run/'4k-0-0-scene.png',width=1920,height=1080)+'</div></details>')
parts.append(f'<h2>Decision</h2><p>Is B worth extending to a complete bounded gameplay prototype, or should A be retained? '
             f'No Phase B work or ordinary-play activation occurs without explicit selection and instruction to continue.</p>'
             f'<p>Candidate SHA-256: <code>{report["candidate"]}</code>. Review applies to revision 2 only. '
             'Revision 1 was an interim closed-track study, retained in local evidence and not selected.</p></main></html>')
document=''.join(parts)
if args.reviewed_no_direction:
    document=document.replace('Visual decision pending.', 'REVIEWED_NO_DIRECTION_SELECTED.')
    document=document.replace('<h2>Decision</h2>', '<h2>Received visual feedback</h2><p>The user requested staying in Phase A and reported that B appears to consist of simple lines, with no detail or light and shade (English translation). No candidate was selected. Retain the original Rhino; Phase B is NOT STARTED.</p><h3>Historical review question</h3>')
    document=document.replace('<strong>Provisional assessment:</strong>', '<strong>Pre-review assessment, retained for context:</strong>')
(output/'review.html').write_text(document)
analysis['imageCount']=''.join(parts).count('<img ')
(output/'analysis.json').write_text(json.dumps(analysis,indent=2)+'\n')
print(json.dumps({'output':str(output),'imageCount':analysis['imageCount'],'candidateIdentity':report['candidate']}))
