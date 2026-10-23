"""Fixed stone-head assembly, independent buttresses, native electric control."""
import sys
import numpy as np
from PIL import Image
from production_common import ROOT, Family, row_for, resting, decode, clip, cells
from mechanical_common import disjoint_parts, ground_plane, project_part
from construction_motion import telescope, hinge

output = sys.argv[1]
for theater in ('TEMPERATE', 'SNOW'):
    for density in (2, 4):
        f = Family('YABRCK', theater, density, output)
        body, active, build = f.row['members']
        dry = row_for('YABRCK')
        source = ROOT / 'art-v1/YABRCK-TEMPERATE/normal-raw.png'
        normal = f.register(Image.open(source), resting(dry).getbbox(), source)
        damage_source = ROOT / 'production-art-v1/YABRCK/damaged-raw.png'
        damaged = f.register(Image.open(damage_source), resting(dry, True).getbbox(), damage_source)
        white = Image.new('RGBA', f.size, 'white')
        base_source = ROOT / 'production-art-v1/YABRCK/base-keys-raw.png'
        keys = cells(base_source, 2)
        foundation = f.register(keys[0][0], (1, 95, 121, 151), base_source, source_region=keys[0][1])
        base = f.register(keys[1][0], (1, 75, 121, 151), base_source, source_region=keys[1][1])
        head_source = ROOT / 'production-art-v1/YABRCK/head-module-raw.png'
        head = f.register(Image.open(head_source), (17, 31, 91, 125), head_source)
        polygons = [[(0, 132), (11, 93), (20, 75), (35, 78), (35, 135), (16, 144)],
                    [(72, 113), (89, 116), (101, 112), (115, 123), (122, 144), (98, 150), (72, 142)],
                    [(84, 74), (104, 74), (122, 103), (121, 125), (84, 122)]]
        masks = [f.polygon(white, points).getchannel('A') for points in polygons]
        base_remainder, left, stairs, back = disjoint_parts(base, masks)
        stairs = f.rectangle(stairs, (72, 114, 107, 144))
        head_plane = ground_plane(foundation)
        part_source = ROOT / 'production-art-v1/YABRCK/hoses-antennas-raw.png'
        authored_parts = cells(part_source, 7)
        front_keys = sorted([p for p in authored_parts if p[1][1] < 400], key=lambda p: p[1][0])
        rear_keys = sorted([p for p in authored_parts if p[1][1] > 800 and p[1][0] < 950], key=lambda p: p[1][0])
        rod_keys = sorted([p for p in authored_parts if p[1][1] > 500 and p[1][0] > 950], key=lambda p: p[1][0])
        assert (len(front_keys), len(rear_keys), len(rod_keys)) == (3, 2, 2)
        hose_bounds = [(7, 35, 35, 90), (12, 47, 33, 111), (24, 60, 37, 120),
                       (39, 22, 55, 48), (58, 25, 79, 56)]
        hoses = [f.register(key[0], bounds, part_source, source_region=key[1])
                 for key, bounds in zip(front_keys + rear_keys, hose_bounds)]
        mast_left, mast_back = [f.register(key[0], bounds, part_source, source_region=key[1])
                               for key, bounds in zip(rod_keys, [(25, 27, 27, 80), (78, 4, 80, 74)])]
        # The first bronze starter plate is an entire authored local floor
        # panel; its shape changes around its native installation socket.
        plate = f.rectangle(foundation, (15, 120, 43, 131))
        starter = project_part(f, plate, [(15, 120), (43, 120), (43, 131), (15, 131)],
                               [(39, 108), (56, 108), (56, 118), (39, 118)])

        def cap_y(n):
            a = np.array(decode(dry, dry['members'][-1], n))
            rgb = a[..., :3].astype(float)
            yy, xx = np.indices(a.shape[:2])
            gray = (rgb.min(axis=2) > 60) & (rgb.max(axis=2) - rgb.min(axis=2) < 40)
            selected = gray & (xx >= 30) & (xx < 74) & (yy > 22) & (yy < 109) & (a[..., 3] != 0)
            return np.where(selected)[0].min() if selected.any() else decode(dry, dry['members'][-1], n).getbbox()[1]

        final_cap = cap_y(build['visibleFrames'] - 1)
        for n in range(body['visibleFrames']):
            f.put(body, n, f.snow(body, n, normal if n == 0 else damaged),
                  'Fixed complete stone-head normal/damaged artwork; native shadow frames stay Original')
        # Native loops 0..6 / 8..14 use photographed glass and stone architecture.
        # Slots 16..31 are indexed shadow/control tail, never invented HD art.
        regions = [[(31, 76), (88, 76), (89, 119), (63, 128), (32, 110)],
                   [(86, 75), (103, 93), (103, 119), (85, 110)],
                   [(14, 105), (30, 100), (32, 132), (14, 140)],
                   [(29, 126), (76, 126), (76, 140), (29, 140)]]
        active_mask = f.blank()
        for points in regions:
            active_mask.alpha_composite(f.polygon(white, points))
        for n in range(active['visibleFrames']):
            if n >= 16:
                image = decode(f.row, active, n).resize(f.size, Image.Resampling.NEAREST)
                operation = 'Retained native indexed shadow/control tail; unused by the normal/damaged active loops'
            else:
                image = clip(normal if n < 8 else damaged, active_mask.getchannel('A'))
                pixels = np.array(image)
                native = np.array(decode(f.row, active, n))
                blue_control = (native[..., 2] > native[..., 0] * 1.3) & (native[..., 2] > native[..., 1] * 1.1)
                control = np.where(blue_control, native[..., 2] / 255, 0)
                control = np.array(Image.fromarray(np.uint8(control * 255)).resize(f.size, Image.Resampling.LANCZOS)) / 255
                blue = (pixels[..., 2] > pixels[..., 0] * 1.3) & (pixels[..., 2] > pixels[..., 1] * 1.1)
                intensity = .65 + .75 * control
                pixels[..., :3][blue] = np.uint8(np.clip(pixels[..., :3][blue].astype(float) * intensity[blue, None], 0, 255))
                image = Image.fromarray(pixels)
                operation = 'Native per-frame blue electrical intensity on authored glass; fixed stone, metal and owner paint excluded from emission'
            f.put(active, n, f.snow(active, n, image), operation)
        for n in range(build['visibleFrames']):
            if n == 0:
                image = starter.copy()
            else:
                image = foundation.copy()
                if n >= 8:
                    image.alpha_composite(base_remainder)
                if n >= 5:
                    image.alpha_composite(telescope(f, back, build, n, (89,70,112,151), 10))
                for hose, begin, finish in zip(hoses[3:], [19, 20], [23, 24]):
                    if n >= begin:
                        image.alpha_composite(clip(f.translate(hose, dy=max(0, finish - n) * 5), head_plane))
                if n >= 1:
                    image.alpha_composite(clip(f.translate(head, dy=max(0, cap_y(n) - final_cap)), head_plane))
                for part, begin, finish in [(left, 5, 14), (stairs, 18, 23)]:
                    if n >= begin:
                        bounds = (0,75,35,144) if part is left else (72,114,107,144)
                        image.alpha_composite(hinge(f, part, bounds, (n-begin)/(finish-begin), -1 if part is left else 1))
                if n >= 13:
                    image.alpha_composite(clip(f.translate(mast_left, dy=max(0, 16 - n) * 12), ground_plane(mast_left)))
                    image.alpha_composite(clip(f.translate(mast_back, dy=max(0, 16 - n) * 18), ground_plane(mast_back)))
                for hose, begin, finish in zip(hoses[:3], [8, 12, 14], [14, 17, 20]):
                    if n >= begin:
                        image.alpha_composite(clip(f.translate(hose, dy=max(0, finish - n) * 5), head_plane))
                if n >= 23:
                    image = normal.copy()
                if n <= 6:
                    # Native early pallet/ground coverage is occlusion data.
                    # It reveals the translated complete head and fixed floor
                    # panels without moving or fitting the finished building.
                    image = clip(image, f.native_mask(build, n, expand=1))
            f.put(build, n, f.snow(build, n, image),
                  'Native rigid stone-head rise; fixed floor; buttresses and stairs unfold about floor hinges, rear wall surfaces stay fixed below a native-driven roof; independent antenna/hoses')
        f.export()
