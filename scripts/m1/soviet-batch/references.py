"""Render archived indexed controls; never use their RGB as authored HD pixels."""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
root=Path('.artifacts/m1-6b');inventory=json.loads((root/'source-v1/inventory.json').read_text())
out=root/'references-v1';out.mkdir(exist_ok=False)
font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',20)
config={
 'NAHAND':{'normal':[('nghand.shp',0)],'damaged':[('nghand.shp',1)]},
 'NAREFN':{'normal':[('ngrefnbb.shp',0),('ngrefn.shp',0),*[(f'ngrefnl{i}.shp',0)for i in range(1,5)]],
           'unload':[('ngrefnbb.shp',0),('ngrefn.shp',0),*[(f'ngrefnl{i}.shp',0)for i in range(1,5)],('ngrefnor.shp',9)],
           'damaged':[('ngrefnbb.shp',1),('ngrefn.shp',1),*[(f'ngrefnl{i}.shp',3)for i in range(1,5)]]},
 'NAWEAP':{'normal':[('ngweapbb.shp',0),('ngweap.shp',0),('ngweap_a.shp',0)],
           'open':[('ngweapbb.shp',0),('ngweap_1.shp',0),('ngweap_2.shp',0),('ngweap_a.shp',0)],
           'damaged':[('ngweapbb.shp',1),('ngweap.shp',1),('ngweap_a.shp',0)]},
 'NACNST':{'normal':[('ngcnst.shp',0),('ngcnst_c.shp',0),('ngcnst_a.shp',0)],
           'production':[('ngcnst.shp',0),('ngcnst_b.shp',10),('ngcnst_a.shp',0)],
           'damaged':[('ngcnst.shp',1),('ngcnst_c.shp',1),('ngcnst_a.shp',11)]}}
for id,states in config.items():
 directory=out/id;directory.mkdir()
 raws={m['source']['member']:json.loads((root/'source-v1'/id/(m['source']['member']+'.json')).read_text())for m in inventory['families'][id]['members']}
 def frame(member,n):
  raw=raws[member];f=raw['frames'][n];ind=np.array(f['pixels'],dtype=np.uint8).reshape(f['height'],f['width']);pal=np.array(raw['palette'],dtype=np.uint8)
  rgba=np.dstack([pal[ind],(ind!=0).astype(np.uint8)*255]);im=Image.new('RGBA',raw['canvas']);im.paste(Image.fromarray(rgba),(f['x'],f['y']));return im
 build=next(m for m in inventory['families'][id]['members']if 'BUILDUP'in m['roles'])
 for n in [0,build['aggregateVisibleFrames']//2,build['aggregateVisibleFrames']-1]:states[f'buildup-{n}']=[(build['source']['member'],n)]
 for state,layers in states.items():
  im=Image.new('RGBA',raws[layers[0][0]]['canvas'])
  for member,n in layers:im.alpha_composite(frame(member,n))
  im.save(directory/f'{state}.png')
  im.resize((im.width*4,im.height*4),Image.Resampling.NEAREST).save(directory/f'{state}-reference.png')
 for member,raw in raws.items():
  w,h=raw['canvas'];sheet=Image.new('RGB',(w*5,((len(raw['frames'])+4)//5)*(h+26)),'#34483d');draw=ImageDraw.Draw(sheet)
  for n in range(len(raw['frames'])):
   im=frame(member,n);x,y=n%5*w,n//5*(h+26);sheet.paste(im,(x,y+26),im);draw.text((x+4,y),str(n),font=font,fill='white')
  sheet.save(directory/f'{member}-all.png')
(out/'states.json').write_text(json.dumps(config,indent=2)+'\n')
board=Image.new('RGB',(1280,1000),'#34483d');draw=ImageDraw.Draw(board)
for i,id in enumerate(config):
 im=Image.open(out/id/'normal.png');x=i%2*640;y=i//2*500
 draw.text((x+20,y+15),id,font=font,fill='white');im=im.resize((im.width*2,im.height*2),Image.Resampling.NEAREST);board.paste(im,(x+20,y+45),im)
board.save(out/'all-normal-originals.png')
print('Decoded all native frames and representative compositions for four families.')
