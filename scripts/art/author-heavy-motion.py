"""Correct rejected heavy-building hinges and continuous foundation deployment."""
import argparse
import shutil
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.interpolate import make_interp_spline
from scipy.ndimage import label, distance_transform_edt, map_coordinates, binary_fill_holes

from buildup import read, sha, write
from painted_rig import over, place

strategic = SourceFileLoader('heavy_strategic', 'scripts/art/author-soviet-strategic.py').load_module()
defense, art, base, terminal = strategic.defense, strategic.art, strategic.base, strategic.terminal
ROOT = Path('.artifacts/buildup-remaining-20261013-r74-v1')
BATCH = ROOT / 'heavy-motion-r98-v1'
AUTHORITY = ROOT / 'soviet-heavy-r97-v1/selected-v1/authoring.json'


class Scene(strategic.Scene):
    def __init__(self, record, output):
        strategic.BATCH = BATCH
        super().__init__(record, output)
        if record['identity']=='NACNST':
            from retained_idle import display
            prefix='ng' if record['theater']=='TEMPERATE' else 'na'
            self.rig.previous['retainedIdleCompletion']['layerOrder']=[prefix+'cnst.shp',prefix+'cnst_c.shp',prefix+'cnst_a.shp']
            self.rig.record['componentRig']=self.rig.previous
            self.full=display(self.rig.record)
        self.source['code'], self.source['sha256'] = __file__, sha(__file__)
        self.hidden_file=BATCH/'hidden-components-v1.png'
        atlas=Image.open(self.hidden_file).convert('RGBA')
        boxes=[(22,40,550,359),(537,30,1003,352),(1020,7,1515,368),
            (128,418,448,719),(578,354,960,736),(1080,414,1437,706),
            (40,744,499,997),(545,744,990,998),(1026,735,1507,998)]
        self.hidden=[]
        for box in boxes:
            im=np.array(atlas.crop(box));im[...,3][im[...,3]>=230]=255
            labels,count=label(im[...,3]>=128)
            sizes=np.bincount(labels.ravel());sizes[0]=0
            if count:
                selected=labels==sizes.argmax()
                im[...,3][~selected]=0
                im[im[...,3]==0]=0
            self.hidden.append(Image.fromarray(im))
        steel=np.array(self.materials[0]);tone=steel[...,:3].mean(axis=-1)
        red=steel.copy();red[...,0]=np.clip(tone*.9+40,0,255);red[...,1]=tone*.045+3;red[...,2]=tone*.03+2
        self.materials[2]=Image.fromarray(red)
        self.materials[1]=self.hidden[6]
        self.materials[3]=self.hidden[7]
        self.source.update(hiddenComponents=str(self.hidden_file),hiddenComponentsSha256=sha(self.hidden_file))
        self.parts_kit={}
        for kind,boxes in {
            'industrial':[(118,10,405,408),(513,68,770,398),(955,8,1190,411),
                (148,426,345,795),(554,439,737,798),(963,411,1129,801),
                (120,802,392,1201),(554,802,739,1205),(872,832,1200,1178)],
            'yard':[(60,8,510,400),(590,80,962,344),(1060,22,1485,410),
                (85,390,455,726),(572,358,987,713),(1127,414,1430,729),
                (140,716,501,1022),(667,738,918,1001),(1060,759,1440,1001)]}.items():
            path=BATCH/(kind+'-components-v1.png')
            atlas=Image.open(path).convert('RGBA')
            cells=[]
            for box in boxes:
                rgba=largest_piece(np.array(atlas.crop(box)))
                rgba[...,3][rgba[...,3]>=230]=255
                image=Image.fromarray(rgba);cells.append(image.crop(image.getbbox()))
            self.parts_kit[kind]=cells
            self.source[kind+'Components']={'file':str(path),'sha256':sha(path)}

    def hidden_part(self, cell, box):
        return place(self.hidden[cell],box,self.rig.canvas)

    def complete_part(self,kind,cell,box,retained=None):
        result=place(self.parts_kit[kind][cell],box,self.rig.canvas)
        if retained is not None:
            result=over(terminal.masked(retained,result[...,3]>=128),result)
        return result

    def draw(self, nodes, layer, name, phase, method, **details):
        if details.pop('ground',False):details['fixedGroundComponent']=True
        self.put(nodes,self.envelope(layer,phase),name,phase,method,**details)

    def translated(self, layer, drop, ground):
        return terminal.masked(terminal.move(layer,dy=drop),self.yy<=ground)


def fraction(p, start, end):
    return float(np.clip((p-start)/(end-start), 0, 1))


def partition(s, polygons):
    """Assign every retained pixel to at most one moving part, frontmost last."""
    parts, occupied = {}, np.zeros(s.full.shape[:2], bool)
    for name, poly in reversed(list(polygons.items())):
        mask = s.region(poly) & ~occupied
        parts[name] = terminal.masked(s.full, mask)
        occupied |= s.region(poly)
    return parts, terminal.masked(s.full, ~occupied)


def largest_piece(layer):
    labels,count=label(layer[...,3]>=128)
    if not count:return layer
    sizes=np.bincount(labels.ravel());sizes[0]=0
    return terminal.masked(layer,labels==sizes.argmax())


def exposed_floor(s, ground, footprint):
    # Retain the completed pavement wherever it remains visible. Generated
    # concrete is confined to surfaces hidden by the finished structures.
    floor=largest_piece(terminal.masked(ground,s.region(footprint)))
    if s.record['identity']=='NANRCT':
        exclude=np.zeros(s.full.shape[:2],bool)
        for x0,y0,x1,y1 in [(109,50,168,124),(76,105,144,174),(176,89,243,168),(126,89,198,171)]:
            exclude|=(s.xx>=x0)&(s.xx<=x1)&(s.yy>=y0)&(s.yy<=y1)
        floor=terminal.masked(ground,s.region(footprint)&~exclude)
    if s.record['identity']=='NAINDP':
        x,y=s.xx,s.yy
        edge=np.where(x<106,149+.5*(x-79),np.where(x<145,174,np.where(x<210,175-.5*(x-150),147)))
        floor=terminal.masked(ground,s.region(footprint)&(y>edge))
    if s.record['identity']=='NACNST':
        voids=[[(42,119),(95,97),(149,109),(160,172),(112,198),(99,194),(72,185),(43,176)],
            [(118,96),(143,88),(169,122),(176,129),(165,138),(143,144),(117,131)],
            [(173,167),(181,151),(181,143),(201,132),(228,143),(234,166),(201,183)]]
        floor=terminal.masked(floor,~np.logical_or.reduce([s.region(q) for q in voids]))
    return floor


def replace_pixels(background, foreground):
    result=background.copy()
    mask=foreground[...,3]>0
    result[mask]=foreground[mask]
    return result


def texture(s, poly, cell=0, shade=1):
    cache=getattr(s,'surface_cache',None)
    if cache is None:s.surface_cache={};cache=s.surface_cache
    key=(tuple(tuple(q) for q in poly),cell,shade)
    if key in cache:return cache[key].copy()
    q = np.asarray(poly)
    x0,y0 = q.min(axis=0); x1,y1 = q.max(axis=0)
    layer = art.material_quad(s, cell, [(x0,y0),(x1,y0),(x1,y1),(x0,y1)], (x1-x0,y1-y0), shade)
    result=terminal.masked(layer, s.region(poly))
    cache[key]=result.copy()
    return result


def pivot_axis(s, layer, pivot, original_axis, target_axis, cross_axis):
    target_axis=np.asarray(target_axis,float).copy()
    if abs(np.linalg.det(np.column_stack((target_axis,cross_axis))))<.5:target_axis[1]-=.5
    matrix = np.column_stack((target_axis,cross_axis)) @ np.linalg.inv(np.column_stack((original_axis,cross_axis)))
    pivot = np.asarray(pivot, float)
    return base.transform(layer, np.column_stack((matrix,pivot-matrix@pivot)), s.rig.canvas)


def paving(s, poly, height=2):
    """Continuous, fixed-camera concrete tiles for temporarily exposed sockets."""
    if not hasattr(s,'pavement_uv'):
        uv=np.array(s.materials[3].convert('RGBA'))
        u=np.mod((s.xx/28+s.yy/14)*110,uv.shape[1]-8)+4
        v=np.mod((-s.xx/28+s.yy/14)*82,uv.shape[0]-8)+4
        rgb=np.stack([map_coordinates(uv[...,c].astype(float),[v,u],order=1,mode='nearest') for c in range(3)],axis=-1)
        s.pavement_uv=np.concatenate((np.clip(rgb*1.03,0,255).astype('uint8'),np.full((*s.full.shape[:2],1),255,dtype='uint8')),axis=-1)
    result=terminal.masked(s.pavement_uv,s.region(poly))
    if height:
        side=terminal.move(result,dy=height);side[...,:3]=(side[...,:3]*.66).astype('uint8')
        result=over(result,side)
    return result


def tube(s, points, radius=3.2, source_points=None):
    """A curved steel tube with a constant circular cross section and seams."""
    points=np.asarray(points,float)
    curve=make_interp_spline(np.linspace(0,1,len(points)),points,k=min(3,len(points)-1))(np.linspace(0,1,100))
    if source_points is not None:
        original=make_interp_spline(np.linspace(0,1,len(source_points)),np.asarray(source_points,float),k=min(3,len(source_points)-1))(np.linspace(0,1,100))
        lo=np.floor((curve.min(axis=0)-radius-2)*4).astype(int)
        hi=np.ceil((curve.max(axis=0)+radius+2)*4).astype(int)
        lo=np.maximum(lo,0);hi=np.minimum(hi,s.full.shape[1::-1])
        w,h=hi-lo
        if w<=0 or h<=0:return np.zeros_like(s.full)
        centerline=np.zeros((h,w),bool);lookup=np.zeros((h,w),int)
        for i,q in enumerate(curve):
            px,py=np.clip(np.rint(q*4-lo).astype(int),[0,0],[w-1,h-1])
            centerline[py,px]=True;lookup[py,px]=i
        distance,nearest=distance_transform_edt(~centerline,return_indices=True)
        index=lookup[nearest[0],nearest[1]]
        tangent=np.gradient(curve,axis=0);normal=np.column_stack((-tangent[:,1],tangent[:,0]))
        normal/=np.maximum(np.linalg.norm(normal,axis=1,keepdims=True),1e-6)
        st=np.gradient(original,axis=0);sn=np.column_stack((-st[:,1],st[:,0]));sn/=np.maximum(np.linalg.norm(sn,axis=1,keepdims=True),1e-6)
        yy,xx=np.mgrid[:h,:w];world=np.stack((xx+lo[0],yy+lo[1]),axis=-1)/4
        lateral=np.sum((world-curve[index])*normal[index],axis=-1)
        # Continuous steel UV comes from the unobstructed final front riser.
        # Transporting arbitrary neighboring RGB around each elbow introduces
        # wall-colored patches when hidden source faces are sampled.
        u=167+np.clip(lateral,-3.25,3.25)
        v=128+np.mod(index*.19,11)
        rgb=np.stack([map_coordinates(s.full[...,c].astype(float),[v*4,u*4],order=1,mode='nearest') for c in range(3)],axis=-1)
        shade=.65+.35*np.sqrt(np.maximum(0,1-(lateral/radius)**2))
        rgb=rgb.mean(axis=-1)[...,None]*np.array([.96,1.,1.02])*shade[...,None]
        alpha=np.clip((radius*4+.5-distance)*255,0,255).astype('uint8')
        local=np.concatenate((np.clip(rgb,0,255).astype('uint8'),alpha[...,None]),axis=-1)
        local[alpha==0]=0
        result=np.zeros_like(s.full);result[lo[1]:hi[1],lo[0]:hi[0]]=local
        return result
    im=Image.new('RGBA',(s.rig.canvas[0]*4,s.rig.canvas[1]*4));d=ImageDraw.Draw(im)
    bands=[(1,radius*8+3,(29,32,34,255))]
    for f in np.linspace(1,.08,24):
        value=int(51+103*np.sqrt(1-f*f))
        bands.append((-.9*(1-f),radius*8*f,(value-6,value,value+3,255)))
    for offset,width,color in bands:
        d.line([tuple((q+[offset,offset*.5])*4) for q in curve],fill=color,width=max(1,round(width)),joint='curve')
    for i in [12,48,83]:
        tangent=curve[min(i+1,99)]-curve[max(i-1,0)]
        normal=np.array([-tangent[1],tangent[0]]);normal/=np.linalg.norm(normal)
        a,b=curve[i]-normal*radius*.9,curve[i]+normal*radius*.9
        d.line([tuple(a*4),tuple(b*4)],fill=(46,49,49,255),width=2)
    result=np.array(im)
    yy,xx=np.indices(result.shape[:2]);grain=(2*np.sin(xx*1.71+yy*.73)+2*np.sin(xx*.31-yy*1.23))
    result[...,:3]=np.clip(result[...,:3].astype(float)+grain[...,None],0,255)
    result[result[...,3]==0]=0
    return result


def reactor(s):
    x,y = s.xx,s.yy
    # Fixed peripheral sockets, back to front. Pipe and ladder pixels are
    # separate so that an emerging tower does not carry installed fixtures.
    polygons = {
        'rear-tower': [(108,50),(170,50),(170,90),(159,104),(168,114),(151,123),(109,119),(113,104),(121,88),(108,88)],
        'core': [(128,113),(139,103),(166,102),(188,114),(188,137),(176,151),(145,155),(128,144)],
        'far-left-pipe': [(124,99),(137,99),(151,109),(154,121),(147,123),(143,112),(134,109),(129,119),(120,118)],
        'far-right-pipe': [(163,111),(172,98),(180,96),(186,98),(185,109),(175,112),(170,121),(163,122)],
        'rear-radial-pipe': [(141,90),(147,90),(157,101),(160,111),(154,113),(149,102),(142,100)],
        'left-tower': [(90,111),(102,107),(115,109),(125,115),(127,122),(125,131),(129,146),(139,163),(133,170),(108,177),(84,168),(82,158),(90,138),(93,126),(88,119)],
        'right-tower': [(195,97),(208,92),(222,94),(229,99),(231,106),(227,116),(229,130),(239,151),(237,158),(215,167),(189,162),(179,155),(185,139),(192,122),(196,110),(192,105)],
        'near-left-pipe': [(119,132),(124,130),(129,118),(137,111),(145,108),(150,111),(150,117),(139,120),(132,130),(127,139),(123,141)],
        'near-right-pipe': [(170,113),(176,109),(187,112),(193,120),(199,129),(196,138),(189,130),(184,121),(174,119)],
        'front-pump': [(155,146),(163,142),(174,144),(180,150),(181,161),(191,162),(193,173),(178,176),(169,169),(157,170),(155,173),(146,174),(145,165),(151,158)],
        'front-pipe': [(159,116),(164,113),(170,116),(174,131),(173,150),(167,153),(163,149),(165,133),(162,124)],
        'center-vial': [(150,102),(156,100),(162,102),(162,116),(157,122),(151,119)],
        'rear-ladder': [(150,65),(154,65),(152,82),(152,93),(156,107),(153,108),(149,94),(148,82)],
        'left-ladder': [(106,123),(110,123),(110,145),(111,171),(108,174),(106,147)],
        'right-ladder': [(214,108),(218,108),(217,129),(224,160),(221,163),(213,131)]}
    a, ground = partition(s, polygons)
    sockets = [([(111,109),(137,99),(166,112),(159,124),(135,130),(109,120)],(138,116)),
        ([(178,153),(211,138),(242,155),(236,170),(207,177),(177,164)],(210,160)),
        ([(76,164),(107,149),(141,165),(133,180),(106,187),(76,174)],(108,172))]
    floorpoly = [(76,164),(110,110),(140,101),(162,114),(182,144),(211,143),(242,155),
        (238,170),(207,178),(187,174),(169,180),(136,177),(107,187),(76,174)]
    floor = paving(s,floorpoly)
    # Exact exposed concrete remains fixed once each platform has deployed.
    slabs = [paving(s,q) for q,_ in sockets]
    central = paving(s,[(114,137),(147,121),(184,140),(165,161),(137,161)])
    towers = [a['rear-tower'],a['right-tower'],a['left-tower']]
    for i,name in enumerate(['rear-tower','right-tower','left-tower']):
        patch=s.hidden_part(4,[(111,53,166,123),(178,93,242,169),(78,109,141,176)][i])
        patch=terminal.masked(patch,s.region(polygons[name])&(y>=[70,110,125][i]))
        towers[i]=over(towers[i],patch)
    core=s.hidden_part(3,(128,103,186,154))

    a['front-pump']=s.retained(polygons['front-pump'])
    atlas=Image.open(s.hidden_file).convert('RGBA')
    for i,name in enumerate(['rear-tower','right-tower','left-tower']):
        rim=s.retained(polygons[name]);rim=terminal.masked(rim,y<[73,111,126][i])
        towers[i]=over(rim,towers[i])
    # Place each slab at its own fixed world socket. A single atlas-wide fit
    # would change the triangle between the three tower foundations.
    slab_images=[Image.fromarray(largest_piece(np.array(atlas.crop(q)))) for q in [(660,35,880,176),(790,185,1001,352),(539,185,748,352)]]
    slabs=[place(im,box,s.rig.canvas) for im,box in zip(slab_images,
        [(109,103,168,131),(177,143,242,175),(76,153,143,184)])]
    central=paving(s,[(124,141),(155,126),(197,148),(191,173),(148,178),(124,166)])
    bridge=paving(s,[(126,123),(141,116),(160,128),(149,140),(136,136)])
    floor=over(bridge,central)
    for slab in slabs:floor=over(slab,floor)
    floor[...,3]=np.minimum(floor[...,3],np.where(y<129,255,s.full[...,3]).astype('uint8'))
    floor[floor[...,3]==0]=0
    retained_floor=exposed_floor(s,ground,floorpoly)
    visible_floor=retained_floor[...,3]>0
    floor=replace_pixels(floor,retained_floor)
    pipe_paths=[[(156,106),(154,101),(150,95),(146,95)],
        [(147,117),(141,106),(129,103),(124,116)],
        [(163,116),(170,105),(180,100),(184,117)],
        [(151,115),(141,116),(133,126),(125,133)],
        [(166,116),(176,111),(184,117),(189,128)],
        [(161,118),(165,123),(167,134),(167,146)]]
    def manifold(index,t):
        points=np.asarray(pipe_paths[index],float)
        pivot=points[0].copy()
        folded=points.copy()
        folded[:,0]=156+(points[:,0]-156)*.12
        folded[:,1]=127-np.arange(len(points))*2.4
        return tube(s,folded*(1-t)+points*t,[3.8,4.0,4.0,4.0,3.8,3.7][index],points)
    for p in range(s.record['frames']):
        s.current_phase=p
        nodes=s.terminal(p)
        if nodes is not None:s.phases.append(nodes);continue
        nodes=[]
        if p>=23:
            rear_mask=(a['rear-tower'][...,3]>0)|(a['rear-ladder'][...,3]>0)
            rear=over(a['rear-ladder'],towers[0])
            s.draw(nodes,s.translated(rear,3,123),'rear-tower-final-lift',p,'FINAL_REAR_TOWER_LIFT_WITH_COMPLETE_RIM',translation=[0,3])
            s.draw(nodes,terminal.masked(s.full,~rear_mask),'completed-reactor-foreground',p,'EXACT_RETAINED_COMPLETED_FOREGROUND')
            s.phases.append(nodes);continue
        if p<8:
            scale=[.32,.40,.55,.58,.74,.87,1,1][p]
            early=art.affine_about(s,central,[[scale,0],[0,scale]],(149,143))
            if p>=4:
                for i,(slab,(_,c)) in enumerate(zip(slabs,sockets)):
                    delta=(1-fraction(p,3,7))*(np.array([149,143])-c)
                    center=np.array(c)+delta
                    direction=center-np.array([151.,149.])
                    side=np.array([-direction[1],direction[0]])
                    side=side/max(1,np.linalg.norm(side))*10
                    connector=paving(s,[np.array([151.,149.])+side,center+side,center-side,np.array([151.,149.])-side])
                    early=over(connector,early)
                    moved=terminal.move(slab,*delta)
                    filled=binary_fill_holes(moved[...,3]>=128)
                    early=over(moved,over(terminal.masked(s.pavement_uv,filled),early))
            filled=binary_fill_holes(early[...,3]>=128)
            early=over(early,terminal.masked(s.pavement_uv,filled))
            s.draw(nodes,early,'connected-deploying-foundation',p,
                'CLOSED_PLATFORMS_SLIDE_APART_ON_OVERLAPPING_CONNECTING_DECKS',scale=scale)
        else:
            s.draw(nodes,floor,'fixed-foundation',p,'FIXED_THREE_PLATFORM_FOOTPRINT',ground=True)
        if p>=8:
            # Three tower rims retain their original width throughout the lift.
            drops=[np.interp(p,[8,12,16,20,23,24],[44,34,22,10,2,0]),(1-fraction(p,8,16))*44,(1-fraction(p,9,18))*40]
            for i in [0]:
                layer=s.translated(towers[i],drops[i],118)
                s.draw(nodes,layer,f'cooling-tower-{i}',p,'RIGID_TOWER_RISES_THROUGH_FIXED_SOCKET',translation=[0,drops[i]])
            if p>=12:
                drop=(1-fraction(p,11,18))*27
                s.draw(nodes,s.translated(core,drop,153),'reactor-vessel',p,
                    'CYLINDRICAL_VESSEL_RISES_VERTICALLY',translation=[0,drop])
            if p>=16:
                t=fraction(p,15,23)
                for j,name in enumerate(['rear-radial-pipe','far-left-pipe','far-right-pipe']):
                    layer=manifold(j,t)
                    s.draw(nodes,layer,name,p,'PIPE_SWINGS_FROM_CENTRAL_VERTICAL_BEARING',fraction=t)
            for i in [1,2]:
                layer=s.translated(towers[i],drops[i],[122,167,177][i])
                s.draw(nodes,layer,f'cooling-tower-{i}',p,'RIGID_TOWER_RISES_THROUGH_FIXED_SOCKET',translation=[0,drops[i]])
            if p>=9:
                drop=(1-fraction(p,8,11))*13
                s.draw(nodes,s.translated(a['front-pump'],drop,174),'front-pump',p,
                    'PUMP_CAP_AND_SHORT_PIPES_RISE_FROM_FOOTING',translation=[0,drop])
            if p>=16:
                t=fraction(p,15,23)
                for j,name in enumerate(['near-left-pipe','near-right-pipe','front-pipe']):
                    layer=manifold(j+3,t)
                    s.draw(nodes,layer,name,p,'CURVED_PIPE_UNFOLDS_FROM_CENTRAL_MANIFOLD',fraction=t)
                drop=(1-fraction(p,16,23))*14
                s.draw(nodes,s.translated(a['center-vial'],drop,123),'central-vial',p,
                    'CENTRAL_VIAL_RISES_THROUGH_MANIFOLD',translation=[0,drop])
            if p>=18:
                for i,name in enumerate(['rear-ladder','right-ladder','left-ladder']):
                    t=fraction(p,[18,17,18][i],23)
                    layer=terminal.move(a[name],dy=(1-t)*[40,50,45][i])
                    layer=terminal.masked(layer,s.region(polygons[name]))
                    s.draw(nodes,layer,name,p,'LADDER_EXTENDS_UP_FIXED_TOWER_TRACK',fraction=t)
        s.phases.append(nodes)
    return s.finish()


def industrial(s):
    x,y=s.xx,s.yy
    completed=s.full.copy()
    coilred=(x>=184)&(x<=204)&(y>=74)&(y<=129)&(completed[...,0]>completed[...,1].astype(float)*1.7)&(completed[...,0]>completed[...,2].astype(float)*1.7)
    bare=completed.copy()
    for col in np.where(coilred.any(axis=0))[0]:
        rows=np.where(coilred[:,col])[0]
        valid=(~coilred[:,col])&(completed[:,col,3]>128)
        good=np.where(valid)[0]
        for c in range(3):bare[rows,col,c]=np.interp(rows,good,completed[good,col,c])
    s.full=bare
    polys={
        'rear-masonry':[(108,43),(127,33),(145,35),(160,78),(162,135),(142,146),(111,133)],
        'left-masonry':[(79,107),(96,99),(110,107),(113,139),(99,151),(79,141)],
        'right-masonry':[(193,99),(205,94),(219,101),(229,148),(217,157),(194,145)],
        'rear-wall-fin':[(86,37),(95,45),(99,107),(87,113)],
        'right-wall-fin':[(192,52),(203,42),(206,103),(192,101)],
        'rear-stack':[(123,5),(137,5),(140,12),(151,12),(156,19),(157,47),(123,46)],
        'left-stack':[(85,54),(96,54),(106,62),(110,84),(110,100),(105,111),(89,113),(81,105),(81,83)],
        'rear-exhaust':[(165,24),(174,24),(176,37),(179,37),(181,83),(176,91),(163,86),(160,76),(160,61)],
        'vent-hood':[(112,49),(122,48),(136,55),(135,72),(126,80),(111,71)],
        'press-rear':[(153,82),(162,78),(171,83),(170,112),(159,119),(151,113)],
        'press-middle':[(138,90),(147,86),(156,91),(157,122),(143,130),(137,123)],
        'press-front':[(123,98),(133,94),(142,100),(144,133),(131,141),(123,137)],
        'piston-base':[(145,143),(194,121),(211,139),(204,155),(154,175),(141,165)],
        'piston-rear':[(182,103),(193,100),(201,109),(201,129),(188,138),(179,133),(179,113)],
        'piston-middle':[(167,111),(178,108),(186,117),(186,138),(174,147),(165,141),(165,121)],
        'piston-front':[(151,119),(162,116),(170,125),(170,147),(157,153),(149,147),(149,128)],
        'rear-rod':[(162,99),(170,96),(182,102),(189,101),(194,106),(192,118),(187,119),(186,109),(168,103)],
        'middle-rod':[(146,107),(155,104),(168,111),(175,109),(179,114),(178,125),(173,128),(172,117),(153,111)],
        'front-rod':[(132,115),(139,112),(152,119),(160,117),(164,123),(163,135),(158,135),(157,126),(139,118)],
        'cross-rail':[(134,111),(169,94),(174,96),(174,100),(136,117)],
        'service-panel':[(109,156),(123,139),(137,135),(144,140),(145,161),(126,174),(112,174)],
        'service-pipes':[(101,147),(108,142),(118,146),(118,152),(108,156),(108,162),(101,162)],
        'front-pipes':[(128,163),(138,157),(146,159),(152,155),(160,162),(157,168),(149,166),(142,170),(135,170),(135,174),(129,174)],
        'right-coil':[(189,75),(196,74),(202,80),(202,112),(197,118),(189,114),(187,109),(187,81)],
        'right-exhaust':[(191,66),(197,66),(198,77),(207,80),(213,99),(207,103),(201,98),(199,87),(193,84)]}
    a,ground=partition(s,polys)
    floorpoly=[(67,147),(157,103),(230,147),(230,156),(155,188),(119,188),(67,155)]
    floor=terminal.masked(s.hidden_part(2,(67,116,228,187)),s.region(floorpoly))
    floor=over(floor,texture(s,floorpoly,3))
    floor=terminal.masked(floor,s.region(floorpoly))
    floor[...,3]=np.minimum(floor[...,3],np.where(y<145,255,s.full[...,3]).astype('uint8'))
    floor[floor[...,3]==0]=0
    retained_floor=exposed_floor(s,ground,floorpoly)
    visible_floor=retained_floor[...,3]>0
    floor=replace_pixels(floor,retained_floor)
    # Keep all unsegmented retained wall pixels with their nearest structural bay.
    leftovers=terminal.masked(ground,(y<138)&(y>=50))
    a['rear-masonry']=over(a['rear-masonry'],terminal.masked(leftovers,(x>=104)&(x<188)))
    a['left-masonry']=over(a['left-masonry'],terminal.masked(leftovers,x<104))
    a['right-masonry']=over(a['right-masonry'],terminal.masked(leftovers,x>=188))
    for name in ['rear-masonry','left-masonry','right-masonry']:
        a[name]=over(a[name],terminal.masked(texture(s,polys[name],1,1.0),(s.full[...,3]>0)&(y>={'rear-masonry':45,'left-masonry':109,'right-masonry':102}[name])))
        a[name]=largest_piece(a[name])
    for i,name in enumerate(['rear-wall-fin','right-wall-fin']):
        a[name]=over(a[name],texture(s,polys[name],0,.55))
    for name in ['piston-rear','piston-middle','piston-front']:
        a[name]=s.retained(polys[name])
    press_bearings=[(160,149),(146,157),(132,165)]
    press_joints=[117,125,133]
    for i,name in enumerate(['press-rear','press-middle','press-front']):
        bx,by=press_bearings[i];top=[82,90,98][i]
        front=[(bx-8,top),(bx+2,top+5),(bx+2,by+5),(bx-8,by)]
        side=[(bx+2,top+5),(bx+10,top+1),(bx+10,by+1),(bx+2,by+5)]
        cap=[(bx-8,top),(bx,top-4),(bx+10,top+1),(bx+2,top+5)]
        complete=over(texture(s,cap,2,1.2),over(texture(s,side,2,.55),texture(s,front,2,.9)))
        a[name]=over(a[name],complete)
    pedestal_poly=[(159,78),(169,74),(182,80),(185,85),(185,135),(174,144),(159,136)]
    pedestal=texture(s,pedestal_poly,0,.72)
    pedestal[...,:3]=np.clip(pedestal[...,:3].astype(float)*np.array([1.05,.90,.73]),0,255).astype('uint8')
    visible=s.retained(pedestal_poly)
    reserved=np.logical_or.reduce([a[n][...,3]>0 for n in ['press-rear','press-middle','press-front','rear-rod','middle-rod','front-rod','piston-rear','piston-middle','piston-front','rear-exhaust']])
    pedestal=over(terminal.masked(visible,~reserved),pedestal)
    s.full=completed
    for p in range(s.record['frames']):
        s.current_phase=p
        nodes=s.terminal(p)
        if nodes is not None:s.phases.append(nodes);continue
        nodes=[]
        if p>=24:
            s.draw(nodes,s.full,'completed-industrial-plant',p,'EXACT_RETAINED_COMPLETED_ART')
            s.phases.append(nodes);continue
        scale=[.15,.48,.65,.80,.94,1][min(p,5)]
        layer=floor if p>=5 else art.affine_about(s,floor,[[scale,0],[0,scale]],(149,160))
        s.draw(nodes,layer,'fixed-foundation' if p>=5 else 'expanding-foundation',p,'FOUNDATION_DEPLOYS_THEN_STAYS_FIXED',scale=scale,ground=p>=5)
        if p==0:s.phases.append(nodes);continue
        if p<5:
            arm=paving(s,[(139,151),(177,131),(224,147),(214,157),(151,179),(119,169)])
            s.draw(nodes,arm,'deploying-side-foundation-arms',p,'CONNECTED_PLATFORM_ARMS_UNFOLD_UNDER_RISING_PIERS')
        if p>=18:
            moving=['right-exhaust','rear-stack']
            remove=np.logical_or.reduce([a[n][...,3]>0 for n in moving])
            s.draw(nodes,terminal.masked(a['right-wall-fin'],s.region(polys['right-exhaust'])),'installed-exhaust-back-wall',p,'COMPLETE_BACK_WALL_BEHIND_EMERGING_EXHAUST')
            shaft=texture(s,[(189,75),(195,74),(201,79),(201,117),(189,117)],0,.48)
            s.draw(nodes,shaft,'installed-coil-support-shaft',p,'COMPLETE_SHAFT_BEHIND_UNROLLING_COIL')
            installed=s.full.copy()
            spiral=(x>=184)&(x<=204)&(y>=74)&(y<=129)&(installed[...,0]>installed[...,1].astype(float)*1.7)&(installed[...,0]>installed[...,2].astype(float)*1.7)
            covered=spiral&(y<129-fraction(p,20,24)*55)
            installed[...,:3][covered]=bare[...,:3][covered]
            s.draw(nodes,terminal.masked(installed,~remove&~visible_floor),'installed-industrial-structure',p,
                'EXACT_INSTALLED_STRUCTURE_WITH_ONLY_UNFINISHED_FIXTURES_REMOVED')
            drop=max(0,s.rig.logical[p]['trimOrigin'][1]+1-7)
            s.draw(nodes,s.translated(a['rear-stack'],drop,50),'rear-stack',p,'FINAL_STACK_RISE_WITH_COMPLETE_OPEN_RIM',translation=[0,drop])
            t=fraction(p,17,23)
            s.draw(nodes,s.translated(a['right-exhaust'],(1-t)*34,103),'right-exhaust',p,
                'EXTERIOR_CURVED_EXHAUST_RISES_THROUGH_PIER',fraction=t)
            s.phases.append(nodes);continue
        rear_drop=max((1-fraction(p,0,6))*83,s.rig.logical[p]['trimOrigin'][1]+1-7-22) if p<8 else 0
        for i,name in enumerate(['rear-wall-fin','right-wall-fin']):
            angle=fraction(p,1,8)*np.pi/2
            pivot=[(95,140),(199,140)][i]
            length=[62,50][i]
            direction=[-1,1][i]
            target=np.array([direction*length*np.cos(angle),-length*np.sin(angle)+length*.5*np.cos(angle)])
            layer=pivot_axis(s,a[name],pivot,(0,-100),target,(7,3.5))
            extension=fraction(p,8,18)
            if p>=8:
                layer=pivot_axis(s,a[name],pivot,(0,-100),(0,-length-(100-length)*extension),(7,3.5))
            s.draw(nodes,layer,name,p,'SIDE_PANEL_PIVOTS_FROM_PAVEMENT_THEN_EXTENDS_IN_FIXED_TRACK',angleRadians=float(angle))
        if p<=13:
            wall_top=s.rig.logical[p]['trimOrigin'][1]+2 if p<=10 else [40,52,66][p-11]
            wall=texture(s,[(122,wall_top),(146,wall_top+12),(153,132),(124,144)],1,.65)
            s.draw(nodes,wall,'temporary-rear-brick-wall',p,'BRICK_BACK_WALL_RISES_THEN_RETRACTS_BEHIND_STACKS')
        for i,name in enumerate(['rear-masonry','left-masonry','right-masonry']):
            start,end=[(0,6),(4,10),(1,7)][i]
            if p<start:continue
            drop=rear_drop if i==0 else (1-fraction(p,start,end))*[83,34,47][i]
            if i==2:
                angle=fraction(p,1,7)*np.pi/2
                axis=np.array([-53*np.cos(angle),-53*np.sin(angle)-26.5*np.cos(angle)])
                layer=pivot_axis(s,a[name],(216,153),(0,-53),axis,(11,-5.5))
                s.draw(nodes,layer,name,p,'RIGHT_MASONRY_BUTTRESS_FLIPS_UP_ON_FIXED_FOOT_HINGE',angleRadians=float(angle))
            else:
                s.draw(nodes,s.translated(a[name],drop,[145,151,157][i]),name,p,
                    'MASONRY_PIER_RISES_THROUGH_FIXED_FOOTING',translation=[0,drop])
        pedestal_drop=(1-fraction(p,1,7))*43
        s.draw(nodes,s.translated(pedestal,pedestal_drop,148),'rear-exhaust-masonry-pedestal',p,
            'INDEPENDENT_REAR_CYLINDRICAL_PEDESTAL_RISES_FROM_PLATFORM',translation=[0,pedestal_drop])
        for i,name in enumerate(['rear-stack','rear-exhaust','left-stack']):
            start,end=[(1,16),(3,18),(5,17)][i]
            if p<start:continue
            parent_drop=(1-fraction(p,4,10))*34 if i==2 else rear_drop
            drop=parent_drop+(1-fraction(p,8,end))*[22,43,46][i]
            if i==0:drop=max(drop,s.rig.logical[p]['trimOrigin'][1]+1-7)
            if i==0:
                near=terminal.masked(a[name],x<139)
                far=terminal.masked(a[name],x>=139)
                s.draw(nodes,s.translated(near,drop,50+parent_drop),'first-rear-stack',p,
                    'FIRST_STACK_RISES_WITH_MAIN_MASONRY',translation=[0,drop])
                if p>=8:
                    second_drop=drop+(1-fraction(p,8,15))*24
                    s.draw(nodes,s.translated(far,second_drop,50+parent_drop),'second-rear-stack',p,
                        'SECOND_STACK_TELESCOPES_AFTER_FIRST_STACK',translation=[0,second_drop])
            else:
                s.draw(nodes,s.translated(a[name],drop,[50,89,110][i]+parent_drop),name,p,
                    'STACK_RISES_THROUGH_ITS_MOVING_PARENT_MASONRY_SOCKET',translation=[0,drop],parentVerticalTravel=parent_drop)
        if p>=10:
            vent=a['vent-hood']
            slat_polys=[[(115+j*5,56+j*2.4),(119+j*5,58+j*2.4),(115+j*5,70+j*2.4),(111+j*5,68+j*2.4)] for j in range(3)]
            moving=np.logical_or.reduce([s.region(q) for q in slat_polys])
            back=texture(s,polys['vent-hood'],0,.42)
            s.draw(nodes,over(terminal.masked(vent,~moving),terminal.masked(back,moving)),
                'vent-fixed-frame',p,'FIXED_VENT_FRAME_AROUND_INDEPENDENT_LOUVERS')
            for j,q in enumerate(slat_polys):
                t=fraction(p,10+j,14+j)
                slat=terminal.masked(vent,s.region(q))
                layer=base.hinged(slat,(1-t)*.85,tuple(np.mean(q[2:],axis=0)),s.rig.canvas,
                    depth=.3,axis_direction=(1,.5),fold_direction=(.7,-.35))
                s.draw(nodes,layer,f'vent-louver-{j}',p,'LOUVER_TIPS_IN_FIXED_FRAME',fraction=t)
        if p>=1:
            for i,name in enumerate(['press-rear','press-middle','press-front']):
                begin,end=[(1,6),(3,12),(5,17)][i]
                if p<begin:continue
                t=fraction(p,begin,end)
                pivot=np.array(press_bearings[i],float)
                joint=np.array([pivot[0],press_joints[i]],float)
                lower_length=pivot[1]-joint[1];upper_length=35
                angle=t*np.pi/2;return_angle=np.pi-angle
                lower_axis=lower_length*np.array([np.cos(angle),-.5*np.cos(angle)-np.sin(angle)])
                upper_axis=upper_length*np.array([np.cos(return_angle),-.5*np.cos(return_angle)-np.sin(return_angle)])
                seam=joint[1]+.5*(x-pivot[0])
                lower=terminal.masked(a[name],y>=seam)
                upper=terminal.masked(a[name],y<seam)
                lower=pivot_axis(s,lower,pivot,(0,-lower_length),lower_axis,(10,5))
                upper=pivot_axis(s,upper,joint,(0,-upper_length),upper_axis,(10,5))
                upper=terminal.move(upper,*(pivot+lower_axis-joint))
                s.draw(nodes,lower,name+'-lower-fold',p,'TWO_STAGE_PRESS_LOWER_PANEL_ROTATES_FROM_PAVEMENT',bearing=pivot.tolist(),hinge=(pivot+lower_axis).tolist(),angleRadians=float(angle))
                s.draw(nodes,upper,name+'-return-fold',p,'PRESS_RETURN_PANEL_UNFOLDS_ABOUT_MOVING_ELBOW',hinge=(pivot+lower_axis).tolist(),angleRadians=float(return_angle))
            if p>=4:
                drop=(1-fraction(p,4,8))*19
                s.draw(nodes,s.translated(a['piston-base'],drop,175),'piston-base',p,
                    'PISTON_BANK_SLAB_RISES_FROM_PLATFORM',translation=[0,drop])
        if p>=9:
            for i,name in enumerate(['piston-rear','piston-middle','piston-front']):
                drop=(1-fraction(p,8+i,14+i))*26
                s.draw(nodes,s.translated(a[name],drop,[138,147,153][i]),name,p,
                    'RIGID_CHROME_CYLINDER_RISES_THROUGH_ITS_BASE',translation=[0,drop])
            for i,name in enumerate(['rear-rod','middle-rod','front-rod']):
                t=fraction(p,9+i,17+i)
                layer=base.hinged(a[name],(1-t)*-.9,[(188,116),(174,125),(159,133)][i],s.rig.canvas,
                    depth=0,axis_direction=(1,.5),fold_direction=(.5,-1))
                s.draw(nodes,layer,name,p,'CONNECTING_ROD_PIVOTS_INTO_PISTON_SOCKET',fraction=t)
        if p>=12:
            t=fraction(p,11,18)
            s.draw(nodes,terminal.move(a['cross-rail'],dy=(1-t)*18),'cross-rail',p,
                'CROSS_SHAFT_RISES_BETWEEN_PRESS_HEADS',fraction=t)
        if p>=1:
            drop=(1-fraction(p,1,7))*25
            housing=s.retained(polys['service-panel'])
            face_quad=[(126,139),(140,144),(127,173),(112,168)]
            face=s.region(face_quad)&(housing[...,3]>0)
            if p<17:
                blank=art.material_quad(s,3,face_quad,(14,28),.9)
                housing=over(terminal.masked(housing,~face),terminal.masked(blank,face))
            s.draw(nodes,s.translated(housing,drop,174),'service-housing',p,'SERVICE_HOUSING_RISES_FROM_PLATFORM',translation=[0,drop])
        if p>=14:
            for i,name in enumerate(['service-pipes','front-pipes']):
                t=fraction(p,13+i,18)
                s.draw(nodes,s.translated(a[name],(1-t)*10,174),name,p,'SERVICE_PIPES_RISE_THROUGH_FOOTINGS',fraction=t)
        if p>=18:
            t=fraction(p,17,23)
            layer=s.translated(a['right-exhaust'],(1-t)*34,103)
            s.draw(nodes,layer,'right-exhaust',p,'EXTERIOR_CURVED_EXHAUST_RISES_THROUGH_PIER',fraction=t)
        if p>=21:
            t=fraction(p,20,24)
            layer=terminal.masked(a['right-coil'],y>=118-t*44)
            s.draw(nodes,layer,'right-coil',p,'SPIRAL_PIPE_EXTENDS_UP_FIXED_EXTERIOR_SHAFT',fraction=t)
        s.phases.append(nodes)
    return s.finish()


def construction_yard(s):
    from retained_idle import display
    x,y=s.xx,s.yy
    completed=s.full.copy()
    prefix='ng' if s.record['theater']=='TEMPERATE' else 'na'
    s.full=display(s.rig.record,exclude_members=(prefix+'cnst_c.shp',))
    polys={
        'rear-tower':[(118,99),(141,89),(161,98),(167,119),(176,127),(169,135),(143,141),(118,131)],
        'left-machinery':[(43,120),(80,102),(108,111),(117,167),(100,197),(72,193),(43,179)],
        'garage-frame':[(83,134),(133,109),(143,114),(149,141),(159,169),(151,176),(146,176),(107,197),(91,188)],
        'garage-door':[(105,155),(145,136),(153,171),(108,193)],
        'garage-header':[(95,143),(137,123),(155,133),(148,148),(108,168)],
        'rear-wing-left':[(118,105),(123,99),(132,101),(130,111),(122,116),(118,112)],
        'rear-wing-right':[(150,100),(156,99),(163,109),(160,116),(151,113)],
        'tower-neck':[(128,89),(150,89),(154,97),(149,105),(130,105),(126,99)],
        'dome':[(130,75),(137,69),(140,64),(143,70),(150,76),(152,85),(148,92),(132,92),(128,85)],
        'spire':[(138,44),(143,44),(143,69),(140,75),(137,69)],
        'left-red-hood':[(48,116),(62,110),(77,126),(67,134),(52,125)],
        'rear-red-hood':[(80,102),(94,97),(107,114),(96,121),(83,110)],
        'shop-roof':[(80,123),(95,116),(110,122),(109,131),(95,136)],
        'crane-base':[(173,166),(179,162),(180,151),(184,147),(181,143),(201,132),(222,140),(229,143),(229,157),(233,165),(218,174),(201,183),(190,178),(180,176),(173,172)],
        'crane-upper-arm':[(182,99),(190,99),(220,117),(225,135),(218,137),(214,127),(183,111)],
        'crane-outer-arm':[(181,100),(188,102),(183,113),(180,131),(171,132),(173,115)],
        'crane-hydraulic':[(189,116),(194,115),(205,139),(201,142)]}
    from retained_idle import display
    prefix='ng' if s.record['theater']=='TEMPERATE' else 'na'
    arm=display(s.rig.record,exclude_members=(prefix+'cnst.shp',prefix+'cnst_a.shp'))
    a,ground=partition(s,polys)
    arm_polys={
        'crane-upper-arm':[(181,99),(190,99),(223,119),(228,137),(216,142),(210,124),(181,112)],
        'crane-outer-arm':[(181,100),(189,104),(177,153),(171,162),(161,158),(161,149),(173,111)],
        'crane-claw':[(163,155),(174,155),(181,164),(179,176),(171,185),(153,189),(150,179),(153,165)],
        'crane-receiver':[(211,120),(221,120),(228,125),(229,145),(215,154),(206,148),(211,139)],
        'crane-hydraulic':[(188,118),(194,119),(206,141),(199,145)]}
    for name,q in arm_polys.items():a[name]=terminal.masked(arm,s.region(q))
    for name in ['crane-upper-arm','crane-outer-arm']:
        rgb=a[name][...,:3].astype(float)
        paint=((rgb[...,0]>rgb[...,1]*1.3)&(rgb[...,0]>rgb[...,2]*1.3))|((rgb[...,0]>rgb[...,1]*.9)&(rgb[...,1]>rgb[...,2]*1.5))
        keep=binary_fill_holes(paint&(a[name][...,3]>0))
        a[name]=terminal.masked(a[name],keep)
    arm_mask=arm[...,3]>0
    ground=terminal.masked(ground,~arm_mask)
    for name in a:
        if not name.startswith('crane-'):a[name]=terminal.masked(a[name],~arm_mask)
    # Receiver and pier are distinct: the claw crosses in front of the pier.
    a['crane-base']=terminal.masked(a['crane-base'],~arm_mask)
    floorpoly=[(38,164),(136,115),(240,165),(240,177),(150,219),(116,219),(38,177)]
    # A continuous paved surface is present before the walls and machinery rise.
    floor=s.hidden_part(0,(38,117,240,219))
    floor=terminal.masked(floor,s.region(floorpoly))
    floor[...,3]=np.minimum(floor[...,3],np.where(y<165,255,s.full[...,3]).astype('uint8'))
    floor[floor[...,3]==0]=0
    retained_floor=exposed_floor(s,ground,floorpoly)
    visible_floor=retained_floor[...,3]>0
    floor=replace_pixels(floor,retained_floor)
    floor=replace_pixels(floor,terminal.masked(s.full,y>207-.25*np.abs(x-145)))
    hatchpoly=[(125,190),(145,180),(178,195),(158,209),(125,197)]
    floor=replace_pixels(floor,s.retained([(118,196),(145,180),(184,197),(156,212)]))
    floor=terminal.masked(floor,s.region(floorpoly))
    floor[...,3]=np.minimum(floor[...,3],np.where(y<165,255,s.full[...,3]).astype('uint8'))
    floor[floor[...,3]==0]=0
    leftovers=terminal.masked(ground,(y<132)&(x<170)&(y>95))
    a['rear-tower']=over(a['rear-tower'],terminal.masked(leftovers,(x>=126)&(y>=119)))
    a['left-machinery']=over(a['left-machinery'],terminal.masked(leftovers,x<112))
    garage_hole=texture(s,[(103,157),(143,137),(153,172),(109,193)],0,.28)
    rear_socket=texture(s,[(115,128),(141,115),(170,131),(143,145)],0,.76)
    tower_backing=texture(s,[(122,105),(141,95),(160,105),(162,126),(143,138),(122,126)],0,.70)
    a['rear-tower']=terminal.masked(a['rear-tower'],~((x<126)&(y>=105)&(y<120)))
    a['rear-tower']=over(a['rear-tower'],s.hidden_part(5,(119,97,175,141)))
    wing_mask=s.region(polys['rear-wing-left'])|s.region(polys['rear-wing-right'])
    a['rear-tower']=terminal.masked(a['rear-tower'],~wing_mask)
    for name in ['rear-wing-left','rear-wing-right']:
        a[name]=over(largest_piece(a[name]),texture(s,polys[name],0,.8))
    early_cap=np.zeros_like(s.full)
    for q in [[(124,106),(141,98),(158,106),(141,115)],[(128,102),(141,96),(154,102),(141,109)],[(132,97),(141,93),(150,97),(141,102)]]:
        top=texture(s,q,0,1.0);side=terminal.move(top,dy=4);side[...,:3]=(side[...,:3]*.6).astype('uint8')
        early_cap=over(top,over(side,early_cap))
    stray=(x<126)&(y<119)&(a['rear-tower'][...,0]>a['rear-tower'][...,2]*1.4)&(a['rear-tower'][...,1]>a['rear-tower'][...,2]*1.3)
    a['left-machinery']=over(terminal.masked(a['rear-tower'],stray),a['left-machinery'])
    a['rear-tower']=terminal.masked(a['rear-tower'],~stray)
    portal=s.region([(83,134),(94,128),(110,194),(102,198),(90,189)])|s.region([(139,127),(147,125),(159,174),(151,180)])|s.region([(83,134),(133,109),(141,116),(90,144)])
    backing=s.complete_part('yard',0,(83,109,159,197))
    a['left-machinery']=over(terminal.masked(a['garage-frame'],~portal&(x<107)&(y>165)),a['left-machinery'])
    a['garage-frame']=over(terminal.masked(a['garage-frame'],portal),terminal.masked(backing,portal))
    for name,cell,box in [('garage-header',1,(95,123,155,168)),('shop-roof',8,(78,117,111,137))]:
        backing=s.complete_part('yard',cell,box)
        a[name]=over(a[name],terminal.masked(backing,s.region(polys[name])))
    rear_shop=s.region([(81,113),(94,107),(107,114),(107,135),(95,142),(81,135)])
    backing=texture(s,[(81,113),(94,107),(107,114),(107,135),(95,142),(81,135)],0,.7)
    a['left-machinery']=over(a['left-machinery'],backing)
    early_roof_red=(x>=70)&(x<=116)&(y>=94)&(y<=140)&(a['left-machinery'][...,0]>a['left-machinery'][...,1].astype(float)*1.5)
    a['left-machinery']=terminal.masked(a['left-machinery'],~early_roof_red)
    vehicle_root=Path('.local/hd-packs/soviet-smcv-vxl/owner-r3')
    vehicle_manifest=read(vehicle_root/'manifest.json')
    part=vehicle_manifest['parts'][0]
    vf=next(f for f in part['frames'] if f['heading']==180)
    vx,vy,vw,vh=vf['rect']
    vi=Image.open(vehicle_root/part['files']['base']['file']).convert('RGBA').crop((vx,vy,vx+vw,vy+vh))
    vehicle=place(vi,(111,126,177,176),s.rig.canvas)
    chassis=terminal.masked(vehicle,~s.region([(122,131),(154,121),(171,132),(147,147)]))
    cab=terminal.masked(chassis,x<132)
    sides=[terminal.masked(chassis,(x>=132)&(y>=153)),terminal.masked(chassis,(x>=132)&(y<153))]
    red_panel=texture(s,[(165,141),(174,137),(182,141),(173,146)],2,.8)
    # Folded lifting cylinders use complete closed cylinders, with a fixed
    # bottom bearing and no sampled Original color or silhouette transport.
    def cylinders(p):
        im=Image.new('RGBA',(s.rig.canvas[0]*4,s.rig.canvas[1]*4));d=ImageDraw.Draw(im)
        t=fraction(p,0,4)
        axis=np.array([27,-27])*(1-t)+np.array([0,-39])*t
        if p>=5:axis=np.array([0,-39])*(1-fraction(p,4,6))
        for pivot in [np.array([130.,145.]),np.array([140.,150.])]:
            end=pivot+axis
            for shift,width,color in [(1.2,22,(65,64,53,255)),(0,20,(169,169,148,255)),(-.8,11,(224,224,200,255)),(-1.5,4,(246,244,218,255))]:
                d.line([tuple((pivot+[shift,0])*4),tuple((end+[shift,0])*4)],fill=color,width=width)
            d.ellipse(((end[0]-2.5)*4,(end[1]-1.5)*4,(end[0]+2.5)*4,(end[1]+1.5)*4),fill=(210,210,192,255),outline=(91,94,83,255),width=2)
        return np.array(im)
    # Transient folding ladder uses an authored rigid metal assembly.
    ladder=Image.new('RGBA',(s.rig.canvas[0]*4,s.rig.canvas[1]*4));ld=ImageDraw.Draw(ladder)
    for lx in [79,83]:ld.line([(lx*4,117*4),(lx*4,77*4)],fill=(76,80,83,255),width=5)
    for ly in range(80,117,3):ld.line([(79*4,ly*4),(83*4,ly*4)],fill=(143,148,151,255),width=3)
    ladder=np.array(ladder)
    s.full=completed
    for p in range(s.record['frames']):
        s.current_phase=p
        nodes=s.terminal(p)
        if nodes is not None:s.phases.append(nodes);continue
        nodes=[]
        if p>=29:
            s.draw(nodes,terminal.masked(s.full,a['spire'][...,3]==0),'completed-construction-yard',p,'EXACT_RETAINED_COMPLETED_BODY')
            s.draw(nodes,s.translated(a['spire'],10,75),'final-finial-lift',p,'FINAL_FINIAL_LIFT_WITH_COMPLETE_TIP',translation=[0,10])
            s.phases.append(nodes);continue
        if p>=4:
            scale=[.16,.27,.44,.65,.82,.94,1][min(p-4,6)]
            layer=floor if p>=10 else art.affine_about(s,floor,[[scale,0],[0,scale]],(149,197))
            s.draw(nodes,layer,'fixed-foundation' if p>=10 else 'deploying-foundation',p,
                'PAVED_PLATFORM_DEPLOYS_FROM_VEHICLE_FOOTING',scale=scale,ground=p>=10)
        if p>=23:
            s.draw(nodes,texture(s,[(73,124),(96,113),(116,122),(99,138)],0,.4),'installed-shop-inner-roof',p,'CLOSED_INNER_SURFACE_UNDER_CLOSING_ROOF')
            s.draw(nodes,garage_hole,'installed-garage-interior',p,'CLOSED_DARK_GARAGE_INTERIOR')
            pending=['dome','spire','tower-neck','shop-roof','garage-door','garage-header']
            remove=np.logical_or.reduce([a[n][...,3]>0 for n in pending])
            remove|=arm_mask
            s.draw(nodes,terminal.masked(s.full,~remove&~visible_floor),'installed-yard-structure',p,
                'EXACT_INSTALLED_STRUCTURE_BELOW_REMAINING_HINGED_COMPONENTS')
        if p<=8:
            if p<=6:
                for i,side in enumerate(sides):
                    delta=fraction(p,1,5)*np.array([(18,9),(-9,-4)][i])
                    layer=terminal.move(side,*delta)
                    layer=terminal.masked(layer,y<176-(max(0,p-4)*10))
                    s.draw(nodes,layer,f'vehicle-side-{i}',p,'VEHICLE_SIDE_ASSEMBLY_SLIDES_OUTWARD',translation=delta.tolist())
                delta=fraction(p,1,5)*np.array([-17,9])
                s.draw(nodes,terminal.move(cab,*delta),'vehicle-cab',p,
                    'CAB_PLATE_SLIDES_FORWARD_FROM_CHASSIS',translation=delta.tolist())
                s.draw(nodes,cylinders(p),'vehicle-lifting-cylinders',p,'TWIN_CYLINDERS_PIVOT_UP_THEN_TELESCOPE_DOWN')
                delta=fraction(p,1,6)*np.array([28,-4])
                s.draw(nodes,terminal.move(red_panel,*delta),'vehicle-side-cover',p,
                    'RED_SIDE_COVER_SLIDES_OUTWARD',translation=delta.tolist())
        if 7<=p<23:
            platform_scale=[.65,.82,.94,1][min(max(p-7,0),3)]
            platform_travel=(1-platform_scale)*57
            drop=max((1-fraction(p,8,17))*6+platform_travel,s.rig.logical[p]['trimOrigin'][1]+.5-93)
            if p>=10:s.draw(nodes,rear_socket,'rear-tower-footing',p,'FIXED_REAR_TOWER_FOOTING')
            rear_body=over(early_cap,terminal.masked(a['rear-tower'],y>=107)) if p<17 else a['rear-tower']
            s.draw(nodes,s.translated(rear_body,drop,141-.42*np.abs(x-143)+platform_travel),'rear-tower',p,
                'REAR_MECHANISM_RISES_THROUGH_FOOTING',translation=[0,drop])
        if 12<=p<23:
            for i,name in enumerate(['rear-wing-left','rear-wing-right']):
                t=fraction(p,11,16)
                layer=base.hinged(a[name],(1-t)*np.pi/2,[(126,113),(157,114)][i],s.rig.canvas,
                    depth=0,axis_direction=(1,-.5),fold_direction=((-1 if i==0 else 1),-.4))
                layer=terminal.move(layer,dy=drop)
                s.draw(nodes,layer,name,p,'REAR_MECHANISM_WING_HINGES_UP',fraction=t)
        if 13<=p<23:
            cavity=texture(s,[(73,124),(96,113),(116,122),(99,138)],0,.35)
            s.draw(nodes,s.translated(cavity,(1-fraction(p,13,21))*61,190-.45*np.abs(x-99)),'shop-roof-interior',p,'CLOSED_INNER_SHOP_SURFACE_FOLLOWS_RISING_PARENT')
            drop=(1-fraction(p,13,21))*61
            s.draw(nodes,s.translated(a['left-machinery'],drop,190-.45*np.abs(x-99)),'left-machinery',p,
                'SHOP_PIPES_AND_TANKS_RISE_THROUGH_FIXED_BAY',translation=[0,drop])
            drop=(1-fraction(p,14,22))*60
            s.draw(nodes,s.translated(over(a['garage-frame'],garage_hole if p>=22 else texture(s,[(91,136),(135,114),(153,174),(108,196)],1,.9)),drop,197-.48*(x-108)),'garage-frame',p,
                'FRONT_MASONRY_RISES_WITH_OPEN_INNER_BAY',translation=[0,drop])
        if p>=17:
            drop=(1-fraction(p,16,24))*16
            s.draw(nodes,s.translated(a['tower-neck'],drop,105),'tower-neck',p,'DOME_NECK_RISES_THROUGH_REAR_CROWN',translation=[0,drop])
            for i,name in enumerate(['left-red-hood','rear-red-hood'] if p<23 else []):
                t=fraction(p,16+i,23)
                layer=base.hinged(a[name],(1-t)*np.pi/2,[(66,131),(98,117)][i],s.rig.canvas,
                    depth=0,axis_direction=(1,-.5),fold_direction=(-.7,-.35))
                layer=s.translated(layer,(1-fraction(p,13,21))*61,190-.45*np.abs(x-99))
                s.draw(nodes,layer,name,p,'VENT_HOOD_HINGES_UP_ON_RISING_PARENT_BAY',fraction=t)
        if p>=22:
            drop=(1-fraction(p,21,29))*26
            s.draw(nodes,s.translated(a['dome'],drop,92),'dome',p,'GOLD_CROWN_RISES_FROM_OPEN_NECK',translation=[0,drop])
            if p>=29:
                drop=max((1-fraction(p,25,29))*25,s.rig.logical[p]['trimOrigin'][1]+.5-46)
                s.draw(nodes,s.translated(a['spire'],drop,75),'spire',p,'FINIAL_TELESCOPES_FROM_CROWN')
            t=fraction(p,22,29)
            layer=base.hinged(a['shop-roof'],(1-t)*np.pi/2,(94,129),s.rig.canvas,
                depth=0,axis_direction=(1,-.5),fold_direction=(-.7,-.35))
            s.draw(nodes,layer,'shop-roof',p,'SHOP_ROOF_CLOSES_ALONG_HINGE',fraction=t)
        if 14<=p<=19:
            endpoints={14:((99,165),(44,161)),15:((99,157),(56,119)),16:((99,149),(75,95)),17:((99,141),(104,75)),18:((99,141),(120,69)),19:((99,141),(143,78))}
            start,end=endpoints[p]
            pole=tube(s,[start,end],.95)
            s.draw(nodes,pole,'temporary-lifting-mast',p,'LONG_LIFTING_MAST_SWINGS_UP_AND_FOLDS_BEHIND_SHOP',endpoints=endpoints[p])
        if 22<=p<=28:
            axes={14:(-40,0),17:(0,-40),20:(36,-22),23:(-29,-29),26:(0,-40),28:(20,-26)}
            stops=sorted(axes);lo=max(q for q in stops if q<=p);hi=min(q for q in stops if q>=p)
            t=0 if hi==lo else (p-lo)/(hi-lo)
            target=np.array(axes[lo])*(1-t)+np.array(axes[hi])*t
            layer=pivot_axis(s,ladder,(81,117),(0,-40),target,(4,2))
            layer=terminal.move(layer,dy=(1-fraction(p,13,21))*61)
            s.draw(nodes,layer,'folding-service-ladder',p,'RIGID_SERVICE_LADDER_SWINGS_AROUND_LOWER_HINGE',axis=target.tolist())
        if 13<=p<=28:
            drop=(1-fraction(p,13,22))*44
            q=np.array([(95,143),(137,123),(155,133),(108,168)],float)
            top=np.array([(100,142),(141,122)],float)+[0,drop]
            # The long lintel is upright while rising, tips toward the viewer,
            # then closes to the retained sloped canopy over the descending door.
            vectors={13:(0,15),21:(0,15),23:(0,17),24:(8,14),25:(18,9),26:(18,9),27:(17,12),28:(14,20),29:(13,25)}
            stops=sorted(vectors);lo=max(v for v in stops if v<=p);hi=min(v for v in stops if v>=p)
            t=0 if hi==lo else (p-lo)/(hi-lo)
            v=np.array(vectors[lo])*(1-t)+np.array(vectors[hi])*t
            target=np.array([top[0],top[1],top[1]+v,top[0]+v])
            if p>=25:
                open_pose=np.array([(100,142),(141,122),(159,131),(118,151)],float)
                t=fraction(p,25,29);target=open_pose*(1-t)+q*t
            layer=art.original.quad(a['garage-header'],q,target,s.rig.canvas)
            s.draw(nodes,layer,'hinged-shutter-canopy',p,'SHUTTER_HEADER_RISES_UPRIGHT_THEN_TIPS_OUT_ON_LONGITUDINAL_HINGE',corners=target.tolist())
        if p>=26:
            t=fraction(p,25,29)
            layer=terminal.masked(terminal.move(a['garage-door'],dy=-(1-t)*39),s.region(polys['garage-door']))
            s.draw(nodes,layer,'garage-door',p,'SHUTTER_DESCENDS_FROM_HINGED_CANOPY_IN_FIXED_TRACKS',fraction=t)
        if 14<=p<=28:
            drop=float(np.interp(p,[14,17,20,21,22,23],[34,20,8,5,2,0]))
            s.draw(nodes,s.translated(a['crane-base'],drop,183-.45*np.abs(x-201)) if p<23 else a['crane-base'],
                'crane-base',p,'CRANE_PIER_RISES_FROM_FIXED_FOOTING',translation=[0,drop])
            axes={14:((-10,13),(6,-35)),17:((-10,13),(6,-35)),19:((-10,18),(7,-38)),20:((-11,22),(7,-38)),
                21:((-37,32),(33,-51)),22:((-48,20),(42,-20)),23:((-39,-2),(15,37)),
                24:((-35,-31),(-15,54)),25:((-37,-28),(-32,42)),26:((-35,-20),(-33,42)),
                27:((-35,-18),(-33,45)),28:((-35,-24),(-22,51)),29:((-37,-26),(-15,51))}
            stops=sorted(axes);lo=max(v for v in stops if v<=p);hi=min(v for v in stops if v>=p)
            t=0 if hi==lo else (p-lo)/(hi-lo)
            axis,outer=np.array(axes[lo])*(1-t)+np.array(axes[hi])*t
            pivot=np.array([219.,130.]);elbow=pivot+axis;wrist=elbow+outer
            upper=pivot_axis(s,a['crane-upper-arm'],pivot,(-37,-26),axis,(5,-2.5))
            lower=pivot_axis(s,a['crane-outer-arm'],(182,104),(-15,51),outer,(5,2.5))
            lower=terminal.move(lower,*(elbow-[182,104]))
            angle=float(np.interp(p,[14,20,21,22,23,24,25,26,28,29],[-90,-90,-90,-90,180,0,25,32,8,0]))
            claw=base.rotate(a['crane-claw'],np.deg2rad(angle),(167,155),s.rig.canvas)
            jaw_projection=float(np.interp(p,[14,20,22,24],[.65,.65,.75,1]))
            claw=art.affine_about(s,claw,[[jaw_projection,0],[0,1]],(167,155))
            claw=terminal.move(claw,*(wrist-[167,155]))
            if p==23:
                s.draw(nodes,terminal.move(claw,dy=drop),'crane-claw-behind-pier',p,'CLAW_PASSES_BEHIND_PEDESTAL_DURING_OVER_CENTER_TURN')
                s.draw(nodes,a['crane-base'],'crane-pier-front',p,'PIER_OCCLUDES_ONLY_REAR_CLAW_TRANSIT')
            for name,layer in [('crane-upper-arm',upper),('crane-outer-arm',lower)]:
                s.draw(nodes,terminal.move(layer,dy=drop),name,p,'CONNECTED_TWO_LINK_CRANE_TURNS_OVER_CENTER',shoulder=(pivot+[0,drop]).tolist(),elbow=(elbow+[0,drop]).tolist(),wrist=(wrist+[0,drop]).tolist())
            hydraulic=tube(s,[np.array([202,141])+[0,drop],elbow+[7,11+drop]],1.2)
            s.draw(nodes,hydraulic,'crane-hydraulic',p,'HYDRAULIC_LINK_FOLLOWS_BOOM_BEARING')
            s.draw(nodes,terminal.move(a['crane-receiver'],dy=drop),'crane-receiver',p,'UPRIGHT_RECEIVER_AT_SHOULDER')
            if p!=23:s.draw(nodes,terminal.move(claw,dy=drop),'complete-crane-claw',p,'COMPLETE_CLAW_ROTATES_AT_WRIST_AND_REMAINS_IN_FRONT_OF_BODY',angleDegrees=angle)
        s.phases.append(nodes)
    result=s.finish()
    result['vehicleSource']={'manifest':str(vehicle_root/'manifest.json'),'sha256':sha(vehicle_root/'manifest.json'),'heading':180,'runtimeDeploymentChanged':False}
    return result


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('output',type=Path)
    parser.add_argument('--families',default='NACNST,NANRCT,NAINDP')
    parser.add_argument('--keys',default='')
    args=parser.parse_args()
    args.output.mkdir(exist_ok=False)
    shutil.copy2(__file__,args.output/'authoring-source.py')
    rigs={}
    for rec in read(AUTHORITY)['families']:
        if rec['identity'] not in args.families.split(','):continue
        if args.keys and rec['key'] not in args.keys.split(','):continue
        s=Scene(rec,args.output/rec['key'])
        rigs[rec['key']]={'NACNST':construction_yard,'NANRCT':reactor,'NAINDP':industrial}[rec['identity']](s)
        print(rec['key'],len(s.violations),'geometry violations',flush=True)
    write(args.output/'rigs.json',rigs)


if __name__=='__main__':main()
