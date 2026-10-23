"""Verify radial travel, invariant rigid geometry and unaffected artwork bytes."""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image

from buildup import read, sha, write


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ['authoring','rigs','output']:parser.add_argument(name,type=Path)
    args=parser.parse_args();before=read(args.authoring);rigs=read(args.rigs);rows=[]
    for key,rig in rigs.items():
        original=next(r for r in before['families'] if r['key']==key)
        old=original['componentRig']['phases'];current=rig['phases']
        for phase,nodes in enumerate(current):
            if isinstance(nodes,dict):continue
            for node in nodes:
                assert sha(node['image'])==node['sha256']
                pixels=np.array(Image.open(node['image']).convert('RGBA'))
                assert (pixels[...,3]>=128).any()
                assert node['box'][2]>node['box'][0] and node['box'][3]>node['box'][1]
        row={'key':key,'unchangedTerminalPhases':[23,24]}
        assert all(isinstance(current[p],dict) and current[p]['retainPredecessor'] for p in [23,24])
        for p in range(25):
            if isinstance(current[p],dict):continue
            for name in ['fixed-empty-platform','fixed-service-platform','rising-fixed-radius-globe',
                'telescoping-mast-and-fixed-feet','finished-perimeter-and-posts']:
                a=[n for n in old[p] if n['name']==name]
                b=[n for n in current[p] if n['name']==name]
                assert a==b,(key,p,name,'Unrelated component changed')
        if key.startswith('gaweat'):
            starts=[9,11,13,14];ends=[12,14,18,17];paths=[]
            for index,(start,end) in enumerate(zip(starts,ends)):
                def nodes_at(p):
                    return old[p] if isinstance(current[p],dict) else current[p]
                nodes=[next(n for n in nodes_at(p) if n['name']==f'satellite-{index}') for p in range(start,end+1)]
                movement=[n['rigidPart'].get('nativeTranslation',[0,0]) for n in nodes]
                assert movement[-1]==[0,0] and abs(movement[0][0])>=19
                assert all(n['rigidPart'].get('fixedScale',1)==1 for n in nodes)
                assert all(abs(movement[p+1][0])<=abs(movement[p][0]) for p in range(len(movement)-1))
                # Actual saved geometry must move with the recorded trajectory.
                assert abs(nodes[0]['box'][0]-nodes[-1]['box'][0])>=18
                for p in range(start,end+1):
                    if p>=18:continue
                    satellite_index=next(i for i,n in enumerate(current[p]) if n['name']==f'satellite-{index}')
                    mast_index=next(i for i,n in enumerate(current[p]) if n['name']=='telescoping-mast-and-fixed-feet')
                    assert satellite_index<mast_index,'Emergence lacks central occlusion'
                paths.append({'satellite':index,'phases':[start,end],'translations':movement})
            row['radialPaths']=paths
        else:
            actual=[]
            for p in range(7,22):
                node=next(n for n in current[p] if n['name']=='ground-emerging-hinged-support')
                part=node['rigidPart'];v=np.array(part['worldVertices'])
                # Directly compare transformed corners, rather than trusting
                # the declared lengths or a matching terminal screenshot.
                assert np.allclose(np.linalg.norm(v[4:8:2]-v[0:4:2],axis=1),56)
                assert np.allclose(np.linalg.norm(v[[2,6]]-v[[0,4]],axis=1),20)
                assert part['worldHinge']==[0,0,17.] and part['opaquePixelsClipped']==0
                actual.append({'phase':p,'angleDegrees':part['angleDegrees'],'box':node['box']})
            assert [a['angleDegrees'] for a in actual]==sorted(a['angleDegrees'] for a in actual)
            upright=[next(n for n in current[p] if n['name']=='hinged-orange-linkage') for p in range(12,16)]
            assert len({n['sha256'] for n in upright})==1 and len({tuple(n['box']) for n in upright})==1
            tables=[next(n for n in current[p] if n['name']=='fixed-hinge-turntable') for p in range(7,22)]
            assert len({n['sha256'] for n in tables})==1 and len({tuple(n['box']) for n in tables})==1
            row.update(rigidLength=56,rigidWidth=20,worldHinge=[0,0,17.],supportPoses=actual,
                fixedUprightPhases=[12,15],opaquePixelsClipped=0)
        rows.append(row)
    assert len(rows)==4
    write(args.output,{'status':'PASS_RADIAL_PATHS_RIGID_AXES_AND_UNAFFECTED_COMPONENTS',
        'rows':rows,'boundary':'Pixel/geometry checks do not grant human visual acceptance. Windows NOT_RUN.'})
    print('Four radial / rigid-axis mechanism checks pass')


if __name__=='__main__':main()
