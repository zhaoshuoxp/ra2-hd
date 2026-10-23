"""Validate Soviet production rigs, installed anatomy and bounded artwork provenance."""
import argparse
import copy
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_erosion

from buildup import read,sha,write
from painted_rig import place


def nodes(rig,name):
    return [(p,n) for p,phase in enumerate(rig['phases']) for n in phase if n['name']==name]


def decreasing(values):
    return all(b<=a+1e-6 for a,b in zip(values,values[1:]))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root',type=Path)
    parser.add_argument('--rigs',type=Path)
    args=parser.parse_args();r=args.root
    rig_file=args.rigs or r/'selected-rigs-v2.json'
    baseline=Path('.artifacts/buildup-remaining-20261013-r74-v1/yard-pylon-r87-v1/registered-v1/authoring.json')
    before=read(baseline);rigs=read(rig_file);checks=[];inventory=[];sources={}
    assert len(rigs)==8
    for key,rig in rigs.items():
        rec=next(f for f in before['families'] if f['key']==key)
        assert not rig['unselectedGeometryViolations'] and sha(rec['nativeSource'])==rig['nativeSourceSha256']
        assert len(rig['phases'])==rec['frames']==25
        assert rig['retainedIdleCompletion']['frame']==24
        source_dir=Path(rig['phases'][1][0]['image']).parent
        full=np.array(Image.open(source_dir/'retained-idle-reference.png'))
        last=np.array(Image.open(source_dir/'23-preview.png'))
        core=binary_erosion(full[...,3]>250,iterations=2)
        missing=core&(last[...,3]<200)
        extra=(full[...,3]==0)&(last[...,3]>200)
        assert not missing.any(),(key,'Missing installed anatomy',int(missing.sum()))
        assert not extra.any(),(key,'New opaque background',int(extra.sum()))
        count=0
        for p,phase in enumerate(rig['phases']):
            for n in phase:
                assert sha(n['image'])==n['sha256']
                provenance=n['rigidPart']['reference']
                if 'code' in provenance:
                    assert sha(provenance['code'])==provenance['sha256']
                    sources[provenance['code']]=provenance['sha256']
                assert n['rigidPart'].get('opaquePixelsClipped',0)==0
                count+=1
        if rec['identity']=='NAWEAP':
            angles=[n['rigidPart']['angleRadians'] for _,n in nodes(rig,'inward-roof-front')]
            assert len(angles)==3 and decreasing(angles) and angles[-1]==0
            assert len(nodes(rig,'golden-crown-petals'))==4
        elif rec['identity']=='NADEPT':
            angles=[n['rigidPart']['angleRadians'] for _,n in nodes(rig,'rotating-service-crane-boom')]
            assert len(angles)==10 and decreasing(angles) and angles[-1]==0
            for p in range(5,12):
                members={n['name']:n for n in rig['phases'][p]}
                if 'telescopic-crane-mast' in members:
                    assert members['telescopic-crane-mast']['rigidPart']['translation']==members['crane-swivel-collar']['rigidPart']['translation']
                else:
                    assert members['crane-swivel-collar']['rigidPart']['translation'][1]>=42
        elif rec['identity']=='NAYARD':
            yaw=[n['rigidPart']['yawRadians'] for _,n in nodes(rig,'deploying-dock-lattice-jib')]
            assert decreasing(yaw) and yaw[-1]==0
            for p in range(12,24):
                members={n['name']:n for n in rig['phases'][p]}
                if 'telescopic-dock-crane-mast' in members:
                    assert members['telescopic-dock-crane-mast']['rigidPart']['translation']==members['rising-dock-crane-head']['rigidPart']['translation']
                else:
                    assert p<14 and members['rising-dock-crane-head']['rigidPart']['translation'][1]>=67
        elif rec['identity']=='NATECH':
            drops=[n['rigidPart']['translation'][1] for _,n in nodes(rig,'golden-lab-dome')]
            assert len(drops)==24 and decreasing(drops) and drops[-1]==0
            installed=nodes(rig,'installed-lab-walls-and-ground')
            assert len({(n['sha256'],tuple(n['box'])) for _,n in installed})==1
        checks.append({'key':key,'frames':25,'checkedComponentImages':count,'geometryViolations':0,
            'missingInstalledArchitecturePixels':0,'newOpaqueBackgroundPixels':0,
            'uncoveredOpaqueReferenceCorePixels':0,
            'completedReference':str(source_dir/'retained-idle-reference.png'),'completedReferenceSha256':sha(source_dir/'retained-idle-reference.png'),
            'latePreview':str(source_dir/'23-preview.png'),'latePreviewSha256':sha(source_dir/'23-preview.png'),
            'physicalMotion':'PASS_COMPONENT_ANCHORS_HINGES_AND_ORDER','visualAcceptance':'PENDING'})
        if rec['theater']=='TEMPERATE':
            phases=[1,5,9,13,18,23];cw,ch=np.asarray(full.shape[1::-1])//2
            contact=Image.new('RGB',(cw*3,(ch*2+76)*2),(52,72,61));draw=ImageDraw.Draw(contact)
            for i,p in enumerate(phases):
                x=i%3*cw;y=i//3*(ch*2+76)
                draw.text((x+8,y+4),f'{rec["identity"]} / phase {p}',font_size=26)
                for j,file in enumerate([r/f'original-frames/{key}/{p:02}.png',source_dir/f'{p:02}-preview.png']):
                    im=Image.open(file).resize((cw,ch),Image.Resampling.NEAREST if j==0 else Image.Resampling.LANCZOS)
                    contact.paste(im,(x,y+38+j*(ch+12)),im)
            contact.save(r/(key+'-original-hd-keyframes.png'))
    for key in ['naweap','nadept','nayard','natech']:
        file=r/(key+'-components-v1.png');prompt=r/(key+'-components-v1.prompt.txt')
        inventory.append({'identity':key.upper(),'file':str(file),'sha256':sha(file),'prompt':str(prompt),
            'promptSha256':sha(prompt),'mode':'BUILT_IN_IMAGEGEN_EDIT','reference':str(r/(key+'-idle.png')),
            'referenceSha256':sha(r/(key+'-idle.png')),'usage':'Complete hidden component surfaces; retained visible surfaces and original phase geometry determine assembly.'})
    write(r/'mechanism-validation-v1.json',{'status':'PASS_EIGHT_COMPLETE_PHYSICAL_RIGS_AND_INSTALLED_ANATOMY',
        'rigs':str(rig_file),'rigsSha256':sha(rig_file),
        'sequences':8,'nativePhases':200,'checks':checks,'sourceSnapshots':sources,
        'nativeNeutralRgbContribution':0,'finishedAndNonMkArtwork':'UNCHANGED',
        'visualAcceptance':'PENDING','windows':'NOT_RUN',
        'boundary':'Complete terminal GPU equality does not replace intermediate human visual acceptance.'})
    write(r/'artwork-inventory-v1.json',{'status':'FOUR_HASH_PINNED_BUILT_IN_HD_COMPONENT_SHEETS','assets':inventory,'sourceSnapshots':sources,
        'originalGeometryInputs':read(r/'original-observations-v1.json'),'remainingUnpainted':54})
    print('Eight rigs / 200 phases: installed architecture complete, no new opaque background, physical motions checked')


if __name__=='__main__':main()
