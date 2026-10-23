"""Correct five V17 construction mechanisms while retaining unaffected nodes."""
import argparse
import copy
import inspect
import shutil
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_dilation, distance_transform_edt, label

from buildup import native_indices, read, sha, write
from painted_rig import bounds, over, place

base = SourceFileLoader('infrastructure_v17', 'scripts/art/author-infrastructure.py').load_module()
terminal = base.terminal
mask, neutral, hinged = base.mask, base.neutral, base.hinged
SOURCE = None
SURFACES = None


def source_layer(s, phase, name):
    n = next(n for n in s.record['componentRig']['phases'][phase] if n['name'] == name)
    return place(Image.open(n['image']), n['box'], s.rig.canvas)


def emit(s, nodes, layer, name, phase, method, **details):
    s.emit(nodes, layer, name, phase, method, source=SOURCE, **details)


def rise(s, layer, drop, ground=None):
    """Rigid vertical motion through a fixed per-column ground socket."""
    if ground is None:
        support = layer[..., 3] >= 8
        line = np.where(support, s.yy, -1).max(axis=0)
        ground = line[None, :] + .25
    return terminal.masked(terminal.move(layer, dy=drop), s.yy <= ground)


def original_neutral_top(s, phase, box, fallback):
    x0, y0, x1, y1 = box
    indices = native_indices(s.rig.raw, phase)
    colors = np.asarray(s.record['palette'], float)[indices]
    region = (indices > 0) & (colors.min(axis=-1) > 100)
    region &= colors.max(axis=-1) < colors.min(axis=-1)*1.35
    selected = np.zeros_like(region); selected[y0:y1, x0:x1] = region[y0:y1, x0:x1]
    ids,count=label(selected)
    tops=[]
    for index in range(1,count+1):
        support=ids==index
        if support.sum()>=40:tops.append(bounds(support)[1])
    return min(tops) if tops else fallback


def allied_refinery(s):
    chamber = source_layer(s, 20, 'front-chimney-chamber')
    stack=mask(s.structure,[(69,78),(91,78),(92,107),(96,122),(84,126),(67,120),(71,104)])
    loading = source_layer(s, 10, 'loading-rollers-and-hopper')
    hardware_region=terminal.polygon(loading.shape,[(144,156),(163,145),(185,148),(200,160),
        (198,170),(192,178),(178,185),(163,183),(157,174),(144,172)])
    stationary_loading=terminal.masked(loading,~hardware_region)
    loading=terminal.masked(loading,hardware_region)
    replace = {'loading-rollers-and-hopper', 'front-chimney-chamber', 'front-chimney-stack'}
    for p, old in enumerate(s.record['componentRig']['phases']):
        if p == s.record['frames']-1:
            s.phases.append(copy.deepcopy(old)); continue
        nodes = [copy.deepcopy(n) for n in old if n['name'] not in replace]
        if p >= 6:
            emit(s,nodes,stationary_loading,'fixed-loading-forecourt',p,'STATIONARY_FLOOR_SEPARATE_FROM_MOVING_LOADING_HARDWARE')
        if p >= 7:
            drop = {7:12, 8:7, 9:3}.get(p, 0)
            emit(s, nodes, rise(s, loading, drop, ground=191.75), 'vertical-loading-assembly', p,
                 'COMPLETE_LOADING_HARDWARE_RISES_ABOVE_FIXED_FLOOR_WITH_MOVING_FRONT_EDGE', translation=[0, drop])
        if p >= 16:
            top=original_neutral_top(s,p,(59,70,80,146),115)
            drop=max(0,top-115) if p<20 else 0
            emit(s, nodes, rise(s, chamber, drop), 'vertical-front-chimney-chamber', p,
                 'COMPLETE_CHIMNEY_CHAMBER_EMERGES_FROM_FIXED_CIRCULAR_SOCKET', translation=[0, drop])
        if p >= 20:
            top = original_neutral_top(s, p, (59, 70, 80, 146), 78)
            drop = max(0, top-78)
            emit(s, nodes, rise(s, stack, drop, ground=124), 'vertical-front-chimney-stack', p,
                 'COMPLETE_FIXED_SCALE_STACK_RISES_AFTER_CHAMBER', translation=[0, drop], originalTop=top)
        s.phases.append(nodes)
    return s.finish()


def naval_yard(s):
    # This front pylon is fully visible in the actual retained completed composite.
    pylon = mask(s.full, [(146,157),(150,152),(157,148),(169,147),(180,149),(185,154),(187,160),
        (184,168),(183,195),(188,200),(193,209),(195,218),(191,232),(182,243),
        (164,246),(149,238),(140,226),(141,215),(147,204),(151,195)])
    upper = terminal.masked(pylon, s.yy < 207)
    foot = terminal.masked(pylon, s.yy >= 199)
    names = {'telescoping-pylon-2', 'fixed-waterline-foot-2'}
    for p, old in enumerate(s.record['componentRig']['phases']):
        if p == s.record['frames']-1:
            s.phases.append(copy.deepcopy(old)); continue
        nodes = []
        for n in old:
            if n['name'] in names:
                if p < 13 and n['name'] == 'fixed-waterline-foot-2':
                    s.emit(nodes, foot, 'actual-left-waterline-foot', p,
                           'EXACT_RETAINED_COMPLETE_LEFT_WATERLINE', ground=p<13)
                if p < 13 and n['name'] == 'telescoping-pylon-2':
                    drop = {0:31, 1:22, 2:12, 3:4}.get(p, 0)
                    layer = terminal.masked(terminal.move(upper, dy=drop), s.yy < 207)
                    s.emit(nodes, layer, 'actual-left-rising-pylon', p,
                           'EXACT_RETAINED_COMPLETE_LEFT_PYLON_FIXED_REGISTRATION', translation=[0, drop])
            else:
                nodes.append(copy.deepcopy(n))
        s.phases.append(nodes)
    return s.finish()


def wall_hinge(layer, degrees, pivot, axis, outward, canvas):
    """Rotate a wall about its ground edge in an isometric vertical plane."""
    axis=np.asarray(axis,float);axis/=np.linalg.norm(axis)
    vertical=np.array([0.,-1.]);angle=np.deg2rad(degrees)
    turned=vertical*np.cos(angle)+np.asarray(outward)*np.sin(angle)
    matrix=np.column_stack((axis,turned))@np.linalg.inv(np.column_stack((axis,vertical)))
    pivot=np.asarray(pivot,float)
    return base.transform(layer,np.column_stack((matrix,pivot-matrix@pivot)),canvas)


def barracks(s):
    full, yy = s.full, s.yy
    statue = mask(full, [(103,4),(142,4),(143,87),(137,96),(140,99),(136,101),
        (129,99),(127,97),(125,100),(125,104),(121,106),(118,104),(119,96),
        (117,88),(112,81),(112,61),(103,51)])
    gap = terminal.polygon(full.shape, [(123,85),(128,88),(130,95),(127,98),(124,98)])
    red = (statue[...,0] > statue[...,1]*2.) & (statue[...,0] > statue[...,2]*2.)
    statue = terminal.masked(statue, ~gap & ~red)
    slab=mask(full,[(104,99),(119,94),(126,99),(140,96),(150,103),(147,114),(132,122),(104,114),(99,108)])
    slab=terminal.masked(slab,statue[...,3]==0)
    hidden=place(SURFACES[1],(99,94,151,123),s.rig.canvas)
    hidden=terminal.masked(hidden,(statue[...,3]>0)&(yy>=94)&(yy<123))
    plate=over(slab,hidden)
    plate_source = {'image':str(SURFACES_FILE), 'sha256':sha(SURFACES_FILE)}
    closed = source_layer(s, 22, 'deployed-barracks-walls')
    # Separate wall cards rotate around their own ground-level hinges.
    panels = [
        (s.fitted(5,(98,111,123,145)), (110,142), (2.,1.)),
        (s.fitted(5,(129,109,153,145)), (141,142), (-2.,1.)),
        (mask(neutral(full),[(100,114),(125,122),(117,153),(92,145)]), (105,150), (2.,1.)),
        (mask(neutral(full),[(128,122),(148,112),(163,143),(144,154)]), (153,149), (-2.,1.))]
    for p, old in enumerate(s.record['componentRig']['phases']):
        if p == s.record['frames']-1:
            s.phases.append(copy.deepcopy(old)); continue
        nodes = [copy.deepcopy(n) for n in old if n['name']=='fixed-barracks-slab']
        if p >= 4:
            opening = {4:72,5:62,6:54}.get(p, 54) if p < 16 else {16:46,17:37,18:27,19:17,20:7}.get(p,0)
            # Rear walls and the open dark well sit behind the statue.
            well = Image.new('RGBA',(s.rig.canvas[0]*4,s.rig.canvas[1]*4));d=ImageDraw.Draw(well)
            d.polygon([(x*4,y*4) for x,y in [(106,140),(125,130),(145,140),(125,150)]],fill=(28,27,26,255))
            emit(s,nodes,np.array(well),'open-statue-well',p,'HOLLOW_BASE_INTERIOR_BEHIND_EMERGING_STATUE')
            if p < 21:
                for i in range(2):
                    panel,pivot,axis=panels[i]
                    layer=wall_hinge(panel,opening,pivot,axis,[(.5,-.25),(-.5,-.25),(-.5,.25),(.5,.25)][i],s.rig.canvas)
                    emit(s,nodes,layer,'rear-opening-wall-'+str(i),p,'COMPLETE_WALL_HELD_OPEN_THEN_CLOSED',angleDegrees=opening,hinge=list(pivot))
            if p >= 21:
                s.emit(nodes,terminal.masked(closed,yy>=108),'closed-barracks-base',p,'EXACT_CLOSED_BASE_BEHIND_PLINTH_AND_STATUE')
            if p >= 16:
                drop=max(0,s.rig.logical[p]['trimOrigin'][1]-4)
                s.emit(nodes,terminal.move(plate,dy=drop),'empty-rising-statue-plinth',p,
                       'COMPLETE_EMPTY_PLINTH_WITHOUT_DUPLICATED_FEET',source=plate_source,translation=[0,drop])
            if p >= 7:
                drop=max(0,s.rig.logical[p]['trimOrigin'][1]-4)
                figure=terminal.masked(terminal.move(statue,dy=drop),yy<148)
                s.emit(nodes,figure,'statue-from-open-well',p,
                       'COMPLETE_STATUE_RISES_BEHIND_OPEN_BASE_FOREGROUND',translation=[0,drop])
            if p < 21:
                for i in range(2,4):
                    panel,pivot,axis=panels[i]
                    layer=wall_hinge(panel,opening,pivot,axis,[(.5,-.25),(-.5,-.25),(-.5,.25),(.5,.25)][i],s.rig.canvas)
                    emit(s,nodes,layer,'front-opening-wall-'+str(i),p,'FOREGROUND_WALL_OCCLUDES_WELL_THEN_CLOSES',angleDegrees=opening,hinge=list(pivot))
        s.phases.append(nodes)
    return s.finish()


def pipe_parts(s):
    routes=[([(56,122),(52,124),(50,129),(50,146)],5.5),
            ([(63,132),(60,135),(60,151)],4.8),
            ([(74,130),(73,134),(73,151)],4.8),
            ([(84,122),(88,125),(89,130),(89,147)],5.2),
            ([(112,94),(110,98),(110,119)],4.8),
            ([(138,98),(143,101),(143,120)],5.5),
            ([(44,110),(41,115),(41,136)],5.8)]
    parts=[];union=np.zeros(s.full.shape[:2],bool)
    for points,width in routes:
        image=Image.new('L',(s.rig.canvas[0]*4,s.rig.canvas[1]*4));d=ImageDraw.Draw(image)
        d.line([(x*4,y*4) for x,y in points],fill=255,width=round(width*4),joint='curve')
        x,y=points[-1];d.ellipse(((x-4)*4,(y-1)*4,(x+4)*4,(y+3)*4),fill=255)
        region=np.array(image)>0;union|=region
        parts.append(terminal.masked(s.structure,region))
    return parts,union,routes


def soviet_refinery(s):
    pieces,union,routes=pipe_parts(s)
    clean_fills=[s.fitted(1,(101,37,148,130)),s.fitted(1,(47,64,96,155))]
    connector=source_layer(s,12,'central-connecting-beam')
    for p,old in enumerate(s.record['componentRig']['phases']):
        if p==s.record['frames']-1:
            s.phases.append(copy.deepcopy(old));continue
        nodes=[]
        for n in old:
            name=n['name']
            if name in ['central-connecting-beam','late-independent-pipes']:continue
            if name.startswith('rising-reaction-chamber-'):
                i=int(name[-1]);drop=n['rigidPart']['verticalDrop']
                layer=place(Image.open(n['image']),n['box'],s.rig.canvas)
                remove=np.zeros_like(layer);remove[...,3]=union.astype(np.uint8)*255
                moved=terminal.move(remove,dy=drop)[...,3]>0
                fill=terminal.move(clean_fills[i],dy=drop)
                layer[moved]=fill[moved]
                limit=129 if i==0 else 151
                layer=terminal.masked(layer,s.yy<limit)
                emit(s,nodes,layer,'closed-chamber-before-pipes-'+str(i),p,
                     'CHAMBER_WALL_WITHOUT_PREMATURE_EXTERNAL_PIPES',verticalDrop=drop)
            elif name=='fixed-front-chamber-socket':
                layer=place(Image.open(n['image']),n['box'],s.rig.canvas)
                emit(s,nodes,terminal.masked(layer,~union),'bare-front-chamber-socket',p,'FIXED_SOCKET_WITHOUT_PREMATURE_PIPE_FEET')
            else:nodes.append(copy.deepcopy(n))
        if p>=5:
            drop={5:34,6:28,7:22,8:16,9:10,10:6,11:3}.get(p,0)
            emit(s,nodes,rise(s,connector,drop,ground=143),'vertical-red-connector',p,
                 'COMPLETE_RED_CONNECTOR_RISES_VERTICALLY_FROM_GROUND_SOCKET',translation=[0,drop])
        if p>=13:
            travel=max(0,22-p)*2.2
            angle={13:80,14:70,15:58,16:43,17:26,18:10}.get(p,0)
            for i,(piece,(points,_)) in enumerate(zip(pieces,routes)):
                pivot=np.asarray(points[-1],float);center=np.array([71,131] if i<4 or i==6 else [124,109])
                direction=pivot-center;direction/=np.linalg.norm(direction)
                offset=direction*travel*(.8 if i==6 else 1.)
                axis=(-direction[1],direction[0])
                layer=wall_hinge(piece,angle,pivot,axis,-direction*.45,s.rig.canvas)
                layer=terminal.move(layer,dx=offset[0],dy=offset[1])
                emit(s,nodes,layer,'converging-external-pipe-'+str(i),p,
                     'COMPLETE_PIPE_UNFOLDS_AND_TRANSLATES_RADIALLY_INWARD',translation=offset.tolist(),angleDegrees=angle,targetFoot=pivot.tolist())
        s.phases.append(nodes)
    return s.finish()


def dish_surface(s,p,front,back):
    """Ray trace one fixed-radius paraboloid while its physical axis turns."""
    radius=20.7;depth=5.;vertical_scale=1.25
    tilt_degrees={14:5,15:18,16:32,17:46,18:60,19:75,20:85,21:82,22:77,23:72,24:68,25:63,26:59,27:56,28:55}.get(p,0)
    azimuth_degrees={15:0,16:8,17:17,18:27,19:37,20:45,21:66,22:78,23:88,24:98,25:106,26:110,27:110,28:110}.get(p,0)
    tilt=np.deg2rad(tilt_degrees);azimuth=np.deg2rad(azimuth_degrees)
    ct,st=np.cos(tilt),np.sin(tilt);ca,sa=np.cos(azimuth),np.sin(azimuth)
    rotation=np.array([[ca,-sa,0],[sa,ca,0],[0,0,1]])@np.array([[1,0,0],[0,ct,-st],[0,st,ct]])
    normal_world=rotation@np.array([0.,0.,1.])
    normal_offset_y=(.5*(normal_world[0]+normal_world[1])-vertical_scale*normal_world[2])*10
    center=np.array([113.75+(normal_world[0]-normal_world[1])*10,103.-min(p,14)*3.7])
    x=s.xx-center[0];y=s.yy-center[1]
    origin=np.stack((y+x/2,y-x/2,np.zeros_like(x)),axis=-1)@rotation
    direction=np.array([1.,1.,1/vertical_scale])@rotation
    if p<21:
        cap_height=8.8
        weights=np.array([1/radius**2,1/radius**2,1/cap_height**2])
        a=np.sum(direction**2*weights)
        b=2*np.sum(origin*direction*weights,axis=-1)
        c=np.sum(origin**2*weights,axis=-1)-1
    else:
        a=depth/radius**2*(direction[0]**2+direction[1]**2)
        b=2*depth/radius**2*(origin[...,0]*direction[0]+origin[...,1]*direction[1])-direction[2]
        c=depth/radius**2*(origin[...,0]**2+origin[...,1]**2)-origin[...,2]
    disc=b*b-4*a*c;root=np.sqrt(np.maximum(disc,0));t1=(-b+root)/(2*a);t2=(-b-root)/(2*a)
    one=origin+t1[...,None]*direction;two=origin+t2[...,None]*direction
    valid1=(disc>=0)&(one[...,0]**2+one[...,1]**2<=radius**2)
    valid2=(disc>=0)&(two[...,0]**2+two[...,1]**2<=radius**2)
    if p<21:
        valid1&=one[...,2]>=0
        valid2&=two[...,2]>=0
    point=np.where(valid1[...,None],one,two)
    valid=valid1|valid2
    uv=(point[...,:2]/radius+1)/2
    forward=(rotation@np.array([0.,0.,1.])).sum()>0
    texture=front if p>=21 else back
    rgba=np.array(texture.convert('RGBA'))
    valid_texture=rgba[...,3]>=230
    if p<21:
        color=rgba[...,:3].astype(float)
        valid_texture&=color[...,0]<color[...,1]*1.4
    _,nearest=distance_transform_edt(~valid_texture,return_indices=True)
    rgba[...,:3]=rgba[nearest[0],nearest[1],:3]
    tx=np.clip(uv[...,0]*(rgba.shape[1]-1),0,rgba.shape[1]-1).astype(int);ty=np.clip(uv[...,1]*(rgba.shape[0]-1),0,rgba.shape[0]-1).astype(int)
    result=rgba[ty,tx].copy();result[...,3]=np.where(valid,255,0)
    normal=(point*np.array([1/radius**2,1/radius**2,1/8.8**2]))@rotation.T if p<21 else np.stack((-2*depth*point[...,0]/radius**2,-2*depth*point[...,1]/radius**2,np.ones_like(x)),axis=-1)@rotation.T
    illumination=.78+.23*np.abs(normal@np.array([-.3,-.4,.86]))/np.linalg.norm(normal,axis=-1)
    if p>=21:illumination=np.ones_like(illumination)
    result[...,:3]=np.clip(result[...,:3]*illumination[...,None],0,255).astype(np.uint8);result[~valid]=0
    bb=bounds(result[...,3]>=128)
    dy=s.rig.logical[p]['trimOrigin'][1]-bb[1]/4+.25
    result=terminal.move(result,dy=dy)
    return result,{'nativeVerticalRegistration':dy,'bearingOffsetY':normal_offset_y,'verticalCameraScale':vertical_scale,'radius':radius,'depth':depth,'tiltDegrees':float(np.rad2deg(tilt)),'azimuthDegrees':float(np.rad2deg(azimuth)),'center':center.tolist(),'rotation':rotation.tolist()}


def dish_hardware(s, phase, geometry):
    rotation=np.asarray(geometry['rotation'])
    center=np.asarray(geometry['center'])+[0,geometry['nativeVerticalRegistration']]
    def screen(point):
        x,y,z=rotation@np.asarray(point)
        return center+np.array([x-y,.5*(x+y)-1.25*z])
    image=Image.new('RGBA',(s.rig.canvas[0]*16,s.rig.canvas[1]*16));d=ImageDraw.Draw(image)
    if 24<=phase<27:
        opening={24:.25,25:.56,26:.86}[phase]
        hub=np.array([0.,0.,18.])
        for angle in [0,np.pi/2,np.pi,3*np.pi/2]:
            target=np.array([20.7*np.cos(angle),20.7*np.sin(angle),5.])
            vector=target-hub;length=np.linalg.norm(vector)
            start_direction=np.array([0.,0.,-1.]);target_direction=vector/length
            theta=np.arccos(np.clip(start_direction@target_direction,-1,1))
            direction=(np.sin((1-opening)*theta)*start_direction+np.sin(opening*theta)*target_direction)/np.sin(theta)
            a,b=screen(hub),screen(hub+direction*length)
            for width,color,dy in [(1.7,(48,51,54,255),0),(.75,(173,178,184,255),-.25)]:
                d.line([tuple((point+[0,dy])*16) for point in [a,b]],fill=color,width=round(width*16))
    if 17<=phase<27:
        point=screen([0,0,8.8 if phase<21 else 0. if phase<24 else 18.])
        radius=2.2 if phase<25 else {25:3.,26:4.3}[phase]
        for scale,color,offset in [(1.,(66,69,72,255),0),(.82,(158,161,164,255),-.3),(.4,(216,218,220,255),-.6)]:
            x,y=point+[0,offset];r=radius*scale
            d.ellipse(((x-r)*16,(y-r)*16,(x+r)*16,(y+r)*16),fill=color)
    return np.array(image.resize((s.rig.canvas[0]*4,s.rig.canvas[1]*4),Image.Resampling.LANCZOS))


def radar(s):
    empty=place(SURFACES[0],(91,1,151,65),s.rig.canvas)
    front_empty=base.retained_front_uv(empty)
    front_complete=base.retained_front_uv(s.full)
    back=Image.open(s.file).convert('RGBA').crop((1200,120,1370,280))
    replaced={'rotating-paraboloid-dish','telescoping-lattice-mast','complete-dish-bearing'}
    for p,old in enumerate(s.record['componentRig']['phases']):
        if p==s.record['frames']-1:
            s.phases.append(copy.deepcopy(old));continue
        nodes=[copy.deepcopy(n) for n in old if n['name'] not in replaced]
        dish,geometry=dish_surface(s,p,front_complete if p>=27 else front_empty,back)
        bb=bounds(dish[...,3]>=128)
        if p>=11:
            top=min(87.,bb[3]/4-6)
            shaft=np.zeros_like(s.full);patch=s.full[62*4:78*4,108*4:120*4]
            region=(s.xx>=108)&(s.xx<120)&(s.yy>=top)&(s.yy<88)
            sy=((88-s.yy)*4).astype(int)%patch.shape[0];sx=((s.xx-108)*4).astype(int)%patch.shape[1]
            shaft[region]=patch[sy[region],sx[region]]
            emit(s,nodes,shaft,'telescoping-lattice-mast',p,'FIXED_PITCH_MAST_EXTENDS_TO_DISH_UNDERSIDE',bearingY=top+2,baseY=88,bracePitch=16)
            start=np.array([114.,top+2]);mask_dish=dish[...,3]>=128
            _,nearest=distance_transform_edt(~mask_dish,return_indices=True)
            row,col=np.clip(np.round([top*4-4,114*4]).astype(int),0,[mask_dish.shape[0]-1,mask_dish.shape[1]-1])
            end=np.array([nearest[1,row,col],nearest[0,row,col]])/4
            joint=Image.new('RGBA',(s.rig.canvas[0]*16,s.rig.canvas[1]*16));d=ImageDraw.Draw(joint)
            for width,color,dy in [(4.5,(42,44,46,255),0),(2.7,(137,142,146,255),-.3),(1.,(200,205,210,255),-.6)]:
                d.line([tuple((point+[0,dy])*16) for point in [start,end]],fill=color,width=round(width*16))
            emit(s,nodes,np.array(joint.resize((s.rig.canvas[0]*4,s.rig.canvas[1]*4),Image.Resampling.LANCZOS)),
                 'complete-dish-bearing',p,'COMPLETE_BEARING_BETWEEN_MAST_AND_TURNING_DISH',mastEndpoint=start.tolist(),dishEndpoint=end.tolist())
        emit(s,nodes,dish,'rotating-paraboloid-dish',p,'ALL_ORIGINAL_TILT_YAW_AND_CONCAVE_FACE_STAGES',**geometry)
        hardware=dish_hardware(s,p,geometry)
        if hardware[...,3].any():
            emit(s,nodes,hardware,'deploying-feed-and-rigid-struts',p,'COMPLETE_FEED_AND_CONSTANT_LENGTH_STRUT_DEPLOYMENT',nativePhase=p)
        s.phases.append(nodes)
    return s.finish()


def intermediate_surfaces(file):
    rgba=np.array(Image.open(file).convert('RGBA'));ids,count=label(rgba[...,3]>=230)
    objects=[]
    for index in range(1,count+1):
        selected=ids==index
        if selected.sum()<5000:continue
        selected=binary_dilation(selected,iterations=2);bb=bounds(selected);x0,y0,x1,y1=bb
        crop=rgba[y0:y1,x0:x1].copy();crop[~selected[y0:y1,x0:x1]]=0
        objects.append((x0,Image.fromarray(crop)))
    assert len(objects)==2
    return [image for _,image in sorted(objects,key=lambda row:row[0])]


def main():
    global SOURCE,SURFACES,SURFACES_FILE
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ['authoring','assets','new_assets','output']:parser.add_argument(name,type=Path)
    parser.add_argument('--diagnostic',action='store_true')
    parser.add_argument('--identities')
    parser.add_argument('--reuse-rigs',type=Path)
    args=parser.parse_args()
    args.output.mkdir(exist_ok=False)
    snapshot=args.output/'authoring-source.py';shutil.copy2(__file__,snapshot)
    SOURCE={'code':str(snapshot),'sha256':sha(snapshot),'material':'V17_HD_COMPONENTS_AND_AUTHORED_MECHANICAL_GEOMETRY'}
    SURFACES_FILE=args.new_assets/'intermediate-surfaces-v1.png';SURFACES=intermediate_surfaces(SURFACES_FILE)
    methods={'GAREFN':allied_refinery,'GAYARD':naval_yard,'NAHAND':barracks,'NAREFN':soviet_refinery,'NARADR':radar};rigs=copy.deepcopy(read(args.reuse_rigs)) if args.reuse_rigs else {}
    selected=set(args.identities.split(',')) if args.identities else set(methods)
    for record in read(args.authoring)['families']:
        if record['identity'] not in selected or record['theater'] not in ['TEMPERATE','SNOW']:continue
        reference=args.assets/('reference-'+record['theater'].lower()+'-v1/report.json')
        scene=base.Scene(record,args.assets,reference,args.output/record['key'],args.diagnostic)
        rigs[record['key']]=methods[record['identity']](scene)
        print(record['key'],'corrected',flush=True)
    assert len(rigs)==10
    snapshots=[args.assets/'author-infrastructure-prototype-v18.py',args.assets/'author-infrastructure-prototype-v16.py']
    by_hash={sha(file):str(file) for file in snapshots}
    for rig in rigs.values():
        for nodes in rig['phases']:
            for node in nodes:
                ref=node.get('rigidPart',{}).get('reference',{})
                if 'code' in ref and sha(ref['code'])!=ref['sha256']:
                    assert ref['sha256'] in by_hash
                    ref['code']=by_hash[ref['sha256']]
    write(args.output/'rigs.json',rigs)


if __name__=='__main__':main()
