"""Independently check complete components, source roles and mast attachment."""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation

from buildup import native_indices, read, sha, write
from painted_rig import place

parser=argparse.ArgumentParser(description=__doc__)
for name in ['authoring','rigs','output']:parser.add_argument(name,type=Path)
args=parser.parse_args();before=read(args.authoring);rigs=read(args.rigs);rows=[]
assert len(rigs)==12
for key,rig in rigs.items():
    rec=next(r for r in before['families'] if r['key']==key)
    assert not rig['unselectedGeometryViolations']
    assert rig['nativeSourceSha256']==sha(rec['nativeSource'])
    raw=read(rec['nativeSource']);binding=rec['newMember']
    logical=read(Path('.local/hd-packs')/binding['packId']/binding['revision']/'manifest.json')['logical']
    assert len(rig['phases'])==rec['frames']
    stable={};attachments=[];nodes_checked=0
    for phase,nodes in enumerate(rig['phases']):
        frame=logical['frames'][phase];left,top=frame['trimOrigin'];w,h=frame['trimSize']
        indices=native_indices(raw,phase);owner=((indices>=16)&(indices<=31)).any()
        for node in nodes:
            pixels=np.array(Image.open(node['image']).convert('RGBA'));assert sha(node['image'])==node['sha256']
            a=place(Image.fromarray(pixels),node['box'],raw['canvas'])[...,3]
            outside=a.copy();outside[top*4:(top+h)*4,left*4:(left+w)*4]=0
            assert not outside.any(),(key,phase,node['name'],'Coverage outside logical frame')
            assert (pixels[...,3]>0).any()
            if not owner:
                color=pixels[...,:3].astype(float)
                red=(color[...,0]>color[...,1]*2)&(color[...,0]>color[...,2]*2)&(color[...,0]>50)&(pixels[...,3]>=128)
                assert not red.any(),(key,phase,node['name'],'Owner paint precedes Original')
            if node['name']=='fixed-empty-platform' and phase>=4:
                stable.setdefault(node['name'],[]).append((node['sha256'],node['box']))
            if node['name']=='fixed-barracks-slab' and phase>=3:
                stable.setdefault(node['name'],[]).append((node['sha256'],node['box']))
            if node['name']=='fixed-reactor-bed' and phase>=6:
                stable.setdefault(node['name'],[]).append((node['sha256'],node['box']))
            if node['name']=='fixed-refinery-platform' and phase>=6:
                stable.setdefault(node['name'],[]).append((node['sha256'],node['box']))
            nodes_checked+=1
        if rec['identity']=='NARADR' and 13<=phase<rec['frames']-1:
            dish=next(n for n in nodes if n['name']=='rotating-paraboloid-dish')
            shaft=next(n for n in nodes if n['name']=='telescoping-lattice-mast')
            bearing=next((n for n in nodes if n['name']=='complete-dish-bearing'),None)
            chain=[dish,bearing,shaft] if bearing else [dish,shaft]
            masks=[place(Image.open(n['image']),n['box'],raw['canvas'])[...,3]>=128 for n in chain]
            overlaps=[int((binary_dilation(a,iterations=1)&b).sum()) for a,b in zip(masks,masks[1:])]
            assert all(value>0 for value in overlaps),(key,phase,'Visible dish/bearing/mast attachment gap',overlaps)
            attachments.append({'phase':phase,'overlappingAttachmentPixels':overlaps})
    for name,versions in stable.items():
        assert all(v==versions[0] for v in versions),(key,name,'Stationary floor moved or changed')
    assert rig['phases'][-1][0]['name']=='retained-idle-marker'
    reference=rig['retainedIdleCompletion']['reference'];assert sha(reference['nativeReport'])==reference['sha256']
    rows.append({'key':key,'nodesChecked':nodes_checked,'frames':rec['frames'],
                 'fixedSurfaceChecks':list(stable),'dishMastAttachments':attachments,'opaqueComponentsClipped':0})
write(args.output,{'status':'PASS_TWELVE_COMPLETE_COMPONENTS_FIXED_SURFACES_ROLES_AND_ATTACHMENTS',
    'rigs':str(args.rigs),'rigsSha256':sha(args.rigs),'rows':rows,
    'boundary':'These pixel/source checks do not grant visual acceptance. Native candidate recordings are required separately; Windows NOT_RUN.'})
print('Twelve component rigs pass coverage, source roles, fixed surfaces and real attachment pixels')
