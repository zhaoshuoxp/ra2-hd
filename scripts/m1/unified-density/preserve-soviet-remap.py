"""Retain accepted R3 owner-paint rules on newly recomposed 4x states."""
import json
import shutil
from pathlib import Path
import numpy as np
from PIL import Image
root=Path('.artifacts/unified-density/soviet-buildings-4x-final')
root.mkdir(exist_ok=False)
selection={}
for name in ['NALASR','NAFLAK','TESLA','NAIRON','NAYARD']:
    version='v3' if name in ['TESLA','NAYARD'] else 'v2'
    source=Path(f'.artifacts/unified-density/soviet-buildings-4x-{version}/exports')/name
    out=root/name;shutil.copytree(source,out)
    report=json.loads((out/'candidate-review.json').read_text())
    for row in report['frames']:
        member,n=row['member'],row['nativeFrame']
        if not member.endswith('mk.shp') and name not in ['NAIRON','NAYARD']:continue
        for e in row['exports']:
            rgba=np.array(Image.open(out/e['base']).convert('RGBA'));rgb=rgba[...,:3].astype(float)
            red,green,blue=np.moveaxis(rgb,2,0)
            data=np.array(Image.open(out/e['data']).convert('RGBA'))
            paint=(red>green*1.65)&(red>blue*1.65)&(red-np.maximum(green,blue)>14)&((blue>green*.48)|(green<red*.32))&(rgba[...,3]>0)
            paint|=(data[...,0]>0)&(rgba[...,3]>0)
            if name=='NAIRON' and member in ['ngiron_a.shp','ngiron_b.shp']:
                native=json.loads((Path('.artifacts/soviet-remaining/source-v1')/name/(member+'.json')).read_text())['frames'][n]
                paint&=np.arange(rgba.shape[0])[:,None]/e['density']+native['y']>=63
            shades=np.abs(red[...,None]-np.array([63,59,55,52,48,44,41,37,33,30,26,22,19,15,11,8])*4).argmin(axis=2)
            data[...,:3]=0;data[...,3]=255;data[...,0][paint]=255;data[...,1][paint]=shades[paint]
            Image.fromarray(data).save(out/e['data'])
    report['densityTransfer']='4x authored masters; accepted rigid construction, local effects and R3 owner-paint rules retained'
    (out/'candidate-review.json').write_text(json.dumps(report,indent=2)+'\n')
    selection[name]={'exports':str(out)}
(root/'selection.json').write_text(json.dumps(selection,indent=2)+'\n')
