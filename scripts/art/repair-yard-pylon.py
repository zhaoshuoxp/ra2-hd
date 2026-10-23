"""Restore the complete rear-left shipyard pylon without changing crane motion."""
import argparse
import copy
import shutil
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image

from buildup import read, sha, write
from painted_rig import over, bounds, place

motion = SourceFileLoader('yard_pylon_motion', 'scripts/art/author-infrastructure-motion.py').load_module()
base, terminal = motion.base, motion.terminal


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    root = Path('.artifacts/buildup-remaining-20261013-r74-v1')
    authority = root/'yard-seam-r86-v1/selected-v1/authoring.json'
    record = next(r for r in read(authority)['families'] if r['key']=='gayard-temperate')
    args.output.mkdir(exist_ok=False)
    snapshot = args.output/'authoring-source.py'
    shutil.copy2(__file__, snapshot)
    source = {'code':str(snapshot),'sha256':sha(snapshot),'material':'RETAINED_HD_PYLON_SURFACES'}
    assets = root/'infrastructure-r82-v1'
    scene = base.Scene(record,assets,assets/'reference-temperate-v1/report.json',args.output/record['key'])
    surface = root/'yard-pylon-r87-v1/complete-pylon-surfaces-v1.png'
    source.update(surfaceImage=str(surface),surfaceSha256=sha(surface),mode='BUILT_IN_IMAGEGEN_EDIT')
    hidden = place(Image.open(surface),(160,107,210,164),scene.rig.canvas)
    region = terminal.polygon(scene.full.shape,[(163,113),(211,113),(211,150),(163,150)])
    occluded = np.zeros(scene.full.shape[:2],bool)
    for name in ['original-lifting-drum','original-lifting-collar','original-extending-curved-guides']:
        occluded |= motion.source_layer(scene,23,name)[...,3]>0
    occluded |= (scene.xx>193.5)&(scene.yy>124.5)
    visible_mask = region & ~occluded & (scene.yy>=116)
    visible = terminal.masked(scene.full,visible_mask)
    # Match the hidden surface across the interior seam, without changing the
    # opaque silhouette or introducing a per-frame texture transition.
    from scipy.ndimage import gaussian_filter
    weight = gaussian_filter(visible_mask.astype(float),5)[...,None]
    both = (visible[...,3]==255)&(hidden[...,3]==255)
    complete = over(visible,terminal.masked(hidden,region))
    blended = np.rint(scene.full*weight+hidden*(1-weight)).astype('uint8')
    complete[both] = blended[both]
    upper = terminal.masked(complete,scene.yy<150)
    exact = terminal.masked(scene.full,region)
    extending = terminal.masked(exact,~(motion.source_layer(scene,23,'original-extending-curved-guides')[...,3]>0))
    Image.fromarray(upper).save(args.output/'complete-pylon-upper.png')
    for phase,old in enumerate(record['componentRig']['phases']):
        if phase==24:
            scene.phases.append(copy.deepcopy(old))
            continue
        nodes=[]
        for node in old:
            if node['name']=='telescoping-pylon-0':
                # Keep the accepted lower shaft and fixed waterline foot intact.
                shaft=motion.source_layer(scene,phase,'telescoping-pylon-0')
                drop={0:31,1:22,2:12,3:4}.get(phase,0)
                drop=max(drop,scene.rig.logical[phase]['trimOrigin'][1]-bounds(upper[...,3]>=8)[1]/4)
                shaft=terminal.masked(shaft,scene.yy>=145+drop)
                surface_layer=exact if phase>=14 else extending if phase==13 else upper
                layer=terminal.masked(terminal.move(surface_layer,dy=drop),scene.yy<=185)
                layer=over(layer,shaft)
                scene.emit(nodes,layer,'complete-rear-left-pylon',phase,
                    'RIGID_COMPLETE_CAP_AND_SHAFT_MATCH_RETAINED_VISIBLE_PYLON',source=source,
                    translation=[0,drop])
            else:
                nodes.append(copy.deepcopy(node))
        scene.phases.append(nodes)
    write(args.output/'rigs.json',{record['key']:scene.finish()})
    print('One complete rear-left shipyard pylon authored',flush=True)


if __name__=='__main__':
    main()
