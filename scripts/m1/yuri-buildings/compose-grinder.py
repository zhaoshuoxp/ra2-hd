"""Fixed grinder body, complete local crusher cradles and native electrical control."""
import sys
import numpy as np
from PIL import Image, ImageOps
from production_common import ROOT, Family, row_for, resting, cells, decode, indices, clip
from mechanical_common import register_anchored, ground_plane, project_registered_master
from construction_motion import telescope
from crusher_volume import solid_head

output = sys.argv[1]
dry = row_for('YAGRND')
key_source = ROOT / 'production-art-v1/YAGRND/assembly-keys-raw.png'
floor_key, folded_key = cells(key_source, 2)
module_sources = [ROOT / 'production-art-v1/YAGRND/crusher-keys-raw.png',
                  ROOT / 'production-art-v1/YAGRND/damaged-crusher-keys-raw.png']
module_keys = [cells(source, 2) for source in module_sources]
# Four complete local modules have constant mounting sockets. The source
# guide supplies the native open/intake/return schedule, not an HD body fit.
sockets = [(139, 83), (179, 83), (135, 106), (184, 106)]
rest_bounds = [(120, 58, 152, 88), (167, 58, 201, 88), (112, 82, 147, 112), (170, 82, 207, 112)]
rear_keys = [(0, 0), (6, 1), (9, .7), (14, -.9), (28, -.9), (34, .7), (40, 1), (47, 0)]
front_keys = [(0, 0), (6, .25), (9, .4), (14, -.8), (28, -.8), (34, .4), (40, .65), (47, 0)]

for theater in ('TEMPERATE', 'SNOW'):
    for density in (2, 4):
        f = Family('YAGRND', theater, density, output)
        body, idle, activity, build = f.row['members']
        normal_source = ROOT / 'art-v1/YAGRND-TEMPERATE/normal-raw.png'
        normal = f.register(Image.open(normal_source), resting(dry).getbbox(), normal_source)
        fixed, _ = register_anchored(f, ROOT / 'production-art-v1/YAGRND/without-crushers-raw.png', f.registrations[-1])
        damage_source = ROOT / 'production-art-v1/YAGRND/damaged-raw.png'
        damaged = f.register(Image.open(damage_source), resting(dry, True).getbbox(), damage_source)
        damaged_fixed, _ = register_anchored(f, ROOT / 'production-art-v1/YAGRND/damaged-without-crushers-raw.png', f.registrations[-1])
        floor = f.register(floor_key[0], (90, 108, 229, 181), key_source, source_region=floor_key[1])
        folded = f.register(folded_key[0], (90, 58, 229, 181), key_source, source_region=folded_key[1])
        ground = ground_plane(floor)
        stationary = [f.snow(body, 0, fixed), f.snow(body, 1, damaged_fixed)]
        parts = {}
        for damage in (False, True):
            for pose in (0, 1):
                key = module_keys[int(damage)][pose]
                source = module_sources[int(damage)]
                for side, bounds in enumerate(rest_bounds):
                    image = key[0] if side % 2 == 0 else ImageOps.mirror(key[0])
                    # Mirroring one complete symmetrical cradle defines the
                    # opposite socket; the raw source and density remain pinned.
                    part = f.register(image, bounds, source, source_region=key[1])
                    parts[damage, pose, side] = (part, f.registrations[-1])

        def crusher_group(phase, damage=False, spinning=False):
            image = f.blank()
            pieces = []
            for side, (bounds, socket) in enumerate(zip(rest_bounds, sockets)):
                keys = rear_keys if side < 2 else front_keys
                aperture = float(np.interp(phase, [k[0] for k in keys], [k[1] for k in keys]))
                part, registration = parts[damage, 0, side]
                x0, y0, x1, y1 = bounds
                w, h = x1 - x0, y1 - y0
                # Recover each cradle's horizontal inward axis from its actual
                # socket. A rigid world rotation changes all three face normals.
                dx, dy = 159 - socket[0], 94 - socket[1]
                inward = np.array([(dx + 2*dy)/2, 0., (-dx + 2*dy)/2])
                inward /= np.linalg.norm(inward)
                axis = np.array([inward[2], 0., -inward[0]])
                angle = np.deg2rad(-32*max(aperture, 0) + 48*max(-aperture, 0))
                cross = np.array([[0., -axis[2], axis[1]], [axis[2], 0., -axis[0]],
                                  [-axis[1], axis[0], 0.]])
                rotation = np.eye(3)*np.cos(angle) + (1-np.cos(angle))*np.outer(axis, axis) + np.sin(angle)*cross

                def pose(points, face_depth=None):
                    points = np.array(points, float)
                    u, v = points[:,0]-socket[0], points[:,1]-socket[1]
                    elevation = np.maximum(0, (y1-points[:,1])*0.85)
                    world = np.column_stack(((u+2*(v+elevation))/2, elevation, (-u+2*(v+elevation))/2))
                    if face_depth is not None:
                        # Camera-ray depth leaves the approved resting pixels
                        # unchanged, but gives the adjacent beam faces actual
                        # different normals before their rigid hinge rotation.
                        world += np.array(face_depth)[:,None] * np.array([1.,1.,1.])
                    turned = world @ rotation.T
                    screen = np.column_stack((turned[:,0]-turned[:,2],
                                              .5*(turned[:,0]+turned[:,2])-turned[:,1])) + socket
                    return screen, float(turned.sum(axis=1).mean())

                # The bolted deck and hinge housings are stationary. Each
                # strut is split into its visible faces, never a warped bitmap
                # of the complete spherical crusher and its mounting cradle.
                fixed = f.rectangle(part, (x0, y1-5, x1, y1))
                pieces.append((socket[1]-40, fixed))
                faces = [
                    [(x0+.08*w,y0+.35*h),(x0+.23*w,y0+.30*h),(x0+.40*w,y0+.84*h),(x0+.22*w,y0+.91*h)],
                    [(x0+.23*w,y0+.30*h),(x0+.30*w,y0+.36*h),(x0+.47*w,y0+.84*h),(x0+.40*w,y0+.84*h)],
                    [(x0+.65*w,y0+.31*h),(x0+.80*w,y0+.25*h),(x0+.96*w,y0+.76*h),(x0+.78*w,y0+.87*h)],
                    [(x0+.80*w,y0+.25*h),(x0+.87*w,y0+.32*h),(x0+.99*w,y0+.79*h),(x0+.96*w,y0+.76*h)],
                ]
                for face_index, quad in enumerate(faces):
                    face_depth = [3,3,3,3] if face_index%2 == 0 else [3,0,0,3]
                    target, depth = pose(quad, face_depth)
                    raw_quad = [(x0+x1-x,y) for x,y in quad] if side%2 else quad
                    face = project_registered_master(f, module_sources[int(damage)], registration, raw_quad, target)
                    pieces.append((socket[1]+depth*.15, face))
                # The toothed ball is volumetric: its silhouette retains its
                # diameter while its center follows the rigid hinge arc.
                ball = [(x0+.17*w,y0),(x0+.79*w,y0),(x0+.79*w,y0+.62*h),(x0+.17*w,y0+.62*h)]
                center = np.mean(ball, axis=0)
                moved, depth = pose([center])
                target = np.array(ball) + moved[0]-center
                raw_quad = [(x0+x1-x,y) for x,y in ball] if side%2 else ball
                sphere = project_registered_master(f, module_sources[int(damage)], registration, raw_quad, target)
                surface = np.array([(x0+.20*w,y0),(x0+.74*w,y0),
                                    (x0+.74*w,y0+.58*h),(x0+.20*w,y0+.58*h)])
                sphere = solid_head(f, sphere, surface + moved[0]-center, axis,
                                    rotation, phase if spinning else 0, side, damage)
                pieces.append((socket[1]+depth*.15+.01, sphere))
                f.local_parts.append({'kind': 'rigid-cradle-world-pose', 'socket': list(socket),
                    'phase': int(phase), 'axis': axis.tolist(), 'angleDegrees': float(np.rad2deg(angle)),
                    'rotation': rotation.tolist(), 'sphereDiameterScale': 1, 'wholeBuildingScale': [1,1]})
            for _, piece in sorted(pieces, key=lambda item: item[0]):
                image.alpha_composite(piece)
            return image

        for n in range(body['visibleFrames']):
            f.put(body, n, f.snow(body, n, fixed if n == 0 else damaged_fixed),
                  'Complete same-canvas fixed architecture and opaque grinding well; separately owned moving crusher modules excluded')
        for n in range(idle['visibleFrames']):
            # The original idle member is the small electrical well indicator;
            # its latter declared slots are native indexed control/shadows.
            native = indices(idle, n)
            if set(native.ravel()) <= {0, 1}:
                image = decode(f.row, idle, n).resize(f.size, Image.Resampling.NEAREST)
                operation = 'Retained native indexed control slot, with exact empty/zero extent contract'
            else:
                image = f.rectangle(fixed, (151, 79, 168, 101))
                pixels = np.array(image)
                strength = np.array(decode(f.row, idle, n).getchannel('A').resize(f.size, Image.Resampling.LANCZOS)) / 255
                metal = (pixels[..., 0] > pixels[..., 2] * 1.5) & (pixels[..., 1] > pixels[..., 2] * 1.3)
                pixels[..., :3][metal] = np.uint8(np.clip(pixels[..., :3][metal].astype(float) * (.7 + .7 * strength[metal, None]), 0, 255))
                image = Image.fromarray(pixels)
                operation = 'Native well electrical coverage/intensity on the complete photographed inner mechanism; owner material excluded from emission'
            f.put(idle, n, f.snow(idle, n, image), operation)
        for n in range(activity['visibleFrames']):
            damage = n >= 48
            phase = min(47, n - 49) if n >= 49 else 0 if n == 48 else n
            image = stationary[int(damage)].copy()
            # Snow on the stationary foundation stays fixed. Module deposits
            # follow their native pose; the electrical light then illuminates
            # both. Depositing snow after light erased the intensity ramp.
            image.alpha_composite(f.snow(activity, n, crusher_group(phase, damage, spinning=True)))
            # Retain the entire continuous native yellow floor-light ramp.
            # Its intensity controls light on authored metal, not sprite detail.
            native = np.array(decode(f.row, activity, n))
            y, x = np.indices(native.shape[:2])
            resting_native = np.array(decode(f.row, activity, 49 if damage else 0)).astype(float)
            gain = np.maximum(0, native[..., 1].astype(float) - resting_native[..., 1]) / 255
            gain *= (y >= 115) & (native[..., 3] > 0)
            light = np.array(Image.fromarray(np.uint8(gain * 255)).resize(f.size, Image.Resampling.BICUBIC), float) / 255
            pixels = np.array(image)
            pixels[..., :3] = np.uint8(np.clip(pixels[..., :3].astype(float) + light[..., None] * [155, 110, 12], 0, 255))
            pixels[..., :3][pixels[..., 3] == 0] = 0
            image = Image.fromarray(pixels)
            spark = (native[..., 0] > 190) & (native[..., 1] > 140) & (native[..., 2] < 60)
            spark &= ((y < 46) | ((x >= 143) & (x < 177) & (y >= 82) & (y < 112)))
            if spark.any():
                effect = np.zeros(native.shape, np.uint8)
                effect[spark] = native[spark]
                image.alpha_composite(Image.fromarray(effect).resize(f.size, Image.Resampling.BICUBIC))
            f.put(activity, n, image,
                  'Four fixed-socket cradles retain native hinge schedules; each solid sphere and 24 beveled cuboid teeth turn five revolutions about the transverse axle, with nearest-surface geometry occlusion and fixed camera light; normal/damaged HD brass, native floor light and particles retained')
        chimneys = [f.rectangle(fixed, bounds) for bounds in [(153, 48, 167, 77), (101, 78, 122, 98),
                    (201, 78, 224, 98), (152, 104, 168, 126)]]
        for n in range(build['visibleFrames']):
            image = floor.copy()
            if n >= 1:
                image.alpha_composite(clip(telescope(f,folded,build,n,(143,65,174,181),12),ground))
            if n >= 15:
                image = folded.copy()
                for part, bounds in zip(chimneys, [(153,48,167,181),(101,78,122,181),
                                                   (201,78,224,181),(152,104,168,181)]):
                    image.alpha_composite(telescope(f,part,build,n,bounds,5))
            if n >= 22:
                image.alpha_composite(crusher_group(round(np.interp(n,[22,26,29],[14,6,0]))))
            if n == build['visibleFrames'] - 1:
                image = fixed.copy()
                image.alpha_composite(crusher_group(0))
            f.put(build, n, f.snow(build, n, image),
                  'Fixed substrate and column material; native-driven rigid platform/chimney caps; crusher cradles unfold at their four actual sockets without translating the full intake image')
        f.export()
