"""Fixed foundation and complete orbiting tower parts at the native frame clock."""
import math
import sys
import numpy as np
from PIL import Image
from production_common import ROOT, Family, row_for, resting, cells, clip
from mechanical_common import articulate_raw_part, ground_plane, project_registered_master
from construction_motion import telescope

output = sys.argv[1]
dry = row_for('YAPSYT')
normal_source = ROOT / 'production-art-v1/YAPSYT/assembly-parts-raw.png'
damage_source = ROOT / 'production-art-v1/YAPSYT/damaged-parts-raw.png'
normal_keys = cells(normal_source, 5)
damage_keys = cells(damage_source, 4)
blade_key, dish_key, coil_key, hose_key, foundation_key = normal_keys
damaged_blade, damaged_dish, damaged_coil, damaged_hose = damage_keys

for theater in ('TEMPERATE', 'SNOW'):
    for density in (2, 4):
        f = Family('YAPSYT', theater, density, output)
        body, active, build = f.row['members']
        foundation = f.register(foundation_key[0], (95, 114, 146, 155), normal_source, source_region=foundation_key[1])
        foundation_registration = f.registrations[-1]
        # Fixed lower foot and piston never turn with the rotating head.
        damaged_master = ROOT / 'production-art-v1/YAPSYT/damaged-raw.png'
        damaged = f.register(Image.open(damaged_master), resting(dry, True).getbbox(), damaged_master)
        damaged_foundation = f.rectangle(damaged, (95, 114, 146, 155))
        dishes, blades, hoses = [], [], []
        for damaged_state in (False, True):
            source = damage_source if damaged_state else normal_source
            keys = (damaged_dish, damaged_blade, damaged_hose) if damaged_state else (dish_key, blade_key, hose_key)
            dish = f.register(keys[0][0], (95, 96, 146, 125), source, source_region=keys[0][1])
            dishes.append(dish)
            blades.append(f.register(keys[1][0], (114, 21 if damaged_state else 7, 127, 108), source, source_region=keys[1][1]))
            hoses.append(f.register(keys[2][0], (102, 74, 121, 103), source, source_region=keys[2][1]))
        for n in range(body['visibleFrames']):
            f.put(body, n, f.snow(body, n, foundation if n == 0 else damaged_foundation),
                  'Complete fixed ground foot and lower support; the upper dish, electrodes and fork are separately owned by the active member')

        def coil(theta, damage=False, emergence=0):
            key = damaged_coil if damage else coil_key
            source = damage_source if damage else normal_source
            x0, y0, x1, y1 = key[1]
            center_x = (x0 + x1) / 2
            bottom = np.array([120 + math.sin(theta) * 14, 103 + math.cos(theta) * 7])
            top = bottom + (math.sin(theta) * 4 if damage else 0, -53 if not damage else -48)
            image = articulate_raw_part(f, source, key[0], key[1],
                [(center_x, y1 - 8), (center_x, y0 + 8)], [bottom, top], x1 - x0, 9)
            if emergence:
                image = f.translate(image, dy=emergence)
            return image, bottom[1]

        def head(n, damage=False, construction=None):
            theta = n * 2 * math.pi / 26
            dish = dishes[int(damage)].copy()
            if construction is not None:
                dish = telescope(f,dish,build,construction,(111,78,130,147),7)
            draw_items = []
            for i in range(5):
                angle = theta + i * 2 * math.pi / 5
                rise = 0 if construction is None else max(0, [17, 24, 27, 29, 30][i] - construction) * 5
                begin = [8, 22, 24, 25, 26][i]
                if construction is None or construction >= begin:
                    image, depth = coil(angle, damage, rise)
                    if construction is not None:
                        image = clip(image, ground_plane(dishes[0]))
                    draw_items.append((depth, image))
            # Cylindrical electrodes orbit a fixed vertical axis. Rear coils
            # and complete gold hoses are drawn before the central fork.
            rear = [p for p in draw_items if p[0] <= 103]
            front = [p for p in draw_items if p[0] > 103]
            for _, part in sorted(rear, key=lambda p: p[0]):
                dish.alpha_composite(part)
            if construction is None or construction >= 22:
                dish.alpha_composite(hoses[int(damage)])
                dish.alpha_composite(f.translate(hoses[int(damage)], dx=18))
            if construction is None or construction >= 15:
                blade = blades[int(damage)]
                # The blade is a complete local vertical part. Its changing
                # projected width follows rotation without resizing the head.
                source = damage_source if damage else normal_source
                registration = next(r for r in f.registrations if r['source'] == str(source)
                    and r['sourceRegion'] == list((damaged_blade if damage else blade_key)[1]))
                bounds = (114, 21 if damage else 7, 127, 108)
                width = 13 * (.3 + .7 * abs(math.cos(theta)))
                displacement = math.sin(theta) * (6 if damage else 1)
                blade = project_registered_master(f, source, registration,
                    [(114, bounds[1]), (127, bounds[1]), (127, 108), (114, 108)],
                    [(120.5 - width / 2 + displacement, bounds[1]), (120.5 + width / 2 + displacement, bounds[1]),
                     (120.5 + width / 2, 108), (120.5 - width / 2, 108)])
                if construction is not None:
                    blade = clip(f.translate(blade, dy=max(0, 22 - construction) * 8), ground_plane(dishes[0]))
                dish.alpha_composite(blade)
            for _, part in sorted(front, key=lambda p: p[0]):
                dish.alpha_composite(part)
            return dish

        for n in range(active['visibleFrames']):
            image = head(n % 26, damage=n >= 26)
            f.put(active, n, f.snow(active, n, image),
                  'Complete photographed cylindrical electrodes orbit the fixed head axis at the native 26-frame rotation; independent complete fork projection and gold hoses; fixed lower foot remains unchanged')
        for n in range(build['visibleFrames']):
            if n == 0:
                image = project_registered_master(f, normal_source, foundation_registration,
                    [(110, 136), (133, 136), (133, 147), (110, 147)],
                    [(113, 138), (128, 138), (128, 146), (113, 146)])
            else:
                image = foundation.copy()
                if n <= 5:
                    image = clip(image, f.native_mask(build, n, expand=1))
                if n >= 7:
                    image.alpha_composite(clip(head(0, construction=n), ground_plane(foundation)))
            f.put(build, n, f.snow(build, n, image),
                  'Native ground starter and complete fixed foundation; local dish, first electrode, central fork and four remaining electrodes emerge through fixed socket occlusion; complete parts retained for reverse selling')
        f.export()
