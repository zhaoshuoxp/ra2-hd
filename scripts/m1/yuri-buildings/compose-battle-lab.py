"""Fixed lab architecture, separately owned complete fork/blade and native highlights."""
import sys
import numpy as np
from PIL import Image, ImageDraw
from production_common import ROOT, Family, row_for, resting, cells, indices, decode, clip
from mechanical_common import ground_plane
from construction_motion import telescope, hinge

output = sys.argv[1]
dry = row_for('YATECH')
source = ROOT / 'production-art-v1/YATECH/native-active-parts-raw.png'
front_key, rear_key = cells(source, 2)
assembly = ROOT / 'production-art-v1/YATECH/assembly-keys-raw.png'
floor_key, lower_key = cells(assembly, 2)
for theater in ('TEMPERATE', 'SNOW'):
    for density in (2, 4):
        f = Family('YATECH', theater, density, output)
        body, active, build = f.row['members']
        normal_source = ROOT / 'art-v1/YATECH-TEMPERATE/normal-raw.png'
        damage_source = ROOT / 'production-art-v1/YATECH/damaged-raw.png'
        masters = [f.register(Image.open(p), resting(dry, bool(i)).getbbox(), p)
                   for i, p in enumerate([normal_source, damage_source])]
        front = f.register(front_key[0], (162, 99, 214, 190), source, source_region=front_key[1])
        rear = f.register(rear_key[0], (136, 15, 154, 62), source, source_region=rear_key[1])
        fixed = []
        for master in masters:
            rgba = np.array(master)
            mask = Image.new('L', f.size)
            ImageDraw.Draw(mask).polygon([(136*density, 14*density), (154*density, 14*density),
                (154*density, 62*density), (136*density, 62*density)], fill=255)
            rgba[..., 3][np.array(mask) > 0] = 0
            rgba[..., :3][rgba[..., 3] == 0] = 0
            fixed.append(Image.fromarray(rgba))
        floor = f.register(floor_key[0], (108, 178, 229, 226), assembly, source_region=floor_key[1])
        pallet = f.register(floor_key[0], (115,168,136,179), assembly, proportional=True, source_region=floor_key[1])
        lower = f.register(lower_key[0], (108, 99, 229, 226), assembly, source_region=lower_key[1])
        ground = ground_plane(floor)
        for n in range(body['visibleFrames']):
            f.put(body, n, f.snow(body, n, fixed[int(n != 0)]),
                'Fixed approved architecture, central tall spire and silver pipe; small rear active fork transferred to its native member')
        for n in range(active['visibleFrames']):
            native = indices(active, n)
            if set(native.ravel()) <= {0, 1}:
                image = decode(f.row, active, n).resize(f.size, Image.Resampling.NEAREST)
                operation = 'Retained native indexed control tail; exact slot and geometry'
            else:
                image = front.copy()
                image.alpha_composite(rear)
                # Original poses keep the same mechanical silhouettes. Native
                # changing metal faces control local highlights, never body fit.
                reference = np.array(decode(f.row, active, 33 if n >= 32 else 0)).astype(float)
                current = np.array(decode(f.row, active, n)).astype(float)
                delta = (current[..., :3].mean(axis=2) - reference[..., :3].mean(axis=2)) / 255
                delta = np.array(Image.fromarray(delta.astype('float32'), 'F').resize(f.size, Image.Resampling.BICUBIC))
                rgba = np.array(image); red, green, blue = np.moveaxis(rgba[..., :3].astype(float), 2, 0)
                neutral = red < np.maximum(green, blue) * 1.8
                rgba[..., :3] = np.uint8(np.clip(rgba[..., :3].astype(float) + (delta * neutral)[..., None] * 42, 0, 255))
                rgba[..., :3][rgba[..., 3] == 0] = 0
                image = Image.fromarray(rgba)
                operation = 'Complete isolated small rear fork and foreground dark crescent/ladder at native fixed roots; original metal-face phase controls local highlights; fixed silver pipe retained separately'
            f.put(active, n, f.snow(active, n, image), operation)
        spires = [f.rectangle(fixed[0], b) for b in [(129, 5, 168, 174), (176, 84, 213, 180)]]
        for n in range(build['visibleFrames']):
            image = pallet.copy() if n == 0 else floor.copy()
            if n >= 2:
                image.alpha_composite(clip(telescope(f, lower, build, n, (117,80,161,226), 14), ground))
            if n >= 5:
                for part, region, cap in zip(spires, [(134,0,155,226),(185,60,203,226)], [75,26]):
                    image.alpha_composite(clip(telescope(f,part,build,n,region,cap),ground))
            if n >= 19:
                image.alpha_composite(hinge(f,front,(162,99,214,190),(n-19)/5))
                image.alpha_composite(telescope(f,rear,build,n,(137,0,150,170),8))
            if n == build['visibleFrames'] - 1:
                image = fixed[0].copy(); image.alpha_composite(front); image.alpha_composite(rear)
            f.put(build, n, f.snow(build, n, image),
                'Native local roof/collar travel over fixed laboratory walls and tower columns; foreground crescent unfolds about its lower mount; independent upper fork; original reverse selling')
        f.export()
