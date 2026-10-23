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
parts = Path('.artifacts/m1-3d/candidate-v2')
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
# A direct crop montage at output density 1. No resize or retouch.
board=Image.new('RGB',(600,440))
for i,(body,turret) in enumerate([(0,0),(0,90),(90,0),(90,90)]):
    tile=Image.open(out/f'b{body}-t{turret}-standard-1080p-candidate.png')
    assert tile.size==(300,220);board.paste(tile,((i%2)*300,(i//2)*220))
board.save(out/'four-combinations-native.png')
# Keep original component exports available with explicitly enlarged inspection dimensions.
component_html=''
for name in ['body-0','body-90','turret-0','turret-90']:
    (out/f'{name}.png').write_bytes((parts/f'{name}.png').read_bytes())
    component_html+=f'<figure><figcaption>{name} · source 4× detail only</figcaption>{embed(name+".png",256,224)}</figure>'
html='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rhino independent parts review</title>
<style>body{font:17px/1.5 system-ui;background:#17212b;color:#e8edf3;margin:24px}h1{font-size:28px}h2{font-size:22px}a{color:#9bd8ff}.row{display:flex;gap:12px;min-width:924px}figure{margin:0;flex:none;width:300px}figcaption{height:54px;font-size:16px}img{display:block;max-width:none}section{margin:32px 0}p{max-width:1050px}summary{font-size:22px;cursor:pointer}</style>
<h1>Rhino: four combinations · lower-profile turret revision 2</h1><p><b>RUNTIME CHECKED / VISUAL REVIEW PENDING.</b> Open at 100% browser zoom. Rows never fit-shrink; narrow windows scroll. A and R use the same tick, camera, lighting and output density. The middle column is a synthetic assembly reference, not game rendering.</p>
<p>New hull hidden surfaces and turret flanks require visual approval. Normal Rhino stays original. Only 0° and 90° are authored; all other headings/states/colors fall back to the complete original vehicle. Reference red only, no owner remap. Native VXL shadows are an approximation; folded part depths do not establish full vehicle or slope correctness.</p>
<p>Revision 1 was not accepted: the user found the turret too tall and insufficiently low-slung. Revision 2 changes only the two turret images and their bearing landmarks; both hull exports are byte-identical. The protruding cylindrical bearing is removed and the hatch/housing profile is lower. <a href="../feedback-v1.json">Feedback receipt</a> · <a href="../review-v2/review.html">Prior review, retained</a>.</p><p>The initial eight rows use the accepted reference height 900. Historical enlarged-camera rows are separate below and do not establish standard-size quality.</p>'''
html+=''.join(sections[:8])+'<details><summary>Historical target size — diagnostic only</summary>'+''.join(sections[8:])+'</details>'
html+='<details><summary>Authored parts — enlarged inspection only</summary><p>Four separately generated RGBA images, uniform-scale packaging. No four-pose raster is used at runtime. Bare hulls include complete decks; turret bearings are aligned to the same pivot. Shadows and remap remain bounded as described above.</p><div class="row">'+component_html+'</div></details>'
html+='<p><a href="review.json">Measurements</a> · <a href="../candidate-v2/manifest.json">Source hashes and pivot registration</a> · <a href="../authoring-v2/turret0-prompt.txt">Generation prompt example</a></p></html>'
(out/'review.html').write_text(html)
(out/'review.json').write_text(json.dumps({'status':'NATIVE_SIZE_REVIEW_PENDING','runtime':report['status'],'rows':metrics,
    'images':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.glob('*.png')}},indent=2)+'\n')
print(json.dumps({'output':str(out),'rows':len(metrics),'outsideChanges':sum(r['outsideRhinoChangedPixels'] for r in metrics),
    'referenceDeltaRange':[min(r['meanMaxChannelDifference'] for r in metrics),max(r['meanMaxChannelDifference'] for r in metrics)]}))
