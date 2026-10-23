"""Full-hook shipyard, fixed berths and separately guided mast/crane actions."""
import sys
import numpy as np
from PIL import Image, ImageDraw
from production_common import ROOT, Family, row_for, resting, decode, indices, clip
from mechanical_common import ground_plane, disjoint_parts, project_registered_master
from construction_motion import telescope

output = sys.argv[1]
dry = row_for('YAYARD')
sources = [ROOT / 'art-v1/YAYARD-TEMPERATE-R2/normal-raw.png', ROOT / 'production-art-v1/YAYARD/damaged-raw.png']
early_source = ROOT / 'production-art-v1/YAYARD/early-base-raw.png'
for theater in ('TEMPERATE', 'SNOW'):
    for density in (2, 4):
        f = Family('YAYARD', theater, density, output)
        body, idle, production, active, special, build = f.row['members']
        masters, registrations = [], []
        for damage, source in enumerate(sources):
            masters.append(f.register(Image.open(source), resting(dry, bool(damage)).getbbox(), source))
            registrations.append(f.registrations[-1])
        partitions = []
        for master in masters:
            masks = []
            for points in [[(0,148),(188,148),(188,193),(304,193),(304,236),(0,236)],
                           [(136,48),(167,48),(167,99),(136,99)],
                           [(188,112),(266,112),(266,193),(188,193)]]:
                mask = Image.new('L', f.size)
                ImageDraw.Draw(mask).polygon([(x*density,y*density) for x,y in points], fill=255)
                masks.append(mask)
            partitions.append(disjoint_parts(master, masks))
        early = f.register(Image.open(early_source), (90,113,266,212), early_source)
        ground = ground_plane(early)
        for n in range(body['visibleFrames']):
            f.put(body,n,f.snow(body,n,partitions[int(n!=0)][0]),
                'Fixed complete central room; native berth, upper mast and entire crane ownership transferred to independent members without duplicate material edges')
        for n in range(active['visibleFrames']):
            native = indices(active,n)
            if set(native.ravel()) <= {0,1}:
                image = decode(f.row,active,n).resize(f.size,Image.Resampling.NEAREST)
                operation = 'Retained native indexed control tail outside normal/damaged berth loops'
            else:
                damage = n>=16
                image = partitions[int(damage)][1].copy()
                operation = 'Complete fixed photographic berth roofs, floor tanks, piers and submerged supports at native sockets; no whole-building pose fit'
            f.put(active,n,f.snow(active,n,image),operation)
        for member in (idle,production,special):
            for n in range(member['visibleFrames']):
                damage = n>=16
                image = partitions[int(damage)][2].copy()
                crane = partitions[int(damage)][3].copy()
                # The native action controls hook travel. Complete local hook
                # and chain source pixels retain the approved full right edge.
                native = indices(member,n)
                rows = np.where((native[:,250:266]>1).any(axis=1))[0]
                rest_native = indices(member,17 if damage else 0)
                reference = np.where((rest_native[:,250:266]>1).any(axis=1))[0]
                shift = float(rows[-1]-reference[-1]) if len(rows) and len(reference) else 0
                if shift:
                    pixels=np.array(crane); pixels[142*density:193*density,257*density:266*density]=0;crane=Image.fromarray(pixels)
                    crane.alpha_composite(project_registered_master(f,sources[int(damage)],registrations[int(damage)],
                        [(257,142),(266,142),(266,193),(257,193)],
                        [(257,142),(266,142),(266,193+shift),(257,193+shift)]))
                image.alpha_composite(crane)
                f.put(member,n,f.snow(member,n,image),
                    'Complete native-owned mast and full boom/bearing/chain/hook; original idle, naval production and repair/docking schedules guide local hook travel; damaged master retained')
        tower=f.rectangle(masters[0],(108,51,188,206))
        for n in range(build['visibleFrames']):
            image=early.copy()
            if n>=9:image.alpha_composite(clip(telescope(f,tower,build,n,(137,0,164,206),65),ground))
            if n==build['visibleFrames']-1:image=masters[0].copy()
            f.put(build,n,f.snow(build,n,image),
                'Fixed original berth/crane foundation; native tower roof track above stationary tower walls; original trim, pier ownership and reverse selling retained')
        f.export()
