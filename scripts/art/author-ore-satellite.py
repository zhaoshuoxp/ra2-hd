"""Author independent purifier and satellite construction parts in native world space."""
import argparse
import copy
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_dilation, distance_transform_edt
from scipy.spatial import ConvexHull

from buildup import native_indices, read, sha, write
from painted_rig import bounds, over, place, project_rgba, vector_coverage
from retained_idle import display

terminal = SourceFileLoader('terminal_author', 'scripts/art/author-terminal-alignment.py').load_module()
factory = SourceFileLoader('factory_author', 'scripts/art/author-war-factory.py').load_module()
helpers = terminal.helpers


def crop(image, points):
    return factory.crop_part(image, points)


def seed_rig(record, reference, output):
    seed = copy.deepcopy(record)
    seed['componentRig'] = {'nativeSourceSha256': sha(record['nativeSource']),
        'phases': [[] for _ in range(record['frames'])],
        'retainedIdleCompletion': {'frame': record['frames'] - 1,
            'reference': {'nativeReport': str(reference), 'sha256': sha(reference)}}}
    return helpers.Rig(seed, output), display(seed)


def clipped(rig, layer, phase):
    """Clamp interpolation fringe to the retained logical construction envelope."""
    x, y = rig.logical[phase]['trimOrigin']
    w, h = rig.logical[phase]['trimSize']
    envelope = np.zeros(layer.shape[:2], bool)
    envelope[y * 4:(y + h) * 4, x * 4:(x + w) * 4] = True
    layer = layer.copy()
    layer[~envelope] = 0
    return layer


def node(rig, layer, name, phase, source, method, **details):
    layer = clipped(rig, layer, phase)
    if not layer[..., 3].any():
        return None
    return factory.node(rig, layer, name, phase, source, method, **details)


def append(nodes, part):
    if part:
        nodes.append(part)


def hull(mask):
    points = np.column_stack(np.where(mask)[::-1])
    if len(points) < 3:
        return mask
    result = Image.new('1', (mask.shape[1], mask.shape[0]))
    ImageDraw.Draw(result).polygon([tuple(p) for p in points[ConvexHull(points).vertices]], fill=1)
    return np.asarray(result)


def guide_mask(rig, phase, region, owner=False):
    indices = native_indices(rig.raw, phase)
    y, x = np.indices(indices.shape)
    mask = ((indices >= 16) & (indices <= 31) if owner else indices > 0) & region(x, y)
    return mask


def uniform(image, canvas, target, width):
    scale = width / image.width
    return project_rgba(image, [[scale, 0, target[0] - image.width * scale / 2],
                               [0, scale, target[1] - image.height * scale]], canvas)


def purifier(record, assets, reference, output):
    rig, full = seed_rig(record, reference, output)
    yy, xx = np.mgrid[:full.shape[0], :full.shape[1]] / 4
    retained = {'family': record['newFamilyPath'], 'sha256': record['newFamilySha256']}
    # The whole-building atlas prematurely adds finished pipes. Its pixels
    # are never selected; use the independently authored empty component kit.
    kit_file = assets / 'gaorep-empty-kit-v1.png'
    kit = helpers.atlas(kit_file, (2, 1))
    master, core_image = kit[0], kit[1]
    source = {'image': str(kit_file), 'sha256': sha(kit_file)}
    closed_core = uniform(core_image, rig.canvas, (67, 137), 54)
    cap = terminal.masked(closed_core, yy < 113)
    cap = terminal.move(cap, dy=76 - bounds(cap[..., 3] > 0)[1] / 4)
    lower = terminal.masked(closed_core, yy >= 109)
    floor = uniform(master, rig.canvas, (65.5, 164), 127)
    # Finished peripheral ground remains exact; newly exposed empty ground
    # comes from the independently painted master under future machinery.
    core_region = terminal.polygon(full.shape, [(55, 85), (78, 85), (86, 94),
        (91, 103), (93, 120), (89, 130), (79, 135), (54, 135),
        (44, 128), (42, 119), (44, 105), (47, 96)])
    left_arm = terminal.polygon(full.shape, [(8, 105), (38, 92), (40, 120),
        (31, 123), (9, 124)])
    right_arm = terminal.polygon(full.shape, [(84, 87), (107, 88), (119, 103),
        (117, 118), (91, 116), (83, 105)])
    front_arm = terminal.polygon(full.shape, [(66, 118), (86, 117), (93, 156),
        (75, 158), (64, 135)])
    tubing = terminal.polygon(full.shape, [(18, 116), (38, 107), (94, 102),
        (112, 110), (118, 131), (101, 144), (45, 147), (20, 134)])
    machine = core_region | left_arm | right_arm | front_arm | tubing | (yy < 101)
    floor = terminal.masked(floor, yy >= 103)
    rgb = full[..., :3].astype(float)
    ground_color = (rgb[..., 0] > rgb[..., 2] * 1.08) & (rgb[..., 1] > rgb[..., 2] * 1.06)
    ground_color &= (np.ptp(rgb, axis=2) < 80)
    red_color = (rgb[..., 0] > rgb[..., 1] * 3) & (rgb[..., 0] > rgb[..., 2] * 3)
    blue_color = (rgb[..., 2] > rgb[..., 0] * 1.04) & (rgb[..., 2] > rgb[..., 1] * 1.02)
    peripheral = ground_color | ((rgb.mean(axis=2) < 70) & ((yy > 148) | (xx < 10) | (xx >= 118)))
    retained_ground = (~machine & ~red_color & ~blue_color & peripheral & (full[..., 3] > 0))
    floor = over(terminal.masked(full, retained_ground), floor)
    footprint = hull(retained_ground)
    floor = terminal.masked(floor, footprint)
    clean_core = terminal.masked(full, core_region & ~red_color & ~blue_color)
    foundation = node(rig, floor, 'fixed-empty-foundation', 3, source,
        'SHARED_WORLD_UV_AUTHORED_EMPTY_FLOOR_WITH_EXACT_RETAINED_PERIMETER')
    arm_file = assets / 'gaorep-arms-v1.png'
    arm_source = {'image': str(arm_file), 'sha256': sha(arm_file)}
    arm_poses = helpers.atlas(arm_file, (3, 2))
    phases = []
    for phase in range(record['frames']):
        if phase == 24:
            marker = np.zeros_like(full)
            x, y = rig.logical[phase]['trimOrigin']
            marker[y * 4:y * 4 + 1, x * 4:x * 4 + 1] = [0, 0, 0, 1]
            phases.append([node(rig, marker, 'retained-idle-marker', phase, retained, 'RETAINED_IDLE_PRESENTATION')])
            continue
        if phase == 23:
            phases.append([node(rig, full, 'complete-retained-initial-idle', phase, retained, 'EXACT_RETAINED_IDLE_COMPOSITE')])
            continue
        nodes = []
        if phase >= 3:
            nodes.append(copy.deepcopy(foundation))
        else:
            mask = hull(guide_mask(rig, phase, lambda x, y: y >= 115))
            layer = floor.copy()
            layer[..., 3] = np.minimum(layer[..., 3], vector_coverage(mask))
            append(nodes, node(rig, layer, 'deploying-foundation', phase, source, 'SHARED_WORLD_UV_DEPLOYMENT_CONTOUR'))
        drop = max(0, rig.logical[phase]['trimOrigin'][1] - 76)
        body = terminal.masked(lower, yy >= 109 + drop)
        append(nodes, node(rig, body, 'fixed-diameter-core-body', phase, source, 'FIXED_UV_BODY_REVEAL'))
        cap_layer = terminal.move(cap, dy=drop)
        if phase >= 8:
            cap_layer = over(terminal.masked(clean_core, (yy >= 89) & (yy < 109)),
                             terminal.masked(cap_layer, yy < 89))
        if phase >= 18:
            cap_layer = terminal.masked(cap_layer, yy >= 85)
        append(nodes, node(rig, cap_layer, 'rising-closed-core-cap', phase, source,
                           'RIGID_CAP_VERTICAL_TRANSLATION', nativeTranslation=[0, drop]))
        if phase >= 7:
            visible = core_region & ~front_arm & (yy >= 99) & (yy < 137)
            if phase == 7:
                visible &= yy < 108
            append(nodes, node(rig, terminal.masked(clean_core, visible), 'ignited-core-and-lower-shell', phase,
                retained, 'FIXED_FINISHED_CORE_RADIUS_AND_NATIVE_IGNITION_STAGE'))
        if 4 <= phase <= 11:
            pose = arm_poses[max(0, phase - 6)]
            pieces = helpers.split_components(pose)
            for i, piece in enumerate(pieces):
                if phase <= 7:
                    box = [68, 134, 79, 140]
                elif i == 0 and len(pieces) > 1:
                    mask = guide_mask(rig, phase, lambda x, y: x < 60, True)
                    box = bounds(mask)
                else:
                    mask = guide_mask(rig, phase, lambda x, y: (x >= 60) & (x < 86) & (y >= 112), True)
                    box = bounds(mask)
                if not box:
                    continue
                x0, y0, x1, y1 = box
                nodes.append(rig.rigid(piece, f'folding-red-arm-{i}', phase,
                    ((x0 + x1) / 2, y1), height=y1 - y0, anchor=(piece.width / 2, piece.height)))
        if phase >= 9:
            for name, region in [('right', right_arm), ('left', left_arm), ('front', front_arm)]:
                if name != 'right' and phase <= 11:
                    continue
                layer = terminal.masked(full, region)
                if phase < 19:
                    native = guide_mask(rig, phase,
                        lambda x, y: (x >= 83) if name == 'right' else (x < 60) if name == 'left' else (x >= 60) & (y >= 112), True)
                    coverage = vector_coverage(binary_dilation(hull(native), iterations=1))
                    layer[..., 3] = np.minimum(layer[..., 3], coverage)
                if phase < 20:
                    # Finished silver stripes belong to the later installation.
                    rgb = layer[..., :3].astype(float)
                    stripe_region = terminal.polygon(full.shape, [(74, 121), (79, 120), (88, 153), (82, 155)]).copy()
                    stripe_region |= terminal.polygon(full.shape, [(30, 96), (36, 94), (40, 97), (38, 101), (31, 99)])
                    stripe_region |= terminal.polygon(full.shape, [(91, 88), (99, 90), (106, 96), (98, 95)])
                    stripe = stripe_region | ((np.ptp(rgb, axis=2) < 55) & (rgb.mean(axis=2) > 150))
                    red = (rgb[..., 0] > rgb[..., 1] * 1.5) & (rgb[..., 0] > rgb[..., 2] * 1.5) & (layer[..., 3] > 128)
                    if red.any():
                        _, nearest = distance_transform_edt(~red, return_indices=True)
                        layer[stripe, :3] = layer[nearest[0][stripe], nearest[1][stripe], :3]
                append(nodes, node(rig, layer, f'deploying-{name}-arm', phase, retained,
                    'FIXED_WORLD_PART_TEXTURE_NATIVE_COMPONENT_DEPLOYMENT'))
        if phase >= 15:
            layer = terminal.masked(full, tubing & ~core_region & ~left_arm & ~right_arm & ~front_arm)
            if phase < 21:
                layer = terminal.masked(layer, (xx > {15:96, 16:91, 17:85, 18:76, 19:52, 20:28}[phase]) | (yy < 113))
            append(nodes, node(rig, layer, 'installing-fixed-section-tubing', phase, retained,
                'FIXED_RADIUS_TUBE_REVEAL_AT_NATIVE_INSTALLATION_STAGE'))
        if phase >= 18:
            chimney_region = (xx >= 55) & (xx < 78)
            chimney = terminal.masked(full, chimney_region & (yy < 76))
            dy = max(0, rig.logical[phase]['trimOrigin'][1] - 60)
            chimney = terminal.masked(terminal.move(chimney, dy=dy), yy < 85)
            shaft = terminal.masked(full, chimney_region & (yy >= 76 + dy) & (yy < 85))
            chimney = over(chimney, shaft)
            if phase >= 20:
                chimney = over(chimney, terminal.masked(full, chimney_region & (yy >= 84) & (yy < 88)))
            append(nodes, node(rig, chimney, 'extending-chimney', phase,
                retained, 'INDEPENDENT_RIGID_CHIMNEY_RISE', nativeTranslation=[0, dy]))
        phases.append(nodes)
    return finish(rig, phases, 'FIXED_CORE_RADIUS_SEPARATE_ARM_POSES_TUBING_AND_CHIMNEY')


def satellite(record, assets, reference, output):
    rig, full = seed_rig(record, reference, output)
    yy, xx = np.mgrid[:full.shape[0], :full.shape[1]] / 4
    retained = {'family': record['newFamilyPath'], 'sha256': record['newFamilySha256']}
    file = assets / 'gaspysat-temperate/02-painted-v1.png'
    source = {'image': str(file), 'sha256': sha(file)}
    poses = helpers.atlas(file, (3, 2))
    dish_image = crop(poses[0], [(.34, 0), (1, 0), (1, .47), (.93, .54), (.48, .53), (.33, .39)])
    support_images = [crop(poses[i], [(.49, .48), (.90, .48), (.86, .79),
        (.63, .81), (.54, .71)]) for i in range(5)]
    for i, image in enumerate(support_images):
        part = np.array(image)
        rgb = part[..., :3].astype(float)
        # The component atlas includes the red turntable rim below its steel
        # feet. That rim belongs to the fixed world foundation, not the rotor.
        part[(rgb[..., 0] > rgb[..., 1] * 1.4) & (rgb[..., 0] > rgb[..., 2] * 1.4)] = 0
        box = bounds(part[..., 3] >= 128)
        support_images[i] = Image.fromarray(part).crop(box)
    gray_head = crop(poses[0], [(.055, .35), (.29, .35), (.29, .49), (.055, .49)])
    rgb = full[..., :3].astype(float)
    red_ring = (rgb[..., 0] > rgb[..., 1] * 2) & (rgb[..., 0] > rgb[..., 2] * 2)
    base = terminal.masked(full, ((xx < 77) & (yy >= 80)) |
        ((xx >= 77) & ((yy >= 77) | ((yy >= 70) & red_ring))))
    fixed_base = node(rig, base, 'fixed-connected-circular-foundations', 4, retained, 'EXACT_RETAINED_WORLD_BASES')
    left_body = terminal.masked(full, (xx < 77) & (yy >= 51) & (yy < 82))
    upper_shaft = terminal.masked(full, (xx >= 49) & (xx < 65) & (yy >= 31) & (yy < 57))
    collar = terminal.masked(full, (xx < 76) & (yy >= 24) & (yy < 34))
    head_final = terminal.masked(full, (xx < 76) & (yy < 26))
    dish_region = terminal.polygon(full.shape, [(77, 35), (86, 22), (97, 16), (126, 16),
        (132, 20), (138, 40), (134, 52), (120, 59), (103, 62), (86, 56), (77, 45)])
    right_support = terminal.masked(full, (xx >= 80) & (yy >= 47) & (yy < 77) & ~dish_region)
    right_dish = terminal.masked(full, dish_region)
    dish_file = assets / 'gaspysat-dish-v1.png'
    dish_source = {'image': str(dish_file), 'sha256': sha(dish_file)}
    dish_poses = helpers.atlas(dish_file, (3, 1))
    phases = []
    for phase in range(record['frames']):
        if phase == 24:
            marker = np.zeros_like(full)
            x, y = rig.logical[phase]['trimOrigin']
            marker[y * 4:y * 4 + 1, x * 4:x * 4 + 1] = [0, 0, 0, 1]
            phases.append([node(rig, marker, 'retained-idle-marker', phase, retained, 'RETAINED_IDLE_PRESENTATION')])
            continue
        if phase >= 22:
            phases.append([node(rig, full, 'complete-retained-initial-idle', phase, retained, 'EXACT_RETAINED_IDLE_COMPOSITE')])
            continue
        nodes = []
        if phase >= 4:
            nodes.append(copy.deepcopy(fixed_base))
        else:
            dx = {0:-20, 1:-14, 2:-9, 3:-4}[phase]
            layer = terminal.move(terminal.masked(base, xx >= 77), dx=dx)
            if phase >= 1:
                left = terminal.move(terminal.masked(base, xx < 77), dx={1:13, 2:8, 3:2}[phase])
                mask = hull(guide_mask(rig, phase, lambda x, y: (x < 84) & (y >= 75)))
                left[..., 3] = np.minimum(left[..., 3], vector_coverage(mask))
                layer = over(left, layer)
            append(nodes, node(rig, layer, 'deploying-circular-foundations', phase, retained, 'FIXED_WORLD_BASE_DEPLOYMENT'))
        if phase >= 2:
            lower_drop = {2:16, 3:15, 4:15, 5:14, 6:13, 7:12, 8:11, 9:8, 10:5, 11:2}.get(phase, 0)
            layer = terminal.masked(terminal.move(left_body, dy=lower_drop), yy < 82)
            append(nodes, node(rig, layer, 'rising-left-lower-housing', phase, retained,
                'RIGID_LOWER_HOUSING_RISE_BEHIND_FIXED_BASE', nativeTranslation=[0, lower_drop]))
            head_top = {2:61, 3:56, 4:55, 5:55, 6:55, 7:54, 8:52, 9:49,
                10:46, 11:43, 12:41, 13:40, 14:40, 15:39, 16:33, 17:25, 18:18, 19:15, 20:13, 21:10}[phase]
            if phase <= 20:
                layer = uniform(gray_head, rig.canvas, (54, head_top + 14), 23)
                append(nodes, node(rig, layer, 'gray-antenna-folded-panel', phase, source, 'RIGID_FOLDED_PANEL_TRANSLATION'))
            if phase >= 16:
                drop = {16:20, 17:13, 18:7, 19:3}.get(phase, 0)
                shaft = terminal.masked(upper_shaft, yy >= 31 + drop)
                append(nodes, node(rig, shaft, 'fixed-radius-extending-column', phase, retained, 'FIXED_UV_TELESCOPING_COLUMN'))
                append(nodes, node(rig, terminal.move(collar, dy=drop), 'moving-upper-column-collar', phase,
                    retained, 'RIGID_COLUMN_COLLAR_TRANSLATION', nativeTranslation=[0, drop]))
            if phase == 21:
                append(nodes, node(rig, head_final, 'opening-left-antenna', phase, retained, 'RETAINED_MECHANICAL_HEAD_OPENING'))
        # Right dish lift and support rotation are separate physical parts.
        if phase >= 5:
            pose = 0 if phase <= 12 else min(phase - 12, 4)
            if phase >= 20:
                layer = right_support
            else:
                drop = {5:26, 6:15, 7:4}.get(phase, 0)
                layer = uniform(support_images[pose], rig.canvas, (111, 78 + drop), 39)
                layer = terminal.masked(layer, yy < 80)
            append(nodes, node(rig, layer, 'independent-rotating-dish-support', phase, source,
                'AUTHORED_RIGID_SUPPORT_POSE_WITH_FIXED_FOOT_CONTACT'))
        if phase <= 18:
            width = {0:33, 1:35, 2:37, 3:39, 4:40, 5:43, 6:46, 7:50, 8:56, 18:56}.get(phase, 58)
            bottom = {0:77, 1:78, 2:79, 3:80, 4:81, 5:81, 6:72, 7:61, 8:56, 18:54}.get(phase, 52)
            center = {0:92, 1:98, 2:103, 3:107}.get(phase, 110)
            layer = uniform(dish_image, rig.canvas, (center, bottom), width)
            append(nodes, node(rig, layer, 'opening-and-rising-parabolic-dish', phase, source,
                'INDEPENDENT_DISH_DIAMETER_AND_RIGID_LIFT'))
        elif phase <= 20:
            layer = uniform(dish_poses[0 if phase == 19 else 1], rig.canvas, (106, 60), 59)
            append(nodes, node(rig, layer, 'tilting-parabolic-dish', phase, dish_source, 'AUTHORED_PHYSICAL_DISH_ROTATION_POSE'))
        else:
            append(nodes, node(rig, right_dish, 'completed-parabolic-dish', phase, retained, 'EXACT_RETAINED_DISH_POSE'))
        phases.append(nodes)
    return finish(rig, phases, 'FIXED_BASES_INDEPENDENT_DISH_SUPPORT_AND_TELESCOPING_ANTENNA')


def finish(rig, phases, mechanism):
    result = rig.finish(phases)
    result.update(newConstructionArt=True,
        neutralMaterialProvenance='AUTHORED_COMPONENTS_AND_RETAINED_HD_RGB_NO_NATIVE_COLOR',
        architecturalMethod=mechanism, visualAcceptance='PENDING')
    for phase, nodes in enumerate(phases):
        canvas = np.zeros((rig.canvas[1] * 4, rig.canvas[0] * 4, 4), np.uint8)
        for part in nodes:
            canvas = over(place(Image.open(part['image']), part['box'], rig.canvas), canvas)
        Image.fromarray(canvas).save(rig.output / f'{phase:02}-preview.png')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('authoring', 'assets', 'temperate_reference', 'snow_reference', 'output'):
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    args.output.mkdir(exist_ok=False)
    rigs = {}
    for record in read(args.authoring)['families']:
        if record['identity'] not in ('GAOREP', 'GASPYSAT'):
            continue
        reference = args.snow_reference if record['theater'] == 'SNOW' else args.temperate_reference
        author = purifier if record['identity'] == 'GAOREP' else satellite
        rigs[record['key']] = author(record, args.assets, reference, args.output / record['key'])
    write(args.output / 'rigs.json', rigs)
    print('Four unselected purifier/satellite component candidates authored')


if __name__ == '__main__':
    main()
