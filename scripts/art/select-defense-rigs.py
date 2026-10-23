"""Select reviewed defense components and preserve Original snow appearance phases."""
import copy
from pathlib import Path

from PIL import Image,ImageDraw
import numpy as np

from buildup import read,write,sha
from painted_rig import over,place

ROOT=Path('.artifacts/buildup-remaining-20261013-r74-v1/soviet-defense-r92-v1')
selected={}
for version,identities in [(7,['naflak','naflak-snow']),(9,['tesla','tesla-snow']),
                           (13,['nabnkr-temperate','nabnkr-snow'])]:
    source=read(ROOT/f'prototype-v{version}/rigs.json')
    for key in identities:selected[key]=source[key]
for snow,temperate,phase in [('nabnkr-snow','nabnkr-temperate',22),('naflak-snow','naflak',6)]:
    selected[snow]['phases'][:phase]=copy.deepcopy(selected[temperate]['phases'][:phase])
    selected[snow]['snowAppearance']={'firstSnowPhase':phase,'method':'MATCH_ORIGINAL_THEATER_MATERIAL_APPEARANCE',
        'earlyGeometrySource':temperate,'completedSnowSource':'RETAINED_SNOW_FAMILY_UNCHANGED'}
out=ROOT/'selected-previews-v4';out.mkdir(exist_ok=False)
inventory=[]
for key,rig in selected.items():
    assert not rig['unselectedGeometryViolations']
    origin=Path(rig['phases'][1][0]['image']).parent
    canvas=Image.open(origin/'00-preview.png').size
    folder=out/key;folder.mkdir()
    for phase,nodes in enumerate(rig['phases']):
        frame=np.zeros((canvas[1],canvas[0],4),np.uint8)
        for node in nodes:
            assert sha(node['image'])==node['sha256']
            layer=place(Image.open(node['image']),node['box'],[canvas[0]//4,canvas[1]//4])
            frame=over(layer,frame)
        Image.fromarray(frame).save(folder/f'{phase:02}-preview.png')
    inventory.append({'key':key,'frames':len(rig['phases']),'nodes':sum(len(p) for p in rig['phases']),
        'previewFolder':str(folder),'previewHashes':[sha(folder/f'{p:02}-preview.png') for p in range(len(rig['phases']))]})
    for start in range(0,len(rig['phases'])-1,12):
        phases=list(range(start,min(start+12,len(rig['phases'])-1)))
        w,h=canvas[0]//2,canvas[1]//2
        sheet=Image.new('RGB',(w*4,(h+30)*6),(52,72,61));draw=ImageDraw.Draw(sheet)
        for i,phase in enumerate(phases):
            for j in range(2):
                file=ROOT/'original-frames'/key/f'{phase:02}.png' if j==0 else folder/f'{phase:02}-preview.png'
                im=Image.open(file).convert('RGBA').resize((w,h),Image.Resampling.NEAREST if j==0 else Image.Resampling.LANCZOS)
                x=i%4*w;y=(i//4*2+j)*(h+30);sheet.paste(im,(x,y+30),im)
                draw.text((x+4,y+2),f'{key} {phase:02} '+('Original' if j==0 else 'HD'),font_size=18)
        sheet.save(ROOT/f'final-v4-{key}-phases-{start:02}-{phases[-1]:02}.png')
for phase in range(25):
    assert np.array_equal(np.asarray(Image.open(out/'tesla'/f'{phase:02}-preview.png')),
                          np.asarray(Image.open(out/'tesla-snow'/f'{phase:02}-preview.png')))
write(ROOT/'selected-rigs-v4.json',selected)
write(ROOT/'artwork-inventory-v4.json',inventory)
print('Six records / 118 phases selected; all component files hash-verified')
