"""Finish six source-specific construction variants without changing native geometry."""
import argparse
import shutil
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation, distance_transform_edt, label
from scipy.spatial import ConvexHull

from buildup import native_indices, read, sha, write
from painted_rig import bounds, over, place, vector_coverage

advanced = SourceFileLoader('coverage_advanced', 'scripts/art/author-yuri-advanced.py').load_module()
support, base, terminal = advanced.support, advanced.base, advanced.terminal
ROOT = support.ROOT
BATCH = ROOT / 'coverage-completion-r117-v1'
AUTHORITY = BATCH / 'reference-authoring-v1.json'


class Scene(advanced.Scene):
    def __init__(self, record, output, source):
        reference = BATCH / ('reference-ra2-' + record['theater'].lower() + '-v1/report.json')
        if record['theater'] == 'NEWURBAN':
            reference = BATCH / 'reference-yr-newurban-v5/report.json'
        self.rig, full = base.parts.seed_rig(record, reference, output)
        self.target_full = full.copy()
        self.record, self.output, self.origin = record, output, np.zeros(2)
        # RA2's sensor canvas differs from the Yuri sensor by one native pixel
        # on each axis. Register all components once, before any motion.
        self.offset = np.array([1., -1.]) if record['identity'] == 'NAPSIS' else np.zeros(2)
        self.full = terminal.move(full, dx=-self.offset[0], dy=-self.offset[1])
        self.yy, self.xx = np.mgrid[:full.shape[0], :full.shape[1]] / 4
        self.phases, self.checks, self.violations = [], [], []
        self.diagnostic = True
        self.owner_allowed = [bool(((native_indices(self.rig.raw, p) >= 16)
                                   & (native_indices(self.rig.raw, p) < 32)).any())
                              for p in range(record['frames'])]
        self.reference = read(reference)['cases'][record['identity']]
        material = ROOT / 'heavy-structure-r99-v1/hidden-materials-v1.png'
        atlas = Image.open(material).convert('RGBA')
        w, h = atlas.width // 2, atlas.height // 2
        self.materials = [atlas.crop((i % 2*w, i // 2*h, (i % 2+1)*w, (i // 2+1)*h))
                          for i in range(4)]
        # Retain actual Soviet remap paint rather than a Yuri finish sample.
        paint = self.full[..., :3].astype(float)
        red_mask = ((paint[..., 0] > paint[..., 1]*2.2)
                    & (paint[..., 0] > paint[..., 2]*2.2) & (self.full[..., 3] > 230))
        distance = distance_transform_edt(red_mask)
        cy, cx = np.unravel_index(distance.argmax(), distance.shape)
        red = self.full[cy-3:cy+4, cx-3:cx+4].copy()
        red[..., 3] = 255
        self.materials[2] = Image.fromarray(red)
        self.file = ROOT / 'yuri-support-rebuild-r108-v1/hidden-mechanisms-v1.png'
        atlas = Image.open(self.file).convert('RGBA')
        self.mechanisms = []
        for box in [(0, 50, 725, 540), (755, 90, 1050, 540), (1110, 130, 1536, 550),
                    (0, 560, 690, 1024), (750, 560, 1050, 1000), (1100, 560, 1536, 1000)]:
            rgba = advanced.heavy.largest_piece(np.array(atlas.crop(box)))
            rgba[..., 3][rgba[..., 3] >= 230] = 255
            image = Image.fromarray(rgba)
            self.mechanisms.append(image.crop(image.getbbox()))
        self.materials.append(self.mechanisms[5])
        self.source = {'code': str(source), 'sha256': sha(source),
                       'sharedClosedMechanisms': str(self.file), 'sharedClosedMechanismsSha256': sha(self.file),
                       'material': str(material), 'materialSha256': sha(material),
                       'retainedNativeReport': str(reference), 'retainedNativeReportSha256': sha(reference),
                       'variantGeometry': record['nativeSource'], 'variantGeometrySha256': sha(record['nativeSource'])}

    def put(self, nodes, layer, name, phase, method, **details):
        if self.offset.any():
            layer = terminal.move(layer, dx=self.offset[0], dy=self.offset[1])
        layer = base.parts.clipped(self.rig, layer, phase)
        self.emit(nodes, layer, name, phase, method, source=self.source,
                  originalPhase=phase, fixedVariantRegistration=self.offset.tolist(), **details)

    def draw(self, nodes, layer, name, phase, method, **details):
        self.put(nodes, layer, name, phase, method, **details)

    def floor_draw(self, nodes, layer, phase):
        self.put(nodes, layer, 'fixed-silver-deck', phase, 'SOURCE_SPECIFIC_SILVER_DECK_FIXED_UV')

    def native_working_indices(self, phase):
        idx = native_indices(self.rig.raw, phase)
        if not self.offset.any():
            return idx
        result = np.zeros_like(idx)
        result[1:, :-1] = idx[:-1, 1:]
        return result

    def frame_top(self, phase):
        iy = np.where(native_indices(self.rig.raw, phase) > 1)[0]
        return int(iy.min() - self.offset[1]) if len(iy) else 0

    def terminal(self, phase):
        if phase != self.record['frames'] - 1:
            return None
        marker = np.zeros_like(self.full)
        x, y = np.array(self.rig.logical[phase]['trimOrigin']) - self.offset
        marker[round(y*4), round(x*4)] = [0, 0, 0, 1]
        nodes = []
        self.put(nodes, marker, 'retained-idle-marker', phase, 'EXACT_RETAINED_IDLE_COMPLETION')
        return nodes

    def finish(self):
        result = super().finish()
        Image.fromarray(self.target_full).save(self.output / 'retained-idle-reference.png')
        result['variantCompletion'] = {'source': self.record['nativeSource'],
            'originalPhases': self.record['frames'], 'nativeRgbAsHdDetail': False,
            'fixedRegistration': self.offset.tolist(), 'finishedArtChanged': False}
        return result


def silver_foundation(s, poly, height=1):
    layer = advanced.heavy.art.material_quad(s, 0, poly, (64, 14), .92)
    if height:
        side = terminal.move(layer, dy=height)
        side[..., :3] = (side[..., :3] * .48).astype('uint8')
        layer = over(layer, side)
    return layer


def source_sensor(s):
    x, y = s.xx, s.yy
    arm_polys = [
        [(117, 10), (121, 10), (121, 28), (130, 34), (130, 39), (117, 33)],
        [(132, 55), (144, 61), (144, 37), (151, 37), (152, 66), (147, 71), (132, 64)],
        [(132, 70), (155, 80), (155, 42), (163, 42), (164, 85), (160, 90), (132, 79)],
    ]
    arms = [s.retained(q) for q in arm_polys]
    upper = terminal.masked(
        s.full, (y < 87) & (((x >= 124) & (x <= 138)) | ((y <= 32) & (x >= 121) & (x <= 140)))
    )
    mast = advanced.heavy.largest_piece(
        terminal.masked(upper, ~np.logical_or.reduce([s.region(q) for q in arm_polys]))
    )
    # No leftover pixels from a cut upper arm enter the lower foundation.
    roof = s.retained([(112, 86), (126, 82), (140, 85), (148, 91), (148, 100), (132, 108), (112, 102)])
    glass = s.retained([(111, 101), (132, 107), (147, 100), (147, 123), (135, 131), (111, 125)])
    lower = terminal.masked(
        s.full,
        (y >= 107)
        & ~s.region(
            [(115, 102), (131, 106), (144, 102), (144, 117), (136, 126), (120, 123), (115, 119)]
        ),
    )
    buttress_polys = [
        [(93, 109), (109, 110), (111, 122), (98, 140), (93, 139)],
        [(145, 116), (160, 116), (167, 132), (163, 138), (147, 128)],
        [(120, 124), (140, 124), (141, 138), (133, 153), (118, 149)],
    ]
    buttresses = [terminal.masked(lower, s.region(q)) for q in buttress_polys]
    housings = terminal.masked(lower, ~np.logical_or.reduce([s.region(q) for q in buttress_polys]))
    floor = silver_foundation(s, [(95, 145), (151, 114), (166, 121), (109, 153)], height=1)
    # Original deck corners, in the common native canvas; one fixed UV rectangle.
    poses = [
        None,
        [(45, 76), (60, 74), (104, 108), (89, 113)],
        [(53, 60), (68, 58), (107, 112), (91, 119)],
        [(65, 51), (79, 49), (111, 116), (96, 121)],
        [(79, 49), (93, 47), (111, 119), (96, 124)],
        [(96, 55), (111, 50), (113, 120), (98, 126)],
        [(111, 66), (126, 61), (113, 121), (99, 127)],
        [(133, 82), (148, 78), (114, 121), (100, 127)],
        [(151, 99), (168, 94), (116, 124), (101, 130)],
        [(151, 124), (165, 118), (114, 112), (100, 118)],
        [(151, 139), (166, 131), (114, 114), (100, 120)],
        [(151, 146), (167, 137), (114, 116), (100, 122)],
    ]
    dark = np.array(s.materials[0])
    dark[..., :3] = (dark[..., :3] * 0.86).astype("uint8")
    s.materials.append(Image.fromarray(dark))
    deck_material = len(s.materials) - 1
    stationary_native = binary_dilation(s.native_working_indices(0) > 1, iterations=1)
    for phase in range(s.record["frames"]):
        nodes = s.end(phase, 23)
        if nodes is not None:
            s.phases.append(nodes)
            continue
        nodes = []
        s.floor_draw(nodes, floor, phase)
        if phase >= 10:
            pad = silver_foundation(s, [(91, 139), (131, 117), (168, 136), (129, 155)], height=1)
            s.draw(nodes, pad, "closed-lower-pad", phase, "CONTINUOUS_PAD_UNDER_MOVING_HOUSINGS")
        if phase <= 11:
            ix = s.native_working_indices(phase)
            red = (ix >= 16) & (ix < 32)
            if phase:
                rgb = np.asarray(s.record['palette'], float)[ix]
                gray = ((ix > 31) & (rgb[..., 2] > rgb[..., 0]*.94)
                        & (rgb[..., 1] > rgb[..., 0]*.85) & (rgb.mean(axis=-1) < 145))
                # Register the moving plane from this variant's own visible
                # geometry. Exclude the entire phase-zero foundation before
                # identifying the component, including its small socket rims.
                moving = gray & ~stationary_native
                ids, count = label(binary_dilation(moving, iterations=1))
                sizes = np.bincount(ids.ravel()); sizes[0] = 0
                points = np.column_stack(np.where((ids == sizes.argmax()) & moving)[::-1]).astype(float)
                hull = points[ConvexHull(points).vertices]
                center = points.mean(axis=0)
                values, vectors = np.linalg.eigh(np.cov((points-center).T))
                axis = vectors[:, -1]
                if axis[1] < 0:
                    axis = -axis
                axes = np.column_stack((axis, [-axis[1], axis[0]]))
                local = (points-center) @ axes
                lo, hi = local.min(axis=0)-.5, local.max(axis=0)+.5
                quad = np.array([[lo[0],lo[1]],[hi[0],lo[1]],[hi[0],hi[1]],[lo[0],hi[1]]]) @ axes.T + center
                panel = terminal.masked(s.panel(quad, deck_material, 1), s.region(hull))
                light = [1, .95, .90, .80, .65, .52, .55, .68, .82, .92, 1, 1][phase]
                panel[..., :3] = (panel[..., :3]*light).astype('uint8')
                s.draw(nodes, panel, 'independent-turning-deck', phase,
                       'OWN_ORIGINAL_MOVING_PLANE_GEOMETRY_WITH_SEPARATE_COMPONENT_UV',
                       nativeQuad=quad.tolist(), fixedUv=True)
                if phase == 11:
                    seated_deck = panel
            # The stationary silver paving never participates in a per-frame
            # component hull or fit. Its UV coordinates remain world-fixed.
            for kind, mask, material in [("buttress", red, 2)]:
                ids, count = label(binary_dilation(mask, iterations=1))
                sizes = np.bincount(ids.ravel())
                sizes[0] = 0
                chosen = np.argsort(sizes)[::-1][: 2 if kind == "deck" else 4]
                for j, n in enumerate(chosen):
                    points = np.column_stack(np.where((ids == n) & mask)[::-1]).astype(float)
                    if len(points) < (18 if kind == "deck" else 3):
                        continue
                    if np.linalg.matrix_rank(points - points.mean(axis=0)) < 2:
                        continue
                    hull = points[ConvexHull(points).vertices]
                    center = points.mean(axis=0)
                    values, vectors = np.linalg.eigh(np.cov((points - center).T))
                    axes = vectors[:, ::-1]
                    local = (points - center) @ axes
                    lo = local.min(axis=0) - 0.5
                    hi = local.max(axis=0) + 0.5
                    q = (
                        np.array([[lo[0], lo[1]], [hi[0], lo[1]], [hi[0], hi[1]], [lo[0], hi[1]]])
                        @ axes.T
                        + center
                    )
                    panel = s.panel(q, material, 1)
                    matte = s.region(hull)
                    panel = terminal.masked(panel, matte)
                    side = terminal.move(panel, dx=0.5, dy=1.5)
                    side[..., :3] = (side[..., :3] * 0.32).astype("uint8")
                    panel = over(panel, side)
                    s.draw(
                        nodes,
                        panel,
                        kind + "-native-landmarks-" + str(j),
                        phase,
                        "ORIGINAL_COMPONENT_LANDMARKS_WITH_HD_UV_NO_NATIVE_RGB",
                    )
        elif phase <= 13:
            s.draw(
                nodes,
                seated_deck,
                "seated-deck",
                phase,
                "SEATED_DECK_UNDER_HOUSINGS",
            )
        # Closed textured prisms supply the reverse faces missing from idle art.
        for i, (layer, pivot, start) in enumerate(
            zip(buttresses, [(99, 138), (160, 137), (131, 150)], [1, 4, 3])
        ):
            if phase < start or phase <= 11:
                continue
            t = support.fraction(phase, start, 12)
            if t < 1:
                top = np.array(pivot) + np.array([(-16 if i == 0 else 16) * (1 - t), -24 * t])
                folded = advanced.heavy.solid_beam(s, pivot, top, (10, 4), material=2, thickness=3)
            else:
                folded = layer
            s.draw(
                nodes,
                folded,
                "red-folding-buttress-" + str(i),
                phase,
                "COMPLETE_BUTTRESS_WITH_CLOSED_REVERSE_FACE",
            )
        if 10 <= phase < 14:
            # Housing tops translate up; their lower portions remain below the pad.
            for i, (q, floor_y) in enumerate(
                [
                    ([(89, 118), (121, 118), (122, 151), (89, 151)], 151),
                    ([(137, 102), (170, 102), (170, 145), (137, 145)], 145),
                ]
            ):
                layer = terminal.masked(housings, s.region(q))
                top = bounds(layer[..., 3] > 0)[1] / 4
                drop = (floor_y-top)*.65*(1-support.fraction(phase, 10, 14))
                s.draw(
                    nodes,
                    s.rise(layer, drop, floor_y),
                    "stone-housing-" + str(i),
                    phase,
                    "CONSTANT_SCALE_STONE_HOUSING_RISES_THROUGH_FIXED_SOCKET",
                    translation=[0, drop],
                    singularValueRatio=1,
                )
        if phase >= 14:
            drop = float(np.interp(phase, [14, 15, 16, 17, 18, 19], [28, 27, 20, 12, 5, 0]))
            s.draw(
                nodes,
                s.rise(glass, drop, 129),
                "glass-chamber",
                phase,
                "GLASS_CHAMBER_EMERGES_THROUGH_BASE_SOCKET",
            )
            s.draw(
                nodes,
                terminal.move(roof, dy=drop),
                "complete-chamber-roof",
                phase,
                "COMPLETE_ROOF_RISES_ABOVE_CHAMBER",
            )
            top = float(
                np.interp(
                    phase,
                    [14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
                    [99, 97, 80, 61, 43, 24, 21, 16, 11, 5],
                )
            )
            md = top - 5
            s.draw(
                nodes,
                s.rise(mast, md, 87 + drop),
                "central-telescoping-mast",
                phase,
                "MAST_CAP_AND_SHAFT_EXTEND_THROUGH_CHAMBER_ROOF",
            )
        for i, arm in enumerate(arms):
            start = [20, 18, 18][i]
            if phase < start:
                continue
            t = support.fraction(phase, start, 22)
            # Complete arm moves out from its collar; no horizontal knife cut.
            m = np.array([[max(0.15, t), 0, 132 * (1 - max(0.15, t))], [0, 1, 0]])
            blade_mask = [x <= 122, x >= 144, x >= 155][i]
            red = ((arm[..., 0].astype(float) > arm[..., 1]*1.8)
                   & (arm[..., 0].astype(float) > arm[..., 2]*1.8))
            blade = terminal.masked(arm, blade_mask & ~red)
            bridge = terminal.masked(arm, ~blade_mask & ~red)
            collar = terminal.masked(arm, red)
            travel = [-14, 14, 25][i] * (1 - max(0.15, t))
            # The rigid blade rises out of its own red socket while its bridge
            # telescopes sideways. A full-height blade is not exposed early.
            blade = s.rise(blade, [8, 28, 37][i] * (1-t), [29, 67, 86][i])
            layer = over(terminal.move(blade, dx=-travel), base.transform(bridge, m, s.rig.canvas))
            layer = over(terminal.move(collar, dx=-travel), layer)
            layer = terminal.move(layer, dy=max(0, s.frame_top(phase) - [10, 37, 42][i] + 1))
            s.draw(
                nodes,
                layer,
                "side-antenna-" + str(i),
                phase,
                "COMPLETE_TELESCOPIC_SIDE_ARM_EXTENDS_FROM_COLLAR",
            )
        if phase >= 14:
            s.draw(nodes, housings, "seated-foundation-housings", phase, "COMPLETE_SEATED_FOUNDATION")
        s.phases.append(nodes)
    return s.finish()



def sensor(s):
    return source_sensor(s)


class PowerScene(base.Scene):
    def reactor_bed(self):
        return self.fitted(1, (84, 89, 149, 129))

    def emit(self, nodes, layer, name, phase, method, **details):
        if phase == 0 and name.startswith('rising-brick-tower'):
            return
        # Only this target source's native crop is legal; no renderer extension.
        layer = base.parts.clipped(self.rig, layer, phase)
        super().emit(nodes, layer, name, phase, method, **details)


def tank_bunker(s):
    x, y = s.xx, s.yy
    file = BATCH / 'bunker-components-v1.png'
    atlas = np.array(Image.open(file).convert('RGBA'))
    cells = []
    for box in [(0, 110, 585, 525), (585, 120, 1080, 505), (1110, 170, 1536, 510),
                (110, 630, 460, 940), (570, 520, 1020, 1024), (1070, 510, 1536, 960)]:
        rgba = advanced.heavy.largest_piece(atlas[box[1]:box[3], box[0]:box[2]].copy())
        rgba[..., 3][rgba[..., 3] >= 230] = 255
        cell = Image.fromarray(rgba)
        cells.append(cell.crop(cell.getbbox()))
    s.source['completeBunkerComponents'] = {'file': str(file), 'sha256': sha(file),
        'prompt': str(BATCH / 'bunker-components-v1.prompt.txt'), 'generationTool': 'BUILTIN_IMAGEGEN'}
    # A full-resolution continuous painted plate supplies all folding surfaces.
    # One fixed light gain matches the retained pavement's established HD tone.
    master = np.array(cells[5])
    master[..., :3] = np.clip(master[..., :3].astype(float)*.64, 0, 255).astype('uint8')
    s.materials[3] = Image.fromarray(master)
    floor_quad = [(63, 62), (120, 90), (63, 120), (6, 92)]
    floor = advanced.heavy.art.material_quad(s, 3, floor_quad, (64, 64))
    side = terminal.move(floor, dy=1)
    side[..., :3] = (side[..., :3]*.42).astype('uint8')
    floor = over(floor, side)
    # The reverse face is complete even when the half-slab is nearly edge-on.
    poses = {1: [(57, 78), (73, 86), (72, 94), (56, 87)],
             2: [(58, 69), (83, 82), (77, 97), (43, 77)],
             3: [(60, 62), (95, 81), (83, 99), (31, 78)],
             4: [(63, 60), (108, 83), (88, 103), (31, 77)]}
    # Retained finished shafts keep their exact metal/hazard appearance. Only
    # their long axes telescope; independent complete anchor heads translate.
    rail_polys = [[(21, 86), (66, 64), (74, 69), (30, 93)],
                  [(55, 104), (99, 82), (107, 87), (63, 111)]]
    rails = [s.retained(q) for q in rail_polys]
    color = s.target_full[..., :3].astype(float)
    remap = (color[..., 0] > color[..., 1]*1.7) & (color[..., 0] > color[..., 2]*1.7)
    warning = (color[..., 0] > 125) & (color[..., 1] > 100) & (color[..., 2] < 80)
    track_mask = np.logical_or.reduce([s.region(q) for q in rail_polys]) | warning
    # Paving already exposed in the retained idle stays exact. The complete
    # painted plate fills only surfaces hidden by its removed track mechanisms.
    pavement = terminal.masked(s.target_full, ~track_mask)
    pavement = base.neutral(pavement)
    fixed_floor = over(pavement, floor)
    perimeter_paint = terminal.masked(s.target_full, remap)
    corners = np.array([(63, 62), (116, 90), (63, 117), (10, 91)], float)
    caps = [place(cells[3], (cx-2.2, cy-2.8, cx+2.2, cy+1.7), s.rig.canvas)
            for cx, cy in corners]
    center_cap = place(cells[3], (60.8, 87.2, 65.2, 91.7), s.rig.canvas)
    initial_cap = place(cells[3], (58, 87, 69, 97), s.rig.canvas)
    for phase in range(s.record['frames']):
        nodes = s.terminal(phase)
        if nodes is not None:
            s.phases.append(nodes)
            continue
        nodes = []
        if phase == 0:
            s.draw(nodes, initial_cap, 'initial-central-anchor', phase, 'ORIGINAL_SINGLE_CENTRAL_ANCHOR')
        elif phase <= 4:
            panel = advanced.heavy.art.material_quad(s, 3, poses[phase], (64, 64))
            side = terminal.move(panel, dy=1)
            side[..., :3] = (side[..., :3]*.42).astype('uint8')
            s.draw(nodes, over(panel, side), 'complete-unfolding-slab', phase,
                   'CLOSED_SLAB_WITH_NATIVE_HINGE_LANDMARKS', nativeQuad=poses[phase])
            if phase == 4:
                q = [(31, 77), (88, 103), (63, 106), (18, 82)]
                s.draw(nodes, advanced.heavy.art.material_quad(s, 3, q, (32, 64)),
                       'second-outward-floor-panel', phase, 'SECOND_CLOSED_PANEL_FOLDS_FROM_CENTER')
            s.draw(nodes, center_cap, 'central-hinge-anchor', phase, 'FIXED_CENTRAL_ANCHOR_DURING_UNFOLDING')
        else:
            s.draw(nodes, fixed_floor, 'fixed-complete-pavement', phase, 'EXACT_EXPOSED_IDLE_PAVING_WITH_COMPLETE_HIDDEN_SURFACES')
            if phase >= 6:
                progress = (phase-5)/4
                distance = np.minimum(abs(x-63)/57, abs(y-90)/29)
                paint = terminal.masked(perimeter_paint, distance <= progress)
                s.draw(nodes, paint, 'finishing-perimeter-paint', phase, 'OWNER_FINISH_AFTER_FOUNDATION_UNFOLDS')
            scale = .26 + .74*(phase-5)/5
            # The transverse end pieces close the rectangle from its first
            # small phase; a pair of disconnected long bars is incomplete.
            base_corners = np.array([(63, 69), (106, 90), (63, 112), (20, 91)], float)
            moving_corners = [np.array([63., 90.]) + scale*(corner-[63., 90.]) for corner in base_corners]
            for i in [0, 2]:
                start, end = moving_corners[i], moving_corners[(i+1) % 4]
                rail = advanced.heavy.solid_beam(s, start, end, (1.3, -2.6), material=0, thickness=.8)
                rail[..., :3] = (rail[..., :3]*.32).astype('uint8')
                s.draw(nodes, rail, 'transverse-rail-end-' + str(i), phase,
                       'COMPLETE_CLOSED_RAIL_END_FOLLOWS_RECTANGLE_CORNERS')
            for i, rail in enumerate(rails):
                direction = np.array([2., -1.]) / np.sqrt(5)
                normal = np.array([1., 2.]) / np.sqrt(5)
                matrix = scale*np.outer(direction, direction) + np.outer(normal, normal)
                center = np.array([63., 90.])
                source_center = np.array([47., 79.]) if i == 0 else np.array([81., 98.])
                target_center = center + scale*(source_center-center)
                transform = np.column_stack((matrix, target_center-matrix@source_center))
                s.draw(nodes, base.transform(rail, transform, s.rig.canvas), 'telescopic-rail-' + str(i), phase,
                       'FIXED_WIDTH_SHAFT_EXTENDS_WITHOUT_SCALING_ANCHOR_HEADS', extension=scale)
            anchor_scale = (phase-5)/5
            if phase == 5:
                s.draw(nodes, center_cap, 'central-rail-anchor', phase, 'CENTRAL_ANCHOR_BEFORE_SEPARATION')
            else:
                for i, (cap, corner) in enumerate(zip(caps, corners)):
                    travel = (1-anchor_scale)*(np.array([63., 90.])-corner)
                    s.draw(nodes, terminal.move(cap, dx=travel[0], dy=travel[1]), 'rigid-anchor-' + str(i), phase,
                           'CONSTANT_SIZE_CLEAT_TRANSLATES_OUTWARD', translation=travel.tolist())
        s.phases.append(nodes)
    return s.finish()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('output', type=Path)
    parser.add_argument('--families', default='NAPSIS,NACLON,NAPOWR,NATBNK')
    args = parser.parse_args()
    args.output.mkdir(exist_ok=False)
    source = args.output / 'authoring-source.py'
    shutil.copy2(__file__, source)
    families = set(args.families.split(','))
    rigs = {}
    for record in read(AUTHORITY)['families']:
        if record['identity'] not in families:
            continue
        out = args.output / record['key']
        if record['identity'] == 'NAPOWR':
            reference = BATCH / 'reference-yr-newurban-v5/report.json'
            s = PowerScene(record, ROOT / 'infrastructure-r82-v1', reference, out, diagnostic=True)
            rigs[record['key']] = base.power_plant(s)
        else:
            s = Scene(record, out, source)
            if record['identity'] == 'NAPSIS':
                rigs[record['key']] = sensor(s)
            elif record['identity'] == 'NACLON':
                rigs[record['key']] = support.cloning_vat(s)
            else:
                rigs[record['key']] = tank_bunker(s)
        print(record['key'], len(rigs[record['key']]['phases']), flush=True)
    write(args.output / 'rigs.json', rigs)
    write(args.output / 'receipt.json', {'status': 'AUTHORED_SOURCE_SPECIFIC_COVERAGE_CANDIDATES',
        'records': list(rigs), 'nativeFrameContractChanged': False, 'visualAcceptance': 'PENDING'})


if __name__ == '__main__':
    main()
