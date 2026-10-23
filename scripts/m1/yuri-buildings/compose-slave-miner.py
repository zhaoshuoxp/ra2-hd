"""Native compact yaw keys, local outriggers/ramp, and four socketed tubes."""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage
from production_common import ROOT, Family, row_for, resting, decode, cells, clip
from mechanical_common import disjoint_parts, project_registered_master, register_anchored

output = sys.argv[1]
for theater in ('TEMPERATE', 'SNOW'):
    for density in (2, 4):
        f = Family('YAREFN', theater, density, output)
        body, idle, build = f.row['members']
        dry = row_for('YAREFN')
        normal_source = ROOT / 'art-v1/YAREFN-TEMPERATE/normal-raw.png'
        normal = f.register(Image.open(normal_source), resting(dry).getbbox(), normal_source)
        normal_registration = f.registrations[-1]
        damaged_source = ROOT / 'production-art-v1/YAREFN/damaged-raw.png'
        damaged = f.register(Image.open(damaged_source), resting(dry, True).getbbox(), damaged_source)
        deployed_source = ROOT / 'production-art-v1/YAREFN/deployed-chassis-raw.png'
        deployed, deployed_registration = register_anchored(f, deployed_source, normal_registration)

        # The compact chassis is a local mobile assembly before the foundation
        # locks. Authored yaw keys come from native frames 0/2/4/6/8, never from
        # shrinking the completed stationary building or its pipes/feet.
        compact = {}
        early_source = ROOT / 'production-art-v1/YAREFN/keys-raw.png'
        early = cells(early_source, 3)
        middle_source = ROOT / 'production-art-v1/YAREFN/chassis-middle-raw.png'
        middle = cells(middle_source, 3)
        for n, source, key in [(0, early_source, early[1]), (2, middle_source, middle[0]),
                               (4, middle_source, middle[1]), (6, middle_source, middle[2]),
                               (8, early_source, early[2])]:
            bounds = decode(dry, dry['members'][-1], n).getbbox()
            image = f.register(key[0], bounds, source, proportional=True, source_region=key[1])
            compact[n] = (image, source, f.registrations[-1], bounds)

        def quad(bounds):
            x0, y0, x1, y1 = bounds
            return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]

        feet = [[(3, 74), (22, 70), (24, 76), (11, 85), (3, 85)],
                [(19, 83), (36, 77), (39, 81), (30, 94), (19, 94)],
                [(38, 93), (56, 85), (60, 90), (50, 105), (38, 105)],
                [(84, 72), (101, 73), (102, 84), (91, 87), (83, 79)]]
        ramp = [(70, 80), (81, 77), (97, 96), (91, 104), (70, 92)]
        white = Image.new('RGBA', f.size, 'white')
        masks = [f.polygon(white, points).getchannel('A') for points in feet + [ramp]]
        parts = disjoint_parts(deployed, masks)
        chassis, local_feet, local_ramp = parts[0], parts[1:5], parts[5]
        labels, _ = ndimage.label(np.array(chassis.getchannel('A')) >= 128, np.ones((3, 3)))
        main = 1 + np.bincount(labels.ravel())[1:].argmax()
        chassis = clip(chassis, Image.fromarray(np.uint8(ndimage.binary_dilation(labels == main)) * 255))
        directions = [(5, -2), (4, -4), (4, -6), (-5, -2)]

        tube_bounds = [(50, 33, 59, 49), (35, 42, 43, 55),
                       (66, 42, 75, 56), (53, 51, 63, 65)]
        tubes = [f.rectangle(normal, bounds) for bounds in tube_bounds]
        yy = np.indices(f.size[::-1])[0]
        # Idle owns only the conveyor surface; its native two-phase control
        # remains a local belt translation inside a stationary ramp housing.
        belt = f.polygon(normal, [(78, 84), (83, 82), (94, 95), (90, 99)])
        belt_mask = belt.getchannel('A')
        for n in range(body['visibleFrames']):
            f.put(body, n, f.snow(body, n, normal if n == 0 else damaged),
                  'Fixed stationary four-socket chassis; complete damaged master; neutral turret is required separately')
        for n in range(idle['visibleFrames']):
            phase = f.translate(belt, dx=n * .7, dy=n * .6)
            image = local_ramp.copy()
            image.alpha_composite(clip(phase, belt_mask))
            f.put(idle, n, f.snow(idle, n, image),
                  'Native two-phase local conveyor movement; metal housing and four tube sockets remain stationary')
        for n in range(build['visibleFrames']):
            if n <= 8:
                key = n // 2 * 2
                image, source, registration, bounds = compact[key]
                if n != key:
                    target = decode(dry, dry['members'][-1], n).getbbox()
                    image = f.translate(image, dx=(target[0]+target[2]-bounds[0]-bounds[2])/2,
                                        dy=target[3]-bounds[3])
                image = image.copy()
            else:
                image = f.blank()
                fraction = min(1, (n - 8) / 4)
                for foot, direction in zip(local_feet, directions):
                    image.alpha_composite(f.translate(foot, dx=direction[0] * (1 - fraction), dy=direction[1] * (1 - fraction)))
                image.alpha_composite(chassis)
                # Complete conveyor rotates around its fixed upper hinge.
                bounds = (73, 78, 97, 103)
                target = np.array(quad(bounds), float)
                target[2:, 1] -= (1 - fraction) * 12
                target[2:, 0] -= (1 - fraction) * 5
                from mechanical_common import project_part
                image.alpha_composite(project_part(f, local_ramp, quad(bounds), target))
                extension = np.clip((n - 12) / 4, 0, 1)
                for tube, bounds in zip(tubes, tube_bounds):
                    dy = (bounds[3] - bounds[1]) * (1 - extension)
                    plane = Image.fromarray(np.uint8(yy < bounds[3] * density) * 255)
                    image.alpha_composite(clip(f.translate(tube, dy=dy), plane))
                if n == build['visibleFrames'] - 1:
                    image = normal.copy()
            f.put(build, n, f.snow(build, n, image),
                  'Native compact chassis yaw; local complete outriggers/conveyor deploy; four intact tubes emerge through fixed collars; exact final endpoint')
        f.export()
