"""Verify rebuilt original-stage mechanisms and preserve unrelated construction."""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image

from buildup import read, sha, write
from painted_rig import place

parser=argparse.ArgumentParser(description=__doc__)
for name in ['baseline','rigs','output']:
    parser.add_argument(name,type=Path)
args=parser.parse_args()
authority,rigs=read(args.baseline),read(args.rigs)
assert len(rigs)==6
rows=[]
replaced={
    'GAREFN':{'preserved-rear-curved-casing','fixed-front-roof-connector',
              'telescoping-curved-shell-0','telescoping-curved-shell-1','red-top-connector'},
    'GAYARD':{'vertical-crane-housing','central-drum','fixed-upper-bearing'},
}
for key,rig in rigs.items():
    record=next(r for r in authority['families'] if r['key']==key)
    assert not rig['unselectedGeometryViolations'],(key,rig['unselectedGeometryViolations'])
    native=read(record['nativeSource'])
    member=record['newMember']
    logical=read(Path('.local/hd-packs')/member['packId']/member['revision']/'manifest.json')['logical']
    assert len(rig['phases'])==record['frames']==25
    assert rig['phases'][-1]==record['componentRig']['phases'][-1]
    checked=preserved=0
    for p,nodes in enumerate(rig['phases'][:-1]):
        x,y=logical['frames'][p]['trimOrigin'];w,h=logical['frames'][p]['trimSize']
        for node in nodes:
            assert sha(node['image'])==node['sha256']
            image=place(Image.open(node['image']),node['box'],native['canvas'])
            outside=image[...,3].copy();outside[y*4:(y+h)*4,x*4:(x+w)*4]=0
            assert not outside.any(),(key,p,node['name'],'Outside original logical canvas')
            reference=node.get('rigidPart',{}).get('reference',{})
            for field in ['code','image','family']:
                if field in reference:assert sha(reference[field])==reference['sha256']
            for prefix in ['surface','yardSurface']:
                if prefix+'Image' in reference:
                    assert sha(reference[prefix+'Image'])==reference[prefix+'Sha256']
            assert np.isfinite(np.asarray(node['box'])).all()
            checked+=1
        for old in record['componentRig']['phases'][p]:
            keep=(old['name']=='fixed-barracks-slab' and p<23 if record['identity']=='NAHAND'
                  else old['name'] not in replaced[record['identity']])
            if keep:
                assert old in nodes,(key,p,old['name'],'Unchanged context lost')
                preserved+=1
    if record['identity']=='GAYARD':
        headers=[next(n for n in phase if n['name']=='original-paired-moving-header')
                 for phase in rig['phases'][:11]]
        shapes=[np.array(Image.open(n['image']))[...,3] for n in headers]
        assert all(np.array_equal(shapes[0],shape) for shape in shapes[1:]),(key,'Early header changed shape')
        assert all(n['box']==headers[0]['box'] for n in headers[:5]),(key,'Header rose before pylons')
        assert not any(n['name']=='original-late-top-motor' for phase in rig['phases'][:18] for n in phase)
    elif record['identity']=='NAHAND':
        complete=next(n for n in rig['phases'][23] if n['name']=='original-complete-barracks')
        layer=place(Image.open(complete['image']),complete['box'],native['canvas'])
        retained=np.array(Image.open(Path(complete['image']).parent/'retained-idle-reference.png'))
        assert np.array_equal(layer[...,3],retained[...,3]),(key,'Incomplete closed base')
        assert np.abs(layer[...,:3].astype(int)-retained[...,:3].astype(int)).max()<=1
        names=['original-'+side+'-wall-'+str(i) for side in ['rear','front'] for i in range(2)]
        for name in names:
            held=[next(n for n in phase if n['name']==name) for phase in rig['phases'][7:22]]
            assert all(n['box']==held[0]['box'] and n['sha256']==held[0]['sha256'] for n in held)
        assert not any('well-cover' in n['name'] for phase in rig['phases'] for n in phase)
        assert not any(n['name']=='original-rising-statue' for phase in rig['phases'][:7] for n in phase)
    else:
        assert not any(n['name']=='original-rear-arched-casing' for phase in rig['phases'][:16] for n in phase)
        for start,i in [(13,0),(15,1),(16,2)]:
            assert not any(n['name']=='original-roof-cap-'+str(i) for phase in rig['phases'][:start] for n in phase)
    rows.append({'key':key,'componentImagesChecked':checked,'preservedContextNodes':preserved,
                 'terminalMarkerExact':True,'originalNeutralRgbContribution':0})
write(args.output,{'status':'PASS_SIX_REBUILDS_BOUNDS_SOURCES_FIXED_COMPONENTS_AND_PRESERVED_CONTEXT',
    'baseline':str(args.baseline),'baselineSha256':sha(args.baseline),
    'rigs':str(args.rigs),'rigsSha256':sha(args.rigs),'rows':rows,
    'boundary':'Static validation does not establish visual acceptance. Review matching Original phases.',
    'visualAcceptance':'PENDING','windows':'NOT_RUN'})
print('Six rebuilt mechanisms: bounds, sources, fixed components and preserved context pass')
