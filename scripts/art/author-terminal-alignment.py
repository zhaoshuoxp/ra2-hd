"""Register retained HD anatomy without mirroring or stretching mechanical parts."""
import argparse
import copy
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from buildup import read, sha, unpack, write
from painted_rig import bounds, over, place, project_rgba

helpers = SourceFileLoader('rigid_author', 'scripts/art/author-rigid-anatomy.py').load_module()


def render_member(record, member, frame=0):
    root = Path('.local/hd-packs') / member['packId'] / member['revision']
    manifest = read(root / 'manifest.json')
    assert sha(root / 'manifest.json') == member['sha256']
    base, data = [unpack(root, manifest, 4, frame, role) for role in ('base', 'data')]
    palette = np.asarray(record['palette'])
    def linearize(color):
        return np.where(color <= .04045, color / 12.92, ((color + .055) / 1.055) ** 2.4)
    weight = data[..., :1] / 255
    light = linearize(base[..., :3] / 255) * (1-weight)
    light += linearize(palette[16 + np.minimum(data[..., 1], 15)] / 255) * weight
    base[..., :3] = np.floor(np.clip(np.where(light <= .0031308, light*12.92,
        1.055*light**(1/2.4)-.055)*255, 0, 255)+.5).astype(np.uint8)
    base[base[..., 3] == 0] = 0
    return base


def completed(record):
    family = read(record['newFamilyPath'])
    layers = [render_member(record,m) for m in family['members'] if 'mk.shp' not in m['member']]
    result = layers[0]
    for layer in layers[1:]:
        result = over(layer, result)
    return result


def polygon(shape, points):
    image = Image.new('1', (shape[1], shape[0]))
    ImageDraw.Draw(image).polygon([(round(x*4), round(y*4)) for x,y in points], fill=1)
    return np.asarray(image)


def masked(layer, mask):
    result = layer.copy()
    result[~mask] = 0
    return result


def move(layer, dx=0, dy=0):
    result = np.zeros_like(layer)
    x, y = round(dx*4), round(dy*4)
    h,w = layer.shape[:2]
    result[max(y,0):min(h,h+y),max(x,0):min(w,w+x)] = layer[max(-y,0):min(h,h-y),max(-x,0):min(w,w-x)]
    return result


def save_part(rig, layer, name, phase, reference, method='EXACT_RETAINED_HD_GEOMETRY', **details):
    frame = rig.logical[phase]
    x,y = frame['trimOrigin']
    w,h = frame['trimSize']
    outside = layer[...,3].copy()
    outside[y*4:(y+h)*4,x*4:(x+w)*4] = 0
    assert not (outside >= 8).any(), (rig.record['key'],phase,name,bounds(outside>=8))
    layer = layer.copy()
    layer[outside>0] = 0
    return rig.save(layer, name, phase, {'method':method, 'reference':reference, **details})


def robot(rig, reference):
    full = completed(rig.record)
    phases = copy.deepcopy(rig.previous['phases'])
    for phase in range(9,20):
        if phase<18:
            # The original intermediate turning poses are already authored.
            # Correct only the erroneous right-side reflection, preserving the
            # other cameras and native fold/turn progression byte-for-byte.
            old=next(n for n in phases[phase] if n['name']=='tower-2-rigid-head')
            layer=place(Image.open(old['image']),old['box'],rig.canvas)
            reflected=move(layer[:,::-1].copy(),dx=260-rig.canvas[0])
            pivot=np.asarray(old['rigidPart']['target'])
            bb=np.asarray(bounds(reflected[...,3]>0))/4
            f=rig.logical[phase]
            lo=np.asarray(f['trimOrigin'])+.5
            hi=np.asarray(f['trimOrigin'])+f['trimSize']-.5
            scale=min(1.,*[(pivot[i]-lo[i])/(pivot[i]-bb[i]) for i in (0,1) if bb[i]<pivot[i]],
                *[(hi[i]-pivot[i])/(bb[i+2]-pivot[i]) for i in (0,1) if bb[i+2]>pivot[i]])
            if scale<1:
                reflected=project_rgba(Image.fromarray(reflected),
                    [[scale/4,0,pivot[0]*(1-scale)],[0,scale/4,pivot[1]*(1-scale)]],rig.canvas)
            node=save_part(rig,reflected,'tower-2-unmirrored-head',phase,
                {**reference,'artwork':'RETAINED_V8_HEAD_WITH_CORRECTED_CAMERA','predecessorNode':old},
                'UNMIRRORED_V8_RIGID_HEAD',mirrored=False,nativeReflectionAxisX=130,
                fitNativeBoundsUniformScale=float(scale),nativePivot=pivot.tolist())
            phases[phase]=[node if n==old else n for n in phases[phase]]
            continue
        # Correct completed towers also retain their drums, necks, feet, access
        # ramp and connecting rails; a correct head on a shorter generic drum
        # still caused a visible completion jump in the native comparison.
        foundation=helpers.ground_nodes(phases[phase])
        completed_node=save_part(rig,full,'retained-completed-robot-assembly',phase,reference,
            'EXACT_COMPLETED_TERMINAL_ASSEMBLY', nativeTranslation=[0,0])
        phases[phase]=foundation+[completed_node]
    return rig.finish(phases)


def radar(rig, reference):
    cap_file=Path(reference['rigidAssets'])/'gaairc-rigid-parts-v1.png'
    caps=helpers.split_components(helpers.atlas(cap_file)[8])
    assert len(caps)==2
    full = completed(rig.record)
    yy,xx = np.mgrid[:full.shape[0],:full.shape[1]] / 4
    body_region = polygon(full.shape,[(42,55),(57,55),(57,34),(90,34),(90,55),(97,51),
        (99,32),(108,32),(112,54),(117,95),(120,99),(103,109),(90,116),(60,121),(42,115)])
    cabin_mask = polygon(full.shape,[(58,34),(90,34),(88,53),(85,60),(63,63),(59,54)])
    dish_mask = (xx<94)&(yy<34)
    entry_mask = (xx>=77)&(xx<100)&(yy>=63)
    right_mask = (xx>=94)&~entry_mask
    left_mask = (xx<77)&(yy>=65)
    # Assign the actual foreground pod and its slender antennas to the same
    # fixed geometry; the center cylinder remains behind the foreground cup.
    left_mask |= (xx<59)&(yy>=55)
    lower_mask = body_region & ~cabin_mask & ~dish_mask
    remaining = lower_mask & ~entry_mask & ~right_mask & ~left_mask
    dome_mask = entry_mask & (yy<77)
    stairs_mask = entry_mask & (yy>=96)
    phases = copy.deepcopy(rig.previous['phases'])
    for phase in range(9,25):
        nodes = helpers.ground_nodes(phases[phase])
        drop = rig.logical[phase]['trimOrigin'][1]-5
        cabin = move(masked(full,cabin_mask),dy=drop)
        if phase<22:
            previous_head=next(n for n in rig.previous['phases'][phase] if n['name']=='rigid-radar-dish')
            dish=move(place(Image.open(previous_head['image']),previous_head['box'],rig.canvas),dx=-8)
            head_reference={**reference,'artwork':'RETAINED_V8_HEAD_WITH_CORRECTED_ATTACHMENT','predecessorNode':previous_head}
            head_translation=[-8,0]
        else:
            dish=move(masked(full,dish_mask),dy=drop)
            head_reference=reference
            head_translation=[0,drop]
        # A rigid cabin rises along an unchanged center cylinder. Its visible
        # length changes by occlusion, never by resampling the cylinder texture.
        center = masked(full,remaining & (yy>=61+drop))
        if center[...,3].any():
            nodes.append(save_part(rig,center,'retained-center-cylinder',phase,reference,
                'FIXED_CYLINDER_WITH_TRANSLATING_CABIN_OCCLUSION', nativeTranslation=[0,0]))
        for index,mask,floor in [(0,left_mask,120),(1,right_mask,101)]:
            plane = floor-[7,10,14,18,22,26,31,36,42,47,52,56,61,66,70,85][phase-9]
            pod_mask = lower_mask & mask & (yy>=plane)
            if phase<15:
                pod_mask &= yy >= (98 if index==0 else 81)
            if phase<19:
                pod_mask &= yy >= (77 if index==0 else 56)
            elif phase<24:
                pod_mask &= yy >= (77 if index==0 else 56)-(phase-18)*4
            layer = masked(full,pod_mask)
            if layer[...,3].any():
                nodes.append(save_part(rig,layer,f'pod-{index}-retained-contact',phase,reference,
                    'WORLD_FIXED_CONTACT_AND_ANTENNA_REVEAL', nativeTranslation=[0,0], revealPlane=plane))
            if phase<15:
                cap=rig.rigid(caps[index],f'pod-{index}-rigid-emerging-cap',phase,
                    (63 if index==0 else 103,plane+7),width=26 if index==0 else 17)
                cap['rigidPart']['reference']={**reference,'artwork':'RETAINED_AUTHORED_RIGID_CAP',
                    'sourceAtlas':str(cap_file),'sourceAtlasSha256':sha(cap_file)}
                nodes.append(cap)
        cap_drop = max(0,29-(phase-9)*2.25)
        entry = masked(full,lower_mask & entry_mask & ~dome_mask & ~stairs_mask & (yy>=77+cap_drop))
        if entry[...,3].any():
            nodes.append(save_part(rig,entry,'retained-entry-cylinder',phase,reference))
        if phase>=13:
            nodes.append(save_part(rig,masked(full,lower_mask&stairs_mask),'retained-fixed-stairs',phase,reference))
        nodes.append(save_part(rig,move(masked(full,lower_mask&dome_mask),dy=cap_drop),'retained-rigid-entry-dome',phase,reference,
            'RIGID_VERTICAL_TRANSLATION', nativeTranslation=[0,cap_drop]))
        nodes.append(save_part(rig,cabin,'retained-rigid-cabin',phase,reference,
            'RIGID_VERTICAL_TRANSLATION', nativeTranslation=[0,drop]))
        nodes.append(save_part(rig,dish,'retained-correctly-attached-dish',phase,head_reference,
            'RIGID_TRANSLATION_WITH_NATIVE_TURNING_POSE', nativeTranslation=head_translation))
        phases[phase] = nodes
    return rig.finish(phases)


def cannon(rig, reference, turret_geometry):
    family = read(rig.record['newFamilyPath'])
    turret_binding = family.get('turret') or read(reference['turretFamily'])['turret']
    root = Path('.local')/turret_binding['path']
    manifest = read(root/'manifest.json')
    assert sha(root/'manifest.json') == turret_binding['sha256']
    turret = Image.open(root/'0.png').convert('RGBA')
    # Measured native GPU quads establish the finished turret's projection in
    # the unmodified MK logical canvas, instead of guessing a bright hinge.
    mk = turret_geometry['spriteGeometry'][1]['screenBounds']
    tb = turret_geometry['turretGeometry']['screenBounds']
    frame = rig.logical[-1]
    sx = (mk[2]-mk[0])/frame['legacyRenderSize'][0]
    sy = (mk[3]-mk[1])/frame['legacyRenderSize'][1]
    origin = [frame['trimOrigin'][0]+(tb[0]-mk[0])/sx,
              frame['trimOrigin'][1]+(mk[3]-tb[3])/sy]
    # The source heading zero uses the correct retained barrel, coupling and
    # lower bearing. Separate at the circular elevation pivot, preserving both
    # the dark neck and red collar with the moving barrel.
    source = np.asarray(turret)
    barrel_mask = polygon(source.shape,[(80,52),(91,44),(128,28),(142,25),(143,39),(98,62),(92,70)])
    barrel = masked(source,barrel_mask)
    receiver = masked(source,~barrel_mask)
    floor = render_member(rig.record,family['members'][0])
    phases = copy.deepcopy(rig.previous['phases'])
    ground = None
    for phase in range(4,11):
        ground = save_part(rig,floor,'foundation',phase,reference)
        nodes = [ground]
        if phase<8:
            nodes += [n for n in phases[phase] if n not in helpers.ground_nodes(phases[phase])]
        else:
            static = project_rgba(Image.fromarray(receiver),[[.25,0,origin[0]],[0,.25,origin[1]]],rig.canvas)
            angle = np.deg2rad({8:-62,9:-43,10:-19}[phase])
            rotation = np.array([[np.cos(angle),-np.sin(angle)],[np.sin(angle),np.cos(angle)]])*.25
            pivot = np.array([90,63])*4
            target = pivot/4+origin
            matrix = np.column_stack([rotation,target-rotation@pivot])
            moving = project_rgba(Image.fromarray(barrel),matrix.tolist(),rig.canvas)
            nodes += [save_part(rig,static,'retained-fixed-cannon-bearing',phase,reference),
                      save_part(rig,moving,'retained-elevating-cannon-barrel',phase,reference,
                         'RIGID_ELEVATION_ROTATION',transform=matrix.tolist(),singularValueRatio=1.,pivot=target.tolist())]
        phases[phase]=nodes
    # The finished heading extends beyond the retained last native trim. The
    # terminal uses the actual retained main/turret renderer at that frame,
    # without clipping, scaling or changing the native SHP geometry.
    empty = rig.output/'11-completion-overlay-marker.png'
    Image.new('RGBA',(4,4)).save(empty)
    phases[11]=[{'name':'retained-completion-overlay-marker','image':str(empty),'sha256':sha(empty),'box':[59,14,60,15]}]
    result = rig.finish(phases)
    result['foundationSource']=None
    result['terminalCompletionOverlay']={'frame':11,'retainedMainAndTurret':True,'turretSha256':turret_binding['sha256']}
    result['fixedFloorPhases']=list(range(4,11))
    result['nativeTurretOrigin']=origin
    return result


def terminal_display(record):
    family = read(record['newFamilyPath'])
    floor = render_member(record,family['members'][0])
    binding = family.get('turret') or read(record['componentRig']['terminalAlignment']['reference']['turretFamily'])['turret']
    source = Image.open(Path('.local')/binding['path']/'0.png').convert('RGBA')
    origin = record['componentRig']['nativeTurretOrigin']
    turret = project_rgba(source,[[.25,0,origin[0]],[0,.25,origin[1]]],read(record['nativeSource'])['canvas'])
    return over(turret,floor)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('authoring',type=Path)
    parser.add_argument('turret_reference',type=Path)
    parser.add_argument('output',type=Path)
    parser.add_argument('--rigid-assets',type=Path,default=Path('.artifacts/buildup-component-20261012-r66-v1/rigid-repair-r71-v1'))
    args=parser.parse_args()
    args.output.mkdir(exist_ok=False)
    authority=read(args.authoring)
    turret_geometry=read(args.turret_reference)['GTGCAN']['readyState']
    rigs={}
    for identity in ('garobo','gaairc','gtgcan'):
        for theater in ('temperate','snow'):
            key=identity+'-'+theater
            record=next(f for f in authority['families'] if f['key']==key)
            rig=helpers.Rig(record,args.output/key)
            reference={'family':record['newFamilyPath'],'sha256':record['newFamilySha256'],'rigidAssets':str(args.rigid_assets),
                       'artwork':'RETAINED_FINISHED_HD_COMPONENTS_NO_RETAIL_RGB'}
            if identity=='gtgcan':
                reference['turretFamily']=next(f for f in authority['families'] if f['key']=='gtgcan-temperate')['newFamilyPath']
            result = cannon(rig,reference,turret_geometry) if identity=='gtgcan' else globals()[{'garobo':'robot','gaairc':'radar'}[identity]](rig,reference)
            result['terminalAlignment']={'baseline':'V8','method':'RETAINED_COMPLETED_ANATOMY_WITH_RIGID_MOTION',
                'groundPreservation':'EXACT_V8' if identity!='gtgcan' else 'REOPENED_TO_MATCH_RETAINED_COMPLETED_PLATFORM',
                'reference':reference,'visualAcceptance':'PENDING'}
            rigs[key]=result
            for phase,nodes in enumerate(result['phases']):
                if isinstance(nodes,dict):continue
                canvas=np.zeros((rig.canvas[1]*4,rig.canvas[0]*4,4),np.uint8)
                for node in nodes:canvas=over(place(Image.open(node['image']),node['box'],rig.canvas),canvas)
                Image.fromarray(canvas).save(rig.output/f'{phase:02}-preview.png')
    write(args.output/'rigs.json',rigs)
    print('Six terminal-alignment rigs authored; runtime selection unchanged')


if __name__=='__main__':
    main()
