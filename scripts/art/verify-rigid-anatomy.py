"""Check packed part connectivity, complete platform coverage and retained ground."""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import label

from buildup import read, sha, unpack, write
from painted_rig import place


def ground(nodes):
    return [n for n in nodes if n['name'] in {'foundation','unfinished-foundation',
            'floor-stripes','finishing-ground-paint','finishing-floor-switch'} or n['name'].startswith('pad-')]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('authoring',type=Path)
    parser.add_argument('baseline',type=Path)
    parser.add_argument('output',type=Path)
    args=parser.parse_args()
    current,before=read(args.authoring),read(args.baseline)
    changed=set(current['rigidAnatomyRepair']['correctedKeys'])
    checks=[]
    for record in current['families']:
        key=record['key']
        old=next(f for f in before['families'] if f['key']==key)
        if key not in changed:
            assert record==old,('Unrelated selection changed',key)
            continue
        rig=record['componentRig']
        root=Path('.local/hd-packs')/record['newMember']['packId']/record['newMember']['revision']
        manifest=read(root/'manifest.json')
        assert sha(root/'manifest.json')==record['newMember']['sha256']
        for phase,nodes in enumerate(rig['phases']):
            if isinstance(nodes,dict):
                continue
            if not key.startswith('gtgcan-'):
                assert ground(nodes)==ground(old['componentRig']['phases'][phase]),(key,phase,'Ground changed')
            for node in nodes:
                part=node.get('rigidPart',{})
                if 'transform' in part:
                    matrix=np.asarray(part['transform'])[:,:2]
                    values=np.linalg.svd(matrix,compute_uv=False)
                    assert abs(values[0]/values[1]-1)<1e-10,(key,phase,node['name'],'Part proportions distorted')
        # A real disconnected crown, head or drum creates a separate substantial
        # opaque component in packed alpha. This caught the early crown gap.
        phases={'atesla':[5,6,7],'garobo':[9,14,19]}.get(key.split('-')[0],[])
        for phase in phases:
            for density in (2,4):
                alpha=unpack(root,manifest,density,phase)[...,3]
                ids,count=label(alpha>=128,structure=np.ones((3,3)))
                areas=np.bincount(ids.ravel())[1:]/density**2
                substantial=sorted(float(a) for a in areas if a>=8)
                assert len(substantial)==1,(key,phase,density,'Disconnected substantial part',substantial)
                checks.append({'key':key,'phase':phase,'density':density,
                               'check':'PACKED_COMPLETE_ASSEMBLY_CONNECTIVITY','components':len(substantial)})
        if key.startswith('gtgcan-'):
            new_floor=rig['foundationSource']
            old_floor=old['componentRig']['foundationSource']
            canvas=manifest['logical']['canvas']
            new_alpha=place(Image.open(new_floor['image']),new_floor['box'],canvas)[...,3]
            old_alpha=place(Image.open(old_floor['image']),old_floor['box'],canvas)[...,3]
            region=np.zeros(new_alpha.shape,bool)
            region[120*4:138*4,80*4:154*4]=True
            restored=((new_alpha>=128)&(old_alpha<128)&region).sum()/16
            assert restored>=100,(key,'Incomplete bearing platform',restored)
            clear,count=label(new_alpha<128)
            from scipy.ndimage import find_objects
            holes=[]
            for index,region in enumerate(find_objects(clear),1):
                area=(clear[region]==index).sum()/16
                if (region[0].start and region[1].start and region[0].stop<clear.shape[0]
                        and region[1].stop<clear.shape[1] and area>=1):
                    holes.append(float(area))
            assert len(holes)==3,(key,'Drilled stabilizer feet closed',holes)
            checks.append({'key':key,'check':'RESTORED_FRONT_BEARING_AND_STABILIZER_COVERAGE',
                           'restoredNativePixelArea':float(restored),'openDrilledFeet':len(holes),
                           'drilledFootNativeAreas':holes})
    write(args.output,{'status':'PASS_PACKED_CONNECTIONS_RIGID_PROPORTIONS_AND_SCOPED_GROUND',
          'authoritySha256':sha(args.authoring),'baselineSha256':sha(args.baseline),
          'changedSequences':len(changed),'unchangedRecords':len(current['families'])-len(changed),
          'checks':checks,'humanVisualAcceptance':'PENDING',
          'boundary':'Connectivity, coverage and proportion contracts do not establish aesthetic or complete mechanical-pose acceptance.'})
    print(len(checks),'packed connectivity/platform checks; rigid transforms and scoped ground pass')


if __name__=='__main__':
    main()
