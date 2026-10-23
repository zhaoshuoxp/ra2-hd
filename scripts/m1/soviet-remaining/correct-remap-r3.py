"""Follow authored red paint through every state, independent of retail pixel positions."""
import hashlib
import json
import shutil
import sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT=Path('.artifacts/soviet-remaining')
selected=json.loads((ROOT/'production-selection-r3.json').read_text())
first=['NAHAND','NAREFN','NAWEAP','NACNST']
all_states={'NARADR','NADEPT','NAYARD','NAIRON','NAPSIS','NAMISL'}
report={'status':'PASS_AUTHOR_SPACE_REMAP','families':{},'constructionRgb':'BYTE_IDENTICAL_R2','fixedMaterials':'Neutral metals, hazard yellow, blue electricity and orange light are excluded by material chroma.'}
selection_out=json.loads((ROOT/'production-selection-r4.json').read_text()) if len(sys.argv)>1 else dict(selected)
if len(sys.argv)>1:report=json.loads((ROOT/'feedback-r3/remap-validation.json').read_text())
for name in [*selected,*first]:
    if len(sys.argv)>1 and name not in sys.argv[1:]:continue
    if name=='NAWALL':continue
    old=Path(selected[name]['exports']) if name not in first else Path('.artifacts/m1-6b/full-exports-animation-r4')/name
    out=ROOT/('full-exports-r7c' if name in ['NADEPT','NAYARD'] else 'full-exports-r7b' if name=='NAPSIS' else 'full-exports-r7')/name if name not in first else Path('.artifacts/m1-6b/full-exports-animation-r5')/name
    if not out.exists():shutil.copytree(old,out)
    src=json.loads((old/'candidate-review.json').read_text());r=json.loads((out/'candidate-review.json').read_text())
    rows=[]
    for row in r['frames']:
        member,n=row['member'],row['nativeFrame']
        build='mk.shp' in member
        if not build and name not in all_states:continue
        for e in row['exports']:
            image=np.array(Image.open(out/e['base']).convert('RGBA'));rgb=image[...,:3].astype(float);red,green,blue=np.moveaxis(rgb,2,0)
            # Pure authored paint includes shadowed and antialiased red material.
            # Orange warning bulbs and copper/brick are not red team paint.
            paint=(red>green*1.65)&(red>blue*1.65)&(red-np.maximum(green,blue)>14)&((blue>green*.48)|(green<red*.32))&(image[...,3]>0)
            data=np.array(Image.open(out/e['data']).convert('RGBA'));was=data[...,0]>0
            paint |= was & (image[...,3]>0)
            # Preserve the Iron Curtain's energized red dome as a native effect;
            # painted supports/armor still follow the owner palette.
            if name=='NAIRON' and member in ['ngiron_a.shp','ngiron_b.shp']:
                native=json.loads((ROOT/'source-v1'/name/(member+'.json')).read_text())['frames'][n]
                yy=np.arange(image.shape[0])[:,None]/e['density']+native['y']
                paint &= yy>=63
            shades=np.abs(red[...,None]-np.array([63,59,55,52,48,44,41,37,33,30,26,22,19,15,11,8])*4).argmin(axis=2)
            data[...,:3]=0;data[...,3]=255;data[...,0][paint]=255;data[...,1][paint]=shades[paint]
            Image.fromarray(data).save(out/e['data'])
            e.update(remapPixels=int(paint.sum()),shades=np.unique(shades[paint]).tolist())
            if build:assert (out/e['base']).read_bytes()==(old/e['base']).read_bytes(),(name,e['base'])
            rows.append(dict(member=member,frame=n,density=e['density'],before=int(was.sum()),after=int(paint.sum()),baseSha256=hashlib.sha256((out/e['base']).read_bytes()).hexdigest()))
    r['ownerMaterialCorrection']={'method':'Authored paint chroma follows the composed part; never clipped to retail remap coordinates','previous':str(old),'constructionRgb':'BYTE_IDENTICAL_R2'}
    (out/'candidate-review.json').write_text(json.dumps(r,indent=2)+'\n')
    report['families'][name]=rows
    if name in selected:selection_out[name]={'exports':str(out)}
    print(name,len(rows),'REMAP_CORRECTED_RGB_PRESERVED',flush=True)
(ROOT/'production-selection-r4.json').write_text(json.dumps(selection_out,indent=2)+'\n')
(ROOT/'feedback-r3/remap-validation.json').write_text(json.dumps(report,indent=2)+'\n')
