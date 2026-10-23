"""Native MCV deployment, fixed architecture, separate articulated production crane."""
import sys
import numpy as np
from scipy import ndimage
from PIL import Image
from production_common import ROOT, Family, row_for, resting, decode, indices, cells, clip
from mechanical_common import register_anchored, ground_plane, project_registered_master, articulate_raw_part
from construction_motion import telescope

output = sys.argv[1]
dry = row_for('YACNST')
production_source = next(m for m in dry['members'] if 'PRODUCTION' in m['roles'])
owner_indices = np.array([indices(production_source, n) for n in range(18)])
static = np.all(owner_indices == owner_indices[0], axis=0)
centers, previous = [], np.array([50., 124.])
for n in range(18):
    moving = (owner_indices[n] >= 16) & (owner_indices[n] <= 31) & ~static
    moving[:, 145:] = False
    labels, count = ndimage.label(moving, np.ones((3, 3)))
    choices = []
    for label in range(1, count + 1):
        y, x = np.where(labels == label)
        if len(x) >= 10:
            choices.append((len(x), np.array([x.mean(), y.mean()])))
    previous = min(choices, key=lambda p: np.linalg.norm(p[1] - previous) + 30 / (p[0] + 1))[1]
    centers.append(previous)

for theater in ('TEMPERATE', 'SNOW'):
    for density in (2, 4):
        f = Family('YACNST', theater, density, output)
        body, idle, production, active, build = f.row['members']
        original_source = ROOT / 'art-v1/YACNST-TEMPERATE/normal-raw.png'
        reference = f.register(Image.open(original_source), resting(dry).getbbox(), original_source)
        normal, normal_registration = register_anchored(f, ROOT / 'production-art-v1/YACNST/without-crane-raw.png', f.registrations[-1])
        open_bay, _ = register_anchored(f, ROOT / 'production-art-v1/YACNST/open-bay-raw.png', normal_registration)
        damage_source = ROOT / 'production-art-v1/YACNST/damaged-raw.png'
        f.register(Image.open(damage_source), resting(dry, True).getbbox(), damage_source)
        damaged, _ = register_anchored(f, ROOT / 'production-art-v1/YACNST/damaged-without-crane-raw.png', f.registrations[-1])
        part_source = ROOT / 'production-art-v1/YACNST/crane-parts-raw.png'
        gold_key, red_key, grabber_key = cells(part_source, 3)
        grabber = f.register(grabber_key[0], (35, 126, 50, 151), part_source, source_region=grabber_key[1])

        def crane(n):
            center = centers[n]
            elbow, wrist = center + (0, -7), center + (-2, 7)
            image = articulate_raw_part(f, part_source, gold_key[0], gold_key[1],
                [(836, 205), (351, 482)], [(75, 104), elbow], 190, 11)
            image.alpha_composite(articulate_raw_part(f, part_source, red_key[0], red_key[1],
                [(816, 643), (277, 852)], [elbow, wrist], 170, 8))
            image.alpha_composite(f.translate(grabber, dx=wrist[0] - 42, dy=wrist[1] - 132))
            return image

        idle_crane = crane(0)
        fork_region = [(179, 74), (198, 74), (201, 106), (190, 114), (180, 109)]
        for n in range(body['visibleFrames']):
            image = (normal if n == 0 else damaged).copy()
            fork = f.polygon(Image.new('RGBA', f.size, 'white'), fork_region).getchannel('A')
            image = clip(image, Image.fromarray(255 - np.array(fork)))
            f.put(body, n, f.snow(body, n, image),
                  'Same-canvas fixed architecture; separately owned crane and upper active fork excluded from static body')
        for n in range(idle['visibleFrames']):
            f.put(idle, n, f.snow(idle, n, idle_crane),
                  'Complete rest crane at fixed root with separate paired boom, owner-painted forearm and grabber')
        door = [(128, 145), (156, 153), (156, 178), (128, 169)]
        for n in range(production['visibleFrames']):
            phase = n if n < 18 else min(17, max(0, n - 19))
            image = f.blank()
            if 3 <= phase <= 14:
                # Opaque inner gates cover the closed shutter on the body.
                # Stationary floor and exterior edges remain body-owned.
                image.alpha_composite(f.polygon(open_bay, door))
            image.alpha_composite(crane(phase))
            f.put(production, n, f.snow(production, n, image),
                  'Native moving owner-index centroid controls articulated joints; fixed crane root; opaque open garage interior; stationary architecture is body-owned')
        for n in range(active['visibleFrames']):
            if n >= 6:
                image = decode(f.row, active, n).resize(f.size, Image.Resampling.NEAREST)
                operation = 'Retained native indexed control tail outside the normal/damaged active loops'
            else:
                image = f.rectangle(normal if n < 3 else damaged, (158, 75, 197, 124))
                pixels = np.array(image)
                native = np.array(decode(f.row, active, n))
                intensity = native[..., :3].max(axis=2)
                strength = np.array(Image.fromarray(intensity).resize(f.size, Image.Resampling.LANCZOS)) / 255
                y, x = np.indices(pixels.shape[:2])
                indicator = (x >= 187 * density) & (x < 197 * density) & (y >= 96 * density) & (y < 108 * density)
                highlight = indicator & (pixels[..., :3].min(axis=2) > 100)
                pixels[..., :3][highlight] = np.uint8(np.clip(pixels[..., :3][highlight].astype(float) * (.7 + .5 * strength[highlight, None]), 0, 255))
                image = Image.fromarray(pixels)
                operation = 'Correct native active member owns the upper fork, red rear panel and indicator; native brightness controls neutral indicator highlights; damaged fork uses the complete damaged master'
            f.put(active, n, f.snow(active, n, image), operation)
        key_source = ROOT / 'production-art-v1/YACNST/assembly-keys-raw.png'
        compact_key, middle_key = cells(key_source, 2)
        compact = f.register(compact_key[0], (76, 108, 177, 192), key_source, source_region=compact_key[1])
        middle = f.register(middle_key[0], (15, 94, 238, 228), key_source, source_region=middle_key[1])
        floor_source = ROOT / 'production-art-v1/YACNST/foundation-raw.png'
        floor = f.register(Image.open(floor_source), (15, 118, 238, 228), floor_source)
        floor_registration = f.registrations[-1]
        floor_plane = ground_plane(floor)
        left_machines = f.polygon(normal, [(15, 96), (80, 96), (80, 74), (149, 74),
            (149, 121), (125, 129), (121, 149), (113, 158), (78, 169), (76, 182), (15, 190)])
        spire = f.polygon(normal, [(177, 73), (202, 73), (202, 108), (193, 114), (182, 112), (177, 108)])
        garage = f.polygon(normal, [(125, 114), (193, 112), (239, 137), (239, 207), (127, 183)])
        for n in range(build['visibleFrames']):
            if n < 3:
                image = f.translate(compact, dy=(0, 1, 12)[n])
            elif n == 3:
                image = project_registered_master(f, floor_source, floor_registration,
                    [(15, 118), (238, 118), (238, 228), (15, 228)],
                    [(48, 130), (201, 130), (201, 216), (48, 216)])
                image.alpha_composite(f.translate(compact, dy=12))
            elif n < 16:
                image = floor.copy()
                if n < 6:
                    image.alpha_composite(f.translate(compact, dy=12))
                if n >= 5:
                    image.alpha_composite(clip(telescope(f, middle, build, n, (127,95,179,228), 18), floor_plane))
                image = clip(image, f.native_mask(build, n, expand=1))
            else:
                image = middle.copy()
                for part, region in [(garage, (132,110,188,228)),
                                     (left_machines, (52,70,101,190)), (spire, (180,20,196,125))]:
                    image.alpha_composite(clip(telescope(f, part, build, n, region, 14), floor_plane))
                if n >= 21:
                    image.alpha_composite(crane(round(np.interp(n, [21,25], [17,0]))))
                if n >= 23:
                    image = normal.copy()
                    image.alpha_composite(idle_crane)
            f.put(build, n, f.snow(build, n, image),
                  'Native compact MCV and unfolding floor; fixed facade/column surfaces under independently tracked roofs; crane unfolds at its actual shoulder and wrist instead of sliding through the building')
        f.export()
