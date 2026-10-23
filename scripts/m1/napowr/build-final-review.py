"""Build an offline, fixed-reference-size review from the actual Mac renderer."""
import base64
import json
import math
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root=Path('.artifacts/m1-6a');game=root/sys.argv[1];out=root/sys.argv[2];out.mkdir(exist_ok=False)
report=json.loads((game/'result.json').read_text())
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',18)
small=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',15)
normal=next(s for s in report['samples'] if s['name']=='normal' and s['mode']=='1080p' and s['hd'])
center=(sum(p[0] for p in normal['points'])/len(normal['points']),sum(p[1]for p in normal['points'])/len(normal['points']))

def crop(file, sample, name):
 im=Image.open(game/file);sx=sample['buffer'][0]/sample['logical'][0];sy=sample['buffer'][1]/sample['logical'][1]
 x,y=center;im=im.crop((round((x-170)*sx),round((y-130)*sy),round((x+170)*sx),round((y+130)*sy)))
 im.save(out/name)
 return im.resize((340,260),Image.Resampling.LANCZOS)

panels=[]
for state in ['normal','damaged','buildup12']:
 for mode in ['1080p','4k']:
  for hd in [False,True]:
   s=next(s for s in report['samples'] if s['name']==state and s['mode']==mode and s['hd']==hd)
   name=f'{state}-{mode}-{hd}.png';im=crop(s['filename'],s,name)
   panels.append((state,mode,hd,name,im))
overview=Image.new('RGB',(720,6*300+60),'#17232a');draw=ImageDraw.Draw(overview)
draw.text((20,15),'NAPOWR: Original / HD at reference height 900',font=font,fill='white')
for i,(state,mode,hd,name,im) in enumerate(panels):
 x=20+(i%2)*350;y=60+(i//2)*300;draw.text((x,y),f'{state} / {"High" if mode=="4k" else mode} / {"HD" if hd else "Original"}',font=small,fill='white');overview.paste(im,(x,y+28))
overview.save(out/'native-overview.png')
for role,count in [('active',18),('construction',26)]:
 seq=[crop(f'{role}-{i}.png',normal,f'{role}-{i}.png') for i in range(count)]
 # Reference-speed review; gameplay retains its native speed multiplier.
 duration=round(1000 / (normal['animationSpeed'] * normal['activeRate' if role=='active' else 'buildupRate']))
 seq[0].save(out/f'{role}-native.webp',save_all=True,append_images=seq[1:],duration=duration,loop=0,lossless=True)
 if role=='construction': seq[-1].save(out/'sale-native.webp',save_all=True,append_images=seq[-2::-1],duration=duration,loop=0,lossless=True)
for name in ['blue','yellow']:
 s=next(s for s in report['samples']if s['name']=='normal'and s['mode']=='4k'and s['hd']);crop(f'owner-{name}.png',s,f'owner-{name}.png')

def image(name,alt,width=340,height=260):
 p=out/name;mime='image/webp' if p.suffix=='.webp' else 'image/png'
 return f'<figure><img alt="{alt}" width="{width}" height="{height}" src="data:{mime};base64,{base64.b64encode(p.read_bytes()).decode()}"><figcaption>{alt}</figcaption></figure>'
html='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NAPOWR M1.6a final visual review</title><style>body{background:#17232a;color:#eef2ec;font:18px/1.5 system-ui;margin:24px;max-width:1120px}h1{font-size:28px}h2{font-size:23px;margin-top:32px}p{max-width:900px}section{display:flex;gap:20px;flex-wrap:wrap}figure{margin:0 0 24px}img{display:block;object-fit:fill}figcaption{max-width:340px;font-size:16px}a{color:#a6d7ff}.scroll{overflow-x:auto}small{font-size:15px}</style><h1>NAPOWR M1.6a — final visual review pending</h1><p>Representative direction accepted. This complete optional 67-frame family runs through the normal Mac app loader. All panels show actual game rendering of a naturally constructed Soviet reactor. Frozen pose comparisons and alternate registered owner palettes are supplemental render probes; natural damage, repair, sale and destruction are recorded separately.</p><p>View at 100% browser zoom. Each scene panel is fixed at 340 × 260 reference pixels, using the accepted 900-high presentation. No camera enlargement. The reactor stays 116 × 94 logical pixels including native even padding. High and 1080p change sampling only.</p>'''
for state in ['normal','damaged','buildup12']:
 html+=f'<h2>{state}</h2>'
 for mode in ['1080p','4k']:
  html+='<section>'
  for _,_,hd,name,_im in [p for p in panels if p[0]==state and p[1]==mode]:html+=image(name,f'{"Original" if not hd else "HD 4× pack"} · {"High (2160-high buffer)" if mode=="4k" else "1080p"}')
  html+='</section>'
html+='<h2>Default-speed native sequences</h2><p>Runtime-rendered frame sweeps at the measured default solo-speed multiplier of 6: active 30 fps; construction 43.33 fps; sale is reversed construction. Rates remain native. The static surroundings here are frozen for comparison.</p><section>'
for name,label in [('active-native.webp','Active loop'),('construction-native.webp','Construction'),('sale-native.webp','Sale')]:html+=image(name,label)
html+='</section><h2>Registered owner colors</h2><section>'+image('owner-blue.png','Blue owner palette')+image('owner-yellow.png','Yellow owner palette')+'</section>'
html+=f'''<h2>Evidence and limits</h2><p>Captured logical viewport: {normal['logical'][0]:.2f} × 900; CSS canvas: {normal['css'][0]:.2f} × {normal['css'][1]:.2f}; DPR {normal['dpr']}. Buffers: {normal['buffer'][0]} × 1080 and {next(s for s in report['samples']if s['mode']=='4k')['buffer'][0]} × 2160. This is an actual Electron drawing-buffer check, not a claim of physical 3840 × 2160 panel output.</p><p>Temperate only. Native shadows, shared effects, footprint, rules and timing remain Original. Final visual quality and hands-on gameplay acceptance require the user's decision. Windows and iCloud transfer were not part of this milestone.</p><p>Use the separate M1.6a Mac app. Resources remain external in /Users/Aone/RA2remaster/ra2-hd/.local. Enable “Soviet Power Plant (temperate) → HD” in Options before starting a match. Original remains available.</p></html>'''
(out/'review.html').write_text(html)
(out/'review.json').write_text(json.dumps(dict(status='FINAL_VISUAL_REVIEW_PENDING',source=str(game),fixedPanel=[340,260],logicalHeight=900,samples=report['samples']),indent=2)+'\n')
print(str(out/'review.html'))
