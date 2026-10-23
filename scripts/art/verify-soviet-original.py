"""Validate Original phase landmarks, complete surfaces and immutable art inputs."""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image

from buildup import read,sha,write,native_indices


def named(rig,name):
    return [(p,n) for p,phase in enumerate(rig['phases']) for n in phase if n['name']==name]


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('root',type=Path)
    parser.add_argument('--rigs',type=Path);parser.add_argument('--version',default='v1')
    args=parser.parse_args();r=args.root
    source=args.rigs or r/'prototype-v7/rigs.json';rigs=read(source);assert len(rigs)==8
    baseline=read(r.parent/'soviet-production-r88-v1/selected-v2/authoring.json')
    records={x['key']:x for x in baseline['families']};checks=[];snapshots={};landmarks=[]
    for key,rig in rigs.items():
        rec=records[key];assert not rig['unselectedGeometryViolations']
        assert len(rig['phases'])==25 and sha(rec['nativeSource'])==rig['nativeSourceSha256']
        out=Path(rig['phases'][1][0]['image']).parent
        # Closure can retain old first nodes, so use the selected preview directory.
        version='prototype-v10' if args.version in ['v3','v4'] and rec['identity']=='NAWEAP' else 'prototype-v9' if args.version in ['v2','v3','v4'] and rec['identity']=='NATECH' else 'prototype-v7'
        out=r/version/key
        full=np.asarray(Image.open(out/'retained-idle-reference.png').convert('RGBA'))
        late=np.asarray(Image.open(out/'23-preview.png').convert('RGBA'))
        assert np.array_equal(full,late),(key,'Late installed anatomy differs')
        raw=read(rec['nativeSource']);count=0
        for p,phase in enumerate(rig['phases']):
            ix=native_indices(raw,p)
            landmarks.append({'key':key,'phase':p,'foregroundBounds':_bounds(ix>0),'ownerBounds':_bounds((ix>=16)&(ix<32))})
            for n in phase:
                assert sha(n['image'])==n['sha256']
                info=n['rigidPart'];reference=info['reference']
                if 'originalPhase' in info:assert info['originalPhase']==p and info['originalGeometrySha256']==sha(rec['nativeSource'])
                assert info.get('opaquePixelsClipped',0)==0
                if 'code' in reference:
                    assert sha(reference['code'])==reference['sha256'];snapshots[reference['code']]=reference['sha256']
                if 'projectionCode' in reference:
                    assert sha(reference['projectionCode'])==reference['projectionCodeSha256'];snapshots[reference['projectionCode']]=reference['projectionCodeSha256']
                if 'imageSha256' in reference:assert sha(reference['image'])==reference['imageSha256']
                count+=1
        if rec['identity']=='NAWEAP':
            assert [p for p,_ in named(rig,'original-closing-roof-front')]==[21,22]
            assert [p for p,_ in named(rig,'original-closed-warehouse-interior')]==list(range(17,23))
            assert [p for p,_ in named(rig,'original-rear-tower-hinge')]==list(range(6,21))
            for p,n in named(rig,'original-back-column-0'):
                ix=native_indices(raw,p);y,x=np.indices(ix.shape);selection=(ix>=16)&(ix<32)&(abs(x-162)<9)&(y>75)&(y<133)
                if selection.any():assert n['rigidPart']['originalTop']==float(np.where(selection)[0].min())
                assert n['rigidPart']['method']=='CLOSED_RED_VENT_SURFACE_ON_ORIGINAL_COLUMN_WITH_UNCHANGED_GEOMETRY'
        elif rec['identity']=='NADEPT':
            upper=named(rig,'original-coupled-swivel-and-jib');front=named(rig,'original-front-service-swivel')
            assert [p for p,_ in upper]==list(range(4,23))
            angles=[n['rigidPart']['angleRadians'] for p,n in upper if p>=14]
            assert all(b<=a for a,b in zip(angles,angles[1:]))
            for p,n in front:
                other=next(x for pp,x in upper if pp==p);assert n['rigidPart']['angleRadians']==other['rigidPart']['angleRadians']
            assert [p for p,_ in named(rig,'original-service-hook')]==list(range(18,23))
        elif rec['identity']=='NAYARD':
            upper=named(rig,'original-coupled-dock-head-and-jib');assert [p for p,_ in upper]==list(range(13,23))
            assert all(n['rigidPart']['yawRadians']==0 for _,n in upper)
            angles=[n['rigidPart']['angleRadians'] for _,n in upper];assert all(b<=a for a,b in zip(angles,angles[1:]))
            assert [p for p,_ in named(rig,'original-extending-dock-mast')]==list(range(18,23))
        else:
            assert [p for p,_ in named(rig,'original-retracted-inner-collar')]==list(range(19))
            assert [p for p,_ in named(rig,'original-late-inner-core')]==list(range(19,23))
            assert [p for p,_ in named(rig,'original-closed-square-roof')]==list(range(5,11))
            if args.version in ['v2','v3','v4']:
                for p,n in named(rig,'original-middle-circular-tier'):
                    info=n['rigidPart']
                    if info['originalBandTop'] is not None:
                        assert info['translation'][1]==max(0,info['originalBandTop']-info['finalOriginalBandTop'])
            for p,n in named(rig,'original-golden-dome'):
                ix=native_indices(raw,p);rgb=np.asarray(rec['palette'],float)[ix];y,x=np.indices(ix.shape,dtype=float)
                offset=np.asarray(Image.open(out/f'{p:02}-preview.png').size)/4
                origin=(offset-[238,178])/2;x-=origin[0]
                selected=(ix>31)&(x>=108)&(x<=128)&(rgb[...,0]>rgb[...,1]*1.05)&(rgb[...,1]>rgb[...,2]*1.35)&(rgb[...,0]>100)
                assert selected.any() and float(np.where(selected)[0].min())==n['rigidPart']['originalGoldTop']
        checks.append({'key':key,'phases':25,'componentImagesChecked':count,'unselectedGeometryViolations':0,
            'lateInstalledRgba':'EXACT_RETAINED_HD','originalSourceSha256':sha(rec['nativeSource']),
            'visualAcceptance':'PENDING','geometrySource':'MATCHING_ORIGINAL_PHASE_LANDMARKS'})
    
    if source!=r/('selected-rigs-'+args.version+'.json'):write(r/('selected-rigs-'+args.version+'.json'),rigs)
    write(r/('original-landmarks-'+args.version+'.json'),{'status':'TWO_HUNDRED_NATIVE_PHASES_HASH_PINNED','landmarks':landmarks})
    write(r/('mechanism-validation-'+args.version+'.json'),{'status':'PASS_ORIGINAL_STAGE_LANDMARKS_AND_COMPLETE_HD_SURFACES',
        'sequences':8,'nativePhases':200,'checks':checks,'sourceSnapshots':snapshots,'rigs':str(source),'rigsSha256':sha(source),
        'originalLandmarks':str(r/('original-landmarks-'+args.version+'.json')),'originalLandmarksSha256':sha(r/('original-landmarks-'+args.version+'.json')),
        'nativeNeutralRgbContribution':0,'finishedAndNonMkArtwork':'UNCHANGED','visualAcceptance':'PENDING','windows':'NOT_RUN',
        'boundary':'Stage and binding checks do not establish human visual agreement with Original.'})
    write(r/('artwork-inventory-'+args.version+'.json'),{'status':'BUILT_IN_PLANAR_SURFACES_AND_RETAINED_HD_COMPONENTS',
        'newMaterialImage':str(r/'structural-surfaces-v1.png'),'newMaterialSha256':sha(r/'structural-surfaces-v1.png'),
        'newMaterialPrompt':str(r/'structural-surfaces-v1.prompt.txt'),'newMaterialPromptSha256':sha(r/'structural-surfaces-v1.prompt.txt'),
        'retainedKits':str(r.parent/'soviet-production-r88-v1/artwork-inventory-v1.json'),
        'retainedKitsSha256':sha(r.parent/'soviet-production-r88-v1/artwork-inventory-v1.json'),'sourceSnapshots':snapshots})
    print('Eight rigs / 200 Original phase landmarks / complete retained late anatomy pass')


def _bounds(mask):
    y,x=np.where(mask)
    return [int(x.min()),int(y.min()),int(x.max()+1),int(y.max()+1)] if len(x) else None


if __name__=='__main__':main()
