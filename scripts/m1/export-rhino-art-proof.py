"""Review-only uniform registration and premultiplied exports; no original-alpha constraint."""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

parser=argparse.ArgumentParser()
parser.add_argument('--output',default='.artifacts/m1-3a/review-v1')
parser.add_argument('--primary-source',default='.artifacts/m1-3a/authoring-v1/primary-generated-v2.png')
args=parser.parse_args()
out=Path(args.output);out.mkdir(parents=True,exist_ok=False)
art=Path('.artifacts/m1-3a/authoring-v1');refs=art.parent/'references-v1'
reference=json.loads((art/'reference-metadata.json').read_text())
result={'status':'ARTWORK_REVIEW_PENDING','runtime':'RUNTIME_TRANSFER_UNVERIFIED','poses':[]}
font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',17)
small=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',12)
for name,heading,filename in [('primary',0,'primary-generated-v2.png'),('complementary',180,'complementary-generated-v1.png')]:
    source=Path(args.primary_source) if name=='primary' else art/filename
    raw=Image.open(source).convert('RGBA');data=np.array(raw)
    # Remove only extremely faint detached contamination, preserving real soft edge alpha.
    removed=(data[:,:,3]>0)&(data[:,:,3]<8)
    removed_mass=float(data[:,:,3][removed].sum()/255)
    data[data[:,:,3]<8]=0
    clean=Image.fromarray(data);bbox=clean.getbbox();trim=clean.crop(bbox)
    clean.save(out/f'{name}-cleaned-source.png')
    native=next(r for r in reference['records'] if r['pose']==name and r['preset']=='4k')
    x0,y0,x1,y1=[v/2 for v in native['alphaBounds']]
    scale=min((x1-x0)/trim.width,(y1-y0)/trim.height)
    origin=(int((x0+x1)/2)-32,int((y0+y1)/2)-24)
    # Center horizontally and align the bottom of the visible original tank envelope.
    offset=((x0+x1)/2-origin[0]-trim.width*scale/2,y1-origin[1]-trim.height*scale)
    pad=max(trim.width,trim.height)*2
    padded=Image.new('RGBA',(trim.width+pad*2,trim.height+pad*2));padded.paste(trim,(pad,pad))
    sample=(pad-offset[0]/scale,pad-offset[1]/scale,
            pad+(64-offset[0])/scale,pad+(48-offset[1])/scale)
    assert min(sample)>=0 and sample[2]<=padded.width and sample[3]<=padded.height
    exports={}
    for density in [1,2,4]:
        # A floating source window gives exactly one scale on both axes; no stretch/warp.
        image=padded.convert('RGBa').resize((64*density,48*density),Image.Resampling.LANCZOS,box=sample).convert('RGBA')
        image.save(out/f'{name}-{density}x.png');exports[density]=image
    record={'name':name,'bodyHeading':heading,'turretHeading':heading,'source':str(source),
        'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'rawSize':raw.size,'rawAlphaBounds':raw.getbbox(),
        'cleanAlphaBounds':bbox,'trimSize':trim.size,'cleanup':'Alpha values 1..7 set to zero globally; no original silhouette mask.',
        'removedPixelCount':int(removed.sum()),'removedAlphaArea':removed_mass,'uniformNativeScale':scale,
        'sourceSamplesPerCssPixel':1/scale,'nativeReferenceBounds':[x0,y0,x1,y1],
        'exportCanvasCss':[64,48],'exportOriginInSceneCss':origin,'registrationOffsetCss':offset,
        'registeredContentBoundsCss':[origin[0]+offset[0],origin[1]+offset[1],origin[0]+offset[0]+trim.width*scale,origin[1]+offset[1]+trim.height*scale],
        'exportPixels':{'2x':[128,96],'4x':[256,192]},'upsampling':4*scale>1,'conditions':[]}
    for preset,density in [('4k',2),('1080p',1)]:
        original=Image.open(refs/f'{preset}-{heading}-original.png').convert('RGBA')
        background=Image.open(refs/f'{preset}-{heading}-shadowBackground.png').convert('RGBA')
        candidate=background.copy();candidate.alpha_composite(exports[density],(origin[0]*density,origin[1]*density))
        original.save(out/f'{name}-{preset}-original.png');candidate.save(out/f'{name}-{preset}-candidate.png')
        # Comparison boards preserve each panel's declared source density.
        pair=Image.new('RGB',(720*density,300*density),'#182027')
        draw=ImageDraw.Draw(pair)
        f=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',17*density)
        sf=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',12*density)
        draw.text((8*density,3*density),'A - Original Rhino',font=f,fill='white')
        draw.text((368*density,3*density),'B - Reference-guided artwork',font=f,fill='white')
        draw.text((368*density,23*density),'2D ART COMPOSITE — NOT IN-ENGINE HD',font=sf,fill='#f8d684')
        pair.paste(original.convert('RGB'),(0,40*density));pair.paste(candidate.convert('RGB'),(360*density,40*density))
        pair.save(out/f'{name}-{preset}-pair.png')
        record['conditions'].append({'preset':preset,'pixelsPerCss':density,'panelPixels':original.size,'panelCss':[360,260],
            'original':'Actual renderer capture','candidate':'Static 2D composite into same-tick shadow-only background; original ground shadow reused'})
    # Enlarge only the separate detail view, with the same magnification on both sides.
    detail=Image.new('RGBA',(512,192),(24,32,39,255))
    original_layer=Image.open(art/f'{name}-4k-tank-layer.png').crop((origin[0]*2,origin[1]*2,(origin[0]+64)*2,(origin[1]+48)*2))
    detail.alpha_composite(original_layer.resize((256,192),Image.Resampling.NEAREST),(0,0))
    detail.alpha_composite(exports[4],(256,0));detail.convert('RGB').save(out/f'{name}-detail-4css.png')
    # Exact source and registration metadata, rather than a silhouette-overlap visual PASS.
    result['poses'].append(record)
result['images']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.glob('*.png'))}
(out/'export.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'output':str(out),'poses':result['poses']}))
