"""Measure the Original middle-ring travel independently from the dome travel."""
import argparse
import copy
import shutil
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image,ImageDraw

from buildup import read,write,sha,native_indices

final=SourceFileLoader('soviet_lab_retarget','scripts/art/finalize-soviet-original.py').load_module()
art=final.art


def collar(s,phase,drop,ring_drop):
    y0=57+drop
    y1=max(y0+1,min(78+ring_drop,s.rig.logical[phase]['trimOrigin'][1]+s.rig.logical[phase]['trimSize'][1]-s.origin[1]-8))
    x,y=s.origin;radius=[9,12,15][phase] if phase<3 else 16
    mask=Image.new('RGBA',(s.rig.canvas[0]*4,s.rig.canvas[1]*4));draw=ImageDraw.Draw(mask)
    draw.ellipse(((117-radius+x)*4,(y1-6+y)*4,(117+radius+x)*4,(y1+6+y)*4),fill=(160,150,122,255))
    draw.rectangle(((109+x)*4,(y0+y)*4,(125+x)*4,(y1+y)*4),fill=(75,75,68,255))
    rgba=np.asarray(mask).copy();yy,xx=np.indices(rgba.shape[:2],dtype=float);xx=xx/4-x;yy=yy/4-y
    texture=np.asarray(s.materials[2].convert('RGB').resize((256,256),Image.Resampling.LANCZOS))
    top=np.square((xx-117)/radius)+np.square((yy-y1)/6)<=1
    rgba[top,:3]=np.clip(texture[(yy[top]*17).astype(int)%256,(xx[top]*17).astype(int)%256]*[.94,.91,.76],0,255)
    texture=np.asarray(s.materials[3].convert('RGB').resize((256,256),Image.Resampling.LANCZOS))
    side=(xx>=109)&(xx<=125)&(yy>=y0)&(yy<=y1)
    shade=.58+.55*np.sin(np.clip((xx-109)/16,0,1)*np.pi)
    rgba[side,:3]=np.clip(texture[(yy[side]*13).astype(int)%256,(xx[side]*15).astype(int)%256]*shade[side,None],0,255)
    rgba[rgba[...,3]==0]=0
    return rgba


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('root',type=Path);p.add_argument('baseline',type=Path);p.add_argument('assets',type=Path)
    args=p.parse_args();r=args.root;out=r/'prototype-v9';out.mkdir(exist_ok=False)
    snapshot=out/'authoring-source.py';shutil.copy2(__file__,snapshot)
    art.SOURCE={'code':str(snapshot),'sha256':sha(snapshot),'image':str(r/'structural-surfaces-v1.png'),'imageSha256':sha(r/'structural-surfaces-v1.png'),'material':'ORIGINAL_RING_LANDMARKS_AND_RETAINED_HD_UV_NO_NATIVE_RGB'}
    rigs={};measurements=[]
    for rec in read(args.baseline)['families']:
        if rec['identity']!='NATECH' or rec['theater'] not in ['TEMPERATE','SNOW']:continue
        key=rec['key'];prior=read(r/'prototype-v8'/(key+'-rig.json'))
        ref=args.assets/('reference-'+rec['theater'].lower()+'-v1/report.json');s=art.Scene(rec,args.assets,ref,out/key,True)
        node=next(n for n in prior['phases'][22] if n['name']=='original-middle-circular-tier')
        medium=art.terminal.move(final.closure.canvas_node(node,s.rig.canvas),dy=-node['rigidPart']['translation'][1])
        def marker(phase):
            ix=native_indices(s.rig.raw,phase);yy,xx=np.indices(ix.shape,dtype=float);xx-=s.origin[0];yy-=s.origin[1]
            selected=(ix>=16)&(ix<32)&(xx>=93)&(xx<=100)&(yy<130)
            ys=np.where(selected)[0]
            return float(ys.min()-s.origin[1]) if len(ys) else None
        last=marker(23);assert last is not None
        for phase,old in enumerate(prior['phases']):
            nodes=copy.deepcopy(old)
            if phase<23:
                dome=next(n for n in nodes if n['name']=='original-golden-dome');drop=dome['rigidPart']['translation'][1]
                original=marker(phase);travel=max(0,original-last) if original is not None else max(0,drop-17)
                measurements.append({'key':key,'phase':phase,'nativeBandTop':original,'finalNativeBandTop':last,'middleTranslation':travel,'domeTranslation':drop})
                if phase>=1:
                    n=next(n for n in nodes if n['name']=='original-middle-circular-tier');at=nodes.index(n)
                    layer=art.terminal.move(medium,dy=travel)
                    # Only the portion above the outer tier's front socket is exposed.
                    outer=[0,28,30,31,30,28,24,19,13,7,2,0][min(phase,11)]
                    layer=art.terminal.masked(layer,s.yy<=111+outer)
                    addition=[];s.put(addition,layer,n['name'],phase,'MIDDLE_TIER_TRAVEL_MEASURED_INDEPENDENTLY_FROM_ORIGINAL_OWNER_RING',translation=[0,travel],originalBandTop=original,finalOriginalBandTop=last)
                    nodes[at:at+1]=addition
                if phase<19:
                    n=next(n for n in nodes if n['name']=='original-retracted-inner-collar');at=nodes.index(n)
                    addition=[];s.put(addition,collar(s,phase,drop,travel),n['name'],phase,
                        'SHORT_PAINTED_COLLAR_BETWEEN_ACTUAL_DOME_AND_INDEPENDENT_MIDDLE_RING',translation=[0,drop],middleTranslation=travel)
                    nodes[at:at+1]=addition
                else:
                    n=next(n for n in nodes if n['name']=='original-late-inner-core');at=nodes.index(n)
                    layer=art.terminal.masked(final.closure.canvas_node(n,s.rig.canvas),s.yy<=80+travel)
                    addition=[];s.put(addition,layer,n['name'],phase,
                        'INNER_CORE_EMERGES_BEHIND_MIDDLE_RING_FRONT_SOCKET',translation=n['rigidPart']['translation'])
                    nodes[at:at+1]=addition
            s.phases.append(nodes)
        s.violations.extend(prior['unselectedGeometryViolations']);rig=s.finish();rigs[key]=rig;write(out/(key+'-rig.json'),rig)
        print(key,'Original middle ring measured; violations',len(s.violations),flush=True)
    write(out/'rigs.json',rigs);write(out/'original-ring-landmarks.json',measurements)


if __name__=='__main__':main()
