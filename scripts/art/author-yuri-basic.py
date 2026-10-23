"""Original-phase Yuri construction from retained HD components and rigid mechanisms."""
import argparse
import copy
import shutil
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from buildup import native_indices, read, sha, write
from painted_rig import over, place, project_rgba

heavy = SourceFileLoader('yuri_heavy', 'scripts/art/author-heavy-structure.py').load_module()
base, art, terminal = heavy.base, heavy.art, heavy.terminal
ROOT = Path('.artifacts/buildup-remaining-20261013-r74-v1')
BATCH = ROOT/'yuri-basic-r101-v1'
AUTHORITY = BATCH/'selected-v2/authoring.json'
CORRECTION = ROOT/'yuri-connections-r103-v1'
ORBIT = ROOT/'yuri-orbit-r104-v1'


class Scene(heavy.defense.Scene):
    def __init__(self, record, output, source):
        reference = BATCH/('reference-'+record['theater'].lower()+'-v2/report.json')
        self.rig, self.full = base.parts.seed_rig(record, reference, output)
        self.record, self.output, self.origin = record, output, np.zeros(2)
        self.file = ROOT/'heavy-structure-r99-v1/hidden-materials-v1.png'
        atlas = Image.open(self.file).convert('RGBA'); w, h = atlas.width//2, atlas.height//2
        self.materials = [atlas.crop((i%2*w, i//2*h, (i%2+1)*w, (i//2+1)*h)) for i in range(4)]
        metal = np.array(self.materials[0]); gray = metal[...,:3].mean(axis=-1)
        metal[...,:3] = np.clip(gray[...,None]*[1.12,.94,.58],0,255)
        self.materials[0] = Image.fromarray(metal)
        self.yy, self.xx = np.mgrid[:self.full.shape[0], :self.full.shape[1]]/4
        self.phases, self.checks, self.violations = [], [], []
        self.diagnostic = True
        self.owner_allowed = [bool(((native_indices(self.rig.raw,p)>=16)&(native_indices(self.rig.raw,p)<32)).any()) for p in range(record['frames'])]
        self.reference = read(reference)['cases'][record['identity']]
        assert self.reference['status']=='PASS_NATIVE_REPAIRED_BUILDUP_PHASES_BINDING_AND_SALE'
        self.source = {'code':str(source),'sha256':sha(source),'material':str(self.file),'materialSha256':sha(self.file)}
        hidden=BATCH/'hidden-components-v1.png'
        atlas=Image.open(hidden).convert('RGBA')
        boxes=[(113,24,481,510),(619,49,882,505),(957,60,1273,497),
               (8,508,606,887),(632,528,903,853),(973,528,1273,862),
               (69,879,517,1187),(562,867,924,1193),(1013,873,1253,1172)]
        self.hidden=[]
        for box in boxes:
            rgba=heavy.largest_piece(np.array(atlas.crop(box)))
            im=Image.fromarray(rgba);self.hidden.append(im.crop(im.getbbox()))
        self.source.update(hiddenComponents=str(hidden),hiddenComponentsSha256=sha(hidden))

    def cell(self, index, box):
        return place(self.hidden[index],box,self.rig.canvas)


    def draw(self, nodes, layer, name, phase, method, **details):
        assert all(n['name']!=name for n in nodes), (self.record['key'],phase,name,'Duplicate component name')
        if details.pop('ground',False): details['fixedGroundComponent']=True
        self.put(nodes,self.envelope(layer,phase),name,phase,method,**details)

    def at_end(self, phase, settled):
        nodes=self.terminal(phase)
        if nodes is not None:return nodes
        if phase>=settled:
            nodes=[];self.draw(nodes,self.full,'retained-complete-body',phase,'EXACT_RETAINED_COMPLETE_ANATOMY')
            return nodes
        return None


def frac(p,a,b):return float(np.clip((p-a)/(b-a),0,1))


def world_floor(s, polygon):
    floor=heavy.texture(s,polygon,0,.75)
    # The fixed surface is covered by independent moving components. Its UVs
    # never track an expanding image bounds rectangle.
    return floor


def gold_tube(s, points, radius=1.):
    result=heavy.tube(s,points,radius)
    value=result[...,:3].mean(axis=-1)
    result[...,:3]=np.clip(value[...,None]*[1.12,.96,.62],0,255)
    return result


def path_reveal(s, layer, points, fraction):
    """Expose a hose along its fixed centerline, starting at the ground socket."""
    from scipy.interpolate import make_interp_spline
    from scipy.spatial import cKDTree
    points=np.asarray(points,float)
    curve=make_interp_spline(np.linspace(0,1,len(points)),points,k=min(3,len(points)-1))(np.linspace(0,1,256))
    _,nearest=cKDTree(curve).query(np.column_stack((s.xx.ravel(),s.yy.ravel())))
    return terminal.masked(layer,nearest.reshape(s.xx.shape)<=round(fraction*255))


def barracks(s):
    x,y=s.xx,s.yy
    headpoly=[(36,42),(44,35),(52,32),(63,32),(74,38),(82,49),(87,62),(89,73),(86,81),(85,106),(86,115),(84,121),(79,124),(65,120),(52,115),(44,108),(40,94),(34,80),(31,68),(32,54)]
    head=terminal.masked(s.retained(headpoly),y>=35)
    plainhead=s.cell(0,(30,31,92,123))
    portmask=s.region([(29,34),(44,30),(49,38),(44,73),(38,81),(29,78)])|s.region([(44,28),(70,28),(75,41),(47,40)])
    earlyhead=head.copy()
    # Ports and pipe ends move with the head, while each external hose is a
    # separate complete member that rises and bends into its socket.
    hose_polys=[[(7,60),(8,48),(15,39),(24,36),(33,36),(40,41),(38,47),(31,43),(19,43),(13,50),(13,64),(15,77),(19,80),(18,85),(12,82),(8,71)],
        [(6,62),(8,55),(18,50),(30,48),(39,48),(41,54),(35,56),(32,53),(19,55),(12,60),(12,72),(16,88),(21,100),(20,106),(14,98),(7,80)],
        [(25,103),(27,84),(30,73),(33,66),(38,65),(39,69),(35,76),(34,87),(32,105)],
        [(39,33),(39,26),(44,21),(50,24),(53,31),(50,35),(47,29),(44,28),(44,34)],
        [(52,33),(54,28),(59,26),(63,30),(64,35),(60,36),(58,33),(56,36)],
        [(62,38),(65,31),(69,26),(73,26),(76,29),(77,35),(76,45),(72,44),(72,34),(70,33),(68,36),(67,40)]]
    hoses=[s.retained(q) for q in hose_polys]
    occupied=s.region(headpoly)|np.logical_or.reduce([s.region(q) for q in hose_polys])
    front_ramp_poly=[(70,133),(81,116),(85,115),(97,119),(103,131),(99,137),(92,133),(86,124),(79,137)]
    left_ramp_poly=[(0,130),(13,96),(20,77),(27,76),(31,83),(22,108),(13,137)]
    front_ramp=s.retained(front_ramp_poly);left_ramp=s.retained(left_ramp_poly)
    propspoly=[(99,89),(112,90),(119,99),(118,122),(112,126),(104,121)]
    props=s.retained(propspoly)
    ant=s.retained([(76,3),(82,3),(82,46),(77,47)])
    occupied|=s.region(front_ramp_poly)|s.region(left_ramp_poly)|s.region(propspoly)|s.region([(76,3),(82,3),(82,46),(77,47)])
    platform=terminal.masked(s.full,~occupied&(y>=118))
    bed=world_floor(s,[(12,129),(60,106),(119,124),(120,132),(87,144),(43,145),(10,137)])
    bed=over(platform,bed)
    # The triangular blue support walls belong to the stationary shell, not
    # to the narrow ramp that travels in front of them.
    support_mask=(y>=76)&(y<=132)&~s.region(headpoly)
    support_mask&=~np.logical_or.reduce([s.region(q) for q in hose_polys])
    support_mask&=~s.region(propspoly)&~s.region(front_ramp_poly)
    support_mask&=~s.region([(0,130),(19,77),(24,78),(8,133)])
    side_frames=terminal.masked(s.full,support_mask)
    lower_pad=terminal.masked(s.full,~occupied&(y>=126))
    for p in range(s.record['frames']):
        nodes=s.at_end(p,23)
        if nodes is not None:s.phases.append(nodes);continue
        nodes=[]
        if p<16:
            pad=world_floor(s,[(39,113),(50,108),(56,112),(45,118)] if p<2 else [(35,126),(61,113),(88,126),(65,137)])
            s.draw(nodes,pad,'initial-ground-socket',p,'FIXED_HEAD_EMERGENCE_SOCKET',ground=True)
        if p>=10:
            # The platform is revealed directly on its fixed world plane.
            floor = over(lower_pad,bed)
            floor = s.reveal_floor(floor,p,122)
            s.draw(nodes,floor,'direct-platform-reveal',p,'DIRECT_FIXED_PLATFORM_REVEAL_NO_HINGE',ground=True)
        drop=float(np.interp(p,[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],
                             [100,83,65,60,53,46,35,25,15,10,8,6,4,3,2,1,0]))
        if p>=6:
            frame_t=frac(p,6,10)
            s.draw(nodes,s.translated(side_frames,max(0,drop-8),139),'side-frame',p,'CONTINUOUS_SUPPORT_WALLS_BEHIND_HEAD_AND_RAMP',fraction=frame_t)
        layer=terminal.move(earlyhead if p<10 else head,dy=drop)
        # A curved ground opening occludes only the still-buried head. Once
        # clear of it, the entire chin is retained; no lower-body overlay cuts it.
        edge=float(np.interp(p,[0,1,2,3,4,5,6,7,8],[118,120,125,132,138,141,141,141,150])) - .12*(x-68)**2/25
        layer=terminal.masked(layer,y<=edge)
        if p>=1:s.draw(nodes,layer,'complete-head',p,'RIGID_HEAD_RISES_THROUGH_CURVED_GROUND_OPENING',translation=[0,drop])
        for i,hose in enumerate(hoses):
            begin,end=([(5,10),(18,22),(7,12),(15,19),(15,20),(14,19)])[i]
            if p<begin:continue
            t=frac(p,begin,end)
            paths=[[(18,83),(10,69),(10,49),(22,39),(37,43)],
                   [(20,104),(10,84),(8,65),(15,55),(37,52)],
                   [(31,105),(32,88),(33,75),(37,68)],
                   [(43,34),(42,25),(47,23),(50,32)],
                   [(55,35),(56,30),(60,29),(62,34)],
                   [(75,44),(75,29),(71,27),(66,37)]]
            layer=path_reveal(s,hose,paths[i],t)
            layer=terminal.move(layer,dy=drop)
            s.draw(nodes,layer,f'complete-hose-{i}',p,'HOSE_EXTENDS_ALONG_FIXED_PATH_FROM_SOCKET',fraction=t,rotationRadians=0)
        if p>=5:
            t=frac(p,5,10)
            layer=s.translated(left_ramp,(1-t)*43,138)
            s.draw(nodes,layer,'left-ramp',p,'RIGID_SIDE_RAMP_RISES_FROM_FIXED_GROUND_SOCKET',fraction=t)
        if p>=9:
            t=frac(p,9,20)
            layer=s.translated(front_ramp,(1-t)*16,140)
            s.draw(nodes,layer,'front-ramp',p,'FRONT_RAMP_EMERGES_FROM_FIXED_GROUND_SOCKET',fraction=t)
        if p>=8:
            s.draw(nodes,s.translated(ant,(1-frac(p,8,16))*56,45),'rear-antenna',p,'ANTENNA_RISES_FROM_REAR_SOCKET')
        if p>=11:
            t=frac(p,11,21)
            s.draw(nodes,s.translated(props,(1-t)*31,126),'service-pedestal',p,'SERVICE_PEDESTAL_RISES_THROUGH_PLATFORM',fraction=t)
        if p>=16:
            t=frac(p,16,22)
            s.draw(nodes,lower_pad,'seated-ground-platform',p,'EXACT_RETAINED_FLOOR_AFTER_PLATFORM_DEPLOYMENT',ground=True)
        s.phases.append(nodes)
    return s.finish()


def gatling(s):
    reference=read(BATCH/('yaggun-'+s.record['theater'].lower()+'-turret-reference-v1.json'))
    turret=project_rgba(Image.open(reference['image']),[[.25,0,reference['origin'][0]],[0,.25,reference['origin'][1]]],s.rig.canvas)
    near_poly=[(57,32),(66,28),(69,28),(78,23),(83,23),(85,27),(84,30),(71,37),(67,37),(61,40),(57,38)]
    far_poly=[(64,16),(68,15),(72,17),(73,20),(70,23),(67,22)]
    far_rear=[(43,27),(49,24),(51,25),(49,31),(48,34),(43,33)]
    near=terminal.masked(turret,s.region(near_poly))
    far=terminal.move(near,-14,-7)
    body=terminal.masked(turret,~(s.region(near_poly)|s.region(far_poly)|s.region(far_rear)))
    foot_polys=[[(47,60),(51,55),(54,47),(58,47),(56,54),(51,62),(47,62)],
                [(64,47),(67,46),(69,53),(74,59),(73,62),(68,60),(65,54)],
                [(43,49),(47,47),(51,44),(54,44),(52,47),(48,51)],
                [(65,44),(68,43),(71,46),(76,48),(74,50),(69,48)]]
    feet=[s.retained(q) for q in foot_polys]
    foot_mask=np.logical_or.reduce([s.region(q) for q in foot_polys])
    center=terminal.masked(s.full,~foot_mask)
    closed_core=world_floor(s,[(49,44),(59,40),(70,44),(71,57),(61,62),(49,58)])
    center=over(center,terminal.masked(closed_core,foot_mask))
    pivots=[(47,60),(73,60),(44,50),(74,49)]
    # At the beginning the strips lie radially outside the bearing. They
    # rotate inward about their outer heels, exposing the rising center.
    open_angles=[-1.05,1.05,-.7,.7]
    for p in range(s.record['frames']):
        nodes=s.terminal(p)
        if nodes is not None:s.phases.append(nodes);continue
        nodes=[]
        if 1<=p<=7:
            radius=min(14.,4+p*3.5)
            ground_ring=heavy.defense.ring(s,(59,56),radius,radius-1.3,.4)
            shade=ground_ring[...,:3].mean(axis=-1)
            ground_ring[...,:3]=np.clip(shade[...,None]*[1.15,.98,.62],0,255)
            s.draw(nodes,ground_ring,'fixed-outer-bearing-rim',p,'CONTINUOUS_GROUND_BEARING_CONNECTS_FOUR_OUTER_STRIP_HEELS')
        if p==0:
            socket=heavy.defense.ring(s,(59,55),4,1.2,.5)
            s.draw(nodes,socket,'initial-bearing',p,'CLOSED_INITIAL_GROUND_BEARING')
            s.phases.append(nodes);continue
        t=frac(p,4,8)
        drop=float(np.interp(p,[1,2,3,4,5,6,7,8],[25,25,25,24,12,5,1,0]))
        # Far members are behind the center; near members are in front.
        strips=[]
        for i,pivot in enumerate(pivots):
            sign=1 if i%2==0 else -1
            if i<2:
                endpoint=np.array(pivot)+[sign*(-6+13*t),-3.5-9.5*t-4*np.sin(np.pi*t)]
                width=[2.4,1.2]
            else:
                endpoint=np.array(pivot)+[sign*(-2+9*t),-2-4*t]
                width=[1.7,.8]
            layer=heavy.solid_beam(s,pivot,endpoint,width,material=2,thickness=.7)
            layer=over(gold_tube(s,[list(pivot),endpoint.tolist()],.45),layer)
            strips.append(layer)
        for i in [2,3]:
            if p>=3 and p<8:s.draw(nodes,strips[i],f'inward-base-strip-{i}',p,'OUTER_STRIP_FOLDS_INWARD_AROUND_FIXED_HEEL',fraction=t)
        rising=s.translated(center,drop,63)
        if p>=8:rising=s.full
        s.draw(nodes,rising,'center-pedestal',p,'CENTER_RISES_INSIDE_FOUR_FOLDING_STRIPS',translation=[0,drop])
        for i in [0,1]:
            if p>=3 and p<8:s.draw(nodes,strips[i],f'inward-base-strip-{i}',p,'OUTER_STRIP_FOLDS_INWARD_AROUND_FIXED_HEEL',fraction=t)
        # A true similarity rotation preserves barrel length, width and all
        # internal texel distances. No axis shear or independent width scale.
        pitch=np.deg2rad(-43*(1-frac(p,6,11)))
        moving=[base.rotate(piece,pitch,pivot,s.rig.canvas) for piece,pivot in [(far,(51,28)),(near,(65,35))]]
        native_top=s.rig.logical[p]['trimOrigin'][1]
        tip=min(np.where(layer[...,3]>=128)[0].min()/4 for layer in moving)
        rise=float(np.interp(p,[1,2,3,4,5,6,7,8,9,10,11],[34,28,22,16,8,0,0,0,0,0,0]))
        for i in range(2):
            layer=s.translated(moving[i],rise,62)
            s.draw(nodes,layer,f'gatling-barrel-{i}',p,'COMPLETE_BARREL_AND_REAR_BREECH_ROTATE_AS_ONE_RIGID_MEMBER',rotationRadians=pitch,singularValues=[1.,1.],translation=[0,rise])
            if i==0 and p>=2:
                s.draw(nodes,s.translated(body,rise,62),'retained-red-receiver',p,'RETAINED_RECEIVER_BEHIND_NEAR_BARREL',translation=[0,rise])
        if p<=4:
            rim=heavy.defense.ring(s,(59,59),6.,3.9,.6)
            rim=terminal.masked(rim,s.yy>=59)
            shade=rim[...,:3].mean(axis=-1)
            rim[...,:3]=np.clip(shade[...,None]*[1.15,.98,.62],0,255)
            s.draw(nodes,rim,'foreground-bearing-rim',p,'CURVED_GROUND_SOCKET_OCCLUDES_BURIED_TURRET')
        if p==11:
            nodes=[]
            s.draw(nodes,s.full,'seated-complete-pedestal',p,'EXACT_RETAINED_PEDESTAL_BEFORE_COMPLETION')
            s.draw(nodes,turret,'seated-complete-turret',p,'EXACT_RETAINED_TURRET_BEFORE_COMPLETION')
        s.phases.append(nodes)
    result=s.finish();result['retainedTurretReference']=reference
    return result


def reactor_orbit(phase, centers):
    """Native carousel: upright vessels orbit the mast as they rise."""
    # A 216-degree arc returns the fivefold assembly to its retained pose.
    # Phase zero is already 27 degrees into the cycle; no full-image spin.
    angle=np.deg2rad(27.+9.*min(phase,21))
    result=[]
    for (cx,cy,floor),reference_angle in zip(centers,[-126,-54,162,18,90]):
        theta=np.deg2rad(reference_angle)+angle
        target=np.array([85+20*np.cos(theta),47+10*np.sin(theta)])
        result.append((target-np.array([cx,cy]),target[1],angle))
    return result


def reactor(s):
    x,y=s.xx,s.yy
    # Five complete vessels share one retained camera. Rear vessels are
    # reconstructed from the unobstructed front vessel before depth compositing.
    frontpoly=[(76,54),(80,51),(88,51),(95,56),(96,78),(94,83),(90,86),(90,95),(80,95),(79,86),(75,81),(75,62)]
    front=s.retained(frontpoly)
    dome=s.cell(1,(75,52,95,96))
    front=over(terminal.masked(front,y>=56),terminal.masked(dome,y<57))
    # Trace only the vessel silhouette; the old polygon included neighboring
    # glass, brackets and chassis slivers that became visible during orbit.
    # Keep retained RGB and the original socket, motion and depth order.
    outline=np.array([(40,0),(51,3),(61,8),(70,14),(76,22),(79,32),
        (80,95),(83,108),(81,119),(76,129),(68,137),(59,143),
        (59,174),(21,174),(20,142),(13,136),(8,126),(7,115),
        (10,108),(10,101),(8,97),(6,82),(5,35),(7,22),(13,13),(24,6),(33,2)],float)
    front=terminal.masked(front,s.region(outline/4+[75.07,52.04]))
    centers=[(75,40,94),(94,40,94),(66,48,102),(104,48,102),(85,56,110)]
    vessels=[];caps=[]
    for cx,cy,floor in centers:
        shift=np.array([cx-85,cy-56])
        template=terminal.move(front,*shift)
        poly=np.array(frontpoly)+shift
        visible=terminal.masked(s.retained(poly),(y>=cy+6)&(y<=cy+31))
        vessels.append(template)
        cap_source=s.retained([(77,48),(93,48),(93,55),(77,55)])
        cap_source=terminal.masked(cap_source,((x-85)/7.7)**2+((y-51.4)/3.5)**2<=1)
        caps.append(terminal.move(cap_source,*shift))
    bodymask=np.logical_or.reduce([s.region(np.array(frontpoly)+[cx-85,cy-56]) for cx,cy,_ in centers])
    upper=s.retained([(66,40),(65,34),(70,28),(74,23),(76,18),(78,16),(79,7),(83,4),(87,4),(91,9),(92,21),(97,26),(103,33),(106,41),(99,44),(94,37),(89,32),(81,32),(75,36),(72,43)])
    coil=s.retained([(77,26),(77,9),(80,5),(85,3),(90,6),(93,12),(93,25),(88,29),(81,29)])
    collar=s.retained([(76,24),(80,20),(90,20),(95,25),(93,31),(88,34),(79,32),(75,28)])
    mast=world_floor(s,[(81,29),(89,29),(89,85),(81,85)])
    feetpolys=[[(45,94),(68,90),(75,95),(66,100),(46,100)],[(98,91),(122,94),(125,99),(101,102),(96,98)],[(64,104),(77,90),(83,96),(73,113),(65,117),(62,113)],[(89,96),(96,91),(112,112),(106,117),(98,110)]]
    feet=[s.retained(q) for q in feetpolys]
    groundpoly=[(46,97),(80,79),(122,97),(107,118),(75,119)]
    ground=world_floor(s,groundpoly)
    from scipy.ndimage import binary_fill_holes
    ground=terminal.masked(ground,binary_fill_holes(s.full[...,3]>=64))
    # The initial platform contains no completed outrigger fragments.
    lower=terminal.masked(s.full,(y>=78)&(y<=107)&(x>=60)&(x<=111))
    skirt_polys=[[(69,91),(80,94),(80,106),(73,104),(69,100)],
                 [(90,94),(101,91),(101,101),(94,106),(89,103)],
                 [(65,84),(73,85),(73,96),(67,96)],
                 [(98,85),(106,83),(106,95),(100,96)]]
    skirts=[s.retained(poly) for poly in skirt_polys]
    lower=terminal.masked(lower,~bodymask&~np.logical_or.reduce([s.region(poly) for poly in skirt_polys+feetpolys]))
    # The closed cage is assembled from complete curved ribs. Their endpoints
    # rotate apart around the same central collar before seating on the caps.
    arms=[s.retained(q) for q in [[(65,40),(65,35),(69,29),(75,23),(80,21),(82,25),(76,29),(72,35),(71,41)],[(89,22),(92,20),(99,27),(104,34),(106,41),(101,42),(99,35),(94,29)],[(81,29),(87,29),(87,49),(82,50)],[(74,33),(75,27),(80,23),(82,26),(79,31),(78,35)],[(90,25),(93,23),(99,30),(98,35),(94,34),(94,30)]]]
    retained_phases=read(CORRECTION/'selected-rigs-v4.json')[s.record['key']]['phases']
    for p in range(s.record['frames']):
        if p>=20:
            s.phases.append(copy.deepcopy(retained_phases[p]));continue
        nodes=s.terminal(p)
        if nodes is not None:s.phases.append(nodes);continue
        nodes=[];s.draw(nodes,ground,'fixed-five-port-platform',p,'FIXED_WORLD_UV_PLATFORM',ground=True)
        poses=reactor_orbit(p,centers)
        drop=float(np.interp(p,[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
                            [50,44.5,38,32,25,19,12.5,5.5,-1,-8,-7,-5,-4,-2.5,0]))
        vessel_layers=[]
        if p>=1:
            for i,(vessel,(cx,cy,floor),(motion,depth,angle)) in enumerate(zip(vessels,centers,poses)):
                displacement=motion+np.array([0,drop])
                layer=terminal.move(vessel,*displacement)
                socket_floor=100+depth-47
                socket_front=socket_floor+.38*np.sqrt(np.maximum(0,10**2-(x-cx-motion[0])**2))
                layer=terminal.masked(layer,y<=socket_front)
                vessel_layers.append((depth,i,layer,displacement,angle,socket_floor))
        def draw_vessels(rear):
            for depth,i,layer,displacement,angle,floor in sorted(vessel_layers,key=lambda item:item[0]):
                if (depth<47)!=rear:continue
                s.draw(nodes,layer,f'complete-glass-vessel-{i}',p,
                       'UPRIGHT_VESSEL_ORBITS_MAST_WHILE_RISING',translation=displacement.tolist(),
                       orbitRadians=angle,depth=depth,fixedFloor=floor,imagePlaneRotation=0)
        if 8<=p<20:
            hub=np.array([85.,102.+drop])
            shaft=gold_tube(s,[[85,79+drop],[85,92+drop],[85,102+drop]],2.5)
            s.draw(nodes,shaft,'carousel-central-spindle',p,'FIXED_SPINDLE_CONNECTS_ROTATING_VESSELS_TO_BASE')
            for depth,i,layer,displacement,angle,floor in sorted(vessel_layers,key=lambda item:item[0]):
                cx,cy,_=centers[i]
                neck=np.array([cx,cy+39])+displacement
                arm=gold_tube(s,[hub.tolist(),((hub+neck)/2+[0,-1]).tolist(),neck.tolist()],1.25)
                s.draw(nodes,arm,f'carousel-radial-support-{i}',p,
                       'RADIAL_SUPPORT_FOLLOWS_ITS_VESSEL_AROUND_SHARED_SPINDLE',orbitRadians=angle)
        draw_vessels(True)
        if p==0:
            for i,(cx,cy,floor) in enumerate(centers):
                motion,depth,_=poses[i]
                port=heavy.defense.ring(s,(cx+motion[0],99+depth-47),2.5,1.,.4)
                s.draw(nodes,port,f'closed-vessel-port-{i}',p,'FIVE_CLOSED_PORTS_BEFORE_GLASS_DOME_EMERGENCE')
        if p>=20:
            t=frac(p,19,21)
            for i,(foot,delta) in enumerate(zip(feet,[(20,0),(-20,0),(12,-17),(-12,-17)])):
                motion=np.array(delta)*(1-t)
                s.draw(nodes,terminal.move(foot,*motion),f'ground-outrigger-{i}',p,'COMPLETE_OUTRIGGER_SLIDES_OUT_FROM_INNER_FOOT',translation=motion.tolist())
        if p>=4:
            mastdrop=float(np.interp(p,[4,5,6],[50,25,0]))
            s.draw(nodes,s.translated(mast,mastdrop,99),'central-telescoping-mast',p,'COMPLETE_CENTRAL_MAST_RISES_FROM_PLATFORM')
            s.draw(nodes,terminal.move(collar,dy=mastdrop),'central-collar',p,'COLLAR_RISES_WITH_MAST')
        if p>=1:
            drop=float(np.interp(p,[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],[50,44.5,38,32,25,19,12.5,5.5,-1,-8,-7,-5,-4,-2.5,0]))
            if p>=8:
                lower_drop=drop
                s.draw(nodes,s.translated(lower,lower_drop,112),'complete-lower-mechanism',p,'COMPACT_RETAINED_NECKS_AND_CENTRAL_BASE_RISE_TOGETHER',translation=[0,lower_drop])
                for j,(panel,pivot) in enumerate(zip(skirts,[(75,93),(96,93),(69,86),(102,86)])):
                    t=frac(p,9,16)
                    layer=base.hinged(panel,(1-t)*1.25,pivot,s.rig.canvas,depth=0,axis_direction=(1,.12 if j%2 else -.12),fold_direction=(0,-1))
                    s.draw(nodes,s.translated(layer,lower_drop,112),f'lower-panel-{j}',p,'INDIVIDUAL_LOWER_PANEL_FOLDS_DOWN_FROM_ITS_OWN_NECK',fraction=t)
        draw_vessels(False)
        if p>=15:
            for i,cap in enumerate(caps):s.draw(nodes,terminal.move(cap,*poses[i][0]),f'vessel-gold-cap-{i}',p,'GOLD_CAP_FOLLOWS_ITS_ORBITING_GLASS_DOME')
        if p>=4:
            mastdrop=float(np.interp(p,[4,5,6],[50,25,0]));t=frac(p,16,20)
            if p<20:
                cage=s.cell(2,(74,10.5,96,36))
                cage[...,:3]=(cage[...,:3].astype(float)*.68).astype('uint8')
                if p<=16:s.draw(nodes,terminal.move(cage,dy=mastdrop),'closed-top-cage',p,'COMPLETE_CLOSED_CAGE_RISES_WITH_CENTRAL_MAST')
                elif p<=18:
                    remnant=terminal.masked(cage,y>=(17 if p==17 else 25))
                    s.draw(nodes,remnant,'opening-cage-lower-shell',p,'LOWER_CAGE_REMAINS_CONNECTED_WHILE_UPPER_PETALS_OPEN')
                for i,(cx,cy) in enumerate([(75,35),(94,35),(66,43),(104,43),(85,51)]):
                    cx,cy=np.array([cx,cy])+poses[i][0]
                    root_y=float(np.interp(p,[16,17,18,19,20],[11,12,17,25,25]))
                    spread=float(np.interp(p,[16,17,18,19,20],[0,.65,.85,.96,1]))
                    end=np.array([85+(cx-85)*spread,root_y+(cy-25)*float(np.interp(p,[16,17,18,19,20],[0,.2,.35,.7,1]))])
                    points=[[85,root_y],[85+(end[0]-85)*.4,root_y-1],[85+(end[0]-85)*.85,root_y+(end[1]-root_y)*.25],end.tolist()]
                    rib=gold_tube(s,points,.95)
                    if p>=17:s.draw(nodes,rib,f'opening-cage-rib-{i}',p,'CAGE_OPENS_OUTWARD_THEN_SEATS_DOWN_ON_FIVE_CAPS',fraction=t)
            if p>=16:
                emergence=float(np.interp(p,[16,17,18,19],[26,21,11,0]))
                active_coil=terminal.masked(coil,y>=13) if p<18 else coil
                s.draw(nodes,s.translated(active_coil,emergence,35),'red-central-coil',p,'COIL_RISES_THROUGH_CAGE_WITH_CAP_HIDDEN_UNTIL_PHASE_18')
                # Final curved arm artwork is installed only after these
                # opening ribs have seated. No collapsing affine arm overlay.
        if p==21:
            nodes=[];s.draw(nodes,s.full,'seated-complete-reactor',p,'EXACT_RETAINED_REACTOR_BEFORE_IDLE')
        elif p>=20:
            mask=~np.logical_or.reduce([s.region(q) for q in feetpolys])
            s.draw(nodes,terminal.masked(s.full,mask),'seated-complete-reactor-core',p,'EXACT_RETAINED_CORE_AND_PLATFORM_AFTER_CAGE_OPENING')
        s.phases.append(nodes)
    return s.finish()


def yaw_point(point, angle, origin=(53,75)):
    """Orthographic isometric ground rotation, with height handled separately."""
    q=np.asarray(point,float)-origin
    ground=np.array([[1,-1],[.5,.5]])
    rot=np.array([[np.cos(angle),-np.sin(angle)],[np.sin(angle),np.cos(angle)]])
    return ground@rot@np.linalg.inv(ground)@q+origin


def yaw_face(s, layer, polygon, height, angle):
    """One rigid planar face; source and target have the same world dimensions."""
    src=np.asarray(polygon,float)
    z=np.asarray(height,float)
    target=np.array([yaw_point(q+[0,h],angle)-[0,h] for q,h in zip(src,z)])
    mat=np.linalg.solve(np.column_stack((src[:3],np.ones(3))),target[:3]).T
    if abs(np.linalg.det(mat[:,:2]))<1e-6:return np.zeros_like(layer)
    return project_rgba(Image.fromarray(layer),np.column_stack((mat[:,:2]/4,mat[:,2])),s.rig.canvas)


def miner_turntable(s, phase):
    """Painted native-angle view, registered with four collar landmarks."""
    atlas_file=ORBIT/'miner-native-turntable-v1.png'
    registrations=read(ORBIT/'miner-native-turntable-v2-registration.json')
    row=registrations['phases'][str(phase)]
    atlas=Image.open(atlas_file).convert('RGBA')
    source=atlas.crop(row['cell'])
    from scipy.ndimage import label
    data=np.array(source);labels,n=label(data[...,3]>=32)
    areas=np.bincount(labels.ravel());areas[0]=0
    # Retain the connected building and its antialiased boundary, excluding
    # detached atlas flecks. This is alpha cleanup, not color-key subtraction.
    from scipy.ndimage import binary_dilation
    keep=binary_dilation(labels==areas.argmax(),iterations=1)
    data[...,3]=np.where(keep,data[...,3],0)
    layer=project_rgba(Image.fromarray(data),row['matrix'],s.rig.canvas)
    s.source.update(nativeTurntable=str(atlas_file),nativeTurntableSha256=sha(atlas_file),
                    nativeTurntableRegistration=str(ORBIT/'miner-native-turntable-v2-registration.json'))
    nodes=[]
    s.draw(nodes,layer,'complete-native-angle-miner',phase,
           'COMPLETE_PAINTED_NATIVE_POSE_WITH_FOUR_COLLAR_REGISTRATION',
           originalPose=phase,uniformScale=row['scale'],landmarkRms=row['landmarkRms'],
           nativeRingCenters=row['nativeRingCenters'],generatedRingCenters=row['generatedRingCenters'])
    return nodes


def miner(s):
    x,y=s.xx,s.yy
    # A complete unobstructed front vessel supplies all newly exposed back
    # surfaces. Each pipe, fixed red collar and silver shell is depth ordered
    # as one assembly; masks never remove a neighboring rear vessel.
    red=(s.full[...,0].astype(float)>s.full[...,1]*1.6)&(s.full[...,0].astype(float)>s.full[...,2]*1.6)
    shifts=[(-3,-18),(-18,-9),(14,-8),(0,0)]
    feet_polys=[[(0,76),(12,64),(15,66),(9,78),(7,83),(0,83)],[(21,88),(36,77),(39,79),(29,91),(23,93)],[(39,97),(54,83),(57,86),(48,101),(40,103)],[(88,72),(98,78),(98,83),(92,84),(85,78)]]
    feet=[s.retained(q) for q in feet_polys]
    stairs_poly=[(71,81),(79,78),(91,94),(88,100),(77,98)]
    stairs=s.retained(stairs_poly)
    pipe_polys=[np.array([(49,53),(51,51),(59,51),(62,53),(62,65),(49,65)])+[dx,dy] for dx,dy in shifts]
    pipe_mask=np.logical_or.reduce([s.region(q) for q in pipe_polys])
    hidden_file=ROOT/'yuri-mechanism-r102-v1/miner-hidden-surfaces-v1.png'
    # Measured matching red-collar centers establish one fixed similarity
    # registration. Generated pixels are used only underneath moving shafts.
    hidden=project_rgba(Image.open(hidden_file),read(hidden_file.with_name('miner-hidden-surfaces-v1-registration.json'))['registration'],s.rig.canvas)
    s.source.update(minerHiddenSurfaces=str(hidden_file),minerHiddenSurfacesSha256=sha(hidden_file))
    short_body=over(terminal.masked(s.full,~pipe_mask),terminal.masked(hidden,pipe_mask))
    static_foot_mask=np.logical_or.reduce([s.region(q) for q in feet_polys])
    closed_file=hidden_file.with_name('miner-closed-chassis-v1.png')
    closed=project_rgba(Image.open(closed_file),read(closed_file.with_name('miner-closed-chassis-v1-registration.json'))['registration'],s.rig.canvas)
    s.source.update(closedChassis=str(closed_file),closedChassisSha256=sha(closed_file))
    hidden_wall_mask=static_foot_mask|(s.region(stairs_poly)&(y>=85))
    body_bounds=s.region([(11,51),(49,32),(79,43),(92,66),(92,86),(55,98),(11,78)])
    fixed=heavy.largest_piece(over(terminal.masked(short_body,~hidden_wall_mask),terminal.masked(closed,hidden_wall_mask&body_bounds)))
    fixed=terminal.masked(fixed,body_bounds)
    s.miner_reference=short_body
    s.miner_closed=closed
    s.miner_tank_mask=np.logical_or.reduce([((x-cx)/12.5)**2+((y-(cy-19.5))/11.5)**2<=1 for cx,cy in [(52,73),(37,82),(69,83),(55,91)]])
    for p in range(s.record['frames']):
        nodes=s.terminal(p)
        if nodes is not None:
            s.phases.append(nodes)
            continue
        nodes=[]
        if p<8:
            nodes=miner_turntable(s,p)
        elif p==8:
            # The settled pre-telescope body already exists in phase 9. Fit
            # the complete painted object into the slightly narrower native
            # allocation instead of clipping a strip from its left edge.
            reference=CORRECTION/'selected-preview-v4'/s.record['key']/'09-preview.png'
            layer=np.array(Image.open(reference).convert('RGBA'))
            yy,xx=np.where(layer[...,3]>=8)
            lo=np.array([xx.min(),yy.min()])/4;hi=(np.array([xx.max(),yy.max()])+1)/4
            origin=np.array(s.rig.logical[p]['trimOrigin']);size=np.array(s.rig.logical[p]['trimSize'])
            scale=min(1.,*((size-.75)/(hi-lo)))
            shift=np.clip((1-scale)*(lo+hi)/2,origin+.375-scale*lo,origin+size-.375-scale*hi)
            layer=project_rgba(Image.fromarray(layer),[[scale/4,0,shift[0]],[0,scale/4,shift[1]]],s.rig.canvas)
            s.draw(nodes,layer,'complete-settled-miner',p,'COMPLETE_RETAINED_PHASE9_BODY_REGISTERED_WITHOUT_EDGE_CUTS',
                   scale=float(scale),translation=shift.tolist(),referenceImage=str(reference),referenceSha256=sha(reference))
        else:
            if p>=10:
                t=frac(p,9,14)
                for i,(foot,travel) in enumerate(zip(feet,[(8,-9),(10,-6),(11,-12),(-8,-6)])):
                    motion=np.array(travel)*(1-t)
                    s.draw(nodes,terminal.move(foot,*motion),f'complete-outrigger-{i}',p,'RIGID_OUTRIGGER_EXTENDS_FROM_FIXED_CHASSIS_BEARING',translation=motion.tolist())
            s.draw(nodes,fixed,'fixed-retained-body',p,'EXACT_RETAINED_TOP_AND_SIDES_EXCEPT_MOVING_SHAFTS')
            t=frac(p,10,16)
            for i,((dx,dy),poly) in enumerate(zip(shifts,pipe_polys)):
                drop=(1-t)*9
                own_pipe=terminal.masked(s.retained(poly),~red)
                layer=s.translated(own_pipe,drop,65+dy)
                s.draw(nodes,layer,f'complete-telescoping-vessel-{i}',p,'PIPE_RISES_THROUGH_ITS_OWN_FIXED_COLLAR_AND_SHELL',translation=[dx,dy],pipeDrop=drop)
                own_collar=terminal.masked(s.full,s.region(np.array([(47,63),(50,61),(59,61),(63,63),(64,67),(62,69),(55,71),(48,69)])+[dx,dy])&red)
                s.draw(nodes,own_collar,f'exact-retained-collar-{i}',p,'RETAINED_COLLAR_OCCLUDES_ONLY_ITS_MOVING_PIPE')
            if p>=14:
                t=frac(p,14,16)
                layer=base.hinged(stairs,(1-t)*1.3,(75,82),s.rig.canvas,depth=0,axis_direction=(1,-.5),fold_direction=(0,-1),ground_plane=True)
                s.draw(nodes,layer,'complete-front-staircase',p,'STEPS_ROTATE_DOWN_FROM_FRONT_DOOR_HINGE',fraction=t)
        assert nodes,(s.record['key'],p,'Empty authored phase')
        s.phases.append(nodes)
    return s.finish()


def main():
    parser=argparse.ArgumentParser();parser.add_argument('output',type=Path);parser.add_argument('--families',default='YAPOWR,YABRCK,YAGGUN,YAREFN');parser.add_argument('--theater',default='')
    args=parser.parse_args();args.output.mkdir(exist_ok=False);source=args.output/'authoring-source.py';shutil.copy2(__file__,source)
    rigs={}
    for rec in read(AUTHORITY)['families']:
        if rec['identity'] not in args.families.split(',') or args.theater and rec['theater']!=args.theater:continue
        s=Scene(rec,args.output/rec['key'],source)
        rigs[rec['key']]={'YAPOWR':reactor,'YABRCK':barracks,'YAGGUN':gatling,'YAREFN':miner}[rec['identity']](s)
        print(rec['key'],len(s.violations),'violations',flush=True)
    write(args.output/'rigs.json',rigs)


if __name__=='__main__':main()
