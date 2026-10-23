"""Bio Reactor: fixed slab, rigid local vats/shaft and extending red supports."""
import sys
import numpy as np
from PIL import Image
from production_common import ROOT, Family, row_for, resting, decode, cells, clip
from mechanical_common import ground_plane, disjoint_parts
from construction_motion import telescope, hinge

output = sys.argv[1]
for theater in ('TEMPERATE', 'SNOW'):
    for density in (2, 4):
        f = Family('YAPOWR', theater, density, output)
        body, idle, active_a, active_b, build = f.row['members']
        dry = row_for('YAPOWR')
        source = ROOT / 'art-v1/YAPOWR-TEMPERATE/normal-raw.png'
        normal = f.register(Image.open(source), resting(dry).getbbox(), source)
        half_source = ROOT / 'feedback-r4/art-v3/reactor-half-full-raw.png'
        half = f.register(Image.open(half_source), resting(dry).getbbox(), half_source)
        key_source = ROOT / 'production-art-v1/YAPOWR/keys-raw.png'
        keys = cells(key_source, 3)
        damage = f.register(keys[0][0], resting(dry, True).getbbox(), key_source, source_region=keys[0][1])
        middle = f.register(keys[2][0], (45, 10, 124, 120), key_source, source_region=keys[2][1])
        floor_source = ROOT / 'production-art-v1/YAPOWR/foundation-raw.png'
        floor = f.register(Image.open(floor_source), (45, 79, 124, 119), floor_source)
        ground = ground_plane(floor)
        yy, xx = np.indices(f.size[::-1])
        masks = [
            f.polygon(Image.new('RGBA', f.size, 'white'), [(70, 88), (100, 88), (102, 100), (93, 108), (77, 107), (69, 98)]).getchannel('A'),
            f.polygon(Image.new('RGBA', f.size, 'white'), [(50, 35), (74, 35), (78, 83), (69, 93), (52, 89)]).getchannel('A'),
            f.polygon(Image.new('RGBA', f.size, 'white'), [(94, 35), (117, 35), (119, 89), (100, 93), (94, 83)]).getchannel('A'),
            f.polygon(Image.new('RGBA', f.size, 'white'), [(73, 43), (99, 43), (101, 90), (90, 99), (73, 91)]).getchannel('A'),
            f.rectangle(Image.new('RGBA', f.size, 'white'), (73, 0, 101, 25)).getchannel('A'),
        ]
        remainder, base, left, right, front, coil = disjoint_parts(normal, masks)
        # The shaft owns the remaining upper architecture, including hoses;
        # its extraction never duplicates vat caps or the lower red supports.
        shaft_mask = Image.fromarray(np.uint8(yy < 90 * density) * 255)
        shaft = clip(remainder, shaft_mask)
        final_floor = clip(remainder, Image.fromarray(255 - np.array(shaft_mask)))
        shaft_source = ROOT / 'production-art-v1/YAPOWR/shaft-raw.png'
        mid_shaft = f.register(Image.open(shaft_source), (69, 10, 101, 92), shaft_source)
        base_ground = ground_plane(base)
        for n in range(idle['visibleFrames']):
            glow = decode(f.row, idle, n).resize(f.size, Image.Resampling.LANCZOS)
            f.put(idle, n, glow, 'Native emissive control with full original intensity; not photographic or owner-painted material')

        glass = f.blank()
        for polygon in [
            [(54,47),(72,47),(75,54),(74,75),(64,79),(53,75),(52,54)],
            [(98,47),(113,47),(117,54),(116,75),(107,78),(97,75),(96,54)],
            [(79,54),(94,54),(98,63),(97,81),(87,86),(77,81),(75,63)],
        ]:
            glass.alpha_composite(f.polygon(half, polygon))

        def fluid_state(image, fraction):
            if fraction >= 1:
                return image.copy()
            result = image.copy()
            material = glass.copy()
            if image is damage:
                # Keep the damaged housing and dim only the glass material.
                pixels = np.array(material)
                pixels[..., :3] = np.uint8(pixels[..., :3] * .86)
                material = Image.fromarray(pixels)
            result.alpha_composite(material)
            return result

        for n in range(body['visibleFrames']):
            f.put(body, n, f.snow(body, n, fluid_state(normal if n == 0 else damage, .5)),
                  'Unoccupied normal/damaged reactor has half-full vats; occupied overlay owns the full liquid state')

        for member in (active_a, active_b):
            anim = next(a for a in f.row['animations'] if a['member'] == member['source']['member'])
            damaged_start = anim['damaged']['start']
            for n in range(member['visibleFrames']):
                image = normal if n < damaged_start else damage
                native = np.array(decode(f.row, member, n))
                vat_rgb = native[40:92, 52:118, :3].astype(float)
                liquid = (vat_rgb[..., 0] > 100) & (vat_rgb[..., 1] > 75) & (vat_rgb[..., 2] < vat_rgb[..., 0] * .72)
                mean = vat_rgb[..., :2][liquid].mean() if liquid.any() else 0
                fraction = .5 if member is active_a else 1
                image = fluid_state(image, fraction)
                a = np.array(image)
                rgb = a[..., :3].astype(float)
                light = (rgb[..., 0] > 140) & (rgb[..., 1] > 105) & (rgb[..., 2] < rgb[..., 0] * .78)
                light &= (yy >= 47 * density) & (yy <= 77 * density) & (xx >= 53 * density) & (xx <= 117 * density)
                rgb[light] *= np.clip(mean / 151, .70, 1.10)
                a[..., :3] = np.uint8(np.clip(rgb, 0, 255))
                f.put(member, n, f.snow(member, n, Image.fromarray(a)),
                      'Native active A/B occupancy selects half/full liquid; native phase controls light intensity only; fixed housings and owner paint')

        # Track native cap material in the left local vat window, not the
        # complete building envelope. This captures its rise and short settling.
        cap_y = []
        for n in range(build['visibleFrames']):
            a = np.array(decode(dry, dry['members'][-1], n))
            rgb = a[..., :3].astype(float)
            cap = (rgb.min(axis=2) > 155) & (rgb.max(axis=2) - rgb.min(axis=2) < 80) & (a[..., 3] != 0)
            y, x = np.where(cap[20:91, 52:76])
            cap_y.append(float(y.min() + 20) if len(y) else 88)
        for n in range(build['visibleFrames']):
            image = floor.copy() if n < 19 else final_floor.copy()
            if n >= 5:
                module = mid_shaft if n < 19 else shaft
                image.alpha_composite(clip(telescope(f, module, build, n, (77, 10, 96, 119), 16), ground))
            if n >= 1:
                fraction = .5 * np.clip((n - 4) / 5, 0, 1)
                vats = fluid_state(normal, fraction)
                vat_parts = disjoint_parts(vats, masks)[2:5]
                for vat, window in zip(vat_parts, [(52,20,73,119), (98,20,115,119), (78,27,95,119)]):
                    image.alpha_composite(telescope(f, vat, build, n, window, 10))
            if n >= 13:
                image.alpha_composite(hinge(f, base, (69,88,102,108), (n-13)/5))
            if n >= 19:
                image.alpha_composite(telescope(f, coil, build, n, (78,0,95,90), 5))
            if n == build['visibleFrames'] - 1:
                image = fluid_state(normal, .5)
            f.put(build, n, f.snow(build, n, image),
                  'Fixed slab and vat walls; rigid caps follow native local travel while glass walls extend below them; half-full construction endpoint; supports unfold at fixed hinges')
        f.export()
