"""Independent Original-phase mechanisms for the four advanced Yuri buildings."""

import argparse
import shutil
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation, label, map_coordinates
from scipy.spatial import ConvexHull

from buildup import native_indices, read, sha, write
from painted_rig import over, place, bounds, vector_coverage

support = SourceFileLoader("advanced_support", "scripts/art/author-yuri-support.py").load_module()
heavy, base, terminal = support.heavy, support.base, support.terminal
ROOT = support.ROOT
BATCH = ROOT / "yuri-advanced-r110-v1"
REPAIR = ROOT / "yuri-foundation-r111-v1"
AUTHORITY = BATCH / "reference-authoring-v1.json"
fraction = support.fraction


class Scene(support.Scene):
    def __init__(self, record, output, source):
        reference = BATCH / ("reference-" + record["theater"].lower() + "-v1/report.json")
        self.rig, self.full = base.parts.seed_rig(record, reference, output)
        self.record, self.output, self.origin = record, output, np.zeros(2)
        self.yy, self.xx = np.mgrid[: self.full.shape[0], : self.full.shape[1]] / 4
        self.phases, self.checks, self.violations = [], [], []
        self.diagnostic = True
        self.owner_allowed = [
            bool(
                ((native_indices(self.rig.raw, p) >= 16) & (native_indices(self.rig.raw, p) < 32)).any()
            )
            for p in range(record["frames"])
        ]
        self.reference = read(reference)["cases"][record["identity"]]
        self.file = BATCH / "hidden-components-v1.png"
        atlas = Image.open(self.file).convert("RGBA")
        self.cells = []
        for i in range(8):
            a = np.array(atlas.crop((i % 4 * 384, i // 4 * 512, (i % 4 + 1) * 384, (i // 4 + 1) * 512)))
            ids, _ = label(a[..., 3] >= 180)
            sizes = np.bincount(ids.ravel())
            sizes[0] = 0
            keep = binary_dilation(ids == sizes.argmax(), iterations=1)
            a[~keep] = 0
            a[..., 3][a[..., 3] >= 230] = 255
            im = Image.fromarray(a)
            self.cells.append(im.crop(im.getbbox()))
        materials = Image.open(ROOT / "heavy-structure-r99-v1/hidden-materials-v1.png").convert("RGBA")
        w, h = materials.width // 2, materials.height // 2
        self.materials = [
            materials.crop((i % 2 * w, i // 2 * h, (i % 2 + 1) * w, (i // 2 + 1) * h)) for i in range(4)
        ]
        # Unobstructed painted paving and gold faces become fixed UV surfaces.
        self.materials[3] = atlas.crop((920, 278, 975, 304)).convert("RGB").convert("RGBA")
        self.materials.append(atlas.crop((905, 287, 965, 317)).convert("RGB").convert("RGBA"))
        red = Image.open(
            BATCH / "retained" / ("yuri-yappet-" + record["theater"].lower() + ".png")
        ).convert("RGBA")
        self.materials[2] = red.crop((128 * 4, 108 * 4, 141 * 4, 114 * 4)).convert("RGB").convert("RGBA")
        atlas2 = Image.open(BATCH / "complete-mechanisms-v1.png").convert("RGBA")
        self.mechanisms = []
        for box in [
            (0, 80, 620, 520),
            (650, 90, 1000, 520),
            (1130, 0, 1430, 525),
            (0, 550, 620, 1024),
            (660, 525, 1010, 1024),
            (1030, 540, 1536, 1024),
        ]:
            a = np.array(atlas2.crop(box))
            ids, _ = label(a[..., 3] >= 180)
            sizes = np.bincount(ids.ravel())
            sizes[0] = 0
            keep = binary_dilation(ids == sizes.argmax(), iterations=1)
            a[~keep] = 0
            a[..., 3][a[..., 3] >= 230] = 255
            im = Image.fromarray(a)
            self.mechanisms.append(im.crop(im.getbbox()))
        self.materials[3] = (
            Image.open(BATCH / "retained/yuri-yagntc-temperate.png")
            .crop((128 * 4, 194 * 4, 137 * 4, 199 * 4))
            .convert("RGB")
            .convert("RGBA")
        )
        self.source = {
            "code": str(source),
            "sha256": sha(source),
            "hiddenComponents": str(self.file),
            "hiddenComponentsSha256": sha(self.file),
            "prompt": str(BATCH / "hidden-components-v1.prompt.txt"),
        }

    def mechanism(self, index, box):
        return place(self.mechanisms[index], box, self.rig.canvas)

    def quad(self, layer, source, target):
        return heavy.art.original.quad(layer, source, target, self.rig.canvas)

    def panel(self, quad, material=0, depth=1.5):
        front = heavy.art.material_quad(self, material, quad, (60, 18))
        back = terminal.move(front, dy=depth)
        back[..., :3] = (back[..., :3] * 0.45).astype("uint8")
        return over(front, back)

    def frame_top(self, p):
        idx = native_indices(self.rig.raw, p)
        yy, xx = np.where(idx > 0)
        return int(yy.min()) if len(yy) else 0

    def blank(self):
        return np.zeros_like(self.full)

    def hinge(self, layer, angle, pivot, axis=(2.0, 1.0), fold=(0.5, -0.25), ground=False):
        if abs(angle) < 1e-8:
            return layer
        return base.hinged(
            layer,
            np.deg2rad(angle),
            pivot,
            self.rig.canvas,
            depth=0.6,
            axis_direction=axis,
            fold_direction=fold,
            ground_plane=ground,
        )

    def rotate(self, layer, angle, pivot):
        a = np.deg2rad(angle)
        c, t = np.cos(a), np.sin(a)
        m = np.array([[c, -t], [t, c]])
        return base.transform(layer, np.column_stack((m, np.array(pivot) - m @ pivot)), self.rig.canvas)

    def floor_draw(self, nodes, layer, p):
        # The Original floor opening controls ground only, never a moving mechanism.
        self.put(
            nodes,
            base.parts.clipped(self.rig, layer, p),
            "fixed-ground-paving",
            p,
            "ORIGINAL_GROUND_OPENING_FIXED_UV",
            ground=True,
            fixedGroundComponent=True,
        )

    def partition(self, polygons):
        layers = []
        occupied = np.zeros(self.xx.shape, bool)
        for polygon in polygons:
            mask = self.region(polygon) & ~occupied
            layers.append(terminal.masked(self.full, mask))
            occupied |= mask
        return layers, terminal.masked(self.full, ~occupied)


def foundation(s, poly, height=2):
    """Project one painted foundation surface with stable, non-repeating UVs."""
    if not hasattr(s, "foundation_uv"):
        atlas = Image.open(REPAIR / "foundation-materials-v1.png").convert("RGBA")
        half = atlas.width // 2
        sensor_plate = s.record["identity"] == "NAPSIS"
        surface = atlas.crop(
            (half if sensor_plate else 0, 0, atlas.width if sensor_plate else half, atlas.height)
        )
        quads = {
            "NAPSIS": [(151, 114), (166, 121), (109, 153), (95, 145)],
            "YATECH": [(149, 142), (248, 191), (177, 242), (78, 193)],
            "YAGNTC": [(134, 125), (211, 164), (142, 202), (58, 164)],
            "YAPPET": [(134, 77), (229, 141), (134, 205), (39, 141)],
        }
        q = np.asarray(quads[s.record["identity"]], float)
        inverse = np.linalg.inv(np.column_stack((q[1] - q[0], q[3] - q[0])))
        uv = inverse @ np.array([s.xx.ravel() - q[0, 0], s.yy.ravel() - q[0, 1]])
        texture = np.asarray(surface)
        coords = [
            np.clip(uv[1], 0, 1) * (texture.shape[0] - 1),
            np.clip(uv[0], 0, 1) * (texture.shape[1] - 1),
        ]
        rgb = np.stack(
            [map_coordinates(texture[..., c].astype(float), coords, order=1) for c in range(3)],
            axis=-1,
        ).reshape((*s.xx.shape, 3))
        s.foundation_uv = np.concatenate(
            (rgb.astype("uint8"), np.full((*s.xx.shape, 1), 255, dtype="uint8")), axis=-1
        )
        s.source["foundationMaterial"] = str(REPAIR / "foundation-materials-v1.png")
        s.source["foundationMaterialSha256"] = sha(REPAIR / "foundation-materials-v1.png")
    result = terminal.masked(s.foundation_uv, s.region(poly))
    if height:
        side = terminal.move(result, dy=height)
        side[..., :3] = (side[..., :3] * 0.55).astype("uint8")
        result = over(result, side)
    return result


def sensor(s):
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
    mast = heavy.largest_piece(
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
    floor = foundation(s, [(95, 145), (151, 114), (166, 121), (109, 153)], height=1)
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
    dark[..., :3] = (dark[..., :3] * 0.42).astype("uint8")
    s.materials.append(Image.fromarray(dark))
    deck_material = len(s.materials) - 1
    for phase in range(s.record["frames"]):
        nodes = s.end(phase, 23)
        if nodes is not None:
            s.phases.append(nodes)
            continue
        nodes = []
        s.floor_draw(nodes, floor, phase)
        if phase >= 10:
            pad = foundation(s, [(91, 139), (131, 117), (168, 136), (129, 155)], height=1)
            s.draw(nodes, pad, "closed-lower-pad", phase, "CONTINUOUS_PAD_UNDER_MOVING_HOUSINGS")
        if phase <= 11:
            ix = native_indices(s.rig.raw, phase)
            rgb = np.asarray(s.record["palette"], float)[ix]
            red = (ix >= 16) & (ix < 32)
            gray = (
                (ix > 31)
                & (rgb[..., 2] > rgb[..., 0] * 0.94)
                & (rgb[..., 1] > rgb[..., 0] * 0.85)
                & (rgb.mean(axis=-1) < 145)
            )
            for kind, mask, material in [("deck", gray, deck_material), ("buttress", red, 2)]:
                ids, count = label(binary_dilation(mask, iterations=1))
                sizes = np.bincount(ids.ravel())
                sizes[0] = 0
                chosen = np.argsort(sizes)[::-1][: 1 if kind == "deck" else 4]
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
                s.panel(poses[11], deck_material, 2),
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
            t = fraction(phase, start, 12)
            if t < 1:
                top = np.array(pivot) + np.array([(-16 if i == 0 else 16) * (1 - t), -24 * t])
                folded = heavy.solid_beam(s, pivot, top, (10, 4), material=2, thickness=3)
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
                s.draw(
                    nodes,
                    base.transform(
                        layer,
                        np.array(
                            [
                                [1, 0, 0],
                                [
                                    0,
                                    0.35 + 0.65 * fraction(phase, 10, 14),
                                    floor_y * (0.65 - 0.65 * fraction(phase, 10, 14)),
                                ],
                            ]
                        ),
                        s.rig.canvas,
                    ),
                    "stone-housing-" + str(i),
                    phase,
                    "SEPARATE_STONE_HOUSING_EXTENDS_UP",
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
            t = fraction(phase, start, 22)
            # Complete arm moves out from its collar; no horizontal knife cut.
            m = np.array([[max(0.15, t), 0, 132 * (1 - max(0.15, t))], [0, 1, 0]])
            blade_mask = [x <= 122, x >= 144, x >= 155][i]
            blade = terminal.masked(arm, blade_mask)
            bridge = terminal.masked(arm, ~blade_mask)
            travel = [-14, 14, 25][i] * (1 - max(0.15, t))
            layer = over(terminal.move(blade, dx=-travel), base.transform(bridge, m, s.rig.canvas))
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


def laboratory(s):
    x, y = s.xx, s.yy
    cap = s.retained([(143, 75), (155, 73), (165, 77), (172, 88), (167, 97), (144, 97), (141, 89)])
    needle = s.retained([(152, 0), (165, 0), (165, 71), (160, 77), (152, 76)])
    left_spire = s.retained([(136, 8), (151, 8), (151, 44), (136, 44)])
    spine = s.retained([(135, 41), (148, 41), (148, 159), (151, 170), (134, 174), (125, 164)])
    right_needle = s.retained([(199, 80), (209, 80), (209, 131), (199, 133)])
    bridge_poly = [
        (161, 83),
        (173, 85),
        (186, 111),
        (197, 125),
        (213, 130),
        (213, 151),
        (199, 150),
        (169, 133),
        (161, 115),
    ]
    bridge = s.retained(bridge_poly)
    bridge = terminal.masked(bridge, ~((y < 97) & (s.full[..., 0].astype(float) > s.full[..., 1] * 1.7)))
    cyl_mask = s.region([(143, 94), (166, 94), (166, 175), (145, 185), (143, 170)])
    cylinder = over(terminal.masked(s.full, cyl_mask), s.mechanism(2, (142, 75, 170, 189)))
    # Remove antenna and roof fragments from the top cap, including rear spire overlap.
    cylinder = over(
        terminal.masked(cylinder, ~s.region(bridge_poly)), s.mechanism(2, (142, 75, 170, 189))
    )
    cylinder = over(cap, terminal.masked(cylinder, y >= 96))
    wing_mask = s.region([(165, 139), (198, 153), (212, 144), (214, 198), (199, 207), (165, 188)])
    wing = over(
        terminal.masked(s.full, wing_mask & (x >= 183) & (y >= 155)),
        s.mechanism(3, (162, 135, 214, 209)),
    )
    brace_polys = [
        [(118, 158), (151, 160), (151, 194), (118, 194)],
        [(154, 114), (166, 129), (165, 176), (156, 202), (138, 209), (138, 201), (151, 173)],
        [(170, 139), (180, 149), (182, 181), (174, 211), (157, 218), (156, 211), (168, 182)],
        [(197, 159), (215, 162), (218, 185), (229, 206), (214, 216), (195, 197)],
    ]
    braces = [s.retained(q) for q in brace_polys]
    # A complete fixed footprint is initially exposed; machinery masks never touch it.
    floor = foundation(s, [(109, 188), (156, 164), (228, 201), (170, 225)], height=1)
    retained_ground = terminal.masked(
        s.full, s.region([(108, 187), (137, 197), (170, 215), (228, 196), (230, 226), (108, 226)])
    )
    small = [
        s.retained(q)
        for q in [
            [(108, 167), (124, 167), (131, 192), (119, 199), (108, 193)],
            [(164, 203), (195, 203), (197, 223), (163, 226)],
            [(216, 179), (228, 179), (229, 197), (217, 199)],
        ]
    ]
    cap_top = [
        185,
        182,
        177,
        173,
        169,
        165,
        161,
        158,
        154,
        151,
        146,
        139,
        133,
        127,
        114,
        108,
        103,
        97,
        91,
        84,
        78,
        78,
        78,
        78,
        78,
    ]
    wall_texture = (
        Image.fromarray(s.full).crop((185 * 4, 157 * 4, 193 * 4, 185 * 4)).convert("RGB").convert("RGBA")
    )
    s.materials.append(wall_texture)
    wall_material = len(s.materials) - 1
    for p in range(s.record["frames"]):
        nodes = s.end(p, 24)
        if nodes is not None:
            s.phases.append(nodes)
            continue
        nodes = []
        if p == 0:
            s.floor_draw(
                nodes, foundation(s, [(115, 175), (130, 168), (136, 171), (121, 178)], height=0.7), p
            )
            s.phases.append(nodes)
            continue
        progress = fraction(p, 1, 20)
        left = (115 - 6 * progress, 177 + 11 * progress)
        rear = (145 + 11 * progress, 162 + 2 * progress)
        right = (208 + 20 * progress, 194 + 7 * progress)
        front = (170, 210 + 15 * progress)
        s.draw(
            nodes,
            foundation(s, [left, rear, right, front], height=1),
            "continuous-footprint",
            p,
            "CLOSED_HD_FLOOR_WITHOUT_ORIGINAL_MACHINERY_HOLES",
            fixedGroundComponent=True,
        )
        drop = cap_top[p] - 78
        wingdrop = float(np.interp(p, [1, 4, 8, 12, 16, 20], [43, 40, 33, 23, 12, 0]))
        cyl = s.rise(cylinder, drop, 191)
        # Original red cap unfolds during the first two phases.
        if p < 3:
            scale = [0.25, 0.4, 0.75][p]
            m = np.array([[scale, 0, 156 * (1 - scale)], [0, scale, (cap_top[p] + 7) * (1 - scale)]])
            cyl = base.transform(cyl, m, s.rig.canvas)
        s.draw(
            nodes,
            cyl,
            "complete-telescoping-cylinder",
            p,
            "CLOSED_CYLINDRICAL_SURFACE_RISES_FROM_FOOTPRINT",
            drop=drop,
        )
        # Three closed faces keep the wing roof flat while the walls telescope.
        top = np.array([(164, 136), (199, 153), (213, 146), (178, 129)], float)
        top[:, 1] += wingdrop
        bottom = np.array([(164, 189), (199, 207), (213, 200), (178, 182)], float)
        faces = []
        for ia, ib in [(0, 1), (1, 2)]:
            faces.append(
                heavy.art.material_quad(
                    s, wall_material, [top[ia], top[ib], bottom[ib], bottom[ia]], (12, 36)
                )
            )
        wing_now = over(faces[1], faces[0])
        roof = s.panel(top, material=0, depth=0.8)
        wing_now = over(roof, wing_now)
        s.draw(
            nodes, wing_now, "closed-telescoping-wing", p, "FLAT_ISOMETRIC_ROOF_AND_TWO_COMPLETE_WALLS"
        )
        if p >= 2:
            top = s.frame_top(p) + 2
            s.draw(
                nodes,
                s.rise(needle, top - 5, 77 + drop),
                "main-needle",
                p,
                "NEEDLE_EXTENDS_FROM_CYLINDER_CAP",
            )
            sd = float(np.interp(p, [2, 12, 20, 23], [155, 86, 30, 0]))
            s.draw(
                nodes,
                s.rise(left_spire, sd, 77 + drop),
                "twin-left-spires",
                p,
                "TWIN_SPIRES_EXTEND_FROM_REAR_SPINE",
            )
        if p >= 4:
            # The arch starts almost vertical. Positive rotation brings its low
            # end underneath the pivot in the fixed screen coordinate system.
            t = fraction(p, 16, 22)
            source_root = np.array([169.0, 89.0])
            source_end = np.array([207.0, 140.0])
            top = float(np.interp(p, [4, 8, 12, 16, 20, 22], [178, 137, 100, 71, 83, 89]))
            target_root = np.array([166 + 3 * t, top])
            target_end = np.array([173 + 34 * t, top + 51])
            old = source_end - source_root
            new = target_end - target_root
            old_cross = np.array([-old[1], old[0]]) / np.linalg.norm(old)
            new_cross = np.array([-new[1], new[0]]) / np.linalg.norm(new)
            matrix = np.column_stack((new, new_cross)) @ np.linalg.inv(np.column_stack((old, old_cross)))
            arch = base.transform(
                bridge, np.column_stack((matrix, target_root - matrix @ source_root)), s.rig.canvas
            )
            arch = terminal.masked(arch, y <= 0.5 * (x - 162) + 184)
            s.draw(
                nodes,
                arch,
                "rigid-curved-roof-bridge",
                p,
                "COMPLETE_ARCH_PROJECTED_THROUGH_ORIGINAL_UPRIGHT_AND_SEATED_LANDMARKS",
                root=target_root.tolist(),
                end=target_end.tolist(),
            )
        if p >= 4:
            s.draw(
                nodes,
                terminal.move(cap, dy=drop),
                "foreground-round-cap",
                p,
                "CAP_OCCLUDES_REAR_ARCH_ROOT",
            )
        if p >= 6:
            s.draw(
                nodes,
                s.rise(spine, 125 * (1 - fraction(p, 6, 22)), 174),
                "rear-spine",
                p,
                "REAR_SPINE_EXTENDS_UP",
            )
        for i, (layer, start, end, floor_y) in enumerate(
            zip(braces, [8, 7, 8, 9], [16, 23, 23, 23], [195, 210, 219, 217])
        ):
            if p >= start:
                t = fraction(p, start, end)
                scale = (0.4 + 0.6 * t) if i in [1, 2] else (0.12 + 0.88 * t)
                source_top = [158, 114, 139, 159][i]
                target_top = (
                    floor_y - (floor_y - source_top) * scale
                    if i in [1, 2]
                    else source_top + [30, 58, 35, 36][i] * (1 - t)
                )
                matrix = np.array([[1, 0, 0], [0, scale, target_top - source_top * scale]])
                part = base.transform(layer, matrix, s.rig.canvas)
                s.draw(
                    nodes,
                    part,
                    "buttress-" + str(i),
                    p,
                    "TELESCOPING_BUTTRESS_ATTACHED_TO_WING_WITH_CLOSED_FOOT",
                )
        if p >= 7:
            nd = 58 * (1 - fraction(p, 7, 20))
            socket = 146 + wingdrop
            foot = min(133 + nd, socket)
            post = heavy.solid_beam(
                s, (204, socket), (204, foot - 1), (1.5, 0), material=4, thickness=0.4
            )
            s.draw(
                nodes, post, "right-antenna-support", p, "SUPPORT_TOUCHES_ACTUAL_EMERGING_ANTENNA_FOOT"
            )
            s.draw(
                nodes,
                s.rise(right_needle, nd, socket),
                "right-needle",
                p,
                "NEEDLE_EXTENDS_FROM_CLOSED_END_HOUSING",
            )
        for i, (layer, start) in enumerate(zip(small, [9, 13, 11])):
            if p >= start:
                s.draw(
                    nodes,
                    terminal.move(
                        s.rise(layer, 10 * (1 - fraction(p, start, 23)), [198, 224, 197][i]),
                        dx=[5 * (1 - fraction(p, start, 23)), 0, -6 * (1 - fraction(p, start, 24))][i],
                        dy=[0, -3, 0][i],
                    ),
                    "ground-equipment-" + str(i),
                    p,
                    "GROUND_EQUIPMENT_EXTENDS_LAST",
                )
        if p >= 20:
            seated = terminal.masked(s.full, (y >= 139) & ~s.region(bridge_poly))
            s.draw(
                nodes,
                seated,
                "seated-lower-architecture",
                p,
                "EXACT_SEATED_WALLS_FOOTINGS_AND_BUTTRESSES",
            )
        if p >= 22:
            s.draw(
                nodes, retained_ground, "finished-pavement", p, "SEATED_FOOTINGS_AND_FINISHED_PAVEMENT"
            )
        s.phases.append(nodes)
    return s.finish()


def mutator(s):
    x, y = s.xx, s.yy
    needle = s.retained([(128, 42), (139, 42), (141, 107), (128, 107)])
    petals = [
        s.retained(q)
        for q in [
            [(117, 66), (129, 66), (129, 104), (116, 104)],
            [(139, 66), (153, 66), (153, 104), (139, 104)],
        ]
    ]
    lower_tower = s.retained([(113, 104), (156, 104), (159, 137), (112, 137)])
    stairs = [
        s.retained(q)
        for q in [
            [(126, 132), (141, 132), (143, 201), (125, 201)],
            [(113, 134), (126, 134), (123, 166), (116, 181), (103, 176), (108, 165)],
            [(144, 134), (155, 134), (164, 176), (150, 181), (145, 166)],
        ]
    ]
    rib_polys = [
        [(58, 138), (91, 133), (96, 147), (91, 161), (58, 169)],
        [(177, 133), (211, 140), (212, 170), (177, 161), (174, 147)],
    ]
    ribs = [s.retained(q) for q in rib_polys]
    side_polys = [
        [(90, 139), (113, 135), (114, 172), (89, 164)],
        [(155, 135), (180, 139), (181, 164), (155, 172)],
    ]
    sides = [s.retained(q) for q in side_polys]
    core = s.cell(6, (115, 110, 154, 165))
    floor = foundation(s, [(58, 164), (134, 125), (211, 164), (142, 202), (127, 202)], height=1)
    lamp_pos = [
        (76, 170),
        (90, 177),
        (106, 186),
        (120, 192),
        (150, 192),
        (163, 186),
        (179, 177),
        (194, 170),
        (106, 134),
        (163, 134),
    ]
    lamps = [
        terminal.masked(s.full, ((x - cx) / 5) ** 2 + ((y - cy) / 4) ** 2 <= 1) for cx, cy in lamp_pos
    ]
    final_base = terminal.masked(
        s.full,
        (y >= 116)
        & ~s.region([(112, 42), (157, 42), (158, 128), (146, 132), (121, 132), (112, 128)])
        & ~np.logical_or.reduce([s.region(q) for q in rib_polys]),
    )
    # A filled early gold sleeve closes the central post cluster before petals open.
    sleeve = heavy.solid_beam(s, (134, 140), (134, 126), (30, 3), material=2, thickness=1)
    for p in range(s.record["frames"]):
        nodes = s.end(p, 25)
        if nodes is not None:
            s.phases.append(nodes)
            continue
        nodes = []
        if p == 0:
            s.phases.append(nodes)
            continue
        s.draw(
            nodes,
            floor,
            "continuous-mutator-footprint",
            p,
            "CLOSED_FIXED_UV_FLOOR",
            fixedGroundComponent=True,
        )
        for i, layer in enumerate(lamps):
            if p >= 2 + i // 2:
                s.draw(nodes, layer, "perimeter-lamp-" + str(i), p, "SEQUENTIAL_FIXED_PERIMETER_LIGHT")
        if p <= 13:
            s.draw(
                nodes,
                s.rise(core, 42 * (1 - fraction(p, 1, 6)), 165),
                "complete-four-post-core",
                p,
                "FOUR_POST_MECHANISM_EXTENDS_FROM_CENTER",
            )
        for i, layer in enumerate(stairs):
            start = 1 if i == 0 else 3
            if p >= start:
                t = fraction(p, start, 7)
                src_top = [132, 134, 134][i]
                src_bottom = [201, 181, 181][i]
                dst_top = src_top + [18, 11, 11][i] * (1 - t)
                dst_bottom = src_bottom - [41, 17, 17][i] * (1 - t)
                scale = (dst_bottom - dst_top) / (src_bottom - src_top)
                part = base.transform(
                    layer, np.array([[1, 0, 0], [0, scale, dst_top - src_top * scale]]), s.rig.canvas
                )
                s.draw(
                    nodes,
                    part,
                    "central-stair-post-" + str(i),
                    p,
                    "STEPS_EXTEND_FROM_CENTER_TOWARD_FIXED_OUTER_FOOTING",
                )
        if p >= 6:
            for i, (layer, pivot) in enumerate(zip(sides, [(113, 142), (156, 142)])):
                angle = (65 if i == 0 else -65) * (1 - fraction(p, 6, 12))
                s.draw(
                    nodes,
                    s.rotate(layer, angle, pivot),
                    "side-hinged-wall-" + str(i),
                    p,
                    "SIDE_PANEL_OPENS_OUT_FROM_CENTRAL_POSTS",
                    angle=angle,
                )
        if p >= 12:
            s.draw(
                nodes,
                s.rise(sleeve, 24 * (1 - fraction(p, 12, 14)), 145) if p == 12 else s.blank(),
                "closed-red-sleeve",
                p,
                "RED_SLEEVE_EXTENDS_BEFORE_GOLD_PETALS",
            )
            if p >= 13:
                s.draw(
                    nodes, final_base, "seated-central-base", p, "SEATED_POSTS_AND_CONTINUOUS_FOUNDATION"
                )
        for i, (layer, pivot) in enumerate(zip(ribs, [(91, 152), (178, 152)])):
            if p >= 13:
                angle = (58 if i == 0 else -58) * (1 - fraction(p, 13, 24))
                s.draw(
                    nodes,
                    base.transform(
                        layer,
                        np.array(
                            [
                                [
                                    np.cos(np.deg2rad(angle)),
                                    0,
                                    pivot[0] * (1 - np.cos(np.deg2rad(angle))),
                                ],
                                [
                                    (1 if i == 0 else -1) * 0.7 * np.sin(np.deg2rad(abs(angle))),
                                    1,
                                    -pivot[0]
                                    * (1 if i == 0 else -1)
                                    * 0.7
                                    * np.sin(np.deg2rad(abs(angle))),
                                ],
                            ]
                        ),
                        s.rig.canvas,
                    ),
                    "ribbed-panel-" + str(i),
                    p,
                    "RIBBED_PANEL_UNFOLDS_FROM_INNER_HINGE",
                    angle=angle,
                )
        if p >= 14:
            drop = 26 * (1 - fraction(p, 21, 25))
            socket = heavy.solid_beam(s, (134, 137), (134, 100 + drop), (7, 0), material=0, thickness=1)
            s.draw(
                nodes, socket, "closed-central-spindle", p, "CONTINUOUS_SPINDLE_BETWEEN_CROWN_AND_POSTS"
            )
            s.draw(
                nodes,
                s.rise(lower_tower, drop, 137),
                "lower-gold-skirt",
                p,
                "GOLD_SKIRT_EXTENDS_WITH_CENTRAL_CROWN",
            )
            for i, (layer, pivot) in enumerate(zip(petals, [(128, 103), (140, 103)])):
                angle = float(
                    np.interp(p, [14, 15, 16, 17, 18, 19, 20], [35, 65, 90, 115, 145, 165, 180])
                )
                # Rotate continuously through the crossed intermediate pose;
                # the compact gold blades finish upright without inversion.
                angle = (180 - angle) * (1 if i == 0 else -1)
                if p >= 20:
                    angle = 0
                moved = terminal.move(s.rotate(layer, angle, pivot), dy=drop)
                s.draw(
                    nodes,
                    moved,
                    "gold-crown-petal-" + str(i),
                    p,
                    "SEPARATE_GOLD_BLADE_FOLDS_FROM_CENTER_THROUGH_HORIZONTAL_POSE",
                    angle=angle,
                )
        if p >= 20:
            drop = float(np.interp(p, [21, 22, 23, 24, 25], [46, 34, 23, 11, 0]))
            s.draw(
                nodes,
                s.rise(needle, drop, 137),
                "central-needle",
                p,
                "CENTRAL_NEEDLE_EXTENDS_LAST",
                drop=drop,
            )
        s.phases.append(nodes)
    return s.finish()


def dominator(s):
    x, y = s.xx, s.yy
    cap = s.retained([(121, 31), (148, 31), (148, 51), (121, 51)])
    claw_polys = [
        [(122, 45), (128, 45), (128, 62), (135, 75), (131, 80), (122, 73)],
        [(140, 45), (147, 45), (148, 68), (143, 78), (136, 80), (139, 65)],
    ]
    claws = [s.retained(q) for q in claw_polys]
    dome_poly = [
        (112, 76),
        (125, 71),
        (144, 71),
        (156, 80),
        (163, 96),
        (158, 105),
        (140, 109),
        (121, 108),
        (108, 102),
        (104, 94),
    ]
    dome = terminal.masked(
        s.full, (((x - 134) / 23) ** 2 + ((y - 91) / 19) ** 2 <= 1) & (y >= 75) & (y <= 106)
    )
    antennas = [
        s.retained(q)
        for q in [
            [(109, 53), (116, 53), (116, 105), (109, 105)],
            [(149, 53), (157, 53), (157, 105), (149, 105)],
            [(130, 55), (136, 55), (136, 100), (130, 100)],
        ]
    ]
    dome = terminal.masked(dome, ~np.logical_or.reduce([a[..., 3] > 0 for a in antennas]))
    hidden = np.array(Image.open(BATCH / "complete-dome-v1.png").convert("RGBA"))
    hidden[..., 3][hidden[..., 3] >= 230] = 255
    hidden[hidden[..., 3] < 8] = 0
    hi = Image.fromarray(hidden)
    hi = hi.crop(hi.getbbox())
    hidden = place(hi, (108, 72, 160, 107), s.rig.canvas)
    dome = over(dome, hidden)
    coil_polys = [
        [(86, 94), (111, 91), (114, 104), (99, 132), (85, 135), (81, 127)],
        [(155, 92), (168, 94), (182, 125), (179, 136), (167, 133), (155, 108)],
        [(108, 106), (125, 106), (127, 117), (114, 160), (100, 164), (101, 150)],
        [(145, 105), (160, 107), (167, 150), (173, 161), (157, 166), (145, 130)],
    ]
    coils = []
    for start, end in [
        ((106, 96), (88, 126)),
        ((160, 96), (177, 126)),
        ((121, 111), (111, 152)),
        ((151, 111), (164, 152)),
    ]:
        start = np.asarray(start, float)
        end = np.asarray(end, float)
        axis = end - start
        fraction_axis = np.clip(
            ((x - start[0]) * axis[0] + (y - start[1]) * axis[1]) / (axis @ axis), 0, 1
        )
        dx = x - (start[0] + fraction_axis * axis[0])
        dy = y - (start[1] + fraction_axis * axis[1])
        mask = dx * dx + dy * dy <= 4.4**2
        for c in [start, end]:
            mask |= (x - c[0]) ** 2 + (y - c[1]) ** 2 <= 5.7**2
        coils.append(terminal.masked(s.full, mask))
    belt = s.retained([(109, 102), (158, 102), (160, 117), (110, 119)])
    lower = s.retained(
        [(85, 117), (109, 112), (159, 112), (183, 126), (196, 138), (172, 175), (101, 175), (71, 137)]
    )
    lower = terminal.masked(
        lower,
        ~np.logical_or.reduce([s.region(q) for q in coil_polys])
        & ~s.region([(109, 102), (158, 102), (160, 119), (110, 119)]),
    )
    floor = foundation(
        s, [(71, 136), (111, 109), (156, 109), (195, 136), (171, 174), (103, 174)], height=1
    )
    core = s.cell(7, (109, 82, 159, 152))
    open_crown = s.mechanism(5, (92, 30, 180, 79))
    claws = [s.retained(q) for q in claw_polys]
    rear_parts = [
        terminal.masked(open_crown, (x < 122) & (y > 44)),
        terminal.masked(open_crown, (x > 148) & (y > 44)),
    ]
    for p in range(s.record["frames"]):
        nodes = s.end(p, 23)
        if nodes is not None:
            s.phases.append(nodes)
            continue
        nodes = []
        s.floor_draw(nodes, floor, p)
        if p >= 1:
            drop = 62 * (1 - fraction(p, 1, 7))
            s.draw(
                nodes,
                terminal.masked(lower, y >= 174 - 70 * fraction(p, 1, 7)),
                "complete-lower-frame",
                p,
                "GOLD_FRAME_EXTENDS_ABOVE_FIXED_FOOTINGS",
            )
            if p < 21:
                s.draw(
                    nodes,
                    s.rise(core, drop, 157),
                    "complete-open-machine-core",
                    p,
                    "COMPLETE_INTERNAL_MACHINERY_EXPOSED_UNTIL_SHELL_CLOSES",
                )
        for i in [0, 1]:
            start = [3, 10][i]
            if p >= start:
                angle = [-54, 54][i] * (1 - fraction(p, start, start + 5))
                s.draw(
                    nodes,
                    s.rotate(coils[i], angle, [(87, 129), (177, 131)][i]),
                    "rear-coil-" + str(i),
                    p,
                    "REAR_COIL_PIVOTS_UP_BEHIND_HOUSING",
                    angle=angle,
                )
        if p >= 12:
            drop = float(np.interp(p, [12, 13, 14, 15, 16], [34, 26, 17, 9, 0]))
            s.draw(
                nodes,
                s.rise(dome, drop, 107),
                "complete-rising-dome",
                p,
                "WHOLE_HEMISPHERE_TRANSLATES_UP_FROM_FIXED_HOUSING_APERTURE",
                drop=drop,
                rigidTranslation=True,
                apertureY=107,
            )
        if p >= 18:
            fixed = terminal.masked(
                s.full,
                (y >= 71)
                & (y <= 102)
                & ~np.logical_or.reduce([v[..., 3] > 0 for v in antennas])
                & ~np.logical_or.reduce([s.region(q) for q in claw_polys]),
            )
            s.draw(
                nodes,
                over(fixed, hidden),
                "seated-complete-dome",
                p,
                "COMPLETE_CLOSED_DOME_UNDER_RETAINED_ATTACHMENTS",
            )
        if p >= 17:
            s.draw(
                nodes,
                s.rise(belt, 40 * (1 - fraction(p, 17, 21)), 154),
                "red-belt",
                p,
                "RED_EQUATORIAL_BELT_EXTENDS_UP_AROUND_CLOSED_SHELL",
            )
        for i in [2, 3]:
            start = [0, 0, 7, 11][i]
            if p >= start:
                angle = [0, 0, -46, 46][i] * (1 - fraction(p, start, start + 5))
                s.draw(
                    nodes,
                    s.rotate(coils[i], angle, [(0, 0), (0, 0), (109, 155), (163, 155)][i]),
                    "front-coil-" + str(i),
                    p,
                    "FRONT_COIL_PIVOTS_UP_FROM_OWN_FOOTING",
                    angle=angle,
                )
        if p >= 2:
            top = max(30, s.frame_top(p) + 2)
            spread = fraction(p, 3, 8) * (1 - fraction(p, 17, 22))
            drop = top - 33
            # The rear pair is a separate shortened projection of the same
            # retained articulated arm, occluded as the crown closes.
            for i, layer in enumerate(claws):
                angle = [64, -64][i] * spread
                pivot = [(125, 46), (144, 46)][i]
                moving = s.rotate(layer, angle, pivot)
                if spread > 0.05:
                    factor = 0.25 + 0.75 * spread
                    matrix = np.array([[factor, 0, 134 * (1 - factor)], [0, 1, 0]])
                    rear = base.transform(rear_parts[i], matrix, s.rig.canvas)
                    s.draw(
                        nodes,
                        terminal.move(rear, dy=drop),
                        "rear-crown-claw-" + str(i),
                        p,
                        "REAR_CLAW_CLOSES_BEHIND_HUB",
                    )
                joint = heavy.solid_beam(s, pivot, [134, 46], (3, 2), material=0, thickness=1)
                s.draw(
                    nodes,
                    terminal.move(over(moving, joint), dy=drop),
                    "articulated-claw-" + str(i),
                    p,
                    "COMPLETE_CLAW_ROTATES_ABOUT_ATTACHED_HUB",
                    angle=angle,
                )
            s.draw(
                nodes,
                terminal.move(cap, dy=drop),
                "complete-claw-hub",
                p,
                "HUB_REMAINS_ATTACHED_TO_ALL_CLAWS",
            )
        for i, layer in enumerate(antennas):
            if p >= 18:
                s.draw(
                    nodes,
                    s.rise(layer, 38 * (1 - fraction(p, 18, 22)), 105),
                    "dome-antenna-" + str(i),
                    p,
                    "ANTENNA_EXTENDS_AFTER_DOME_CLOSES",
                )
        s.phases.append(nodes)
    return s.finish()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    parser.add_argument("--families", default="NAPSIS,YATECH,YAGNTC,YAPPET")
    parser.add_argument("--theater", default="")
    args = parser.parse_args()
    args.output.mkdir(exist_ok=False)
    source = args.output / "authoring-source.py"
    shutil.copy2(__file__, source)
    rigs = {}
    for record in read(AUTHORITY)["families"]:
        if (
            record["identity"] not in args.families.split(",")
            or args.theater
            and record["theater"] != args.theater
        ):
            continue
        scene = Scene(record, args.output / record["key"], source)
        rigs[record["key"]] = {
            "NAPSIS": sensor,
            "YATECH": laboratory,
            "YAGNTC": mutator,
            "YAPPET": dominator,
        }[record["identity"]](scene)
        print(
            record["key"],
            len(scene.violations),
            "geometry violations",
            sum(q.get("envelopeRemovedOpaquePixels", 0) for q in scene.checks),
            "envelope pixels",
            flush=True,
        )
    write(args.output / "rigs.json", rigs)


if __name__ == "__main__":
    main()
