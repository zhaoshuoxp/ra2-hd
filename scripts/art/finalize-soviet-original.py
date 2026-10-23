"""Seal closed vent materials and complete theater-correct roof planes."""
import argparse
import copy
import shutil
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt
from scipy.spatial import ConvexHull

from buildup import read,sha,write

closure=SourceFileLoader('soviet_final_closure','scripts/art/close-soviet-original.py').load_module()
art=closure.art


def close_vent(layer,region):
    out=layer.copy();rgb=out[...,:3].astype(float)
    red=(rgb[...,0]>100)&(rgb[...,0]>rgb[...,1]*2)&(rgb[...,0]>rgb[...,2]*2)&(out[...,3]>128)&region
    yy,xx=np.where(red)
    if len(xx)<8:return out
    hull=ConvexHull(np.column_stack([xx,yy]));points=np.column_stack([xx,yy])[hull.vertices]
    cover=Image.new('1',(out.shape[1],out.shape[0]));ImageDraw.Draw(cover).polygon([tuple(p) for p in points],fill=1)
    dark=np.max(rgb,axis=-1)<100
    mask=np.asarray(cover)&region&~red
    _,indices=distance_transform_edt(~red,return_indices=True)
    color=out[indices[0],indices[1],:3].astype(float)
    out[mask,:3]=np.clip(color[mask]*.9,0,255).astype('uint8')
    out[mask,3]=255
    assert not np.any((out[...,3]>layer[...,3])&~np.asarray(cover))
    return out


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('root',type=Path);p.add_argument('baseline',type=Path);p.add_argument('assets',type=Path)
    p.add_argument('--input',default='prototype-v5');p.add_argument('--output',default='prototype-v6')
    p.add_argument('--collar-only',action='store_true');p.add_argument('--vent-only',action='store_true')
    args=p.parse_args();r=args.root;out=r/args.output;out.mkdir(exist_ok=False)
    snapshots=[]
    for file,name in [('scripts/art/finalize-soviet-original.py','authoring-source.py'),
        ('scripts/art/author-soviet-original.py','projection-source.py')]:
        target=out/name;shutil.copy2(file,target);snapshots.append({'code':str(target),'sha256':sha(target)})
    art.SOURCE={**snapshots[0],'projectionCode':snapshots[1]['code'],'projectionCodeSha256':snapshots[1]['sha256'],
        'image':str(r/'structural-surfaces-v1.png'),'imageSha256':sha(r/'structural-surfaces-v1.png'),
        'material':'BUILT_IN_HD_MATERIALS_AND_RETAINED_HD_NO_NATIVE_RGB'}
    rigs={}
    for rec in read(args.baseline)['families']:
        if rec['identity'] not in ['NAWEAP','NADEPT','NAYARD','NATECH'] or rec['theater'] not in ['TEMPERATE','SNOW']:continue
        if args.collar_only and rec['identity']!='NATECH':continue
        if args.vent_only and rec['identity']!='NAWEAP':continue
        key=rec['key'];prior=read(r/args.input/(key+'-rig.json'))
        reference=args.assets/('reference-'+rec['theater'].lower()+'-v1/report.json')
        s=art.Scene(rec,args.assets,reference,out/key,True)
        for phase,old in enumerate(prior['phases']):
            nodes=copy.deepcopy(old)
            if rec['identity']=='NAWEAP' and phase<22:
                nodes=[n for n in nodes if n['name']!='original-closed-louver-caps']
                for i,n in list(enumerate(nodes)):
                    if n['name'].startswith('original-back-column-'):
                        layer=closure.canvas_node(n,s.rig.canvas)
                        ys,xs=np.where(layer[...,3]>128)
                        cutoff=ys.min()+(ys.max()-ys.min())*.42
                        layer=close_vent(layer,np.indices(layer.shape[:2])[0]<=cutoff)
                        addition=[];details={k:v for k,v in n['rigidPart'].items() if k not in ['method','reference','originalPhase','originalGeometrySha256','componentCamera','opaquePixelsClipped']}
                        s.put(addition,layer,n['name'],phase,'CLOSED_RED_VENT_SURFACE_ON_ORIGINAL_COLUMN_WITH_UNCHANGED_GEOMETRY',**details)
                        nodes[i:i+1]=addition
                    elif n['name']=='installed-factory-shell' and phase==21:
                        layer=closure.canvas_node(n,s.rig.canvas)
                        for j in range(3):
                            region=s.region(np.asarray([(151,88),(176,96),(169,117),(148,108)])+[j*27,j*14])
                            layer=close_vent(layer,region)
                        addition=[];s.put(addition,layer,n['name'],phase,'COMPLETE_INSTALLED_SHELL_WITH_VENTS_CLOSED_ON_ORIGINAL_PHASE_21')
                        nodes[i:i+1]=addition
            if rec['identity']=='NADEPT' and 3<=phase<=15:
                n=next(n for n in nodes if n['name']=='original-service-brick-hinge');at=nodes.index(n)
                q=np.asarray(n['rigidPart']['corners']);depth=n['rigidPart']['depth'];s.active_phase=phase
                layer=art.prism(s,np.zeros_like(s.full),None,q,0,np.array([0,depth]))
                addition=[];s.put(addition,layer,n['name'],phase,'ORIGINAL_OPEN_U_PEDESTAL_WITH_UNOBSTRUCTED_MAST_SIDE',corners=q.tolist(),depth=depth)
                nodes[at:at+1]=addition
            if rec['identity']=='NATECH' and phase<19:
                n=next(n for n in nodes if n['name']=='original-retracted-inner-collar');at=nodes.index(n);drop=n['rigidPart']['translation'][1]
                image=Image.new('RGBA',(s.rig.canvas[0]*4,s.rig.canvas[1]*4));draw=ImageDraw.Draw(image);x,y=s.origin
                bottom=min(71+drop,s.rig.logical[phase]['trimOrigin'][1]+s.rig.logical[phase]['trimSize'][1]-y-8)
                radius=[9,12,15][phase] if phase<3 else 16
                draw.ellipse(((117-radius+x)*4,(bottom-6+y)*4,(117+radius+x)*4,(bottom+6+y)*4),fill=(162,151,117,255),outline=(213,205,173,255),width=3)
                for u in range(64):
                    t=u/63;color=int(62+40*np.sin(t*np.pi))
                    draw.line(((109+x+t*16)*4,(57+drop+y)*4,(109+x+t*16)*4,(bottom+y)*4),fill=(color,color,color-7,255),width=2)
                draw.ellipse(((109+x)*4,(55+drop+y)*4,(125+x)*4,(60+drop+y)*4),fill=(129,123,104,255),outline=(61,60,54,255),width=2)
                rgba=np.asarray(image).copy()
                if args.collar_only:
                    yy,xx=np.indices(rgba.shape[:2],dtype=float);xx=xx/4-x;yy=yy/4-y
                    tile=np.asarray(s.materials[3].convert('RGB').resize((256,256),Image.Resampling.LANCZOS))
                    shade=.58+.55*np.sin(np.clip((xx-109)/16,0,1)*np.pi)
                    rgb=tile[(yy*13).astype(int)%256,(xx*15).astype(int)%256].astype(float)*shade[...,None]
                    shaft=(xx>=109)&(xx<=125)&(yy>=57+drop)&(yy<=bottom)
                    rgba[shaft,:3]=np.clip(rgb[shaft],0,255).astype('uint8')
                    tile=np.asarray(s.materials[2].convert('RGB').resize((256,256),Image.Resampling.LANCZOS))
                    top=(np.square((xx-117)/radius)+np.square((yy-bottom)/6)<=1)&~shaft
                    grain=tile[(yy*17).astype(int)%256,(xx*17).astype(int)%256].astype(float)*[.94,.91,.76]
                    rgba[top,:3]=np.clip(grain[top],0,255).astype('uint8')
                addition=[];s.put(addition,rgba,n['name'],phase,'PAINTED_METALLIC_DOME_COLLAR_AND_COVER_BEFORE_ORIGINAL_STRUT_EXTENSION',translation=[0,drop])
                nodes[at:at+1]=addition
            if rec['identity']=='NATECH' and 5<=phase<=10:
                n=next(n for n in nodes if n['name']=='original-closed-square-roof');at=nodes.index(n);drop=n['rigidPart']['translation'][1]
                roof=art.material_quad(s,2,[(48,100),(117,67),(182,100),(117,132)],(48,48))
                addition=[];s.put(addition,s.rise(roof,drop,161),n['name'],phase,
                    'COMPLETE_THEATER_REGISTERED_ROOF_PLANE_BEHIND_CENTRAL_RINGS',translation=[0,drop])
                nodes[at:at+1]=addition
            s.phases.append(nodes)
        s.violations.extend(prior['unselectedGeometryViolations'])
        rig=s.finish();rig['architecturalMethod']='ORIGINAL_PHASE_REGISTERED_COMPLETE_PLANES_AND_COUPLED_MECHANISMS'
        rigs[key]=rig;write(out/(key+'-rig.json'),rig)
        print(key,'sealed; violations',len(s.violations),flush=True)
    assert len(rigs)==(2 if args.collar_only or args.vent_only else 8)
    write(out/'rigs.json',rigs)


if __name__=='__main__':main()
