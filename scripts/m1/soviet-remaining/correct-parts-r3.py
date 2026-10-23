"""Recompose articulated layers using fixed sockets and native member envelopes."""
import json
import os
from pathlib import Path
import math
import shutil
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage
from production import Family, ROOT, D, area, cut

name = sys.argv[1]
f = Family(name, sys.argv[2] if len(sys.argv) > 2 else 'full-exports-r7')
previous = Path(os.environ['SOVIET_PREVIOUS_EXPORTS']) / name if os.environ.get('SOVIET_PREVIOUS_EXPORTS') else ROOT / 'full-exports-r6' / name
old = json.loads((previous / 'candidate-review.json').read_text())
for row in old['frames']:
    m, n = row['member'], row['nativeFrame']; native = f.sources[m]['frames'][n]
    im = f.blank(); im.alpha_composite(Image.open(previous / row['exports'][0]['base']).convert('RGBA'), (native['x'] * D, native['y'] * D))
    f.put(m, n, im, 'R2 state retained')
changed = set()
metrics = []

def put(m, n, im, operation, **details):
    changed.add((m, n)); f.put(m, n, im, operation, **details)

def mask(points):
    im = Image.new('L', f.hdsize); ImageDraw.Draw(im).polygon(points, fill=255); return im

def affine(im, matrix):
    inverse = np.linalg.inv(np.vstack([matrix, [0, 0, 1]]))
    return im.transform(im.size, Image.Transform.AFFINE, tuple(inverse[:2].ravel()), Image.Resampling.BICUBIC)

def rect(m, n):
    a = f.sources[m]['frames'][n]; out = np.zeros(f.hdsize[::-1], bool)
    out[a['y']*D:(a['y']+a['height'])*D, a['x']*D:(a['x']+a['width'])*D] = True
    return out

if name == 'NAPSIS':
    master = f.accepted()
    # Pixel coordinates are on the accepted 2x canvas, never per-pose bounds.
    # Each upright antenna moves with its arm while the entire central mast,
    # cap, bearings and socket are sampled from one stationary image.
    specs = [
        dict(pivot=(261, 68), end=(242, 60), tip=[(235, 18), (249, 18), (249, 64), (235, 66)], beam=[(248, 57), (257, 62), (257, 77), (248, 69)]),
        dict(pivot=(267, 118), end=(297, 132), tip=[(288, 69), (306, 69), (309, 140), (291, 144)], beam=[(270, 108), (290, 118), (294, 140), (270, 127)]),
        dict(pivot=(267, 148), end=(319, 169), tip=[(309, 81), (331, 81), (333, 179), (312, 181)], beam=[(270, 137), (312, 153), (318, 177), (270, 159)]),
    ]
    for spec in specs:
        for key in ['pivot', 'end', 'tip', 'beam']:
            value = spec[key]
            spec[key] = [tuple(v * D / 2 for v in point) for point in value] if key in ['tip', 'beam'] else tuple(v * D / 2 for v in value)
    fixed = master.copy(); pieces = []
    head = mask([(x * D / 2, y * D / 2) for x, y in [(262,7),(268,7),(268,33),(280,38),(285,51),(281,59),(272,65),(255,63),(246,57),(245,46),(253,35),(260,31)]])
    for s in specs:
        bm, tm = mask(s['beam']), mask(s['tip'])
        bm=Image.fromarray(np.minimum(np.array(bm),255-np.array(head)))
        tm=Image.fromarray(np.minimum(np.array(tm),255-np.array(head)))
        pieces.append((s, cut(master, bm), cut(master, tm)))
        keep = 255 - np.maximum(np.array(bm), np.array(tm))
        fixed = cut(fixed, Image.fromarray(keep.astype(np.uint8)))
    # Split ownership at the same socket plane for every frame and both layers.
    seam = 90 * D
    for damage in [0, 1]:
        lower = master.copy() if not damage else f.frames['ngpsis_a.shp', 40].copy()
        lower.paste((0, 0, 0, 0), (0, 0, lower.width, seam))
        for n in range(40):
            theta = 2 * math.pi * n / 39  # native loop visits 0..38; slot 39 closes it
            back, front = f.blank(), f.blank()
            for s, beam, tip in pieces:
                px, py = s['pivot']; ex, ey = s['end']; dx, dy = ex-px, ey-py
                vx = dx * math.cos(theta) - 2 * dy * math.sin(theta)
                vy = dx * .5 * math.sin(theta) + dy * math.cos(theta)
                sx = vx / dx
                if abs(sx) < .025: sx = math.copysign(.025, sx or 1)
                shear = (vy-dy)/dx
                arm = affine(beam, [[sx, 0, px*(1-sx)], [shear, 1, -shear*px]])
                upright = affine(tip, [[1, 0, vx-dx], [0, 1, vy-dy]])
                dest = front if vy >= 0 else back
                dest.alpha_composite(arm); dest.alpha_composite(upright)
            central = fixed.copy(); central.paste((0, 0, 0, 0), (0, seam, central.width, central.height))
            upper = back; upper.alpha_composite(central); upper.alpha_composite(front)
            if damage:
                upper = affine(upper, [[1, .27, -.27*seam], [0, 1, 0]])
            upper.paste((0, 0, 0, 0), (0, seam, upper.width, upper.height))
            image = lower.copy(); image.alpha_composite(upper)
            put('ngpsis_a.shp', n+damage*40, image, 'Continuous articulated antenna arms; invariant central mast and socket', phase=n, socket=[131.5,90], rigidMast=True)
        for n in ([0] if not damage else [1, 2]):
            put(f.body_member, n, lower, 'Fixed base below socket; central mast owned only by active layer')
    metrics.append(dict(fixedSocket=[131.5,90], nativeLoop=39, nearestKeySwitching=False))

elif name == 'TESLA':
    master = f.accepted(); a = np.asarray(master).astype(float)
    blue = (a[...,2]-a[...,0]>25) & (a[...,2]-a[...,1]>12) & (a[...,3]>0)
    blue[:26*D] = False
    # Retain the white core next to blue arc pixels, without sampling gray metal.
    near = ndimage.binary_dilation(blue, iterations=2)
    white = (a[...,:3].min(axis=2)>145) & (a[...,2]>a[...,0])
    electric = blue | (near & white)
    core = cut(master, Image.fromarray(np.uint8(electric)*255))
    original_alpha = np.asarray(core.getchannel('A')).astype(float)
    for m in ['ngtsla_a.shp', 'ngtsla_b.shp']:
        raw=f.sources[m]; pal=np.asarray(raw['palette'],float); energy=[]
        for native in raw['frames'][:20]:
            rgb=pal[np.array(native['pixels'],np.uint8)]; energy.append(float(np.maximum(0,rgb[:,2]-rgb[:,0]).sum()))
        for n in range(20):
            group=energy[n//10*10:n//10*10+10]
            gain=.8+.2*(energy[n]-min(group))/max(1,max(group)-min(group))
            wide=Image.fromarray(np.uint8(original_alpha)).filter(ImageFilter.MaxFilter(3))
            glow=wide.filter(ImageFilter.GaussianBlur(1.2*D))
            im=Image.new('RGBA',f.hdsize,(60,105,255,0));im.putalpha(glow.point(lambda v:round(v*.8*gain)))
            rim=Image.new('RGBA',f.hdsize,(105,160,255,0));rim.putalpha(wide.point(lambda v:round(v*.85*gain)));im.alpha_composite(rim)
            c=np.array(core);c[...,:3]=np.minimum(255,c[...,:3].astype(float)*.4+np.array([165,180,200])).astype(np.uint8);c[...,3]=np.uint8(original_alpha*gain)
            im.alpha_composite(Image.fromarray(c))
            put(m,n,im,'Bright white-blue arc core and blue halo; fixed accepted structure untouched',gain=gain)
    metrics.append(dict(corePixels=int(electric.sum()), structuralPixelsAdded=0))

elif name in ['NADEPT','NAYARD']:
    ship=name=='NAYARD'; normal=f.accepted(); reg=f.rep['registration']; b=reg['crop']; sc=reg['scale'];tx,ty=reg['translation']
    raw=f.load(ROOT/'art-v1'/name/'normal-raw.png')
    def xy(point):return ((point[0]-b[0])*sc*D+tx*D,(point[1]-b[1])*sc*D+ty*D)
    def poly(points):return mask([xy(p) for p in points])
    # Keep the tower and fixed architecture from the accepted master. Only the
    # upper crane and cable are removed, using its already authored clean plate.
    bp=([(240,10),(540,10),(1166,315),(1166,417),(540,281),(484,275),(238,340)] if ship else [(173,79),(414,79),(882,299),(882,365),(420,279),(316,291),(173,279)])
    hb=(1097,548,1198,730) if ship else (819,451,887,614)
    rb=(1143,390,1156,555) if ship else (850,355,860,458)
    bm=poly(bp);hm=poly([(hb[0],hb[1]),(hb[2],hb[1]),(hb[2],hb[3]),(hb[0],hb[3])])
    boom=cut(normal,bm);hook=cut(normal,hm)
    cablemask=poly([(rb[0]-4,rb[1]-8),(rb[2]+4,rb[1]-8),(rb[2]+4,rb[3]+8),(rb[0]-4,rb[3]+8)])
    remove=np.maximum.reduce([np.array(bm),np.array(hm),np.array(cablemask)])
    clean=f.load(ROOT/'art-v1'/name/'clean-raw.png').resize(raw.size,Image.Resampling.LANCZOS)
    clean_canvas=f.blank();clean_canvas.alpha_composite(area(clean.crop(b),(round((b[2]-b[0])*sc*D),round((b[3]-b[1])*sc*D))),(round(tx*D),round(ty*D)))
    static=normal.copy(); static=Image.composite(clean_canvas,static,Image.fromarray(remove).filter(ImageFilter.MaxFilter(5)))
    pa=np.array(xy((477,210) if ship else (373,224)))
    art_tip=np.array(xy((1150,374) if ship else (854,347)))
    ha=np.array(hook);reds=(ha[...,0]>ha[...,1]*1.5)&(ha[...,0]>ha[...,2]*1.5)&(ha[...,3]>0);hy,hx=np.where(reds);hook_center=np.array([hx.mean(),hy.mean()])
    primary='ngyard_d.shp' if ship else 'ngdept_c.shp'
    def landmarks(m,n):
        src=f.sources[m];frame=src['frames'][n];p=np.zeros(f.size[::-1],np.uint8)
        p[frame['y']:frame['y']+frame['height'],frame['x']:frame['x']+frame['width']]=np.array(frame['pixels'],np.uint8).reshape(frame['height'],frame['width'])
        labels,count=ndimage.label((p>=16)&(p<=31));candidates=[]
        for i in range(1,count+1):
            yy,xx=np.where(labels==i);a=len(xx);x,y=float(xx.mean()),float(yy.mean())
            ok=60<=a<=103 and x>215 and not(abs(x-257.4)<3 and abs(y-92.2)<3) if ship else 12<=a<=30 and x>103
            if ok:candidates.append((abs(a-(88 if ship else 22)),x,y))
        assert candidates,(m,n);_,x,y=min(candidates)
        if ship:
            rgb=np.array(src['palette'])[p];yy,xx=np.indices(p.shape)
            gold=(rgb[...,0]>=200)&(rgb[...,1]>=180)&(rgb[...,2]<160)&(xx>190)&(yy<105)
            gy,gx=np.where(gold); endx=float(gx.max()); endy=float(np.median(gy[gx>=endx-3]))
            tip=np.array([endx+3,endy+1])
        else:
            col=round(x)-3;ys=np.where(np.any(p[:80,max(0,col-1):col+2]>0,axis=1))[0]
            tip=np.array([x-1,float(ys[0])+3])
        return tip,np.array([x,y])
    tip0,hp0=landmarks(primary,0)
    # Body, apron and upper layer receive disjoint authored coverage. Native
    # silhouette masks are not suitable for clipping a different authored jib.
    for damage in [0,1]:
        base=static.copy()
        if damage:
            damaged=f.register(f.crop_path('damaged'),f.ref_bounds('damaged'))
            # R2 fixed damaged lower structure, preserving the intact crane.
            owned=rect(f.body_member,1) & (np.arange(f.hdsize[1])[:,None] >= (95 if ship else 80)*D);base=Image.composite(damaged,base,Image.fromarray(np.uint8(owned)*255))
        bodyrect=rect(f.body_member,damage); bib=next((m['member'] for m in f.check['members'] if 'bib' in m['roles']),None)
        bibrect=rect(bib,damage) if bib else np.zeros(bodyrect.shape,bool)
        for n in ([0] if not damage else [1,2]):
            put(f.body_member,n,cut(base,Image.fromarray(np.uint8(bodyrect)*255)),'Fixed authored architecture on original body plane')
        if bib:put(bib,damage,cut(base,Image.fromarray(np.uint8(bibrect & ~bodyrect)*255)),'Complete apron; no duplicate body coverage')
        upper_static=cut(base,Image.fromarray(np.uint8(~(bodyrect|bibrect))*255))
        members=['ngyard_a.shp','ngyard_d.shp','ngyard_s.shp'] if ship else ['ngdept_b.shp','ngdept_c.shp']
        for m in members:
            total=len(next(v['authorFrames'] for v in f.check['members'] if v['member']==m));half=total//2
            for n in range(damage*half,(damage+1)*half):
                tip,hp=landmarks(m,n)
                if m.endswith('_a.shp') or m.endswith('_b.shp'):tip=tip0.copy()
                # Map the authored pivot and tip directly to this native pose;
                # hook sway never changes the fixed support or idle jib.
                target=tip*D;v=art_tip-pa;delta=target-pa
                sx=delta[0]/v[0];shear=(delta[1]-v[1])/v[0]
                matrix=[[sx,0,pa[0]*(1-sx)],[shear,1,-shear*pa[0]]]
                im=upper_static.copy();im.alpha_composite(affine(boom,matrix))
                move=hp*D-hook_center;h=affine(hook,[[1,0,move[0]],[0,1,move[1]]])
                native=f.sources[m]['frames'][n];hbounds=h.getchannel('A').point(lambda a:255 if a>8 else 0).getbbox()
                limits=[native['x']*D,native['y']*D,(native['x']+native['width'])*D,(native['y']+native['height'])*D]
                correction=np.array([max(limits[0]-hbounds[0],min(0,limits[2]-hbounds[2])),max(limits[1]-hbounds[1],min(0,limits[3]-hbounds[3]))])
                assert abs(correction).max()<=6*D,(m,n,correction)
                h=affine(h,[[1,0,correction[0]],[0,1,correction[1]]]);hp=hp+correction/D
                cable_top=target; cable_bottom=hp*D-np.array([0,4*D])
                cable=f.blank();draw=ImageDraw.Draw(cable)
                draw.line([tuple(cable_top),tuple(cable_bottom)],fill=(30,30,28,255),width=round(1.5 * D))
                draw.line([(cable_top[0]-.25 * D,cable_top[1]),(cable_bottom[0]-.25 * D,cable_bottom[1])],fill=(153,149,125,255),width=round(D / 2))
                im.alpha_composite(cable);im.alpha_composite(h)
                clip=rect(m,n);hook_alpha=np.asarray(h.getchannel('A'))>32
                lost=int((hook_alpha & ~clip).sum());assert lost<=8,(name,m,n,'hook clipped',lost)
                put(m,n,im,'Fixed support; native articulated jib and independent complete hook/cable',hook=hp.tolist(),tip=tip.tolist(),hookClippedPixels=lost)
                metrics.append(dict(member=m,frame=n,hookClippedPixels=lost,tip=tip.tolist(),hook=hp.tolist()))
else:raise ValueError(name)

f.export()
report=json.loads((f.out/'candidate-review.json').read_text())
for i,row in enumerate(report['frames']):
    if (row['member'],row['nativeFrame']) in changed:continue
    prior=next(v for v in old['frames'] if v['member']==row['member'] and v['nativeFrame']==row['nativeFrame'])
    for e in prior['exports']:
        for role in ['base','data']:shutil.copyfile(previous/e[role],f.out/e[role])
    report['frames'][i]=prior
report['correctionScope']={'previous':str(previous),'changedRgbFrames':[list(k) for k in sorted(changed)],'constructionRgb':'BYTE_IDENTICAL_R2','metrics':metrics}
(f.out/'candidate-review.json').write_text(json.dumps(report,indent=2)+'\n')
