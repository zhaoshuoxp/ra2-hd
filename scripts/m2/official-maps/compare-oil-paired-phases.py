"""Export untouched Original and HD frames on the same native logical canvas."""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

pack, output = map(Path, sys.argv[1:3])
assert not output.exists()
output.mkdir(parents=True)
guide=Path('.artifacts/m2-3/native-guides-v3')
sources={s['member']:s for s in json.loads((guide/'source.json').read_text())['sources']}
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def native(member,n):
    s=sources[member];f=s['frames'][n]
    p=guide/'native'/f['file']
    assert sha(p)==f['rgbaSha256']
    return Image.frombytes('RGBA',tuple(f['size']),p.read_bytes()), f

def hd(member,d):
    folder=pack/'members'/member.replace('.','-')
    m=json.loads((folder/'manifest.json').read_text());v=next(v for v in m['variants'] if v['density']==d)
    pages={p['id']:Image.open(folder/str(d)/p['id']/'base.png').convert('RGBA') for p in v['pages']}
    return {f['nativeFrame']:pages[f['page']].crop((f['contentRect'][0],f['contentRect'][1],f['contentRect'][0]+f['contentRect'][2],f['contentRect'][1]+f['contentRect'][3])) for f in v['frames']}

manifest=[]
for d in (2,4):
    body=hd('ctoild.shp',d);active=hd('ctoild_a.shp',d)
    for state in (0,1):
        strips=[Image.new('RGBA',(166*d*8,122*d*4)) for _ in range(2)]
        native_body,bf=native('ctoild.shp',state)
        for phase in range(32):
            n=state*32+phase
            original=Image.new('RGBA',(166,122));original.alpha_composite(native_body,tuple(bf['origin']))
            sprite,f=native('ctoild_a.shp',n);original.alpha_composite(sprite,tuple(f['origin']))
            original=original.resize((166*d,122*d),Image.Resampling.NEAREST)
            current=Image.new('RGBA',(166*d,122*d));current.alpha_composite(body[state],(29*d,(12 if state==0 else 26)*d));current.alpha_composite(active[n],(75*d,37*d))
            for strip,im in zip(strips,(original,current)):strip.alpha_composite(im,(phase%8*166*d,phase//8*122*d))
        for label,strip in zip(('original','r16'),strips):
            file=output/f'{label}-{d}x-state{state}-phases.png';strip.save(file)
            manifest.append(dict(file=file.name,density=d,state=state,source=label,sha256=sha(file),phases=32))
        if d==4:
            for group in range(4):
                board=Image.new('RGB',(4*528,2*356),(28,28,28));draw=ImageDraw.Draw(board)
                for k in range(8):
                    n=group*8+k
                    for j,strip in enumerate(strips):
                        x=n%8*664;y=n//8*488
                        crop=strip.crop((x+(75+28)*4,y+(37+10)*4,x+136*4,y+(37+53)*4)).resize((264,344),Image.Resampling.NEAREST)
                        px=k%4*528+j*264;py=k//4*356
                        board.paste(crop,(px,py+12),crop)
                        draw.text((px+4,py),f'{"Original" if j==0 else "R16"} | {n}',font_size=18,fill='white')
                board.save(output/f'rear-state{state}-phases{group*8:02d}-{group*8+7:02d}.png')
(output/'manifest.json').write_text(json.dumps(dict(status='EXPORTED_SAME_PHASE_REFERENCE',sourceSha256=sha(guide/'source.json'),files=manifest),indent=2)+'\n')
