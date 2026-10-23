"""Decode representative native layers and all motion controls without modifying originals."""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
ROOT = Path('.artifacts/soviet-remaining')
inv = json.loads((ROOT/'source-v1/inventory.json').read_text())
out = ROOT/'references-v1'
out.mkdir(exist_ok=False)
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
records = {}
for name, family in inv['families'].items():
    directory = out/name
    directory.mkdir()
    raws = {m['source']['member']:json.loads((ROOT/'source-v1'/name/(m['source']['member']+'.json')).read_text()) for m in family['members']}
    size = family['members'][0]['canvas']
    def frame(member, n):
        raw=raws[member]; f=raw['frames'][n]
        ind=np.array(f['pixels'],dtype=np.uint8).reshape(f['height'],f['width'])
        pal=np.array(raw['palette'],dtype=np.uint8)
        rgba=np.dstack([pal[ind],(ind!=0).astype(np.uint8)*255])
        im=Image.new('RGBA',raw['canvas']); im.paste(Image.fromarray(rgba),(f['x'],f['y']))
        return im
    def compose(layers):
        im=Image.new('RGBA',size)
        for member,n,offset in layers: im.alpha_composite(frame(member,n),tuple(offset))
        return im
    def base(damaged=False):
        layers=[]
        for role in ['bib','body']:
            for m in family['members']:
                if role in m['roles']: layers.append((m['source']['member'],int(damaged),[0,0]))
        return layers
    idle=[a for a in family['animations'] if a['type'] in ['IDLE','ACTIVE']]
    if not idle:idle=[a for a in family['animations'] if a['type']=='SUPER'][:1]
    def resting(damaged=False):
        return base(damaged)+[(a['member'],a.get('damaged',a['normal'])['start'] if damaged else a['normal']['start'],list(a['offset'].values())) for a in idle]
    states={'normal':resting(),'damaged':resting(True)}
    if name=='NAWALL':
        member=family['members'][0]['source']['member']
        states={f'connection-{i}':[(member,i,[0,0])] for i in range(16)}
        states['normal']=states['connection-5'];states['damaged']=[(member,21,[0,0])]
    sequences=[]
    for a in family['animations']:
        if a['type']=='UNBUILD':continue
        props=a['normal'];start=props['start'];end=props['loopEnd'] if props['loopCount']==-1 else props['end']
        indices=list(range(start,end+1)) if start<=end else list(range(start,end-1,-1))
        frames=[]
        for n in indices:
            layers=[] if a['type']=='BUILDUP' else [l for l in resting() if l[0]!=a['member'] and not (a['type']=='SPECIAL' and l[0].endswith('_b.shp')) and not (a['type']=='PRODUCTION' and l[0].endswith('_a.shp'))]
            layers.append((a['member'],n,list(a['offset'].values())))
            im=compose(layers);path=f'{a["name"]}-{n:03}.png';im.save(directory/path);frames.append(path)
        chosen=indices[len(indices)//2];states[f'{a["name"]}-middle']=([(a['member'],chosen,[0,0])] if a['type']=='BUILDUP' else [l for l in resting() if l[0]!=a['member']]+[(a['member'],chosen,list(a['offset'].values()))])
        sequences.append({'name':a['name'],'type':a['type'],'rate':props['rate'],'normalized':a['art'].get('Normalized','no'),'indices':indices,'frames':frames,'props':props})
    for label,layers in states.items():
        im=compose(layers);im.save(directory/(label+'.png'));im.resize((size[0]*4,size[1]*4),Image.Resampling.NEAREST).save(directory/(label+'-reference.png'))
    # All native activity views, including damage and unused frames, remain traceable.
    for member,raw in raws.items():
        w,h=raw['canvas'];count=raw['aggregateVisibleFrames'];sheet=Image.new('RGB',(w*6,((count+5)//6)*(h+28)),'#34483d');draw=ImageDraw.Draw(sheet)
        for n in range(count):
            im=frame(member,n);x,y=n%6*w,n//6*(h+28);sheet.paste(im,(x,y+28),im);draw.text((x+4,y),str(n),font=font,fill='white')
        sheet.save(directory/(member+'-all.png'))
    records[name]={'size':size,'states':states,'sequences':sequences,'turret':'NATIVE_VOXEL_CAPTURE_REQUIRED' if name in ['NALASR','NAFLAK'] else None}
(out/'states.json').write_text(json.dumps(records,indent=2)+'\n')
board=Image.new('RGB',(1500,1800),'#34483d');draw=ImageDraw.Draw(board)
for i,name in enumerate(records):
    im=Image.open(out/name/'normal.png');im.thumbnail((460,290));x=i%3*500;y=i//3*350
    draw.text((x+20,y+12),name,font=font,fill='white');im=im.resize((im.width*min(2,460//im.width),im.height*min(2,460//im.width)),Image.Resampling.NEAREST);board.paste(im,(x+20,y+44),im)
board.save(out/'all-originals.png')
print('PASS', len(records), 'families decoded; voxel turret references pending')
