"""Prepare reversible representative art/motion review; never enables runtime overrides.

Native pixels are controls and motion measurements. HD RGB comes exclusively from
recorded imagegen masters and their deterministic crops/transforms/composites.
"""
import hashlib
import json
import math
import shutil
import sys
from pathlib import Path
import numpy as np
from scipy import ndimage
from PIL import Image, ImageDraw, ImageFilter

ROOT=Path('.artifacts/soviet-remaining')
OUT=ROOT/(sys.argv[1] if len(sys.argv)>1 else 'review-exports-v1')
OUT.mkdir(exist_ok=False)
INV=json.loads((ROOT/'source-v1/inventory.json').read_text())['families']
REF=json.loads((ROOT/'references-v1/states.json').read_text())
SELECT=json.loads((ROOT/'motion-guides-v1/selection.json').read_text())
D=2
REPORT={'status':'REPRESENTATIVE_REVIEW_ONLY','density':D,'runtimeActivation':False,'families':{},'masters':{}}
CORRECTIONS={'NANRCT','NARADR','NAPSIS','TESLA','NAIRON'} if '--proportion-r2' in sys.argv else set()
PREVIOUS=ROOT/'review-exports-v3'
ACCEPTED=json.loads((PREVIOUS/'report.json').read_text()) if CORRECTIONS else None

def load(path):
    p=Path(path);REPORT['masters'][str(p)]={'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
    return Image.open(p).convert('RGBA')

def bounds(im):return im.getchannel('A').point(lambda x:255 if x>32 else 0).getbbox()

def area(im,size):
    a=np.asarray(im).astype(np.float32)/255
    rgb=np.where(a[...,:3]<=.04045,a[...,:3]/12.92,((a[...,:3]+.055)/1.055)**2.4)
    prem=np.dstack([rgb*a[...,3:4],a[...,3]])
    p=np.stack([np.asarray(Image.fromarray(prem[...,k]).resize(size,Image.Resampling.BOX)) for k in range(4)],axis=2)
    lin=np.divide(p[...,:3],p[...,3:4],out=np.zeros_like(p[...,:3]),where=p[...,3:4]>0)
    p[...,:3]=np.where(lin<=.0031308,lin*12.92,1.055*np.maximum(lin,0)**(1/2.4)-.055)
    return Image.fromarray(np.uint8(np.clip(np.rint(p*255),0,255)))

def fit(im,box,size,by_width=False):
    b=bounds(im);w,h=b[2]-b[0],b[3]-b[1]
    sc=(box[2]-box[0])/w if by_width else min((box[2]-box[0])/w,(box[3]-box[1])/h)
    tx=box[0]+((box[2]-box[0])-w*sc)/2;ty=box[3]-h*sc
    out=Image.new('RGBA',(size[0]*D,size[1]*D));sample=area(im.crop(b),(max(1,round(w*sc*D)),max(1,round(h*sc*D))))
    out.alpha_composite(sample,(round(tx*D),round(ty*D)))
    return out,dict(crop=b,scale=sc,translation=[tx,ty],sourceDensity=1/sc)

def fit_native_envelope(im,box,size):
    # Register both authored axes to the native visible envelope, without
    # changing the logical canvas, bottom anchor or runtime geometry.
    b=bounds(im);sx=(box[2]-box[0])/(b[2]-b[0]);sy=(box[3]-box[1])/(b[3]-b[1])
    out=Image.new('RGBA',(size[0]*D,size[1]*D))
    out.alpha_composite(area(im.crop(b),((box[2]-box[0])*D,(box[3]-box[1])*D)),(box[0]*D,box[1]*D))
    return out,dict(crop=b,scale=sy,scaleXY=[sx,sy],translation=list(box[:2]),sourceDensity=min(1/sx,1/sy),method='Native visible envelope; fixed logical canvas and bottom anchor')

def mask(size,points):
    m=Image.new('L',size);ImageDraw.Draw(m).polygon(points,fill=255);return m

def cut(im,m):
    r=im.copy();r.putalpha(Image.fromarray(np.uint8(np.asarray(im.getchannel('A'),dtype=float)*np.asarray(m)/255)));return r

def transformed(im,matrix):
    inv=np.linalg.inv(np.vstack([matrix,[0,0,1]]));return im.transform(im.size,Image.Transform.AFFINE,tuple(inv[:2].ravel()),Image.Resampling.BICUBIC)

def sheet(im,cols,rows):
    result=[]
    for row in range(rows):
        for col in range(cols):
            b=(round(col*im.width/cols),round(row*im.height/rows),round((col+1)*im.width/cols),round((row+1)*im.height/rows))
            result.append(im.crop(b))
    return result

def reference(name,file):return Image.open(ROOT/'references-v1'/name/file).convert('RGBA')

def raw(name,member):return json.loads((ROOT/'source-v1'/name/(member+'.json')).read_text())

def indices_image(raw,n):
    f=raw['frames'][n];im=np.zeros((raw['canvas'][1],raw['canvas'][0]),dtype=np.uint8)
    im[f['y']:f['y']+f['height'],f['x']:f['x']+f['width']]=np.array(f['pixels'],dtype=np.uint8).reshape(f['height'],f['width'])
    return im

def components(raw,n):
    p=indices_image(raw,n);labels,count=ndimage.label((p>=16)&(p<=31));result=[]
    for i in range(1,count+1):
        y,x=np.where(labels==i)
        if len(x)>2:result.append({'n':len(x),'x':float(x.mean()),'y':float(y.mean())})
    return result

for name,family in INV.items():
    if CORRECTIONS and name not in CORRECTIONS:
        shutil.copytree(PREVIOUS/name,OUT/name)
        REPORT['families'][name]={**ACCEPTED['families'][name],'status':'REPRESENTATIVE_ACCEPTED','reusedFrom':str(PREVIOUS/name)}
        continue
    directory=OUT/name;directory.mkdir()
    size=REF[name]['size'];original=reference(name,'normal.png')
    normal_path=ROOT/'art-v1'/name/('normal-cutout-raw.png' if name in ['NANRCT','NAPSIS'] else 'normal-raw.png')
    if name in CORRECTIONS:normal_path=ROOT/'art-v2'/name/('normal-lower-r3-raw.png' if name=='NANRCT' else 'normal-raw.png')
    master=load(normal_path);native_bounds=bounds(original)
    if name in ['NALASR','NAFLAK']:
        # Turret parts are captured by the real renderer; the SHP body alone is not a complete reference.
        capture=load(ROOT/'turret-references-v3'/name/'complete-reference.png')
        # The crop was enlarged 4x from the physical frame. Keep the native-game logical extent explicit.
        target=(48,45) if name=='NALASR' else (62,78)
        size=[140,130];native_bounds=[(size[0]-target[0])/2,size[1]-target[1]-20,(size[0]+target[0])/2,size[1]-20]
        original=Image.new('RGBA',size);pic=capture.resize((target[0]+10,target[1]+10),Image.Resampling.BOX);original.alpha_composite(pic,(round(native_bounds[0])-5,round(native_bounds[1])-5))
    normal,reg=(fit_native_envelope if name in CORRECTIONS else fit)(master,native_bounds,size)
    normal.save(directory/'normal-hd.png');original.save(directory/'normal-original.png')
    result={'name':family['rules']['Name'],'size':size,'normal':'normal-hd.png','original':'normal-original.png','registration':reg,'sequences':[],
            'status':'REPRESENTATIVE_ART_AND_MOTION_PENDING_USER','completeFamily':'NOT_PRODUCED','checks':{'art':'PENDING_USER','runtime':'NOT_RUN'},'failures':[]}
    result['master']=str(normal_path)
    if name in ['NANRCT','NAPSIS'] and not CORRECTIONS:result['failures'].append({'file':'normal-raw.png','reason':'Unwanted diffuse background halo','correction':'normal-cutout-raw.png'})
    def save_seq(label,hd,orig,source_indices,rate,method,coverage='representative native sequence'):
        frames=[]
        for i,(a,b) in enumerate(zip(hd,orig)):
            a.save(directory/f'{label}-{i:03}-hd.png');b.save(directory/f'{label}-{i:03}-original.png')
            frames.append({'hd':f'{label}-{i:03}-hd.png','original':f'{label}-{i:03}-original.png','sourceFrame':source_indices[i]})
        result['sequences'].append({'label':label,'frames':frames,'fps':rate,'method':method,'coverage':coverage})
    def seq(name_seq):return next(s for s in REF[name]['sequences'] if s['name']==name_seq)
    def original_seq(s,ns):return [reference(name,s['frames'][s['indices'].index(n)]) for n in ns]
    if name in ['NATECH','NAMISL']:
        suffix='motion-r2-raw.png' if name=='NATECH' else 'motion-raw.png'
        parts=sheet(load(ROOT/'art-v1'/name/suffix),4,2);s=seq(SELECT[name]['sequence']);ns=SELECT[name]['samples'];controls=original_seq(s,ns)
        box=bounds(controls[-1]);hd=[]
        for p,control in zip(parts,controls):
            # Native buildup/readiness changes visible coverage. Register each authored pose
            # to that exact phase envelope, retaining the fixed source canvas and anchor.
            target=bounds(control);part=p.crop(bounds(p));frame=Image.new('RGBA',(size[0]*D,size[1]*D))
            frame.alpha_composite(area(part,((target[2]-target[0])*D,(target[3]-target[1])*D)),(target[0]*D,target[1]*D));hd.append(frame)
        save_seq('buildup' if name=='NATECH' else 'opening',hd,controls,ns,8/3.6 if name=='NATECH' else 8/(16/s['rate']),
                 'Eight authored construction/readiness key poses registered to each native phase envelope on the fixed source canvas; no generated interpolation.',
                 '8 representative key poses; intermediate native frames, damaged states and final runtime transfer pending')
        if name=='NATECH':result['failures'].append({'file':'motion-raw.png','reason':'Sheet margins too small','correction':suffix})
    elif name=='NAWALL':
        parts=sheet(load(ROOT/'art-v1'/name/'connections-raw.png'),4,4);hd=[];orig=[]
        for n,p in enumerate(parts):
            control=reference(name,f'connection-{n}.png');orig.append(control);hd.append(fit(p,bounds(control),size)[0])
        save_seq('connections',hd,orig,list(range(16)),2,'Sixteen authored shapes registered to native connectivity states; manual state stepping, not an idle animation.','16 normal connection states; damaged overlays pending')
    elif name in ['NALASR','NAFLAK']:
        suffix='motion-r2-raw.png' if name=='NAFLAK' else 'motion-raw.png'
        parts=sheet(load(ROOT/'art-v1'/name/suffix),4,2);hd=[];orig=[]
        # This review deliberately shows moving parts alone, so an unverified fixed-base composite cannot be mistaken for runtime integration.
        for i,p in enumerate(parts):
            source=load(ROOT/'turret-references-v3'/name/f'{i*45}.png');a=np.asarray(source).copy();on=np.max(np.abs(a[...,:3].astype(int)-[52,72,61]),axis=2)>15;a[...,3]=on.astype(np.uint8)*255;source=Image.fromarray(a)
            bb=bounds(source);ratio=2.4;targetbox=[size[0]/2-(bb[2]-bb[0])/ratio/2,90-(bb[3]-bb[1])/ratio,size[0]/2+(bb[2]-bb[0])/ratio/2,90]
            control=fit(source,targetbox,size)[0];orig.append(area(control,tuple(size)));hd.append(fit(p,targetbox,size)[0])
        save_seq('turret-headings',hd,orig,list(range(0,360,45)),4,'Eight original-renderer headings and authored upper rotating parts. Fixed foundations shown separately in normal view.','8 heading representatives; continuous native turret transform and firing/recoil integration pending')
        result['nativeScaleNote']='Native viewport crop sampled at measured 2.4 physical pixels per logical pixel; original screenshot in normal view retains terrain for identity verification.'
        if name=='NAFLAK':result['failures'].append({'file':'motion-raw.png','reason':'Outer cradle edges touched sheet border','correction':suffix})
    elif name=='NAPSIS':
        parts=sheet(load(ROOT/'art-v1'/name/'motion-raw.png'),4,2);s=seq('NAPSIS_A');ns=SELECT[name]['samples'];orig=original_seq(s,ns);hd=[]
        # Keep the master hut unchanged; only the upper antenna changes pose.
        # The registration maps the clean master's circular roof to approximately y=103.
        raw_cut=790;cut_y=round((reg['translation'][1]+(raw_cut-reg['crop'][1])*reg['scale'])*D)
        base=normal.copy();base.paste((0,0,0,0),(0,0,normal.width,cut_y))
        targetbox=[110,4,165,cut_y/D+2]
        for p in parts:
            frame=base.copy();antenna=fit(p,targetbox,size)[0];frame.alpha_composite(antenna);hd.append(frame)
        save_seq('antenna-scan',hd,orig,ns,8/(39/(s['rate'])),'Eight authored upper-antenna poses over one fixed hut; native sample order and full-loop duration retained.','8 representative key poses; 39-frame continuous export pending')
    elif name=='NARADR':
        s=seq('NARADR_A');ns=list(range(45));orig=original_seq(s,ns);hd=[];r=raw(name,'ngradr_a.shp');p0=indices_image(r,0);yy,xx=np.where(p0[:66]>0);first=[float(xx.mean()),float(xx.max()-xx.min()+1)]
        pivot=reg['translation'][0]+(650-reg['crop'][0])*reg.get('scaleXY',[reg['scale']])[0];boundary=round((reg['translation'][1]+(585-reg['crop'][1])*reg['scale'])*D)
        upper=normal.copy();upper.paste((0,0,0,0),(0,boundary,normal.width,normal.height));base=normal.copy();base.paste((0,0,0,0),(0,0,normal.width,boundary))
        for n in ns:
            p=indices_image(r,n);yy,xx=np.where(p[:66]>0);sx=(xx.max()-xx.min()+1)/first[1];dx=float(xx.mean())-first[0]
            m=np.array([[sx,0,pivot*D*(1-sx)+dx*D],[0,1,0]])
            frame=base.copy();frame.alpha_composite(transformed(upper,m));hd.append(frame)
        save_seq('dish-scan',hd,orig,ns,s['rate'],'Authored dish section follows native measured horizontal scan extent/centroid; fixed lower mast/base.','45-frame representative scan; full damaged/build family pending')
    elif name in ['NADEPT','NAYARD']:
        ship=name=='NAYARD';member='ngyard_d.shp' if ship else 'ngdept_c.shp';s=seq('NAYARD_D' if ship else 'NADEPT_C1');ns=list(range(41 if ship else 23));orig=original_seq(s,ns);r=raw(name,member)
        clean=load(ROOT/'art-v1'/name/'clean-raw.png');clean=clean.resize(master.size,Image.Resampling.LANCZOS)
        # Clean plates share canvas and fixed architecture; retain the original registration rather than fitting their shorter new bounds.
        b=reg['crop'];sc=reg['scale'];tx,ty=reg['translation'];base=Image.new('RGBA',normal.size);base.alpha_composite(area(clean.crop(b),(round((b[2]-b[0])*sc*D),round((b[3]-b[1])*sc*D))),(round(tx*D),round(ty*D)))
        boom_points=([(240,10),(540,10),(1158,315),(1158,386),(542,229),(484,275),(238,340)] if ship else [(173,79),(414,79),(880,299),(880,351),(423,275),(316,291),(173,279)])
        hook_box=(1097,548,1198,710) if ship else (819,451,887,594)
        rope_box=(1143,390,1156,555) if ship else (850,355,860,458)
        def raw_mask(points):return mask(normal.size,[((x-b[0])*sc*D+tx*D,(y-b[1])*sc*D+ty*D) for x,y in points])
        boom=cut(normal,raw_mask(boom_points));hook=cut(normal,raw_mask([(hook_box[0],hook_box[1]),(hook_box[2],hook_box[1]),(hook_box[2],hook_box[3]),(hook_box[0],hook_box[3])]))
        pivot_native=(170,47) if ship else (67,54)
        pivot_art=(477,210) if ship else (373,224)
        pa=np.array([(pivot_art[0]-b[0])*sc+tx,(pivot_art[1]-b[1])*sc+ty])
        measurements=[]
        for n in ns:
            candidates=[c for c in components(r,n) if (60<=c['n']<=103 and c['x']>215 and not(abs(c['x']-257.4)<3 and abs(c['y']-92.2)<3))] if ship else [c for c in components(r,n) if 12<=c['n']<=30 and c['x']>103 and c['y']<101]
            if not candidates:raise ValueError((name,n,'native hook unresolved'))
            c=min(candidates,key=lambda c:abs(c['n']-(88 if ship else 22)))
            p=indices_image(r,n);x=round(c['x']);ys=np.where(np.any(p[:,max(0,x-1):x+2]>0,axis=1))[0];tip=[c['x'],float(ys[0])+2]
            measurements.append({'hook':[c['x'],c['y']],'tip':tip})
        first=measurements[0];tip0=np.array(first['tip']);hook0=np.array(first['hook']);pn=np.array(pivot_native);hd=[]
        hook_art=np.array([((hook_box[0]+hook_box[2])/2-b[0])*sc+tx,(hook_box[1]-b[1])*sc+ty])
        rope_texture=master.crop(rope_box)
        for n,measure in zip(ns,measurements):
            tip=np.array(measure['tip']);hp=np.array(measure['hook']);sx=(tip[0]-pn[0])/(tip0[0]-pn[0]);shear=(tip[1]-tip0[1])/(tip0[0]-pn[0]);matrix=np.array([[sx,0,pa[0]*D*(1-sx)],[shear,1,-shear*pa[0]*D]])
            frame=base.copy();frame.alpha_composite(transformed(boom,matrix));dx,dy=(hp-hook0)*D
            frame.alpha_composite(transformed(hook,np.array([[1,0,dx],[0,1,dy]])))
            raw_tip=(1150,374) if ship else (854,347);art_tip=np.array([(raw_tip[0]-b[0])*sc+tx,(raw_tip[1]-b[1])*sc+ty]);tip_pos=(matrix[:,:2]@(art_tip*D)+matrix[:,2]);bottom=(hook_art+(hp-hook0))*D
            height=max(1,round(bottom[1]-tip_pos[1]));rope=area(rope_texture,(max(1,round(rope_texture.width*sc*D)),height));frame.alpha_composite(rope,(round(bottom[0]-rope.width/2),round(tip_pos[1])));hd.append(frame)
        result['motionMeasurements']=measurements
        save_seq('production-crane' if ship else 'repair-crane',hd,orig,ns,s['rate'],'Stationary authored clean plate, separately transformed jib, vertically sampled authored cable and translated hook driven by measured native landmarks.','41 normal production frames' if ship else '23-frame repair transition representative; maintenance loop and return pending')
    else:
        seqname={'NANRCT':'NANRCT_A','NACLON':'NACLON_A','TESLA':'NATSLA_A','NAIRON':'NAIRON_A'}[name]
        s=seq(seqname);ns=list(range(s['props']['loopStart'],s['props']['loopEnd']+1));orig=original_seq(s,ns);r=raw(name,next(a['member'] for a in family['animations'] if a['name']==seqname));pal=np.array(r['palette'],dtype=float)
        maps=np.stack([pal[indices_image(r,n)] for n in ns]);variation=maps.max(axis=0)-maps.min(axis=0);moving=np.max(variation,axis=2)>25
        levels=[float(im[moving].mean()) if moving.any() else 1 for im in maps];lo,hi=min(levels),max(levels)
        a=np.asarray(normal).copy();rgb=a[...,:3].astype(float);rr,gg,bb=[rgb[...,i] for i in range(3)]
        hot=((bb>rr*1.1)&(bb>gg*1.02)) if name=='TESLA' else ((gg>rr*1.04)&(gg>bb*1.12)) if name=='NANRCT' else ((rr>bb*1.35)&(gg>bb*1.2)&(gg>65))
        if name=='NACLON':
            yy,xx=np.mgrid[:normal.height,:normal.width];hot &= (xx>95*D)&(xx<138*D)&(yy>40*D)&(yy<105*D)
        hd=[]
        for level in levels:
            gain=.72+.28*(level-lo)/(hi-lo) if hi>lo else 1
            frame=a.copy();frame[...,:3]=np.uint8(np.clip(rgb*np.where(hot[...,None],gain,1),0,255));hd.append(Image.fromarray(frame))
        save_seq('local-activity',hd,orig,ns,s['rate'],'Authored local emissive/glass pixels follow measured native phase luminance; architecture and alpha stay fixed.','Representative normal activity loop; damaged/build/special states pending')
    REPORT['families'][name]=result
(OUT/'report.json').write_text(json.dumps(REPORT,indent=2)+'\n')
print('Prepared',len(REPORT['families']),'families,',sum(len(s['frames']) for f in REPORT['families'].values() for s in f['sequences']),'representative motion/state frames')
