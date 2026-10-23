"""Recover original tank coverage from two diagnostic clear colors, without repainting."""
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image

root=Path('.artifacts/m1-3a/references-v1')
out=Path('.artifacts/m1-3a/authoring-v1')
out.mkdir(exist_ok=False)
report=json.loads((root/'result.json').read_text())
records=[]
for heading,name in [(0,'primary'),(180,'complementary')]:
    for preset in ['4k','1080p']:
        black=np.array(Image.open(root/f'{preset}-{heading}-black.png').convert('RGB'),dtype=float)/255
        white=np.array(Image.open(root/f'{preset}-{heading}-white.png').convert('RGB'),dtype=float)/255
        alpha=np.clip(1-(white-black).mean(axis=2),0,1)
        rgb=np.divide(black,alpha[:,:,None],out=np.zeros_like(black),where=alpha[:,:,None]>0)
        rgba=np.concatenate([np.clip(rgb,0,1),alpha[:,:,None]],axis=2)
        image=Image.fromarray(np.uint8(np.round(rgba*255)))
        bbox=image.getbbox(); image.save(out/f'{name}-{preset}-tank-layer.png')
        trimmed=image.crop(bbox);trimmed.save(out/f'{name}-{preset}-original-trim.png')
        record={'pose':name,'bodyHeading':heading,'turretHeading':heading,'preset':preset,'layerSize':image.size,
                'alphaBounds':bbox,'trimSize':trimmed.size,'alphaLevels':len(np.unique(np.uint8(np.round(alpha*255)))),
                'method':'Black/white clear-color coverage recovery from isolated original mesh; no original design edits.'}
        records.append(record)
        if preset=='4k':
            board=Image.new('RGBA',(1024,768)); factor=min(900/trimmed.width,640/trimmed.height)
            factor=int(factor)
            enlarged=trimmed.resize((trimmed.width*factor,trimmed.height*factor),Image.Resampling.NEAREST)
            offset=((1024-enlarged.width)//2,(768-enlarged.height)//2)
            board.alpha_composite(enlarged,offset);board.save(out/f'{name}-original-reference.png')
            record.update({'boardSize':board.size,'boardScale':factor,'boardOffset':offset})
(out/'reference-metadata.json').write_text(json.dumps({'records':records,'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.glob('*.png')}},indent=2)+'\n')
print(json.dumps(records))
