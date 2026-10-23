"""Native framebuffer crops only; no artwork editing, scaling or sharpening."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json
import shutil
import sys

source=Path(sys.argv[1]);out=Path('.artifacts/m1-3f/review-v1');out.mkdir(parents=True,exist_ok=False)
rows=json.loads((source/'captures.json').read_text())
for row in rows:
    scale=row['buffer'][0]/1920
    cx,cy=row['center'];w,h=round(320*scale),round(240*scale)
    # Source center is the unit foot; retain room above for the independent gun.
    box=(round(cx-w/2),round(cy-h*.65),round(cx-w/2)+w,round(cy-h*.65)+h)
    img=Image.open(source/row['file']);assert 0<=box[0]<box[2]<=img.width and 0<=box[1]<box[3]<=img.height
    img.crop(box).save(out/row['file']);row['crop']=list(box)
shutil.copy2(source/'combat.webm',out/'combat.webm')
(out/'capture-index.json').write_text(json.dumps(rows,indent=2)+'\n')
head='''<!doctype html><html lang="en"><meta charset="utf-8"><title>Rhino normal-match review</title>
<style>body{background:#171b22;color:#eceff4;font:18px system-ui;margin:28px;line-height:1.45}h1{font-size:30px}h2{font-size:24px}p{max-width:1080px}.pair{display:flex;gap:20px;margin-bottom:24px;flex-wrap:nowrap}figure{margin:0}figcaption{padding:8px 0}img,video{display:block;max-width:none;object-fit:none}a{color:#9ccfff}button{font:inherit;padding:8px 14px}details{margin:24px 0}summary{font-size:22px;cursor:pointer}.scroll{overflow:auto}code{font-size:16px}</style>
<h1>Rhino: normal-match integration, team colors and firing</h1>
<p><b>Visual review pending.</b> Accepted lower-profile art and all eight headings are preserved. These are crops of actual game output. No crop is enlarged, sharpened or repainted. View at browser zoom 100%.</p>
<p>The Rhino was built through the Soviet construction and vehicle queues. The renderer is installed by the ordinary Vehicle lifecycle. Static color and heading sweeps are reversible test fixtures; the combat recording runs the native simulation.</p>
<h2>Actual firing</h2><p>640 × 360 pixel recording cropped 1:1 from the 1920 × 1080 framebuffer. Body and turret stay authored during supported firing. Native shots, damage and destruction remain active.</p>
<video controls loop width="640" height="360" src="combat.webm"></video>
<h2>Native-size team colors</h2><p>Reference height 900; 1920 × 1080 output; 320 × 240 crops. Original and HD in every pair share the same simulation tick, camera, sampling density and native transforms.</p>
'''
body=[]
for color in ['red','blue','green','yellow','orange','purple','cyan','pink']:
    body.append(f'<h3>{color.title()}</h3><div class="scroll"><div class="pair">')
    for mode in ['original','hd']:
        file=f'{color}-1080p-{mode}.png';body.append(f'<figure><figcaption>{mode.title()}</figcaption><img src="{file}" width="320" height="240" alt="{color} {mode}"></figure>')
    body.append('</div></div>')
body.append('<details><summary>All eight headings with independent blue turrets</summary><p>Turret heading = body + 90°. Native-size pose fixtures; accepted source geometry and pixels remain unchanged.</p>')
for h in range(0,360,45):
    body.append(f'<h3>Body {h}° / turret {(h+90)%360}°</h3><div class="scroll"><div class="pair">')
    for mode in ['original','hd']:
        body.append(f'<figure><figcaption>{mode.title()}</figcaption><img src="heading-{h}-{mode}.png" width="320" height="240" alt="{h} {mode}"></figure>')
    body.append('</div></div>')
body.append('</details><details><summary>Native 4K pixel crops</summary><p>3840 × 2160 framebuffer, same 900-high logical camera. These 640 × 480 crops show physical framebuffer pixels at 1:1, not enlarged 1080p screenshots. Both columns use identical output density.</p>')
for color in ['red','blue','green','yellow','orange','purple','cyan','pink']:
    body.append(f'<h3>{color.title()}</h3><div class="scroll"><div class="pair">')
    for mode in ['original','hd']:
        body.append(f'<figure><figcaption>{mode.title()}</figcaption><img src="{color}-4k-{mode}.png" width="640" height="480" alt="4K {color} {mode}"></figure>')
    body.append('</div></div>')
body.append('''</details><h2>Review boundaries</h2><p>Original remains the default; enable HD in normal Options. Eight-way artwork, static tracks, original VXL shadows and two-layer depth remain the accepted approximation. Ramps, bridges, tilt/rocking, cloaking and other unsupported states fall back as a complete vehicle. No finer angles or new recoil/flash artwork is included. Please judge owner-color clarity and firing continuity separately from the prior accepted shape.</p></html>''')
(out/'review.html').write_text(head+''.join(body))
# A compact overview using native crops, with larger labels outside the game pixels.
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',22)
montage=Image.new('RGB',(640,552),(23,27,34));draw=ImageDraw.Draw(montage)
for i,(label,file) in enumerate([('Original','red-1080p-original.png'),('HD red','red-1080p-hd.png'),('HD blue','blue-1080p-hd.png'),('HD green','green-1080p-hd.png')]):
    x=(i%2)*320;y=(i//2)*276;draw.text((x+12,y+4),label,font=font,fill='white');montage.paste(Image.open(out/file),(x,y+36))
montage.save(out/'overview.png')
print(out/'review.html')
