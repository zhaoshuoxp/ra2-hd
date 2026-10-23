"""Native-geometry diagnostic exports from authored masters, never retail RGB fills."""
import base64
import hashlib
import json
import sys
import shutil
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
root=Path('.artifacts/m1-6b');revision=sys.argv[1] if len(sys.argv)>1 else 'exports-v1';out=root/revision;out.mkdir(exist_ok=False)
inv=json.loads((root/'source-v1/inventory.json').read_text());states=json.loads((root/'references-v1/states.json').read_text())
selected={'NAHAND':['normal','damaged'],'NAREFN':['normal','unload'],'NAWEAP':['normal','open'],'NACNST':['normal','production']}
report={'status':'REPRESENTATIVE_ONLY','runtimeActivation':False,'families':{},'composition':'Diagnostic shared-master crops retain each native layer geometry and indexed shadows. Idle/moving parts are not yet production-decomposed. No normal resolver registration.',
 'color':'sRGB RGBA; linear-light premultiplied area downsampling; 16 owner shades','geometry':'Uniform scale and translation; no nonuniform warp or source RGB fill.'}
payload=[]
if revision in ['exports-v2','exports-v3']:
 report=json.loads((root/'exports-v1/report.json').read_text())
 payload=[e for e in json.loads((root/'exports-v1/runtime-payload.json').read_text())if e['id']!='NACNST']
 for id in selected:
  if id!='NACNST':shutil.copytree(root/'exports-v1'/id,out/id)
 selected={'NACNST':selected['NACNST']}
if revision=='exports-v3':
 states['NACNST']['production']=[['ngcnst.shp',0],['ngcnst_b.shp',6],['ngcnst_a.shp',0]]
def resample(im,size):
 a=np.asarray(im).astype(np.float32)/255;rgb=np.where(a[:,:,:3]<=.04045,a[:,:,:3]/12.92,((a[:,:,:3]+.055)/1.055)**2.4);prem=np.dstack([rgb*a[:,:,3:4],a[:,:,3]])
 p=np.stack([np.asarray(Image.fromarray(prem[:,:,k]).resize(size,Image.Resampling.BOX))for k in range(4)],axis=2)
 lin=np.divide(p[:,:,:3],p[:,:,3:4],out=np.zeros_like(p[:,:,:3]),where=p[:,:,3:4]>0)
 p[:,:,:3]=np.where(lin<=.0031308,lin*12.92,1.055*np.maximum(lin,0)**(1/2.4)-.055)
 return Image.fromarray(np.uint8(np.clip(np.rint(p*255),0,255)))
for id,choices in selected.items():
 directory=out/id;directory.mkdir();family=inv['families'][id]
 raws={m['source']['member']:json.loads((root/'source-v1'/id/(m['source']['member']+'.json')).read_text())for m in family['members']}
 masters={s:Image.open(root/'art-v1'/id/f'{s}-raw.png').convert('RGBA')for s in choices}
 if revision=='exports-v2':masters['production']=Image.open(root/'art-v1/NACNST/production-r2-raw.png').convert('RGBA')
 if revision=='exports-v3':masters['production']=Image.open(root/'crane-correction-v3/production-raw.png').convert('RGBA')
 normal=masters['normal'];bbox=normal.getchannel('A').point(lambda a:255 if a>8 else 0).getbbox();crop=normal.crop(bbox)
 original=Image.open(root/'references-v1'/id/'normal.png');native=original.getchannel('A').getbbox();nw,nh=native[2]-native[0],native[3]-native[1]
 scale=min(nw/crop.width,nh/crop.height);tx=native[0]+(nw-crop.width*scale)/2;ty=native[3]-crop.height*scale
 assert 1/scale>=4
 row={'rawSize':list(normal.size),'sourceCrop':bbox,'nativeBounds':native,'uniformScale':scale,'translation':[tx,ty],'sourceDensity':1/scale,'upsampling':False,'states':{},'stationaryChecks':{}}
 if id in ['NAWEAP','NACNST']:
  state=choices[1];variant=Image.new('RGBA',normal.size);variant.paste(masters[state],(0,0))
  mask=Image.new('L',normal.size);draw=ImageDraw.Draw(mask)
  poly=([(825,770),(1080,627),(1240,615),(1338,861),(1347,1103),(1157,1141),(811,1034)]if id=='NAWEAP'else[(856,329),(1334,231),(1354,1159),(331,1159),(340,765),(718,624),(841,626)])
  if id=='NACNST'and revision=='exports-v3':poly=[(800,325),(1354,260),(1354,1159),(325,1159),(335,748),(700,604),(775,576)]
  draw.polygon(poly,fill=255);mask=mask.filter(ImageFilter.GaussianBlur(2))
  masters[state]=Image.composite(variant,normal,mask);mask.save(directory/'functional-region-mask.png')
  a=np.array(normal);b=np.array(masters[state]);outside=np.array(mask)==0
  row['stationaryChecks']={'outsideLocalMaskChangedPixels':int(np.any(a[outside]!=b[outside],axis=1).sum()),'mask':'functional-region-mask.png'}
  assert row['stationaryChecks']['outsideLocalMaskChangedPixels']==0
  masters[state].save(directory/f'{state}-registered-master.png')
 for state in choices:
  layers=states[id][state];row['states'][state]={'layers':layers,'exports':[]}
  for density in [2,4]:
   canvas=Image.new('RGBA',(original.width*density,original.height*density))
   master=normal if id=='NAREFN'and state=='unload'else masters[state]
   scaled=resample(master.crop(bbox),(round(crop.width*scale*density),round(crop.height*scale*density)))
   canvas.paste(scaled,(round(tx*density),round(ty*density)))
   canvas.save(directory/f'{state}-{density}x-canvas.png')
   for member,frame in layers:
    raw=raws[member];f=raw['frames'][frame];w,h=f['width'],f['height'];logical=(w+w%2,h+h%2)
    # Whole-master sample with retained native planes; production decomposition follows approval.
    transparent=(id=='NAREFN'and member.startswith('ngrefnl'))or(id=='NAWEAP'and member=='ngweap_a.shp')or(id=='NACNST'and ((state=='normal'and member=='ngcnst_c.shp')or(state=='production'and member=='ngcnst.shp')))
    base=Image.new('RGBA',(logical[0]*density,logical[1]*density))
    if id=='NAREFN'and member=='ngrefnor.shp':
     part=masters['unload'];part=part.crop(part.getchannel('A').point(lambda a:255 if a>8 else 0).getbbox());s=min(w/part.width,h/part.height)
     piece=resample(part,(round(part.width*s*density),round(part.height*s*density)))
     base.paste(piece,((w*density-piece.width)//2,h*density-piece.height));row['states'][state]['localPartDensity']=1/s
    elif not transparent:
     base.paste(canvas.crop((f['x']*density,f['y']*density,(f['x']+w)*density,(f['y']+h)*density)),(0,0))
    arr=np.array(base);rgb=arr[:,:,:3].astype(float)
    # Source support from the whole representative composition, not a broad red key.
    support=Image.new('L',original.size)
    for sm,sf in layers:
     fr=raws[sm]['frames'][sf];ind=np.array(fr['pixels'],dtype=np.uint8).reshape(fr['height'],fr['width'])
     local=Image.fromarray(np.uint8((ind>=16)&(ind<=31))*255);support.paste(Image.fromarray(np.maximum(np.array(support.crop((fr['x'],fr['y'],fr['x']+fr['width'],fr['y']+fr['height']))),np.array(local))),(fr['x'],fr['y']))
    support=support.filter(ImageFilter.MaxFilter(9)).crop((f['x'],f['y'],f['x']+w,f['y']+h)).resize((w*density,h*density),Image.Resampling.NEAREST)
    allowed=np.zeros((logical[1]*density,logical[0]*density),bool);allowed[:h*density,:w*density]=np.array(support)>0
    red=allowed&(rgb[:,:,0]>rgb[:,:,1]*1.5)&(rgb[:,:,0]>rgb[:,:,2]*1.5)&(arr[:,:,3]>0)
    if member=='ngrefnor.shp':red[:]=False
    shades=np.abs(rgb[:,:,0,None]-np.array([63,59,55,52,48,44,41,37,33,30,26,22,19,15,11,8])*4).argmin(axis=2)
    data=np.zeros_like(arr);data[:,:,3]=255;data[:,:,0][red]=255;data[:,:,1][red]=shades[red]
    prefix=f'{state}-{member}-{frame}-{density}x';base.save(directory/f'{prefix}.png');Image.fromarray(data).save(directory/f'{prefix}-data.png')
    export={'member':member,'frame':frame,'density':density,'logicalSize':logical,'sampleSize':list(base.size),'transparentDiagnosticLayer':transparent,'remapPixels':int(red.sum()),'shades':np.unique(shades[red]).tolist(),'base':f'{prefix}.png','data':f'{prefix}-data.png'}
    row['states'][state]['exports'].append(export)
    entry={'id':id,'state':state,'density':density,'aggregateFrame':raw['aggregateOffset']+frame,'width':base.width+4,'height':base.height+4}
    for role,im in [('base',base),('data',Image.fromarray(data))]:
     page=Image.new('RGBA',(entry['width'],entry['height']),(0,0,0,0 if role=='base' else 255));page.paste(im,(2,2));entry[role]=base64.b64encode(page.tobytes()).decode()
    payload.append(entry)
 report['families'][id]=row
(out/'states.json').write_text(json.dumps(states,indent=2)+'\n')
(out/'report.json').write_text(json.dumps(report,indent=2)+'\n');(out/'runtime-payload.json').write_text(json.dumps(payload))
print({id:{'density':round(v['sourceDensity'],2),'states':list(v['states'])}for id,v in report['families'].items()})
