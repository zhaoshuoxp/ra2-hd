"""Author Construction Yard with rigid garage poses and separate mast mechanics."""
import argparse
import copy
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import binary_erosion

from buildup import native_indices, read, sha, write
from painted_rig import over, place
from retained_idle import display

terminal = SourceFileLoader('terminal_author', 'scripts/art/author-terminal-alignment.py').load_module()
factory = SourceFileLoader('factory_author', 'scripts/art/author-war-factory.py').load_module()
helpers = terminal.helpers


def author(record, assets, reference, output, counterpart=None):
    seed = copy.deepcopy(record)
    seed['componentRig'] = {'nativeSourceSha256': sha(record['nativeSource']),
                           'phases': [[] for _ in range(record['frames'])],
        'retainedIdleCompletion': {'reference': {'nativeReport': str(reference), 'sha256': sha(reference)}}}
    rig = helpers.Rig(seed, output)
    full = display(seed)
    original = {'family': record['newFamilyPath'], 'sha256': record['newFamilySha256']}
    painted = lambda name: {'image': str(assets / name), 'sha256': sha(assets / name)}
    yy, xx = np.mgrid[:full.shape[0], :full.shape[1]] / 4
    intro = helpers.atlas(assets / 'gacnst-folded-intro-v1.png')
    narrow = helpers.atlas(assets / 'gacnst-narrow-core-05-07-v1.png', (3, 1))
    garage = helpers.atlas(assets / 'gacnst-garage-15-18-v1.png', (2, 2))
    platforms = helpers.split_components(Image.open(assets / 'gacnst-empty-platforms-v1.png'))
    assert len(platforms) == 2, 'Expected complete foundation and independent empty deck'
    plain = helpers.atlas(assets / 'gaweap-ground-foundation-v1.png', (1, 1))[0]
    early_ground = place(plain, (38, 110, 249, 222), rig.canvas)
    floor = place(platforms[0], (38, 110, 249, 222), rig.canvas)
    deck = place(platforms[1], (39, 110, 165, 178), rig.canvas)
    ground_node = None
    mast = terminal.polygon(full.shape, [(73, 106), (90, 105), (99, 115),
        (99, 159), (91, 172), (73, 170), (69, 155), (69, 117)])
    cap = mast & (yy < 125)
    body = mast & ~cap
    front_fin = terminal.polygon(full.shape, [(98, 88), (110, 85), (117, 96),
                                            (117, 121), (108, 133), (98, 126)])
    rear_fin = terminal.polygon(full.shape, [(124, 77), (138, 73), (143, 87),
                                           (143, 111), (136, 118), (124, 110)])
    garage_region = terminal.polygon(full.shape, [(134, 107), (197, 95), (229, 115),
        (234, 151), (225, 175), (182, 190), (138, 177), (134, 141)])
    drums = terminal.polygon(full.shape, [(117, 102), (139, 99), (172, 100),
        (174, 130), (154, 147), (117, 150)]) & ~front_fin & ~rear_fin & ~garage_region
    crane_arm = terminal.polygon(full.shape, [(84, 127), (102, 123), (129, 133),
        (129, 139), (125, 145), (117, 141), (84, 137)])
    claw = (xx >= 116) & (xx < 133) & (yy >= 145) & (yy < 183)
    lower = (yy >= 177) | ((xx < 74) & (yy >= 140))
    phases = []
    for phase in range(record['frames']-1):
        if counterpart and phase < 25:
            phases.append(copy.deepcopy(counterpart['phases'][phase]))
            continue
        nodes = []
        if phase >= 8:
            if ground_node is None:
                ground_node = factory.node(rig, floor, 'fixed-complete-foundation-and-deck',
                    phase, painted('gacnst-empty-platforms-v1.png'), 'FIXED_WORLD_FOUNDATION_FROM_DEPLOYED_PHASE_EIGHT')
            nodes.append(copy.deepcopy(ground_node))
        elif phase >= 4:
            layer = factory.clip_ground(rig, early_ground, phase)
            nodes.append(factory.node(rig, layer, 'deploying-ground-slab', phase,
                painted('gaweap-ground-foundation-v1.png'), 'FIXED_WORLD_UV_NATIVE_DEPLOYMENT_CONTOUR'))
            if phase >= 5:
                reveal = terminal.polygon(full.shape, [(39, 157), (139, 110),
                    (165, 125), (65, 179)])
                layer = terminal.masked(deck, reveal)
                if phase == 5:
                    layer = terminal.masked(layer, reveal & ~binary_erosion(reveal, iterations=6))
                layer = terminal.move(layer, dy={5:7, 6:2, 7:0}[phase])
                # The work deck is a flat folding ground plane, with its final
                # empty surface established independently of future machines.
                nodes.append(factory.node(rig, layer, 'deploying-empty-work-deck', phase,
                    painted('gacnst-empty-platforms-v1.png'), 'SEPARATE_DEPLOYING_WORK_DECK'))
        if phase <= 7:
            image = intro[phase] if phase < 5 else narrow[phase-5]
            mask = factory.native_surface(rig, phase,
                lambda x, y: (x >= 96) & (x < 137) & (y < 174),
                lambda c: (c[..., 0] > np.maximum(c[..., 1], c[..., 2]) * 1.3)
                    | (np.ptp(c, axis=2) < 40))
            box = factory.bounds(mask)
            x0, y0, x1, y1 = box
            if phase >= 5:
                x0, x1 = 117, 132
                y0, y1 = {5:(118,167), 6:(128,167), 7:(139,167)}[phase]
            nodes.append(rig.rigid(image, 'folded-construction-intro', phase,
                ((x0+x1)/2, y1), height=y1-y0,
                anchor=(image.width/2, image.height)))
        if phase >= 8:
            drop = {8:56, 9:46, 10:37, 11:28, 12:21, 13:14, 14:10, 15:7, 16:4, 17:2}.get(phase, 0)
            cap_layer = terminal.move(terminal.masked(full, cap), dy=drop)
            body_layer = terminal.masked(full, body & (yy >= 125+drop))
            nodes.append(factory.node(rig, over(cap_layer, body_layer), 'telescoping-generator-column',
                phase, original, 'FIXED_RADIUS_BODY_WITH_TRANSLATING_COMPLETE_CAP', nativeTranslation=[0, drop]))
        if phase >= 7:
            drop = {7:34, 8:30, 9:28, 10:26, 11:24, 12:22, 13:20, 14:18,
                    15:16, 16:14, 17:10, 18:7, 19:4, 20:2}.get(phase, 0)
            drop = max(drop, rig.logical[phase]['trimOrigin'][1]-73)
            for name, mask in [('front-rear-fin', front_fin), ('back-rear-fin', rear_fin)]:
                fin = terminal.move(terminal.masked(full, mask), dy=drop)
                fin = terminal.masked(fin, yy < (123 if name == 'back-rear-fin' else 138))
                nodes.append(factory.node(rig, fin, name, phase, original,
                    'RIGID_FIN_RISE_BEHIND_FIXED_WORK_DECK', nativeTranslation=[0, drop]))
        if 5 <= phase <= 17:
            pose = 0 if phase < 16 else phase-15
            image = garage[pose]
            x0, y0, x1, y1 = {0:(134,145,214,184), 1:(134,128,217,188),
                              2:(134,119,218,189)}[pose]
            # Each painted pose is a different physical rotation, never a
            # stretched completed cylinder or an elastic whole-building fit.
            nodes.append(rig.rigid(image, 'rotating-rigid-garage', phase,
                ((x0+x1)/2, y1), width=x1-x0, anchor=(image.width/2, image.height)))
        elif phase >= 18:
            layer = terminal.masked(full, garage_region)
            if phase < 25:
                layer = terminal.masked(layer, xx < {18:205, 19:211, 20:217, 21:220,
                                                    22:224, 23:229, 24:234}[phase])
            nodes.append(factory.node(rig, layer, 'forming-garage-roof-and-door', phase,
                original, 'EXACT_FINISHED_GARAGE_GEOMETRY_WITH_NATIVE_PANEL_VISIBILITY'))
        if phase >= 14:
            arm = terminal.masked(full, crane_arm)
            if phase < 22:
                arm = terminal.masked(arm, xx < {14:96, 15:100, 16:104, 17:108,
                    18:112, 19:116, 20:120, 21:125}[phase])
                arm = terminal.move(arm, dy={14:24, 15:20, 16:16, 17:12,
                    18:8, 19:6, 20:3, 21:1}[phase])
            nodes.append(factory.node(rig, arm, 'unfolding-crane-arm', phase, original,
                'FIXED_SECTION_CRANE_COMPONENT_WITH_NATIVE_REVEAL'))
        if phase >= 23:
            layer = terminal.masked(full, drums)
            if phase < 25:
                layer = terminal.masked(layer, yy >= {23:125, 24:115}[phase])
            nodes.append(factory.node(rig, layer, 'forming-rear-drum-bank', phase, original,
                'FIXED_RADIUS_DRUMS_WITH_NATIVE_REVEAL'))
        if phase >= 21:
            nodes.append(factory.node(rig, terminal.masked(full, lower), 'finished-ground-attachments',
                phase, original, 'EXACT_FINISHED_RAILS_MARKINGS_AND_SMALL_OBJECTS'))
        if phase >= 25:
            drop = {25:-12, 26:-5}.get(phase, 0)
            nodes.append(factory.node(rig, terminal.move(terminal.masked(full, claw), dy=drop),
                'lowering-complete-crane-claw', phase, original,
                'RIGID_CRANE_CLAW_TRANSLATION', nativeTranslation=[0, drop]))
        if record['theater'] == 'SNOW' and phase >= 25:
            nodes.append(factory.node(rig, terminal.masked(full, yy >= 151),
                'retained-snow-lower-architecture', phase, original,
                'EXACT_THEATER_SPECIFIC_FINISHED_ARCHITECTURE'))
        if phase == 27:
            nodes = [factory.node(rig, full, 'complete-retained-initial-idle-architecture', phase,
                original, 'EXACT_RETAINED_VISIBLE_INITIAL_IDLE_LAYERS')]
        phases.append(nodes)
    marker = output / '28-retained-idle-marker.png'
    Image.new('RGBA', (4,4)).save(marker)
    x,y = rig.logical[-1]['trimOrigin']
    phases.append([{'name':'retained-idle-completion-marker', 'image':str(marker),
                   'sha256':sha(marker), 'box':[x,y,x+1,y+1]}])
    result = rig.finish(phases)
    result.update(newConstructionArt=True, foundationSource=None,
        retainedIdleCompletion={'frame':28,'reference':{'nativeReport':str(reference),'sha256':sha(reference)}},
        neutralMaterialProvenance='AUTHORED_COMPONENTS_AND_RETAINED_HD_RGB_NO_NATIVE_COLOR',
        architecturalMethod='FIXED_FOUNDATION_RIGID_GARAGE_POSES_SEPARATE_CAP_FINS_DRUMS_AND_CRANE',
        visualAcceptance='PENDING')
    for phase,nodes in enumerate(phases):
        canvas = np.zeros((rig.canvas[1]*4,rig.canvas[0]*4,4),np.uint8)
        for part in nodes:
            canvas = over(place(Image.open(part['image']),part['box'],rig.canvas),canvas)
        Image.fromarray(canvas).save(output/f'{phase:02}-preview.png')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('authoring','assets','reference','output'):
        parser.add_argument(name,type=Path)
    parser.add_argument('--key',default='gacnst-temperate')
    parser.add_argument('--counterpart-rigs',type=Path)
    args = parser.parse_args()
    args.output.mkdir(exist_ok=False)
    authority = read(args.authoring)
    record = next(f for f in authority['families'] if f['key']==args.key)
    counterpart = None
    if args.counterpart_rigs:
        donor = next(f for f in authority['families'] if f['key']=='gacnst-temperate')
        donor_raw,raw = read(donor['nativeSource']),read(record['nativeSource'])
        for phase in range(25):
            indices,other = native_indices(raw,phase),native_indices(donor_raw,phase)
            assert np.array_equal(indices,other)
            used = np.unique(indices[indices>0])
            assert np.array_equal(np.asarray(record['palette'])[used],np.asarray(donor['palette'])[used])
        counterpart = read(args.counterpart_rigs)['gacnst-temperate']
    write(args.output/'rigs.json',{record['key']:author(record,args.assets,args.reference,
          args.output/record['key'],counterpart)})
    print('Unselected Construction Yard component candidate authored')


if __name__ == '__main__':
    main()
