"""Assemble War Factory construction from independently registered HD parts."""
import argparse
import copy
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_fill_holes
from scipy.spatial import ConvexHull

from buildup import native_indices, read, sha, write
from painted_rig import bounds, over, place, vector_coverage, project_rgba

terminal = SourceFileLoader('terminal_author', 'scripts/art/author-terminal-alignment.py').load_module()
helpers = terminal.helpers


def crop_part(image, polygon):
    array = np.asarray(image.convert('RGBA')).copy()
    matte = Image.new('1', image.size)
    ImageDraw.Draw(matte).polygon([(round(x * image.width), round(y * image.height))
                                  for x, y in polygon], fill=1)
    array[~np.asarray(matte)] = 0
    box = bounds(array[..., 3] >= 128)
    assert box, polygon
    return Image.fromarray(array).crop(box)


def node(rig, layer, name, phase, source, method, **details):
    return terminal.save_part(rig, layer, name, phase, source, method, **details)


def native_surface(rig, phase, region, predicate=None):
    indices = native_indices(rig.raw, phase)
    colors = np.asarray(rig.record['palette'])[indices].astype(float)
    yy, xx = np.indices(indices.shape)
    mask = (indices > 0) & region(xx, yy)
    if predicate:
        mask &= predicate(colors)
    return mask


def interior_planes(image, canvas):
    """Project only planar interior faces, independently of the outer arch."""
    definitions = [
        ([(0, .58), (.33, .43), (1, .84), (.6, 1)],
         [(191, 180), (203, 172), (225, 185), (211, 196)]),
        ([(.35, .1), (1, .52), (1, .84), (.33, .43)],
         [(203, 163), (224, 172), (225, 185), (203, 172)]),
        ([(.35, .1), (0, .34), (0, .58), (.33, .43)],
         [(203, 163), (191, 175), (191, 180), (203, 172)])]
    result = np.zeros((canvas[1]*4, canvas[0]*4, 4), np.uint8)
    patch = image.crop((round(image.width*.12), round(image.height*.36),
                        round(image.width*.30), round(image.height*.46)))
    result = place(patch, (184, 152, 232, 202), canvas)
    for source, target in definitions:
        vertices = np.asarray(source) * image.size
        matrix = np.linalg.lstsq(np.column_stack([vertices, np.ones(4)]), target, rcond=None)[0].T
        matte = Image.new('1', image.size)
        ImageDraw.Draw(matte).polygon([tuple(v) for v in vertices], fill=1)
        array = np.array(image)
        array[~np.asarray(matte)] = 0
        face = project_rgba(Image.fromarray(array), matrix, canvas)
        result = over(terminal.masked(face, terminal.polygon(result.shape, target)), result)
    return result


def clip_ground(rig, master, phase):
    # The changing deployment contour reveals a single fixed world texture;
    # native palette values classify geometry, never supply output material.
    mask = native_surface(rig, phase, lambda x, y: y >= 115,
        lambda c: (c[..., 0] > c[..., 2] * 1.10) & (c[..., 1] > c[..., 2] * 1.06)
                  & (c[..., 0] - c[..., 1] < 65))
    mask &= native_indices(rig.raw, phase) > 31
    points = np.column_stack(np.where(mask)[::-1])
    hull = points[ConvexHull(points).vertices]
    matte = Image.new('1', (mask.shape[1], mask.shape[0]))
    ImageDraw.Draw(matte).polygon([tuple(p) for p in hull], fill=1)
    mask = np.asarray(matte)
    layer = master.copy()
    layer[..., 3] = np.minimum(layer[..., 3], vector_coverage(mask))
    x, y = rig.logical[phase]['trimOrigin']
    w, h = rig.logical[phase]['trimSize']
    envelope = np.zeros(layer.shape[:2], bool)
    envelope[y*4:(y+h)*4, x*4:(x+w)*4] = True
    layer[~envelope] = 0
    layer[layer[..., 3] == 0] = 0
    return layer


def author(record, assets, reference, output):
    seed = copy.deepcopy(record)
    seed['componentRig'] = {'nativeSourceSha256': sha(record['nativeSource']),
                           'phases': [[] for _ in range(record['frames'])]}
    rig = helpers.Rig(seed, output)
    family = read(record['newFamilyPath'])
    full = terminal.render_member(record, family['members'][0])
    yy, xx = np.mgrid[:full.shape[0], :full.shape[1]] / 4
    original = {'family': record['newFamilyPath'], 'sha256': record['newFamilySha256']}
    painted = lambda name: {'image': str(assets / name), 'sha256': sha(assets / name)}
    early = helpers.atlas(assets / 'gaweap-folding-tower-01-09-v1.png')
    late = helpers.atlas(assets / 'gaweap-tower-10-18-v2.png')
    braces = helpers.atlas(assets / 'gaweap-left-brace-10-18-v1.png')
    entrance = helpers.atlas(assets / 'gaweap-entrance-08-13-v1.png', (3, 2))
    ground = helpers.atlas(assets / 'gaweap-ground-foundation-v1.png', (1, 1))[0]
    bay = helpers.atlas(assets / 'gaweap-open-bay-v1.png', (1, 1))[0]
    unlit = helpers.atlas(assets / 'gaweap-dark-entrance-interior-v1.png', (1, 1))[0]
    ground_master = place(ground, (50, 115, 252, 214), rig.canvas)
    # The interior and its crates are construction-only; completed roof texels
    # cannot replace this exposed surface. Entrance attachment is independent.
    bay_master = place(bay, (97, 120, 242, 210), rig.canvas)
    bay_region = terminal.polygon(full.shape, [(98, 149), (149, 121), (221, 158),
                                              (188, 185), (172, 190)]) & (xx+yy*1.25 < 401)
    roof_region = terminal.polygon(full.shape, [(106, 129), (148, 109), (217, 147),
                                               (206, 187), (111, 152)])
    walls = terminal.polygon(full.shape, [(77, 105), (95, 113), (105, 135), (103, 144),
        (82, 151), (77, 144)]) | terminal.polygon(full.shape,
        [(119, 87), (138, 96), (140, 109), (134, 130), (119, 138), (118, 123)])
    boiler = terminal.polygon(full.shape, [(97, 97), (115, 94), (124, 101), (124, 121),
                                          (117, 139), (100, 143), (97, 128)])
    aux = terminal.polygon(full.shape, [(88, 142), (100, 141), (110, 147),
                                       (110, 160), (102, 167), (88, 164), (85, 155)])
    aux_cap = aux & (yy < 155)
    aux_body = aux & ~aux_cap
    rgb = full[..., :3].astype(float)
    aux_layer = terminal.masked(full, aux & ~(rgb[..., 0] > np.maximum(rgb[..., 1], rgb[..., 2])*1.45))
    arch = terminal.polygon(full.shape, [(196, 142), (214, 143), (229, 158),
        (231, 183), (226, 191), (216, 191), (211, 172), (205, 157), (190, 170),
        (187, 195), (177, 200), (173, 182), (181, 160)])
    inside = terminal.polygon(full.shape, [(191, 180), (202, 165), (214, 161),
        (224, 172), (226, 186), (211, 196), (195, 193)])
    colors = full[..., :3].astype(float)
    lit_floor = ((xx >= 184) & (xx < 232) & (yy >= 152) & (yy < 202)
        & (colors[..., 1] > 40) & (colors[..., 0] > colors[..., 1]*1.14)
        & (colors[..., 1] > colors[..., 2]*1.28) & (full[..., 3] >= 128))
    inside = binary_fill_holes(inside | lit_floor)
    feet = (yy >= 170) & ~arch & ~roof_region & ~inside
    left_brace = terminal.polygon(full.shape, [(66, 126), (83, 131), (79, 151),
                                               (76, 157), (64, 155)])
    flag = (xx >= 99) & (xx <= 117) & (yy < 103)
    warm = record['theater'] == 'TEMPERATE'
    phases = []
    stable_walls = None
    stable_ground = None
    dark_interior = None
    for phase in range(record['frames'] - 1):
        nodes = []
        if phase >= 13 and stable_ground:
            nodes.append(copy.deepcopy(stable_ground))
        else:
            floor = clip_ground(rig, ground_master, phase)
            if phase == 13:
                # Folded exterior sheets can extend the native frame to the
                # left of the physical slab. Keep the deployed foundation in
                # the shared ground envelope of all subsequent assembly poses.
                future = rig.logical[13:23]
                x0 = max(f['trimOrigin'][0] for f in future)
                y0 = max(f['trimOrigin'][1] for f in future)
                x1 = min(f['trimOrigin'][0]+f['trimSize'][0] for f in future)
                y1 = min(f['trimOrigin'][1]+f['trimSize'][1] for f in future)
                floor = terminal.masked(floor, (xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1))
            if floor[..., 3].any():
                ground_node = node(rig, floor, 'world-fixed-foundation', phase,
                    painted('gaweap-ground-foundation-v1.png'), 'FIXED_WORLD_UV_NATIVE_DEPLOYMENT_CONTOUR')
                nodes.append(ground_node)
                if phase == 13:
                    stable_ground = ground_node
        if 1 <= phase <= 7:
            image = early[phase - 1]
            # Remove both auxiliary circles from the folding wall group. Their
            # heights and world centers are controlled as separate cylinders.
            image = crop_part(image, [(0, 0), (1, 0), (1, .66), (.70, .78),
                                      (.44, .91), (0, .83)]) if phase >= 2 else image
            if phase >= 2:
                array = np.array(image)
                py, px = np.indices(array.shape[:2])
                array[((px < image.width*.56) & (py > image.height*.72))
                      | (py > image.height*.89)] = 0
                image = Image.fromarray(array).crop(bounds(array[..., 3] >= 128))
            mask = native_surface(rig, phase, lambda x, y: (x < 139) & (y < 149),
                lambda c: (np.max(c, axis=2) - np.min(c, axis=2) < 38)
                          | (c[..., 0] > np.maximum(c[..., 1], c[..., 2]) * 1.5))
            box = bounds(mask)
            x0, y0, x1, y1 = box
            nodes.append(rig.rigid(image, 'unfolding-tower-walls', phase,
                ((x0 + x1) / 2, y1), height=y1-y0,
                anchor=(image.width / 2, image.height)))
        if phase >= 8:
            if stable_walls is None:
                # Hidden early wall surfaces come from the authored open tower;
                # physically exposed finished wall faces remain exact HD texels.
                image = crop_part(early[8], [(0, 0), (.69, 0), (.74, .74),
                                             (.50, .86), (0, .78)])
                array = np.array(image)
                py, px = np.indices(array.shape[:2])
                array[(px < image.width*.60) & (py > image.height*.72)] = 0
                image = Image.fromarray(array).crop(bounds(array[..., 3] >= 128))
                stable_walls = rig.rigid(image, 'fixed-authored-open-tower', phase,
                    (103, 147), height=64, anchor=(image.width / 2, image.height))
            nodes.append(copy.deepcopy(stable_walls))
            if phase >= 20:
                nodes.append(node(rig, terminal.masked(full, walls), 'retained-fixed-tower-faces',
                    phase, original, 'EXACT_FINISHED_WORLD_COORDINATES'))
            plate_image = crop_part(early[8] if phase < 10 else late[min(phase-10, 8)],
                [(.66, 0), (1, 0), (1, .48), (.65, .56)])
            # Phase 10's atlas omitted its plate. Reuse the preceding complete
            # plate and project only this flat hinged sheet into its new pose.
            if phase == 10:
                plate_image = crop_part(early[8], [(.66, 0), (1, 0), (1, .48), (.65, .56)])
            plate_boxes = [(136, 106, 151, 119), (136, 101, 151, 117),
                           (134, 90, 151, 107), (134, 87, 149, 106),
                           (134, 85, 148, 104), (133, 83, 146, 103),
                           (132, 81, 146, 103), (131, 81, 145, 103),
                           (131, 82, 144, 105), (130, 83, 142, 107),
                           (129, 84, 140, 109), (128, 84, 139, 110)]
            if phase < 20:
                box = plate_boxes[min(phase-8, 11)]
                dy = max(0, rig.logical[phase]['trimOrigin'][1]-box[1])
                box = (box[0], box[1]+dy, box[2], box[3]+dy)
                nodes.append(rig.rectangle(plate_image, 'right-hinged-red-plate', phase,
                    box, 'PROJECTION_OF_SEPARATE_FLAT_HINGED_SHEET'))
            else:
                nodes.append(node(rig, terminal.masked(full, walls), 'completed-right-wing',
                    phase, original, 'EXACT_FINISHED_WORLD_COORDINATES'))
        if phase >= 2:
            drop = {2: 17, 3: 13, 4: 7}.get(phase, 0)
            cap = terminal.move(terminal.masked(aux_layer, aux_cap), dy=drop)
            body = terminal.masked(aux_layer, aux_body & (yy >= 155+drop))
            nodes.append(node(rig, over(cap, body), 'front-auxiliary-cylinder', phase,
                original, 'FIXED_CYLINDER_WALL_WITH_TRANSLATING_COMPLETE_CAP', nativeTranslation=[0, drop]))
        if phase >= 4:
            # The small rear disk belongs to its own fixed mounting point.
            disk = terminal.move(terminal.masked(aux_layer, aux_cap), dx=54, dy=-26)
            if phase < 8:
                disk = terminal.move(disk, dx={4: -8, 5: -5, 6: -3, 7: -1}[phase],
                                     dy={4: 15, 5: 12, 6: 7, 7: 3}[phase])
            nodes.append(node(rig, disk, 'rear-auxiliary-cap', phase, original,
                'RIGID_DISK_ON_NATIVE_DEPLOYING_MOUNT'))
        if phase >= 6:
            interior = terminal.masked(bay_master, bay_region)
            if phase < 12:
                # Rails and crates appear before the white interior surface.
                rgb = interior[..., :3].astype(float)
                bright = (rgb.min(axis=2) > 120) & (np.ptp(rgb, axis=2) < 45)
                interior = terminal.masked(interior, ~bright)
            nodes.append(node(rig, interior, 'open-interior-and-crates', phase,
                painted('gaweap-open-bay-v1.png'), 'FIXED_ARCHITECTURAL_INTERIOR_WITH_PHASE_VISIBILITY'))
        if 8 <= phase <= 12:
            image = entrance[phase-8]
            boxes = [(189, 154, 226, 195), (184, 151, 228, 198),
                     (177, 151, 231, 204), (176, 145, 232, 202), (173, 142, 232, 203)]
            x0, y0, x1, y1 = boxes[phase-8]
            nodes.append(rig.rigid(image, 'unfolding-entrance-arch', phase,
                ((x0+x1)/2, y1), width=x1-x0, anchor=(image.width/2, image.height)))
        elif phase >= 13:
            if phase < 21:
                if dark_interior is None:
                    layer = interior_planes(unlit, rig.canvas)
                    dark_interior = node(rig, terminal.masked(layer, inside),
                        'fixed-unlit-entrance-interior', phase,
                        painted('gaweap-dark-entrance-interior-v1.png'),
                        'OPAQUE_DARK_INTERIOR_REPLACES_BACKGROUND_OR_GROUND_LEAK')
                nodes.append(copy.deepcopy(dark_interior))
            else:
                nodes.append(node(rig, terminal.masked(full, inside), 'illuminated-entrance-interior',
                    phase, original, 'EXACT_FINISHED_ILLUMINATION_AFTER_NATIVE_ROOF_CLOSURE'))
            arch_layer = terminal.masked(full, arch & ~inside if phase < 21 else arch)
            nodes.append(node(rig, arch_layer, 'fixed-complete-entrance-arch',
                phase, original, 'EXACT_FINISHED_ARCH_AND_FOUNDATION_CONTACT'))
        if phase >= 9:
            if phase < 19:
                image = braces[min(max(phase-10, 0), 8)]
                height = {9:10, 10:14, 11:18, 12:23, 13:26, 14:30,
                          15:31, 16:32, 17:32, 18:32}[phase]
                nodes.append(rig.rigid(image, 'left-folding-brace', phase, (70, 157),
                    height=height, anchor=helpers.lower_pivot(image)))
            else:
                nodes.append(node(rig, terminal.masked(full, left_brace), 'fixed-left-brace',
                    phase, original, 'EXACT_FINISHED_BRACE_AND_WORLD_FOOT'))
        if phase >= 15:
            # No complete future boiler is borrowed from phase15's bad atlas.
            # Its real cap rises while the fixed-height body is revealed below.
            drop = {15: 35, 16: 25, 17: 15, 18: 7}.get(phase, 0)
            cap_mask = boiler & (yy < 111)
            cap = terminal.move(terminal.masked(full, cap_mask), dy=drop)
            if phase < 17:
                flat_cap = terminal.move(terminal.masked(aux_layer, aux_cap), dx=11, dy=-42)
                cap = terminal.move(flat_cap, dy=drop)
            body = terminal.masked(full, boiler & (yy >= 111+drop))
            nodes.append(node(rig, over(cap, body), 'telescoping-central-boiler', phase,
                original, 'RIGID_CAP_TRANSLATION_AND_FIXED_RADIUS_CYLINDER_REVEAL', nativeTranslation=[0, drop]))
        if phase >= 20:
            nodes.append(node(rig, terminal.masked(full, flag), 'completed-mast-and-flag',
                phase, original, 'EXACT_FINISHED_MAST'))
            nodes.append(node(rig, terminal.masked(full, feet), 'pipes-footings-and-ramp',
                phase, original, 'EXACT_FINISHED_GROUND_ATTACHMENTS'))
        if phase >= 21:
            roof = native_surface(rig, phase, lambda x, y: (x >= 103) & (x <= 218)
                & (y >= 108) & (y < 186), lambda c: (c[..., 2] >= c[..., 0]*.94)
                & (c[..., 2] > 115))
            roof_mask = vector_coverage(binary_fill_holes(roof)) > 0
            layer = terminal.masked(full, roof_region & roof_mask)
            nodes.append(node(rig, layer, 'closing-fixed-roof-panels', phase, original,
                'FINISHED_CURVED_ROOF_REVEALED_BY_NATIVE_ROLLING_PANEL_GEOMETRY'))
        if not warm and phase >= 20:
            snow_ground = (yy >= 155) & ~roof_region & ~bay_region & ~inside
            nodes.append(node(rig, terminal.masked(full, snow_ground), 'retained-snow-ground-attachments',
                phase, original, 'EXACT_THEATER_SPECIFIC_FINISHED_LOWER_ARCHITECTURE'))
        if phase == 23:
            nodes = [node(rig, full, 'completed-retained-main', phase, original,
                          'EXACT_FINISHED_ARCHITECTURE_BEFORE_INITIAL_IDLE')]
        phases.append(nodes)
    marker = output / '24-retained-idle-marker.png'
    Image.new('RGBA', (4, 4)).save(marker)
    x, y = rig.logical[-1]['trimOrigin']
    phases.append([{'name': 'retained-idle-completion-marker', 'image': str(marker),
                   'sha256': sha(marker), 'box': [x, y, x+1, y+1]}])
    result = rig.finish(phases)
    result.update(newConstructionArt=True, foundationSource=None, foundationStableFrom=13,
        retainedIdleCompletion={'frame':24, 'reference':{'nativeReport':str(reference), 'sha256':sha(reference)}},
        neutralMaterialProvenance='AUTHORED_COMPONENTS_AND_RETAINED_HD_RGB_NO_NATIVE_COLOR',
        architecturalMethod='FIXED_WORLD_FOUNDATION_SEPARATE_WALLS_CAPS_ARCH_AND_ROLLING_ROOF',
        visualAcceptance='PENDING')
    for phase, nodes in enumerate(phases):
        canvas = np.zeros((rig.canvas[1]*4, rig.canvas[0]*4, 4), np.uint8)
        for part in nodes:
            canvas = over(place(Image.open(part['image']), part['box'], rig.canvas), canvas)
        Image.fromarray(canvas).save(output / f'{phase:02}-preview.png')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('authoring', 'assets', 'reference', 'output'):
        parser.add_argument(name, type=Path)
    parser.add_argument('--key', default='gaweap-temperate')
    args = parser.parse_args()
    args.output.mkdir(exist_ok=False)
    record = next(f for f in read(args.authoring)['families'] if f['key'] == args.key)
    write(args.output / 'rigs.json', {record['key']: author(record, args.assets,
          args.reference, args.output / record['key'])})
    print('Unselected War Factory component candidate authored')


if __name__ == '__main__':
    main()
