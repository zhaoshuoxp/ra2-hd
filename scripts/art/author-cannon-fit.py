"""Rebuild cannon construction with one retained bearing, receiver and pivot."""
import argparse
import copy
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from buildup import read, sha, write
from painted_rig import over, place, project_rgba

terminal = SourceFileLoader('terminal_author', 'scripts/art/author-terminal-alignment.py').load_module()


def ellipse(shape, box):
    image = Image.new('1', (shape[1], shape[0]))
    ImageDraw.Draw(image).ellipse(tuple(round(v*4) for v in box), fill=1)
    return np.asarray(image)


def author(record, reference, output):
    rig = terminal.helpers.Rig(record, output)
    family = read(record['newFamilyPath'])
    binding = family.get('turret') or read(reference['turretFamily'])['turret']
    turret_root = Path('.local')/binding['path']
    assert sha(turret_root/'manifest.json') == binding['sha256']
    source = np.asarray(Image.open(turret_root/'0.png').convert('RGBA'))
    origin = np.asarray(record['componentRig']['nativeTurretOrigin'])
    # The complete breech, red collar, black coupling and tube rotate together.
    # The outer armor and axle braces stay on the unchanged turntable. The old
    # polygon cut through the coupling and left tube pixels in the fixed layer.
    moving_mask = terminal.polygon(source.shape, [
        (65,40),(91,37),(140,25),(144,27),(145,43),(104,62),
        (95,67),(88,59),(77,57),(65,55)])
    moving_mask = moving_mask & ~ellipse(source.shape, (87,57.5,98,70.5))
    moving = terminal.masked(source, moving_mask)
    fixed = terminal.masked(source, ~moving_mask)
    yy, xx = np.mgrid[:source.shape[0], :source.shape[1]]/4
    bearing_mask = yy >= 87
    bearing = terminal.masked(fixed, bearing_mask)
    receiver = terminal.masked(fixed, ~bearing_mask)
    floor = terminal.render_member(record, family['members'][0])
    cy, cx = np.mgrid[:floor.shape[0], :floor.shape[1]]/4
    disc_mask = ellipse(floor.shape, (90,93,141.5,126))
    disc = terminal.masked(floor, disc_mask)
    rear = terminal.masked(floor, ~disc_mask & (cy < 102))
    left = terminal.masked(floor, ~disc_mask & (cy >= 102) & (cx < 103))
    right = terminal.masked(floor, ~disc_mask & (cy >= 102) & (cx > 130))
    front = terminal.masked(floor, ~disc_mask & (cy >= 102) & (cx >= 103) & (cx <= 130))
    reference = {**reference, 'turretManifestSha256': binding['sha256'],
                 'turretImageSha256': sha(turret_root/'0.png')}
    phases = []
    pivot = np.asarray([93,64])*4
    target = pivot/4+origin
    static_bearing = project_rgba(Image.fromarray(bearing),
        [[.25,0,origin[0]],[0,.25,origin[1]]], rig.canvas)
    static_bearing[static_bearing[...,3]<8]=0
    for phase in range(11):
        if phase == 0:
            foundation = disc
        elif phase < 4:
            foundation = over(rear,disc)
            inset = 9 if phase == 1 else 0
            foundation = over(terminal.move(left,dx=inset),foundation)
            foundation = over(terminal.move(right,dx=-inset),foundation)
            foundation = over(terminal.move(front,dy=-9 if phase == 1 else -2),foundation)
        else:
            foundation = floor
        nodes = [terminal.save_part(rig,foundation,'foundation',phase,reference,
            'RETAINED_PLATFORM_WITH_RIGID_STABILIZER_DEPLOYMENT')]
        drop = [16,14,12,11,10,7,4,2,0,0,0][phase]
        body = project_rgba(Image.fromarray(receiver),
            [[.25,0,origin[0]],[0,.25,origin[1]+drop]],rig.canvas)
        # Emerging armor is occluded by the turntable's front lip. Its texture,
        # proportions and attachment axis never resize to a changing SHP box.
        if drop:
            body[cy >= 110] = 0
        nodes.append(terminal.save_part(rig,body,'canonical-emerging-receiver',phase,reference,
            'RIGID_RECEIVER_TRANSLATION_WITH_PLATFORM_OCCLUSION',nativeTranslation=[0,drop]))
        nodes.append(terminal.save_part(rig,static_bearing,'canonical-fixed-bearing',phase,reference,
            nativeTranslation=[0,0]))
        angle = np.deg2rad(-62 if phase <= 8 else {9:-43,10:-19}[phase])
        rotation = np.asarray([[np.cos(angle),-np.sin(angle)],
                               [np.sin(angle),np.cos(angle)]])*.25
        matrix = np.column_stack((rotation,target+[0,drop]-rotation@pivot))
        barrel = project_rgba(Image.fromarray(moving),matrix.tolist(),rig.canvas)
        nodes.append(terminal.save_part(rig,barrel,'canonical-elevating-breech-and-barrel',phase,reference,
            'RIGID_BREECH_AND_BARREL_ROTATION',transform=matrix.tolist(),singularValueRatio=1.,
            pivot=(target+[0,drop]).tolist()))
        phases.append(nodes)
    phases.append(copy.deepcopy(record['componentRig']['phases'][11]))
    result = rig.finish(phases)
    result.update(foundationSource=None, foundationStableFrom=4, fixedFloorPhases=list(range(4,11)))
    result['cannonFit'] = {'baseline':'V9_REJECTED', 'receiverSource':'ONE_RETAINED_COMPLETED_CAMERA',
        'bearingCenterNative':(origin+[76,86]).tolist(), 'platformCenterNative':[116,108],
        'elevationPivotNative':target.tolist(), 'bodyScale':1., 'stableReceiverFrom':8,
        'platformPreservedFrom':4, 'genericPredecessorUpperNodes':0, 'visualAcceptance':'PENDING'}
    result['terminalAlignment'] = {'baseline':'V9', 'reference':reference,
        'method':'ONE_CANONICAL_RECEIVER_BEARING_AND_ELEVATION_PIVOT', 'visualAcceptance':'PENDING'}
    for phase,nodes in enumerate(phases):
        canvas=np.zeros((rig.canvas[1]*4,rig.canvas[0]*4,4),np.uint8)
        for node in nodes:
            canvas=over(place(Image.open(node['image']),node['box'],rig.canvas),canvas)
        Image.fromarray(canvas).save(output/f'{phase:02}-preview.png')
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('authoring',type=Path)
    parser.add_argument('output',type=Path)
    args=parser.parse_args()
    authority=read(args.authoring)
    args.output.mkdir(exist_ok=False)
    records={f['key']:f for f in authority['families']}
    reference={'baselineAuthoring':str(args.authoring), 'sha256':sha(args.authoring),
        'turretFamily':records['gtgcan-temperate']['newFamilyPath'],
        'artwork':'RETAINED_FINISHED_HD_COMPONENTS_NO_RETAIL_RGB'}
    rigs={key:author(records[key],reference,args.output/key)
          for key in ('gtgcan-temperate','gtgcan-snow')}
    write(args.output/'rigs.json',rigs)
    print('Two canonical cannon rigs authored; selection unchanged')


if __name__=='__main__':
    main()
