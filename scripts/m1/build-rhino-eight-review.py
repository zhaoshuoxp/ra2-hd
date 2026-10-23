"""Native-size A/reference/R evidence. Runtime images are direct, unretouched crops."""
import base64
import hashlib
import json
import math
import sys
from pathlib import Path
import numpy as np
from PIL import Image

source, out = map(Path, sys.argv[1:3])
out.mkdir(parents=True, exist_ok=False)
report = json.loads((source / 'result.json').read_text())
parts = Path('.artifacts/m1-3e/candidate-v1')
css = (300, 220)

def weights(count, left, width, samples):
    p = (np.arange(count) + .5 - left) * samples / width
    footprint = np.clip(samples / width, 1, 8)
    lo, hi = p - footprint / 2, p + footprint / 2
    cells = np.arange(samples)
    return np.maximum(0, np.minimum(hi[:, None], cells + 1) - np.maximum(lo[:, None], cells)) / footprint


def reference(background, bounds, body, turret):
    result = background.astype(float)
    support = np.zeros(background.shape[:2], dtype=bool)
    for key in [f'body-{body}', f'turret-{turret}']:
        art = np.asarray(Image.open(parts / f'{key}.png').convert('RGBA'), dtype=float) / 255
        rgb = np.where(art[..., :3] <= .04045, art[..., :3] / 12.92, ((art[..., :3] + .055) / 1.055) ** 2.4)
        rgba = np.concatenate([rgb * art[..., 3:], art[..., 3:]], axis=2)
        h, w = background.shape[:2]
        x0, y0, x1, y1 = bounds
        wx, wy = weights(w, x0, x1-x0, art.shape[1]), weights(h, y0, y1-y0, art.shape[0])
        filtered = np.stack([wy @ rgba[..., c] @ wx.T for c in range(4)], axis=-1)
        alpha = filtered[..., 3:]
        color = filtered[..., :3] / np.maximum(alpha, 1e-9)
        srgb = np.where(color <= .0031308, color * 12.92, 1.055 * np.maximum(color, 0) ** (1/2.4) - .055)
        coverage = np.where(alpha >= .995, 1, np.where(alpha <= .001, 0, alpha))
        result = srgb * 255 * coverage + result * (1-coverage)
        support |= coverage[..., 0] > 0
    return np.rint(np.clip(result, 0, 255)).astype(np.uint8), support


def embed(name, width=300, height=220):
    return f'<a href="{name}"><img src="data:image/png;base64,{base64.b64encode((out/name).read_bytes()).decode()}" width="{width}" height="{height}" alt="{name}"></a>'

sections, metrics = [], []
for group in report['rows']:
    rows = {r['mode']: r for r in group['rows']}
    row = rows['candidate']
    density = row['buffer'][1] / row['display'][3]
    world = next(d['viewport'] for d in row['draws'] if d['defaultFramebuffer'])
    viewport = row['viewport']
    def bounds(b):
        return np.array([world[0] + (b[0]-viewport['x'])*world[2]/viewport['width'],
            row['buffer'][1]-world[1]-world[3]+(b[1]-viewport['y'])*world[3]/viewport['height'],
            world[0] + (b[2]-viewport['x'])*world[2]/viewport['width'],
            row['buffer'][1]-world[1]-world[3]+(b[3]-viewport['y'])*world[3]/viewport['height']])
    b = bounds(row['rhinoBounds'][0]); cx,cy=(b[0]+b[2])/2,(b[1]+b[3])/2
    width,height=round(css[0]*density),round(css[1]*density)
    left,top=round(cx-width/2),round(cy-height/2); box=(left,top,left+width,top+height)
    panels={}
    for mode in ['original','background','candidate','restored']:
        image=Image.open(source/rows[mode]['file']).convert('RGB')
        crop=image.crop(box);panels[mode]=np.array(crop);crop.save(out/f"{group['name']}-{mode}.png")
    ref,support=reference(panels['background'],b-np.array([left,top,left,top]),row['body'],row['turret'])
    Image.fromarray(ref).save(out/f"{group['name']}-reference.png")
    delta=np.max(np.abs(ref.astype(int)-panels['candidate'].astype(int)),axis=2)
    original=np.array(Image.open(source/rows['original']['file']).convert('RGB'))
    candidate=np.array(Image.open(source/rows['candidate']['file']).convert('RGB'))
    outside=np.ones(original.shape[:2],dtype=bool)
    for rb in row['rhinoBounds']:
        x0,y0,x1,y1=bounds(rb)
        outside[max(0,math.floor(y0)-4):math.ceil(y1)+4,max(0,math.floor(x0)-4):math.ceil(x1)+4]=False
    changed=int(np.count_nonzero(np.any(original!=candidate,axis=2)&outside))
    assert changed==0, 'Changes outside Rhino canvas'
    assert np.array_equal(panels['original'],panels['restored'])
    metric={'name':group['name'],'body':row['body'],'turret':row['turret'],'historical':row['historical'],
        'tick':row['tick'],'display':row['display'],'buffer':row['buffer'],'logical':row['logical'],
        'camera':row['camera'],'density':density,'crop':box,'quadCss':[(b[2]-b[0])/density,(b[3]-b[1])/density],
        'meanMaxChannelDifference':float(delta[support].mean()),'withinTwoLevelsPercent':float((delta[support]<=2).mean()*100),
        'outsideRhinoChangedPixels':changed,'transparentChangedPixels':int(np.count_nonzero(np.any(panels['background']!=panels['candidate'],axis=2)&~support))}
    metrics.append(metric)
    label='Historical size: diagnostic only' if row['historical'] else 'Standard 900 reference'
    content=''.join(f'<figure><figcaption>{label}</figcaption>{embed(group["name"]+"-"+mode+".png")}</figure>' for mode,label in [
        ('original','A — original runtime'),('reference','2D ASSEMBLY REFERENCE — NOT RUNTIME'),('candidate','R — two independent world layers')])
    full='../'+str(source.relative_to(out.parent))+'/'+row['file']
    sections.append(f'<section><h2>{label} · body {row["body"]}° / turret {row["turret"]}° · {group["name"].split("-")[-1]}</h2>'
        f'<p>{density:g} output pixels / CSS pixel. Tick {row["tick"]}. Each panel is 300×220 CSS pixels. <a href="{full}">Full runtime frame</a>.</p><div class="row">{content}</div></section>')
# Native 1080p crops only: no resizing, sharpening or compositing in this matrix.
from PIL import ImageDraw, ImageFont
headings = list(range(0, 360, 45))
board = Image.new('RGB', (1320, 950), '#17212b')
draw = ImageDraw.Draw(board)
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 18)
for i, h in enumerate(headings):
    draw.text((60+i*156, 12), f'Turret {h}', fill='white', font=font)
    draw.text((4, 48+i*112), str(h), fill='white', font=font)
    for j, t in enumerate(headings):
        tile=Image.open(out/f'b{h}-t{t}-standard-1080p-candidate.png').crop((75,55,225,165))
        tile.save(out/f'matrix-b{h}-t{t}.png')
        board.paste(tile,(60+j*156,42+i*112))
board.save(out/'sixty-four-native.png')
matrix='<table><thead><tr><th>Body / turret</th>'+''.join(f'<th>{h}°</th>' for h in headings)+'</tr></thead><tbody>'
for h in headings:
    matrix+=f'<tr><th>{h}°</th>'+''.join(f'<td>{embed(f"matrix-b{h}-t{t}.png",150,110)}</td>' for t in headings)+'</tr>'
matrix+='</tbody></table>'
motion=source/'motion-native.webm'
(out/'motion-native.webm').write_bytes(motion.read_bytes())
html='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rhino eight-heading review</title>
<style>body{font:17px/1.5 system-ui;background:#17212b;color:#e8edf3;margin:24px}h1{font-size:28px}h2,summary{font-size:22px}a{color:#9bd8ff}.row{display:flex;gap:12px;min-width:924px}figure{margin:0;flex:none;width:300px}figcaption{height:54px;font-size:16px}img,video{display:block;max-width:none}section{margin:32px 0}p{max-width:1050px}summary{cursor:pointer}th{font-size:18px;padding:6px}td{padding:2px}</style>
<h1>Rhino: eight body headings × eight independent turret headings</h1>
<p><b>TECHNICAL EVIDENCE AVAILABLE / VISUAL REVIEW PENDING.</b> Open at 100% browser zoom. Standard reference height 900 throughout. Images keep their stated CSS size; narrow windows scroll. Each A/reference/R row has identical tick, camera, light and output density.</p>
<p>The accepted M1.3d 0°/90° pixels are unchanged, with transparent padding only. Twelve new component views complete eight headings. Native body and turret angles remain continuous; the artwork independently selects the nearest 45° view. Maximum presentation error is 22.5°. No frame interpolation or moving tread animation is claimed.</p>
<p>Normal Rhino stays original. This opt-in proof supports reference red on flat ground. Firing, other colors, slopes/bridges, destruction and unsupported effects use the complete original family. Live original VXL shadows and folded layer depth remain approximations. Other assets, rules, camera and accepted M1.4 production C are unchanged.</p>
<h2>Actual movement and turns — native size</h2><p>Four native movement orders, captured directly from the 1080p drawing buffer at 640×360 pixels without scaling. This is actual gameplay, not manually cycled artwork. Static tracks and 45° transitions are visible for review.</p>
<video controls loop preload="metadata" width="640" height="360" src="motion-native.webm"></video>
<h2>All 64 combinations — native 1080p crops</h2><p>150×110 output pixels shown at 150×110 CSS pixels. Rows select the body; columns select the independent turret.</p>'''
html+=matrix+'<details><summary>Same-density A / assembly reference / runtime R comparisons: 64 at 1080p, 16 at 4K</summary>'+''.join(sections)+'</details>'
html+='<p>The middle reference panels are CPU artwork assemblies, explicitly not runtime captures. <a href="review.json">Measurements and identities</a> · <a href="../candidate-v1/manifest.json">Component source hashes and registration</a></p></html>'
(out/'review.html').write_text(html)
(out/'review.json').write_text(json.dumps({'status':'NATIVE_SIZE_REVIEW_PENDING','runtime':report['status'],'rows':metrics,
    'motion':report['motion'],'images':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.glob('*.png')}},indent=2)+'\n')
print(json.dumps({'output':str(out),'rows':len(metrics),'outsideChanges':sum(r['outsideRhinoChangedPixels'] for r in metrics),
    'transparentChanges':sum(r['transparentChangedPixels'] for r in metrics),
    'referenceDeltaRange':[min(r['meanMaxChannelDifference'] for r in metrics),max(r['meanMaxChannelDifference'] for r in metrics)]}))
