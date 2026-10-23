"""Export review-only registered previews; preserve raw candidates and native shadows."""
import json, hashlib
from pathlib import Path
import numpy as np
from PIL import Image
root = Path('.artifacts/m1-7-yr')
out = root/'review-exports-v2'
out.mkdir(exist_ok=False)
inv = json.loads((root/'source-v1/inventory.json').read_text())
selections = json.loads((root/'references-v1/selection.json').read_text()) + json.loads((root/'air-references-v3/selection.json').read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
manifest = {'status':'REPRESENTATIVE_REVIEW_ONLY','newCompleteRuntimeFamilies':0,'runtimeActivation':False,'families':[],'limits':['Static source-registered previews do not prove runtime scale, motion, remap or complete-family coverage.','SHP previews retain native indexed shadow pixels; VXL shadows require native integration and are not fabricated here.','No new family activates before complete production and runtime validation.']}
def matte(im):
    a=np.asarray(im.convert('RGBA')).copy();rgb=a[:,:,:3].astype(float)
    if (a[:,:,3]<250).mean()>.05:return Image.fromarray(a)
    border=np.concatenate([rgb[0],rgb[-1],rgb[:,0],rgb[:,-1]])
    bg=np.median(border,axis=0)
    chroma=np.maximum(abs((rgb[:,:,1]-rgb[:,:,0])-(bg[1]-bg[0])),abs((rgb[:,:,1]-rgb[:,:,2])-(bg[1]-bg[2])))
    a[:,:,3]=(255*np.clip((chroma-5)/9,0,1)).astype('uint8');a[a[:,:,3]==0,:3]=0
    return Image.fromarray(a)
for sel in selections:
    id=sel['id'];is_shp=id not in ['SCHP','BPLN']
    refs=root/('references-v1' if is_shp else 'air-references-v3')
    rawpath=root/'authoring-v1'/id/'raw.png';raw=Image.open(rawpath).convert('RGBA');ref=Image.open(refs/f'{id}-board.png')
    sx,sy=raw.width/ref.width,raw.height/ref.height
    folder=out/id;folder.mkdir()
    row={'id':id,'parent':'BORIS' if id=='BPLN' else id,'raw':str(rawpath),'rawSha256':sha(rawpath),'sourceBoard':str(refs/f'{id}-board.png'),'prompt':str(rawpath.parent/'prompt.txt'),'tool':'built-in image_gen','samples':[]}
    body=None
    if is_shp:
        f=next(f for f in inv['families'] if f['id']==id)
        body=json.loads((root/'source-v1'/f'{f["members"][0]}.json').read_text())
    for i,c in enumerate(sel['cells']):
        x,y,w,h=c['cell']
        # Explicit sheet cells exclude generated labels; source metadata remains unchanged.
        if is_shp:
            column=i%3;top,bottom=(80,480) if i<3 else (640,1060)
            crop=(column*418,top,(column+1)*418,bottom)
        elif id=='SCHP':
            column=i%2;top,bottom=(65,505) if i<2 else (590,1110)
            crop=(column*627,top,(column+1)*627,bottom)
        else:crop=(i*raw.width//2,150,(i+1)*raw.width//2,690)
        tile=matte(raw.crop(crop))
        bbox=tile.getchannel('A').point(lambda a:255 if a>96 else 0).getbbox()
        if not bbox:raise ValueError(f'Empty candidate {id}/{i}')
        sprite=tile.crop(bbox)
        if is_shp:
            frame=body['frames'][c['nativeFrame']];pixels=np.asarray(frame['pixels']).reshape(frame['height'],frame['width'])
            ys,xs=np.where((pixels!=0)&(pixels!=12));bounds=(int(xs.min())+frame['x'],int(ys.min())+frame['y'],int(xs.max())+1+frame['x'],int(ys.max())+1+frame['y'])
            size=tuple(body['canvas']);original=Image.open(refs/f'{id}-{c["nativeFrame"]}-original.png').convert('RGBA')
            shadow=Image.new('RGBA',size)
            # Preserve both inline index-12 shadows and the source's second-half shadow frame.
            for sf in [frame,body['frames'][c['nativeFrame']+body['totalFrames']//2]]:
                data=np.asarray(sf['pixels']).reshape(sf['height'],sf['width'])
                mask=(data==12) if sf is frame else (data!=0)
                layer=np.zeros((sf['height'],sf['width'],4),dtype=np.uint8);layer[:,:,3]=mask.astype('uint8')*100
                shadow.alpha_composite(Image.fromarray(layer),(sf['x'],sf['y']))
            label=f'{c["state"]} / frame {c["nativeFrame"]}'
        else:
            original=Image.open(root/'native-references-v4'/c['source']).convert('RGBA')
            original=matte(original);size=original.size;bounds=original.getchannel('A').getbbox();shadow=Image.new('RGBA',size)
            label=f'{c["state"]} / yaw {c["heading"]}'
        density=4;canvas=shadow.resize((size[0]*density,size[1]*density),Image.Resampling.NEAREST)
        tw,th=(bounds[2]-bounds[0])*density,(bounds[3]-bounds[1])*density
        factor=min(tw/sprite.width,th/sprite.height)
        scaled=sprite.resize((max(1,round(sprite.width*factor)),max(1,round(sprite.height*factor))),Image.Resampling.LANCZOS)
        pos=(round((bounds[0]+bounds[2])*density/2-scaled.width/2),bounds[3]*density-scaled.height)
        canvas.alpha_composite(scaled,pos)
        # Crop both around the same source-space bounds, keeping native-size CSS dimensions.
        margin=8;box=(max(0,bounds[0]-margin),max(0,bounds[1]-margin),min(size[0],bounds[2]+margin),min(size[1],bounds[3]+margin))
        preview=canvas.crop(tuple(v*density for v in box));orig=original.crop(box)
        preview.save(folder/f'{i}-hd.png');orig.save(folder/f'{i}-original.png')
        row['samples'].append({'label':label,'hd':str(folder/f'{i}-hd.png'),'original':str(folder/f'{i}-original.png'),'displaySize':list(orig.size),'density':density,'nativeBounds':bounds,'rawCrop':crop,'registration':'uniform body-bounds fit; representative only','shadow':'original indexed' if is_shp else 'native runtime integration pending'})
    manifest['families'].append(row)
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Exported',len(manifest['families']),'review boards')
