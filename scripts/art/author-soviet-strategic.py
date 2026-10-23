"""Original-phase strategic building mechanisms from retained HD anatomy."""
import argparse
import shutil
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from buildup import native_indices, read, sha, write
from painted_rig import over, place, project_rgba

defense = SourceFileLoader('strategic_defense', 'scripts/art/author-soviet-defense.py').load_module()
art, base, terminal = defense.art, defense.base, defense.terminal
ROOT = Path('.artifacts/buildup-remaining-20261013-r74-v1')
BATCH = ROOT / 'strategic-motion-r96-v1'
AUTHORITY = ROOT / 'soviet-strategic-r95-v1/selected-v2/authoring.json'


class Scene(defense.Scene):
    def __init__(self, record, output):
        previous = defense.BATCH
        defense.BATCH = BATCH
        # Reuse the already authored structural material atlas unchanged.
        material = BATCH / 'hidden-materials-v1.png'
        if not material.exists():
            shutil.copy2(previous / material.name, material)
        super().__init__(record, output)
        defense.BATCH = previous
        self.member_cache = {}
        self.source['code'] = __file__
        self.source['sha256'] = sha(__file__)

    def draw(self, nodes, layer, name, phase, method, **details):
        self.put(nodes, self.envelope(layer, phase), name, phase, method, **details)


def sentry(s):
    x, y = s.xx, s.yy
    ref = read(BATCH / 'nalasr-turret-reference-v1.json')
    turret = project_rgba(Image.open(ref['image']), [[.25, 0, ref['origin'][0]],
        [0, .25, ref['origin'][1]]], s.rig.canvas)
    # Keep the receiver upright. Elevation changes the longitudinal gun axis,
    # while the cross-gun bearing axis stays fixed in the isometric camera.
    gun_mask = s.region([(19,29),(32,20),(49,13),(60,18),(60,25),
        (46,31),(40,34),(35,37.5),(29,35.5),(28,34.5),(23,32.5)])
    gun = terminal.masked(turret, gun_mask)
    cradle = terminal.masked(turret, ~gun_mask & (y>=33) & (x>=28) & (x<=45))
    cradle = over(cradle, defense.ring(s, (36,35.5), 7.5, 3.5, 4))
    source_axes = np.column_stack(([24.,-14.], [6.,3.]))
    feet = [s.retained(poly) for poly in [
        [(19,35),(28,35),(29,42),(18,45),(14,43)],
        [(42,35),(52,35),(58,44),(46,44)],
        [(18,44),(31,39),(35,43),(31,51),(21,51)],
        [(39,42),(46,41),(54,47),(50,53),(40,50)]]]
    footmask = np.logical_or.reduce([f[...,3] > 0 for f in feet])
    center = terminal.masked(s.full, ~footmask)
    for p in range(s.record['frames']):
        nodes = s.terminal(p)
        if nodes is not None:
            s.phases.append(nodes)
            continue
        nodes = []
        s.draw(nodes, s.translated(center,[6,5,4,3,1][p],49) if p < 5 else s.full, 'fixed-center-socket', p, 'FIXED_WORLD_SOCKET')
        if p<5:
            s.draw(nodes,terminal.masked(center,(y>=46)&(x>=31)&(x<=41)),
                'fixed-front-foundation-tip',p,'FIXED_FRONT_FOUNDATION_TRIANGLE')
        if 2 <= p < 5:
            for i, (foot, pivot) in enumerate(zip(feet, [(28,39),(43,39),(30,43),(41,43)])):
                angle = (1-p/5)*np.pi/2
                direction = np.array(pivot)-[36,41]
                axis = [-float(direction[1]), float(direction[0])]
                layer = base.hinged(foot, angle, pivot, s.rig.canvas, depth=0,
                    axis_direction=axis, fold_direction=(0,-.3))
                s.draw(nodes, layer, f'outrigger-{i}', p, 'RIGID_OUTRIGGER_HINGE', angleRadians=angle)
        longitudinal = [0.,-19.] if p < 10 else [10.,-21.]
        matrix = np.column_stack((longitudinal,[6.,3.])) @ np.linalg.inv(source_axes)
        pivot = np.array([35.,39.]) if p < 10 else np.array([33.,37.])
        drop = [21,21,21,21,20,19,17,12,6,0,0][p]
        translation = pivot + [0,drop] - matrix @ [30.,34.]
        layer = base.transform(gun, np.column_stack((matrix,translation)), s.rig.canvas)
        s.draw(nodes,s.translated(cradle,max(0,9-p)*2,43),
            'fixed-elevation-cradle',p,'UPRIGHT_RECEIVER_AND_FIXED_TRANSVERSE_BEARING')
        layer = terminal.masked(layer,y<=43)
        s.draw(nodes,layer,'twin-gun-elevation-assembly',p,
            'PROJECTED_LONGITUDINAL_ELEVATION_WITH_FIXED_CROSS_AXIS',
            projectedLongitudinalAxis=longitudinal, projectedCrossAxis=[6,3],
            bearing=pivot.tolist(),verticalTravel=drop)
        rim = terminal.masked(center, (y>=41) & (y<46))
        s.draw(nodes, rim, 'socket-front-lip', p, 'FRONT_LIP_OCCLUDES_LIFTING_CRADLE')
        s.phases.append(nodes)
    result = s.finish()
    result['retainedTurretReference'] = ref
    return result


def curtain(s):
    x, y = s.xx, s.yy
    sphere = s.retained([(80,57),(97,61),(104,76),(100,91),(91,98),(80,100),(66,94),(58,83),(58,73),(64,62)])
    pillar_polys=[[(31,94),(47,86),(65,94),(65,113),(52,121),(30,112)],
        [(110,106),(125,98),(141,106),(140,130),(125,138),(109,126)],
        [(46,123),(70,111),(91,121),(92,140),(71,148),(45,136)]]
    coil_polys=[[(46,70),(57,70),(63,77),(58,81),(59,92),(53,97),(43,94),(40,87),(44,80)],
        [(111,79),(128,81),(136,86),(138,101),(132,109),(122,109),(115,103),(117,94),(122,91),(121,87),(111,86)],
        [(68,92),(81,95),(82,102),(73,104),(70,110),(77,112),(82,119),(77,127),(64,127),(56,120),(59,112),(65,110),(66,103),(66,97)]]
    coils=[terminal.masked(s.retained(q),sphere[...,3]==0) for q in coil_polys]
    cable_polys=[[(44,89),(46,95),(36,102),(31,111),(31,119),(26,122),(25,111),(32,99)],
        [(27,117),(52,129),(79,135),(104,134),(130,128),(135,122),(139,130),(115,140),(79,142),(50,136),(25,124)],
        [(128,92),(140,99),(143,111),(140,126),(134,132),(131,126),(135,111),(131,103),(125,98)]]
    cable=terminal.masked(s.full,np.logical_or.reduce([s.region(q) for q in cable_polys]))
    pillars=[]
    for i,q in enumerate(pillar_polys):
        part=s.retained(q)
        part=terminal.masked(part,y>=[94,106,120][i])
        hidden=(cable[...,3]>0)|np.logical_or.reduce([c[...,3]>0 for c in coils])|(sphere[...,3]>0)
        backing=art.material_quad(s,0,q[:4],(35,28),.72)
        backing=terminal.masked(backing,part[...,3]>0)
        part=over(terminal.masked(part,~hidden),backing)
        pillars.append(part)
    pedestal=s.retained([(65,100),(87,98),(102,107),(103,123),(89,131),(69,123),(59,112)])
    pedestal=terminal.masked(pedestal,~np.logical_or.reduce([c[...,3]>0 for c in coils]))
    structural=[[(58,56),(105,56),(110,126),(91,137),(55,123)],
        [(30,68),(68,68),(68,116),(52,122),(29,114)],
        [(108,78),(144,78),(144,132),(125,140),(107,128)],
        [(44,89),(92,89),(96,142),(71,150),(43,138)]]
    covered=np.logical_or.reduce([s.region(q) for q in structural])|(cable[...,3]>0)
    red=(s.full[...,0].astype(float)>s.full[...,1]*1.8)&(s.full[...,0].astype(float)>s.full[...,2]*1.8)
    parts_mask=np.logical_or.reduce([a[...,3]>0 for a in [sphere,*pillars,*coils,cable,pedestal]])
    ground=terminal.masked(s.full,~parts_mask & ~red & (y>=96))
    slabpoly=[(20,115),(77,86),(146,127),(94,157),(31,143)]
    # Continuous stone backing under the exact exposed ground; no orphaned machinery.
    floor=art.material_quad(s,3,[(15,85),(150,85),(150,160),(15,160)],(135,75),1.08)
    floor=terminal.masked(floor,s.region(slabpoly))
    floor=over(ground,floor)
    # The rear section follows the circular rail at the elevated bearing sockets.
    # Its upper half is hidden by the completed sphere, but remains curved early on.
    rear_angles = np.linspace(2*np.pi-np.arccos(-23/50),2*np.pi-np.arccos(33/50),241)
    rear_points = np.column_stack((81+50*np.cos(rear_angles),104+22*np.sin(rear_angles)))
    def rear_conductor(fraction):
        count=max(2,round(len(rear_points)*fraction))
        points=rear_points[-count:]
        tube=Image.new('RGBA',(s.rig.canvas[0]*4,s.rig.canvas[1]*4));td=ImageDraw.Draw(tube)
        for dy,width,color in [(1,18,(71,4,3,255)),(0,16,(172,7,5,255)),
                (-.6,10,(218,13,9,255)),(-1.1,3,(246,49,30,255))]:
            td.line([tuple((q+[0,dy])*4) for q in points],fill=color,width=width,joint='curve')
        if fraction>=.55:
            cx,cy=81,82
            td.ellipse(((cx-2)*4,(cy-3)*4,(cx+2)*4,(cy+3)*4),
                fill=(99,104,111,255),outline=(205,210,216,255),width=2)
        return np.array(tube)
    for p in range(25):
        nodes = s.terminal(p)
        if nodes is not None:
            s.phases.append(nodes)
            continue
        nodes = []
        if p >= 22:
            lower = terminal.masked(s.full, sphere[...,3]==0)
            s.draw(nodes, lower, 'completed-lower-mechanism', p, 'EXACT_RETAINED_LOWER_COMPONENTS')
        else:
            if p==0:
                ix=native_indices(s.rig.raw,p);iy,ixx=np.where(ix>0)
                initial=defense.ring(s,(float(ixx.mean()),float(iy.mean())),7,3,1)
                s.draw(nodes,initial,'foundation-seed',p,'INITIAL_CIRCULAR_FOUNDATION')
            else:
                scale=[0,.68,.83,.94,1][min(p,4)]
                platform=art.affine_about(s,floor,[[scale,0],[0,scale]],(81,120))
                s.draw(nodes,platform,'fixed-foundation' if p>=4 else 'expanding-foundation',p,
                    'FIXED_FOOTPRINT_AFTER_RADIAL_EXPANSION',scale=scale)
            if p>=8:
                progress=min(1,(p-7)/4)
                s.draw(nodes,rear_conductor(progress),'rear-connector',p,
                    'REAR_CIRCULAR_CONDUCTOR_UNROLLS_BEHIND_PIERS',fraction=progress,
                    ellipseCenter=[81,104],ellipseRadii=[50,22])
            for i,pillar in enumerate(pillars):
                if p<1:continue
                drop=[0,23,19,12,5,0][min(p,5)]
                s.draw(nodes,s.translated(pillar,drop,145 if i==2 else 135 if i==1 else 118),
                    f'masonry-pier-{i}',p,'RIGID_PIER_VERTICAL_EMERGENCE',translation=[0,drop])
            if p>=5:
                for i,coil in enumerate(coils):
                    if p<[7,5,6][i]:continue
                    drop=max(0,[13,9,10][i]-p)*1.7
                    angle=np.deg2rad(max(0,10-p)*-7)
                    layer=base.rotate(coil,angle,[(51,91),(126,102),(69,121)][i],s.rig.canvas)
                    top=np.where(layer[...,3]>=128)[0].min()/4
                    drop=max(drop,s.rig.logical[p]["trimOrigin"][1]+.75-top)
                    layer=s.translated(layer,drop,[99,112,129][i])
                    s.draw(nodes,layer,f'conductor-bearing-{i}',p,'RIGID_CONDUCTOR_EMERGENCE',translation=[0,drop])
            if p>=12:
                theta=np.mod(-2.5-np.arctan2((y-111)/24,(x-81)/53),2*np.pi)
                progress=min(1,(p-11)/10)
                s.draw(nodes,terminal.masked(cable,theta<=progress*5.2),'perimeter-conductor',p,
                    'CONDUCTOR_EXTENDS_ALONG_FIXED_PERIMETER_RAIL',fraction=progress)
            if p>=16:
                drop=max(0,22-p)*2
                s.draw(nodes,s.translated(pedestal,drop,131),'central-lifting-pedestal',p,
                    'RIGID_CENTRAL_PEDESTAL_EMERGENCE',translation=[0,drop])
        if p>=16:
            scale=[.20,.29,.40,.52,.64,.77,.88,.95][p-16]
            drop=(1-scale)*33
            ball=art.affine_about(s,sphere,[[scale,0],[0,scale]],(81,98),(0,drop))
            top=np.where(ball[...,3]>=128)[0].min()/4
            adjust=max(0,s.rig.logical[p]['trimOrigin'][1]+.75-top)
            ball=terminal.move(ball,dy=adjust)
            s.draw(nodes,ball,'central-armored-sphere',p,'ORIGINAL_SPHERE_ASSEMBLY_AND_LIFT',scale=scale,translation=[0,drop])
            # The near conductor remains in front while the sphere clears the socket.
            if p<22:
                s.draw(nodes,coils[2],'front-conductor-occluder',p,'FRONT_CONDUCTOR_OCCLUDES_RISING_SPHERE')
        s.phases.append(nodes)
    return s.finish()


def silo(s):
    x,y=s.xx,s.yy
    tower_poly=[(85,76),(130,49),(143,60),(154,80),(154,132),(159,155),(135,167),(80,145),(86,124)]
    tower=s.retained(tower_poly)
    floor=terminal.masked(s.full,(y>=129)&~s.region(tower_poly))
    interior=art.material_quad(s,0,[(82,139),(117,121),(156,141),(121,160)],(74,39),.45)
    grid=Image.new('RGBA',(s.rig.canvas[0]*4,s.rig.canvas[1]*4));gd=ImageDraw.Draw(grid)
    q=np.array([(82,139),(117,121),(156,141),(121,160)],float)
    for t in np.linspace(.08,.92,13):
        for a,b in [(q[0]*(1-t)+q[1]*t,q[3]*(1-t)+q[2]*t),
                    (q[0]*(1-t)+q[3]*t,q[1]*(1-t)+q[2]*t)]:
            gd.line([tuple(a*4),tuple(b*4)],fill=(141,137,112,255),width=2)
    interior=over(np.array(grid),interior)
    floor=over(floor,interior)
    # Separate the exterior fixtures from the two load-bearing tower halves.
    emblem=s.retained([(88,108),(116,103),(118,141),(86,137)])
    red=(s.full[...,0].astype(float)>s.full[...,1]*1.8)&(s.full[...,0].astype(float)>s.full[...,2]*1.8)
    emblem=terminal.masked(emblem,red)
    vent=s.retained([(122,136),(143,129),(155,153),(138,162),(122,152)])
    roof_red=terminal.masked(tower,red & (y<96))
    ladder_poly=[(130.5,88),(138.5,84.5),(138.5,127),(130.5,131)]
    ladder=s.retained(ladder_poly)
    pipe_polys=[[(85,87),(94,91),(94,97),(85,93)],
        [(107,96),(116,100),(124,96),(124,102),(116,106),(107,102)],
        [(138,89),(149,84),(149,91),(138,96)]]
    pipes=[s.retained(q) for q in pipe_polys]
    ridge=terminal.masked(roof_red,y<70-.55*(x-110))
    roof_red=terminal.masked(roof_red,~(ridge[...,3]>0))
    fixture_mask=s.region(ladder_poly)|np.logical_or.reduce([s.region(q) for q in pipe_polys])
    clean=tower.copy()
    patch=art.material_quad(s,2,[(86,88),(121,68),(122,145),(84,145)],(38,77),1.0)
    patch=terminal.masked(patch,emblem[...,3]>0)
    clean=over(patch,clean)
    patch=art.material_quad(s,0,[(108,75),(132,60),(148,84),(125,97)],(40,37),.65)
    # Gold intake mesh is visible beneath the independently installed red slats.
    patch[...,:3]=np.clip(patch[...,:3].astype(float)*[1.22,1.08,.65],0,255).astype(np.uint8)
    mesh=Image.new('RGBA',(s.rig.canvas[0]*4,s.rig.canvas[1]*4));md=ImageDraw.Draw(mesh)
    corners=np.array([(108,74),(133,61),(145,82),(120,95)],float)
    for v in np.linspace(0,1,9):
        for a,b in [(corners[0]*(1-v)+corners[1]*v,corners[3]*(1-v)+corners[2]*v),
                (corners[0]*(1-v)+corners[3]*v,corners[1]*(1-v)+corners[2]*v)]:
            md.line([tuple(a*4),tuple(b*4)],fill=(47,49,44,255),width=3)
    patch=over(np.array(mesh),patch)
    clean=over(terminal.masked(patch,roof_red[...,3]>0),clean)
    patch=art.material_quad(s,2,[(119,128),(145,125),(155,155),(135,165)],(36,40),.85)
    clean=over(terminal.masked(patch,vent[...,3]>0),clean)
    # Exposed wall panels use adjacent retained stone, with identical lighting.
    wall_backing=terminal.move(s.full,dx=12,dy=-6)
    clean=over(terminal.masked(wall_backing,s.region(ladder_poly)),clean)
    for poly in pipe_polys:
        mask=s.region(poly) & (tower[...,3]>0)
        clean=over(terminal.masked(art.material_quad(s,2,[(80,82),(154,82),(154,110),(80,110)],(74,28),.7),mask),clean)
    ridge_backing=art.material_quad(s,0,[(99,70),(125,55),(127,63),(102,77)],(28,9),.7)
    clean=over(terminal.masked(ridge_backing,ridge[...,3]>0),clean)
    fence_polys=[[(49,140),(87,119),(87,127),(49,148)],
        [(49,140),(124,170),(124,177),(49,147)],
        [(124,170),(174,147),(174,155),(124,177)],
        [(149,126),(174,137),(174,153),(168,151),(168,142),(149,134)]]
    fences=[s.retained(q) for q in fence_polys]
    box_poly=[(67,139),(77,135),(81,139),(81,152),(74,156),(67,152)]
    service_box=s.retained(box_poly)
    entry_poly=[(76,148),(81,146),(81,159),(76,161)]
    entry_ladder=s.retained(entry_poly)
    floor_fixtures=np.logical_or.reduce([s.region(q) for q in fence_polys+[box_poly,entry_poly]])
    bare_floor=terminal.masked(floor,~floor_fixtures)
    platform_poly=[(49,145),(111,114),(176,145),(176,157),(129,180),(117,180),(49,153)]
    paving=art.material_quad(s,3,[(40,110),(185,110),(185,185),(40,185)],(145,75),1.15)
    paving=terminal.masked(paving,floor_fixtures & s.region(platform_poly) & (floor[...,3]>0))
    bare_floor=over(bare_floor,paving)
    floor=bare_floor
    split=s.region([(104,73),(143,51),(156,80),(155,132),(161,157),(135,169),(111,154),(112,99)])
    rear=terminal.masked(clean,~split & (x<=109))
    front=terminal.masked(clean,split)
    innerwall=art.material_quad(s,2,[(103,74),(130,59),(130,139),(103,154)],(27,80),.65)
    # Interior ribs and a retained red warning plate travel rigidly with the rear half.
    detail=Image.new('RGBA',(s.rig.canvas[0]*4,s.rig.canvas[1]*4));draw=ImageDraw.Draw(detail)
    for xx in [105,111,117,123,129]:
        top=74-(xx-103)*15/27
        draw.line(((xx*4,top*4),(xx*4,(154-(xx-103)*15/27)*4)),fill=(88,91,94,255),width=2)
    for yy in range(86,146,10):
        draw.line(((103*4,yy*4),(130*4,(yy-15)*4)),fill=(25,28,31,255),width=2)
    innerwall=over(np.array(detail),innerwall)
    badge=art.affine_about(s,emblem,[[.55,0],[0,.55]],(102,120),(12,-44))
    innerwall=over(badge,innerwall)
    rear=over(rear,innerwall)
    image=Image.open(BATCH/'rocket-master-v1.png').convert('RGBA')
    ay,ax=np.where(np.array(image)[...,3]>=128)
    crop=(max(0,ax.min()-3),max(0,ay.min()-3),min(image.width,ax.max()+4),min(image.height,ay.max()+4))
    rocket=place(image.crop(crop),(111,64,125,145),s.rig.canvas)
    for p in range(26):
        nodes=s.terminal(p)
        if nodes is not None:
            s.phases.append(nodes)
            continue
        nodes=[]
        if p>=14:
            final_floor=bare_floor
            s.draw(nodes,final_floor,'completed-fenced-platform',p,'EXACT_RETAINED_FOOTPRINT')
        else:
            t=[.35,.44,.55,.66,.79,.90,1][min(p,6)]
            layer=art.affine_about(s,floor,[[t,0],[0,t]],(119,142))
            ground_contact=np.max(np.where(layer[...,3]>=128,y,-1),axis=0)[None,:]-2
            s.draw(nodes,layer,'platform-and-launch-socket',p,'ORIGINAL_RADIAL_PLATFORM_EXPANSION',scale=t)
        if p<14:
            travel=1 if p<9 else [.83,.60,.40,.20,.08][p-9]
            back_drop=max(0,7-p)*13
            front_drop=max(0,9-p)*13
            if p>=3:
                back=terminal.move(rear,dx=-travel*16,dy=-travel*8+back_drop)
                top=np.where(back[...,3]>=128)[0].min()/4
                back=terminal.move(back,dy=max(0,s.rig.logical[p]['trimOrigin'][1]+.75-top))
                base_pose=terminal.move(rear,dx=-travel*16,dy=-travel*8)
                contact=np.max(np.where(base_pose[...,3]>=128,y,-1),axis=0)[None,:]
                back=terminal.masked(back,y<=np.minimum(contact,ground_contact))
                s.draw(nodes,back,'rear-tower-half',p,'RIGID_TOWER_RISE_THEN_ISOMETRIC_CLOSURE',translation=[-travel*16,-travel*8+back_drop])
            if p>=2:
                drop=max(0,8-p)*10
                s.draw(nodes,s.translated(rocket,drop,147),'internal-missile',p,'ROCKET_RISES_FROM_OPEN_LAUNCH_SOCKET',translation=[0,drop])
            if p>=5:
                face=terminal.move(front,dx=travel*8,dy=travel*4+front_drop)
                base_pose=terminal.move(front,dx=travel*8,dy=travel*4)
                contact=np.max(np.where(base_pose[...,3]>=128,y,-1),axis=0)[None,:]
                face=terminal.masked(face,y<=np.minimum(contact,ground_contact))
                s.draw(nodes,face,'front-tower-half',p,'RIGID_TOWER_RISE_THEN_ISOMETRIC_CLOSURE',translation=[travel*8,travel*4+front_drop])
        else:
            s.draw(nodes,clean,'closed-tower-shell',p,'CLOSED_TOWER_EXACT_RETAINED_GEOMETRY')
            # Four diagonal roof shutters slide sideways from beneath each rib.
            # The coordinate across the roof follows its actual isometric plane.
            across=x-(y-76)*.53
            for i,(lo,hi) in enumerate([(113,120.5),(120.5,127.7),(127.7,134.9),(134.9,142.5)]):
                mask=(across>=lo)&(across<hi)
                plate=terminal.masked(roof_red,mask)
                progress=np.clip((p-(14+2*i))/2,0,1)
                if progress<=0:continue
                motion=(1-progress)*np.array([-6.,3.])
                layer=terminal.move(plate,*motion)
                layer=terminal.masked(layer,mask & (roof_red[...,3]>0))
                s.draw(nodes,layer,f'roof-slat-{i}',p,'DIAGONAL_SHUTTER_SLIDES_FROM_ADJACENT_RIB',
                    fraction=float(progress),translation=motion.tolist())
            if p>=23:
                progress=min(1,(p-22)/2)
                layer=terminal.move(ridge,dy=(1-progress)*3)
                s.draw(nodes,terminal.masked(layer,ridge[...,3]>0),'rear-roof-ridge',p,
                    'REAR_ROOF_RIDGE_RISES_LAST',fraction=progress)
            if p>=16:
                fraction=min(1,(p-15)/5)
                motion=(1-fraction)*np.array([7.,27.])
                panel=terminal.move(vent,*motion)
                panel=terminal.masked(panel,s.region([(122,136),(143,129),(155,153),(138,162),(122,152)]))
                s.draw(nodes,panel,'front-service-housing',p,'RIGID_SERVICE_HOUSING_RISES_ALONG_INCLINED_SOCKET',translation=motion.tolist(),fraction=fraction)
            if p>=22:
                s.draw(nodes,emblem,'side-emblem',p,'COMPLETE_EMBLEM_PANEL_SEATS_ON_WALL')
        if p>=12:
            # Perimeter rails rise before the box and wall ladder are installed.
            fraction=min(1,(p-11)/8)
            for i,part in enumerate(fences):
                layer=terminal.move(part,dy=(1-fraction)*6)
                layer=terminal.masked(layer,s.region(fence_polys[i]))
                s.draw(nodes,layer,f'perimeter-rail-{i}',p,'RAIL_POSTS_RISE_FROM_PLATFORM',fraction=fraction)
            entry_fraction=min(1,(p-11)/4)
            entry=base.hinged(entry_ladder,(1-entry_fraction)*np.pi/2,(79,159),s.rig.canvas,
                depth=0,axis_direction=(1,-.5),fold_direction=(-.8,.25))
            s.draw(nodes,entry,'platform-entry-ladder',p,'ENTRY_LADDER_PIVOTS_UP_FROM_PLATFORM',fraction=entry_fraction)
        if p>=14:
            fraction=min(1,(p-13)/4)
            for i,part in enumerate(pipes):
                movement=(1-fraction)*np.array([(6,3),(-7,-3),(6,-3)][i])
                layer=terminal.masked(terminal.move(part,*movement),s.region(pipe_polys[i]))
                s.draw(nodes,layer,f'wall-pipe-{i}',p,'WALL_PIPE_EXTENDS_ALONG_ISOMETRIC_SOCKET',fraction=fraction)
        if p>=17:
            fraction=min(1,(p-16)/4)
            box=terminal.masked(terminal.move(service_box,dy=(1-fraction)*16),s.region(box_poly))
            s.draw(nodes,box,'exterior-service-box',p,'SERVICE_BOX_RISES_FROM_PLATFORM',fraction=fraction)
        if p>=20:
            long_axis=[[25,-6],[15,-22],[7,-32],[2,-38],[0,-40]][min(4,p-20)]
            matrix=np.column_stack(([6.,-3.],long_axis)) @ np.linalg.inv(np.column_stack(([6.,-3.],[0.,-40.])))
            pivot=np.array([134.5,128.])
            layer=base.transform(ladder,np.column_stack((matrix,pivot-matrix@pivot)),s.rig.canvas)
            s.draw(nodes,layer,'exterior-wall-ladder',p,'WALL_LADDER_PIVOTS_UP_ABOUT_FIXED_BOTTOM_HINGE',
                projectedLongAxis=long_axis,pivot=pivot.tolist())
        if p>=24:
            nodes=[]
            s.draw(nodes,s.full,'completed-silo',p,'EXACT_RETAINED_COMPLETED_ART')
        s.phases.append(nodes)
    result=s.finish()
    result['internalRocket']={'image':str(BATCH/'rocket-master-v1.png'),'sha256':sha(BATCH/'rocket-master-v1.png'),'prompt':str(BATCH/'material-prompt-v1.json')}
    return result


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('output',type=Path)
    parser.add_argument('--families',default='NALASR,NAIRON,NAMISL')
    args=parser.parse_args()
    args.output.mkdir(exist_ok=False)
    shutil.copy2(__file__,args.output/'authoring-source.py')
    rigs={}
    for rec in read(AUTHORITY)['families']:
        if rec['identity'] not in args.families.split(','):continue
        s=Scene(rec,args.output/rec['key'])
        rigs[rec['key']]={'NALASR':sentry,'NAIRON':curtain,'NAMISL':silo}[rec['identity']](s)
        print(rec['key'],len(s.violations),'geometry violations',flush=True)
    write(args.output/'rigs.json',rigs)


if __name__=='__main__':main()
