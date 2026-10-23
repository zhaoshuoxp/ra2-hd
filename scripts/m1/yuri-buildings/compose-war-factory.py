"""Full opaque factory interior and separate native gate/roof layers."""
import sys
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt
from production_common import ROOT, Family, row_for, resting, cells, decode, indices, clip
from mechanical_common import register_anchored, ground_plane
from construction_motion import telescope, hinge

output=sys.argv[1]
dry=row_for('YAWEAP')
assembly=ROOT/'production-art-v1/YAWEAP/assembly-keys-raw.png'
floor_key,low_key=cells(assembly,2)
for theater in ('TEMPERATE','SNOW'):
    for density in (2,4):
        f=Family('YAWEAP',theater,density,output)
        body,bib,active,rear,gate,front_roof,rear_roof,build=f.row['members']
        masters,opened=[],[]
        for damage,p in enumerate([ROOT/'art-v1/YAWEAP-TEMPERATE/normal-raw.png',ROOT/'production-art-v1/YAWEAP/damaged-raw.png']):
            masters.append(f.register(Image.open(p),resting(dry,bool(damage)).getbbox(),p))
            name='damaged-opened-body-raw.png' if damage else 'opened-body-raw.png'
            image,_=register_anchored(f,ROOT/'production-art-v1/YAWEAP'/name,f.registrations[-1]);opened.append(image)
        floor=f.register(floor_key[0],(63,172,262,229),assembly,source_region=floor_key[1])
        pallet=f.register(floor_key[0],(78,137,123,160),assembly,proportional=True,source_region=floor_key[1])
        lower=f.register(low_key[0],(63,119,262,229),assembly,source_region=low_key[1])
        ground=ground_plane(floor)
        gate_quad=[(177,145),(219,166),(241,213),(201,213)]
        def clear_entrance(image,n):
            image=image.copy();native=gate['frames'][n];rgba=np.array(image)
            x,y,w,h=(native[k]*density for k in ('x','y','width','height'))
            rgba[y:y+h,x:x+w]=0
            return Image.fromarray(rgba)
        def roof_mask(n,wanted):
            fields=[]
            for m in (front_roof,rear_roof):
                field=distance_transform_edt(indices(m,n)<=1)
                native=m['frames'][n];yy,xx=np.indices(field.shape)
                allowed=(xx>=native['x'])&(xx<native['x']+native['width'])&(yy>=native['y'])&(yy<native['y']+native['height'])
                field[~allowed]=1e6;fields.append(field)
            return Image.fromarray(np.uint8(np.argmin(np.stack(fields),axis=0)==wanted)*255).resize(f.size,Image.Resampling.NEAREST)
        for member in (body,bib):
            for n in range(member['visibleFrames']):
                image=masters[int(n!=0)] if member is body else clear_entrance(f.rectangle(opened[int(n!=0)],(171,165,262,229)),n)
                f.put(member,n,f.snow(member,n,image),'Fixed complete factory architecture and separately owned full forecourt/bib; exact native layer trim')
        for n in range(active['visibleFrames']):
            native=indices(active,n)
            if set(native.ravel())<={0,1}:
                image=decode(f.row,active,n).resize(f.size,Image.Resampling.NEAREST)
                operation='Retained native indexed control tail'
            else:
                image=f.polygon(masters[int(f.theater == 'SNOW' and n >= 8)],[(63,122),(100,122),(101,161),(165,187),(161,214),(81,182)])
                pixels=np.array(image)
                owner_paint=(pixels[...,0]>np.maximum(pixels[...,1],pixels[...,2])*1.8)&(pixels[...,0]>55)
                pixels[...,3][owner_paint]=0
                control=np.array(decode(f.row,active,n).getchannel('A').resize(f.size,Image.Resampling.BICUBIC))/255
                neutral=pixels[...,0]<pixels[...,1]*1.8
                pixels[...,:3]=np.uint8(np.clip(pixels[...,:3].astype(float)+(control*neutral)[...,None]*8,0,255))
                pixels[...,:3][pixels[...,3]==0]=0;image=Image.fromarray(pixels)
                operation='Complete photographed side conveyor and rear fixed machine at native roots; original local phase controls neutral machinery highlights'
            snow_frame = n % 8 if f.theater == 'SNOW' and n < 16 else n
            exported = image if set(native.ravel()) <= {0,1} else f.snow(active,snow_frame,image)
            f.put(active,n,exported,operation)
        for member in (rear,gate,front_roof,rear_roof):
            for n in range(member['visibleFrames']):
                native=indices(member,n)
                if set(native.ravel())<={0,1}:
                    image=decode(f.row,member,n).resize(f.size,Image.Resampling.NEAREST)
                    operation='Retained exact empty/native control factory layer'
                else:
                    damage=n==1;master=masters[int(damage)]
                    if member is gate:
                        image=opened[int(damage)].copy()
                    elif member is rear:
                        image=clear_entrance(master,n)
                        if n==2: image=f.rectangle(opened[0],(123,98,198,144))
                    elif member is front_roof:
                        mask=roof_mask(n,0)
                        image=opened[int(damage)].copy();image.putalpha(Image.fromarray(np.minimum(np.array(image.getchannel('A')),np.array(mask))))
                        if n==2: image=f.rectangle(opened[0],(220,180,265,225))
                    else:
                        mask=roof_mask(n,1)
                        image=opened[int(damage)].copy();image.putalpha(Image.fromarray(np.minimum(np.array(image.getchannel('A')),np.array(mask))))
                    operation='Complete authored gate, rear bay, forecourt arch or roof/spire layer; full opaque opened interior key for native opening slot; exact native per-layer ownership and factory socket retained'
                f.put(member,n,f.snow(member,n,image),operation)
        towers=[f.rectangle(masters[0],b) for b in [(72,73,134,181),(141,91,171,166)]]
        for n in range(build['visibleFrames']):
            image=pallet.copy() if n==0 else floor.copy()
            if n>=1:
                # The complete bay unfolds as one connected room. Dividing
                # its continuous arch surface introduced exposed cut edges.
                image.alpha_composite(clip(hinge(f,lower,(63,119,262,229),np.clip((n-1)/10,0,1)),ground))
            if n>=11:
                for part,region in zip(towers,[(100,40,126,210),(143,75,168,200)]):
                    image.alpha_composite(clip(telescope(f,part,build,n,region,13),ground))
            if n==build['visibleFrames']-1:image=masters[0].copy()
            f.put(build,n,f.snow(build,n,image),'Native starter pallet and fixed foundation; complete connected bay unfolds about its floor mount without cut edges; separate spire caps follow native tracks; exact completed endpoint')
        f.export()
