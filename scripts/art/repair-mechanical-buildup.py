"""Replace bitmap reveals with articulated roof, depth sleeves and curved pipe motion."""
import argparse
import copy
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, label, map_coordinates
from scipy.spatial import ConvexHull

from buildup import read, sha, write
from painted_rig import bounds, over, place, project_rgba
from retained_idle import display

terminal = SourceFileLoader('terminal_author', 'scripts/art/author-terminal-alignment.py').load_module()
helpers = terminal.helpers


def save(rig, layer, name, phase, reference, mechanism, **details):
    return terminal.save_part(rig, layer, name, phase, reference, mechanism, **details)


def garage(rig):
    """Rigid nested sleeves translate along the projected longitudinal axis."""
    full = display(rig.record)
    yy, xx = np.mgrid[:full.shape[0], :full.shape[1]] / 4
    region = terminal.polygon(full.shape, [(134, 107), (197, 95), (229, 115),
        (234, 151), (225, 175), (182, 190), (138, 177), (134, 141)])
    face = terminal.polygon(full.shape, [(132, 151), (135, 136), (141, 127),
        (154, 120), (165, 119), (179, 123), (192, 138), (194, 158),
        (189, 177), (181, 190), (142, 178)])
    reference = {'family': rig.record['newFamilyPath'], 'sha256': rig.record['newFamilySha256']}
    front = terminal.masked(full, region & face)
    depth = 2 * xx - yy
    divisions = [-np.inf, 240, 265, 290, np.inf]
    sections = [terminal.masked(full, region & ~face & (depth >= lo) & (depth < hi))
                for lo, hi in zip(divisions, divisions[1:])]
    extension = {18:32, 19:26, 20:19, 21:14, 22:9, 23:5, 24:2, 25:0, 26:0}
    replacements = {}
    for phase, compression in extension.items():
        nodes = []
        # Rear sections are occluded by the nearer sleeves and fixed mouth.
        # Every section keeps its own texture, vents, rivets and cross-section.
        for index in reversed(range(4)):
            amount = round(compression * index / 3 * 2) / 2
            layer = terminal.move(sections[index], dx=-amount, dy=amount / 2)
            if layer[..., 3].any():
                nodes.append(save(rig, layer, f'depth-sleeve-{index}', phase, reference,
                    'RIGID_CAMERA_DEPTH_TRANSLATION_WITH_PHYSICAL_SLEEVE_OCCLUSION',
                    nativeTranslation=[-amount, amount / 2], depthAxis=[1, -.5],
                    materialMasterSha256=sha(rig.record['newFamilyPath'])))
        nodes.append(save(rig, front, 'fixed-garage-mouth', phase, reference,
                          'FIXED_FRONT_CROSS_SECTION_AND_MECHANICAL_ATTACHMENT'))
        replacements[phase] = nodes
    return replacements


def pipe_master(rig):
    node = next(n for n in rig.previous['phases'][22]
                if n['name'] == 'installing-fixed-section-tubing')
    layer = place(Image.open(node['image']), node['box'], rig.canvas)
    rgb = layer[..., :3].astype(float)
    valid = (layer[..., 3] >= 200) & (rgb[..., 2] >= rgb[..., 0] * 1.025)
    valid &= rgb[..., 2] >= rgb[..., 1]
    assert valid.sum() > 500, 'Missing retained tube material'
    _, nearest = distance_transform_edt(~valid, return_indices=True)
    donor = layer[nearest[0], nearest[1], :3]
    return donor, {'image': node['image'], 'sha256': node['sha256']}


def curved_pipe(rig):
    """Extrude constant-radius pipe sections around a fixed physical ring."""
    donor, reference = pipe_master(rig)
    yy, xx = (np.mgrid[:donor.shape[0], :donor.shape[1]] + .5) / 4
    full = display(rig.record)
    center = [68.5, 115.5]
    radii = [43, 22.5]
    radius = 2.75
    angle = np.arctan2((yy - center[1]) / radii[1], (xx - center[0]) / radii[0])
    # Solve Euclidean closest points on the projected centerline. An ellipse's
    # radial angle alone would make the tube thinner at diagonal tangents.
    for _ in range(5):
        dx = center[0] + radii[0] * np.cos(angle) - xx
        dy = center[1] + radii[1] * np.sin(angle) - yy
        tx, ty = -radii[0] * np.sin(angle), radii[1] * np.cos(angle)
        derivative = dx * tx + dy * ty
        curvature = tx * tx + ty * ty - dx * radii[0] * np.cos(angle) - dy * radii[1] * np.sin(angle)
        step = np.divide(derivative, curvature, out=np.zeros_like(angle), where=np.abs(curvature) > 1e-5)
        angle -= np.clip(step, -.25, .25)
    angle[angle < -.55] += 2 * np.pi
    start, final = -.49, 3.40
    ends = {15:-.28, 16:.08, 17:.38, 18:.75, 19:1.15, 20:1.53, 21:2.27, 22:3.02}
    replacements = {phase: [] for phase in (12, 13, 14)}
    for phase, end in ends.items():
        visible_angle = np.clip(angle, start, end)
        cx = center[0] + radii[0] * np.cos(visible_angle)
        cy = center[1] + radii[1] * np.sin(visible_angle)
        distance = np.hypot(xx - cx, yy - cy)
        opacity = np.clip(radius + .125 - distance, 0, .25) * 4
        # Material travels with the incoming leading section. This is a
        # physical circular path, not an expanding world-space bitmap crop.
        source_angle = visible_angle + final - end
        normal_x = np.cos(visible_angle) / radii[0]
        normal_y = np.sin(visible_angle) / radii[1]
        length = np.hypot(normal_x, normal_y)
        normal_x, normal_y = normal_x / length, normal_y / length
        offset = (xx - cx) * normal_x + (yy - cy) * normal_y
        # A continuous visible foreground tube supplies its photographed
        # cylindrical highlight profile. Sampling a hidden rear arc would
        # import unrelated floor/arm pixels and cause material discontinuities.
        sx = 55 + 1.1 * np.sin(source_angle * 12)
        sy = 138.6 + np.clip(offset / radius, -1, 1) * 2.3
        rgba = np.zeros((*xx.shape, 4), np.uint8)
        for channel in range(3):
            rgba[..., channel] = np.clip(map_coordinates(full[..., channel].astype(float),
                [sy * 4 - .5, sx * 4 - .5], order=1, mode='nearest'), 0, 255)
        rgba[..., 3] = np.round(opacity * 255).astype(np.uint8)
        # The exposed mechanical end is a genuine small circular section,
        # with a closed dark center and alloy rim, following the arc tangent.
        ex = center[0] + radii[0] * np.cos(end)
        ey = center[1] + radii[1] * np.sin(end)
        tangent = np.array([-radii[0] * np.sin(end), radii[1] * np.cos(end)])
        tangent /= np.linalg.norm(tangent)
        along = (xx - ex) * tangent[0] + (yy - ey) * tangent[1]
        across = -(xx - ex) * tangent[1] + (yy - ey) * tangent[0]
        face = (along / 1.15) ** 2 + (across / radius) ** 2
        cap = (face < 1) & (along >= -.8)
        end_rgb = full[139 * 4, 55 * 4, :3].astype(float)
        face_color = end_rgb * .34
        rim = cap & (face >= .52)
        rgba[cap, :3] = np.clip(face_color, 0, 255)
        rgba[rim, :3] = np.clip(end_rgb * 1.15 + 12, 0, 255)
        rgba[cap, 3] = 255
        rgba[rgba[..., 3] == 0] = 0
        old = next(n for n in rig.previous['phases'][phase] if n['name'] == 'installing-fixed-section-tubing')
        original = place(Image.open(old['image']), old['box'], rig.canvas)
        fore_y = center[1] + radii[1] * np.sqrt(np.clip(1 - ((xx - center[0]) / radii[0]) ** 2, 0, 1))
        colors = original[..., :3].astype(float)
        neutral = (np.ptp(colors, axis=2) < 24) & (colors[..., 2] <= np.maximum(colors[..., 0], colors[..., 1]) * 1.08)
        support = (yy > fore_y + radius) & (colors.mean(axis=2) < 95) & neutral
        support &= ((xx > 26) & (xx < 36)) | ((xx > 51) & (xx < 63)) | ((xx > 93) & (xx < 107))
        stands = terminal.masked(original, support)
        nodes = []
        if stands[..., 3].any():
            nodes.append(save(rig, stands, 'retained-fixed-pipe-stands', phase,
                {'image': old['image'], 'sha256': old['sha256']}, 'EXACT_RETAINED_FIXED_SUPPORT_PIXELS'))
        nodes.append(save(rig, rgba, 'traveling-circular-pipe-and-endcap', phase,
            reference, 'CONSTANT_RADIUS_CIRCULAR_EXTRUSION_WITH_TRAVELING_MATERIAL_AND_ENDCAP',
            pipeCenter=center, pipeRadii=radii, tubeRadius=radius,
            startAngle=start, endAngle=end, endcapCenter=[ex, ey],
            materialAngularTravel=final - end))
        replacements[phase] = nodes
    return replacements


def remove_future_pipe_contact(rig, part, phase):
    if phase >= 22 or part['name'] != 'deploying-left-arm':
        return part
    layer = np.array(Image.open(part['image']).convert('RGBA'))
    x0, y0, x1, y1 = part['box']
    assert layer.shape[1] == round((x1 - x0) * 4) and layer.shape[0] == round((y1 - y0) * 4)
    yy, xx = np.mgrid[:layer.shape[0], :layer.shape[1]] / 4
    xx, yy = xx + x0, yy + y0
    rgb = layer[..., :3].astype(float)
    pipe = (xx >= 20) & (xx < 40) & (yy >= 118)
    pipe &= ((rgb[..., 2] > rgb[..., 0] * 1.04) & (rgb[..., 2] >= rgb[..., 1]))
    pipe |= (xx >= 20) & (xx < 40) & (yy >= 118) & (rgb.mean(axis=2) > 220) & (np.ptp(rgb, axis=2) < 25)
    if not (pipe & (layer[..., 3] > 0)).any():
        return part
    layer[pipe] = 0
    # Keep the original image rectangle and untouched raw pixels exactly;
    # another premultiply/unpremultiply cycle would perturb remote AA edges.
    file = rig.output / f'{phase:02}-left-arm-pipe-contact-filter.png'
    Image.fromarray(layer).save(file)
    result = copy.deepcopy(part)
    result.update(image=str(file), sha256=sha(file))
    result['rigidPart'].update(method='RETAIN_OWNER_BRACKET_EXCLUDE_FUTURE_FORE_PIPE_CONTACT',
        reference={'image': part['image'], 'sha256': part['sha256']})
    return result


def roof(rig, assets):
    file = assets / 'roof-articulation-v1.png'
    poses = helpers.atlas(file, (2, 2))
    row = 0 if rig.record['theater'] == 'TEMPERATE' else 2
    result = {}
    reference = {'image': str(file), 'sha256': sha(file)}
    full = display(rig.record)
    sill = terminal.masked(full, terminal.polygon(full.shape,
        [(103, 149), (198, 180), (196, 187), (103, 158)]))
    for phase, index, cross in [(21, row, [4, -12]), (22, row + 1, [8, -23])]:
        rgba = np.array(poses[index])
        rgb = rgba[..., :3].astype(float)
        rgba[(rgb[..., 2] > np.maximum(rgb[..., 0], rgb[..., 1]) * 2) & (rgb[..., 2] > 100)] = 0
        components, _ = label(rgba[..., 3] >= 128)
        areas = np.bincount(components.ravel())
        body = components == (np.argmax(areas[1:]) + 1)
        support = distance_transform_edt(~body) <= 2
        rgba[~support] = 0
        image = Image.fromarray(rgba).crop(bounds(body))
        alpha = np.array(image)[..., 3] >= 128
        py, px = np.where(alpha)
        points = np.column_stack((px + .5, py + .5))
        polygon = points[ConvexHull(points).vertices]
        edges = np.roll(polygon, -1, axis=0) - polygon
        along = edges[np.argmax(np.linalg.norm(edges, axis=1))]
        along = along / np.linalg.norm(along)
        if along[0] < 0:
            along = -along
        across = np.array([-along[1], along[0]])
        u, v = points @ along, points @ across
        hinge = np.array([104, 148])
        longitudinal = np.array([90, 32])
        cross = np.array(cross)
        matrix = np.outer(longitudinal / np.ptp(u), along) - np.outer(cross / np.ptp(v), across)
        origin = along * u.min() + across * v.max()
        translation = hinge - matrix @ origin
        projected = project_rgba(image, np.column_stack((matrix, translation)), rig.canvas)
        # The cross-section changes its screen projection as a rigid hinged
        # plane rotates; longitudinal length and the outer hinge stay fixed.
        result[phase] = [save(rig, sill, 'fixed-under-roof-sill', phase,
            {'family': rig.record['newFamilyPath'], 'sha256': rig.record['newFamilySha256']},
            'EXACT_RETAINED_STRUCTURAL_SILL_BELOW_MOVING_PANEL'),
            save(rig, projected, 'inward-folding-roof-panels', phase, reference,
            'RIGID_HINGED_PANEL_VIEW_PROJECTION_FROM_NATIVE_MECHANICAL_POSE',
            hinge=hinge.tolist(), longitudinalAxis=longitudinal.tolist(),
            projectedCrossSection=cross.tolist(), sourceCell=index,
            sourceBasis=[along.tolist(), across.tolist()],
            projectionMatrix=np.column_stack((matrix, translation)).tolist())]
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('authoring', 'assets', 'output'):
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    authority = read(args.authoring)
    args.output.mkdir(exist_ok=False)
    rigs = {}
    targets = {'GAWEAP': ('closing-fixed-roof-panels', roof),
               'GACNST': ('forming-garage-roof-and-door', garage),
               'GAOREP': ('installing-fixed-section-tubing', curved_pipe)}
    for record in authority['families']:
        if record['identity'] not in targets:
            continue
        rig = helpers.Rig(record, args.output / record['key'])
        old_name, author = targets[record['identity']]
        replacements = author(rig, args.assets) if author is roof else author(rig)
        phases = copy.deepcopy(rig.previous['phases'])
        for phase, nodes in replacements.items():
            old = phases[phase]
            assert any(n['name'] == old_name for n in old) or (record['identity'] == 'GAOREP' and phase < 15), (record['key'], phase)
            # Keep every unrelated node exact. New tubing goes behind the
            # retained outer arms, whose sockets occlude the moving tube.
            insertion = next((i for i, n in enumerate(old) if n['name'] == old_name), len(old))
            if record['identity'] == 'GAOREP':
                insertion = next(i for i, n in enumerate(old) if 'arm' in n['name'])
            kept = [n for n in old if n['name'] != old_name]
            if record['identity'] == 'GAOREP':
                kept = [remove_future_pipe_contact(rig, n, phase) for n in kept]
            phases[phase] = kept[:insertion] + nodes + kept[insertion:]
        result = copy.deepcopy(rig.previous)
        result['phases'] = [nodes if phase in replacements else {'retainPredecessor': True}
                            for phase, nodes in enumerate(phases)]
        result.update(newConstructionArt=True, mechanicalMotionRepair={
            'baselineAuthority': str(args.authoring), 'baselineSha256': sha(args.authoring),
            'replacedNode': old_name, 'changedPhases': sorted(replacements),
            'method': 'ARTICULATED_PART_POSES_AND_PHYSICAL_COMPONENT_TRAJECTORIES',
            'visualAcceptance': 'PENDING'})
        result['rigidAnatomy']['parts'] += rig.parts
        rigs[record['key']] = result
        for phase, nodes in enumerate(phases):
            canvas = np.zeros((rig.canvas[1] * 4, rig.canvas[0] * 4, 4), np.uint8)
            for part in nodes:
                canvas = over(place(Image.open(part['image']), part['box'], rig.canvas), canvas)
            Image.fromarray(canvas).save(rig.output / f'{phase:02}-preview.png')
    write(args.output / 'rigs.json', rigs)
    print('Six scoped mechanical motion candidates authored')


if __name__ == '__main__':
    main()
