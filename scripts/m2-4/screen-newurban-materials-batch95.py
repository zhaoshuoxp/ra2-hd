"""Inspect registered accepted structures and original material correspondence."""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from newurban_batch94_io import assemble, crop, pin, read, write

ROOT = Path('.artifacts/m2-4/newurban-remaining-terrain-reuse-batch95-20261021')
GUIDE = Path('.artifacts/m2-4/newurban-native-v1')
targets = {s['member']: s for s in read(GUIDE / 'source.json')['sources']}
screen = read(ROOT / 'candidate-screen-v1.json')
donors = {(s['theater'], s['member']): s for s in read(ROOT / 'accepted-native-donors-v1/source.json')['sources']}

def rgba(root, frame):
    file = root / frame['file']
    return np.fromfile(file, np.uint8).reshape(*reversed(frame['size']), 4)

def geometry(frame):
    return [frame[k] for k in ['subTile', 'grid', 'block', 'logical', 'offset', 'origin', 'height',
                               'hasExtraData', 'hasZData', 'rampType']] + [frame['extra'] if frame['hasExtraData'] else None]

rows = []
for row in screen['rows']:
    target = targets[row['member']]
    candidates = []
    active = [i for i in target['images'] if i['nativeOffset'] > 0]
    for key in row['candidates']:
        donor = donors[key['theater'], key['member']]
        other = [i for i in donor['images'] if i['nativeOffset'] > 0]
        if len(active) != len(other) or any(geometry(a) != geometry(b) for a, b in zip(active, other)):
            continue
        a = np.concatenate([rgba(GUIDE / 'native', f).reshape(-1, 4) for f in active])
        b = np.concatenate([rgba(Path('.'), f).reshape(-1, 4) for f in other])
        mask = (a[:, 3] > 0) & (b[:, 3] > 0)
        av, bv = a[mask, :3].astype(float), b[mask, :3].astype(float)
        corr = float(np.corrcoef(av.mean(1), bv.mean(1))[0, 1])
        gain = ((bv - bv.mean(0)) * (av - av.mean(0))).sum(0) / np.maximum(((bv - bv.mean(0)) ** 2).sum(0), 1)
        adapted = (bv - bv.mean(0)) * gain + av.mean(0)
        candidates.append(dict(**key, alphaDifferences=int((a[:, 3] != b[:, 3]).sum()),
            rgbRmse=float(np.sqrt(((av - bv) ** 2).mean())), luminanceCorrelation=corr,
            affineColorRmse=float(np.sqrt(((av - adapted) ** 2).mean())), gain=gain.tolist(),
            targetMean=av.mean(0).tolist(), donorMean=bv.mean(0).tolist()))
    candidates.sort(key=lambda v: (v['alphaDifferences'] > 0, v['affineColorRmse']))
    rows.append(dict(member=row['member'], maps=row['maps'], set=row['set'], candidates=candidates))
write(ROOT / 'material-screen-v1.json', dict(status='READ_ONLY_MATERIAL_AND_CONTACT_SCREEN',
    sources=pin(ROOT / 'candidate-screen-v1.json'), rows=rows))
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 20)
chosen=['cliffx01.ubn','cliffx05.ubn','cliffx21.ubn','cliffx22.ubn','cliffx34.ubn','wclifx10.ubn','cliffa07.ubn','rough01.ubn']
canvas=Image.new('RGB',(1400,len(chosen)*250),(22,30,34));draw=ImageDraw.Draw(canvas)
for index,name in enumerate(chosen):
    row=next(r for r in rows if r['member']==name); target=targets[name]
    originals=[(f,rgba(GUIDE/'native',f)) for f in target['images'] if f['nativeOffset']>0]
    im,_=assemble(originals); im=im.resize((im.width*2,im.height*2),Image.Resampling.NEAREST)
    im.thumbnail((320,208));canvas.paste(im,(10,index*250+35),im);draw.text((10,index*250+5),f'{name} Original x2',font=font,fill='white')
    for col,key in enumerate(row['candidates'][:3],1):
        donor=donors[key['theater'],key['member']]
        original,_=assemble([(f,rgba(Path('.'),f)) for f in donor['images'] if f['nativeOffset']>0]); original=original.resize((original.width*2,original.height*2),Image.Resampling.NEAREST); original.thumbnail((320,105))
        hd,_=assemble([(f,crop(donor['pointer'],donor['member'],f['subTile'],4)) for f in donor['images'] if f['nativeOffset']>0],4);hd.thumbnail((320,105))
        x=10+col*350;canvas.paste(original,(x,index*250+35),original);canvas.paste(hd,(x,index*250+140),hd)
        draw.text((x,index*250+5),f'{key["theater"]} {key["member"]}',font=font,fill='white')
canvas.save(ROOT/'source-and-accepted-structures-v1.png')
for r in rows:
 print(r['member'],[(v['theater'],v['member'],round(v['luminanceCorrelation'],4),round(v['affineColorRmse'],2),v['alphaDifferences']) for v in r['candidates'][:2]])
