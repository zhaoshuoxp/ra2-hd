"""Rebuild reopened construction parts without elastic assembly deformation."""
import argparse
import copy
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import label, find_objects

from buildup import read, sha, write
from painted_cutout import extract_grid_poses
from painted_rig import bounds, over, place, project_rgba


def atlas(file, grid=(3, 3)):
    return {cell: image for cell, (image, _) in extract_grid_poses(Image.open(file), *grid).items()}


def split_components(image):
    a = np.asarray(image)
    ids, _ = label(a[..., 3] >= 128)
    pieces = []
    for index, region in enumerate(find_objects(ids), 1):
        if (ids[region] == index).sum() < 100:
            continue
        part = a[region].copy()
        part[..., 3][ids[region] != index] = 0
        part[..., :3][part[..., 3] == 0] = 0
        pieces.append((region[1].start, Image.fromarray(part)))
    return [im for _, im in sorted(pieces, key=lambda p: p[0])]


def lower_pivot(image):
    a = np.asarray(image)[..., 3]
    yy, xx = np.where(a >= 128)
    keep = yy >= yy.max() - max(2, image.height * .025)
    return np.array([xx[keep].mean() + .5, yy.max() + 1.])


class Rig:
    def __init__(self, record, output):
        self.record = record
        self.raw = read(record['nativeSource'])
        self.canvas = self.raw['canvas']
        self.output = output
        output.mkdir(exist_ok=False)
        self.parts = []
        self.previous = copy.deepcopy(record['componentRig'])
        binding = record['newMember']
        self.logical = read(Path('.local/hd-packs') / binding['packId'] / binding['revision'] / 'manifest.json')['logical']['frames']

    def save(self, rgba, name, phase, metadata=None):
        bb = bounds(rgba[..., 3] > 0)
        assert bb, (self.record['key'], phase, name)
        x0, y0, x1, y1 = bb
        file = self.output / f'{phase:02}-{name}.png'
        Image.fromarray(rgba[y0:y1, x0:x1]).save(file)
        n = {'name': name, 'image': str(file), 'sha256': sha(file), 'box': [v/4 for v in bb]}
        if metadata:
            n['rigidPart'] = metadata
            self.parts.append({'phase': phase, 'name': name, **metadata})
        return n

    def rigid(self, image, name, phase, target, width=None, height=None, anchor=None, mirror=False):
        image = image.convert('RGBA')
        if mirror:
            image = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        anchor = lower_pivot(image) if anchor is None else np.asarray(anchor, float)
        scale = width/image.width if width is not None else height/image.height
        target = np.asarray(target, float)
        f = self.logical[phase]
        left, top = f['trimOrigin']
        right, bottom = np.array(f['trimOrigin']) + f['trimSize']
        # One similarity transform preserves every part's proportions. Fit only
        # by uniform scale when retained native bounds limit an exposed tip.
        limits = [(target[0]-left)/anchor[0] if anchor[0] else scale,
                  (right-target[0])/(image.width-anchor[0]) if image.width > anchor[0] else scale,
                  (target[1]-top)/anchor[1] if anchor[1] else scale,
                  (bottom-target[1])/(image.height-anchor[1]) if image.height > anchor[1] else scale]
        scale = min(scale, *limits)
        assert scale > 0, (self.record['key'], phase, name, target)
        translation = target-anchor*scale
        matrix = [[scale, 0, translation[0]], [0, scale, translation[1]]]
        rgba = project_rgba(image, matrix, self.canvas)
        # Bicubic interpolation needs transparent support inside the same frame.
        envelope = np.zeros(rgba.shape[:2], bool)
        envelope[top*4:bottom*4, left*4:right*4] = True
        assert not (rgba[..., 3][~envelope] >= 8).any(), (name, phase, 'Opaque tip outside native frame')
        rgba[~envelope] = 0
        return self.save(rgba, name, phase, {'transform': matrix, 'sourceSize': list(image.size),
                         'anchor': anchor.tolist(), 'target': target.tolist(), 'mirrored': mirror,
                         'singularValueRatio': 1., 'method': 'UNIFORM_SCALE_AND_TRANSLATION'})

    def rectangle(self, image, name, phase, box, mechanism):
        rgba = place(image, box, self.canvas)
        return self.save(rgba, name, phase, {'method': mechanism, 'nativeBox': list(box),
                         'sourceSize': list(image.size)})

    def finish(self, phases, foundation=None, stable=None):
        phases = [({'retainPredecessor': True} if nodes == self.previous['phases'][phase] else nodes)
                  for phase,nodes in enumerate(phases)]
        rig = copy.deepcopy(self.previous)
        rig.pop('upperRegistration', None)
        rig['phases'] = phases
        if foundation is not None:
            rig['foundationSource'] = foundation
        if stable is not None:
            rig['foundationStableFrom'] = stable
        rig['rigidAnatomy'] = {'method': 'SEPARATE_RIGID_PARTS_AND_EXPLICIT_TELESCOPING_SHAFTS',
                              'source': 'AUTHORED_HD_RGBA_ONLY', 'parts': self.parts,
                              'visualAcceptance': 'PENDING'}
        return rig


def ground_nodes(nodes):
    return [copy.deepcopy(n) for n in nodes if n['name'] in {'foundation', 'unfinished-foundation',
            'finishing-ground-paint', 'finishing-floor-switch', 'floor-stripes'} or n['name'].startswith('pad-')]


def prism(rig, assets):
    crowns = atlas(assets/'atesla-complete-crowns-v1.png', (3, 1))
    phases = copy.deepcopy(rig.previous['phases'])
    for phase in (5, 6, 7):
        old = phases[phase]
        image = crowns[phase-5]
        width = {5: 46, 6: 52, 7: 40}[phase]
        anchor = lower_pivot(image)
        height = image.height * width / image.width
        bottom = {5: 10, 6: 5, 7: 4}[phase] + height
        crown = rig.rigid(image, 'complete-crown', phase, (85, bottom), width=width, anchor=anchor)
        retained = [n for n in old if n['name'] != 'crown']
        if phase == 6:
            stem = Image.open(next(n['image'] for n in retained if n['name']=='stem'))
            neck = stem.crop((round(stem.width*.44),round(stem.height*.30),
                              round(stem.width*.56),round(stem.height*.40)))
            retained.append(rig.rectangle(neck,'crown-neck-connection',phase,(82,42,88,50),
                                          'AXIAL_CROWN_MOUNT_CONNECTION'))
        phases[phase] = retained + [crown]
    return rig.finish(phases)


def cannon(rig, assets):
    image = atlas(assets/'gtgcan-complete-foundation-v2.png', (1, 1))[0]
    phases = copy.deepcopy(rig.previous['phases'])
    # The platform is a ground-plane projection, not a deformed upper assembly.
    # Three complete filled wings and all drilled feet share this fixed master.
    # The receiver needs its full load-bearing disc, independently sized from
    # the narrow wings. Extract only authored platform texels and project the
    # ground plane; the connected receiver and barrel remain exact V7 pixels.
    w,h = image.size
    plate = image.crop((round(w*.205),0,round(w*.795),round(h*.79)))
    matte = Image.new('L',(plate.width*4,plate.height*4))
    ImageDraw.Draw(matte).ellipse((0,0,matte.width-1,matte.height-1),fill=255)
    matte = np.asarray(matte.resize(plate.size,Image.Resampling.LANCZOS))
    pa = np.array(plate)
    pa[...,3] = np.floor(pa[...,3].astype(float)*matte/255+.5).astype(np.uint8)
    pa[pa[...,3]==0] = 0
    plate = Image.fromarray(pa)
    complete = over(place(plate,(77,100,157,137),rig.canvas),
                    place(image,(59,99,172,142),rig.canvas))
    master = rig.save(complete,'foundation',4,{'method':'FIXED_ISOMETRIC_GROUND_PLANE_WITH_COMPLETE_BEARING_DISC'})
    for phase in range(2, 12):
        if phase < 4:
            deployed = over(place(plate,(78,101,154,136),rig.canvas),
                            place(image,(63,100,168,140),rig.canvas))
            floor = rig.save(deployed,'foundation',phase,{'method':'NATIVE_STABILIZER_DEPLOYMENT'})
        else:
            floor = master
        phases[phase][0] = floor
    return rig.finish(phases, master, 4)


def silver_centers(image):
    a = np.asarray(image).astype(float)
    mask = (a[..., :3].min(2) > 145) & (np.ptp(a[..., :3], axis=2) < 65) & (a[..., 3] > 180)
    ids, _ = label(mask)
    points = []
    for index, region in enumerate(find_objects(ids), 1):
        yy, xx = np.where(ids[region] == index)
        if len(xx) >= 150:
            points.append([xx.mean()+region[1].start+.5, yy.mean()+region[0].start+.5, len(xx)])
    # Each isolated cylinder has two broad paint bands. Selecting the largest
    # faces avoids treating small reflections as a second physical band.
    selected = sorted(sorted(points,key=lambda p:p[2],reverse=True)[:2],key=lambda p:p[0])
    assert len(selected)==2, (image.size,points)
    return np.array([p[:2] for p in selected])


def chronosphere(rig, assets):
    early = atlas(assets/'gacsph-globes-09-v1.png')
    late = atlas(assets/'gacsph-globes-16-v1.png')
    rear = atlas(assets/'gacsph-rods-09-v1.png')
    cores = atlas(assets/'gacsph-core-09-v1.png')
    phases = copy.deepcopy(rig.previous['phases'])
    target = np.array([[52, 133], [73, 143], [111, 109], [132, 119]], float)
    for phase in range(10, 25):
        cylinders = split_components(rear[min(phase-9,8)])
        assert len(cylinders)==2
        rear_nodes = []
        for index,image in enumerate(cylinders):
            source = silver_centers(image)
            desired = target[index*2:index*2+2]
            s,t = source[1]-source[0],desired[1]-desired[0]
            scale = np.linalg.norm(t)/np.linalg.norm(s)
            angle = np.arctan2(t[1],t[0])-np.arctan2(s[1],s[0])
            rotation = np.array([[np.cos(angle),-np.sin(angle)],[np.sin(angle),np.cos(angle)]])*scale
            translation = desired.mean(0)-source.mean(0)@rotation.T
            matrix = np.column_stack([rotation,translation]).tolist()
            layer = project_rgba(image,matrix,rig.canvas)
            rear_nodes.append(rig.save(layer,f'rigid-rod-{index}',phase,
                              {'method':'RIGID_CYLINDER_SIMILARITY','transform':matrix,
                               'sourceSize':list(image.size),'singularValueRatio':1.,
                               'rodTargets':desired.tolist(),'rodSources':source.tolist(),
                               'maximumRodCenterError':float(np.linalg.norm(source@rotation.T+translation-desired,axis=1).max())}))
        core = cores[min(phase-9,8)]
        core_node = rig.rigid(core,'rigid-rising-post-and-rails',phase,(100,141),
                             height=141-rig.raw['frames'][phase]['y'],
                             anchor=(core.width*.5,core.height))
        globe = early[phase-9] if phase < 16 else late[phase-16]
        width = 76 if phase == 10 else 80
        bearing = rig.rigid(globe, 'rigid-globe-and-bearing', phase, (141, 175), width=width,
                            anchor=(globe.width*.5, globe.height))
        if phase < 14:
            # Early spheres and hinges rise through the open floor. Translation
            # plus occlusion preserves their curvature while exposing only the
            # current-phase painted material, rather than flattening the dome.
            drop,plane = {10:(15,166),11:(10,168),12:(5,172),13:(2,174)}[phase]
            full = place(Image.open(bearing['image']),bearing['box'],rig.canvas)
            shifted = np.zeros_like(full)
            shifted[drop*4:] = full[:-drop*4]
            shifted[plane*4:] = 0
            bearing = rig.save(shifted,'rigid-emerging-globe',phase,
                               {'method':'RIGID_VERTICAL_EMERGENCE_WITH_FLOOR_OCCLUSION',
                                'completeSourceNode':bearing,'nativeDrop':drop,'occlusionPlane':plane})
        phases[phase] = ground_nodes(phases[phase]) + rear_nodes + [core_node,bearing]
    return rig.finish(phases)


def robot(rig, assets, original_assets):
    heads = atlas(assets/'garobo-heads-09-v1.png')
    mature = atlas(original_assets/'garobo-satellites-final-parts-v1.png', (3, 1))
    early = atlas(original_assets/'garobo-dishes-00-v1.png')
    source = mature[0]
    # Cropping existing authored component texels isolates canonical mechanical
    # surfaces. The painting itself is unchanged; only layer ownership changes.
    drum = source.crop((0, 277, source.width, 420))
    shaft = source.crop((70, 420, 240, 523))
    cone = source.crop((0, 523, source.width, source.height))
    foot_source = atlas(original_assets/'garobo-left-towers-09-17-v1.png')[0]
    foot = foot_source.crop((0, foot_source.height-33, foot_source.width, foot_source.height))
    phases = copy.deepcopy(rig.previous['phases'])
    roots = [(84, 85), (95, 106), (130, 91)]
    cup_tops = [74, 68, 61, 55, 50, 47, 45, 45, 45, 45, 45]
    for phase in range(9, 20):
        fixed = [n for n in phases[phase] if n['name'] in {'foundation', 'mast'}]
        towers = []
        if phase < 9:
            parts = split_components(early[phase])
            assert len(parts) == (1 if phase == 5 else 2 if phase == 6 else 3)
            for i, im in enumerate(parts):
                towers.append(rig.rigid(im, f'dish-{i}', phase, roots[i], width=20 if i < 2 else 18))
        else:
            for i, (x, y) in enumerate(roots):
                top = cup_tops[phase-9] + (0 if i == 0 else 21 if i == 1 else 9)
                foot_image = cone if phase >= 18 else foot
                foot_node = rig.rigid(foot_image, f'tower-{i}-foot', phase, (x,y), width=24 if phase>=18 else 20)
                foot_top = foot_node['box'][1]
                cup_height = drum.height*24/drum.width
                cup_bottom = min(top+cup_height, y)
                if foot_top > cup_bottom:
                    towers.append(rig.rectangle(shaft, f'tower-{i}-telescoping-shaft', phase,
                                   (x-6.5, cup_bottom-1, x+6.5, foot_top+1), 'AXIAL_TELESCOPING_EXTENSION'))
                towers.append(foot_node)
                towers.append(rig.rigid(drum, f'tower-{i}-rigid-drum', phase, (x,cup_bottom), width=24))
                if phase < 18:
                    head = heads[phase-9]
                else:
                    full = mature[i]
                    head = full.crop((0,0,full.width,277))
                towers.append(rig.rigid(head, f'tower-{i}-rigid-head', phase, (x,top+2), width=31,
                                       mirror=i == 2 and phase < 18))
        # Preserve the accepted mast and draw the nearer satellite last.
        rear = [n for n in towers if n['name'].startswith(('tower-0-', 'tower-2-')) or n['name'] in {'dish-0','dish-2'}]
        front = [n for n in towers if n not in rear]
        phases[phase] = [fixed[0]] + rear + fixed[1:] + front
    return rig.finish(phases)


def radar_head(image):
    a = np.asarray(image).astype(float)
    blue = (a[...,2] > 130) & (a[...,2] > a[...,0]*1.4) & (a[...,1] > a[...,0]*1.2) & (a[...,3] > 180)
    # The rotating feed horn also has blue material. Only the lower observation
    # window band locates the head/cabin seam, preserving the complete support.
    blue[:round(image.height*.32)] = False
    yy, xx = np.where(blue)
    assert len(xx)
    cut = int(yy.min())-10
    crop = image.crop((0,0,image.width,cut))
    pieces = split_components(crop)
    return max(pieces, key=lambda im: np.count_nonzero(np.asarray(im)[...,3]>128))


def radar(rig, assets, original_assets):
    parts = atlas(assets/'gaairc-rigid-parts-v1.png')
    early = atlas(original_assets/'gaairc-upper-00-v2.png')
    middle = atlas(original_assets/'gaairc-upper-01-v1.png')
    late = atlas(original_assets/'gaairc-upper-02-v1.png', (3,2))
    caps = split_components(parts[8])
    assert len(caps) == 2
    phases = copy.deepcopy(rig.previous['phases'])
    roots = [(63,110), (103,96)]
    widths = [28,24]
    for phase in range(9,25):
        nodes = ground_nodes(phases[phase])
        # Ground contacts and round conical lower pods never receive a mesh warp.
        for i, (root, width) in enumerate(zip(roots,widths)):
            foot = rig.rigid(parts[i], f'pod-{i}-rigid-foot', phase, root, width=width)
            upper_y = foot['box'][1] + 3
            if phase < 12:
                reveal = root[1] - [5,6,7,10,13][phase-7]
                layer = place(Image.open(foot['image']),foot['box'],rig.canvas)
                layer[:round((reveal+2)*4)] = 0
                nodes.append(rig.save(layer,f'pod-{i}-emerging-foot',phase,
                                      {'method':'WORLD_FIXED_RIGID_CONE_REVEALED_ABOVE_FLOOR',
                                       'completeSourceNode':foot,'revealPlane':reveal}))
                nodes.append(rig.rectangle(caps[i],f'pod-{i}-solid-cap',phase,
                             (root[0]-width*.44,reveal-3,root[0]+width*.44,reveal+6),
                             'PLANAR_CAP_ON_RISING_FOOTING'))
            else:
                nodes.append(foot)
            if phase > 14:
                cup = parts[6+i]
                cup_node = rig.rigid(cup,f'pod-{i}-antenna-cup',phase,(root[0],upper_y+4),width=width*.88)
                coverage = np.asarray(cup)[...,3] >= 128
                rim_y = np.where(coverage.sum(axis=1) > cup.width*.55)[0][0]
                if phase < 24:
                    # Antennas rise after the cups, matching the original stages.
                    exposed = 0 if phase < 19 else (phase-18)/6
                    source_cut = rim_y*(1-exposed)
                    transform = cup_node['rigidPart']['transform']
                    world_cut = source_cut*transform[1][1]+transform[1][2]
                    layer = place(Image.open(cup_node['image']),cup_node['box'],rig.canvas)
                    layer[:round(world_cut*4)] = 0
                    cup_node = rig.save(layer,f'pod-{i}-rising-antenna-cup',phase,
                                        {'method':'RIGID_ANTENNA_TELESCOPIC_REVEAL','completeSourceNode':cup_node,
                                         'visibleAntennaFraction':exposed})
                nodes.append(cup_node)
        top = rig.raw['frames'][phase]['y']
        original = early[phase] if phase < 9 else middle[phase-9] if phase < 18 else late[min(phase-18,5)]
        head = radar_head(original)
        head_width = 32 if phase < 18 else 32
        head_height = head.height * head_width/head.width
        dish_bottom = top + head_height
        head_node = rig.rigid(head,'rigid-radar-dish',phase,(81,dish_bottom),width=head_width)
        cabin = parts[3]
        cabin_height = cabin.height*25/cabin.width
        cabin_bottom = dish_bottom+cabin_height-5
        shaft_image = parts[2].crop((0,round(parts[2].height*.4),parts[2].width,round(parts[2].height*.86)))
        if cabin_bottom < 99:
            nodes.append(rig.rectangle(shaft_image,'main-telescoping-shaft',phase,
                          (72,cabin_bottom-1,90,99),'AXIAL_TELESCOPING_EXTENSION'))
        # The foreground cap rises with the native entry shaft instead of being
        # resized with the dish, contact cones or neighboring antenna pods.
        if phase >= 9:
            cap_y = max(71, 102-(phase-9)*2.25)
            if phase >= 13:
                nodes.append(rig.rectangle(parts[5],'entrance-shaft-and-stairs',phase,
                              (81,cap_y-1,96,107),'AXIAL_ENTRANCE_DEPLOYMENT'))
            nodes.append(rig.rigid(parts[4],'rigid-front-dome',phase,(87,cap_y+4),width=18))
        nodes.append(rig.rigid(cabin,'rigid-blue-cabin',phase,(81,cabin_bottom),width=25))
        nodes.append(head_node)
        phases[phase] = nodes
    return rig.finish(phases)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('authoring',type=Path)
    parser.add_argument('assets',type=Path)
    parser.add_argument('output',type=Path)
    args = parser.parse_args()
    args.output.mkdir(exist_ok=False)
    authority = read(args.authoring)
    rigs = {}
    functions = {'gtgcan':cannon, 'atesla':prism, 'gacsph':chronosphere, 'garobo':robot, 'gaairc':radar}
    for identity, build in functions.items():
        record = next(f for f in authority['families'] if f['key'] == identity+'-temperate')
        rig = Rig(record,args.output/record['key'])
        if identity in {'garobo','gaairc'}:
            result = build(rig,args.assets,args.assets.parent)
        else:
            result = build(rig,args.assets)
        rigs[record['key']] = result
        for phase,nodes in enumerate(result['phases']):
            if isinstance(nodes,dict):
                continue
            composed = np.zeros((rig.canvas[1]*4,rig.canvas[0]*4,4),np.uint8)
            for n in nodes:
                composed = over(place(Image.open(n['image']),n['box'],rig.canvas),composed)
            Image.fromarray(composed).save(rig.output/f'{phase:02}-preview.png')
    write(args.output/'rigs-temperate.json',rigs)
    print('Five independent temperate rigs authored; runtime selection unchanged')


if __name__ == '__main__':
    main()
