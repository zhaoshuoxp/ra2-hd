"""Validate V17 feedback mechanisms, contacts, rigid motion and source preservation."""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation

from buildup import read, sha, write
from painted_rig import place

parser=argparse.ArgumentParser(description=__doc__)
for name in ['authoring','rigs','output']:parser.add_argument(name,type=Path)
args=parser.parse_args();authority=read(args.authoring);rigs=read(args.rigs);assert len(rigs)==10
rows=[]
for key,rig in rigs.items():
    record=next(r for r in authority['families'] if r['key']==key)
    assert record['identity']!='NAPOWR' and not rig['unselectedGeometryViolations']
    raw=read(record['nativeSource']);assert sha(record['nativeSource'])==rig['nativeSourceSha256']
    binding=record['newMember'];logical=read(Path('.local/hd-packs')/binding['packId']/binding['revision']/'manifest.json')['logical']
    assert len(rig['phases'])==record['frames'];assert rig['phases'][-1]==record['componentRig']['phases'][-1]
    moving={};stationary=[];contacts=[];checked=0
    for phase,nodes in enumerate(rig['phases'][:-1]):
        frame=logical['frames'][phase];x,y=frame['trimOrigin'];w,h=frame['trimSize']
        arrays={}
        for node in nodes:
            assert sha(node['image'])==node['sha256']
            pixels=place(Image.open(node['image']),node['box'],raw['canvas']);arrays[node['name']]=pixels
            outside=pixels[...,3].copy();outside[y*4:(y+h)*4,x*4:(x+w)*4]=0
            assert not outside.any(),(key,phase,node['name'],'Clipped component')
            info=node.get('rigidPart',{});reference=info.get('reference',{})
            for field in ['code','image','family']:
                if field in reference:assert sha(reference[field])==reference['sha256'],(key,node['name'],'Source changed')
            if 'translation' in info:moving.setdefault(node['name'],[]).append((phase,info['translation']))
            if node['name']=='actual-left-rising-pylon' and phase>=4:stationary.append((node['sha256'],node['box']))
            checked+=1
        identity=record['identity'];names=list(arrays)
        if identity=='NAHAND' and 4<=phase<21:
            for i in range(4):
                name=('rear' if i<2 else 'front')+'-opening-wall-'+str(i)
                n=next(n for n in nodes if n['name']==name)
                if phase<16:assert n['rigidPart']['angleDegrees']>=54
            if phase>=7:
                assert names.index('rear-opening-wall-0')<names.index('statue-from-open-well')<names.index('front-opening-wall-2')
            if phase>=16:
                plinth=next(n for n in nodes if n['name']=='empty-rising-statue-plinth')
                statue=next(n for n in nodes if n['name']=='statue-from-open-well')
                assert plinth['rigidPart']['translation']==statue['rigidPart']['translation']
                assert names.index('empty-rising-statue-plinth')<names.index('statue-from-open-well')
        if identity=='NARADR':
            dish=next(n for n in nodes if n['name']=='rotating-paraboloid-dish')
            assert 'azimuthDegrees' in dish['rigidPart'] and 'tiltDegrees' in dish['rigidPart']
            if phase>=13:
                chain=[arrays[n][...,3]>=128 for n in ['rotating-paraboloid-dish','complete-dish-bearing','telescoping-lattice-mast']]
                overlap=[int((binary_dilation(a,iterations=1)&b).sum()) for a,b in zip(chain,chain[1:])]
                assert all(n>0 for n in overlap),(key,phase,'Disconnected dish bearing',overlap)
                contacts.append({'phase':phase,'chainPixels':overlap})
            if 17<=phase<27:
                assert 'deploying-feed-and-rigid-struts' in arrays
                if phase<24:
                    intersection=(arrays['deploying-feed-and-rigid-struts'][...,3]>=128)&binary_dilation(arrays['rotating-paraboloid-dish'][...,3]>=128,iterations=2)
                    assert intersection.any(),(key,phase,'Detached feed')
        if identity=='NAREFN':
            pipe_names=[n for n in names if n.startswith('converging-external-pipe-')]
            assert len(pipe_names)==(7 if phase>=13 else 0)
            assert 'central-connecting-beam' not in arrays
    if stationary:assert all(item==stationary[0] for item in stationary),(key,'Moving completed left pylon')
    for name,versions in moving.items():
        if name.startswith('vertical-') or name=='statue-from-open-well':
            assert all(t[0]==0 for _,t in versions)
            assert all(a[1]>=b[1] for (_,a),(_,b) in zip(versions,versions[1:])),(key,name,'Reversed vertical motion')
        if name.startswith('converging-external-pipe-'):
            distances=[np.linalg.norm(t) for _,t in versions]
            assert all(a>=b-1e-8 for a,b in zip(distances,distances[1:])),(key,name,'Pipe moved away from target')
            assert distances[-1]==0
    rows.append({'key':key,'checkedNodes':checked,'phases':record['frames'],'contacts':contacts,'opaqueComponentsClipped':0})
write(args.output,{'status':'PASS_TEN_ORIGINAL_GUIDED_MECHANISMS_CONTACTS_AND_COMPLETE_PARTS','rigs':str(args.rigs),'rigsSha256':sha(args.rigs),'rows':rows,'boundary':'Technical validation only. All ten repaired records require user visual acceptance. Windows NOT_RUN.'})
print('Ten corrected component rigs pass bounds, vertical/radial motion, wall order and actual contacts')
