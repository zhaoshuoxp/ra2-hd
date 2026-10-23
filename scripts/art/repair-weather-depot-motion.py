"""Repair radial satellite deployment and complete depot pivoted support poses."""
import argparse
import copy
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_dilation, distance_transform_edt

from buildup import read, sha, write
from painted_rig import bounds, over, place, project_rgba
from retained_idle import display

author = SourceFileLoader('weather_author', 'scripts/art/author-weather-depot.py').load_module()
terminal, parts, helpers = author.terminal, author.parts, author.helpers


def seed(record, output):
    return helpers.Rig(record, output), copy.deepcopy(record['componentRig']['phases'])


def save(rig, layer, name, phase, source, method, **details):
    # Whole opaque components must fit the logical envelope. Clamp only the
    # interpolation fringe after checking, never solve registration by slicing.
    frame = rig.logical[phase]
    x,y = frame['trimOrigin']; w,h = frame['trimSize']
    outside = layer[...,3].copy(); outside[y*4:(y+h)*4,x*4:(x+w)*4] = 0
    assert not (outside >= 8).any(), (rig.record['key'],phase,name,bounds(outside >= 8))
    return parts.node(rig, layer, name, phase, source, method, **details)


def satellite_foot(full,index):
    specifications=[(42.,99.,16.5,8.25,3.,(28,95,33,99),(27,99,31,107)),
        (111.,102.5,17.5,8.,3.,(120,98,125,102),(125,103,128,111)),
        (42.5,139.,21.5,7.,3.,(28,133,33,137),(35,140,41,147)),
        (110.,139.,21.5,7.,3.,(120,133,125,137),(110,140,116,147))]
    cx,cy,rx,ry,depth,top_box,side_box=specifications[index]
    def sample(box):
        x0,y0,x1,y1=box
        return full[y0*4:y1*4,x0*4:x1*4,:3].copy()
    top,side=sample(top_box),sample(side_box)
    y,x=np.mgrid[:full.shape[0],:full.shape[1]]/4
    t=np.clip((x-cx)/rx,-1,1)
    rim=cy+ry*np.sqrt(1-t*t)
    vertical=np.clip((y-rim)/depth,0,.99999)
    result=np.zeros_like(full)
    # Continue the retained metal's broad lighting across newly exposed faces.
    # Repeating a tiny donor patch creates false teeth around a smooth collar.
    side_color=np.median(side,axis=(0,1))
    illumination=.72+.23*(t+1)/2+.14*np.exp(-((vertical-.18)/.1)**2)
    result[...,:3]=np.clip(side_color*illumination[...,None],0,255).astype(np.uint8)
    def matte(shape):
        mask=Image.new('L',(full.shape[1]*4,full.shape[0]*4));draw=ImageDraw.Draw(mask)
        if shape=='top':
            draw.ellipse(((cx-rx)*16,(cy-ry)*16,(cx+rx)*16,(cy+ry)*16),fill=255)
            draw.ellipse(((cx-rx+2)*16,(cy-ry+1.2)*16,(cx+rx-2)*16,(cy+ry-1.2)*16),fill=0)
        else:
            points=[((cx+rx*np.cos(a))*16,(cy+ry*np.sin(a))*16) for a in np.linspace(0,np.pi,161)]
            points +=[(px,py+depth*16) for px,py in points[::-1]]
            draw.polygon(points,fill=255)
        return np.array(mask.resize((full.shape[1],full.shape[0]),Image.Resampling.LANCZOS))
    result[...,3]=matte('side')
    upper=np.zeros_like(full)
    top_color=np.median(top,axis=(0,1))
    light=.9+.12*(1-t)/2+.05*np.cos((y-cy)/ry*np.pi)
    upper[...,:3]=np.clip(top_color*light[...,None],0,255).astype(np.uint8)
    upper[...,3]=matte('top')
    return over(upper,result)


def weather(record, assets, previous_assets, output):
    rig, phases = seed(record, output)
    full = display(record); yy,xx = np.mgrid[:full.shape[0],:full.shape[1]]/4
    source_file = previous_assets/'weather-components-v1.png'
    core = author.atlas(source_file,(3,2))[3][0]
    polygons = [
        [(26,96),(28,87),(34,84),(35,78),(43,71),(53,72),(58,82),(58,88),(63,91),(63,108),(53,111),(37,110),(26,104)],
        [(94,91),(95,76),(112,75),(123,84),(130,99),(129,111),(114,114),(99,110)],
        [(23,116),(35,106),(46,106),(58,117),(63,137),(57,146),(21,147)],
        [(94,109),(106,105),(120,113),(128,130),(132,147),(94,149),(91,129)]]
    starts=[9,11,13,14]; closes=[17,18,21,20]
    offsets=[{9:(19,18),10:(14,12),11:(5,4)},
        {11:(-20,12),12:(-11,7),13:(-4,3)},
        {13:(35,-11),14:(26,-8),15:(16,-5),16:(8,-2),17:(4.5,0)},
        {14:(-25,-9),15:(-16,-6),16:(-8,-3)}]
    checks=[]
    feet=[satellite_foot(full,i) for i in range(4)]
    for phase in range(9,18):
        old=phases[phase]
        nodes=[copy.deepcopy(n) for n in old if not n['name'].startswith('satellite-')]
        satellites=[]
        for i,(polygon,start,done) in enumerate(zip(polygons,starts,closes)):
            if phase<start: continue
            # Restore the complete retained component before moving it. The
            # predecessor's already clipped edge is not a valid moving donor.
            body=terminal.masked(full,terminal.polygon(full.shape,polygon))
            if phase<done:
                b=bounds(body[...,3]>=128)
                blue=(body[...,2]>body[...,0]*1.08)&(yy<b[1]/4+22)
                yellow=place(core,(b[0]/4+5,b[1]/4,b[2]/4-4,min(b[3]/4,b[1]/4+24)),rig.canvas)
                center=(b[0]+b[2])/8
                opening=blue&(abs(xx-center)<(b[2]-b[0])/8*(done-phase)/(done-start))
                body=over(terminal.masked(yellow,opening),terminal.masked(body,~opening))
            dx,dy=offsets[i].get(phase,(0,0))
            rise=0
            if i<2:
                keep=((yy<101)|(xx>=52)) if i==0 else ((yy<104)|(xx<=103))
                body=over(terminal.masked(body,keep),feet[i])
            else:
                rise=({13:26,14:18,15:10,16:4,17:1} if i==2 else {14:16,15:9,16:3}).get(phase,0)
                collar=135 if i==2 else 137
                head=terminal.move(terminal.masked(body,yy<collar),dy=rise)
                # The complete top emerges through its own support collar.
                # Lower head pixels are hidden inside that physical socket.
                head=terminal.masked(head,yy<collar)
                foot=terminal.masked(body,yy>=collar)
                body=over(head,foot)
            moved=terminal.move(body,dx=dx,dy=dy)
            node=save(rig,moved,f'satellite-{i}',phase,
                {'family':record['newFamilyPath'],'sha256':record['newFamilySha256'],
                 'exposedCore':str(source_file),'exposedCoreSha256':sha(source_file)},
                'COMPLETE_ASSEMBLY_RADIAL_TRANSLATION_BEHIND_CENTRAL_MAST',
                nativeTranslation=[dx,dy],fixedScale=1.,closed=phase>=done,
                headEmergenceDrop=rise,physicalCollarOcclusion=i>=2,
                completeSourceSha256=sha(previous_assets/f"{record['key']}-idle.png"))
            satellites.append(node)
            checks.append({'phase':phase,'satellite':i,'translation':[dx,dy],
                'alphaPixels':int((moved[...,3]>=128).sum()),'opaquePixelsClipped':0})
        # Central supports occlude the emerging assemblies; once pushed out,
        # their complete feet and globes are clear of the mast automatically.
        insertion=next(j for j,n in enumerate(nodes) if n['name']=='telescoping-mast-and-fixed-feet')
        nodes[insertion:insertion]=satellites
        phases[phase]=nodes
    result=rig.finish(phases)
    result['radialDeployment']={'method':'ORIGINAL_RADIAL_OFFSETS_COMPLETE_PARTS_FIXED_CAMERA',
        'sourceAuthority':record['newFamilySha256'],'parts':checks,'visualAcceptance':'PENDING'}
    return result


def surface_texture(image, quad, size):
    rgba=np.array(image.convert('RGBa').transform(size,Image.Transform.QUAD,
        [v for point in quad for v in point],Image.Resampling.BICUBIC).convert('RGBA'))
    valid=rgba[...,3]>=230
    _,nearest=distance_transform_edt(~valid,return_indices=True)
    rgba[...,:3]=rgba[nearest[0],nearest[1],:3]
    rgba[...,3]=255
    return Image.fromarray(rgba)


def ground_clip(points):
    result=[]
    for a,b in zip(points,np.roll(points,-1,axis=0)):
        if a[2]>=0: result.append(a)
        if (a[2]>=0)!=(b[2]>=0):
            result.append(a+(b-a)*(-a[2]/(b[2]-a[2])))
    return np.array(result)


def project_world(points):
    points=np.asarray(points)
    return np.column_stack((82.5-points[:,0]+points[:,1],
        104+.5*(points[:,0]+points[:,1])-points[:,2]))


def support_mesh(rig, textures, phase):
    angles={7:0,8:15,9:30,10:45,11:60,12:68.5,13:71,14:72,15:74,16:80,17:90}
    angle=np.deg2rad(angles[min(phase,17)])
    s,c=np.sin(angle),np.cos(angle)
    rotation=np.array([[s,0,c],[0,1,0],[-c,0,s]])
    origin=np.array([0,0,17.])
    length,width,root_thickness,tip_thickness=56.,20.,9.,3.
    def world(points):return np.asarray(points)@rotation.T+origin
    top=[[0,-10,0],[56,-10,0],[56,10,0],[0,10,0]]
    side=[[0,10,0],[56,10,0],[56,10,-3],[0,10,-9]]
    front=[[56,-10,0],[56,10,0],[56,10,-3],[56,-10,-3]]
    root=[[0,10,0],[0,-10,0],[0,-10,-9],[0,10,-9]]
    faces=[('top',top,[[0,-10,0],[0,10,0],[56,-10,0]],[[0,0],[256,0],[0,768]],[0,0,1]),
        ('side',side,[[0,10,0],[0,10,-9],[56,10,0]],[[0,0],[128,0],[0,768]],[0,1,0]),
        ('front',front,[[56,-10,0],[56,10,0],[56,-10,-3]],[[0,0],[256,0],[0,96]],[1,0,0]),
        ('front',root,[[0,-10,0],[0,10,0],[0,-10,-9]],[[0,0],[256,0],[0,96]],[-1,0,0])]
    if phase>=17:
        h=2. if phase==17 else 4.
        faces.extend([
            ('top',[[10,-4,h],[43,-4,h],[43,4,h],[10,4,h]],
             [[10,-4,h],[10,4,h],[43,-4,h]],[[0,0],[256,0],[0,768]],[0,0,1]),
            ('side',[[10,4,h],[43,4,h],[43,4,0],[10,4,0]],
             [[10,4,h],[10,4,0],[43,4,h]],[[0,0],[128,0],[0,768]],[0,1,0]),
            ('front',[[43,-4,h],[43,4,h],[43,4,0],[43,-4,0]],
             [[43,-4,h],[43,4,h],[43,-4,0]],[[0,0],[256,0],[0,96]],[1,0,0])])
    visible=[]
    for name,vertices,basis,uv,normal in faces:
        if np.dot(rotation@normal,[1,1,1])<=0:continue
        clipped=ground_clip(world(vertices))
        if len(clipped)<3:continue
        projected=project_world(clipped)
        texture=textures[name]
        source=np.column_stack((np.array(uv),np.ones(3)))
        matrix=np.linalg.solve(source,project_world(world(basis))).T
        if abs(np.linalg.det(matrix[:,:2]))<1e-12:continue
        painted=project_rgba(texture,matrix.tolist(),rig.canvas)
        matte=Image.new('L',(rig.canvas[0]*16,rig.canvas[1]*16))
        ImageDraw.Draw(matte).polygon([tuple(p*16) for p in projected],fill=255)
        alpha=np.array(matte.resize((rig.canvas[0]*4,rig.canvas[1]*4),Image.Resampling.LANCZOS))
        painted[...,3]=np.minimum(painted[...,3],alpha)
        painted[painted[...,3]==0]=0
        visible.append((clipped.sum(axis=1).mean(),painted))
    canvas=np.zeros((rig.canvas[1]*4,rig.canvas[0]*4,4),np.uint8)
    for _,layer in sorted(visible,key=lambda item:item[0]):canvas=over(layer,canvas)
    vertices=[[u,v,z] for u,t in [(0,-root_thickness),(length,-tip_thickness)]
        for v in [-width/2,width/2] for z in [0,t]]
    return canvas,{'angleDegrees':float(np.rad2deg(angle)),'length':length,'width':width,
        'rootThickness':root_thickness,'tipThickness':tip_thickness,'hingeScreen':[82.5,87.],
        'worldHinge':[0,0,17.],'worldVertices':world(vertices).tolist(),
        'groundClipPlane':'WORLD_Z_EQUALS_ZERO','opaquePixelsClipped':0}


def depot_physical(record,assets,previous_assets,output):
    rig,phases=seed(record,output)
    full=display(record);yy,xx=np.mgrid[:full.shape[0],:full.shape[1]]/4
    file=assets/'depot-early-base-v2.png';sheet=Image.open(file)
    textures={
        'top':surface_texture(sheet,[(608,1001),(452,1115),(532,1146),(689,1026)],(256,768)),
        'side':surface_texture(sheet,[(689,1026),(532,1146),(531,1163),(689,1045)],(128,768)),
        'front':surface_texture(sheet,[(452,1115),(450,1130),(531,1163),(532,1146)],(256,96))}
    for name,image in textures.items():image.save(output/f'body-{name}-uv.png')
    late_files=[assets/'depot-late-base-v2.png',assets/'depot-late-base-v1.png']
    late=[]
    for path in late_files:
        rgba=np.array(Image.open(path).convert('RGBA'))
        rgba[~binary_dilation(rgba[...,3]>=230,iterations=2)]=0
        late.append(rgba)
    nose_config={
        16:(0,[(14,360),(88,330),(171,362),(130,425),(14,390)],[168,367],.21),
        17:(0,[(519,360),(595,330),(681,362),(639,425),(519,390)],[680,367],.22),
        18:(0,[(1007,365),(1090,337),(1192,376),(1143,447),(1007,415)],[1184,374],.21),
        19:(1,[(17,795),(84,740),(176,772),(194,812),(158,899),(17,867)],[185,813],.22),
        20:(1,[(510,790),(568,720),(642,728),(702,794),(690,850),(646,902),(526,872)],[683,813],.22)}
    removed={'telescoping-complete-support','fixed-plinth-neck','fixed-hinge-turntable',
        'fixed-pipes-and-rear-attachments','installing-front-shell'}
    upright=next(n for n in phases[15] if n['name']=='hinged-orange-linkage')
    arm_file=previous_assets/'depot-arm-native-poses-v2.png';arm_poses=author.atlas(arm_file,(3,2))
    arm_config=read(previous_assets/'depot-arm-registration-v2.json')
    old_table=copy.deepcopy(next(n for n in phases[12] if n['name']=='fixed-hinge-turntable'))
    old_table['box']=[v+(3 if i%2==0 else .75) for i,v in enumerate(old_table['box'])]
    checks=[]
    for phase in range(7,22):
        nodes=[copy.deepcopy(n) for n in phases[phase] if n['name'] not in removed]
        arm_index=next(i for i,n in enumerate(nodes) if n['name']=='hinged-orange-linkage')
        layer,geometry=support_mesh(rig,textures,phase)
        if phase>=17:layer[...,3]=np.minimum(layer[...,3],full[...,3])
        body=save(rig,layer,'ground-emerging-hinged-support',phase,
            {'image':str(file),'sha256':sha(file)},'RIGID_3D_WEDGE_ROTATES_ABOUT_FIXED_CROSS_AXIS',**geometry)
        additional=[]
        if phase>=16:
            poly=[(90,65),(111,65),(126,77),(126,93),(111,94),(91,85)]
            material=terminal.masked(full,terminal.polygon(full.shape,poly))
            additional.append(save(rig,material,'complete-rear-port-assembly',phase,author.retained(record),
                'WHOLE_RETAINED_ATTACHMENT_NO_INTERSECTING_COMPONENT_SLICES'))
        nodes[arm_index:arm_index]=additional+[body,copy.deepcopy(old_table)]
        if phase>=17:
            polygon=[(74,88),(82,90),(82,98),(51,114),(43,116),(39,109),(40,102)]
            material=terminal.masked(full,terminal.polygon(full.shape,polygon))
            nodes.insert(next(i for i,n in enumerate(nodes) if n['name']=='hinged-orange-linkage'),
                save(rig,material,'complete-retained-hydraulic-unit',phase,
                    author.retained(record),'RETAINED_HD_FINISHING_DETAILS_NATIVE_RAIL_STAGE'))
        if phase<=15 or phase==17:
            pose=0 if phase<=15 else 1;image,_=arm_poses[pose];config=arm_config[str(pose)]
            scale=upright['rigidPart']['scale'] if pose==0 else next(n for n in phases[16]
                if n['name']=='hinged-orange-linkage')['rigidPart']['scale']
            extra=-.25 if phase==17 else 0
            angle=config['angleRadians']+extra
            matrix=np.array([[np.cos(angle),-np.sin(angle)],[np.sin(angle),np.cos(angle)]])*scale
            pivot=np.array([82.5,74.]);translation=pivot-matrix@np.array(config['anchor'])
            arm=project_rgba(image,np.column_stack((matrix,translation)).tolist(),rig.canvas)
            drop=max(0,rig.logical[phase]['trimOrigin'][1]-15) if phase<12 else 0
            if drop:arm=terminal.masked(terminal.move(arm,dy=drop),yy<=85)
            replacement=save(rig,arm,'hinged-orange-linkage',phase,
                {'image':str(arm_file),'sha256':sha(arm_file)},
                'FIXED_HINGE_SHARED_UPRIGHT_GEOMETRY_NO_BOUNDS_FIT',hinge=pivot.tolist(),
                scale=scale,pose=pose,additionalRotationRadians=extra,nativeEmergenceDrop=drop)
            nodes=[replacement if n['name']=='hinged-orange-linkage' else n for n in nodes]
        if phase in nose_config:
            which,poly,anchor,scale=nose_config[phase]
            src=terminal.masked(late[which],terminal.polygon(late[which].shape,
                [(x/4,y/4) for x,y in poly]))
            b=bounds(src[...,3]>=128);x0,y0,x1,y1=b
            image=Image.fromarray(src[y0:y1,x0:x1]);anchor=np.array(anchor)-[x0,y0]
            translation=np.array([42.5,110.])-anchor*scale
            layer=project_rgba(image,[[scale,0,translation[0]],[0,scale,translation[1]]],rig.canvas)
            nodes.append(save(rig,layer,'hinged-front-nose',phase,
                {'image':str(late_files[which]),'sha256':sha(late_files[which])},
                'INDEPENDENT_ORIGINAL_FRONT_COVER_ROTATION_POSE',hinge=[42.5,110.],pose=phase))
        elif phase==21:
            poly=[(7,99),(18,89),(26,84),(35,86),(40,96),(35,112),(26,124),(7,125)]
            layer=terminal.masked(full,terminal.polygon(full.shape,poly))
            orange=(layer[...,0]>layer[...,1]*1.1)&(layer[...,1]>layer[...,2]*1.4)&(layer[...,1]>60)
            layer[orange]=0
            nodes.append(save(rig,layer,'hinged-front-nose',phase,author.retained(record),
                'EXACT_RETAINED_DEPLOYED_FRONT_COVER',hinge=[42.5,110.],pose=phase))
        phases[phase]=nodes;checks.append({'phase':phase,**geometry})
    result=rig.finish(phases)
    result['pivotedSupportRepair']={'method':'RIGID_3D_HINGE_ORIGINAL_GROUND_EMERGENCE',
        'geometry':checks,'visualAcceptance':'PENDING'}
    return result


def previews(record,rig,output):
    canvas=read(record['nativeSource'])['canvas']
    for phase,nodes in enumerate(rig['phases']):
        if isinstance(nodes,dict): nodes=record['componentRig']['phases'][phase]
        image=np.zeros((canvas[1]*4,canvas[0]*4,4),np.uint8)
        for part in nodes:
            image=over(place(Image.open(part['image']),part['box'],canvas),image)
        Image.fromarray(image).save(output/f'{phase:02}-preview.png')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ['authoring','assets','previous_assets','output']:
        parser.add_argument(name,type=Path)
    args=parser.parse_args();args.output.mkdir(exist_ok=False)
    rigs={}
    for record in read(args.authoring)['families']:
        if record['identity'] not in ('GAWEAT','GADEPT'):continue
        repair=weather if record['identity']=='GAWEAT' else depot_physical
        rigs[record['key']]=repair(record,args.assets,args.previous_assets,args.output/record['key'])
        previews(record,rigs[record['key']],args.output/record['key'])
    write(args.output/'rigs.json',rigs)
    print('Four unselected radial / pivoted-mechanism repairs authored')


if __name__=='__main__':main()
