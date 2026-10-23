"""Compare local sprite anchors before reusing accepted pixels across canvas differences."""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from newurban_batch94_io import assemble, crop, read, write, pin
ROOT=Path('.artifacts/m2-4/newurban-remaining-terrain-reuse-batch95-20261021')
GUIDE=Path('.artifacts/m2-4/newurban-native-v1')
targets={s['member']:s for s in read(GUIDE/'source.json')['sources']}
donors={(s['theater'],s['member']):s for s in read(ROOT/'accepted-native-donors-v1/source.json')['sources']}
def pixels(frame, target=False):
 return np.fromfile((GUIDE/'native' if target else Path('.'))/frame['file'],np.uint8).reshape(*reversed(frame['size']),4)
def registered(a,b):
 out=np.zeros((*reversed(a['size']),4),np.uint8); delta=np.array(b['offset'])-a['offset']; p=pixels(b)
 x,y=map(int,delta);sx,sy=max(0,-x),max(0,-y);dx,dy=max(0,x),max(0,y);w=min(p.shape[1]-sx,out.shape[1]-dx);h=min(p.shape[0]-sy,out.shape[0]-dy)
 if w>0 and h>0:out[dy:dy+h,dx:dx+w]=p[sy:sy+h,sx:sx+w]
 return out
rows=[]
for name in ['cliffx21.ubn','cliffx22.ubn','cliffx33.ubn','cliffx34.ubn','cliffx39.ubn','cliffx40.ubn','baseb01.ubn','droadc09.ubn','rough01.ubn','rough04.ubn','rough05.ubn','rough09.ubn','rough10.ubn','droads43.ubn','droads46.ubn']:
 target=targets[name];stem=name.split('.')[0].replace('cliffx','cliff');theater='TEMPERATE' if name.startswith('cliffx2') else 'DESERT' if name.startswith('cliffx') else 'URBAN';ext={'TEMPERATE':'.tem','DESERT':'.des','URBAN':'.urb'}[theater];donor=donors.get((theater,stem+ext))
 if not donor:continue
 im,_=assemble([(f,pixels(f,True)) for f in target['images'] if f['nativeOffset']>0]); native,_=assemble([(f,pixels(f)) for f in donor['images'] if f['nativeOffset']>0]); hd,_=assemble([(f,crop(donor['pointer'],donor['member'],f['subTile'],4)) for f in donor['images'] if f['nativeOffset']>0],4)
 rows.append((name,theater,donor['member'],im,native,hd))
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',20)
canvas=Image.new('RGB',(1400,len(rows)*330),(22,30,34));draw=ImageDraw.Draw(canvas)
for i,(name,theater,member,a,b,c) in enumerate(rows):
 for col,(label,im) in enumerate([(name+' Original',a),(theater+' '+member+' Original',b),(member+' accepted 4X',c)]):
  if col<2:im=im.resize((im.width*3,im.height*3),Image.Resampling.NEAREST)
  im.thumbnail((445,285));canvas.paste(im,(10+col*465,i*330+35),im);draw.text((10+col*465,i*330+5),label,font=font,fill='white')
canvas.save(ROOT/'local-canvas-and-materials-v1.png')
rough_donors=[s for s in donors.values() if s['theater']=='URBAN' and s['member'].startswith('rough')]
for name in ['rough01.ubn','rough04.ubn','rough05.ubn','rough09.ubn','rough10.ubn']:
 target=targets[name];matches=[]
 for a in target['images']:
  p=pixels(a,True);candidates=[]
  for ds in rough_donors:
   for b in ds['images']:
    if a['logical']!=b['logical'] or a['offset']!=b['offset']:continue
    q=pixels(b);mask=(p[...,3]>0)&(q[...,3]>0);av=p[mask,:3].astype(float);bv=q[mask,:3].astype(float)
    if not len(av):continue
    rmse=float(np.sqrt(((av-bv)**2).mean()));corr=float(np.corrcoef(av.mean(1),bv.mean(1))[0,1])
    candidates.append(dict(member=ds['member'],slot=b['subTile'],rmse=rmse,correlation=corr,alphaDifferences=int((p[...,3]!=q[...,3]).sum())))
  matches.append(dict(subTile=a['subTile'],candidates=sorted(candidates,key=lambda c:c['rmse'])[:2]))
 write(ROOT/f'{name}-slot-screen-v1.json',dict(member=name,slots=matches))
 print(name,[(m['subTile'],[(c['member'],c['slot'],round(c['rmse'],1),round(c['correlation'],2)) for c in m['candidates'][:1]]) for m in matches])
