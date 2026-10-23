"""Rebuild four Soviet mechanisms against individually measured Original phases."""
import argparse
import copy
import shutil
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter
from scipy.spatial import ConvexHull

from buildup import native_indices, read, sha, write
from painted_rig import bounds, over, place, vector_coverage
from retained_idle import display

base = SourceFileLoader('soviet_infrastructure','scripts/art/author-infrastructure.py').load_module()
original = SourceFileLoader('soviet_original','scripts/art/author-infrastructure-original.py').load_module()
terminal, parts = base.terminal, base.parts
SOURCE = None
GUIDES = {}


class Scene(base.Scene):
    def __init__(self, record, assets, reference, output, diagnostic=False):
        self.rig, self.full = parts.seed_rig(record,reference,output)
        self.record, self.output = record,output
        self.file = assets/(record['identity'].lower()+'-components-v1.png')
        self.kit = base.complete_atlas(self.file)
        for key,(image,bb) in self.kit.items():
            rgba=np.array(image);rgba[...,3][rgba[...,3]>=230]=255
            self.kit[key]=(Image.fromarray(rgba),bb)
        self.origin=(np.asarray(self.rig.canvas)-[238,178])/2 if record['identity']=='NATECH' else np.array([0.,0.])
        self.yy,self.xx=np.mgrid[:self.full.shape[0],:self.full.shape[1]]/4
        self.xx-=self.origin[0];self.yy-=self.origin[1]
        self.phases,self.checks,self.violations=[],[],[]
        self.diagnostic=diagnostic
        self.owner_allowed=[]
        for p in range(record['frames']):
            ix=native_indices(self.rig.raw,p)
            self.owner_allowed.append(bool(((ix>=16)&(ix<32)).any()))
        self.structure=self.full
        self.reference=read(reference)['cases'][record['identity']]
        self.member_cache={}
        material_file=Path('.artifacts/buildup-remaining-20261013-r74-v1/soviet-original-r89-v1/structural-surfaces-v1.png')
        atlas=Image.open(material_file).convert('RGBA');cw,ch=atlas.width//2,atlas.height//2
        self.materials=[atlas.crop((i%2*cw,i//2*ch,(i%2+1)*cw,(i//2+1)*ch)) for i in range(4)]

    def member_layer(self,suffix,exclude=False):
        key=(suffix,exclude)
        if key not in self.member_cache:
            names=[g['sourceMember'] for g in self.reference['poseCheck']['initialIdleGeometry']]
            selected=names[0] if suffix=='main' else next(n for n in names if n.endswith(suffix+'.shp'))
            removed=[selected] if exclude else [n for n in names if n!=selected]
            self.member_cache[key]=display(self.rig.record,exclude_members=removed)
        return self.member_cache[key]

    def put(self,nodes,layer,name,phase,method,**details):
        details.update(originalPhase=phase, originalGeometrySha256=sha(self.record['nativeSource']))
        self.emit(nodes,layer,name,phase,method,source=SOURCE,**details)

    def region(self,polygon):
        return terminal.polygon(self.full.shape,(np.asarray(polygon)+self.origin).tolist())

    def retained(self,polygon):
        return terminal.masked(self.full,self.region(polygon))

    def fitted(self,cell,box):
        x,y=self.origin
        return place(self.kit[cell][0],np.asarray(box)+[x,y,x,y],self.rig.canvas)

    def rise(self,layer,drop,socket):
        return terminal.masked(terminal.move(layer,dy=drop),self.yy<socket)

    def floor_texture(self,cell=0):
        image=self.kit[cell][0]
        tile=np.array(image.crop((round(image.width*.35),round(image.height*.34),
                                 round(image.width*.55),round(image.height*.48))).convert('RGBA'))
        tile[...,3]=255
        repeats=(self.full.shape[0]//tile.shape[0]+1,self.full.shape[1]//tile.shape[1]+1,1)
        return np.tile(tile,repeats)[:self.full.shape[0],:self.full.shape[1]].copy()

    def native(self,phase):
        ix=native_indices(self.rig.raw,phase)
        return ix,np.asarray(self.record['palette'],float)[ix]

    def reveal_floor(self,master,phase,minimum_y):
        ix=native_indices(self.rig.raw,phase)
        rgb=np.asarray(self.record['palette'],float)[ix]
        yy,xx=np.indices(ix.shape,dtype=float)
        yy-=self.origin[1];xx-=self.origin[0]
        coverage=(ix>31)&(yy>=minimum_y)&(rgb[...,0]>rgb[...,2]*1.06)
        coverage&=(rgb[...,1]>rgb[...,2]*1.01)&(rgb[...,0]<rgb[...,1]*1.65)
        points=np.column_stack(np.where(coverage)[::-1])
        if len(points)>=3:
            try:
                hull=points[ConvexHull(points).vertices]
                matte=Image.new('1',tuple(self.rig.canvas))
                ImageDraw.Draw(matte).polygon([tuple(p) for p in hull],fill=1)
                alpha=vector_coverage(np.array(matte))
                result=master.copy();result[...,3]=np.minimum(result[...,3],alpha)
                result[result[...,3]==0]=0
                return result
            except Exception:
                pass
        return np.zeros_like(master)


    def original_owner(self,phase,region):
        ix,_=self.native(phase)
        y,x=np.indices(ix.shape,dtype=float);x-=self.origin[0];y-=self.origin[1]
        return (ix>=16)&(ix<32)&region(x,y)

    def red_plates(self,phase,region):
        mask=self.original_owner(phase,region)
        alpha=vector_coverage(mask)
        layer=np.zeros_like(self.full)
        y,x=np.indices(alpha.shape,dtype=float)
        value=155+13*np.sin(x/17)+7*np.cos(y/13)
        layer[...,0]=np.clip(value,0,255);layer[...,1]=8;layer[...,2]=6;layer[...,3]=alpha
        layer[alpha==0]=0
        return layer

    def marker_top(self,phase,region,fallback):
        mask=self.original_owner(phase,region)
        y,x=np.where(mask)
        return float(y.min()-self.origin[1]) if len(y) else fallback

    def project(self,layer,source,target):
        offset=self.origin
        return original.quad(layer,np.asarray(source)+offset,np.asarray(target)+offset,self.rig.canvas)


def closed_surface(s,layer,region,color=(125,119,100)):
    y,x=np.mgrid[:layer.shape[0],:layer.shape[1]]
    texture=s.floor_texture()
    values=texture[...,:3].astype(float)
    luminance=np.mean(values,axis=-1)
    values=np.asarray(color)[None,None,:]+(luminance-luminance.mean())[...,None]*.16
    fill=np.zeros_like(layer);fill[...,:3]=np.clip(values,0,255);fill[...,3]=np.asarray(region,dtype=np.uint8)*255
    return over(layer,fill)


def material_quad(s,cell,quad,span=(32,32),shade=1):
    w,h=span
    raw=s.materials[cell].resize((round(w*4),round(h*4)),Image.Resampling.LANCZOS)
    layer=place(raw,(0,0,w,h),s.rig.canvas)
    if shade!=1:layer[...,:3]=np.clip(layer[...,:3].astype(float)*shade,0,255).astype('uint8')
    result=original.quad(layer,[(0,0),(w,0),(w,h),(0,h)],np.asarray(quad)+s.origin,s.rig.canvas)
    alpha=terminal.polygon(s.full.shape,np.asarray(quad)+s.origin).astype('uint8')*255
    result[...,3]=np.minimum(result[...,3],alpha);result[result[...,3]==0]=0
    return result


def prism(s,texture,source_quad,target_quad,source_depth,target_depth):
    # Complete masonry planes use painted UV surfaces. Missing reverse faces
    # are authored geometry, rather than stretched silhouettes from a cutout.
    outer=np.asarray(target_quad,float);down=np.asarray(target_depth,float)
    center=outer.mean(axis=0);inner=outer*.72+center*.28
    result=np.zeros_like(texture)
    # A closed dark floor prevents transparent background through the well.
    bottom=inner+down*.82
    result=over(material_quad(s,3,bottom,(22,25),.5),result)
    edges=[(0,1),(1,2),(3,0)] if s.record['identity']=='NADEPT' else [(0,1),(1,2),(2,3),(3,0)]
    for a,b in edges:
        face=[inner[a],inner[b],inner[b]+down*.82,inner[a]+down*.82]
        result=over(material_quad(s,1,face,(26,36),.75),result)
    for a,b in ([(1,2),(3,0)] if s.record['identity']=='NADEPT' else [(1,2),(2,3),(3,0)]):
        face=[outer[a],outer[b],outer[b]+down,outer[a]+down]
        result=over(material_quad(s,0 if a==3 else 1,face,(26,36),1),result)
    for a,b in edges:
        result=over(material_quad(s,2,[outer[a],outer[b],inner[b],inner[a]],(26,3)),result)
    if s.record['identity']=='NADEPT' and getattr(s,'active_phase',0)>=7:
        paint=Image.new('RGBA',(s.rig.canvas[0]*4,s.rig.canvas[1]*4));draw=ImageDraw.Draw(paint)
        for a,b in [(3,0),(1,2)]:
            q=[outer[a]*.8+inner[a]*.2,outer[b]*.8+inner[b]*.2,outer[b]*.25+inner[b]*.75,outer[a]*.25+inner[a]*.75]
            draw.polygon([tuple((point+s.origin)*4) for point in q],fill=(190,5,4,255))
        result=over(np.asarray(paint),result)
    return result


def interpolate_table(phase,values):
    return float(values[phase])


def matched_slab(s,master,p,minimum_y,name,nodes):
    s.put(nodes,s.reveal_floor(master,p,minimum_y),name,p,
          'HD_WORLD_UV_ON_MATCHING_ORIGINAL_PHASE_FOUNDATION',ground=True)


def affine_about(s,layer,matrix,pivot,translation=(0,0)):
    pivot=np.asarray(pivot)+s.origin;matrix=np.asarray(matrix,float)
    return base.transform(layer,np.column_stack([matrix,pivot-matrix@pivot+translation]),s.rig.canvas)


def hinged(layer,angle,pivot,canvas,**kwargs):
    if abs(angle)<1e-9:
        return layer.copy()
    return base.hinged(layer,angle,pivot,canvas,**kwargs)


def interpolate(phase,keys):
    return float(np.interp(phase,[x for x,y in keys],[y for x,y in keys]))


def combine_visible(scene,cell,box,polygons):
    hidden=scene.fitted(cell,box)
    for polygon in polygons:
        hidden=over(scene.retained(polygon),hidden)
    return hidden


def phased(scene,method):
    for phase in range(scene.record['frames']):
        nodes=scene.terminal(phase)
        if nodes is None:
            nodes=[]
            scene.active_phase=phase
            if phase==scene.record['frames']-2:
                scene.put(nodes,scene.full,'original-complete-installed-anatomy',phase,'COMPLETE_RETAINED_ANATOMY_AFTER_ORIGINAL_MECHANISMS_FINISH')
            else:method(phase,nodes)
        scene.phases.append(nodes)
    return scene.finish()


def factory(s):
    floor=s.floor_texture()
    bay=s.fitted(1,(106,111,225,191))
    rear=combine_visible(s,3,(101,80,149,120),[
        [(101,86),(108,89),(108,102),(136,115),(147,110),(147,116),(128,123),(101,108)]])
    rear_hinge=(124,120)
    boiler=s.retained([(86,121),(91,119),(109,122),(113,128),(113,146),(103,153),(87,147)])
    pipes=s.retained([(87,94),(98,95),(105,104),(113,110),(112,128),(104,133),(91,129),(87,118),(80,116),(80,106),(87,104)])
    door=s.retained([(193,145),(233,130),(241,156),(247,181),(224,198),(207,187)])
    ramp=terminal.masked(s.full,(s.xx>=202)&(s.yy>=181)&~(door[...,3]>0))
    ramp_mask=ramp[...,3]>0
    roof=s.retained([(128,111),(144,109),(200,140),(207,148),(193,162),(130,132)])
    roof_front=terminal.masked(roof,s.yy-.5*s.xx>55)
    roof_back=terminal.masked(roof,s.yy-.5*s.xx<=55)
    posts=[]
    for cell,box,polygon in [
        (2,(101,112,131,177),[(112,114),(121,118),(127,125),(127,143),(116,144),(110,138)]),
        (2,(127,126,158,193),[(139,128),(149,132),(154,139),(154,155),(143,154),(137,149)]),
        (2,(153,140,185,207),[(164,142),(175,147),(180,155),(180,169),(167,166),(163,160)])]:
        posts.append(combine_visible(s,cell,box,[polygon]))
    far=[combine_visible(s,2,box,[poly]) for box,poly in [
        ((151,89,176,161),[(153,90),(160,89),(174,96),(174,119),(156,113),(153,108)]),
        ((179,102,203,175),[(181,103),(187,102),(202,110),(202,133),(183,126)]),
        ((205,116,230,190),[(207,117),(214,116),(229,123),(229,148),(210,140)])]]
    tanks=[s.retained(poly) for poly in [
        [(109,139),(119,139),(123,148),(123,160),(118,166),(109,162)],
        [(136,154),(146,155),(150,162),(150,176),(143,181),(134,176)],
        [(163,168),(173,170),(177,179),(177,190),(170,197),(162,191)]]]
    crown=s.retained([(108,43),(139,43),(139,80),(136,92),(110,92),(108,80)])
    neck=terminal.masked(crown,s.yy>=80)
    bulb=terminal.masked(crown,s.yy<80)
    roof_mask=terminal.polygon(s.full.shape,[(128,111),(144,109),(200,140),(207,148),(193,162),(130,132)])
    crown_mask=crown[...,3]>0
    installed=terminal.masked(s.full,~roof_mask & ~crown_mask & ~ramp_mask)
    # Measured Original stages: slab 0-4, columns 2-12, tower 6-12,
    # facade 8-17, wall rails 12-20, roof 21-23, crown 17-23.
    rear_poses={6:[(94,112),(119,103),(148,116),(123,126)],
        7:[(84,104),(109,95),(148,116),(123,126)],
        8:[(83,95),(108,91),(148,117),(123,127)],
        9:[(88,87),(108,83),(148,117),(123,127)],
        10:[(94,71),(111,76),(148,116),(123,126)],
        11:[(99,77),(115,69),(142,101),(125,111)]}
    rear_quad=[(101,65),(122,76),(148,116),(123,126)]
    rear=s.fitted(3,(100,65,150,126))
    rear_source=[(100,80),(125,65),(150,79),(125,94)]
    front_quad=[(191,144),(225,126),(245,182),(210,199)]
    front_poses={8:[(185,178),(219,162),(245,182),(210,199)],
        9:[(183,173),(218,158),(245,182),(210,199)],
        10:[(182,164),(218,152),(245,182),(210,199)],
        11:[(182,155),(218,146),(245,182),(210,199)],
        12:[(184,149),(220,141),(245,182),(210,199)],
        13:[(186,146),(221,136),(245,182),(210,199)],
        14:[(188,143),(222,132),(245,182),(210,199)],
        15:[(190,143),(224,129),(245,182),(210,199)],16:front_quad}
    def column(layer,p,start,shift,name,nodes,back=False):
        if p<start or p>=21:return
        # Original top-edge height is measured independently for each column.
        cx,cy=shift
        target=s.marker_top(p,lambda x,y:(abs(x-cx)<9)&(y>cy-64)&(y<cy-6),cy-6)
        top=s.marker_top(23,lambda x,y:(abs(x-cx)<9)&(y>cy-64)&(y<cy-6),cy-48)
        progress=np.clip((cy-target)/max(cy-top,1),.04,1)
        # The native column is an extending prism; the complete louver stays
        # on its front plane while its top cap follows the original edge.
        matrix=[[1,0],[-.28*(1-progress),progress]]
        projected=affine_about(s,layer,matrix,(cx,cy))
        s.put(nodes,projected,name,p,'ORIGINAL_MEASURED_COLUMN_PRISM_FRONT_AND_TOP',
              originalTop=target,extension=float(progress),fixedFoot=[cx,cy])
    def build(p,nodes):
        if p<21:
            matched_slab(s,floor,p,127,'original-foundation-panels',nodes)
            plates=s.red_plates(p,lambda x,y:y>=143)
            s.put(nodes,plates,'original-folded-red-foundation-plates',p,'ORIGINAL_OWNER_PLATE_GEOMETRY_WITH_AUTHORED_HD_ENAMEL',ground=True)
        if p>=21:s.put(nodes,installed,'installed-factory-shell',p,'RETAINED_INSTALLED_SHELL_AFTER_ORIGINAL_WALL_AND_FACADE_STAGES')
        if 2<=p<21:
            for i,layer in enumerate(far):column(layer,p,2+i*3,(162+i*27,139+i*14),'original-back-column-'+str(i),nodes,True)
        if 6<=p<21:
            dest=np.asarray(rear_poses.get(p,[(98,77),(115,67),(142,101),(125,111)]),float)
            if p>=13:
                amount=np.clip((p-13)/8,0,1)
                dest=dest*(1-amount)+np.asarray([(101,86),(117,78),(142,91),(126,101)])*amount
            depth={6:5,7:10,8:18,9:25,10:32}.get(p,36)
            if p>=13:depth*=1-amount*.3
            layer=prism(s,rear,rear_source,dest,32,np.array([0,depth]))
            s.put(nodes,layer,'original-rear-tower-hinge',p,
                  'COMPLETE_TOWER_PROJECTED_THROUGH_MATCHING_ORIGINAL_GROUND_HINGE_POSES',corners=dest.tolist())
        if 1<=p<21:
            drop=[0,12,9,6,3,1,0][min(p,6)]
            s.put(nodes,s.rise(boiler,drop,154),'original-left-boiler',p,'FIXED_DIAMETER_BOILER_AT_ORIGINAL_PHASE',translation=[0,drop])
        if 6<=p<21:
            drop=max(0,12-(p-6)*2)
            s.put(nodes,s.rise(pipes,drop,137),'original-rear-pipework',p,'PIPEWORK_RISES_BEFORE_TOWER_CAP',translation=[0,drop])
        if 8<=p<21:
            dest=front_poses.get(p,front_quad)
            s.put(nodes,s.project(door,front_quad,dest),'original-front-facade-hinge',p,
                  'COMPLETE_FACADE_TURNS_FROM_FLOOR_TO_INSTALLED_FRONT_PLANE',corners=dest)
        if p<21:
            for i,layer in enumerate(posts):column(layer,p,2+i*3,(118+i*27,163+i*14),'original-front-column-'+str(i),nodes)
        # The three little tanks emerge on consecutive original frames.
        for i,layer in enumerate(tanks):
            start=13+i
            if start<=p<21:
                drop=max(0,9-(p-start)*5)
                s.put(nodes,s.rise(layer,drop,168+i*15),'original-pressure-tank-'+str(i),p,
                      'TANK_RISES_ON_MATCHING_ORIGINAL_FOUNDATION_SOCKET',translation=[0,drop])
        if 12<=p<21:
            # Two longitudinal wall sheets grow vertically, rather than
            # replacing the open building with the completed shell early.
            interior=s.retained([(126,117),(145,108),(207,140),(203,153),(140,126),(126,129)])
            progress=[.03,.08,.16,.28,.42,.58,.72,.85,.96][p-12]
            layer=affine_about(s,interior,[[1,0],[0,progress]],(150,135))
            s.put(nodes,layer,'original-longitudinal-wall-rails',p,'ORIGINAL_WALL_HEIGHT_SEQUENCE_BEFORE_ROOF_CLOSURE',extension=progress)
        if p>=15:
            drop=max(0,13-(p-15)*3)
            s.put(nodes,s.rise(neck,drop,96),'original-tower-neck',p,'NECK_RISES_BEFORE_GOLD_CAP',translation=[0,drop])
        if p>=17:
            amount=[.1,.18,.28,.4,.56,.77,1][p-17]
            layer=affine_about(s,bulb,[[amount,0],[0,amount]],(123.5,80))
            top=bounds(layer[...,3]>=8)[1]/4
            drop=max(0,s.rig.logical[p]['trimOrigin'][1]-top)
            s.put(nodes,terminal.move(layer,dy=drop),'original-golden-crown',p,'CROWN_EXPANDS_FROM_THE_ORIGINAL_TOWER_SPINDLE',deployment=amount)
        if p>=21:
            s.put(nodes,ramp,'original-complete-ramp',p,'COMPLETE_VEHICLE_RAMP_AFTER_FACADE_TURNS_UP',ground=p<23)
            angle=np.deg2rad({21:87,22:31,23:0}[p])
            for name,layer,pivot,sign in [('front',roof_front,(133,137),1),('back',roof_back,(158,117),-1)]:
                s.put(nodes,hinged(layer,angle,pivot,s.rig.canvas,depth=0,axis_direction=(1,.5),fold_direction=(sign*.9,-.4)),
                    'original-closing-roof-'+name,p,'COMPLETE_ROOF_PLANES_CLOSE_ON_ORIGINAL_PHASES_21_22_23',angleRadians=angle)
    return phased(s,build)


def depot(s):
    foundation=s.fitted(0,(34,106,112,145))
    exact_floor=terminal.masked(s.full,((s.xx<86)&(s.yy>=130))|((s.xx>=86)&(s.yy>=124)))
    foundation=over(exact_floor,foundation)
    pad=terminal.masked(s.full,(s.xx>=84)&(s.yy>=124))
    v=s.yy-.5*s.xx
    middle=terminal.masked(pad,np.abs(v-86)<5)
    wings=[terminal.masked(pad,v<=81),terminal.masked(pad,v>=91)]
    brick=combine_visible(s,1,(50,76,93,113),[
        [(52,78),(60,79),(73,89),(73,106),(52,99)],
        [(80,79),(89,83),(91,101),(82,108),(80,95)]])
    lower=s.retained([(49,99),(89,99),(92,125),(75,136),(49,123)])
    shaft=combine_visible(s,2,(65,35,83,104),[
        [(69,64),(78,65),(82,72),(81,94),(76,102),(67,98),(65,83)]])
    shaft=terminal.masked(shaft,s.yy>=63)
    crane=s.member_layer('_b')
    head_mask=s.region([(64,33),(80,33),(81,64),(76,69),(64,64)])
    head=terminal.masked(crane,head_mask)
    arm=terminal.masked(crane,~head_mask & (s.yy<74) & ((s.xx<125)|(s.yy<68)))
    auxiliary=s.retained([(86,101),(94,98),(104,103),(110,111),(111,121),(94,128),(86,123)])
    tank=s.retained([(40,111),(50,105),(62,105),(70,111),(70,121),(64,129),(40,126)])
    grab=terminal.masked(crane,(s.xx>117)&(s.yy>=75)&(s.yy<99))
    exact_cable=terminal.masked(crane,(s.xx>122)&(s.yy>=65)&(s.yy<79))
    lower=terminal.masked(lower,~(tank[...,3]>0))
    stationary=s.member_layer('main')
    exact_shaft=s.retained([(65,63),(82,63),(84,74),(82,97),(76,104),(65,100)])
    brick_quad=[(52,78),(77,89),(91,111),(66,124)]
    brick_poses={3:[(19,120),(44,109),(91,111),(66,124)],
        4:[(31,112),(54,102),(91,111),(66,124)],
        5:[(39,104),(60,96),(91,111),(66,124)],
        6:[(43,94),(64,89),(91,111),(66,124)],
        7:[(47,86),(68,85),(91,111),(66,124)],
        8:[(50,81),(72,85),(91,111),(66,124)]}
    fixed_pin=terminal.masked(crane,(s.xx>=68)&(s.xx<=79)&(s.yy<46))
    arm_head=terminal.masked(crane,(s.yy<74)&~(fixed_pin[...,3]>0)&~((s.xx>117)&(s.yy>66)))
    brick_source=[(50,89),(72,76),(94,89),(72,102)]
    brick=s.fitted(1,(50,76,94,131))
    mast_drop=[64,64,64,64,65,56,48,39,34,26,17,11,6,1,0,0,0,0,0,0,0,0,0,0]
    # Shared swivel bearing: the collar, counterweight and jib are one part.
    angles=[1.47]*14+[1.43,1.35,1.22,1.05,.86,.65,.45,.26,.12,0]
    def build(p,nodes):
        if p<16:matched_slab(s,foundation,p,111,'original-machinery-floor',nodes)
        if p>=1:
            extension=[0,.23,.34,.43,.51,.6,.68,.76,.84,.92,1,1,1,1,1,1,1,1,1,1,1,1,1,1][p]
            u=.5*s.xx+s.yy
            # Three actual rigid plates slide out in order on the same axis.
            for i,(lo,hi) in enumerate([(175,204),(204,232),(232,268)]):
                segment=terminal.masked(middle,(u>=lo)&(u<hi))
                travel=max(0,(lo+hi)/2-185)*(1-extension)
                s.put(nodes,terminal.move(segment,dx=-travel,dy=-travel*.5),'original-telescopic-pad-'+str(i),p,
                      'LONGITUDINAL_PAD_SEGMENTS_AT_MATCHING_ORIGINAL_EXTENT',translation=[-travel,-travel*.5],ground=True)
        if p>=12:
            angle=np.deg2rad({12:84,13:73,14:56,15:38,16:23,17:11}.get(p,0))
            along=np.array([1.,.5]);cross=np.array([-1.,.5]);matrix=np.column_stack([along,cross*np.cos(angle)])@np.linalg.inv(np.column_stack([along,cross]))
            for i,wing in enumerate(wings):
                s.put(nodes,affine_about(s,wing,matrix,(129,151)),'original-unfolding-pad-wing-'+str(i),p,
                      'COMPLETE_SIDE_PLATES_UNFOLD_ON_ORIGINAL_LONGITUDINAL_BEARINGS',angleRadians=angle)
        if 3<=p<16:
            s.put(nodes,s.rise(lower,max(0,23-(p-3)*4),138),'original-service-lower-block',p,'LOWER_BLOCK_RISES_DURING_PEDESTAL_ROTATION')
            dest=np.asarray({3:[(30,121),(53,109),(79,114),(56,126)],4:[(24,113),(49,101),(78,112),(53,125)],5:[(27,105),(52,92),(80,109),(55,123)],6:[(33,97),(57,84),(82,105),(58,120)],7:[(40,88),(63,78),(86,101),(63,115)],8:[(46,82),(69,76),(91,96),(69,109)]}.get(p,[(50,79),(73,76),(94,87),(72,96)]),float)
            depth={3:5,4:9,5:14,6:20,7:28,8:35}.get(p,37)
            layer=prism(s,brick,brick_source,dest,29,np.array([0,depth]))
            s.put(nodes,layer,'original-service-brick-hinge',p,
                      'COMPLETE_BRICK_PEDESTAL_SWINGS_ABOUT_MATCHING_ORIGINAL_GROUND_EDGE',corners=dest.tolist())
        if 4<=p<16:
            s.put(nodes,s.rise(auxiliary,max(0,12-(p-4)*3),130),'original-hydraulic-reservoir',p,'RESERVOIR_FOLLOWS_ORIGINAL_REAR_SOCKET')
        if p>=16:s.put(nodes,stationary,'installed-service-base',p,'EXACT_RETAINED_FIXED_BASE_AFTER_ORIGINAL_BLOCK_AND_TANK_STAGES')
        if p>=4:
            drop=mast_drop[p]
            mast_index=len(nodes)
            s.put(nodes,s.rise(exact_shaft,drop,107),'original-emerging-crane-mast',p,
                      'MAST_HEIGHT_FROM_MATCHING_ORIGINAL_FRAME',translation=[0,drop])
            s.put(nodes,s.rise(fixed_pin,max(drop,s.rig.logical[p]['trimOrigin'][1]+1-bounds(fixed_pin[...,3]>0)[1]/4),107),'original-fixed-crane-axle',p,'FIXED_AXLE_REMAINS_WITH_VERTICAL_MAST',translation=[0,drop])
            angle=angles[p]
            upper=base.rotate(arm_head,angle,(72,56),s.rig.canvas)
            upper=terminal.move(upper,dy=drop)
            upper=terminal.masked(upper,s.yy<107)
            s.put(nodes,upper,'original-coupled-swivel-and-jib',p,
                      'COLLAR_COUNTERWEIGHT_AND_BOOM_ROTATE_TOGETHER_ABOUT_ONE_BEARING',angleRadians=angle,translation=[0,drop])
            if p<23 and len(nodes)>mast_index+2:
                mast_node=nodes.pop(mast_index)
                nodes.append(mast_node)
                collar=terminal.masked(arm_head,(s.xx<82)&(s.yy<66))
                collar=terminal.move(base.rotate(collar,angle,(72,56),s.rig.canvas),dy=drop)
                s.put(nodes,collar,'original-front-service-swivel',p,'RED_SWIVEL_IN_FRONT_OF_MAST_WITH_JIB_BEHIND',angleRadians=angle)
        if 13<=p<16:s.put(nodes,s.rise(tank,{13:13,14:8,15:3}[p],132),'original-yellow-tank',p,'TANK_RISES_ON_ORIGINAL_PHASES_13_TO_16')
        if p>=18:
            angle=angles[p];c,si=np.cos(angle),np.sin(angle)
            tip=np.array([[c,-si],[si,c]])@np.array([54,6])+[72,56+mast_drop[p]]
            # The hook begins beside the reservoir and travels with the tip.
            original_hook=[112,112] if p==18 else [118,108] if p==19 else [122,105] if p==20 else [124,101] if p==21 else [125,97] if p==22 else [126,95]
            delta=np.asarray(original_hook)-[126,95]
            s.put(nodes,terminal.move(grab,dx=delta[0],dy=delta[1]),'original-service-hook',p,'HOOK_POSITION_MATCHES_ORIGINAL_HOIST_SEQUENCE',translation=delta.tolist())
            cable=Image.new('RGBA',(s.rig.canvas[0]*4,s.rig.canvas[1]*4));draw=ImageDraw.Draw(cable)
            draw.line((*tuple(tip*4),original_hook[0]*4,(original_hook[1]-16)*4),fill=(40,40,36,255),width=3)
            s.put(nodes,exact_cable if p==23 else np.array(cable),'original-service-cable',p,'CONTINUOUS_CABLE_CONNECTS_LIVE_TIP_TO_HOOK')
    return phased(s,build)


def dock(s):
    platform=s.fitted(0,(111,112,287,232))
    # The world waterline is fixed; only the dock deck and upper supports rise.
    water=terminal.masked(s.full,s.yy>=198)
    deck=terminal.masked(platform,s.yy<198)
    red_edge=s.retained([(111,144),(115,145),(203,185),(285,148),(288,150),(288,169),(204,205),(111,165)])
    deck=over(red_edge,deck)
    fronts=[combine_visible(s,1,box,[poly]) for box,poly in [
        ((124,89,158,159),[(126,91),(139,87),(153,94),(156,108),(151,118),(129,125),(124,113)]),
        ((179,117,218,184),[(182,120),(195,115),(213,123),(217,136),(209,145),(183,148),(179,137)])]]
    backs=[combine_visible(s,2,box,[poly]) for box,poly in [
        ((176,67,218,134),[(176,69),(184,68),(216,80),(218,88),(216,111),(205,117),(177,98)]),
        ((231,92,270,165),[(232,94),(242,95),(269,109),(269,153),(253,161),(233,149)])]]
    mast=combine_visible(s,3,(155,54,178,118),[
        [(157,66),(175,65),(178,76),(176,105),(169,115),(155,111)]])
    head=combine_visible(s,4,(128,21,181,81),[
        [(130,34),(145,33),(156,39),(165,22),(178,41),(180,61),(168,70),(140,80),(130,62)]])
    head_poly=[(130,34),(145,33),(156,39),(165,22),(178,41),(180,61),(168,70),(140,80),(130,62)]
    head_mask=s.region(head_poly)
    crane=s.member_layer('_a')
    head_exact=terminal.masked(crane,(s.xx<182)&(s.yy<87))
    jib_poly=[(177,25),(295,46),(295,77),(177,56)]
    jib=terminal.masked(crane,(s.xx>=177)&(s.yy<85)&~((s.xx>289)&(s.yy>70)))
    jib_mask=s.region(jib_poly)
    mast_mask=s.region([(154,54),(179,54),(180,115),(154,120)])
    stationary=s.member_layer('_a',exclude=True)
    head_exact=over(head_exact,terminal.masked(stationary,(s.xx<155)&(s.yy<85)))
    exact_mast=terminal.masked(stationary,mast_mask)
    stairs=[s.retained(poly) for poly in [[(163,137),(177,144),(162,164),(151,157)],[(230,137),(243,143),(230,162),(219,155)]]]
    stairs_mask=np.logical_or.reduce([layer[...,3]>0 for layer in stairs])
    installed=terminal.masked(stationary,(s.yy>=65)&~(mast_mask|stairs_mask)&~((s.xx<155)&(s.yy<85)))
    tower_mask=np.logical_or.reduce([layer[...,3]>0 for layer in fronts+backs])
    floor_visible=terminal.masked(s.full,(s.yy>=125)&(s.yy<198)&(s.xx<284)&~(tower_mask|head_mask|jib_mask|mast_mask|stairs_mask))
    deck=over(floor_visible,deck)
    pump=s.retained([(204,102),(219,102),(235,111),(238,123),(231,130),(213,129),(202,119)])
    grab=terminal.masked(crane,(s.xx>282)&(s.yy>=99)&(s.yy<131))
    exact_cable=terminal.masked(crane,(s.xx>289)&(s.yy>=69)&(s.yy<104))
    # The entire upper crane pitches about one bearing; it does not yaw.
    upper=over(jib,head_exact)
    lifts=[80]*13+[66,57,49,45,39,35,23,10,5,1,0]
    pitch={13:.82,14:.66,15:.47,16:.32,17:.24,18:.22,19:.22,20:.17,21:.085,22:.04,23:0}
    foreshortening={13:.43,14:.58,15:.67,16:.76,17:.86,18:.92,19:.98,20:1,21:1,22:1,23:1}
    def build(p,nodes):
        s.put(nodes,water,'original-fixed-waterline',p,'FIXED_ORIGINAL_PILES_AND_WATERLINE',ground=True)
        if p<23:s.put(nodes,deck,'original-dock-platform',p,'FIXED_REGISTERED_PLATFORM_FROM_FIRST_ORIGINAL_FRAME',ground=True)
        if p>=23:s.put(nodes,installed,'installed-dock-deck-and-supports',p,'COMPLETE_RETAINED_BASE_AFTER_ORIGINAL_SUPPORT_EXTENSION')
        if p<23:
            for i,layer in enumerate(backs):
                target=s.marker_top(p,lambda x,y:(x>177+i*54)&(x<218+i*54)&(y<137),99+i*26)
                final=s.marker_top(23,lambda x,y:(x>177+i*54)&(x<218+i*54)&(y<137),70+i*26)
                drop=max(0,target-final)
                s.put(nodes,s.rise(layer,drop,151 if i else 127),'original-rear-dock-support-'+str(i),p,
                          'SUPPORT_TOP_FOLLOWS_MATCHING_ORIGINAL_RED_EDGE',translation=[0,drop],originalTop=target)
            for i,layer in enumerate(fronts):
                target=s.marker_top(p,lambda x,y:(x>126+i*58)&(x<156+i*58)&(y<171),123+i*28)
                final=s.marker_top(23,lambda x,y:(x>126+i*58)&(x<156+i*58)&(y<171),92+i*28)
                drop=max(0,target-final)
                s.put(nodes,s.rise(layer,drop,159 if i==0 else 185),'original-front-dock-support-'+str(i),p,
                          'LOUVER_PEDESTAL_HEIGHT_MEASURED_FROM_ORIGINAL_CAP',translation=[0,drop],originalTop=target)
        if p>=12 and p<23:
            drop=max(0,10-(p-12)*3)
            s.put(nodes,s.rise(pump,drop,142),'original-dock-pump',p,'PUMP_EMERGES_BEFORE_CRANE_PITCH',translation=[0,drop])
        if p>=13:
            lift=lifts[p];angle=pitch[p]
            # Original mast remains recessed until the crane has unfolded.
            if p>=18:s.put(nodes,s.rise(exact_mast,lift,121),'original-extending-dock-mast',p,
                      'VERTICAL_MAST_LIFT_FOLLOWS_UPPER_CRANE_UNFOLDING',translation=[0,lift])
            c,si=np.cos(angle),np.sin(angle);amount=foreshortening[p]
            matrix=[[amount*c,-si],[amount*si,c]]
            transformed=affine_about(s,head_exact if p==13 else upper,matrix,(165,60))
            transformed=terminal.move(transformed,dy=lift)
            s.put(nodes,transformed,'original-coupled-dock-head-and-jib',p,
                      'WHOLE_CRANE_HEAD_AND_JIB_PITCH_TOGETHER_IN_ORIGINAL_VIEW_PLANE',angleRadians=angle,translation=[0,lift],yawRadians=0)
            if p>=18:
                c,si=np.cos(angle),np.sin(angle);tip=np.asarray(matrix)@np.array([128,7])+[165,60+lift]
                drop={18:2,19:9,20:18,21:25,22:32,23:37}[p]
                hook=tip+[0,drop]
                delta=hook-[293,104]
                s.put(nodes,terminal.move(grab,dx=delta[0],dy=delta[1]),'original-dock-hook',p,
                          'HOOK_DESCENDS_FROM_ORIGINAL_JIB_TIP_AFTER_UNFOLDING',translation=delta.tolist())
                cable=Image.new('RGBA',(s.rig.canvas[0]*4,s.rig.canvas[1]*4));draw=ImageDraw.Draw(cable)
                draw.line((*tuple(tip*4),*tuple(hook*4)),fill=(50,47,36,255),width=3)
                s.put(nodes,exact_cable if p==23 else np.array(cable),'original-dock-cable',p,'LIVE_TIP_AND_HOOK_CABLE')
        if p>=19:
            angle=np.deg2rad({19:76,20:52,21:29,22:10,23:0}[p])
            for i,(layer,pivot) in enumerate(zip(stairs,[(160,160),(230,160)])):
                s.put(nodes,hinged(layer,angle,pivot,s.rig.canvas,depth=0,axis_direction=(1,.5)),
                          'original-dock-stair-'+str(i),p,'STAIRS_UNFOLD_ON_MATCHING_ORIGINAL_LATE_FRAMES',angleRadians=angle)
    return phased(s,build)


def lab(s):
    floor=s.floor_texture()
    edge=s.retained([(43,128),(49,126),(119,158),(184,127),(191,132),(191,140),(121,172),(43,137)])
    floor=over(edge,floor)
    body=combine_visible(s,1,(47,83,183,160),[
        [(48,101),(74,113),(115,132),(151,113),(181,101),(181,135),(119,159),(48,130)]])
    big_poly=[(85,89),(93,83),(105,79),(131,79),(149,88),(150,99),(133,110),(105,111),(85,102)]
    mid_poly=[(91,69),(103,63),(129,63),(144,71),(144,91),(130,100),(107,100),(91,92)]
    inner_poly=[(98,52),(106,48),(127,48),(136,55),(136,74),(128,80),(108,80),(98,74)]
    cap_poly=[(104,8),(131,8),(131,48),(128,57),(107,57),(104,48)]
    big_mask,mid_mask,inner_mask,cap_mask=[s.region(poly) for poly in [big_poly,mid_poly,inner_poly,cap_poly]]
    def ring(cell,box,region,covered):
        hidden=terminal.masked(s.fitted(cell,box),region & covered)
        visible=terminal.masked(s.full,region & ~covered)
        surface=over(visible,hidden)
        return closed_surface(s,surface,region)
    big=ring(2,(85,78,150,111),big_mask,mid_mask|inner_mask|cap_mask)
    medium=ring(2,(91,63,144,100),mid_mask,inner_mask|cap_mask)
    inner=ring(3,(98,49,136,80),inner_mask,cap_mask)
    cap=terminal.masked(s.full,cap_mask)
    spires=[s.retained(poly) for poly in [
        [(53,67),(67,67),(69,95),(69,105),(52,99)],
        [(166,67),(180,67),(182,97),(165,104)],
        [(108,100),(126,100),(127,128),(117,134),(107,127)]]]
    spire_mask=np.logical_or.reduce([layer[...,3]>0 for layer in spires])
    steps=[s.retained(poly) for poly in [[(77,132),(91,130),(106,146),(101,152),(77,145)],[(141,132),(153,130),(164,145),(156,153),(140,147)]]]
    step_mask=np.logical_or.reduce([layer[...,3]>0 for layer in steps])
    installed=terminal.masked(s.full,~(big_mask|mid_mask|inner_mask|cap_mask|spire_mask|step_mask))
    gold=[]
    for p in range(s.record['frames']):
        ix=native_indices(s.rig.raw,p);rgb=np.asarray(s.record['palette'],float)[ix]
        yy,xx=np.indices(ix.shape,dtype=float);yy-=s.origin[1];xx-=s.origin[0];selected=(ix>31)&(xx>=108)&(xx<=128)&(rgb[...,0]>rgb[...,1]*1.05)&(rgb[...,1]>rgb[...,2]*1.35)&(rgb[...,0]>100)
        ys=np.where(selected)[0];gold.append(float(ys.min()) if len(ys) else 89.)
    # Original lower wall and roof move as one square assembly, then stop.
    lower_drop=[45,45,44,42,40,37,32,26,19,12,5,0]+[0]*12
    expansion=[.31,.48,.68,.87,.98,1]+[1]*18
    outer_drop=[0,28,30,31,30,28,24,19,13,7,2,0]+[0]*12
    mid_drop=[58]*12+[56,52,45,37,31,26,22,20,20,20,20,20]
    # Tier UVs remain fixed; their exposed wall heights are original sockets.
    big_top=float(bounds(big[...,3]>0)[1]/4-s.origin[1])
    def build(p,nodes):
        if p<11:matched_slab(s,floor,p,122,'original-lab-foundation',nodes)
        if p>=11:s.put(nodes,over(terminal.masked(s.full,s.yy>=130),installed),'original-installed-lower-lab',p,'LOWER_BLOCK_COMPLETES_BEFORE_CENTRAL_TOWER_EXTENSION')
        if 5<=p<11:s.put(nodes,s.rise(body,lower_drop[p],161),'original-rising-lab-block',p,
                    'SQUARE_WALL_BLOCK_HEIGHT_FROM_MATCHING_ORIGINAL_PHASE',translation=[0,lower_drop[p]])
        for i,(layer,center) in enumerate(zip(spires,[(60,100),(173,100),(117,131)])):
            # Keep the complete finial; expand the square footprint first.
            delta=(np.array([117,137])-center)*(1-expansion[p])+[0,[0,8,15,21,25,27,22,17,11,6,2,0][min(p,11)]]
            s.put(nodes,terminal.move(layer,dx=delta[0],dy=delta[1]),'original-corner-finial-'+str(i),p,
                      'FINIAL_FOLLOWS_ORIGINAL_EXPANDING_SQUARE_ROOF',translation=delta.tolist())
        # At phases 0-2 the dome petals open while the circular bases spread.
        cap_drop=max(0,gold[p]-gold[23])
        if p>=1:
            scale=[0,.43,.66,.87,.98,1][min(p,5)]
            ring_layer=affine_about(s,big,[[scale,0],[0,1]],(117,99))
            s.put(nodes,terminal.move(ring_layer,dy=outer_drop[p]),'original-lower-circular-tier',p,
                      'LOWER_RING_SPREADS_WITH_ORIGINAL_FOUNDATION_THEN_RISES_WITH_WALL',translation=[0,outer_drop[p]],diameterRatio=scale)
        if p>=1:
            # The middle tier only begins telescoping after phase 13.
            drop=max(0,cap_drop-7) if p<14 else max(0,cap_drop-4)
            layer=terminal.move(medium,dy=drop)
            layer=terminal.masked(layer,s.yy<min(111+outer_drop[p],110+max(0,cap_drop-12)))
            s.put(nodes,layer,'original-middle-circular-tier',p,
                      'MIDDLE_TIER_FOLLOWS_ORIGINAL_CONCENTRIC_RING_HEIGHT',translation=[0,drop])
        if p>=19:
            s.put(nodes,terminal.move(inner,dy=cap_drop),'original-late-inner-core',p,
                      'INNER_STRUTS_APPEAR_ONLY_ON_ORIGINAL_PHASE_19_AND_LATER',translation=[0,cap_drop])
        if p<19:
            collar=terminal.masked(inner,s.yy<=61)
            s.put(nodes,terminal.move(collar,dy=cap_drop),'original-retracted-inner-collar',p,
                      'SHORT_FIXED_UV_COLLAR_CLOSES_DOME_TO_RING_BEFORE_INNER_STRUT_LIFT',translation=[0,cap_drop])
        cap_layer=cap
        if p<3:
            ratio=[.69,.87,.97][p]
            cap_layer=affine_about(s,cap,[[ratio,0],[0,1]],(117,47))
        s.put(nodes,terminal.move(cap_layer,dy=cap_drop),'original-golden-dome',p,
                  'DOME_HEIGHT_FOLLOWS_THE_MEASURED_GOLD_TIP_EVERY_FRAME',translation=[0,cap_drop],originalGoldTop=gold[p])
        if p>=11:
            angle=np.deg2rad({11:84,12:67,13:43,14:17}.get(p,0))
            for i,(layer,pivot) in enumerate(zip(steps,[(91,150),(152,151)])):
                s.put(nodes,hinged(layer,angle,np.asarray(pivot)+s.origin,s.rig.canvas,depth=0,axis_direction=(1,.5)),
                      'original-lab-entry-ramp-'+str(i),p,'RAMPS_UNFOLD_ON_ORIGINAL_PHASES_11_TO_15',angleRadians=angle)
    return phased(s,build)


def main():
    global SOURCE
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ['authoring','assets','output']:parser.add_argument(name,type=Path)
    parser.add_argument('--diagnostic',action='store_true')
    parser.add_argument('--families',default='NAWEAP,NADEPT,NAYARD,NATECH')
    args=parser.parse_args();args.output.mkdir(exist_ok=False)
    snapshot=args.output/'authoring-source.py';shutil.copy2(__file__,snapshot)
    SOURCE={'code':str(snapshot),'sha256':sha(snapshot),'material':'AUTHORED_HD_HIDDEN_SURFACES_AND_RETAINED_VISIBLE_RGB_NO_NATIVE_RGB'}
    methods={'NAWEAP':factory,'NADEPT':depot,'NAYARD':dock,'NATECH':lab};selected=set(args.families.split(','));rigs={}
    for rec in read(args.authoring)['families']:
        if rec['identity'] not in selected or rec['theater'] not in ['TEMPERATE','SNOW']:continue
        reference=args.assets/('reference-'+rec['theater'].lower()+'-v1/report.json')
        scene=Scene(rec,args.assets,reference,args.output/rec['key'],args.diagnostic)
        rigs[rec['key']]=methods[rec['identity']](scene)
        write(args.output/(rec['key']+'-rig.json'),rigs[rec['key']])
        print(rec['key'],'authored; violations',len(scene.violations),flush=True)
    write(args.output/'rigs.json',rigs)


if __name__=='__main__':main()
