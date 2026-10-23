"""Author Battle Lab from separate mast, folding roofs and retained rigid parts."""
import argparse
import copy
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import label, find_objects, binary_fill_holes

from buildup import native_indices, read, sha, write
from painted_rig import over, place, vector_coverage, project_rgba

terminal=SourceFileLoader('terminal_author','scripts/art/author-terminal-alignment.py').load_module()
helpers=terminal.helpers


def open_roof(image):
    """Separate the stationary roof mount from its independently rising cap."""
    rgba=np.asarray(image.convert('RGBA')).copy()
    rgb=rgba[...,:3].astype(float)
    glass=(rgba[...,3]>=128)&(rgb[...,2]-np.maximum(rgb[...,0],rgb[...,1])>32)&(rgb.mean(2)>90)
    ids,count=label(glass)
    regions=find_objects(ids)
    selected=max(range(1,count+1),key=lambda index:int((ids==index).sum()))
    region=regions[selected-1]
    matte=Image.new('1',image.size)
    ImageDraw.Draw(matte).ellipse((region[1].start-2,region[0].start-2,
                                  region[1].stop+2,region[0].stop+2),fill=1)
    inside=np.asarray(matte)&(rgba[...,3]>0)
    rgba[inside,:3]=(14,17,21)
    return Image.fromarray(rgba)


def floor(rig,full,phase,master):
    if phase<6:return None
    indices=native_indices(rig.raw,phase if phase<13 else 13)
    color=np.asarray(rig.record['palette'])[indices].astype(float)
    yy,xx=np.indices(indices.shape)
    # A deployed slab is a complete physical ground plane. Future finished
    # columns must not punch background holes into an earlier empty platform.
    ground=binary_fill_holes((indices>0)&(yy>=166))
    # A ground surface has fixed UVs in native world coordinates. Its early
    # deployed contour is an Original geometry control, not copied RGB.
    layer=master.copy()
    if phase<13:layer[...,3]=np.minimum(layer[...,3],vector_coverage(ground))
    layer[layer[...,3]==0]=0
    geometry=rig.logical[phase]
    x,y=geometry['trimOrigin'];w,h=geometry['trimSize']
    support=np.zeros(layer.shape[:2],bool);support[y*4:(y+h)*4,x*4:(x+w)*4]=True
    assert not (layer[...,3][~support]>=128).any(), 'Ground contour exceeds its physical frame'
    layer[~support]=0
    if not layer[...,3].any():return None
    return terminal.save_part(rig,layer,'foundation',phase,
        {'family':rig.record['newFamilyPath'],'sha256':rig.record['newFamilySha256']},
        'NATIVE_GROUND_CONTOUR_WITH_WORLD_FIXED_HD_MATERIAL')


def retained(rig,full,mask,name,phase,dy=0):
    layer=terminal.move(terminal.masked(full,mask),dy=dy)
    return terminal.save_part(rig,layer,name,phase,
        {'family':rig.record['newFamilyPath'],'sha256':rig.record['newFamilySha256'],
         'artwork':'RETAINED_FINISHED_HD_COMPONENT'},
        'RIGID_COMPONENT_WITH_EXPLICIT_VISIBILITY',nativeTranslation=[0,dy])


def pipe_bank(rig,full,phase):
    """Raise separate retained end caps on unchanged axial cylinder walls."""
    yy,xx=np.mgrid[:full.shape[0],:full.shape[1]]/4
    rgb=full[...,:3].astype(float)
    metal=(abs(rgb[...,0]-rgb[...,1])<30)&(rgb[...,0]<145)
    layer=np.zeros_like(full)
    growth=min(1,(phase-12)/6)
    for cx,top,width,bottom in [(141.1,158,3.6,178),(144.4,173,3.8,182),(149.4,168,9.5,185)]:
        cap_height=max(1.2,width*.32)
        drop=(bottom-top-cap_height)*(1-growth)
        face=(abs(xx-cx)<width/2)&(yy>=top+cap_height+drop)&(yy<bottom)&metal
        cap=((xx-cx)/(width/2))**2+((yy-(top+cap_height/2))/(cap_height/2))**2<=1
        layer=over(terminal.masked(full,face),layer)
        layer=over(terminal.move(terminal.masked(full,cap),dy=drop),layer)
    return terminal.save_part(rig,layer,'left-telescoping-pipe-bank',phase,
        {'family':rig.record['newFamilyPath'],'sha256':rig.record['newFamilySha256']},
        'FIXED_CYLINDER_WALLS_WITH_TRANSLATING_COMPLETE_CAPS',nativeGrowth=growth)


def author(record,assets,reference,output,counterpart=None):
    seed=copy.deepcopy(record)
    seed['componentRig']={'nativeSourceSha256':sha(record['nativeSource']),
                          'phases':[[] for _ in range(record['frames'])]}
    rig=helpers.Rig(seed,output)
    family=read(record['newFamilyPath'])
    full=terminal.render_member(record,family['members'][0])
    early=helpers.atlas(assets/'gatech-early-tower-v1.png')
    core=helpers.atlas(assets/'gatech-central-core-phase05-v2.png',(1,1))[0]
    middle=helpers.atlas(assets/'gatech-central-core-06-v1.png',(3,1))
    caps=helpers.atlas(assets/'gatech-single-caps-09-v3.png')
    exact_roofs=helpers.atlas(assets/'gatech-exact-horizontal-roofs-v1.png',(2,1))
    foundation=helpers.atlas(assets/'gatech-complete-foundation-v1.png',(1,1))[0]
    floor_master=place(foundation,(128,159,246,217),rig.canvas)
    yy,xx=np.mgrid[:full.shape[0],:full.shape[1]]/4
    core_mask=terminal.polygon(full.shape,[(164,77),(192,77),(192,111),(186,122),
        (185,190),(169,198),(148,182),(148,137),(156,115)])
    rear_wall=terminal.polygon(full.shape,[(138,91),(173,99),(178,110),(173,135),(157,140),(138,129)])
    front_wall=terminal.polygon(full.shape,[(183,126),(231,125),(237,139),(231,155),(211,161),(184,150)])
    rear_small=terminal.polygon(full.shape,[(151,54),(182,53),(188,68),(185,94),(164,100),(151,87)])
    front_small=terminal.polygon(full.shape,[(193,76),(221,76),(227,91),(226,112),(208,119),(193,110)])
    rear_cap=rear_small&(yy<74)
    front_cap=front_small&(yy<92)
    front_stem=(xx>=198)&(xx<215)&(yy>=156)&(yy<193)
    # Retain only independently identified plain finished floor texels. The
    # ramp, feet, sockets, pipes and red signal surfaces are separate objects.
    ni=native_indices(rig.raw,24);nc=np.asarray(record['palette'])[ni].astype(float)
    native_floor=(ni>31)&(nc[...,0]>nc[...,2]*1.2)&(nc[...,1]>nc[...,2]*1.1)
    native_floor=np.repeat(np.repeat(native_floor,4,axis=0),4,axis=1)
    floor_region=native_floor&(yy>=166)&~core_mask&~front_stem
    for points in [[(134,156),(160,156),(160,185),(134,185)],
                   [(172,188),(194,188),(196,207),(172,207)],
                   [(195,182),(218,182),(218,212),(195,212)],
                   [(225,172),(239,172),(240,200),(225,200)]]:
        floor_region&=~terminal.polygon(full.shape,points)
    rgb=full[...,:3].astype(float)
    floor_region&=(rgb[...,0]>rgb[...,2]*1.08)&(rgb[...,1]>rgb[...,2]*1.02)&(full[...,3]>=128)
    floor_master[floor_region]=full[floor_region]
    mast_top=None
    mast_back=None
    fixed_cap=None
    fixed_cap_node=None
    phases=[]
    for phase in range(24):
        if counterpart and phase<20:
            nodes=copy.deepcopy(counterpart['phases'][phase])
            if phase==5:
                part=next(n for n in nodes if n['name'] in ('authored-central-core','authored-core-below-fixed-cap'))
                fixed_cap=terminal.masked(place(Image.open(part['image']),part['box'],rig.canvas),yy<91)
                mast_back=terminal.masked(place(Image.open(part['image']),part['box'],rig.canvas),
                    (xx>=184)&(xx<208)&(yy>=96)&(yy<190))
            if phase==8:
                top=np.zeros_like(full)
                for part in nodes:top=over(place(Image.open(part['image']),part['box'],rig.canvas),top)
                mast_top=terminal.masked(top,yy<96)
            phases.append(nodes)
            continue
        nodes=[]
        ground=floor(rig,full,phase,floor_master)
        if ground:nodes.append(ground)
        frame=rig.logical[phase]
        x,y=frame['trimOrigin'];w,h=frame['trimSize']
        if phase<5:
            nodes.append(rig.rigid(early[phase],'folding-core-panels',phase,(x+w/2,y+h),
                width=w,anchor=(early[phase].width/2,early[phase].height)))
        elif phase<9:
            image=core if phase==5 else middle[phase-6]
            # Ground growth must not resize the upper mast. Its placement uses
            # the central structure's own native box, not the full sprite box.
            box={5:(161,77,210,200),6:(160,77,215,200),7:(157,77,215,200),8:(153,77,220,199)}[phase]
            nodes.append(rig.rigid(image,'authored-central-core',phase,
                (185.5,box[3]),height=box[3]-box[1],
                anchor=(image.width/2,image.height)))
        else:
            nodes.append(terminal.save_part(rig,mast_back,'construction-only-mast-backwall',phase,
                {'image':str(assets/'gatech-central-core-phase05-v2.png'),
                 'sha256':sha(assets/'gatech-central-core-phase05-v2.png')},
                'RETAINED_AUTHORED_MAST_WALL_HIDDEN_BY_FINISHED_CYLINDERS'))
            mast=terminal.masked(full,core_mask&(yy>=96))
            # The bronze cap is the same physical part as the preceding pose;
            # finished antenna coils cannot donate RGB to this earlier cap.
            nodes.append(terminal.save_part(rig,mast,'retained-central-core',phase,
                {'family':record['newFamilyPath'],'sha256':record['newFamilySha256']},
                'RETAINED_CORE_WITH_INDEPENDENT_BRONZE_CAP'))
            nodes.append(terminal.save_part(rig,mast_top,'early-bronze-cap',phase,
                {'image':str(assets/'gatech-central-core-06-v1.png'),
                 'sha256':sha(assets/'gatech-central-core-06-v1.png')},
                'EXACT_PRECEDING_CAP_WORLD_POSITION'))
        if 6<=phase<=8:
            core_layer=place(Image.open(nodes[-1]['image']),nodes[-1]['box'],rig.canvas)
            nodes[-1]=terminal.save_part(rig,terminal.masked(core_layer,yy>=91),
                'authored-core-below-fixed-cap',phase,
                {'image':str(assets/'gatech-central-core-06-v1.png'),
                 'sha256':sha(assets/'gatech-central-core-06-v1.png')},
                'UNFOLDING_FRONT_ARMOR_ON_FIXED_MAST_AXIS')
            nodes.append(copy.deepcopy(fixed_cap_node))
        if phase==5:
            core_layer=place(Image.open(nodes[-1]['image']),nodes[-1]['box'],rig.canvas)
            fixed_cap=terminal.masked(core_layer,yy<91)
            fixed_cap_node=terminal.save_part(rig,fixed_cap,'fixed-bronze-cap',phase,
                {'image':str(assets/'gatech-central-core-phase05-v2.png'),
                 'sha256':sha(assets/'gatech-central-core-phase05-v2.png')},
                'EXACT_UNCHANGED_CAP_RGBA_AND_WORLD_POSITION')
            nodes[-1]=terminal.save_part(rig,terminal.masked(core_layer,yy>=91),
                'authored-core-below-fixed-cap',phase,
                {'image':str(assets/'gatech-central-core-phase05-v2.png'),
                 'sha256':sha(assets/'gatech-central-core-phase05-v2.png')},
                'INDEPENDENT_MAST_BODY_BELOW_FIXED_CAP')
            nodes.append(copy.deepcopy(fixed_cap_node))
            mast_back=terminal.masked(core_layer,(xx>=184)&(xx<208)&(yy>=96)&(yy<190))
        if phase==8:
            core_layer=np.zeros_like(full)
            for part in nodes:core_layer=over(place(Image.open(part['image']),part['box'],rig.canvas),core_layer)
            mast_top=terminal.masked(core_layer,yy<96)
        if 9<=phase<=14:
            # Roof panels are flat hinged faces. Their native projection changes
            # as they fold, while the finished cylinder body is never resampled.
            box=[(203,140,222,191),(201,110,225,190),(197,108,229,172),
                 (186,105,232,153),(183,106,236,137),(183,106,238,133)][phase-9]
            nodes.append(rig.rectangle(exact_roofs[0],'foreground-folding-roof',phase,
                box,'NATIVE_PROJECTION_OF_FLAT_HINGED_ROOF_FACE'))
            if phase>=12:
                box=[(139,97,171,133),(137,91,177,116),(137,86,177,109)][phase-12]
                nodes.append(rig.rectangle(exact_roofs[1],'rear-folding-roof',phase,
                    box,'NATIVE_PROJECTION_OF_FLAT_HINGED_ROOF_FACE'))
        elif phase>14:
            fore=open_roof(exact_roofs[0]);rear=open_roof(exact_roofs[1])
            fore_layer=place(fore,(183,106,238,133),rig.canvas)
            rear_layer=place(rear,(137,86,177,109),rig.canvas)
            # Exposed finished roof texels retain their actual world positions.
            # The newly painted face supplies only the construction-only mount.
            fore_visible=terminal.polygon(full.shape,[(183,115),(200,105),(234,113),
                (240,124),(226,133),(192,125)])&~front_small&(yy<130)
            rear_visible=terminal.polygon(full.shape,[(137,90),(152,79),(174,87),
                (179,104),(165,111),(143,101)])&~rear_small&(yy<108)
            fore_layer=over(terminal.masked(full,fore_visible),fore_layer)
            rear_layer=over(terminal.masked(full,rear_visible),rear_layer)
            nodes.append(terminal.save_part(rig,fore_layer,'foreground-fixed-roof',phase,
                {'family':record['newFamilyPath'],'authoredMaster':str(assets/'gatech-exact-horizontal-roofs-v1.png')},
                'FIXED_ROOF_FACE_WITH_RETAINED_EXPOSED_FINISHED_TEXELS'))
            nodes.append(terminal.save_part(rig,rear_layer,'rear-fixed-roof',phase,
                {'family':record['newFamilyPath'],'authoredMaster':str(assets/'gatech-exact-horizontal-roofs-v1.png')},
                'FIXED_ROOF_FACE_WITH_RETAINED_EXPOSED_FINISHED_TEXELS'))
            if phase>=16:
                fraction=min(1,(phase-15)/4)
                nodes.append(retained(rig,full,rear_wall&(xx<=138+40*fraction),'rear-wrapping-cylinder',phase))
                nodes.append(retained(rig,full,front_wall&(xx<=183+55*fraction),'foreground-wrapping-cylinder',phase))
            nodes.append(retained(rig,full,front_stem,'foreground-fixed-stem',phase))
        if phase>=13:
            nodes.append(pipe_bank(rig,full,phase))
            foot=terminal.polygon(full.shape,[(192,187),(213,182),(224,190),
                (224,205),(204,210),(192,203)])
            foot=foot&~terminal.polygon(full.shape,[(175,186),(195,186),(195,205),(175,205)])
            nodes.append(retained(rig,full,foot,'foreground-foot-and-bearing',phase))
        if phase>=19:
            ramp=terminal.polygon(full.shape,[(181,188),(188,190),(192,198),(180,205),(174,201)])
            nodes.append(retained(rig,full,ramp,'ground-ramp',phase))
        if phase>=15:
            drop={15:26,16:24,17:23,18:17,19:8,20:2,21:0,22:0,23:0}[phase]
            if phase<21:
                neck=np.zeros_like(full)
                for cx,cap_bottom,roof in [(165,74,105),(209,92,128)]:
                    shaft=(abs(xx-cx)<1.25)&(yy>=cap_bottom+drop-1)&(yy<=roof)
                    stripe=full[19*4:21*4,178*4:179*4,:3].mean(axis=0).mean(axis=0)
                    neck[...,:3][shaft]=stripe.astype(np.uint8);neck[...,3][shaft]=255
                if neck[...,3].any():nodes.append(terminal.save_part(rig,neck,'rising-cap-mounting-shafts',phase,
                    {'family':record['newFamilyPath'],'sha256':record['newFamilySha256']},
                    'FIXED_AXIS_STEEL_SHAFTS_CONNECT_TRANSLATING_CAPS_TO_ROOF_MOUNTS'))
            nodes.append(retained(rig,full,rear_cap,'rear-rising-cap',phase,dy=drop))
            nodes.append(retained(rig,full,front_cap,'foreground-rising-cap',phase,dy=drop))
            if phase>=21:
                nodes.append(retained(rig,full,rear_small&~rear_cap,'rear-inner-cylinder',phase))
                nodes.append(retained(rig,full,front_small&~front_cap,'foreground-inner-cylinder',phase))
        if phase>=18:
            drop={18:66,19:44,20:22,21:0,22:0,23:0}[phase]
            # Keep all six ball heads and their complete hidden shaft sections.
            rods=(yy<76)&(xx>171)&(xx<207)
            # All six ball tips belong to the antenna bank, including tips
            # adjacent to the small cap footprint; do not erase those tips.
            tip_mask=np.zeros(full.shape[:2],bool)
            for cx,cy,radius in [(199.5,6.2,2.4),(178.75,18.6,2.3),(194.1,31.2,1.8),
                                 (183.9,44.6,1.8),(205,49.2,1.8),(173.9,54.7,1.8)]:
                tip_mask|=((xx-cx)**2+(yy-cy)**2<=radius**2)
            rods=(rods&~rear_small&~front_small)|tip_mask
            paint=full[...,:3].astype(float)
            coils=(paint[...,0]-np.maximum(paint[...,1],paint[...,2])>45)&(yy<87)&(xx>171)&(xx<207)
            rods&=~coils
            bank=terminal.masked(full,rods)
            for cx,top,bottom in [(199.5,7.8,100),(178.75,20,98),(194.125,32.3,99),
                                   (183.875,45.5,96),(205,50.3,95),(173.875,55.5,91)]:
                shaft=(abs(xx-cx)<.55)&(yy>=top)&(yy<bottom)
                # One physical cylindrical shaft has an invariant axial finish.
                stripe=full[int(top*4):int(top*4)+4,int(cx*4)-2:int(cx*4)+3,:3].mean(axis=0)
                column=np.clip(((xx-cx+.55)*4).astype(int),0,4)
                bank[...,:3][shaft]=stripe[column][shaft].astype(np.uint8)
                bank[...,3][shaft]=255
            layer=terminal.move(bank,dy=drop)
            layer[yy>=99]=0
            if layer[...,3].any():
                nodes.append(terminal.save_part(rig,layer,'rising-antenna-bank',phase,
                    {'family':record['newFamilyPath'],'sha256':record['newFamilySha256']},
                    'RIGID_ANTENNA_TRANSLATION_WITH_BASE_OCCLUSION',nativeTranslation=[0,drop]))
            if phase>=22:
                reveal=coils&(yy>=({22:70,23:0}[phase]))
                if reveal.any():nodes.append(retained(rig,full,reveal,'forming-antenna-coils',phase))
        if record['theater']=='SNOW' and phase>=20:
            nodes.append(retained(rig,full,yy>=166,'retained-snow-lower-architecture',phase))
        if phase==23:
            nodes=[retained(rig,full,np.ones(full.shape[:2],bool),
                           'completed-retained-architecture',phase)]
        phases.append(nodes)
    marker=output/'24-retained-idle-marker.png';Image.new('RGBA',(4,4)).save(marker)
    x,y=rig.logical[-1]['trimOrigin']
    phases.append([{'name':'retained-idle-completion-marker','image':str(marker),
                   'sha256':sha(marker),'box':[x,y,x+1,y+1]}])
    result=rig.finish(phases)
    result.update(newConstructionArt=True,foundationSource=None,foundationStableFrom=13,
        retainedIdleCompletion={'frame':24,'reference':{'nativeReport':str(reference), 'sha256':sha(reference)}},
        neutralMaterialProvenance='AUTHORED_COMPONENTS_AND_RETAINED_HD_RGB_NO_NATIVE_COLOR',
        architecturalMethod='SEPARATE_MAST_FOLDING_ROOFS_FIXED_STEMS_AND_RISING_CAPS',
        visualAcceptance='PENDING')
    for phase,nodes in enumerate(phases):
        canvas=np.zeros((rig.canvas[1]*4,rig.canvas[0]*4,4),np.uint8)
        for node in nodes:canvas=over(place(Image.open(node['image']),node['box'],rig.canvas),canvas)
        Image.fromarray(canvas).save(output/f'{phase:02}-preview.png')
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('authoring',type=Path);parser.add_argument('assets',type=Path)
    parser.add_argument('reference',type=Path);parser.add_argument('output',type=Path)
    parser.add_argument('--key',default='gatech-temperate')
    parser.add_argument('--counterpart-rigs',type=Path)
    args=parser.parse_args();args.output.mkdir(exist_ok=False)
    authority=read(args.authoring)
    record=next(f for f in authority['families'] if f['key']==args.key)
    counterpart=None
    if args.counterpart_rigs:
        assert args.key=='gatech-snow'
        counterpart=read(args.counterpart_rigs)['gatech-temperate']
        donor=next(f for f in authority['families'] if f['key']=='gatech-temperate')
        source=read(record['nativeSource']);donor_source=read(donor['nativeSource'])
        for phase in range(20):
            indices=native_indices(source,phase);other=native_indices(donor_source,phase)
            assert np.array_equal(indices,other)
            used=np.unique(indices[indices>0])
            assert np.array_equal(np.asarray(record['palette'])[used],np.asarray(donor['palette'])[used])
    result=author(record,args.assets,args.reference,args.output/record['key'],counterpart)
    if counterpart:
        result['exactCounterpartReuse']={'keys':['gatech-temperate'],'phases':list(range(20)),
            'rigs':str(args.counterpart_rigs),'sha256':sha(args.counterpart_rigs),
            'proof':'EXACT_NATIVE_INDICES_AND_ALL_VISIBLE_PALETTE_RGB'}
    write(args.output/'rigs.json',{record['key']:result})
    print('Unselected Battle Lab component candidate authored')


if __name__=='__main__':main()
