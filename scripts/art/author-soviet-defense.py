"""Original-phase defense mechanisms with independent retained HD components."""
import argparse
import copy
import shutil
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt

from buildup import native_indices, read, sha, write
from painted_rig import over, place, project_rgba, vector_coverage

art = SourceFileLoader('defense_art', 'scripts/art/author-soviet-original.py').load_module()
base, terminal = art.base, art.terminal
ROOT = Path('.artifacts/buildup-remaining-20261013-r74-v1')
BATCH = ROOT / 'soviet-defense-r92-v1'
AUTHORITY = ROOT / 'soviet-component-rebuild-r91-v1/selected-v1/authoring.json'


class Scene(art.Scene):
    def __init__(self, record, output):
        reference = BATCH / ('reference-' + record['theater'].lower() + '-v1/report.json')
        self.rig, self.full = base.parts.seed_rig(record, reference, output)
        self.record, self.output, self.origin = record, output, np.zeros(2)
        self.file = BATCH / 'hidden-materials-v1.png'
        atlas = Image.open(self.file).convert('RGBA')
        w, h = atlas.width // 2, atlas.height // 2
        self.materials = [atlas.crop((i % 2*w, i // 2*h, (i % 2+1)*w, (i // 2+1)*h)) for i in range(4)]
        self.yy, self.xx = np.mgrid[:self.full.shape[0], :self.full.shape[1]] / 4
        self.phases, self.checks, self.violations = [], [], []
        self.diagnostic = True
        self.owner_allowed = [bool(((native_indices(self.rig.raw,p)>=16)&(native_indices(self.rig.raw,p)<32)).any()) for p in range(record['frames'])]
        self.reference = read(reference)['cases'][record['identity']]
        self.source = {'code':__file__, 'sha256':sha(__file__), 'material':str(self.file), 'materialSha256':sha(self.file)}

    def put(self, nodes, layer, name, phase, method, **details):
        self.emit(nodes,layer,name,phase,method,source=self.source,
                  originalPhase=phase, originalSourceSha256=sha(self.record['nativeSource']), **details)

    def envelope(self, layer, phase):
        clipped = base.parts.clipped(self.rig, layer, phase)
        lost = (layer[...,3] >= 8) & (clipped[...,3] == 0)
        if lost.any():
            self.checks.append({'phase':phase, 'envelopeRemovedOpaquePixels':int(lost.sum())})
        return clipped

    def translated(self, layer, drop, ground):
        return terminal.masked(terminal.move(layer,dy=drop),self.yy<=ground)

    def poly(self, points, color):
        rgba = np.zeros_like(self.full)
        rgba[self.region(points)] = color
        return rgba


def ring(s, center, radius, inner, thickness=1.4):
    """A closed annular steel surface and front extrusion in one camera."""
    cx,cy = center
    image=Image.new('RGBA',(s.rig.canvas[0]*8,s.rig.canvas[1]*8));d=ImageDraw.Draw(image)
    def ellipse(rx,ry,dy,color):d.ellipse(((cx-rx)*8,(cy-ry+dy)*8,(cx+rx)*8,(cy+ry+dy)*8),fill=color)
    ellipse(radius,radius*.46,thickness,(49,52,56,255))
    ellipse(radius,radius*.46,0,(191,196,204,255))
    ellipse(radius-.65,(radius-.65)*.46,0,(107,113,123,255))
    ellipse(inner,inner*.46,0,(31,33,36,255))
    ellipse(inner-.7,(inner-.7)*.46,.8,(67,70,77,255))
    for angle in np.linspace(0,2*np.pi,9)[:-1]:
        x=cx+(radius+inner)/2*np.cos(angle);y=cy+(radius+inner)/2*.46*np.sin(angle)
        d.ellipse((x*8-2,y*8-2,x*8+2,y*8+2),fill=(224,227,233,255))
    return np.array(image.resize((s.rig.canvas[0]*4,s.rig.canvas[1]*4),Image.Resampling.LANCZOS))


def bunker(s):
    x,y=s.xx,s.yy
    upper=s.retained([(36,59),(44,40),(72,39),(93,49),(93,64),(85,74),(58,80),(36,69)])
    red=(s.full[...,0].astype(float)>s.full[...,1]*1.7)&(s.full[...,0].astype(float)>s.full[...,2]*1.7)
    upper=terminal.masked(upper,~red)
    # Separate external anchors before creating the complete lower shell.
    feet=[s.retained(poly) for poly in [
        [(24,69),(39,71),(39,82),(24,82)],[(32,86),(44,83),(50,88),(47,98),(33,103)],
        [(64,91),(75,90),(79,101),(79,110),(66,110)],[(89,82),(104,83),(105,95),(89,97)]]]
    feet_mask=np.logical_or.reduce([p[...,3]>0 for p in feet])
    roof = s.retained([(38,64),(48,58),(80,58),(92,66),(85,79),(60,85),(37,75)])
    roof = terminal.masked(roof,upper[...,3]==0)
    # A closed roof remains underneath the retracting inner tower.
    cover=art.material_quad(s,0,[(38,69),(63,57),(90,68),(61,82)],(45,26),.80)
    roof=over(roof,cover)
    walls=terminal.masked(s.full,~(upper[...,3]>0)&~feet_mask)
    lower=over(roof,walls)
    # Reconstruct surfaces hidden by the fully extended anchors.
    for poly in [[(34,72),(61,85),(61,104),(29,88)],[(61,85),(97,67),(101,87),(61,104)]]:
        patch=art.material_quad(s,1,poly,(30,13),.67)
        patch=terminal.masked(patch,feet_mask)
        lower=over(lower,patch)
    outer=np.array([(26,88),(38,69),(69,66),(101,80),(93,99),(58,107)],float)
    inner=(outer-[63,87])*.78+[63,87]
    foundation=s.poly(outer,(85,91,100,255));foundation=terminal.masked(foundation,~s.region(inner))
    texture=art.material_quad(s,0,[(23,65),(104,65),(104,109),(23,109)],(81,44),.68)
    texture[...,3]=np.minimum(texture[...,3],foundation[...,3]);foundation=texture
    # The first phases expose only a complete empty rim, without wall fragments.
    foundation=terminal.masked(foundation,s.region(outer))
    lower_drop=[0]*7+[13,13,12,11,9,7,5,3,0,0,0,0,0,0,0,0,0,0]
    upper_drop=[0]*7+[29,28,26,24,22,20,18,16,14,14,14,14,13,10,7,3,1,0]
    for p in range(25):
        nodes=s.terminal(p)
        if nodes is not None:s.phases.append(nodes);continue
        nodes=[]
        if p<=6:
            scale=[.045,.17,.40,.68,.92,1,1][p]
            layer=art.affine_about(s,foundation,[[scale,0],[0,scale]],(64,88))
            # The Original's first phase has only two subpixel foundation seeds.
            s.put(nodes,s.envelope(layer,p),'expanding-foundation',p,'ORIGINAL_RADIAL_FOUNDATION_EXPANSION',scale=scale)
        else:
            s.put(nodes,foundation,'fixed-foundation',p,'FIXED_WORLD_FOUNDATION',ground=True)
            drop=lower_drop[p]
            contact=np.max(np.where(s.region(outer),y,-1),axis=0)[None,:]
            layer=s.translated(lower,drop,contact)
            if p>=19:
                layer=lower
                socket=art.material_quad(s,0,[(27,89),(65,70),(103,89),(65,108)],(76,38),.65)
                socket=terminal.masked(socket,feet_mask & (y>=98-.4*np.abs(x-62)))
                layer=over(layer,socket)
            if p>=20:layer=terminal.masked(s.full,~(upper[...,3]>0))
            s.put(nodes,s.envelope(layer,p),'lower-armored-wall-and-roof',p,'RIGID_VERTICAL_EMERGENCE_THROUGH_FIXED_FOOTPRINT',translation=[0,drop])
            top_part=upper
            if p==7:
                cavity=np.array([(49,50),(68,47),(79,53),(74,61),(59,65),(46,59)],float)
                top_part=terminal.masked(upper,~s.region(cavity))
                # The initial hatch remains open until the next native phase.
                for node in list(nodes):
                    if node['name']=='lower-armored-wall-and-roof':nodes.remove(node)
                layer=terminal.masked(layer,~s.region(cavity+[0,upper_drop[p]]))
                s.put(nodes,s.envelope(layer,p),'lower-armored-wall-and-roof-open',p,'OPEN_CAVITY_BEFORE_INNER_FLOOR_EMERGENCE')
            top=terminal.move(top_part,dy=upper_drop[p])
            top=terminal.masked(top,y<=80+drop-.25*np.abs(x-62))
            s.put(nodes,s.envelope(top,p),'upper-telescoping-tower',p,'RIGID_INNER_TOWER_RISES_THROUGH_LOWER_ROOF',translation=[0,upper_drop[p]])
            if p<19:
                front=terminal.masked(foundation,y>=93-.40*np.abs(x-62))
                s.put(nodes,front,'foundation-front-occluder',p,'FIXED_FRONT_RIM_OCCLUDES_EMERGING_WALL_FOOT')
            if 17<=p<20:
                travel=max(0,1-(p-17)/3)
                for i,(foot,delta) in enumerate(zip(feet,[(6,3),(5,-3),(-2,-7),(-7,3)])):
                    motion=np.array(delta)*travel
                    anchor=terminal.move(foot,*motion)
                    if p<21:anchor=terminal.masked(anchor,~s.region([(36,87),(44,64),(72,61),(94,74),(88,96),(60,102)]))
                    s.put(nodes,anchor,f'anchor-{i}',p,'RIGID_ANCHOR_PUSHES_OUTWARD_FROM_WALL',translation=motion.tolist())
        s.phases.append(nodes)
    return s.finish()


def tesla(s):
    x,y=s.xx,s.yy
    ball=terminal.masked(s.full,y<24.5)
    # Ring/insulator groups keep their diameter while moving on the center shaft.
    tiers=[terminal.masked(s.full,(y>=lo)&(y<hi)) for lo,hi in [(24.5,37.5),(37.5,45.5),(45.5,54.5)]]
    red=(s.full[...,0].astype(float)>s.full[...,1]*1.7)&(s.full[...,0].astype(float)>s.full[...,2]*1.7)
    tiers=[terminal.masked(t,~red) for t in tiers]
    feet=[s.retained(poly) for poly in [
        [(60,56),(69,51),(76,53),(74,63),(69,66),(66,78),(60,80)],
        [(69,63),(76,61),(81,66),(79,88),(70,90),(68,88)],
        [(85,57),(90,58),(99,64),(99,89),(92,89),(88,80),(85,75)]]]
    for i,region in enumerate([x<74,(x>=74)&(x<83),x>=83]):
        feet[i]=over(feet[i],terminal.masked(s.full,red&region))
    footmask=np.logical_or.reduce([p[...,3]>0 for p in feet])
    lower=terminal.masked(s.full,(y>=54.5)&~footmask)
    foundation=art.material_quad(s,3,[(62,78),(73,67),(96,73),(85,86)],(34,20),.78)
    foundation=over(terminal.masked(lower,y>=81-.3*np.abs(x-80)),foundation)
    # The narrow black core is concealed by the traveling conducting shell.
    shaft=s.retained([(75,51),(84,51),(86,78),(75,78)])
    # Native stationary early core and independently climbing closed shell.
    lower_ring=terminal.move(tiers[2],dy=17)
    upper_ring=terminal.move(tiers[1],dy=3)
    core=s.poly([(75,45),(83,45),(84,68),(74,68)],(40,43,48,255))
    tile=np.array(s.materials[2].resize((40,100)))
    for yy in range(46*4,68*4):
        for xx in range(75*4,84*4):
            light=.35+.65*np.sin((xx/4-75)/9*np.pi)
            core[yy,xx,:3]=np.clip(tile[(yy-184)%100,(xx-300)%40,:3]*light,0,255)
    top_disk=terminal.move(terminal.masked(s.full,(y>=45)&(y<50)),dy=3)
    ball_top=[0]*10+[67,65,62,58,54,50,45,40,35,31,26,18,14,9,4]
    # The retained right-hand crop contains both near and far supports. Split
    # that crop in source coordinates before translating either depth layer.
    right_front=s.region([(90.25,58),(100,63),(101,92),(86,92),
                          (86,78),(88,72),(88,60)])
    support_parts=[(0,feet[0],'rear-left','rear'),
                   (2,terminal.masked(feet[2],~right_front),'rear-right','rear'),
                   (1,feet[1],'front-left','front'),
                   (2,terminal.masked(feet[2],right_front),'front-right','front')]

    def supports(nodes,phase,depth):
        for i,foot,name,part_depth in support_parts:
            if part_depth!=depth:continue
            drop=max(0,(18+(1 if i==0 else -1 if i==2 else 0)-phase)*4)
            # Keep the original shared crop's ground contact and trajectory.
            contact=np.max(np.where(feet[i][...,3]>0,y,-1),axis=0)[None,:]
            layer=s.translated(foot,drop,contact)
            s.put(nodes,s.envelope(layer,phase),'red-support-'+name,phase,
                  'RIGID_SUPPORT_RISES_THROUGH_FOUNDATION',translation=[0,drop],depth=depth)

    def conductor(nodes,phase,depth):
        drop=ball_top[phase]-4
        sphere=terminal.move(ball,dy=drop)
        if phase<15:sphere=terminal.masked(sphere,y<=77)
        if phase<20:sphere=s.envelope(sphere,phase)
        # The axial column enters the upper bowl. Its near curved rim and
        # lower shell obscure the column below the opening, not above it.
        rim=drop+10+.25*np.sqrt(np.maximum(0,7**2-(x-79)**2))
        near=y>=rim
        layer=terminal.masked(sphere,near if depth=='front' else ~near)
        s.put(nodes,layer,'spherical-conductor-'+depth,phase,
              'RIGID_SPHERE_SLIDES_AROUND_CENTER_COLUMN',translation=[0,drop],depth=depth)

    for p in range(25):
        nodes=s.terminal(p)
        if nodes is not None:s.phases.append(nodes);continue
        nodes=[]
        if p>=20:
            conductor(nodes,p,'rear')
            s.put(nodes,s.envelope(terminal.masked(s.full,y>=24.5),p),'completed-lower-assembly',p,'EXACT_RETAINED_LOWER_ASSEMBLY')
            conductor(nodes,p,'front')
            s.phases.append(nodes);continue
        s.put(nodes,foundation,'fixed-concrete-foundation',p,'WORLD_REGISTERED_CONCRETE_FOUNDATION',ground=True)
        if p<=9:
            if p:
                bulb_y=[79,76,71,65,61,56,54,54,54,54][p]
                # Closed black insulator: complete curved surface, no open tube.
                u=(x-79)/4.8;v=(y-bulb_y)/5.5;disk=u*u+v*v<=1
                z=np.sqrt(np.maximum(0,1-u*u-v*v));light=np.clip(-u*.45-v*.55+z*.7,0,1)
                highlight=np.maximum(0,-u*.4-v*.65+z*.55)**18
                bulb=np.zeros_like(s.full);tone=16+light*48+highlight*90
                bulb[...,:3]=np.clip(tone[...,None]*[.88,.95,1.08],0,255);bulb[...,3]=disk*255
                bulb[~disk]=0
                lower_y=[0,78,76,73,70,68,66,66,66,66][p]
                bottom=terminal.move(tiers[2],dy=lower_y-49)
                lowcore=terminal.move(core,dy=max(0,lower_y-66))
                lowcore=terminal.masked(lowcore,(y>=bulb_y)&(y<=lower_y))
                early=over(bulb,over(bottom,lowcore))
                if p>=4:
                    top_y=[0,0,0,0,63,57,43,43,43,43][p]
                    top=ring(s,(79,top_y+3),7.8,3.5,1.2)
                    connector=terminal.masked(core,(y>=top_y+3)&(y<=bulb_y))
                    early=over(top,over(early,connector))
                    if p>=8:early=over(ring(s,(79,50 if p==8 else 49),7.8,3.5,1.2),early)
                early=terminal.masked(early,y<=78)
                s.put(nodes,s.envelope(early,p),'early-insulator-and-sliding-collars',p,'CLOSED_INSULATOR_AND_INDEPENDENT_NATIVE_RING_EMERGENCE',bulbCenter=bulb_y,lowerCollarCenter=lower_y)
        else:
            supports(nodes,p,'rear')
            conductor(nodes,p,'rear')
            lower_drop=max(0,(17-p)*2)
            s.put(nodes,s.envelope(s.translated(lower,lower_drop,86),p),'retained-lower-insulator',p,'LOWER_INSULATOR_RISES_THROUGH_FIXED_FOUNDATION',translation=[0,lower_drop])
            connector=art.material_quad(s,2,[(76.8,32),(81.4,32),(81.4,78),(76.8,78)],(5,46),.8)
            connector=terminal.masked(connector,y>=max(32,s.rig.logical[p]['trimOrigin'][1]+4))
            s.put(nodes,over(shaft,connector),'center-shaft',p,'CONTINUOUS_CENTER_SHAFT_BEHIND_ALL_TRAVELING_RINGS')
            # Crown discs initially travel as a stack then settle around the shaft.
            stack=[{10:4,11:4,12:4,13:4,14:3,15:-2,16:-2,17:-3,18:-2}.get(p,0),max(0,4-(p-10)),max(0,4-(p-10))]
            for i,(tier,drop) in enumerate(zip(tiers,stack)):
                if i==0 and p<17:tier=terminal.masked(tier,y>=30)
                s.put(nodes,s.envelope(terminal.move(tier,dy=drop),p),f'coil-tier-{i}',p,'INDEPENDENT_RIGID_RING_STACK_TRAVEL',translation=[0,drop])
            conductor(nodes,p,'front')
            supports(nodes,p,'front')
        s.phases.append(nodes)
    return s.finish()


def flak(s):
    x,y=s.xx,s.yy
    ref=read(BATCH/'naflak-turret-reference-v1.json')
    turret=project_rgba(Image.open(ref['image']),[[.25,0,ref['origin'][0]],[0,.25,ref['origin'][1]]],s.rig.canvas)
    barrel=terminal.masked(turret,(y<33)|s.region([(54,31),(62,24),(81,24),(72,36),(65,42),(59,39)]))
    receiver=terminal.masked(turret,barrel[...,3]==0)
    feet=[s.retained(poly) for poly in [
        [(38,42),(44,43),(55,49),(52,55),(33,49),(32,44)],
        [(66,49),(83,43),(89,45),(89,51),(70,57)],
        [(30,58),(51,51),(58,57),(36,67),(30,66)],
        [(62,58),(68,54),(80,65),(80,73),(73,74),(57,62)]]]
    mask=np.logical_or.reduce([p[...,3]>0 for p in feet])
    center=terminal.masked(s.full,((x-59)/11)**2+((y-55)/7)**2<=1)
    # A complete center bearing is visible before the four outriggers unfold.
    center=over(center,ring(s,(59,56),8.2,3,2))
    pivots=[(54,52),(66,53),(53,56),(64,58)]
    for p in range(9):
        nodes=s.terminal(p)
        if nodes is not None:s.phases.append(nodes);continue
        nodes=[]
        s.put(nodes,s.envelope(center if p<4 else s.full,p),'fixed-center-bearing',p,'FIXED_WORLD_CENTER_BEARING')
        for i,(foot,pivot) in enumerate(zip(feet,pivots)):
            if p>=4:continue
            t=min(1,max(0,p/4));angle=(1-t)*np.pi/2
            direction=np.array(pivot,dtype=float)-np.array([59,55]);direction/=np.linalg.norm(direction)
            axis=np.array([direction[1],-direction[0]])
            layer=base.hinged(foot,angle,pivot,s.rig.canvas,depth=0,axis_direction=axis,fold_direction=(0,-1.2))
            s.put(nodes,s.envelope(layer,p),f'outrigger-{i}',p,'RIGID_OUTRIGGER_ROTATES_DOWN_ABOUT_FIXED_HINGE',angleRadians=angle,pivot=list(pivot))
        drop=[19,15,11,7,3,0,0,0][p]
        rec=s.translated(receiver,drop,60)
        angle=np.deg2rad([-25,-25,-25,-25,-25,-25,-17,-8][p])
        moving=base.rotate(barrel,angle,(62,39),s.rig.canvas)
        tip=np.where(moving[...,3]>=8)[0].min()/4
        barrel_drop=[30,24,18,13,8,5,4,5][p]-tip
        moving=terminal.masked(terminal.move(moving,dy=barrel_drop),y<=58)
        s.put(nodes,s.envelope(moving,p),'barrel-and-recoil-cylinder',p,'RIGID_GUN_PITCH_AROUND_RETAINED_ELEVATION_PIVOT',angleRadians=angle,pivot=[62,39],translation=[0,barrel_drop])
        s.put(nodes,s.envelope(rec,p),'gun-elevation-cradle',p,'RIGID_CRADLE_RISES_THROUGH_CENTER_BEARING',translation=[0,drop])
        s.phases.append(nodes)
    result=s.finish();result['retainedTurretReference']=ref
    return result


def main():
    parser=argparse.ArgumentParser();parser.add_argument('output',type=Path);parser.add_argument('--families',default='NAFLAK,TESLA,NABNKR');args=parser.parse_args()
    args.output.mkdir(exist_ok=False);shutil.copy2(__file__,args.output/'authoring-source.py')
    selected={}
    for rec in read(AUTHORITY)['families']:
        if rec['identity'] not in args.families.split(',') or rec['theater'] not in ['TEMPERATE','SNOW']:continue
        scene=Scene(rec,args.output/rec['key']);selected[rec['key']]={'NAFLAK':flak,'TESLA':tesla,'NABNKR':bunker}[rec['identity']](scene)
        print(rec['key'],len(scene.violations),'geometry violations',flush=True)
    write(args.output/'rigs.json',selected)


if __name__=='__main__':main()
