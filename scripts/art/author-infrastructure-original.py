"""Rebuild three rejected mechanisms against their original phase landmarks."""
import argparse
import copy
import shutil
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import label, find_objects, binary_dilation

from buildup import read, sha, write
from painted_rig import bounds, over, place

motion = SourceFileLoader('infrastructure_motion', 'scripts/art/author-infrastructure-motion.py').load_module()
base, terminal = motion.base, motion.terminal
SOURCE = None


def emit(s, nodes, layer, name, phase, method, **details):
    s.emit(nodes, layer, name, phase, method, source=SOURCE, **details)


def quad(layer, source, target, canvas):
    """Project a complete textured plane, including its perimeter and edge caps."""
    source, target = np.asarray(source, float)*4, np.asarray(target, float)*4
    rows, values = [], []
    for (x,y), (u,v) in zip(target, source):
        rows.extend([[x,y,1,0,0,0,-u*x,-u*y], [0,0,0,x,y,1,-v*x,-v*y]])
        values.extend([u,v])
    coeff = np.linalg.solve(np.asarray(rows), values)
    rgba = np.array(layer, dtype=float)/255
    alpha = rgba[...,3]
    channels = [rgba[...,i]*alpha for i in range(3)]+[alpha]
    result = np.stack([np.array(Image.fromarray(ch.astype('float32')).transform(
        (canvas[0]*4,canvas[1]*4), Image.Transform.PERSPECTIVE, coeff,
        Image.Resampling.BICUBIC)) for ch in channels], axis=-1)
    result[...,:3] /= np.maximum(result[...,3,None],1e-8)
    result = np.clip(np.rint(result*255),0,255).astype('uint8')
    result[result[...,3]==0] = 0
    return result


def panel_sources(path):
    rgba = np.array(Image.open(path).convert('RGBA'))
    ids, _ = label(rgba[...,3]>128)
    pieces = []
    for i, region in enumerate(find_objects(ids),1):
        selected = ids[region]==i
        if selected.sum()<10000:
            continue
        y,x=region
        pieces.append((x.start,Image.fromarray(rgba[y,x])))
    return [im for _,im in sorted(pieces)]


def barracks(s):
    full, yy = s.full, s.yy
    statue = base.mask(full, [(103,4),(142,4),(143,87),(137,96),(140,99),(136,101),
        (129,99),(127,97),(125,100),(125,104),(121,106),(118,104),(119,96),
        (117,88),(112,81),(112,61),(103,51)])
    gap = terminal.polygon(full.shape,[(123,85),(128,88),(130,95),(127,98),(124,98)])
    red = (statue[...,0]>statue[...,1]*2.) & (statue[...,0]>statue[...,2]*2.)
    statue = terminal.masked(statue,~gap & ~red)
    plate = motion.source_layer(s,23,'empty-rising-statue-plinth')
    closed = terminal.masked(full,yy>=108)
    # The four sides rise from their own ground hinges. There is no center lid.
    rear = panel_sources(SURFACE)
    source_rect = [(0,0),(24,0),(24,34),(0,34)]
    rear_layers = [place(im,(0,0,24,34),s.rig.canvas) for im in rear]
    rear_open = [np.array([(93,119),(113,109),(113,138),(93,148)],float),
                 np.array([(135,109),(157,120),(157,149),(135,138)],float)]
    front_closed = [np.array([(104,114),(128,122),(118,157),(93,148)],float),
                    np.array([(137,121),(149,111),(165,143),(148,155)],float)]
    front_open = [np.array([(94,133),(118,143),(118,157),(93,148)],float),
                  np.array([(145,141),(165,131),(165,143),(148,155)],float)]
    front = [base.mask(full,q) for q in front_closed]
    face_mask=np.logical_or.reduce([terminal.polygon(full.shape,q) for q in front_closed])
    core=terminal.masked(base.neutral(closed),(yy>=114)&(yy<151))
    for i in range(2):
        inner=quad(rear_layers[i],source_rect,front_closed[i],s.rig.canvas)
        core=over(inner,core)
    core=terminal.masked(core,yy<151)
    core[...,:3]=np.rint(core[...,:3]*.72).astype('uint8')
    for p,old in enumerate(s.record['componentRig']['phases']):
        if p==24:
            s.phases.append(copy.deepcopy(old)); continue
        if p==23:
            nodes=[]
            emit(s,nodes,full,'original-complete-barracks',p,
                 'COMPLETE_RETAINED_HD_AFTER_WALL_CLOSURE_BEFORE_TERMINAL')
            s.phases.append(nodes);continue
        nodes = [copy.deepcopy(n) for n in old if n['name']=='fixed-barracks-slab']
        if p<4:
            s.phases.append(nodes); continue
        angle={4:35,5:43,6:50,22:72,23:90}.get(p,55)
        radians=np.deg2rad(angle)
        opened=angle/55 if p<22 else 1.
        closure={22:.42,23:1.}.get(p,0.)
        def hinged_corners(open_pose,closed_pose,front=False):
            ground=open_pose[3:1:-1]
            vertical=closed_pose[:2]-ground
            ground_direction=(open_pose[:2]-ground-vertical*np.sin(np.deg2rad(55)))/np.cos(np.deg2rad(55))
            dest=open_pose.copy()
            theta=np.deg2rad({4:46,5:49,6:52}.get(p,angle)) if front else radians
            dest[:2]=ground+vertical*np.sin(theta)+ground_direction*np.cos(theta)
            if front and p<7:
                midpoint=dest[:2].mean(axis=0)
                edge=dest[2]-dest[3]
                dest[0]=midpoint-edge/2
                dest[1]=midpoint+edge/2
            return dest
        if p==23:
            emit(s,nodes,closed,'original-closed-base',p,'RETAINED_BASE_AFTER_FOUR_WALLS_CLOSE')
        else:
            for i in range(2):
                closed_pose=rear_open[i].copy()
                closed_pose[:2]+=np.array([6 if i==0 else -6,-8])
                dest=hinged_corners(rear_open[i],closed_pose)
                emit(s,nodes,quad(rear_layers[i],source_rect,dest,s.rig.canvas),
                     'original-rear-wall-'+str(i),p,'FULL_REVERSE_WALL_RISES_FROM_GROUND_HINGE',
                     corners=dest.tolist(),opening=opened,closure=closure,hingeDegrees=angle)
        if 7<=p<23:
            drop=max(0,s.rig.logical[p]['trimOrigin'][1]-4)
            emit(s,nodes,motion.rise(s,core,drop),
                 'original-internal-supports',p,'INTERNAL_CORNER_SUPPORTS_RISE_WITH_PLINTH',translation=[0,drop])
        if p>=15:
            drop=max(0,s.rig.logical[p]['trimOrigin'][1]-4)
            emit(s,nodes,terminal.move(plate,dy=drop),'original-rising-plinth',p,
                 'PLINTH_RISES_WITH_FEET_BEFORE_LATE_WALL_CLOSURE',translation=[0,drop])
        if p>=7:
            drop=max(0,s.rig.logical[p]['trimOrigin'][1]-4)
            drop=112 if p==7 else drop
            figure=terminal.masked(terminal.move(statue,dy=drop),yy<151)
            emit(s,nodes,figure,'original-rising-statue',p,
                 'FIXED_SCALE_STATUE_RISES_BEHIND_FOREGROUND_WALLS',translation=[0,drop])
        if p<23:
            for i in range(2):
                dest=hinged_corners(front_open[i],front_closed[i],front=True)
                texture=front[i] if p>=22 else rear_layers[i]
                texture_quad=front_closed[i] if p>=22 else source_rect
                emit(s,nodes,quad(texture,texture_quad,dest,s.rig.canvas),
                     'original-front-wall-'+str(i),p,'FULL_FOREGROUND_WALL_HELD_OPEN_UNTIL_PHASE_22',
                     corners=dest.tolist(),opening=opened,closure=closure,
                     hingeDegrees={4:46,5:49,6:52}.get(p,angle))
        s.phases.append(nodes)
    return s.finish()


def refinery(s):
    legacy = next(r for r in read(LEGACY)['families'] if r['key']==s.record['key'])
    old_record=s.record; s.record=legacy
    shell=motion.source_layer(s,23,'sliding-curved-casing')
    s.record=old_record
    front_region=terminal.polygon(shell.shape,[(91,170),(91,150),(106,131),(124,118),
        (138,124),(153,132),(154,164),(124,174)])
    connector=terminal.polygon(shell.shape,[(92,104),(112,99),(151,117),(151,143),
        (139,143),(137,123),(92,114)])
    front=terminal.masked(shell,front_region & ~connector)
    rear=terminal.masked(shell,~front_region & ~connector)
    trim=terminal.masked(shell,connector)
    # Independent silver caps emerge in the order visible on the original beam.
    cap_regions=[((s.xx-x)/6.2)**2+((s.yy-y)/3.7)**2<=1 for x,y in [(116,108),(129,114),(141,121.5)]]
    caps=[terminal.masked(s.structure,m) for m in cap_regions]
    rest=terminal.masked(trim,~np.logical_or.reduce(cap_regions))
    beam=base.mask(s.structure,[(92,104),(112,99),(151,117),(151,143),(139,143),(137,123),(92,114)])
    color=beam[...,:3].astype(float)
    red=(color[...,0]>color[...,1]*2)&(color[...,0]>color[...,2]*2)
    red &= ((s.xx-123)/14)**2+((s.yy-99)/8)**2>1
    from scipy.ndimage import gaussian_filter
    cap_union=np.logical_or.reduce(cap_regions)
    paint=red & (color[...,0]>130)
    weight=gaussian_filter(paint.astype(float),20)
    smooth=np.stack([gaussian_filter(color[...,i]*paint,20)/np.maximum(weight,1e-8) for i in range(3)],axis=-1)
    fill=beam.copy();fill[cap_union,:3]=np.clip(smooth[cap_union],0,255).astype('uint8')
    fill[cap_union,3]=255
    bare_beam=terminal.masked(fill,red|cap_union)
    removed={'preserved-rear-curved-casing','fixed-front-roof-connector',
             'telescoping-curved-shell-0','telescoping-curved-shell-1','red-top-connector'}
    # Source and destination describe the quarter-cylinder in its projected plane.
    fq=np.array([(123,119),(145,128),(118,170),(92,160)],float)
    poses={10:[(135,147),(141,145),(139,151),(133,151)],
           11:[(124,144),(140,143),(120,164),(103,157)],
           12:[(123,138),(142,138),(117,169),(98,160)],
           13:[(123,132),(144,134),(118,171),(95,160)],
           14:[(123,125),(145,130),(118,170),(93,160)]}
    rq=np.array([(136,109),(162,104),(181,136),(155,151)],float)
    rear_poses={16:[(151,138),(155,136),(160,140),(155,144)],
                17:[(145,128),(159,123),(172,139),(155,150)],
                18:[(139,116),(162,110),(179,139),(155,151)]}
    for p,old in enumerate(s.record['componentRig']['phases']):
        if p==24:
            s.phases.append(copy.deepcopy(old));continue
        nodes=[];inserted=False
        def mechanism():
            if p>=10:
                dest=np.array(poses.get(p,fq))
                layer=front if p>=15 else quad(front,fq,dest,s.rig.canvas)
                emit(s,nodes,layer,'original-front-arched-casing',p,
                     'CURVED_CASING_UNFOLDS_FROM_SHORT_CENTRAL_PROFILE',
                     projectedCorners=dest.tolist(),originalPhase=p)
            if p>=16:
                dest=np.array(rear_poses.get(p,rq))
                layer=rear if p>=19 else quad(rear,rq,dest,s.rig.canvas)
                emit(s,nodes,layer,'original-rear-arched-casing',p,
                     'REAR_CASING_DEPLOYS_AFTER_FRONT_CASING',projectedCorners=dest.tolist())
            if p>=8:
                drop=max(0,s.rig.logical[p]['trimOrigin'][1]-bounds(bare_beam[...,3]>0)[1]/4)
                emit(s,nodes,terminal.move(bare_beam,dy=drop),'original-complete-red-connector',p,
                     'COMPLETE_RED_CONNECTOR_BEFORE_SEQUENTIAL_CAPS',translation=[0,drop])
            for i,start in enumerate([13,15,16]):
                if p>=start:
                    emit(s,nodes,caps[i],'original-roof-cap-'+str(i),p,'SEQUENTIAL_COMPLETE_BEAM_CAP',startPhase=start)
        for n in old:
            if n['name'] in removed:
                if not inserted:mechanism();inserted=True
                continue
            if not inserted and n['name']=='fixed-loading-forecourt':
                mechanism();inserted=True
            nodes.append(copy.deepcopy(n))
        if not inserted:mechanism()
        s.phases.append(nodes)
    return s.finish()


def yard(s):
    full=s.full
    housing=base.mask(full,[(178,69),(194,60),(197,53),(213,53),(215,63),
        (223,65),(226,82),(238,104),(239,118),(217,133),(199,129),
        (193,114),(178,109)])
    gold=(housing[...,0]>housing[...,1]*1.08)&(housing[...,1]>housing[...,2]*1.5)&(housing[...,1]>70)
    housing=terminal.masked(housing,~(gold&(s.xx>218)&(s.yy>96)))
    motor_region=terminal.polygon(full.shape,[(195,53),(212,53),(213,69),(208,80),(198,80),(195,70)])
    motor=terminal.masked(housing,motor_region)
    generated=np.array(Image.open(SURFACE.parent/'yard-surfaces-v1.png').convert('RGBA'))
    # A complete small header block supplies the surfaces hidden in the idle pose.
    block=base.mask(generated,[(579/4,579/4),(698/4,526/4),(839/4,601/4),
        (839/4,705/4),(736/4,775/4),(570/4,682/4)])
    bb=bounds(block[...,3]>=128);x0,y0,x1,y1=bb
    block_image=Image.fromarray(block[y0:y1,x0:x1])
    header=over(place(block_image,(186,150,207,174),s.rig.canvas),
                place(block_image,(205,158,226,182),s.rig.canvas))
    complete=panel_sources(SURFACE.parent/'yard-surfaces-v1.png')[1]
    hidden=place(complete,(180,65,238,133),s.rig.canvas)
    empty=terminal.masked(housing,~motor_region)
    # Fill only surfaces actually occluded by the top motor and idle crane jib.
    fill_region=motor_region | (gold & (s.xx>218) & (s.yy>96))
    empty=over(empty,terminal.masked(hidden,fill_region))
    left_cap=base.mask(full,[(180,72),(190,67),(194,69),(194,78),(190,89),(180,85)])
    far_cap=quad(left_cap,[(180,67),(194,67),(194,89),(180,89)],
                 [(206,66),(221,66),(221,83),(206,83)],s.rig.canvas)
    empty=over(empty,far_cap)
    # A remnant of the horizontal idle jib must never appear during guide extension.
    from scipy.ndimage import gaussian_filter
    jib_region=(s.xx>220)&(s.xx<237)&(s.yy>99)&(s.yy<116)
    weight=gaussian_filter(jib_region.astype(float),4)[...,None]
    empty=np.rint(empty*(1-weight)+hidden*weight).astype('uint8')
    drum=motion.source_layer(s,15,'central-drum')
    bearing=motion.source_layer(s,15,'fixed-upper-bearing')
    rail_q=np.array([(180,65),(220,65),(238,133),(180,133)],float)
    rail_poses={11:[(186,106),(224,103),(238,145),(192,146)],
                12:[(186,84),(219,83),(238,136),(185,138)],
                13:[(183,72),(219,72),(238,133),(181,134)]}
    low_top=[150,150,150,150,150,148,145,140,135,130,125]
    removed={'vertical-crane-housing','central-drum','fixed-upper-bearing'}
    for p,old in enumerate(s.record['componentRig']['phases']):
        if p==24:
            s.phases.append(copy.deepcopy(old));continue
        nodes=[];inserted=False
        def mechanism():
            if p>=6:
                drop={6:32,7:28,8:23,9:19,10:15,11:10,12:5}.get(p,0)
                emit(s,nodes,motion.rise(s,drum,drop,ground=174.75),'original-lifting-drum',p,
                     'FIXED_DIAMETER_MAST_CARRIES_UPPER_MECHANISM',translation=[0,drop])
            if p>=11:
                drop={11:12,12:6,13:1}.get(p,0)
                emit(s,nodes,terminal.move(bearing,dy=drop),'original-lifting-collar',p,
                     'COLLAR_FOLLOWS_CENTRAL_MAST',translation=[0,drop])
                dest=np.array(rail_poses.get(p,rail_q))
                unpowered=terminal.masked(housing,~motor_region) if p>=20 else empty
                guide_source=terminal.masked(unpowered,s.yy>=82) if p==11 else unpowered
                layer=guide_source if p>=14 else quad(guide_source,rail_q,dest,s.rig.canvas)
                if p==11:
                    turning_header=over(place(block_image,(187,113,207,136),s.rig.canvas),
                                        place(block_image,(211,103,230,126),s.rig.canvas))
                    layer=over(turning_header,layer)
                # Subpixel cap registration respects the original per-phase canvas.
                logical_top=s.rig.logical[p]['trimOrigin'][1]
                top=bounds(layer[...,3]>0)[1]/4
                if top<logical_top:layer=terminal.move(layer,dy=logical_top-top)
                emit(s,nodes,layer,'original-extending-curved-guides',p,
                     'COMPLETE_HEADER_AND_CURVED_GUIDES_EXTEND_UP_FROM_COLLAR',projectedCorners=dest.tolist())
            else:
                layer=terminal.move(header,dy=low_top[p]-150)
                emit(s,nodes,layer,'original-paired-moving-header',p,
                     'COMPLETE_PAIRED_HEADER_RISES_AFTER_PYLONS',translation=[0,low_top[p]-150])
            if p>=18:
                drop={18:15,19:3}.get(p,0)
                emit(s,nodes,motion.rise(s,motor,drop,ground=79.75),'original-late-top-motor',p,
                     'TOP_MOTOR_EMERGES_AFTER_GUIDES',translation=[0,drop])
        for n in old:
            if n['name'] in removed:
                if not inserted:mechanism();inserted=True
                continue
            nodes.append(copy.deepcopy(n))
        if not inserted:mechanism()
        s.phases.append(nodes)
    return s.finish()


def main():
    global SOURCE,SURFACE,LEGACY
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ['authoring','assets','surface','legacy','output']:
        parser.add_argument(name,type=Path)
    parser.add_argument('--diagnostic',action='store_true')
    parser.add_argument('--families',default='GAREFN,GAYARD,NAHAND')
    args=parser.parse_args()
    args.output.mkdir(exist_ok=False)
    snapshot=args.output/'authoring-source.py';shutil.copy2(__file__,snapshot)
    SOURCE={'code':str(snapshot),'sha256':sha(snapshot),'material':'RETAINED_HD_SURFACES_ORIGINAL_PHASE_GEOMETRY',
            'surfaceImage':str(args.surface),'surfaceSha256':sha(args.surface),
            'yardSurfaceImage':str(args.surface.parent/'yard-surfaces-v1.png'),
            'yardSurfaceSha256':sha(args.surface.parent/'yard-surfaces-v1.png')}
    SURFACE,LEGACY=args.surface,args.legacy
    methods={'GAREFN':refinery,'GAYARD':yard,'NAHAND':barracks};rigs={}
    selected=set(args.families.split(','))
    assert selected<=methods.keys()
    for record in read(args.authoring)['families']:
        if record['identity'] not in selected or record['theater'] not in ['TEMPERATE','SNOW']:continue
        reference=args.assets/('reference-'+record['theater'].lower()+'-v1/report.json')
        scene=base.Scene(record,args.assets,reference,args.output/record['key'],args.diagnostic)
        rigs[record['key']]=methods[record['identity']](scene)
        print(record['key'],'rebuilt',flush=True)
    assert len(rigs)==len(selected)*2
    write(args.output/'rigs.json',rigs)


if __name__=='__main__':main()
