"""Author four Soviet construction mechanisms from complete HD components."""
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

    def member_layer(self,suffix,exclude=False):
        key=(suffix,exclude)
        if key not in self.member_cache:
            names=[g['sourceMember'] for g in self.reference['poseCheck']['initialIdleGeometry']]
            selected=names[0] if suffix=='main' else next(n for n in names if n.endswith(suffix+'.shp'))
            removed=[selected] if exclude else [n for n in names if n!=selected]
            self.member_cache[key]=display(self.rig.record,exclude_members=removed)
        return self.member_cache[key]

    def put(self,nodes,layer,name,phase,method,**details):
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
            nodes=[];method(phase,nodes)
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
    def build(p,nodes):
        ground=s.reveal_floor(floor,p,138)
        if p<22:ground=base.neutral(ground)
        if p<18:s.put(nodes,ground,'fixed-foundation-and-ramp',p,'FIXED_WORLD_TEXTURE_NATIVE_FOUNDATION_UNFOLDING',ground=True)
        elif p<22:s.put(nodes,terminal.masked(ground,ramp_mask),'unfinished-front-ramp-floor',p,'FIXED_WORLD_RAMP_FLOOR_BEFORE_OUTER_RAIL_INSTALLATION',ground=True)
        if p>=18:
            s.put(nodes,installed,'installed-factory-structure',p,'EXACT_RETAINED_INSTALLED_STRUCTURE_WITH_OPEN_ROOF_AND_CROWN_SOCKET')
        if p>=6 and p<18:
            drop=interpolate(p,[(6,20),(8,12),(10,5),(12,0)])
            s.put(nodes,s.rise(bay,drop,193),'open-roof-interior',p,'COMPLETE_INTERIOR_RISES_IN_GROUND_SOCKET',translation=[0,drop])
        for i,layer in enumerate(far):
            start=1+i*2
            if p>=start and p<18:
                drop=interpolate(p,[(start,41),(start+2,27),(start+4,10),(start+6,0)])
                top=bounds(layer[...,3]>=8)[1]/4
                drop=max(drop,s.rig.logical[p]['trimOrigin'][1]-top)
                s.put(nodes,s.rise(layer,drop,159+i*14),'rear-louver-'+str(i),p,'FIXED_SIZE_LOUVER_RISES_FROM_INDEPENDENT_SOCKET',translation=[0,drop])
        if p>=5 and p<18:
            angle=np.deg2rad(interpolate(p,[(5,72),(7,55),(9,30),(11,8),(12,0)]))
            layer=hinged(rear,angle,rear_hinge,s.rig.canvas,depth=1.2,axis_direction=(1,.5))
            s.put(nodes,layer,'hinged-rear-brick-tower',p,'COMPLETE_BRICK_MODULE_ROTATES_UP_FROM_GROUND_HINGE',angleRadians=angle)
        if p>=1 and p<18:
            drop=interpolate(p,[(1,20),(3,12),(5,4),(6,0)])
            s.put(nodes,s.rise(boiler,drop,154),'left-boiler',p,'FIXED_DIAMETER_BOILER_EMERGES_FROM_COLLAR',translation=[0,drop])
        if p>=10 and p<18:
            drop=interpolate(p,[(10,24),(12,12),(14,2),(15,0)])
            s.put(nodes,s.rise(pipes,drop,137),'left-complete-pipework',p,'RIGID_PIPEWORK_RISES_WITH_REAR_SERVICE_BLOCK',translation=[0,drop])
        if p>=10 and p<18:
            angle=np.deg2rad(interpolate(p,[(10,76),(12,48),(14,12),(15,0)]))
            layer=hinged(door,angle,(222,197),s.rig.canvas,depth=1.2,axis_direction=(1,-.5))
            s.put(nodes,layer,'hinged-front-door-frame',p,'COMPLETE_FRONT_FACADE_ROTATES_ABOUT_FLOOR_AXIS',angleRadians=angle)
        for i,layer in enumerate(posts):
            start=2+i*2
            if p>=start and p<18:
                drop=interpolate(p,[(start,45),(start+2,28),(start+4,9),(start+6,0)])
                s.put(nodes,s.rise(layer,drop,177+i*15),'front-buttress-'+str(i),p,'COMPLETE_RED_COLUMN_RISES_THROUGH_FIXED_FOOT',translation=[0,drop])
        for i,layer in enumerate(tanks):
            if p>=13+i and p<18:
                drop=interpolate(p,[(13+i,15),(15+i,5),(17+i,0)])
                s.put(nodes,s.rise(layer,drop,168+i*15),'pressure-tank-'+str(i),p,'COMPLETE_PRESSURE_TANK_EMERGES_ON_COLUMN_FOOT',translation=[0,drop])
        if p>=15:
            drop=interpolate(p,[(15,15),(17,8),(19,2),(20,0)])
            s.put(nodes,s.rise(neck,drop,96),'tower-neck',p,'TELESCOPIC_CENTRAL_NECK_EMERGENCE',translation=[0,drop])
        if p>=20:
            amount=interpolate(p,[(20,.12),(21,.38),(22,.72),(23,1)])
            # Six rigid curved petal strips unfold about the central spindle.
            layer=np.zeros_like(bulb)
            for i in range(6):
                a=108+i*31/6;b=108+(i+1)*31/6
                petal=terminal.masked(bulb,(s.xx>=a)&(s.xx<b))
                shift=(123.5-(a+b)/2)*(1-amount)
                layer=over(terminal.move(petal,dx=shift),layer)
            top=bounds(layer[...,3]>=8)[1]/4
            drop=max(0,s.rig.logical[p]['trimOrigin'][1]-top)
            layer=terminal.move(layer,dy=drop)
            s.put(nodes,layer,'golden-crown-petals',p,'GOLDEN_CROWN_PETALS_DEPLOY_RADIALLY_FROM_SPINDLE',radialDeployment=amount)
        if p>=22:
            s.put(nodes,ramp,'installed-front-vehicle-ramp',p,'COMPLETE_FRONT_RAMP_AND_RAILS_FINISH_AFTER_DOOR_FACADE',ground=p<23)
        if p>=21:
            angle=np.deg2rad(interpolate(p,[(21,73),(22,34),(23,0)]))
            for name,layer,pivot,sign in [('front',roof_front,(133,137),1),('back',roof_back,(158,117),-1)]:
                s.put(nodes,hinged(layer,angle,pivot,s.rig.canvas,depth=.6,axis_direction=(1,.5),fold_direction=(sign*.9,-.4)),
                    'inward-roof-'+name,p,'COMPLETE_CURVED_ROOF_SHEET_SWINGS_INWARD',angleRadians=angle)
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
    def build(p,nodes):
        ground=s.reveal_floor(foundation,p,113)
        if p<12:s.put(nodes,ground,'fixed-machinery-foundation',p,'FIXED_WORLD_FOUNDATION_NATIVE_UNFOLDING',ground=True)
        if p>=1:
            extension=interpolate(p,[(1,.05),(4,.3),(8,.72),(11,1)])
            u=.5*s.xx+s.yy
            for i,(lo,hi) in enumerate([(175,204),(204,232),(232,268)]):
                segment=terminal.masked(middle,(u>=lo)&(u<hi))
                travel=max(0,(lo+hi)/2-187)*(1-extension)
                moved=terminal.move(segment,dx=-travel,dy=-travel*.5)
                s.put(nodes,moved,'telescoping-pad-center-'+str(i),p,'RIGID_CENTER_PLATE_SLIDES_ALONG_VIEW_AXIS_FROM_REAR_SOCKET',translation=[-travel,-travel*.5],ground=True)
        if p>=12:
            angle=np.deg2rad(interpolate(p,[(12,82),(14,48),(16,17),(18,0)]))
            along=np.array([1.,.5]);cross=np.array([-1.,.5])
            matrix=np.column_stack([along,cross*np.cos(angle)])@np.linalg.inv(np.column_stack([along,cross]))
            pivot=np.array([129.,151.]);transform=np.column_stack([matrix,pivot-matrix@pivot])
            for i,wing in enumerate(wings):
                layer=base.transform(wing,transform,s.rig.canvas)
                s.put(nodes,layer,'repair-pad-wing-'+str(i),p,'COMPLETE_GROUND_PLATE_ROTATES_OUT_FROM_LONGITUDINAL_HINGE',angleRadians=angle)
        if p>=3 and p<12:
            drop=interpolate(p,[(3,25),(5,14),(7,4),(8,0)])
            s.put(nodes,s.rise(lower,drop,138),'lower-service-block',p,'COMPLETE_SERVICE_BLOCK_RISES_FROM_FOUNDATION',translation=[0,drop])
            angle=np.deg2rad(interpolate(p,[(3,77),(5,48),(7,17),(9,0)]))
            wall=hinged(brick,angle,(73,112),s.rig.canvas,depth=1.2,axis_direction=(1,.5))
            dx,dy={3:(10,9),4:(0,7)}.get(p,(0,0))
            wall=terminal.move(wall,dx=dx,dy=dy)
            s.put(nodes,wall,
                  'hinged-brick-crane-pedestal',p,'COMPLETE_BRICK_WALLS_ROTATE_UP_AROUND_FOOT_HINGE',angleRadians=angle)
        if p>=4 and p<12:
            drop=interpolate(p,[(4,12),(6,4),(7,0)])
            s.put(nodes,s.rise(auxiliary,drop,130),'red-hydraulic-reservoir',p,'RIGID_RESERVOIR_EMERGENCE',translation=[0,drop])
        if p>=12:
            layer=stationary if p>=16 else terminal.masked(stationary,~(tank[...,3]>0))
            s.put(nodes,layer,'installed-service-pedestal',p,'EXACT_RETAINED_INSTALLED_PEDESTAL_AND_FIXED_FOUNDATION')
        if p>=5:
            drop=interpolate(p,[(5,42),(8,26),(10,12),(12,0)])
            drop=max(drop,s.rig.logical[p]['trimOrigin'][1]-bounds(head[...,3]>=8)[1]/4)
            if p<12:s.put(nodes,s.rise(shaft,drop,107),'telescopic-crane-mast',p,'FIXED_DIAMETER_MAST_EXTENDS_THROUGH_PEDESTAL',translation=[0,drop])
            s.put(nodes,s.rise(head,drop,107),'crane-swivel-collar',p,'RIGID_COLLAR_FOLLOWS_MAST',translation=[0,drop])
        if p>=12 and p<16:
            drop=interpolate(p,[(12,13),(14,5),(16,0)])
            s.put(nodes,s.rise(tank,drop,132),'yellow-pressure-tank',p,'COMPLETE_PRESSURE_TANK_RISES_FROM_SERVICE_BED',translation=[0,drop])
        if p>=14:
            angle=interpolate(p,[(14,1.5),(16,1.1),(18,.7),(20,.3),(22,.06),(23,0)])
            layer=base.rotate(arm,angle,(72,56),s.rig.canvas)
            s.put(nodes,layer,'rotating-service-crane-boom',p,'COMPLETE_RIGID_BOOM_ROTATES_ABOUT_SWIVEL_AXLE',angleRadians=angle)
            if p>=18:
                c,si=np.cos(angle),np.sin(angle)
                tip=np.array([[c,-si],[si,c]])@np.array([54,6])+[72,56]
                extra=interpolate(p,[(18,28),(20,15),(22,3),(23,0)])
                delta=tip-[126,62]+[0,extra]
                s.put(nodes,terminal.move(grab,dx=delta[0],dy=delta[1]),'service-crane-hook',p,'COMPLETE_HOOK_FOLLOWS_RIGID_JIB_TIP_AND_HOIST',translation=delta.tolist())
                cable=Image.new('RGBA',(s.rig.canvas[0]*4,s.rig.canvas[1]*4));draw=ImageDraw.Draw(cable)
                draw.line((tip[0]*4,tip[1]*4,(126+delta[0])*4,(79+delta[1])*4),fill=(40,40,36,255),width=3)
                s.put(nodes,exact_cable if p==23 else np.array(cable),'service-hoist-cable',p,'CABLE_BETWEEN_LIVE_JIB_TIP_AND_HOOK')
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
    def build(p,nodes):
        s.put(nodes,water,'fixed-dock-waterline',p,'FIXED_WORLD_PILES_AND_WATERLINE',ground=True)
        deck_drop=interpolate(p,[(0,9),(2,7),(4,3),(6,0)])
        if p<17:s.put(nodes,terminal.move(deck,dy=deck_drop),'rising-dock-deck',p,'DOCK_DECK_LIFTS_ABOVE_IMMOBILE_WATERLINE',translation=[0,deck_drop],ground=True)
        if p>=17:
            s.put(nodes,installed,'installed-dock-supports-and-deck',p,'EXACT_RETAINED_SUPPORTS_AFTER_VERTICAL_EMERGENCE')
        for i,layer in enumerate(backs if p<17 else []):
            drop=interpolate(p,[(0,35),(6,35),(8,23),(10,9),(12,0)])
            top=bounds(layer[...,3]>=8)[1]/4
            drop=max(drop,s.rig.logical[p]['trimOrigin'][1]-top)
            s.put(nodes,s.rise(layer,drop,161 if i else 134),'rear-braced-wall-'+str(i),p,'COMPLETE_BRICK_SUPPORT_RISES_FROM_DOCK_SOCKET',translation=[0,drop])
        for i,layer in enumerate(fronts if p<17 else []):
            drop=interpolate(p,[(0,43),(5,38),(8,24),(10,10),(12,0)])
            s.put(nodes,s.rise(layer,drop,185 if i else 160),'front-louver-pedestal-'+str(i),p,'COMPLETE_LOUVER_PEDESTAL_RISES_WITH_CLOSED_CAP',translation=[0,drop])
        if p>=12:
            drop=interpolate(p,[(12,18),(14,9),(16,0)])
            if p<16:s.put(nodes,s.rise(pump,drop,142),'dock-pump-and-pipework',p,'RIGID_PUMP_ASSEMBLY_EMERGES_ON_DOCK',translation=[0,drop])
            lift=interpolate(p,[(12,77),(14,65),(16,52),(18,35),(20,16),(22,2),(23,0)])
            lift=max(lift,s.rig.logical[p]['trimOrigin'][1]-bounds(head_exact[...,3]>=8)[1]/4)
            s.put(nodes,s.rise(exact_mast if p>=16 else mast,lift,121),'telescopic-dock-crane-mast',p,'COMPLETE_FIXED_DIAMETER_CRANE_MAST_EMERGES_VERTICALLY',translation=[0,lift])
            angle=interpolate(p,[(12,-.8),(14,-.35),(16,0)])
            moved=terminal.move(base.rotate(head_exact if p>=16 else head,angle,(165,60),s.rig.canvas),dy=lift)
            s.put(nodes,moved,'rising-dock-crane-head',p,'RIGID_CRANE_HEAD_RIGHTS_ITSELF_BEFORE_MAST_LIFT',translation=[0,lift],angleRadians=angle)
            if p>=18:
                stair_angle=np.deg2rad(interpolate(p,[(18,76),(20,30),(22,0)]))
                for i,(layer,pivot) in enumerate(zip(stairs,[(160,160),(230,160)])):
                    s.put(nodes,hinged(layer,stair_angle,pivot,s.rig.canvas,depth=.5,axis_direction=(1,.5)),
                          'folding-dock-stairs-'+str(i),p,'COMPLETE_DOCK_STAIRS_FOLD_OUT_FROM_SUPPORTS',angleRadians=stair_angle)
            if p>=14:
                yaw=interpolate(p,[(14,.9),(15,.65),(16,.4),(17,.15),(18,0)])
                source=np.array([(177,25),(295,46),(295,77),(177,56)],float)
                axis=np.array([118*np.cos(yaw)-30*np.sin(yaw),21*np.cos(yaw)+70*np.sin(yaw)])
                origin=np.array([177,25+lift]);target=np.array([origin,origin+axis,origin+axis+[0,31],origin+[0,31]])
                layer=original.quad(jib,source,target,s.rig.canvas)
                s.put(nodes,layer,'deploying-dock-lattice-jib',p,'COMPLETE_JIB_YAWS_IN_PERSPECTIVE_WITH_CONSTANT_SURFACE_COORDINATES',yawRadians=yaw,projectedCorners=target.tolist())
                if p>=18:
                    drop=interpolate(p,[(18,42),(20,22),(22,5),(23,0)])
                    tip=target[1]+[-2,21]
                    delta=tip-[293,67]+[0,drop]
                    s.put(nodes,terminal.move(grab,dx=delta[0],dy=delta[1]),'dock-crane-hook',p,'HOOK_AND_TROLLEY_FOLLOW_LIVE_JIB_TIP',translation=delta.tolist())
                    cable=Image.new('RGBA',(s.rig.canvas[0]*4,s.rig.canvas[1]*4));draw=ImageDraw.Draw(cable)
                    draw.line((tip[0]*4,tip[1]*4,(293+delta[0])*4,(104+delta[1])*4),fill=(50,47,36,255),width=3)
                    s.put(nodes,exact_cable if p==23 else np.array(cable),'dock-hoist-cable',p,'LIVE_JIB_TIP_TO_HOOK_CABLE')
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
        return over(visible,hidden)
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
    def build(p,nodes):
        if p<10:s.put(nodes,s.reveal_floor(floor,p,127),'fixed-lab-foundation',p,'FIXED_WORLD_FOUNDATION_TILES_NATIVE_UNFOLDING',ground=True)
        body_drop=interpolate(p,[(0,45),(4,38),(5,30),(7,17),(9,5),(10,0)])
        if p>=10:
            s.put(nodes,installed,'installed-lab-walls-and-ground',p,'EXACT_RETAINED_LOWER_WALLS_WITH_OPEN_TELESCOPIC_TOWER_SOCKET')
        if p>=5 and p<10:
            s.put(nodes,s.rise(body,body_drop,161),'rising-square-lab-block',p,'COMPLETE_BRICK_BLOCK_RISES_FROM_FIXED_FOUNDATION',translation=[0,body_drop])
        expansion=interpolate(p,[(0,.36),(1,.55),(2,.75),(3,.92),(4,1)])
        support_drop=interpolate(p,[(0,11),(1,15),(2,20),(3,25),(4,28),(6,21),(8,11),(10,0)])
        for i,(layer,center) in enumerate(zip(spires,[(60,100),(173,100),(117,131)])):
            translation=(np.array([117,137])-center)*(1-expansion)+[0,support_drop]
            s.put(nodes,s.rise(terminal.move(layer,dx=translation[0]),translation[1],161),'expanding-corner-spire-'+str(i),p,
                'COMPLETE_SPIRE_MOVES_OUTWARD_WITH_FOUNDATION_AND_RISES_WITH_WALL',translation=translation.tolist())
        if p>=12:
            angle=np.deg2rad(interpolate(p,[(12,74),(14,32),(16,0)]))
            for i,(layer,pivot) in enumerate(zip(steps,[(91,150),(152,151)])):
                s.put(nodes,hinged(layer,angle,np.asarray(pivot)+s.origin,s.rig.canvas,depth=.4,axis_direction=(1,.5)),
                      'folding-lab-entry-ramp-'+str(i),p,'COMPLETE_ENTRY_RAMP_ROTATES_OUTWARD_ABOUT_FOOT_HINGE',angleRadians=angle)
        cap_drop=max(0,gold[p]-gold[-1])
        if p>=1:
            drop=interpolate(p,[(1,39),(4,28),(7,15),(10,0)])
            s.put(nodes,s.rise(big,drop,150),'outer-lab-circular-tier',p,'FIXED_DIAMETER_OUTER_TIER_EXTENDS_ABOVE_WALL',translation=[0,drop])
        if p>=2:
            drop=max(0,cap_drop*.58)
            s.put(nodes,s.rise(medium,drop,127),'middle-lab-circular-tier',p,'FIXED_DIAMETER_MIDDLE_TIER_EXTENDS_FROM_OUTER_SOCKET',translation=[0,drop])
        if p>=10:
            s.put(nodes,s.rise(inner,cap_drop,104),'inner-strutted-lab-core',p,'INNER_CORE_FOLLOWS_DOME_ASSEMBLY_THROUGH_CENTRAL_SOCKET',translation=[0,cap_drop])
        s.put(nodes,terminal.move(cap,dy=cap_drop),'golden-lab-dome',p,'RIGID_GOLDEN_DOME_FOLLOWS_MATCHING_ORIGINAL_GOLD_LANDMARK',translation=[0,cap_drop],originalGoldTop=gold[p])
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
