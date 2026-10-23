"""Measure published stationary surfaces, cyclic rotation and feedback preservation."""
from pathlib import Path
import numpy as np
from atlas import Member, read, write, sha

ROOT=Path('.artifacts/allied-corrections/feedback-r2')
buildings=read('desktop/allied-building-coverage.json');units=read('desktop/allied-unit-contracts.json')
before_buildings=read(ROOT/'before-buildings.json');before_units=read(ROOT/'before-units.json')
assert {k:v for k,v in buildings.items() if not k.startswith('atesla-')} == {k:v for k,v in before_buildings.items() if not k.startswith('atesla-')}
for kind in ('shp','vxl'):
    assert {k:v for k,v in units[kind].items() if k!='E1'} == {k:v for k,v in before_units[kind].items() if k!='E1'}


def members(entry):
    family=read(Path('.local')/entry['familyPath'])
    return {m['member']:Member(Path('.local/hd-packs')/m['packId']/m['revision']) for m in family['members']}


current=members(units['shp']['E1'])['gi.shp'];previous=members(before_units['shp']['E1'])['gi.shp']
source=read('.artifacts/allied-units/source-v2/ra2/gi.shp.json')
gi=[]
for density in (2,4):
    for facing in range(8):
        idle=np.array(current.frame(density,292+facing));rgb=idle[...,:3].astype(float)
        yy=np.arange(idle.shape[0])[:,None]
        # Independent material samples from the accepted idle fortress, including
        # side walls and the entire lower front; exclude intentional muzzle ROI.
        surface=(idle[...,3]==255)&(rgb[...,0]>rgb[...,1]*1.04)&(rgb[...,0]<rgb[...,1]*1.4)&(rgb[...,1]>rgb[...,2]*1.25)&(rgb[...,1]>45)&(yy>=23*density)
        surface|=(idle[...,3]==255)&(rgb.max(2)>=8)&(yy>=34*density)
        for n in range(315+facing*6,321+facing*6):
            native=source['frames'][n];indices=np.array(native['pixels']).reshape(native['height'],native['width'])
            flash=(indices>=176)&(indices<=185)
            from scipy.ndimage import label
            labels,_=label(flash);areas=np.bincount(labels.ravel());areas[0]=0
            region=surface.copy()
            if areas.max()>5:
                fy,fx=np.where(labels==areas.argmax())
                box=((native['x']+int(fx.min())-2)*density,(native['y']+int(fy.min())-2)*density,
                     (native['x']+int(fx.max())+3)*density,(native['y']+int(fy.max())+3)*density)
                region[max(0,box[1]):box[3],max(0,box[0]):box[2]]=False
            image=np.array(current.frame(density,n))
            differences=int((np.any(image!=idle,2)&region).sum())
            assert differences==0,(density,facing,n,differences)
            gi.append(dict(density=density,facing=facing,frame=n,staticSamples=int(region.sum()),changedStaticSamples=differences))
    for n in range(372):
        if 315<=n<=362:continue
        for role in ('base','data'):
            assert current.frame(density,n,role).tobytes()==previous.frame(density,n,role).tobytes(),(density,n,role)
prism=[]
for key in ('atesla-temperate','atesla-snow'):
    current=members(buildings[key]);previous=members(before_buildings[key])
    for name,member in current.items():
        assert member.manifest['logical']==previous[name].manifest['logical']
        assert member.manifest['source']==previous[name].manifest['source']
        if not name.endswith(('_a.shp','_b.shp')):
            assert sha(member.root/'manifest.json')==sha(previous[name].root/'manifest.json')
    name=next(n for n in current if n.endswith('_b.shp'));member=current[name]
    for density in (2,4):
        for damaged in (False,True):
            first=9 if damaged else 0
            frames=[np.array(member.frame(density,n)) for n in range(first,first+8)]
            # The entire fixed collar has identical published RGBA, not merely
            # equal bounding boxes. Frame 7 -> 0 also participates in the cycle.
            collar=[a[36*density:44*density] for a in frames]
            assert all(np.array_equal(collar[0],a) for a in collar)
            assert len({a[:31*density].tobytes() for a in frames})==8
            deltas=[int(np.any(frames[i][:31*density]!=frames[(i+1)%8][:31*density],2).sum()) for i in range(8)]
            assert deltas[-1]<max(deltas[:-1])*1.5,(key,density,damaged,deltas)
            prism.append(dict(family=key,density=density,damaged=damaged,uniquePhases=8,changedCollarSamples=0,cyclicDeltaPixels=deltas))
write(ROOT/'pixel-validation.json',dict(status='PASS_STATIONARY_GI_SURFACES_RIGID_PRISM_CYCLE_AND_PRESERVATION',gi=gi,prism=prism,
    humanVisualAcceptance='PENDING',hq='PRESERVED_USER_BASICALLY_FIXED',sidebar='PRESERVED',mainIntegration='NOT_MERGED'))
print('PASS: 96 GI frame/density static surface samples; eight Prism state/density/theater cycles; preserved HQ/UI and unrelated frames')
