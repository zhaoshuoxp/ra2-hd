"""Original Tank Bunker silhouette, fixed pad and native vertical guard motion."""
import sys
import numpy as np
from PIL import Image
from production_common import ROOT, Family, row_for, resting, clip, indices, cells
from mechanical_common import project_part

output = sys.argv[1]
dry = row_for('NATBNK')
masters = [ROOT / 'feedback-r5/art-v4/bunker-original-state-masters.png',
           ROOT / 'feedback-r5/art-v4/bunker-damaged-state-masters.png']

for theater in ('TEMPERATE', 'SNOW', 'NEWURBAN'):
    for density in (2, 4):
        f = Family('NATBNK', theater, density, output)
        body, bib, front_member, rear_member, build = f.row['members']
        floors, guards = [], []
        for source in masters:
            keys = cells(source, 2)
            keys.sort(key=lambda key: key[1][0])
            floor = f.register(keys[0][0], (10, 61, 128, 126), source, source_region=keys[0][1])
            raised = f.register(keys[1][0], (10, 61, 128, 126), source, source_region=keys[1][1])
            floors.append(floor)
            # Exterior-wall spikes project horizontally away from the pad.
            # Rear exterior spikes are occluded; visible inner armor is plain.
            # Their sockets and height retain the Original low guard geometry.
            faces = [
                ([(29,84),(64,66),(64,79),(29,97)], [(21,78),(69,54),(69,63),(21,87)], 1),
                ([(74,66),(109,84),(109,97),(74,79)], [(69,54),(117,78),(117,87),(69,63)], 1),
                ([(29,91),(64,109),(64,120),(29,102)], [(21,87),(69,111),(69,120),(21,96)], 0),
                ([(74,109),(109,91),(109,102),(74,120)], [(69,111),(117,87),(117,96),(69,120)], 0),
            ]
            pair = [f.blank(), f.blank()]
            for source_quad, target_quad, side in faces:
                pair[side].alpha_composite(project_part(f, raised, source_quad, target_quad))
            for side, image in enumerate(pair):
                pixels = np.array(image)
                r, g, b = [pixels[..., i].astype(float) for i in range(3)]
                perimeter = (b > r*1.1) & (r > g*1.5) & (b-g > 25)
                pixels[perimeter] = 0
                pair[side] = Image.fromarray(pixels)
            guards.append(pair)

        def owner_data(image):
            rgba = np.array(image)
            r, g, b = [rgba[..., i].astype(float) for i in range(3)]
            purple = (b > r*1.1) & (r > g*1.5) & (b-g > 25) & (rgba[...,3] > 0)
            ramp = np.array([63,59,55,52,48,44,41,37,33,30,26,22,19,15,11,8])*4
            data = np.zeros_like(rgba); data[...,3] = 255
            data[...,0][purple] = 255
            shades = abs(b[...,None]-ramp).argmin(axis=2)
            data[...,1][purple] = shades[purple]
            return Image.fromarray(data)

        for n in range(body['visibleFrames']):
            assert not indices(body, n).any()
            f.put(body, n, f.blank(), 'Exact native empty body; complete pad belongs to the bib')
        for n in range(bib['visibleFrames']):
            image = f.snow(bib, n, floors[min(n,1)])
            f.put(bib, n, image, 'HD reconstruction from user Original pad reference; fixed purple owner perimeter and closed steel floor', data=owner_data(image))
        yy, xx = np.indices(f.size[::-1])
        ground = [(yy/density <= 120-abs(xx/density-69)*.5),
                  (yy/density <= 63+abs(xx/density-69)*.5)]
        for member, side in [(front_member,0),(rear_member,1)]:
            for n in range(member['visibleFrames']):
                phase, damage = n%10, n>=10
                part = f.translate(guards[int(damage)][side], dy=max(0,8-phase))
                image = f.snow(member,n,clip(part,Image.fromarray(np.uint8(ground[side])*255)))
                f.put(member,n,image,'Horizontal outward spikes rooted in vertical armor walls; guards rise from Original sockets with separate native front/rear depth and normal/damaged timing',data=owner_data(image))
        for n in range(build['visibleFrames']):
            floor = floors[0]
            image = floor.copy() if n >= build['visibleFrames']-2 else clip(floor,f.native_mask(build,n,expand=1))
            f.put(build,n,f.snow(build,n,image),'Original native foundation coverage installs the fixed reconstructed pad; native temperate/snow/New Urban slot timing retained',data=owner_data(image))
        f.export()
