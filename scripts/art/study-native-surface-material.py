"""Study HD material projection on Original construction surface geometry."""
import argparse
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt

from buildup import native_indices, read, sha, write
from painted_rig import vector_coverage

terminal=SourceFileLoader('terminal_author','scripts/art/author-terminal-alignment.py').load_module()


def roles(rgb):
    color=rgb.astype(float)
    r,g,b=color[...,0],color[...,1],color[...,2]
    hi,lo=color.max(-1),color.min(-1)
    result=np.zeros(hi.shape,int)
    result[(hi-lo<35)&(hi>185)]=1
    result[(r>g*1.3)&(r>b*1.4)&(hi-lo>=35)]=2
    result[(r>g*1.02)&(g>b*1.2)&(hi-lo>=35)]=3
    result[(r>g*.8)&(g>b*1.6)&(hi>130)&(hi-lo>=35)]=4
    result[(b>r*1.15)&(b>g*.95)&(hi-lo>=35)]=5
    result[(g>r*1.15)&(g>b*1.1)&(hi-lo>=35)]=6
    result[(r>g*1.4)&(b>g*1.2)&(hi-lo>=35)]=7
    result[(hi<40)&(hi-lo<30)]=8
    return result


def patch(source,mask,size=72):
    # Take a genuine interior HD sample. Transparency never supplies material.
    keep=mask&(source[...,3]>=248)
    if keep.sum()<16:
        keep=source[...,3]>=248
    distance=distance_transform_edt(keep)
    y,x=np.unravel_index(distance.argmax(),distance.shape)
    radius=max(2,min(size//2,int(distance[y,x]*.7)))
    tile=source[max(0,y-radius):y+radius+1,max(0,x-radius):x+radius+1,:3].copy()
    assert tile.size
    return tile


def material_fields(record,painting):
    family=read(record['newFamilyPath'])
    finished=terminal.render_member(record,family['members'][0])
    authored=np.asarray(Image.open(painting).convert('RGBA'))
    ids=roles(finished[...,:3]);extra_ids=roles(authored[...,:3])
    fields=[]
    for role in range(9):
        pool=authored if role==3 else finished
        labels=extra_ids if role==3 else ids
        tile=patch(pool,labels==role)
        yy,xx=np.indices((record['canvas'][1]*4,record['canvas'][0]*4)) if 'canvas' in record else np.indices(finished.shape[:2])
        field=tile[yy%tile.shape[0],xx%tile.shape[1]].astype(float)
        fields.append(field)
    return fields


def render(record,fields,phase):
    raw=read(record['nativeSource'])
    indices=native_indices(raw,phase)
    palette=np.asarray(record['palette'])
    classified=roles(palette)
    classified[16:32]=2
    luminance=palette@np.asarray([.2126,.7152,.0722])
    owner=(indices>=16)&(indices<=31)
    opaque=indices>0
    result=np.zeros((indices.shape[0]*4,indices.shape[1]*4,4),np.uint8)
    color=np.zeros_like(result[...,:3],float)
    total=np.zeros(result.shape[:2],float)
    # Original colors classify material/lighting only. Every output RGB sample
    # comes from retained HD paint or the new authored interior master.
    for role in range(9):
        values=np.unique(indices[opaque&(classified[indices]==role)])
        if not len(values):
            continue
        for index in values:
            mask=indices==index
            coverage=vector_coverage(mask).astype(float)/255
            available=np.where((classified==role)&(np.arange(256)>0))[0]
            rank=np.searchsorted(np.sort(luminance[available]),luminance[index])/max(1,len(available)-1)
            factor=.25+rank*1.05
            tile=fields[role]
            mean=np.mean(tile@np.asarray([.2126,.7152,.0722]))
            target=[155,220,180,112,185,145,125,150,22][role]*factor
            painted=np.clip(tile*target/max(mean,1),0,255)
            color+=painted*coverage[...,None]
            total+=coverage
    color=np.divide(color,total[...,None],out=color,where=total[...,None]>0)
    result[...,:3]=np.floor(np.clip(color,0,255)+.5).astype(np.uint8)
    result[...,3]=vector_coverage(opaque)
    result[result[...,3]==0]=0
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('authoring',type=Path)
    parser.add_argument('painting',type=Path)
    parser.add_argument('output',type=Path)
    parser.add_argument('--keys',required=True)
    args=parser.parse_args()
    args.output.mkdir(exist_ok=False)
    authority=read(args.authoring)
    sources=[]
    for key in args.keys.split(','):
        record=next(f for f in authority['families'] if f['key']==key)
        fields=material_fields(record,args.painting)
        for phase in [4,7,14,21]:
            Image.fromarray(render(record,fields,phase)).save(args.output/f'{key}-{phase:02}.png')
        sources.append({'key':key,'finishedFamily':record['newFamilyPath'],
                        'finishedFamilySha256':record['newFamilySha256']})
    write(args.output/'study.json',{'status':'UNSELECTED_MATERIAL_PROJECTION_STUDY',
        'sources':sources,'painting':str(args.painting),'paintingSha256':sha(args.painting),
        'nativeNeutralRgbContribution':0,'boundary':'Material study only; not a complete authored animation or anatomy approval'})


if __name__=='__main__':
    main()
