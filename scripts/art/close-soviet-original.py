"""Close original-guided structural surfaces without rebuilding unaffected parts."""
import argparse
import copy
import shutil
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from buildup import read, sha, write
from painted_rig import over

art=SourceFileLoader('soviet_original_closure','scripts/art/author-soviet-original.py').load_module()


def canvas_node(node,canvas):
    result=np.zeros((canvas[1]*4,canvas[0]*4,4),np.uint8)
    x0,y0,x1,y1=[round(v*4) for v in node['box']]
    image=Image.open(node['image']).convert('RGBA')
    if image.size!=(x1-x0,y1-y0):image=image.resize((x1-x0,y1-y0),Image.Resampling.LANCZOS)
    result[y0:y1,x0:x1]=np.asarray(image)
    return result


def closed_louvers(s,phase,nodes):
    if not 2<=phase<=21:return
    painted=Image.new('RGBA',(s.rig.canvas[0]*4,s.rig.canvas[1]*4));draw=ImageDraw.Draw(painted)
    for i in range(3):
        n=next((x for x in nodes if x['name']=='original-back-column-'+str(i)),None)
        if n is None and phase<21:continue
        extension=n['rigidPart']['extension'] if n else 1
        pivot=np.array([162+i*27,139+i*14],float)
        points=np.array([(153,90),(173,96),(165,113),(151,107)],float)+[i*27,i*14]
        matrix=np.array([[1,0],[-.28*(1-extension),extension]])
        points=(points-pivot)@matrix.T+pivot
        draw.polygon([tuple((p+s.origin)*4) for p in points],fill=(222,5,4,255))
        draw.line([tuple((p+s.origin)*4) for p in [points[0],points[1],points[2]]],fill=(140,4,3,255),width=2)
    s.put(nodes,np.asarray(painted),'original-closed-louver-caps',phase,
          'SOLID_RED_VENT_CAPS_STAY_CLOSED_UNTIL_ORIGINAL_PHASE_22')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root',type=Path);parser.add_argument('baseline',type=Path);parser.add_argument('assets',type=Path)
    parser.add_argument('--output',default='prototype-v5')
    args=parser.parse_args();r=args.root;out=r/args.output;out.mkdir(exist_ok=False)
    snapshot=out/'authoring-source.py';shutil.copy2(__file__,snapshot)
    engine=out/'projection-source.py';shutil.copy2('scripts/art/author-soviet-original.py',engine)
    art.SOURCE={'code':str(snapshot),'sha256':sha(snapshot),'projectionCode':str(engine),'projectionCodeSha256':sha(engine),
        'image':str(r/'structural-surfaces-v1.png'),'imageSha256':sha(r/'structural-surfaces-v1.png'),
        'material':'BUILT_IN_HD_PLANAR_MATERIALS_AND_RETAINED_HD_NO_NATIVE_RGB'}
    rigs={}
    for rec in read(args.baseline)['families']:
        if rec['identity'] not in ['NAWEAP','NADEPT','NAYARD','NATECH'] or rec['theater'] not in ['TEMPERATE','SNOW']:continue
        key=rec['key'];version='prototype-v4' if rec['identity'] in ['NAWEAP','NADEPT'] else 'prototype-v3'
        prior=read(r/version/(key+'-rig.json'))
        reference=args.assets/('reference-'+rec['theater'].lower()+'-v1/report.json')
        s=art.Scene(rec,args.assets,reference,out/key,True)
        # Keep every existing violation until its exact node has been rebuilt.
        changed=set()
        source_core=None
        if rec['identity']=='NATECH':
            node=next(n for n in prior['phases'][20] if n['name']=='original-late-inner-core')
            source_core=art.terminal.move(canvas_node(node,s.rig.canvas),dy=-node['rigidPart']['translation'][1])
        for p,old in enumerate(prior['phases']):
            nodes=copy.deepcopy(old);s.active_phase=p
            if rec['identity']=='NAWEAP' and 6<=p<=20:
                node=next(n for n in nodes if n['name']=='original-rear-tower-hinge')
                at=nodes.index(node);q=np.asarray(node['rigidPart']['corners'],float)
                minimum=s.rig.logical[p]['trimOrigin'][1]-s.origin[1]+1
                q[:,1]=np.maximum(q[:,1],minimum)
                depth={6:5,7:10,8:18,9:25,10:32}.get(p,36)
                if p>=13:depth*=1-np.clip((p-13)/8,0,1)*.3
                layer=art.prism(s,np.zeros_like(s.full),None,q,0,np.array([0,depth]))
                replacement=[];s.put(replacement,layer,node['name'],p,
                    'COMPLETE_MASONRY_WELL_FACES_ON_ORIGINAL_HINGE_POSES',corners=q.tolist(),depth=depth)
                nodes[at:at+1]=replacement;changed.add((p,node['name']))
            if rec['identity']=='NAWEAP':
                if 17<=p<=22:
                    well=art.material_quad(s,3,[(128,111),(144,109),(207,148),(193,162)],(32,24),.35)
                    addition=[];s.put(addition,well,'original-closed-warehouse-interior',p,
                        'OPAQUE_HD_WELL_UNDER_ORIGINAL_ROOF_CLOSURE')
                    nodes[0:0]=addition
                closed_louvers(s,p,nodes)
            if rec['identity']=='NADEPT' and 3<=p<=15:
                node=next(n for n in nodes if n['name']=='original-service-brick-hinge')
                at=nodes.index(node);q=np.asarray(node['rigidPart']['corners'],float)
                depth={3:5,4:9,5:14,6:20,7:28,8:35}.get(p,37)
                layer=art.prism(s,np.zeros_like(s.full),None,q,0,np.array([0,depth]))
                addition=[];s.put(addition,layer,node['name'],p,
                    'COMPLETE_MASONRY_AND_RED_TOP_COVERS_ON_ORIGINAL_FOLDING_POSES',corners=q.tolist(),depth=depth)
                nodes[at:at+1]=addition;changed.add((p,node['name']))
            if rec['identity']=='NATECH':
                nodes=[n for n in nodes if n['name']!='original-recessed-dome-piston']
                if p<19:
                    dome=next(n for n in nodes if n['name']=='original-golden-dome')
                    drop=dome['rigidPart']['translation'][1]
                    collar=art.terminal.masked(source_core,s.yy<=61)
                    addition=[];s.put(addition,art.terminal.move(collar,dy=drop),'original-retracted-inner-collar',p,
                        'SHORT_FIXED_UV_COLLAR_CLOSES_DOME_TO_RING_BEFORE_STRUT_EXTENSION',translation=[0,drop])
                    at=next(i for i,n in enumerate(nodes) if n['name']=='original-golden-dome');nodes[at:at]=addition
                if 5<=p<=10:
                    drop=[45,45,44,42,40,37,32,26,19,12,5][p]
                    roof=art.material_quad(s,2,[(48,100),(117,67),(182,100),(117,132)],(48,48))
                    roof=s.rise(roof,drop,161)
                    addition=[];s.put(addition,roof,'original-closed-square-roof',p,
                        'COMPLETE_ROOF_PLATE_BEHIND_CENTRAL_RINGS_DURING_WALL_LIFT',translation=[0,drop])
                    nodes[0:0]=addition
            s.phases.append(nodes)
        retained=[x for x in prior['unselectedGeometryViolations'] if (x['phase'],x['name']) not in changed]
        s.violations.extend(retained)
        rig=s.finish();rig['architecturalMethod']='ORIGINAL_PHASE_REGISTERED_COMPLETE_PLANES_AND_COUPLED_MECHANISMS'
        rigs[key]=rig;write(out/(key+'-rig.json'),rig)
        print(key,'closed; violations',len(s.violations),flush=True)
    write(out/'rigs.json',rigs)


if __name__=='__main__':main()
