"""Bind accepted artwork and native complete-family slots before state authoring."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT=Path('.artifacts/soviet-remaining');OUT=ROOT/'production-guides-v1';OUT.mkdir(exist_ok=False)
inv=json.loads((ROOT/'source-v1/inventory.json').read_text());accepted=json.loads((ROOT/'review-exports-v4/report.json').read_text());states=json.loads((ROOT/'references-v1/states.json').read_text());families={}
font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',26)
for n,f in inv['families'].items():
 members=[dict(member=m['source']['member'],roles=m['roles'],authorFrames=list(range(m['aggregateVisibleFrames'])),source=m['source'],hasShadow=m['hasShadow']) for m in f['members']]
 master=accepted['families'][n].get('master',str(ROOT/'art-v1'/n/'normal-raw.png'))
 build=next((s for s in states[n]['sequences'] if 'MK' in s['name']),None)
 samples=[('Normal','normal.png'),('Damaged','damaged.png')]
 if build:
  ns=[max(0,len(build['frames'])//5),len(build['frames'])//2]
  samples.extend([(f'Build {i}',build['frames'][i]) for i in ns])
 else:samples.extend([('Connection 0','connection-0.png'),('Connection 15','connection-15.png')])
 sheet=Image.new('RGB',(1200,1000),(39,55,44));draw=ImageDraw.Draw(sheet)
 for i,(title,file) in enumerate(samples):
  p=ROOT/'references-v1'/n/file
  if not p.exists():p=ROOT/'references-v1'/n/'normal.png'
  im=Image.open(p).convert('RGBA');b=im.getchannel('A').getbbox();im=im.crop(b);sc=min(550/im.width,420/im.height);im=im.resize((round(im.width*sc),round(im.height*sc)),Image.Resampling.NEAREST)
  x=(i%2)*600+(600-im.width)//2;y=(i//2)*500+60+(420-im.height)//2;sheet.paste(im,(x,y),im);draw.text(((i%2)*600+22,(i//2)*500+12),f'{n} {title}',font=font,fill='white')
 sheet.save(OUT/f'{n}.png')
 families[n]=dict(members=members,acceptedMaster=master,guide=str(OUT/f'{n}.png'),buildupSamples=samples[2:],completeFrames=sum(len(m['authorFrames']) for m in members),targetDensity=2,status='AUTHORING_REQUIRED')
(ROOT/'production-checklist-v1.json').write_text(json.dumps(dict(families=families),indent=2)+'\n')
print({n:f['completeFrames'] for n,f in families.items()});print('Total',sum(f['completeFrames'] for f in families.values()))
