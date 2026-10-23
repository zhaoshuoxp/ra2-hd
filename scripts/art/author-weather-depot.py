"""Author fixed-world weather machinery and a physically rotating depot boom."""
import argparse
import copy
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation, label

from buildup import native_indices, read, sha, write
from painted_cutout import extract_grid_poses
from painted_rig import bounds, over, place, project_rgba, vector_coverage

parts = SourceFileLoader('ore_author', 'scripts/art/author-ore-satellite.py').load_module()
terminal, helpers = parts.terminal, parts.helpers


def atlas(file, grid):
    result = {}
    for key, (image, box) in extract_grid_poses(Image.open(file), *grid).items():
        rgba = np.array(image)
        ids, _ = label(rgba[..., 3] >= 230)
        counts = np.bincount(ids.ravel()); counts[0] = 0
        body = ids == counts.argmax()
        # Generated glow is not object coverage. Keep the complete solid body
        # and its two-pixel antialias support, including genuine object holes.
        rgba[~binary_dilation(body, iterations=2)] = 0
        rgba[..., :3][rgba[..., 3] == 0] = 0
        result[key] = (Image.fromarray(rgba), box)
    return result


def retained(record):
    return {'family': record['newFamilyPath'], 'sha256': record['newFamilySha256']}


def fixed(image, canvas, box):
    return place(image, box, canvas)


def connected_surface(rgba):
    ids, _ = label(rgba[..., 3] >= 8)
    sizes = np.bincount(ids.ravel()); sizes[0] = 0
    support = binary_dilation(ids == sizes.argmax(), iterations=1)
    return terminal.masked(rgba, support)


def finish(rig, phases, method):
    result = parts.finish(rig, phases, method)
    result['physicalMotion'] = {'foundation': 'FIXED_WORLD_UV_AFTER_DEPLOYMENT',
        'mechanisms': method, 'wholeBuildingBoundsFit': False,
        'neutralNativeRgbContribution': 0, 'visualAcceptance': 'PENDING'}
    return result


def weather(record, assets, reference, output):
    rig, full = parts.seed_rig(record, reference, output)
    kit_file = assets / 'weather-components-v1.png'
    kit = atlas(kit_file, (3, 2)); source = {'image': str(kit_file), 'sha256': sha(kit_file)}
    yy, xx = np.mgrid[:full.shape[0], :full.shape[1]] / 4
    sphere = terminal.polygon(full.shape, [(54, 45), (102, 45), (105, 72),
        (98, 86), (88, 90), (67, 90), (54, 78)])
    globe = terminal.masked(full, sphere)
    # Every core pose shares one fixed sphere envelope. Exposed core material
    # is independently painted; the complete retained shell closes over it.
    core_poses = []
    for index in range(3):
        layer = fixed(kit[index][0], rig.canvas, (53.5, 45, 102.5, 90))
        layer[..., 3] = np.minimum(layer[..., 3], globe[..., 3])
        core_poses.append(layer)
    floor = fixed(kit[5][0], rig.canvas, (25, 96, 128, 148))
    stem_region = terminal.polygon(full.shape, [(69, 87), (86, 87), (88, 99),
        (103, 119), (101, 126), (76, 133), (48, 121), (53, 114), (68, 102)])
    stem = terminal.masked(full, stem_region & (yy >= 87))
    # Four exact finished satellite assemblies retain their different cameras
    # and attachments; no reflected shared satellite is introduced.
    regions = [terminal.polygon(full.shape, poly) for poly in [
        [(26, 83), (39, 70), (52, 75), (57, 88), (58, 104), (46, 107), (26, 100)],
        [(95, 76), (112, 75), (123, 86), (130, 99), (118, 110), (99, 104), (94, 91)],
        [(23, 116), (35, 106), (46, 106), (58, 117), (63, 137), (57, 146), (21, 147)],
        [(94, 109), (106, 105), (120, 113), (128, 130), (132, 147), (94, 149), (91, 129)]]]
    starts = [9, 11, 13, 14]
    complete = [17, 18, 21, 20]
    satellite_layers = [terminal.masked(full, mask) for mask in regions]
    machinery = sphere | stem_region
    for region in regions:
        machinery |= region
        stem = terminal.masked(stem, ~region)
    posts = ((xx > 51) & (xx < 64) & (yy > 85) & (yy < 105))
    posts |= ((xx > 92) & (xx < 103) & (yy > 88) & (yy < 110))
    floor_contour = terminal.polygon(full.shape, [(76, 96), (106, 99), (128, 111),
        (128, 130), (110, 141), (77, 148), (44, 141), (25, 130), (25, 113), (43, 102)])
    floor = terminal.masked(floor, floor_contour)
    rgb = full[..., :3].astype(float)
    ground = (rgb[..., 0] > rgb[..., 2]*1.08) & (rgb[..., 1] > rgb[..., 2]*1.06)
    ground &= np.ptp(rgb, axis=2) < 85
    ring = (rgb[..., 0] > rgb[..., 1]*3) & (rgb[..., 0] > rgb[..., 2]*3)
    floor = over(terminal.masked(full, ~machinery & ~posts & floor_contour &
        (yy >= 100) & (ground | ring)), floor)
    floor = connected_surface(floor)
    floor[..., 3] = np.minimum(floor[..., 3], full[..., 3])
    floor = parts.clipped(rig, floor, 4)
    unfinished_stem = stem.copy()
    red = (stem[..., 0] > stem[..., 1]*3) & (stem[..., 0] > stem[..., 2]*3)
    color = stem[..., :3].astype(float)
    value = color[..., 0]*.65 + color[..., 1]*.20 + color[..., 2]*.15
    steel = np.clip(np.stack((value*.96, value, value*1.04), axis=2), 0, 255).astype(np.uint8)
    unfinished_stem[red, :3] = steel[red]
    phases = []
    for phase in range(record['frames']):
        nodes = []
        def add(layer, name, ref=source, method='INDEPENDENT_PHYSICAL_COMPONENT', **metadata):
            parts.append(nodes, parts.node(rig, layer, name, phase, ref, method, **metadata))
        if phase >= 23:
            if phase == 23:
                add(full, 'exact-finished-assembly', retained(record), 'EXACT_RETAINED_INITIAL_IDLE')
            else:
                marker = np.zeros_like(full)
                x, y = rig.logical[phase]['trimOrigin']; marker[y*4, x*4] = [0, 0, 0, 1]
                add(marker, 'retained-idle-marker', retained(record), 'RETAINED_IDLE_PRESENTATION')
            phases.append(nodes); continue
        if phase:
            foundation = floor.copy()
            if phase < 4:
                mask = parts.hull(parts.guide_mask(rig, phase, lambda x, y: y >= 104))
                foundation[..., 3] = np.minimum(foundation[..., 3], vector_coverage(mask))
            add(foundation, 'fixed-empty-platform', method='FIXED_WORLD_UV_NATIVE_GROUND_DEPLOYMENT')
        top = rig.logical[phase]['trimOrigin'][1]
        drop = max(0, top - 45)
        if phase >= 2:
            # The central mast telescopes axially. The feet remain at their
            # finished world positions while the complete cap moves upward.
            mast = unfinished_stem if phase < 18 else stem
            add(terminal.masked(mast, yy >= 87 + drop), 'telescoping-mast-and-fixed-feet',
                retained(record), 'FIXED_AXIAL_MAST_MATERIAL', verticalExtension=drop)
        pose = 0 if phase <= 10 else 1 if phase <= 13 else 2
        main = globe if phase >= 21 else core_poses[pose]
        if 9 <= phase <= 20:
            # Spherical shell panels close along meridians. Surface coverage
            # follows the native armor front on the fixed-radius HD sphere.
            cap_depth = {9: 0, 10: 1, 11: 3, 12: 5, 13: 6, 14: 8,
                15: 10, 16: 12, 17: 14, 18: 17, 19: 21, 20: 28}[phase]
            core = core_poses[0].copy()
            center = 77.5
            armor = ((yy < 45 + cap_depth) | (abs(xx-center) < max(0, phase-11)*1.4)) & sphere
            main = over(terminal.masked(globe, armor), core)
        if phase <= 1:
            # Early core is emerging from the ground and remains a complete
            # closed cap at the native vertical position.
            main = terminal.masked(main, yy < 45 + (rig.logical[phase]['trimSize'][1] if phase == 0 else 42))
        add(terminal.move(main, dy=drop), 'rising-fixed-radius-globe', method='RIGID_SPHERE_VERTICAL_TRANSLATION',
            radius=24.5, nativeTranslation=[0, drop])
        for index, (start, done, layer) in enumerate(zip(starts, complete, satellite_layers)):
            if phase < start:
                continue
            body = layer.copy()
            if phase < done:
                # Exposed core material lives on the actual satellite sphere,
                # with its metal supports and camera left intact.
                b = bounds(body[..., 3] >= 128)
                blue = (body[..., 2] > body[..., 0] * 1.08) & (yy < b[1]/4 + 22)
                yellow = fixed(kit[3][0], rig.canvas,
                    (b[0]/4 + 5, b[1]/4, b[2]/4 - 4, min(b[3]/4, b[1]/4+24)))
                center = (b[0]+b[2])/8
                half_width = (b[2]-b[0])/8 * (done-phase)/(done-start)
                opening = blue & (abs(xx-center) < half_width)
                body = over(terminal.masked(yellow, opening), terminal.masked(body, ~opening))
                dy = max(0, (start+2-phase)*2)
                body = terminal.move(body, dy=dy)
            add(body, f'satellite-{index}', retained(record), 'INDEPENDENT_SATELLITE_VERTICAL_INSTALLATION',
                closed=phase >= done)
        if phase >= 18:
            # Final perimeter and posts arrive at their native finishing stage.
            add(terminal.masked(full, ~machinery), 'finished-perimeter-and-posts', retained(record))
        phases.append(nodes)
    return finish(rig, phases, 'FIXED_RADIUS_GLOBES_AXIAL_MAST_AND_INDEPENDENT_SATELLITES')


def depot(record, assets, reference, output):
    rig, full = parts.seed_rig(record, reference, output)
    kit_file = assets / 'depot-components-v1.png'
    kit = atlas(kit_file, (3, 3)); source = {'image': str(kit_file), 'sha256': sha(kit_file)}
    yy, xx = np.mgrid[:full.shape[0], :full.shape[1]] / 4
    floor = fixed(kit[6][0], rig.canvas, (43, 94, 146, 145))
    plinth = fixed(kit[8][0], rig.canvas, (7, 78, 98, 124))
    turntable = fixed(kit[7][0], rig.canvas, (65, 76, 94, 94))
    arm_file = assets / 'depot-arm-native-poses-v2.png'
    arm_poses = atlas(arm_file, (3, 2))
    arm_region = terminal.polygon(full.shape, [(26, 76), (65, 54), (85, 56),
        (91, 67), (90, 83), (53, 97), (28, 90)])
    machine_region = terminal.polygon(full.shape, [(5, 84), (32, 76), (61, 58),
        (86, 54), (100, 67), (124, 70), (125, 88), (99, 95), (59, 115), (7, 124)])
    finished_machine = terminal.masked(full, machine_region)
    floor_contour = terminal.polygon(full.shape, [(94, 94), (126, 101), (145, 113),
        (138, 129), (114, 140), (94, 145), (68, 140), (48, 129), (43, 115), (58, 102)])
    floor = terminal.masked(floor, floor_contour)
    floor = over(terminal.masked(full, ~machine_region & floor_contour & (yy >= 94)), floor)
    floor = connected_surface(floor)
    floor[..., 3] = np.minimum(floor[..., 3], full[..., 3])
    floor = parts.clipped(rig, floor, 4)
    phases = []
    for phase in range(record['frames']):
        nodes = []
        def add(layer, name, ref=source, method='INDEPENDENT_PHYSICAL_COMPONENT', **metadata):
            parts.append(nodes, parts.node(rig, layer, name, phase, ref, method, **metadata))
        if phase >= 23:
            if phase == 23: add(full, 'exact-finished-depot', retained(record), 'EXACT_RETAINED_INITIAL_IDLE')
            else:
                marker = np.zeros_like(full)
                x,y = rig.logical[phase]['trimOrigin']; marker[y*4,x*4] = [0,0,0,1]
                add(marker, 'retained-idle-marker', retained(record), 'RETAINED_IDLE_PRESENTATION')
            phases.append(nodes); continue
        ground = floor.copy()
        if phase < 3:
            original = native_indices(rig.raw, phase)
            mask = parts.hull((original > 0) & (np.indices(original.shape)[0] >= 103))
            ground[..., 3] = np.minimum(ground[..., 3], vector_coverage(mask))
        add(ground, 'fixed-service-platform', method='FIXED_WORLD_UV_DEPLOYING_GROUND_CONTOUR')
        if phase >= 22:
            add(finished_machine, 'completed-rotating-machine', retained(record))
            add(terminal.masked(full, ~machine_region), 'completed-platform', retained(record))
            phases.append(nodes); continue
        if phase < 7:
            cx = [94, 86, 82, 81, 81, 81, 81][phase]
            cy = [118, 101, 94, 90, 87, 85, 84][phase]
            cap = terminal.move(turntable, dx=cx-79.5, dy=cy-85)
            add(cap, 'travelling-turntable', method='COMPLETE_TURNTABLE_DEPTH_AND_VERTICAL_TRANSLATION',
                nativeCenter=[cx,cy])
        else:
            if phase >= 11:
                # A complete support sleeve travels along the isometric depth
                # direction. The moving end remains capped through occlusion.
                dx = max(0, rig.logical[phase]['trimOrigin'][0]-7)
                dy = -dx*.5
                support = terminal.move(terminal.masked(plinth, (xx < 73) & (yy > 90)), dx=dx, dy=dy)
                support = terminal.masked(support, xx <= 82)
                add(support, 'telescoping-complete-support', method='RIGID_DEPTH_AXIS_SLEEVE_TRANSLATION',
                    nativeTranslation=[dx,dy])
            if phase >= 8:
                neck = terminal.masked(plinth, (xx >= 65) & (yy <= 99))
                add(neck, 'fixed-plinth-neck', method='FIXED_WORLD_PLINTH_ATTACHMENT')
            add(turntable, 'fixed-hinge-turntable', method='FIXED_WORLD_HINGE_TURNTABLE')
            pose = 0 if phase <= 15 else 1 if phase <= 17 else phase-16
            arm, box = arm_poses[pose]
            # Pose-specific, independently painted 3D views preserve complete
            # side walls and bearings at edge-on angles. Every view has the
            # same world hinge and uses one similarity transform.
            config = read(assets / 'depot-arm-registration-v2.json')[str(pose)]
            scale = config['scale']*(.94 if pose == 0 else 1)
            anchor = np.array(config['anchor'])
            pivot = np.array([82.5, 74.])
            angle = config['angleRadians']
            rotation = np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])
            matrix = rotation*scale
            corners = np.array([[0,0], [arm.width,0], [0,arm.height], [arm.width,arm.height]])
            vectors = (corners-anchor)@matrix.T
            left,top = rig.logical[phase]['trimOrigin']
            right,bottom = np.array([left,top])+rig.logical[phase]['trimSize']
            if phase >= 12:
                limit = 1.
                for v in vectors:
                    for axis,lo,hi in [(0,left+.25,right-.25),(1,top+.25,bottom-.25)]:
                        if v[axis] < 0: limit = min(limit,(pivot[axis]-lo)/-v[axis])
                        if v[axis] > 0: limit = min(limit,(hi-pivot[axis])/v[axis])
                matrix *= limit; scale *= limit
            translation = pivot-matrix@anchor
            layer = project_rgba(arm, np.column_stack((matrix,translation)).tolist(), rig.canvas)
            if phase < 12:
                drop = max(0, rig.logical[phase]['trimOrigin'][1]-15)
                layer = terminal.move(layer, dy=drop)
                layer = terminal.masked(layer, yy <= 85)
            add(layer, 'hinged-orange-linkage', {'image': str(arm_file), 'sha256': sha(arm_file)},
                'INDEPENDENT_AUTHORED_RIGID_ROTATION_POSE', hinge=pivot.tolist(),
                pose=pose, scale=scale, sourceAnchor=anchor.tolist(), completeBearing=True)
            if phase >= 15:
                # Finished exposed pipe bank and rear attachments retain their
                # exact geometry; the orange moving linkage is excluded.
                attachments = terminal.masked(finished_machine, ~arm_region & ((xx > 87) | (yy > 93)))
                add(attachments, 'fixed-pipes-and-rear-attachments', retained(record))
            if phase >= 18:
                front = terminal.masked(full, (xx < 38) & (yy > 89))
                front = terminal.move(front, dy=max(0, (21-phase)*2))
                add(front, 'installing-front-shell', retained(record), 'RIGID_SHELL_VERTICAL_TRANSLATION')
        phases.append(nodes)
    return finish(rig, phases, 'RIGID_HINGED_BOOM_AND_DEPTH_AXIS_SUPPORT_WITH_FIXED_FLOOR')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('authoring', 'assets', 'temperate_reference', 'snow_reference', 'output'):
        parser.add_argument(name, type=Path)
    args = parser.parse_args(); args.output.mkdir(exist_ok=False)
    rigs = {}
    for record in read(args.authoring)['families']:
        if record['identity'] not in ('GAWEAT', 'GADEPT'): continue
        reference = args.snow_reference if record['theater'] == 'SNOW' else args.temperate_reference
        author = weather if record['identity'] == 'GAWEAT' else depot
        rigs[record['key']] = author(record, args.assets, reference, args.output / record['key'])
    write(args.output / 'rigs.json', rigs)
    print('Four unselected Weather Control Device / Service Depot candidates authored')


if __name__ == '__main__':
    main()
