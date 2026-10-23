"""Original-phase Yuri support buildings from independent retained HD mechanisms."""

import argparse
import shutil
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import binary_fill_holes

from buildup import native_indices, read, sha, write
from painted_rig import over, place, bounds

heavy = SourceFileLoader("support_heavy", "scripts/art/author-heavy-structure.py").load_module()
defense, base, terminal = heavy.defense, heavy.base, heavy.terminal
ROOT = Path(".artifacts/buildup-remaining-20261013-r74-v1")
BATCH = ROOT / "yuri-support-r106-v1"
AUTHORITY = ROOT / "yuri-support-rebuild-r108-v1/selected-v2/authoring.json"
REBUILD = ROOT / "yuri-support-rebuild-r108-v1"
MOTION = ROOT / "yuri-support-motion-r107-v1"
GRINDER = ROOT / "yuri-grinder-rebuild-r109-v1"


def fraction(p, start, end):
    return float(np.clip((p - start) / (end - start), 0, 1))


class Scene(defense.Scene):
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
        self.file = BATCH / "hidden-components-v2.png"
        atlas = Image.open(self.file).convert("RGBA")
        self.cells = []
        for i in range(9):
            box = (
                i % 3 * atlas.width // 3,
                i // 3 * atlas.height // 3,
                (i % 3 + 1) * atlas.width // 3,
                (i // 3 + 1) * atlas.height // 3,
            )
            rgba = heavy.largest_piece(np.array(atlas.crop(box)))
            rgba[..., 3][rgba[..., 3] >= 230] = 255
            im = Image.fromarray(rgba)
            self.cells.append(im.crop(im.getbbox()))
        materials = Image.open(ROOT / "heavy-structure-r99-v1/hidden-materials-v1.png").convert("RGBA")
        w, h = materials.width // 2, materials.height // 2
        self.materials = [
            materials.crop((i % 2 * w, i // 2 * h, (i % 2 + 1) * w, (i // 2 + 1) * h)) for i in range(4)
        ]
        hidden = Image.open(MOTION / "hidden-platforms-v1.png").convert("RGBA")
        self.hidden = []
        for i in range(2):
            cell = hidden.crop((i * hidden.width // 2, 0, (i + 1) * hidden.width // 2, hidden.height))
            rgba = heavy.largest_piece(np.array(cell))
            rgba[..., 3][rgba[..., 3] >= 230] = 255
            cell = Image.fromarray(rgba)
            self.hidden.append(cell.crop(cell.getbbox()))
        if record["identity"] == "NACLON":
            atlas = Image.open(REBUILD / "hidden-mechanisms-v1.png").convert("RGBA")
            boxes = [
                (0, 50, 725, 540),
                (755, 90, 1050, 540),
                (1110, 130, 1536, 550),
                (0, 560, 690, 1024),
                (750, 560, 1050, 1000),
                (1100, 560, 1536, 1000),
            ]
            self.mechanisms = []
            for box in boxes:
                rgba = heavy.largest_piece(np.array(atlas.crop(box)))
                rgba[..., 3][rgba[..., 3] >= 230] = 255
                im = Image.fromarray(rgba)
                self.mechanisms.append(im.crop(im.getbbox()))
            self.materials.append(self.mechanisms[5])
        self.source = {
            "completeHiddenPlatforms": str(MOTION / "hidden-platforms-v1.png"),
            "completeHiddenPlatformsSha256": sha(MOTION / "hidden-platforms-v1.png"),
            "rebuildMechanisms": str(REBUILD / "hidden-mechanisms-v1.png"),
            "rebuildMechanismsSha256": sha(REBUILD / "hidden-mechanisms-v1.png"),
            "code": str(source),
            "sha256": sha(source),
            "hiddenComponents": str(self.file),
            "hiddenComponentsSha256": sha(self.file),
        }

    def mechanism(self, index, box):
        return place(self.mechanisms[index], box, self.rig.canvas)

    def cell(self, index, box):
        return place(self.cells[index], box, self.rig.canvas)

    def draw(self, nodes, layer, name, phase, method, **details):
        if getattr(self, "canvas_shift", 0):
            layer = terminal.move(layer, dx=-self.canvas_shift)
        clipped = base.parts.clipped(self.rig, layer, phase)
        lost = (layer[..., 3] >= 8) & (clipped[..., 3] == 0)
        if lost.any():
            self.checks.append(
                {"phase": phase, "name": name, "envelopeRemovedOpaquePixels": int(lost.sum())}
            )
        self.put(nodes, clipped, name, phase, method, **details)

    def end(self, phase, settled):
        nodes = self.terminal(phase)
        if nodes is not None:
            return nodes
        if phase >= settled:
            nodes = []
            self.draw(nodes, self.full, "seated-complete-body", phase, "EXACT_RETAINED_COMPLETE_ANATOMY")
            return nodes
        return None

    def rise(self, layer, drop, floor):
        return terminal.masked(terminal.move(layer, dy=drop), self.yy <= floor)


def tank_bunker(s):
    original_full = s.full
    s.canvas_shift = 5 if s.record["theater"] == "SNOW" else 0
    if s.canvas_shift:
        s.full = terminal.move(s.full, dx=s.canvas_shift)
    x, y = s.xx, s.yy
    footprint = [(11, 90), (68, 61), (125, 90), (125, 95), (69, 121), (11, 95)]
    red = (s.full[..., 0].astype(float) > s.full[..., 1] * 1.7) & (
        s.full[..., 0].astype(float) > s.full[..., 2] * 1.7
    )
    edge = terminal.masked(s.full, red)
    rail_polys = [[(38, 90), (73, 73), (83, 78), (48, 97)], [(61, 103), (97, 85), (106, 90), (71, 110)]]
    rails = [s.retained(q) for q in rail_polys]
    inner = s.region([(22, 91), (69, 65), (117, 91), (70, 116)])
    outside = s.region(footprint)
    pavement = np.array(Image.open(BATCH / "retained/yuri-natbnk-temperate.png").convert("RGBA"))
    patch = pavement[88 * 4 : 94 * 4, 67 * 4 : 73 * 4].copy()
    patch[..., 3] = 255
    repeats = (s.full.shape[0] // patch.shape[0] + 1, s.full.shape[1] // patch.shape[1] + 1, 1)
    texture = np.tile(patch, repeats)[: s.full.shape[0], : s.full.shape[1]].copy()
    texture = terminal.masked(texture, outside)
    floor = over(terminal.masked(s.full, ~inner & ~red), texture)
    # Completed pavement UVs stay fixed while edge strips and rails assemble.
    hazard = terminal.masked(s.full, inner & ~np.logical_or.reduce([s.region(q) for q in rail_polys]))
    corners = np.array([(69, 71), (109, 91), (70, 111), (30, 91)], float)
    edges = [
        [(11, 89), (68, 60), (71, 64), (13, 94)],
        [(68, 60), (125, 88), (124, 94), (66, 65)],
        [(125, 88), (125, 96), (70, 121), (68, 116)],
        [(11, 89), (69, 116), (70, 121), (11, 97)],
    ]
    for p in range(s.record["frames"]):
        nodes = s.end(p, 8)
        if nodes is not None:
            s.phases.append(nodes)
            continue
        nodes = []
        s.draw(
            nodes,
            floor,
            "fixed-empty-pad",
            p,
            "FIXED_PAVEMENT_WITHOUT_EARLY_RAILS",
            fixedGroundComponent=True,
        )
        for i, poly in enumerate(edges):
            if p >= i + 2:
                s.draw(
                    nodes,
                    terminal.masked(edge, s.region(poly)),
                    "perimeter-strip-" + str(i),
                    p,
                    "ORIGINAL_CLOCKWISE_PERIMETER_ASSEMBLY",
                )
        if p >= 6:
            s.draw(nodes, edge, "closed-perimeter-corners", p, "COMPLETE_PERIMETER_CORNER_JOINTS")
        if p >= 2:
            t = fraction(p, 2, 6)
            motion = np.array([11, 5.5]) * (1 - t)
            s.draw(
                nodes,
                terminal.move(rails[0], *motion),
                "first-sliding-rail",
                p,
                "RIGID_RAIL_SLIDES_FROM_CENTER",
                translation=motion.tolist(),
            )
        if p >= 5:
            t = fraction(p, 5, 8)
            motion = np.array([-11, -5.5]) * (1 - t)
            s.draw(
                nodes,
                terminal.move(rails[1], *motion),
                "second-sliding-rail",
                p,
                "SECOND_RIGID_RAIL_SEPARATES_FROM_CENTER",
                translation=motion.tolist(),
            )
        if p >= 2:
            radius = float(np.interp(p, [2, 3, 4, 5, 6, 7, 8], [1.2, 1.8, 2.5, 3.3, 4.7, 10, 30]))
            mask = np.zeros(x.shape, bool)
            for cx, cy in corners:
                mask |= ((x - cx) / radius) ** 2 + ((y - cy) / (radius * 0.5)) ** 2 <= 1
            s.draw(
                nodes,
                terminal.masked(hazard, mask),
                "hazard-corner-markings",
                p,
                "FIXED_UV_MARKINGS_GROW_FROM_FOUR_CORNERS",
                radius=radius,
            )
        s.phases.append(nodes)
    s.full = original_full
    return s.finish()


def psychic_tower(s):
    x, y = s.xx, s.yy
    feet_polys = [
        [(95, 133), (112, 128), (121, 137), (109, 142), (95, 143)],
        [(123, 131), (131, 128), (146, 134), (146, 143), (130, 141)],
        [(115, 128), (124, 128), (126, 151), (122, 155), (114, 154), (113, 147)],
    ]
    feet = [s.retained(q) for q in feet_polys]
    body = s.retained([(111, 115), (130, 115), (131, 134), (124, 141), (113, 138), (109, 132)])
    disk = s.cell(0, (98, 97, 143, 124))
    skirt = s.retained([(97, 108), (143, 108), (143, 120), (125, 125), (111, 122), (96, 116)])
    disk = over(skirt, disk)
    gold = s.cells[2]
    gw, gh = gold.size
    shaft = gold.crop((int(gw * 0.41), int(gh * 0.04), int(gw * 0.61), int(gh * 0.64)))
    early_posts = [place(shaft, (cx - 2, 108, cx + 2, 137), s.rig.canvas) for cx in [112, 120, 128]]
    # Each coil is a complete pillar; retain the original cap, rings and collar.
    centers = [(112, 44), (128, 44), (106, 51), (134, 51), (120, 58)]
    coils = []
    for cx, cy in centers:
        outline = [
            (cx, cy),
            (cx + 2, cy + 1),
            (cx + 3.5, cy + 4),
            (cx + 3.5, cy + 20),
            (cx + 4.5, cy + 23),
            (cx + 4.5, cy + 30),
            (cx + 3.8, cy + 33),
            (cx + 4.3, cy + 40),
            (cx + 4, cy + 49),
            (cx + 3.5, cy + 56),
            (cx - 3.5, cy + 56),
            (cx - 4, cy + 49),
            (cx - 4.3, cy + 40),
            (cx - 3.8, cy + 33),
            (cx - 4.5, cy + 30),
            (cx - 4.5, cy + 23),
            (cx - 3.5, cy + 20),
            (cx - 3.5, cy + 4),
            (cx - 2, cy + 1),
        ]
        coils.append(s.retained(outline))
    antenna = s.retained(
        [(119, 6), (121, 6), (125, 39), (125, 58), (121, 62), (116, 43), (115, 27), (117, 29), (120, 47)]
    )
    cables = [
        s.retained(q)
        for q in [
            [(102, 77), (107, 76), (110, 91), (114, 99), (111, 102), (104, 94), (101, 85)],
            [(132, 76), (136, 77), (139, 86), (137, 96), (128, 105), (126, 101), (134, 92)],
            [(110, 65), (113, 64), (118, 84), (118, 97), (115, 96)],
            [(125, 65), (128, 65), (130, 87), (127, 95), (125, 93)],
        ]
    ]
    for p in range(s.record["frames"]):
        nodes = s.end(p, 30)
        if nodes is not None:
            s.phases.append(nodes)
            continue
        nodes = []
        if p < 2:
            socket = (
                place(
                    gold.crop((int(gw * 0.19), int(gh * 0.75), int(gw * 0.85), gh)),
                    (113, 138, 128, 146),
                    s.rig.canvas,
                )
                if p == 0
                else s.cell(2, (109, 131, 132, 147))
            )
            s.draw(nodes, socket, "initial-ground-socket", p, "GOLD_SOCKET_AND_CLOSED_FOOT_HINGES")
            s.phases.append(nodes)
            continue
        for i, (foot, pivot, axis) in enumerate(
            zip(feet, [(115, 136), (126, 136), (120, 137)], [(0.3, 1.0), (-0.3, 1.0), (1.0, 0.0)])
        ):
            angle = (1 - fraction(p, 1, 5)) * 1.42
            layer = base.hinged(
                foot,
                angle,
                pivot,
                s.rig.canvas,
                depth=0.4,
                axis_direction=axis,
                fold_direction=(0, -0.8),
            )
            drop = 0.0
            layer = s.rise(layer, drop, 154)
            if p < 5:
                box = bounds(layer[..., 3] >= 8)
                frame = s.rig.logical[p]
                ox, oy = frame["trimOrigin"]
                fw, fh = frame["trimSize"]
                dx = max(ox + 0.25 - box[0] / 4, min(0, ox + fw - 0.25 - box[2] / 4))
                dy = max(oy + 0.25 - box[1] / 4, min(0, oy + fh - 0.25 - box[3] / 4))
                layer = terminal.move(layer, dx, dy)
            s.draw(
                nodes,
                layer,
                "folding-ground-foot-" + str(i),
                p,
                "INDEPENDENT_FOOT_HINGES_OUT_FROM_CLOSED_SOCKET",
                hingeRadians=angle,
                translation=[0, drop],
            )
        if p >= 4:
            drop = float(np.interp(p, [4, 5, 6, 7, 8, 9], [21, 16, 11, 6, 2, 0]))
            s.draw(
                nodes,
                s.rise(body, drop, 143),
                "rising-central-pedestal",
                p,
                "PEDESTAL_EXTENDS_THROUGH_FIXED_FEET",
                translation=[0, drop],
            )
        if 4 <= p <= 8:
            for i, post in enumerate(early_posts):
                s.draw(
                    nodes,
                    s.rise(post, max(0, 5 - p) * 7, 138),
                    "early-platform-post-" + str(i),
                    p,
                    "THREE_GOLD_SUPPORT_POSTS_EXTEND_BEFORE_DISK",
                )
        if p >= 6:
            drop = float(np.interp(p, [6, 7, 8, 9, 10, 11], [16, 14, 12, 3, 0, 0]))
            s.draw(
                nodes,
                terminal.move(disk, dy=drop),
                "rising-coil-platform",
                p,
                "COMPLETE_PLATFORM_RISES_ON_PEDESTAL",
                translation=[0, drop],
            )
        if p >= 9:
            # Original socket order is CCW, while every pillar moves only vertically.
            starts = {0: 9, 2: 19, 4: 21, 3: 23, 1: 25}
            if p >= 17:
                drop = (
                    float(
                        np.interp(
                            p,
                            [17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29],
                            [44, 46, 46, 43, 39, 35, 32, 28, 25, 21, 18, 14, 10],
                        )
                    )
                    - 7
                )
                s.draw(
                    nodes,
                    s.rise(antenna, drop, 106),
                    "extending-central-antenna",
                    p,
                    "SPINDLE_EXTENDS_VERTICALLY",
                    translation=[0, drop],
                )
            for i in [0, 1, 2, 3, 4]:
                start = starts[i]
                if p < start:
                    continue
                cx, cy = centers[i]
                if i == 0:
                    drop = float(
                        np.interp(
                            p,
                            [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
                            [55, 40, 27, 16, 8, 3, 0, 0, 0, 2, 2, 0],
                        )
                    )
                else:
                    drop = float(np.interp(p, [start, start + 1, start + 2, start + 3], [48, 29, 12, 0]))
                s.draw(
                    nodes,
                    s.rise(coils[i], drop, cy + 56),
                    "sequential-coil-" + str(i),
                    p,
                    "FIXED_SOCKET_VERTICAL_EXTENSION_COUNTERCLOCKWISE_SEQUENCE",
                    translation=[0, drop],
                    socket=[cx, cy + 56],
                    counterclockwiseOrder=[0, 2, 4, 3, 1],
                )
            for i, cable in enumerate(cables):
                start = [19, 23, 14, 25][i]
                if p >= start:
                    drop = (1 - fraction(p, start, min(start + 4, 29))) * 27
                    s.draw(
                        nodes,
                        s.rise(cable, drop, 109),
                        "extending-gold-cable-" + str(i),
                        p,
                        "ATTACHED_CABLE_EXTENDS_FROM_FIXED_SOCKET",
                        translation=[0, drop],
                    )
        s.phases.append(nodes)
    return s.finish()


def grinder(s):
    """Original 30-phase scaffold, central lifts and outward grinder deployment."""
    from scipy.ndimage import map_coordinates

    x, y = s.xx, s.yy
    source = GRINDER / "hidden-body-v1.png"
    rgba = np.array(Image.open(source).convert("RGBA"))
    rgba[..., 3][rgba[..., 3] >= 230] = 255
    # Three vertical registration landmarks keep the pit, rim and ground separate.
    u = 270 + (x - 90) * (1242 - 270) / 139
    v = np.interp(y, [63, 124, 180], [102, 581, 937])
    hidden = np.stack(
        [map_coordinates(rgba[..., c], [v, u], order=1, mode="constant") for c in range(4)], axis=-1
    )
    hidden = terminal.masked(hidden, (y >= 63) & (y <= 180))
    s.source.update(grinderHiddenBody=str(source), grinderHiddenBodySha256=sha(source))
    # Every moving surface is removed from the stationary retained scaffold.
    sphere_polys = [
        [
            (125, 61),
            (128, 57),
            (131, 57),
            (132, 55),
            (137, 55),
            (139, 59),
            (142, 61),
            (142, 70),
            (138, 75),
            (129, 74),
            (125, 70),
        ],
        [
            (177, 61),
            (179, 57),
            (183, 55),
            (190, 55),
            (193, 59),
            (196, 63),
            (195, 71),
            (190, 75),
            (180, 74),
            (176, 69),
        ],
        [
            (119, 83),
            (122, 80),
            (125, 80),
            (127, 78),
            (132, 80),
            (136, 84),
            (137, 90),
            (134, 97),
            (123, 98),
            (118, 92),
        ],
        [
            (177, 85),
            (180, 80),
            (185, 78),
            (191, 80),
            (195, 84),
            (197, 91),
            (193, 97),
            (182, 98),
            (176, 92),
        ],
    ]
    assembly_polys = [
        [(123, 55), (139, 53), (145, 61), (153, 77), (148, 84), (133, 87), (121, 77), (122, 64)],
        [(176, 54), (192, 53), (198, 61), (200, 66), (202, 78), (195, 85), (175, 79), (170, 70)],
        [(117, 79), (133, 77), (140, 85), (146, 97), (150, 103), (137, 112), (117, 104), (113, 91)],
        [(177, 78), (193, 77), (198, 85), (204, 96), (205, 103), (192, 112), (173, 102), (170, 90)],
    ]
    assemblies = [s.retained(q) for q in assembly_polys]
    balls = [s.retained(q) for q in sphere_polys]
    centers = [(134, 65), (186, 65), (128, 88), (187, 88)]
    sockets = [(139, 79), (187, 80), (136, 104), (188, 105)]
    cradles = [terminal.masked(layer, ~s.region(poly)) for layer, poly in zip(assemblies, sphere_polys)]
    post_polys = [
        [(155, 48), (164, 48), (164, 69), (161, 72), (155, 70)],
        [(157, 106), (162, 106), (163, 115), (157, 115)],
        [(106, 77), (113, 78), (117, 82), (117, 92), (109, 94), (109, 86)],
        [(204, 81), (213, 77), (214, 81), (208, 85), (208, 93), (201, 94)],
    ]
    tank_polys = [
        [(114, 105), (122, 105), (123, 128), (118, 134), (114, 130)],
        [(132, 112), (141, 112), (142, 132), (138, 137), (132, 134)],
        [(179, 111), (189, 111), (188, 134), (183, 137), (178, 133)],
        [(198, 104), (207, 105), (207, 130), (202, 133), (198, 129)],
    ]
    pipe_polys = [
        [
            (96, 95),
            (111, 94),
            (124, 102),
            (159, 119),
            (198, 101),
            (218, 96),
            (224, 98),
            (224, 104),
            (162, 134),
            (97, 106),
        ],
        [(96, 109), (116, 109), (160, 130), (207, 109), (223, 109), (224, 115), (161, 142), (98, 121)],
    ]
    can_polys = [
        [(106, 135), (112, 135), (112, 146), (107, 146)],
        [(154, 156), (164, 156), (164, 167), (155, 167)],
        [(207, 135), (213, 135), (213, 146), (208, 146)],
    ]
    removed = np.logical_or.reduce(
        [s.region(q) for q in assembly_polys + post_polys + tank_polys + pipe_polys + can_polys]
    )
    rim_y = 124 - np.abs(x - 160) * 0.5
    stationary = terminal.masked(s.full, ~removed & (y >= rim_y + 2))
    # Reconstruct underneath absent fixtures, then restore all visible retained anatomy.
    empty = over(stationary, hidden)
    # Outside the platform, only real scaffold legs may be present above the slab.
    floor_y = 173 - np.abs(x - 160) * 0.5
    rim_y = 124 - np.abs(x - 160) * 0.5
    floor = s.cell(4, (90, 108, 229, 180))
    floor = over(terminal.masked(s.full, (y >= floor_y + 2) & (y > 155) & ~removed), floor)
    leg_polys = [
        [(109, 96), (136, 108), (136, 140), (128, 151), (108, 153)],
        [(145, 121), (177, 121), (177, 151), (181, 166), (160, 172), (139, 166), (145, 151)],
        [(188, 109), (213, 96), (216, 151), (196, 153), (188, 141)],
    ]
    legs = np.logical_or.reduce([s.region(q) for q in leg_polys])
    floor = over(
        terminal.masked(s.full, (y >= floor_y + 2) & (y > 155) & ~removed & ~legs),
        s.cell(4, (90, 108, 229, 180)),
    )
    body_mask = (y <= rim_y + 2) | (legs & (y < floor_y))
    empty = terminal.masked(empty, body_mask & (y >= 63) & (x >= 103) & (x <= 217))
    # Thin ground sockets remain fixed while their small cylinders extend later.
    cans = [s.retained(q) for q in can_polys]
    pipes = [s.retained(q) for q in pipe_polys]
    tanks = [s.retained(q) for q in tank_polys]
    posts = [s.retained(q) for q in post_polys]
    paths = [
        (
            [10, 11, 14, 17, 20, 23, 26, 28],
            [(160, 94), (159, 86), (157, 76), (151, 69), (146, 66), (141, 64), (135, 65), (134, 65)],
        ),
        (
            [14, 15, 18, 21, 24, 27, 28],
            [(160, 96), (162, 89), (159, 78), (168, 72), (174, 64), (185, 63), (186, 65)],
        ),
        ([18, 19, 22, 25, 28], [(160, 99), (157, 90), (150, 88), (140, 83), (128, 88)]),
        ([21, 22, 24, 26, 28], [(161, 99), (162, 92), (169, 91), (179, 86), (187, 88)]),
    ]
    for p in range(s.record["frames"]):
        nodes = s.end(p, 28)
        if nodes is not None:
            s.phases.append(nodes)
            continue
        nodes = []
        s.draw(
            nodes,
            floor,
            "fixed-cross-foundation",
            p,
            "FIXED_RETAINED_GROUND_REGISTRATION",
            fixedGroundComponent=True,
        )
        if p == 0:
            s.phases.append(nodes)
            continue
        drop = float(np.interp(p, [1, 2, 3, 4, 5, 6, 7, 8, 9], [45, 42, 34, 27, 21, 16, 11, 6, 0]))
        # The upper assembly translates. The column bases stay on the same slab.
        # Project only the exposed column span between its moving top and fixed foot.
        factor = max(0.035, 1 - drop / 49)
        sy = np.where(y <= rim_y + drop, y - drop, floor_y + (y - floor_y) / factor)
        layer = np.stack(
            [
                map_coordinates(empty[..., c], [sy * 4, x * 4], order=1, mode="constant")
                for c in range(4)
            ],
            axis=-1,
        )
        layer = terminal.masked(layer, (y < floor_y) | (y <= rim_y + drop))
        s.draw(
            nodes,
            layer,
            "connected-rising-scaffold",
            p,
            "RIM_RISES_WITH_CONTINUOUS_LEGS_AND_FIXED_FEET",
            platformDrop=drop,
            groundTranslation=[0, 0],
        )
        # The first platform phase still exposes the original central floor.
        if p == 1:
            opening = s.region([(124, 91), (160, 73), (196, 91), (160, 110)])
            cap = terminal.masked(
                terminal.move(s.cell(4, (124, 118, 196, 155)), dy=0),
                terminal.move(np.dstack([opening.astype("uint8") * 255] * 4), dy=drop)[..., 3] > 0,
            )
            s.draw(
                nodes, cap, "initial-open-well-floor", p, "GROUND_VISIBLE_THROUGH_FIRST_PLATFORM_PHASE"
            )
        if 2 <= p < 16:
            mast_drop = drop + max(0, p - 9) * 3
            mast = s.cell(2, (150, 79, 170, 106))
            mast = terminal.masked(
                terminal.move(mast, dy=mast_drop), y <= 111 + drop - np.abs(x - 160) * 0.42
            )
            s.draw(
                nodes,
                mast,
                "central-lifting-hub",
                p,
                "CENTRAL_HUB_VISIBLE_BEFORE_SEQUENTIAL_BALL_LIFTS",
                translation=[0, mast_drop],
            )
        # Cradle foot plates stay attached to the rising deck. Only their arms unfold.
        for i, (cradle, pivot) in enumerate(zip(cradles, sockets)):
            plate = terminal.masked(cradle, y >= pivot[1] - 3)
            s.draw(
                nodes,
                terminal.move(plate, dy=drop),
                f"socket-plate-{i}",
                p,
                "PLATE_ATTACHED_TO_RISING_PLATFORM",
                translation=[0, drop],
            )
            if p < 8:
                continue
            arm = terminal.masked(cradle, y < pivot[1] - 3)
            t = fraction(p, 7, 12)
            angle = (1 - t) * 1.4
            layer = base.hinged(
                arm,
                angle,
                pivot,
                s.rig.canvas,
                depth=0,
                axis_direction=(1.0, 0.5 if i in [0, 2] else -0.5),
                fold_direction=(0.0, 0.12),
            )
            layer = terminal.move(layer, dy=drop)
            s.draw(
                nodes,
                layer,
                f"socket-cradle-{i}",
                p,
                "LOCAL_SOCKET_ARM_UNFOLDS_BEFORE_CENTRAL_LIFT",
                hingeRadians=angle,
                pivot=pivot,
                translation=[0, drop],
            )
        # Perimeter pipes extend around the stationary frame; they do not rotate the building.
        for i, pipe in enumerate(pipes):
            start, end = [(11, 19), (17, 24)][i]
            if p >= start:
                t = fraction(p, start, end)
                layer = terminal.masked(pipe, np.abs(x - 160) <= 64 * t)
                s.draw(
                    nodes,
                    layer,
                    f"extending-perimeter-ring-{i}",
                    p,
                    "PIPE_GROWS_ALONG_FRAME_FROM_FRONT_CORNER",
                    extensionFraction=t,
                )
        for i, can in enumerate(cans):
            start = [14, 10, 15][i]
            if p >= start:
                d = (1 - fraction(p, start, start + 5)) * 11
                layer = terminal.masked(terminal.move(can, dy=d), y <= [146, 167, 146][i])
                s.draw(
                    nodes,
                    layer,
                    f"ground-cylinder-{i}",
                    p,
                    "SMALL_CANISTER_EXTENDS_FROM_FIXED_GROUND_SOCKET",
                    translation=[0, d],
                )
        for i, tank in enumerate(tanks):
            start = [13, 15, 19, 21][i]
            if p >= start:
                t = fraction(p, start, start + 5)
                # Red sleeves telescope down from the rim; no white top-surface cutouts travel with them.
                layer = terminal.masked(tank, y <= [105, 112, 111, 104][i] + (t * 30))
                s.draw(
                    nodes,
                    layer,
                    f"descending-cylinder-{i}",
                    p,
                    "RED_SLEEVE_EXTENDS_DOWN_FROM_FIXED_RIM",
                    extensionFraction=t,
                )
        for i, post in enumerate(posts):
            start = [24, 21, 26, 22][i]
            if p >= start:
                t = fraction(p, start, 28)
                d = (1 - t) * [23, 8, 16, 16][i]
                layer = terminal.masked(terminal.move(post, dy=d), y <= [72, 115, 94, 94][i])
                s.draw(
                    nodes,
                    layer,
                    f"corner-exhaust-{i}",
                    p,
                    "CORNER_PIPE_EXTENDS_THROUGH_FIXED_PORT",
                    translation=[0, d],
                )
        # Individual balls rise inside the well, then spread onto their own cradles.
        for i, (ball, center, pivot, path) in enumerate(zip(balls, centers, sockets, paths)):
            ticks, points = path
            if p < ticks[0]:
                continue
            pos = np.array([np.interp(p, ticks, [q[c] for q in points]) for c in [0, 1]])
            # Independent telescoping ram joins the current ball to its fixed socket.
            if p < 28:
                ram = heavy.solid_beam(
                    s, np.array(pivot), pos + [0, 6], (2.4, 0), material=2, thickness=1
                )
                # The front wall hides the lower central ram inside the pit.
                ram = terminal.masked(ram, y <= 112 - np.abs(x - 160) * 0.42)
                s.draw(
                    nodes,
                    ram,
                    f"sphere-ram-{i}",
                    p,
                    "TELESCOPIC_RAM_JOINS_FIXED_SOCKET_TO_MOVING_SPHERE",
                    top=pos.tolist(),
                    pivot=pivot,
                )
            offset = pos - center
            layer = terminal.move(ball, *offset)
            layer = terminal.masked(layer, y <= 111 - np.abs(x - 160) * 0.42)
            s.draw(
                nodes,
                layer,
                f"central-lift-sphere-{i}",
                p,
                "SEQUENTIAL_CENTRAL_LIFT_THEN_OUTWARD_SEATING",
                translation=offset.tolist(),
                center=pos.tolist(),
                nativePhase=p,
            )
        s.phases.append(nodes)
    return s.finish()


def cloning_vat(s):
    x, y = s.xx, s.yy
    floor = s.mechanism(0, (54, 84, 158, 135))
    middle = s.mechanism(1, (86, 59, 114, 101))
    hood = s.mechanism(2, (121, 89, 151, 116))
    lower = s.mechanism(3, (67, 80, 148, 124))
    figure = s.mechanism(4, (102, 72, 121, 103))
    glass = s.retained(
        [
            (99, 59),
            (107, 55),
            (117, 55),
            (124, 60),
            (125, 99),
            (121, 106),
            (109, 110),
            (100, 105),
            (98, 98),
        ]
    )
    canister = s.retained(
        [(76, 48), (83, 45), (91, 48), (93, 61), (91, 88), (76, 91), (73, 83), (73, 58)]
    )
    canister = over(defense.ring(s, (83, 51), 7, 3.5, 1), terminal.masked(canister, y >= 51))
    pump = s.retained([(128, 72), (142, 73), (148, 84), (145, 103), (139, 111), (126, 108), (124, 97)])
    valves = [
        s.retained(q)
        for q in [
            [(139, 56), (146, 56), (149, 61), (143, 65), (138, 61)],
            [(149, 60), (156, 60), (159, 65), (152, 69), (148, 65)],
        ]
    ]
    front = s.retained(
        [(66, 113), (77, 94), (87, 90), (103, 94), (107, 103), (101, 124), (91, 135), (67, 126)]
    )
    small = s.retained([(54, 99), (65, 93), (77, 96), (78, 111), (68, 119), (54, 116)])
    pipes = [
        s.retained(q)
        for q in [
            [(84, 29), (93, 28), (105, 34), (107, 45), (103, 48), (98, 43), (96, 37), (87, 37)],
            [(80, 39), (90, 36), (101, 38), (99, 44), (88, 47), (84, 53), (76, 53), (78, 46)],
            [
                (113, 33),
                (124, 32),
                (136, 39),
                (137, 45),
                (129, 49),
                (118, 54),
                (117, 59),
                (108, 58),
                (110, 49),
                (123, 44),
                (127, 40),
                (116, 39),
            ],
            [(125, 65), (137, 61), (141, 65), (137, 72), (133, 77), (133, 89), (126, 89), (125, 79)],
        ]
    ]

    # Fixed material UVs are projected separately onto each complete masonry face.
    foundation = s.mechanisms[0]
    fw, fh = foundation.size
    s.materials.append(Image.fromarray(s.full).crop((97 * 4, 94 * 4, 100 * 4, 96 * 4)))
    s.materials.append(foundation.crop((int(fw * 0.40), int(fh * 0.42), int(fw * 0.58), int(fh * 0.58))))

    uv_cache = {}

    def face(poly, material, shade=1):
        q = np.asarray(poly, float)
        u = max(1, float(np.linalg.norm(q[1] - q[0])))
        v = max(1, float(np.linalg.norm(q[3] - q[0])))
        key = (material, round(u * 6), round(v * 6))
        if key not in uv_cache:
            raw = s.materials[material]
            if material in [4, 6]:
                # Keep brick size constant rather than stretching a whole swatch over each face.
                tw, th = key[1:]
                tile = Image.new("RGBA", (max(tw, raw.width), max(th, raw.height)))
                for yy in range(0, tile.height, raw.height):
                    for xx in range(0, tile.width, raw.width):
                        tile.paste(raw, (xx, yy))
                raw = tile.crop((0, 0, tw, th))
            uv_cache[key] = len(s.materials)
            s.materials.append(raw)
        return heavy.art.material_quad(s, uv_cache[key], poly, (u, v), shade)

    def block(cx, cy, rx, ry, height):
        cap = [(cx, cy - ry), (cx + rx, cy), (cx, cy + ry), (cx - rx, cy)]
        left = [(cx - rx, cy), (cx, cy + ry), (cx, cy + ry + height), (cx - rx, cy + height)]
        right = [(cx, cy + ry), (cx + rx, cy), (cx + rx, cy + height), (cx, cy + ry + height)]
        return over(face(cap, 6, 1.12), over(face(left, 4, 0.85), face(right, 4, 0.62)))

    def beam(start, end, width, height, material=6, lean=0):
        start, end = np.asarray(start, float), np.asarray(end, float)
        cross = np.asarray(width, float) / 2
        down = np.array([lean, height])
        top = [start - cross, end - cross, end + cross, start + cross]
        side = [start + cross, end + cross, end + cross + down, start + cross + down]
        cap = [end - cross, end + cross, end + cross + down, end - cross + down]
        return over(face(top, material), over(face(cap, 4, 0.68), face(side, 4, 0.82)))

    chimney = over(
        s.retained([(94, 10), (107, 4), (122, 18), (121, 27), (107, 29), (94, 19)]),
        block(108, 22, 13, 7, 74),
    )
    pipes[0] = s.retained(
        [(91, 30), (96, 31), (104, 35), (106, 42), (103, 47), (99, 44), (99, 39), (94, 36), (91, 35)]
    )
    pipes[1] = s.retained(
        [
            (77, 49),
            (80, 44),
            (85, 41),
            (93, 38),
            (99, 38),
            (100, 41),
            (92, 44),
            (86, 47),
            (84, 53),
            (78, 53),
        ]
    )
    pipes[3] = s.retained(
        [
            (127, 88),
            (127, 75),
            (130, 68),
            (137, 63),
            (140, 65),
            (138, 69),
            (133, 72),
            (132, 79),
            (132, 89),
        ]
    )
    # Original landmarks, indexed by native frame. The beam extends while hinging upwards.
    beam_roots = {
        8: (117, 67),
        9: (116, 59),
        10: (115, 55),
        11: (115, 54),
        12: (115, 52),
        13: (115, 49),
        14: (115, 46),
        15: (115, 45),
        16: (115, 45),
        17: (115, 45),
        18: (115, 45),
    }
    beam_tips = {
        8: (125, 91),
        9: (132, 88),
        10: (138, 90),
        11: (144, 96),
        12: (149, 101),
        13: (154, 100),
        14: (157, 92),
        15: (159, 84),
        16: (160, 77),
        17: (160, 71),
        18: (160, 67),
    }
    for p in range(s.record["frames"]):
        nodes = s.end(p, 22)
        if nodes is not None:
            s.phases.append(nodes)
            continue
        nodes = []
        # By frame 19 all hidden mechanisms are seated at the retained finished geometry.
        if p >= 19:
            complete = terminal.masked(s.full, ~np.logical_or.reduce([v[..., 3] > 0 for v in valves]))
            # Removing a valve must reveal the continuous roof, never transparent canvas.
            roof_red = (
                (x > 135)
                & (x < 164)
                & (y > 52)
                & (y < 71)
                & (s.full[..., 0] > s.full[..., 1].astype(float) * 1.7)
            )
            complete = terminal.masked(complete, ~roof_red)
            roof = face([(136, 61), (143, 57), (162, 66), (155, 70)], 6)
            complete = over(roof, complete)
            s.draw(
                nodes, complete, "assembled-cloning-vat", p, "ALL_MECHANISMS_SEATED_BEFORE_ROOF_VALVES"
            )
            for i, valve in enumerate(valves):
                if p >= 20 + i:
                    s.draw(
                        nodes, valve, "roof-valve-" + str(i), p, "LAST_VALVES_EXTEND_AFTER_MAIN_ASSEMBLY"
                    )
            s.phases.append(nodes)
            continue
        s.draw(
            nodes,
            floor,
            "fixed-bare-foundation",
            p,
            "COMPLETE_EMPTY_FOUNDATION_WITH_NATIVE_NOTCHES",
            fixedGroundComponent=True,
        )
        if p >= 1:
            drop = float(np.interp(p, [1, 2, 3, 4, 5, 6], [72, 58, 43, 29, 14, 0]))
            s.draw(
                nodes,
                s.rise(chimney, drop, 104),
                "rear-brick-chimney",
                p,
                "REAR_CHIMNEY_RISES_FIRST",
                translation=[0, drop],
            )
            drop = float(np.interp(p, [1, 2, 3, 4, 5, 6], [37, 25, 14, 5, 1, 0]))
            s.draw(
                nodes,
                s.rise(middle, drop, 105),
                "middle-brick-column",
                p,
                "INDEPENDENT_MIDDLE_BRICK_COLUMN_RISES_WITH_CHIMNEY",
                translation=[0, drop],
            )
        if 5 <= p <= 8:
            endpoint = {5: (73, 72), 6: (73, 55), 7: (79, 63), 8: (84, 67)}[p]
            s.draw(
                nodes,
                beam((88, 69), endpoint, (5, -3), 6),
                "left-masonry-flap",
                p,
                "SHORT_LEFT_ARM_FOLDS_UP_THEN_SEATS",
                endpoint=list(endpoint),
            )
        if p >= 2:
            # Lower foundation tiers precede the broad upper platform at frame six.
            if p < 6:
                top = float(np.interp(p, [2, 3, 4, 5], [109, 107, 104, 101]))
                platform = block(108, top, 34, 17, 3)
            else:
                platform = lower
            s.draw(
                nodes,
                platform,
                "main-cloning-platform",
                p,
                "LOW_TIERS_THEN_FULL_UPPER_PLATFORM_AT_ORIGINAL_PHASE_SIX",
            )
        if p >= 1:
            if p <= 5:
                drop = 12 if p == 1 else 0
                layer = s.rise(hood, drop, 116)
            else:
                # The early metal enclosure opens and sinks as its upright mechanism emerges.
                t = fraction(p, 5, 12)
                layer = s.rise(hood, 15 * t, 116)
                layer = over(s.rise(pump, 25 * (1 - t), 112), layer) if p < 12 else pump
            s.draw(
                nodes, layer, "right-pump-housing", p, "COMPLETE_EARLY_ARCHED_HOOD_OPENS_FOR_RISING_PUMP"
            )
        if p >= 2:
            drop = float(np.interp(p, [2, 3, 4, 5, 6], [38, 29, 22, 12, 0]))
            socket = float(np.interp(p, [2, 3, 4, 5, 6], [112, 113, 111, 109, 103]))
            s.draw(
                nodes,
                s.rise(figure, drop, socket),
                "uncovered-test-figure",
                p,
                "SMALL_FIGURE_EXTENDS_BEFORE_GLASS",
                translation=[0, drop],
            )
        if p >= 7:
            # Visible pipe growth is anchored to its own masonry socket.
            for i, pipe in enumerate(pipes):
                start = [8, 10, 11, 7][i]
                if p >= start:
                    drop = (1 - fraction(p, start, 18)) * [32, 35, 30, 27][i]
                    s.draw(
                        nodes,
                        s.rise(pipe, drop, [68, 75, 76, 112][i]),
                        "pipe-" + str(i),
                        p,
                        "PIPE_EXTENDS_FROM_FIXED_MASONRY_SOCKET",
                        translation=[0, drop],
                    )
        if p >= 8:
            # Original landmarks describe the outer tip, not the center of the beam cap.
            ox, oy = s.rig.logical[p]["trimOrigin"]
            fw, fh = s.rig.logical[p]["trimSize"]
            tip = (min(beam_tips[p][0], ox + fw - 4.75), beam_tips[p][1])
            s.draw(
                nodes,
                beam(beam_roots[p], tip, (9, -5), 7, lean=-12 * (1 - fraction(p, 12, 18))),
                "right-masonry-beam",
                p,
                "CLOSED_BEAM_EXTENDS_AND_PIVOTS_UP_FROM_ORIGINAL_LANDMARKS",
                root=list(beam_roots[p]),
                tip=list(tip),
            )
        if p >= 9:
            drop = float(np.interp(p, [9, 10, 11, 12, 13, 14], [32, 24, 17, 10, 3, 0]))
            s.draw(
                nodes,
                s.rise(canister, drop, 93),
                "left-silver-canister",
                p,
                "LEFT_CANISTER_RISES_AFTER_PLATFORM",
                translation=[0, drop],
            )
        if p >= 14:
            drop = float(np.interp(p, [14, 15, 16, 17, 18], [43, 30, 18, 8, 0]))
            s.draw(
                nodes,
                terminal.masked(glass, y >= 55 + drop),
                "rising-glass-enclosure",
                p,
                "GLASS_RISES_AROUND_STATIONARY_TEST_FIGURE",
                translation=[0, drop],
            )
        if 1 <= p < 14:
            # The bridge starts as a narrow red upright, then folds back over extending flanks.
            if p < 6:
                top = float(np.interp(p, [1, 2, 3, 4, 5], [126, 121, 117, 115, 113]))
                red = heavy.solid_beam(s, (72, 129), (72, top), (7, 3), material=5, thickness=1)
            else:
                root = np.array([73.0, 125.0])
                end = np.array([83.0, 94.0])
                t = fraction(p, 6, 14)
                start = root * (1 - t) + np.array([82.0, 99.0]) * t
                finish = np.array([77.0, 108.0]) * (1 - t) + end * t
                red = heavy.solid_beam(s, start, finish, (9, 4), material=5, thickness=2)
            if p >= 4:
                lift = float(np.interp(p, [4, 6, 8, 10, 12, 14], [1, 4, 9, 17, 25, 30]))
                for i, (cx, cy, rx, ry) in enumerate([(68, 122, 7, 4), (88, 128, 7, 4)]):
                    s.draw(
                        nodes,
                        block(cx, cy - lift, rx, ry, lift),
                        "front-stone-flank-" + str(i),
                        p,
                        "SEPARATE_FRONT_STONE_FLANK_EXTENDS_FROM_GROUND",
                    )
            s.draw(
                nodes, red, "folding-red-bridge", p, "UPRIGHT_RED_STRIP_FOLDS_BACK_TO_HORIZONTAL_BRIDGE"
            )
            if p >= 10:
                insignia = s.retained([(68, 119), (78, 105), (89, 109), (91, 132), (69, 125)])
                s.draw(
                    nodes,
                    s.rise(insignia, (14 - p) * 4, 133),
                    "front-insignia-face",
                    p,
                    "FRONT_FACE_EXTENDS_BETWEEN_SEPARATE_FLANKS",
                )
        if p >= 14:
            s.draw(
                nodes, front, "seated-front-support", p, "FRONT_SUPPORT_FINISHES_AFTER_BRIDGE_AND_FLANKS"
            )
        if p >= 15:
            s.draw(
                nodes,
                s.rise(small, (18 - p) * 5, 119),
                "small-left-support",
                p,
                "SMALL_SIDE_SUPPORT_EXTENDS_LAST",
            )
        s.phases.append(nodes)
    return s.finish()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    parser.add_argument("--families", default="YAPSYT,NACLON")
    parser.add_argument("--theater", default="")
    args = parser.parse_args()
    args.output.mkdir(exist_ok=False)
    source = args.output / "authoring-source.py"
    shutil.copy2(__file__, source)
    rigs = {}
    for record in read(AUTHORITY)["families"]:
        if (
            record["side"] != "yuri"
            or record["identity"] not in args.families.split(",")
            or record["theater"] not in ["TEMPERATE", "SNOW"]
            or args.theater
            and record["theater"] != args.theater
        ):
            continue
        scene = Scene(record, args.output / record["key"], source)
        rigs[record["key"]] = {
            "NATBNK": tank_bunker,
            "YAPSYT": psychic_tower,
            "YAGRND": grinder,
            "NACLON": cloning_vat,
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
