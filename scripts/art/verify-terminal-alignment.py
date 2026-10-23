"""Check retained component pixels, stable contacts and scoped terminal publication."""
import argparse
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image

from buildup import read, sha, unpack, write
from painted_rig import place, over

author = SourceFileLoader('terminal_author','scripts/art/author-terminal-alignment.py').load_module()
rigid = SourceFileLoader('rigid_author','scripts/art/author-rigid-anatomy.py').load_module()

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('authoring',type=Path)
parser.add_argument('baseline',type=Path)
parser.add_argument('output',type=Path)
args=parser.parse_args()
current,before=read(args.authoring),read(args.baseline)
assert current['terminalAlignmentRepair']['baselineSha256']==sha(args.baseline)
changed=set(current['terminalAlignmentRepair']['correctedKeys'])
assert changed=={i+'-'+t for i in ('garobo','gaairc','gtgcan') for t in ('temperate','snow')}
checks=[]
for record in current['families']:
    old=next(f for f in before['families'] if f['key']==record['key'])
    if record['key'] not in changed:
        assert record==old
        assert sha(old['newFamilyPath'])==old['newFamilySha256']
        continue
    rig=record['componentRig']
    family,previous=read(record['newFamilyPath']),read(old['newFamilyPath'])
    assert [m for m in family['members'] if 'mk.shp' not in m['member']]==[m for m in previous['members'] if 'mk.shp' not in m['member']]
    full=author.completed(record)
    count=0
    if record['identity']!='GTGCAN':
        assert rig['foundationSource']==old['componentRig']['foundationSource']
        for phase,nodes in enumerate(rig['phases']):
            if isinstance(nodes,dict):continue
            assert rigid.ground_nodes(nodes)==rigid.ground_nodes(old['componentRig']['phases'][phase])
            for node in nodes:
                metadata=node.get('rigidPart',{})
                kind=metadata.get('reference',{}).get('artwork','')
                if kind.startswith('RETAINED_V8_HEAD_'):
                    predecessor=metadata['reference']['predecessorNode']
                    original=place(Image.open(predecessor['image']),predecessor['box'],read(record['nativeSource'])['canvas'])
                    if 'nativeReflectionAxisX' in metadata:
                        expected=author.move(original[:,::-1].copy(),dx=2*metadata['nativeReflectionAxisX']-read(record['nativeSource'])['canvas'][0])
                        scale=metadata['fitNativeBoundsUniformScale']
                        if scale<1:
                            from painted_rig import project_rgba
                            pivot=metadata['nativePivot']
                            expected=project_rgba(Image.fromarray(expected),
                                [[scale/4,0,pivot[0]*(1-scale)],[0,scale/4,pivot[1]*(1-scale)]],read(record['nativeSource'])['canvas'])
                        assert metadata['mirrored'] is False
                    else:
                        expected=author.move(original,*metadata['nativeTranslation'])
                    actual=place(Image.open(node['image']),node['box'],read(record['nativeSource'])['canvas'])
                    solid=actual[...,3]==255
                    assert np.array_equal(actual[solid],expected[solid]), 'Retained intermediate pose changed'
                    count+=1
                    continue
                if kind=='RETAINED_AUTHORED_RIGID_CAP':
                    assert sha(metadata['reference']['sourceAtlas'])==metadata['reference']['sourceAtlasSha256']
                    singular=np.linalg.svd(np.asarray(metadata['transform'])[:,:2],compute_uv=False)
                    assert abs(singular[0]-singular[1])<1e-12, 'Circular cap stretched'
                    count+=1
                    continue
                if kind!='RETAINED_FINISHED_HD_COMPONENTS_NO_RETAIL_RGB':continue
                layer=place(Image.open(node['image']),node['box'],read(record['nativeSource'])['canvas'])
                dx,dy=metadata.get('nativeTranslation',[0,0])
                reference=author.move(full,dx,dy)
                opaque=layer[...,3]>=128
                assert opaque.any()
                assert np.array_equal(layer[opaque,3],reference[opaque,3]), 'Retained alpha changed'
                assert np.max(np.abs(layer[opaque,:3].astype(float)-reference[opaque,:3].astype(float)))<=1, (record['key'],phase,node['name'],'Completed texels changed')
                solid=layer[...,3]==255
                assert np.array_equal(layer[solid],reference[solid]), 'Opaque retained texels changed'
                assert metadata.get('mirrored',False) is False
                count+=1
        # The terminal directly overlays the retained finished component pixels.
        terminal=rig['phases'][-1]
        composed=np.zeros_like(full)
        for node in terminal:
            composed=over(place(Image.open(node['image']),node['box'],read(record['nativeSource'])['canvas']),composed)
        masks=[]
        occluded=np.zeros(full.shape[:2],bool)
        for node in reversed(terminal):
            layer=place(Image.open(node['image']),node['box'],read(record['nativeSource'])['canvas'])
            if node.get('rigidPart',{}).get('reference'):
                masks.append((layer[...,3]==255)&~occluded)
            occluded|=layer[...,3]>0
        mask=np.logical_or.reduce(masks)
        neutral=mask & (np.ptp(full[...,:3].astype(float),axis=2)<50)
        error=np.abs(composed[neutral,:3].astype(float)-full[neutral,:3].astype(float))
        assert np.percentile(error,99)<3,(record['key'],'Terminal neutral component changed')
        checks.append({'key':record['key'],'exactRetainedPartChecks':count,'neutralTerminalP99Error':float(np.percentile(error,99)),
            'foundation':'EXACT_V8','terminalPixels':'RETAINED_HD_GEOMETRY_AT_UNCHANGED_WORLD_COORDINATES'})
    else:
        assert rig['terminalCompletionOverlay']['frame']==11
        assert rig['fixedFloorPhases']==list(range(4,11))
        floors=[rig['phases'][p][0] for p in rig['fixedFloorPhases']]
        assert len({(n['sha256'],tuple(n['box'])) for n in floors})==1
        if family.get('turret'):
            assert family['turret']['sha256']==previous['turret']['sha256']
            assert family['turret']['constructionCompletionFrame']==11
        else:
            assert family['sharedTurretSelection']==previous['sharedTurretSelection']
        for phase in (8,9,10):
            node=rig['phases'][phase][-1]
            singular=np.linalg.svd(np.asarray(node['rigidPart']['transform'])[:,:2],compute_uv=False)
            assert abs(singular[0]-singular[1])<1e-12
        member=record['newMember'];root=Path('.local/hd-packs')/member['packId']/member['revision'];manifest=read(root/'manifest.json')
        assert not unpack(root,manifest,4,11)[...,3].any(), 'Terminal must use the complete retained renderer'
        checks.append({'key':record['key'],'platform':'FIXED_RETAINED_COMPLETED_PLATFORM','barrel':'RIGID_CANONICAL_ELEVATION',
            'terminal':'RETAINED_MAIN_AND_TURRET_AT_NATIVE_PHASE_11','finishedTurretBytes':'EXACT_PREDECESSOR'})
write(args.output,{'status':'PASS_RETAINED_GEOMETRY_CONTACTS_AND_SCOPED_TERMINAL_PUBLICATION',
    'authoritySha256':sha(args.authoring),'changedRecords':6,'unchangedRecords':102,'checks':checks,
    'nativeSameTileTransition':'REQUIRED_NEXT','humanVisualAcceptance':'PENDING'})
print('Six component/end-state references and 102 exact selection records pass')
