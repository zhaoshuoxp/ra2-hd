"""Compose native reference pose boards for authoring, never substitute them for HD art."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
root=Path('.artifacts/soviet-remaining'); records=json.loads((root/'references-v1/states.json').read_text())
out=root/'motion-guides-v1';out.mkdir(exist_ok=False)
font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',22)
selection={'NARADR':'NARADR_A','NAPSIS':'NAPSIS_A','NADEPT':'NADEPT_C1','NAYARD':'NAYARD_D','NAMISL':'NAMISL_F','NATECH':'NATECHMK'}
report={}
for name,seqname in selection.items():
 seq=next(s for s in records[name]['sequences'] if s['name']==seqname)
 chosen=[round(i*(len(seq['frames'])-1)/7) for i in range(8)]
 board=Image.new('RGB',(1600,1200),'#34483d');draw=ImageDraw.Draw(board)
 for i,idx in enumerate(chosen):
  im=Image.open(root/'references-v1'/name/seq['frames'][idx]);box=im.getbbox();im=im.crop(box);im.thumbnail((370,535));scale=min(370/im.width,535/im.height);im=im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.NEAREST)
  x=i%4*400;y=i//4*600;board.paste(im,(x+(400-im.width)//2,y+50+(540-im.height)//2),im);draw.text((x+15,y+10),f'{i+1}: native {seq["indices"][idx]}',font=font,fill='white')
 board.save(out/f'{name}-8-poses.png');report[name]={'sequence':seqname,'samples':[seq['indices'][i]for i in chosen]}
for name in ['NALASR','NAFLAK']:
 board=Image.new('RGB',(1600,1200),'#34483d');draw=ImageDraw.Draw(board)
 for i,heading in enumerate(range(0,360,45)):
  im=Image.open(root/'turret-references-v3'/name/f'{heading}.png').convert('RGB')
  # Exact flat native isolation background enables a tight reference crop.
  import numpy as np
  a=np.asarray(im);mask=np.max(np.abs(a.astype(int)-[52,72,61]),axis=2)>15
  yy,xx=np.where(mask);im=im.crop((min(xx)-3,min(yy)-3,max(xx)+4,max(yy)+4));im.thumbnail((370,530));sc=min(370/im.width,530/im.height);im=im.resize((round(im.width*sc),round(im.height*sc)),Image.Resampling.NEAREST)
  x=i%4*400;y=i//4*600;board.paste(im,(x+(400-im.width)//2,y+50+(540-im.height)//2));draw.text((x+15,y+10),f'{i+1}: {heading} deg',font=font,fill='white')
 board.save(out/f'{name}-8-poses.png');report[name]={'samples':list(range(0,360,45)),'reference':'isolated native rotating part only; foundation is static'}
(out/'selection.json').write_text(json.dumps(report,indent=2)+'\n')
