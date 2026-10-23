"""Build a small, self-contained review of the actual connected bridge road."""
import base64
import hashlib
import html
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

root = Path('.artifacts/m2-4/bridge-network-seams-r4-20261019')
output = root/'review'
output.mkdir(exist_ok=False)
name = 'M2.4-Bridge-Network-Seams-R4-Embedded'
read = lambda file: json.loads(file.read_text())
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
suite = read(root/'native-suite.json')
assert suite['status'] == 'PASS_SCOPED_MAC_ORIGINAL_2X_4X_AND_RELEASE_REENTRY'
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 24)
images = []


def embed(file, label):
    images.append(dict(file=str(file.resolve()),sha256=sha(file),bytes=file.stat().st_size,
        size=list(Image.open(file).size),label=label))
    data = base64.b64encode(file.read_bytes()).decode()
    return f'<img alt="{html.escape(label)}" src="data:image/png;base64,{data}">'


def current(density, index):
    directory = 'native-4x-v2' if density == 4 else 'native-2x-v1'
    return root/directory/f'{index:02d}-m2-4-newurban-structures-set19-framebuffer.png'


def pair(left, right, box, labels, destination):
    a,b = [Image.open(file).convert('RGB').crop(box) for file in [left,right]]
    w,h = a.size
    sheet = Image.new('RGB',(w*2+20,h+48),'#171d24')
    draw = ImageDraw.Draw(sheet)
    for index,im in enumerate([a,b]):
        x=index*(w+20);draw.text((x+8,8),labels[index],font=font,fill='white');sheet.paste(im,(x,48))
    sheet.save(destination)
    return embed(destination,' / '.join(labels))


sections = []
for index,(title,box) in enumerate([
    ('Reported bridge: head, span and far end',(330,390,1080,800)),
    ('Intermediate segment and the opposite connection',(300,350,1100,850)),
    ('Second bridge and native elevation transition',(300,330,1100,850)),
]):
    controls = []
    for density in [4,2]:
        left = (Path('.artifacts/m2-4/bridge-road-contact-r3-20261019')/
            f'native-{density}x/00-m2-4-newurban-structures-set19-ovrps05.ubn-framebuffer.png'
            if index == 0 else root/f'native-original-v3/{index:02d}-original-bridge.png')
        labels = ['R3 / rejected contact' if index == 0 else 'Original',f'R4 / {density}X shared road']
        image = pair(left,current(density,index),box,labels,output/f'context-{index}-{density}x.png')
        controls.append(f'<div class="density d{density}"><div class="scroll">{image}</div></div>')
    note = ('The old R3 camera is reused exactly. The revised roadway now shares material and paint through the bridge.'
        if index == 0 else 'Original and R4 use the same verified camera tile. Native bridge walls and elevation transitions are retained.')
    sections.append(f'<section><h2>{title}</h2><p>{note}</p>{"".join(controls)}</section>')

original = Image.open(root/'native-original-v3/00-original-bridge.png').crop((330,390,1080,800))
original.save(output/'original-reported-bridge.png')
original_image = embed(output/'original-reported-bridge.png','Original reported bridge / global Original setting')
full = embed(current(4,0),'Full unchanged Manhattan context / R4 4X')
template = embed(root/'temp-accepted-proad02-4x.png','Accepted Temperate proad02 / reused source material')
page = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bridge road continuity — R4</title><style>
*{{box-sizing:border-box}}body{{margin:0;background:#10161d;color:#e9eef4;font:20px/1.5 system-ui,sans-serif}}
main{{max-width:1680px;margin:auto;padding:24px}}h1{{font-size:36px;line-height:1.2}}h2{{font-size:27px}}
p{{max-width:1100px;color:#bac7d5}}section{{margin:28px 0;border-top:1px solid #384352;padding-top:12px}}
label{{display:inline-block;padding:8px 16px;margin:6px;background:#263445;border-radius:6px;cursor:pointer}}
input{{margin-left:24px}}.scroll{{overflow:auto;background:#171d24;padding:12px}}img{{display:block;max-width:none;width:auto;height:auto}}
.d2{{display:none}}#density2:checked~main .d4{{display:none}}#density2:checked~main .d2{{display:block}}
#zoom:checked~main img{{zoom:2}}details{{margin:20px 0}}summary{{cursor:pointer;padding:10px;background:#263445}}
footer{{margin:28px 0;color:#aebfce;font-size:17px}}
</style><input id="density4" type="radio" name="density" checked><label for="density4">4X</label>
<input id="density2" type="radio" name="density"><label for="density2">2X</label>
<input id="zoom" type="checkbox"><label for="zoom">2× inspection zoom</label><main>
<h1>Bridge road continuity — R4</h1><p>Review the roadway joins across these three contexts. The connected bridge segments and all four straight-road alternatives now use one accepted Temperate HD surface. Other accepted artwork stays unchanged.</p>
<p>Default images retain captured framebuffer scale. Scroll horizontally when necessary. Native captures occur at different simulation ticks, so transient map effects may differ.</p>
{"".join(sections)}
<details><summary>Original control for the reported bridge</summary><div class="scroll">{original_image}</div></details>
<details><summary>Full R4 map context / 4X</summary><div class="scroll">{full}</div></details>
<details><summary>Accepted Temperate material reference</summary><div class="scroll">{template}</div></details>
<footer>Mac Original / 2X / 4X and release / reentry checks passed. Seam appearance: pending user review. Windows: not run. M2.4 remains in progress. No new game package.</footer></main></html>'''
file=output/(name+'.html');file.write_text(page)
metadata=dict(status='MAC_TECHNICAL_PASS_NETWORK_SEAM_VISUAL_PENDING',html=dict(file=str(file.resolve()),sha256=sha(file),bytes=file.stat().st_size),
    images=images,nativeSuiteSha256=sha(root/'native-suite.json'),runtimeSourceCommit=suite['runtimeSourceCommit'],
    candidate=read(root/'export-and-preservation-v1.json')['candidate'],
    reviewScope='Connected road surface on three bridge members and four straight-road alternatives; other accepted artwork excluded.',
    userSeamAcceptance='PENDING',windows='NOT_RUN',m24Complete=False,perBatchGamePackageCreated=False)
(output/(name+'.json')).write_text(json.dumps(metadata,indent=2)+'\n')
print(json.dumps(dict(file=str(file),images=len(images),bytes=file.stat().st_size,sha256=sha(file))))
