"""Compose a review-only articulated NACNST loop from fixed authored parts."""
import base64
import hashlib
import json
import math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path('.artifacts/m1-6b')
OUT = ROOT / 'crane-motion-v1'
FRAMES = OUT / 'frames'
FRAMES.mkdir(exist_ok=True)
assert not list(FRAMES.glob('*.png')), 'Preserve an already composed revision'
normal = Image.open(ROOT/'art-v1/NACNST/normal-raw.png').convert('RGBA')
clean = Image.open(OUT/'clean-plate-raw.png').convert('RGBA')
SIZE = normal.size
assert clean.size == SIZE

def mask(points):
    m = Image.new('L', SIZE)
    ImageDraw.Draw(m).polygon(points, fill=255)
    return m.filter(ImageFilter.GaussianBlur(.65))

def part(image, points):
    im = image.copy()
    im.putalpha(Image.fromarray(np.uint8(np.asarray(im.getchannel('A'), dtype=float)*np.asarray(mask(points))/255)))
    return im

def similarity(image, a, b, target_a, target_b):
    a, b, ta, tb = [np.asarray(p, dtype=float) for p in (a, b, target_a, target_b)]
    u, v = b-a, tb-ta
    den = float(u@u)
    c, s = float(u@v)/den, float(u[0]*v[1]-u[1]*v[0])/den
    matrix = np.array([[c,-s],[s,c]])
    inv = np.linalg.inv(matrix)
    offset = a-inv@ta
    return image.transform(SIZE, Image.Transform.AFFINE, (*inv[0],offset[0],*inv[1],offset[1]), Image.Resampling.BICUBIC)

# Only removed moving machinery/door pixels use the generated clean plate.
local = mask([(806,332),(1280,332),(1270,921),(913,951),(753,966),(407,1001),(398,728),(718,616),(776,582)])
plate = Image.composite(clean, normal, local)
plate.save(OUT/'stationary-plate.png')
boom = part(normal, [(958,374),(1000,389),(1189,500),(1231,533),(1238,599),(1215,614),(1174,599),(970,455),(935,422)])
forearm = part(normal, [(950,378),(984,392),(996,424),(973,461),(915,716),(907,752),(879,780),(835,777),(817,753),(838,717),(816,695),(820,679),(854,664),(902,430),(919,402)])
left_jaw = part(normal, [(830,726),(851,743),(854,769),(827,785),(815,800),(817,829),(799,877),(784,893),(770,889),(761,868),(760,805),(779,765),(794,740)])
right_jaw = part(normal, [(883,746),(911,760),(928,785),(920,830),(902,855),(875,879),(830,906),(813,911),(799,904),(823,867),(845,837),(856,815),(848,795),(857,773)])
fixture = part(normal, [(1168,502),(1225,519),(1229,609),(1232,647),(1186,672),(1106,682),(1096,672),(1126,621),(1123,548)])
hydraulic = part(normal, [(983,480),(1003,485),(1066,607),(1055,628),(1034,626),(979,507)])
closed = part(normal, [(466,779),(664,674),(708,861),(521,956)])
left_door = part(normal, [(466,779),(561,730),(606,908),(521,956)])
right_door = part(normal, [(561,730),(664,674),(708,861),(606,908)])
for name,im in [('boom',boom),('forearm',forearm),('left-jaw',left_jaw),('right-jaw',right_jaw),('hinge',fixture),('hydraulic',hydraulic),('left-door',left_door),('right-door',right_door)]:
    im.save(OUT/f'part-{name}.png')
# Manual landmarks inspected against all indexed source frames. Coordinates are
# in the native 286x224 canvas; only relative movement drives the authored rig.
poses = [
 (223,128,188,98,168,157),(218,129,184,94,163,151),(214,131,182,89,162,145),
 (210,132,181,85,162,141),(207,132,179,84,163,137),(206,132,178,84,165,131),
 (205,132,176,85,163,129),(207,132,170,91,157,131),(210,132,163,99,149,135),
 (212,133,159,101,147,137),(211,133,166,95,151,140),(213,132,180,86,167,149),
 (216,130,185,88,169,154),(220,129,188,94,170,158),(223,128,190,100,169,160),
 (229,127,188,110,169,168),(225,128,181,108,157,165),(224,129,185,99,162,160),
 (223,128,188,98,168,157),(223,128,188,98,168,157),(223,128,188,98,168,157)]
P,E,W = np.array([1188,577]),np.array([965,412]),np.array([850,751])
registration=json.loads((ROOT/'exports-v3/report.json').read_text())['families']['NACNST']
density=registration['sourceDensity']
# Perspective motion of existing rigid door planes, not a building registration warp.
def door(image, source, target):
    rows=[];rhs=[]
    for (x,y),(u,v) in zip(target,source):
        rows += [[x,y,1,0,0,0,-u*x,-u*y],[0,0,0,x,y,1,-v*x,-v*y]];rhs += [u,v]
    coeff=np.linalg.solve(np.array(rows),np.array(rhs))
    return image.transform(SIZE,Image.Transform.PERSPECTIVE,coeff,Image.Resampling.BICUBIC)

left0=np.array([(466,779),(561,730),(606,908),(521,956)],float)
right0=np.array([(561,730),(664,674),(708,861),(606,908)],float)
left1=np.array([(466,779),(365,837),(416,1017),(521,956)],float)
right1=np.array([(761,710),(664,674),(708,861),(812,895)],float)
# Workpiece is authored in revision 3 and moves only along the native output path.
work_source=Image.new('RGBA', SIZE)
work_source.paste(Image.open(ROOT/'crane-correction-v3/production-raw.png').convert('RGBA'), (0,0))
workpiece=part(work_source,[(590,824),(671,791),(744,831),(745,870),(674,902),(588,860)])
openings=[0,0,.08,.26,.58,.82,1,1,1,1,1,1,1,1,1,1,.92,.65,.3,0,0]
closes=[0,.10,.20,.24,.24,.24,.24,.24,.24,.24,.24,.24,.22,.12,0,.05,.22,.12,0,0,0]
report={'status':'HD_PRODUCTION_MOTION_REVIEW_ONLY','nativeMember':'ngcnst_b.shp','normalFrames':list(range(21)),
        'authoring':'Fixed master architecture; authored cutout parts with similarity transforms; rigid door-plane perspective; translated authored workpiece.',
        'limits':'2D articulated review rig approximates original 3D foreshortening. Not the complete damaged/buildup family or ordinary-game activation.',
        'registration':registration,'frames':[]}
for n,p in enumerate(poses):
    targets=[q+(np.array(p[j:j+2])-np.array(poses[0][j:j+2]))*density for q,j in [(P,0),(E,2),(W,4)]]
    tp,te,tw=targets
    im=plate.copy()
    t=openings[n]
    im.alpha_composite(door(right_door,right0,right0*(1-t)+right1*t))
    if 4<=n<=17:
        progress=min(1,max(0,(n-4)/8))
        shift=np.array([-47+progress*166,-30+progress*100])
        im.alpha_composite(similarity(workpiece,(0,0),(100,0),shift,shift+(100,0)))
    im.alpha_composite(door(left_door,left0,left0*(1-t)+left1*t))
    im.alpha_composite(similarity(boom,P,E,tp,te))
    im.alpha_composite(similarity(hydraulic,(1048,618),(990,494),tp+(-140,41),te+(25,82)))
    im.alpha_composite(similarity(fixture,P,P+(100,0),tp,tp+(100,0)))
    im.alpha_composite(similarity(forearm,E,W,te,tw))
    # Both jaws retain authored texture; they rotate independently about the wrist.
    for jaw,sign in [(left_jaw,-1),(right_jaw,1)]:
        angle=closes[n]*sign
        direction=np.array([math.sin(angle),math.cos(angle)])*100
        im.alpha_composite(similarity(jaw,W,W+(0,100),tw,tw+direction))
    im.save(FRAMES/f'{n:02}.png')
    report['frames'].append({'frame':n,'nativeLandmarks':p,'authoredLandmarks':[v.tolist()for v in targets],'doorOpen':t,'jawAngle':closes[n]})
# Build fixed-size native-sampling review loops and representative diagnostic payloads.
payload=[];states={};raws={m:json.loads((ROOT/'source-v1/NACNST'/f'{m}.json').read_text())for m in ['ngcnst.shp','ngcnst_b.shp','ngcnst_a.shp']}
raw=raws['ngcnst_b.shp'];frames=[]
bbox=registration['sourceCrop'];scale=registration['uniformScale'];tx,ty=registration['translation']
for n in range(21):
    im=Image.open(FRAMES/f'{n:02}.png');can=Image.new('RGBA',(286*4,224*4));piece=im.crop(bbox).resize((round((bbox[2]-bbox[0])*scale*4),round((bbox[3]-bbox[1])*scale*4)),Image.Resampling.LANCZOS);can.paste(piece,(round(tx*4),round(ty*4)));can.save(FRAMES/f'{n:02}-4x.png')
    panel=Image.new('RGBA',(340*4,260*4),'#34483d');panel.alpha_composite(can,((340-286)*2,(260-224)*2));frames.append(panel.convert('RGB').resize((340,260),Image.Resampling.LANCZOS))
    state=f'motion-{n:02}';layers=[['ngcnst.shp',0],['ngcnst_b.shp',n],['ngcnst_a.shp',0]];states[state]=layers
    for member,fnum in layers:
        rr=raws[member];f=rr['frames'][fnum];w,h=f['width'],f['height'];lw,lh=w+w%2,h+h%2
        base=Image.new('RGBA',(lw*4,lh*4))
        if member=='ngcnst_b.shp':base.paste(can.crop((f['x']*4,f['y']*4,(f['x']+w)*4,(f['y']+h)*4)),(0,0))
        a=np.array(base);red=(a[:,:,0].astype(float)>a[:,:,1]*1.5)&(a[:,:,0].astype(float)>a[:,:,2]*1.5)&(a[:,:,3]>0)
        data=np.zeros_like(a);data[:,:,3]=255;data[:,:,0][red]=255
        shades=np.abs(a[:,:,0,None].astype(float)-np.array([63,59,55,52,48,44,41,37,33,30,26,22,19,15,11,8])*4).argmin(axis=2);data[:,:,1][red]=shades[red]
        entry={'id':'NACNST','state':state,'density':4,'aggregateFrame':rr['aggregateOffset']+fnum,'width':base.width+4,'height':base.height+4}
        for role,b in [('base',base),('data',Image.fromarray(data))]:
            page=Image.new('RGBA',(entry['width'],entry['height']),(0,0,0,255 if role=='data'else 0));page.paste(b,(2,2));entry[role]=base64.b64encode(page.tobytes()).decode()
        payload.append(entry)
frames[0].save(OUT/'hd-native.webp',save_all=True,append_images=frames[1:],duration=50,loop=0,lossless=True)
frames[0].save(OUT/'hd-slow.webp',save_all=True,append_images=frames[1:],duration=200,loop=0,lossless=True)
(OUT/'runtime-payload.json').write_text(json.dumps(payload))
(OUT/'states.json').write_text(json.dumps({'NACNST':states},indent=2)+'\n')
(OUT/'composition.json').write_text(json.dumps(report,indent=2)+'\n')
print('Authored 21 review frames; native 20 fps and quarter-speed loops; no ordinary activation.')
