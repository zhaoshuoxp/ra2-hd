"""Embed actual bridge overlay comparisons without duplicating game packages."""
import base64
import hashlib
import html
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

root=Path('.artifacts/m2-4/bridge-overlay-completion-r5-20261019')
prior=Path('.artifacts/m2-4/bridge-network-seams-r4-20261019')
out=root/'review-v3';out.mkdir(exist_ok=False)
name='M2.4-Bridge-Midspan-HD-R5-Embedded'
read=lambda f:json.loads(f.read_text())
sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
suite=read(root/'native-suite-v3.json')
assert suite['status'].startswith('PASS_ACTUAL_BRIDGE_OVERLAY_HD')
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',24)
images=[]


def embed(file,label):
    images.append(dict(file=str(file.resolve()),sha256=sha(file),bytes=file.stat().st_size,
        size=list(Image.open(file).size),label=label))
    return f'<img alt="{html.escape(label)}" src="data:image/png;base64,{base64.b64encode(file.read_bytes()).decode()}">'


def scene(base,density,index):
    directory=(f'native-{density}x-v3' if base==root else 'native-4x-v2' if density==4 else 'native-2x-v1')
    return base/directory/f'{index:02d}-m2-4-newurban-structures-set19-framebuffer.png'


def comparison(density,index,box,stem):
    a,b=[Image.open(file).convert('RGB').crop(box) for file in [scene(prior,density,index),scene(root,density,index)]]
    w,h=a.size;sheet=Image.new('RGB',(w*2+20,h+48),'#171d24');draw=ImageDraw.Draw(sheet)
    for i,(image,label) in enumerate([(a,'R4 / Original bridge overlay'),(b,f'R5 / actual {density}X bridge overlay')]):
        x=i*(w+20);draw.text((x+8,8),label,font=font,fill='white');sheet.paste(image,(x,48))
    file=out/f'{stem}-{density}x.png';sheet.save(file)
    return f'<div class="density d{density}"><div class="scroll">{embed(file,f"{stem} / {density}X before and after")}</div></div>'


sections=[]
for index,title,box,stem in [
    (0,'Reported bridge / full connection',(330,390,1080,800),'reported-bridge'),
    (0,'Midspan detail / same captured scale',(480,470,930,730),'midspan-detail'),
    (2,'Second bridge / original elevation retained',(300,330,1100,850),'second-bridge'),
]:
    controls=''.join(comparison(density,index,box,stem) for density in [4,2])
    sections.append(f'<section><h2>{title}</h2>{controls}</section>')

original=Image.open(prior/'native-original-v3/00-original-bridge.png').crop((330,390,1080,800))
original.save(out/'original-control.png');original_html=embed(out/'original-control.png','Original bridge control / unchanged source')
fight=Image.open(root/'native-fight-4x-v3/00-BRIDGE1-framebuffer.png').crop((300,330,1100,850))
fight.save(out/'opposite-orientation.png');fight_html=embed(out/'opposite-orientation.png','Fight / opposite BRIDGE1 orientation / actual 4X')
states=Image.new('RGB',(800,3*(520+48)),'#171d24');draw=ImageDraw.Draw(states)
for index,(state,label) in enumerate([('damaged','Native damage / 4X'),('demolished','Native demolition / 4X'),('repaired','Engineer repair / 4X')]):
    image=Image.open(root/f'native-4x-v3/high-concrete-bridge-{state}-framebuffer.png').convert('RGB').crop((300,330,1100,850))
    top=index*568;draw.text((8,top+8),label,font=font,fill='white');states.paste(image,(0,top+48))
states.save(out/'native-states-4x.png');states_html=embed(out/'native-states-4x.png','Actual 4X native bridge damage, demolition and engineer repair')

page=f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bridge midspan HD — R5</title><style>
*{{box-sizing:border-box}}body{{margin:0;background:#10161d;color:#e9eef4;font:20px/1.5 system-ui,sans-serif}}
main{{max-width:1680px;margin:auto;padding:24px}}h1{{font-size:36px;line-height:1.2}}h2{{font-size:27px}}
p{{max-width:1140px;color:#bac7d5}}section{{margin:28px 0;border-top:1px solid #384352;padding-top:12px}}
label{{display:inline-block;padding:8px 16px;margin:6px;background:#263445;border-radius:6px;cursor:pointer}}
input{{margin-left:24px}}.scroll{{overflow:auto;background:#171d24;padding:12px}}img{{display:block;max-width:none;width:auto;height:auto}}
.d2{{display:none}}#density2:checked~main .d4{{display:none}}#density2:checked~main .d2{{display:block}}
#zoom:checked~main img{{zoom:2}}details{{margin:20px 0}}summary{{cursor:pointer;padding:10px;background:#263445}}
footer{{margin:28px 0;color:#aebfce;font-size:17px}}
</style><input id="density4" type="radio" name="density" checked><label for="density4">4X</label>
<input id="density2" type="radio" name="density"><label for="density2">2X</label>
<input id="zoom" type="checkbox"><label for="zoom">2× inspection zoom</label><main>
<h1>Bridge midspan HD — R5</h1><p>R4's destructible center was still Original. R5 adds its complete HD overlay family and projects the same accepted Temperate road texture used at the approaches. Review the center's detail, color and connection to both ends.</p>
<p>All 18 body states have 2X and 4X resources; original shadows and native geometry are retained. The approaches and other accepted artwork are unchanged. Images retain captured framebuffer scale by default; scroll horizontally when needed. Transient effects may differ between native captures.</p>
{"".join(sections)}
<details><summary>Opposite bridge orientation / Fight / 4X</summary><div class="scroll">{fight_html}</div></details>
<details><summary>Actual native damage, demolition and engineer repair / 4X</summary><div class="scroll">{states_html}</div></details>
<details><summary>Original control / retained unchanged source</summary><div class="scroll">{original_html}</div></details>
<footer>Actual bridge overlay bindings verified at 2X and 4X, including all four reported midspan objects. Native passage, damage, demolition, repair and release pass. Color and seam appearance: pending user review. Windows: not run. M2.4 remains in progress. No new game package.</footer></main></html>'''
file=out/(name+'.html');file.write_text(page)
metadata=dict(status='ACTUAL_MIDSPAN_HD_NATIVE_PASS_VISUAL_PENDING',html=dict(file=str(file.resolve()),sha256=sha(file),bytes=file.stat().st_size),
    images=images,nativeSuiteSha256=sha(root/'native-suite-v3.json'),runtimeSourceCommit=suite['runtimeSourceCommit'],
    candidate=read(root/'export-and-source-audit-v3.json')['candidate'],originalControl=suite['reusedOriginal'],
    userAcceptance='PENDING',windows='NOT_RUN',m24Complete=False,perBatchGamePackageCreated=False)
(out/(name+'.json')).write_text(json.dumps(metadata,indent=2)+'\n')
print(json.dumps(dict(file=str(file),images=len(images),bytes=file.stat().st_size,sha256=sha(file))))
