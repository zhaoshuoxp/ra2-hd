"""Register authored representative copies without warping or retail-pixel fills."""
import base64
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

root = Path('.artifacts/m1-6a')
out = root / 'exports-v1'
out.mkdir(exist_ok=False)
art = root / 'art-v1'
raws = {name: Image.open(art / f'{name}-raw.png').convert('RGBA') for name in ['normal', 'damaged', 'buildup', 'active']}
# Generated edits share an exact canvas. Retain the master transform for activity
# and damage; construction follows its independently verified native trim.
normal = np.asarray(raws['normal']).copy()
active = np.asarray(raws['active'])
mask_image = Image.new('L', raws['normal'].size)
d = ImageDraw.Draw(mask_image)
d.polygon([(640,236),(797,215),(910,260),(962,370),(931,417),(882,450),(885,615),(850,694),(820,740),(686,827),(547,850),(463,800),(466,736),(500,649),(579,597),(555,505),(576,350)], fill=255)
mask = np.asarray(mask_image.filter(ImageFilter.GaussianBlur(5))).astype(float) / 255
composite = normal.copy()
composite[:,:,:3] = np.rint(normal[:,:,:3]*(1-mask[:,:,None])+active[:,:,:3]*mask[:,:,None]).astype(np.uint8)
# Coverage is exactly the master; no generated phase may move the silhouette.
raws['active'] = Image.fromarray(composite)
raws['active'].save(out / 'active-registered-master.png')
mask_image.save(out / 'active-effect-mask.png')
report = {'status': 'REPRESENTATIVE_REVIEW_ONLY', 'runtimeActivation': False, 'colorSpace': 'sRGB RGBA8; linear-light premultiplied area resampling',
          'transform': 'Uniform scale plus translation only. No retail RGB fills, no nonuniform warp.', 'samples': []}

def resample(im, scale):
    a = np.asarray(im).astype(np.float32)/255
    rgb = np.where(a[:,:,:3]<=.04045,a[:,:,:3]/12.92,((a[:,:,:3]+.055)/1.055)**2.4)
    prem = np.dstack([rgb*a[:,:,3:4],a[:,:,3]])
    size = tuple(round(n*scale) for n in im.size)
    p = np.stack([np.asarray(Image.fromarray(prem[:,:,k]).resize(size,Image.Resampling.BOX)) for k in range(4)],axis=2)
    lin = np.divide(p[:,:,:3],p[:,:,3:4],out=np.zeros_like(p[:,:,:3]),where=p[:,:,3:4]>0)
    p[:,:,:3] = np.where(lin<=.0031308,lin*12.92,1.055*np.maximum(lin,0)**(1/2.4)-.055)
    return Image.fromarray(np.uint8(np.clip(np.rint(p*255),0,255)))

for name,member,frame in [('normal','ngpowr_a.shp',0),('active','ngpowr_a.shp',9),('damaged','ngpowr_a.shp',19),('buildup','ntpowrmk.shp',12)]:
    source=json.loads((root/'source-v1'/f'{member}.json').read_text());f=source['frames'][frame]
    im=raws[name]
    # Fit the native trim while retaining aspect ratio. Normal/active share an
    # identical transform. Damage uses the same height and centers in its trim.
    bbox=im.getchannel('A').point(lambda a:255 if a>8 else 0).getbbox()
    if name in ('normal','active'): bbox=(0,0,1387,1134)
    crop=im.crop(bbox)
    scale=min(f['width']/crop.width,f['height']/crop.height)
    sample={'name':name,'member':member,'nativeFrame':frame,'nativeCanvas':source['canvas'],
            'nativeTrim':[f['x'],f['y'],f['width'],f['height']], 'rawSize':list(im.size),'sourceCrop':list(bbox),
            'uniformScaleToLogical':scale,'nativeEquivalentDensity':1/scale,'upsampling':False,
            'sourceSha256':hashlib.sha256((art/f'{name}-raw.png').read_bytes()).hexdigest(),'exports':[]}
    indices=np.array(f['pixels'],dtype=np.uint8).reshape(f['height'],f['width'])
    # Source-aware support intersects authored red; neutral masonry and blue
    # emissive pixels cannot enter owner remapping.
    support=Image.fromarray(np.uint8((indices>=16)&(indices<=31))*255).filter(ImageFilter.MaxFilter(9))
    for density in (2,4):
        size=((f['width']+f['width']%2)*density,(f['height']+f['height']%2)*density)
        exported=Image.new('RGBA',size)
        resized=resample(crop,scale*density)
        offset=(round((f['width']*density-resized.width)/2), f['height']*density-resized.height)
        exported.paste(resized,offset)
        pixels=np.asarray(exported).copy();rgb=pixels[:,:,:3].astype(float)
        allowed=np.zeros(size[::-1],dtype=bool)
        allowed[:f['height']*density,:f['width']*density]=np.asarray(support.resize((f['width']*density,f['height']*density),Image.Resampling.NEAREST))>0
        red=allowed&(rgb[:,:,0]>rgb[:,:,1]*1.5)&(rgb[:,:,0]>rgb[:,:,2]*1.5)&(pixels[:,:,3]>0)
        shade=np.abs(rgb[:,:,0,None]-np.array([63,59,55,52,48,44,41,37,33,30,26,22,19,15,11,8])*4).argmin(axis=2)
        data=np.zeros_like(pixels);data[:,:,3]=255;data[:,:,0][red]=255;data[:,:,1][red]=shade[red]
        exported.save(out/f'{name}-{density}x.png');Image.fromarray(data).save(out/f'{name}-{density}x-data.png')
        full=Image.new('RGBA',(210*density,140*density));full.paste(exported,(f['x']*density,f['y']*density));full.save(out/f'{name}-{density}x-canvas.png')
        sample['exports'].append({'density':density,'size':list(size),'offset':list(offset),'contentSize':list(resized.size),'remapPixels':int(red.sum()),'shadeValues':np.unique(shade[red]).tolist(),'file':f'{name}-{density}x.png','data':f'{name}-{density}x-data.png'})
    report['samples'].append(sample)
report['activityInvariant']={'outsideMaskChangedPixels':int(np.any(composite[:,:,:3][mask==0]!=normal[:,:,:3][mask==0],axis=1).sum()),'alphaChangedPixels':int(np.count_nonzero(composite[:,:,3]!=normal[:,:,3]))}
(out/'report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report['activityInvariant']))

# Raw bytes avoid browser canvas decode/premultiplication in this explicitly
# diagnostic upload. Production loading still requires its ordinary PNG checks.
payload = []
for density in (2, 4):
    for sample in report['samples']:
        export = next(e for e in sample['exports'] if e['density'] == density)
        width, height = export['size']
        entry = {'density': density, 'width': width + 4, 'height': height + 4,
                 'aggregateFrames': [{'normal': 3, 'active': 12, 'damaged': 22, 'buildup': 91}[sample['name']]]}
        for role, filename in [('base', export['file']), ('data', export['data'])]:
            page = Image.new('RGBA', (width + 4, height + 4), (0, 0, 0, 0 if role == 'base' else 255))
            page.paste(Image.open(out / filename), (2, 2))
            entry[role] = base64.b64encode(page.tobytes()).decode()
        payload.append(entry)
    for native_frame, width in [(0, 116), (1, 114)]:
        entry = {'density': density, 'width': width * density + 4,
                 'height': 94 * density + 4, 'aggregateFrames': [native_frame]}
        for role in ['base', 'data']:
            page = Image.new('RGBA', (entry['width'], entry['height']), (0, 0, 0, 0 if role == 'base' else 255))
            entry[role] = base64.b64encode(page.tobytes()).decode()
        payload.append(entry)
(out / 'runtime-payload.json').write_text(json.dumps(payload))
