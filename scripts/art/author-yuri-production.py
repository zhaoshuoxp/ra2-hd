"""Original-phase production buildings with complete, independently moving HD parts."""

import argparse
import shutil
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image

from buildup import native_indices, read, sha, write
from painted_rig import over, place, project_rgba

advanced = SourceFileLoader("production_advanced", "scripts/art/author-yuri-advanced.py").load_module()
support, heavy, base, terminal = advanced.support, advanced.heavy, advanced.base, advanced.terminal
ROOT = support.ROOT
BATCH = ROOT / "yuri-production-r112-v1"
AUTHORITY = BATCH / "reference-authoring-v1.json"
fraction = support.fraction


class Scene(advanced.Scene):
    def __init__(self, record, output, source):
        reference = BATCH / ("reference-" + record["theater"].lower() + "-v1/report.json")
        self.rig, self.full = base.parts.seed_rig(record, reference, output)
        self.record, self.output, self.origin = record, output, np.zeros(2)
        self.yy, self.xx = np.mgrid[:self.full.shape[0], :self.full.shape[1]] / 4
        self.phases, self.checks, self.violations = [], [], []
        self.diagnostic = True
        self.owner_allowed = [bool(((native_indices(self.rig.raw, p) >= 16)
                                   & (native_indices(self.rig.raw, p) < 32)).any())
                              for p in range(record["frames"])]
        self.reference = read(reference)["cases"][record["identity"]]
        self.file = BATCH / "hidden-components-v1.png"
        self.kit = base.complete_atlas(self.file)
        self.cells = []
        for i in range(6):
            rgba = np.array(self.kit[i][0])
            rgba[..., 3][rgba[..., 3] >= 230] = 255
            self.cells.append(Image.fromarray(rgba))
        material = Image.open(ROOT / "yuri-foundation-r111-v1/foundation-materials-v1.png")
        self.materials = [material.crop((0, 0, material.width // 2, material.height)).convert("RGBA")]
        self.source = {"code": str(source), "sha256": sha(source),
                       "hiddenComponents": str(self.file), "hiddenComponentsSha256": sha(self.file),
                       "prompt": str(BATCH / "hidden-components-v1.prompt.txt")}

    def cell(self, index, box):
        return place(self.cells[index], box, self.rig.canvas)

    def ground(self, nodes, layer, phase):
        self.floor_draw(nodes, layer, phase)

    def rise_plane(self, layer, drop, plane):
        """A whole component rises through an isometric aperture, retaining its UVs."""
        a, b, c = plane
        return terminal.masked(terminal.move(layer, dy=drop), self.yy <= a * self.xx + b + c)

    def split(self, polygons):
        return self.partition(polygons)

    def closed_floor(self, polygon):
        if not hasattr(self, "floor_uv"):
            # Map the material once to the world canvas, never to a changing reveal.
            self.floor_uv = np.array(self.materials[0].resize(
                (self.full.shape[1], self.full.shape[0]), Image.Resampling.LANCZOS))
            self.floor_uv[..., 3] = 255
        face = terminal.masked(self.floor_uv, self.region(polygon))
        edge = terminal.move(face, dy=2)
        edge[..., :3] = (edge[..., :3] * .5).astype("uint8")
        return over(face, edge)


def shipyard(s):
    x, y = s.xx, s.yy
    # The entire lower dock already exists in the first retail construction phase.
    tower_poly = [(123, 44), (188, 44), (194, 132), (158, 151), (120, 132)]
    crane_poly = [(196, 103), (268, 103), (268, 154), (222, 157), (198, 144)]
    badges = [[(129, 137), (141, 141), (139, 156), (119, 162), (116, 158)],
              [(176, 140), (185, 136), (199, 157), (194, 162), (181, 154)]]
    parts, dock = s.split([tower_poly, crane_poly, *badges])
    tower, crane, badge_left, badge_right = parts
    antenna_mask = s.region([(142, 44), (167, 44), (167, 84), (160, 89), (143, 86)])
    antenna = terminal.masked(tower, antenna_mask)
    body = terminal.masked(tower, ~antenna_mask)
    # Close the small dome area normally hidden by its antenna assembly.
    dome_patch = terminal.move(tower, dy=-7)
    cap = ((x - 157.5) / 15) ** 2 + ((y - 99) / 13) ** 2 <= 1
    body = over(terminal.masked(dome_patch, cap & (y < 96)),
                terminal.masked(body, y >= 96))
    # Only the newly exposed surfaces come from the complete generated dock.
    hidden_file = BATCH / "complete-dock-v1.png"
    hidden = project_rgba(Image.open(hidden_file), [[.7 / 4, 0, 135 / 4],
                                                   [0, .7 / 4, 166 / 4]], s.rig.canvas)
    s.source.update(completeDock=str(hidden_file), completeDockSha256=sha(hidden_file))
    dock = over(dock, terminal.masked(hidden, s.region(tower_poly)
                                    | np.logical_or.reduce([s.region(q) for q in badges])))
    # The dome and tower remain one closed body, so no duplicate crown can appear.
    drops = [65] * 10 + [43, 38, 35, 32, 29, 26, 22, 18, 14, 10, 7, 4, 2, 0, 0]
    for p in range(s.record["frames"]):
        nodes = s.end(p, 23)
        if nodes is not None:
            s.phases.append(nodes)
            continue
        nodes = []
        # Replace only the early roof's high rear rim, which otherwise hits the
        # retail frame envelope. The underlying dock never moves.
        roof_shift = max(0, s.frame_top(p) - 116)
        early_roof = terminal.masked(dock, y < 139)
        low_dock = terminal.masked(dock, y >= 139)
        closed_dock = over(low_dock, terminal.move(early_roof, dy=roof_shift))
        s.draw(nodes, closed_dock, "complete-fixed-dock", p,
               "FIXED_DOCK_WITH_ORIGINAL_ROOF_LIFT", roofLift=roof_shift)
        # The crane swivels gently while the central tower is being assembled.
        crane_drop = max(0, s.frame_top(p) - 107)
        _, native_x = np.where(native_indices(s.rig.raw, p) > 0)
        yaw_scale = min(1., (native_x.max() - 207.) / 61.)
        yawed = project_rgba(Image.fromarray(crane),
                             [[yaw_scale / 4, 0, 207 * (1 - yaw_scale)],
                              [0, .25, crane_drop]], s.rig.canvas)
        s.draw(nodes, yawed, "complete-crane", p,
               "COMPLETE_CRANE_YAW_PROJECTION_AROUND_FIXED_BEARING", drop=crane_drop,
               projectedAxisScale=yaw_scale)
        if p >= 10:
            drop = max(drops[p], s.frame_top(p) - 86)
            s.draw(nodes, s.rise(body, drop, 144), "complete-central-tower", p,
                   "WHOLE_TOWER_RISES_THROUGH_CENTRAL_PLATFORM", drop=drop)
        if p >= 18:
            for i, badge in enumerate([badge_left, badge_right]):
                drop = 17 * (1 - fraction(p, 18, 23))
                s.draw(nodes, s.rise(badge, drop, 163), "dock-badge-" + str(i), p,
                       "COMPLETE_BADGE_EXTENDS_DOWN_CURVED_DOCK", drop=drop)
        if p >= 20:
            drop = 40 * (1 - fraction(p, 20, 23))
            s.draw(nodes, s.rise(antenna, drop, 91), "crown-antennas", p,
                   "ANTENNAS_EXTEND_AFTER_CROWN_SEATS", drop=drop)
        s.phases.append(nodes)
    return s.finish()


def factory(s):
    x, y = s.xx, s.yy
    left_poly = [(77, 87), (110, 87), (113, 117), (103, 140), (88, 178), (70, 168)]
    right_poly = [(148, 84), (163, 84), (169, 126), (178, 140), (160, 144), (150, 127)]
    antenna_poly = [(111, 68), (139, 68), (140, 115), (158, 118), (155, 124),
                    (126, 121), (105, 140), (98, 137), (121, 117)]
    left_brace = [(162, 162), (173, 161), (180, 192), (199, 211), (194, 216),
                  (170, 205), (157, 179)]
    right_brace = [(211, 141), (220, 143), (225, 171), (244, 192), (239, 197),
                   (217, 181), (207, 160)]
    arch_poly = [(164, 162), (173, 155), (184, 151), (197, 150), (211, 155),
                 (212, 165), (197, 161), (181, 169), (171, 179), (163, 178)]
    door_poly = [(173, 179), (210, 164), (223, 194), (186, 214)]
    ramp_poly = [(186, 211), (223, 191), (255, 209), (219, 226)]
    roof_poly = [(101, 132), (130, 121), (165, 135), (199, 151), (187, 174),
                 (161, 180), (101, 154)]
    parts, extras = s.split([left_poly, right_poly, antenna_poly, left_brace,
                            right_brace, arch_poly, door_poly, ramp_poly, roof_poly])
    left, right, antenna, lbrace, rbrace, arch, door, ramp, roof = parts
    mouth = over(arch, over(lbrace, rbrace))
    along = x + 2 * y
    cuts = [0, 392, 420, 448, 478, 515, 999]
    ribs = [terminal.masked(roof, (along >= a) & (along < b)) for a, b in zip(cuts, cuts[1:])]
    rear_roof = s.cell(1, (93, 137, 147, 171))
    for p in range(s.record["frames"]):
        nodes = s.end(p, 23)
        if nodes is not None:
            s.phases.append(nodes)
            continue
        nodes = []
        front = fraction(p, 3, 17)
        ground = [(100, 137), (123 + 110 * front, 148 + 50 * front),
                  (100 + 110 * front, 160 + 65 * front), (78 - 14 * front, 149 + 18 * front)]
        s.draw(nodes, s.closed_floor(ground), "fixed-uv-foundation", p,
               "FOUNDATION_EXTENDS_WITH_FIXED_MATERIAL_COORDINATES")
        if p >= 3:
            rear_ground = s.closed_floor([(104, 137), (149, 155), (110, 178), (73, 160)])
            s.draw(nodes, rear_ground, "complete-rear-foundation", p,
                   "REAR_FOUNDATION_SEATS_BEFORE_ROOF_RISES")
            travel = 38 * (1 - fraction(p, 9, 17))
            front_pad = s.closed_floor([(174, 192), (218, 170), (241, 193), (200, 216)])
            gray = front_pad[..., :3].mean(axis=-1)
            front_pad[..., :3] = np.stack([gray * .92, gray * .96, gray], axis=-1).astype("uint8")
            s.draw(nodes, terminal.move(front_pad, dx=-travel * .62, dy=travel * .32),
                   "complete-moving-front-foundation", p, "FRONT_PLATFORM_TRAVELS_WITH_ARCH")
        if p >= 10:
            connected_floor = s.closed_floor([(77, 166), (142, 133), (222, 170), (157, 203)])
            s.draw(nodes, connected_floor, "closed-hangar-floor", p,
                   "CONTINUOUS_FIXED_FLOOR_UNDER_TELESCOPING_ROOF")
        if p >= 1:
            for i, component in enumerate([left, right]):
                drop = [60, 50][i] * (1 - fraction(p, 1, 10))
                plane = [(-.5, 220, 0), (.5, 70, 0)][i]
                s.draw(nodes, s.rise_plane(component, drop, plane), "rear-support-" + str(i), p,
                       "COMPLETE_SUPPORT_RISES_THROUGH_OWN_GROUND_PLANE", drop=drop)
        if p >= 4:
            drop = 17 * (1 - fraction(p, 4, 9))
            s.draw(nodes, s.rise(rear_roof, drop, 169), "closed-rear-roof", p,
                   "COMPLETE_REAR_ROOF_RISES_FROM_REAR_FOUNDATION", drop=drop)
            for i, rib in enumerate(ribs):
                if p < max(10, 5 + i):
                    continue
                travel = 11 * i * (1 - fraction(p, 5 + i, 18))
                moving = terminal.move(rib, dx=-travel, dy=-travel / 2 + drop)
                s.draw(nodes, moving, "telescoping-roof-rib-" + str(i), p,
                       "RIGID_OVERLAPPING_ROOF_RIB_TRANSLATES_ALONG_VIEW_AXIS", travel=travel)
        travel = 38 * (1 - fraction(p, 9, 17))
        if p >= 2:
            s.draw(nodes, terminal.move(mouth, dx=-travel * .62, dy=travel * .32),
                   "complete-moving-front-arch", p, "WHOLE_ARCH_RETURNS_FROM_OUTER_POSITION",
                   travel=travel)
        if p >= 12:
            drop = 27 * (1 - fraction(p, 12, 17))
            moving = terminal.move(door, dx=-travel * .62, dy=travel * .32 + drop)
            moving = terminal.masked(moving, y <= -.5 * x + 307 + travel * .63)
            s.draw(nodes, moving, "front-door", p, "COMPLETE_DOOR_RISES_INSIDE_MOVING_ARCH", drop=drop)
        if p >= 14:
            angle = -76 * (1 - fraction(p, 14, 18))
            s.draw(nodes, s.hinge(ramp, angle, (204, 201), axis=(2., -1.),
                                  fold=(.7, .35), ground=True), "front-ramp", p,
                   "COMPLETE_RAMP_FOLDS_DOWN_FROM_THRESHOLD", angle=angle)
        if p >= 11:
            # Retained ground details keep their final registration; moving utility
            # tops emerge through that ground rather than dragging the pavement.
            floor_line = .49 * x + 133
            ground_details = terminal.masked(extras, y >= floor_line)
            utility = terminal.masked(extras, y < floor_line)
            s.draw(nodes, ground_details, "fixed-perimeter-footings", p, "FIXED_GROUND_DETAILS")
            moving = terminal.move(utility, dy=18 * (1 - fraction(p, 11, 20)))
            s.draw(nodes, terminal.masked(moving, y < floor_line), "perimeter-utilities", p,
                   "UTILITIES_RISE_THROUGH_FIXED_FOOTINGS")
        if p >= 15:
            drop = 44 * (1 - fraction(p, 15, 22))
            s.draw(nodes, s.rise(antenna, drop, 137), "complete-roof-mast", p,
                   "ROOF_MAST_EXTENDS_AFTER_HANGAR_SEATS", drop=drop)
        s.phases.append(nodes)
    return s.finish()


def construction_yard(s):
    x, y = s.xx, s.yy
    # Distinct masks preserve exact finished surfaces while exposing the hidden shell.
    polys = [
        [(38, 96), (83, 96), (83, 118), (55, 130), (40, 121)],
        [(177, 69), (201, 69), (202, 116), (187, 125), (179, 113)],
        [(150, 108), (184, 95), (184, 126), (162, 137), (151, 125)],
        [(201, 117), (221, 118), (238, 168), (216, 176), (201, 151)],
        [(123, 126), (162, 133), (182, 176), (161, 195), (140, 186), (124, 163)],
        [(140, 123), (163, 116), (195, 121), (207, 146), (171, 158), (153, 145)],
        [(83, 98), (104, 98), (108, 133), (100, 148), (84, 163), (77, 149)],
        [(110, 77), (151, 78), (154, 145), (119, 161), (101, 150), (102, 118)],
        [(26, 130), (53, 131), (63, 158), (37, 177), (25, 168)],
        [(52, 119), (81, 120), (88, 157), (63, 169), (52, 161)],
    ]
    polys[5] = [(139, 136), (160, 125), (169, 119), (194, 119), (204, 139), (176, 157), (160, 148)]
    order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    parts, floor_detail = s.split([polys[i] for i in order])
    crane, mast, back, right, front, roof, left_wall, machinery, left_foot, dome = parts
    floor = s.cell(3, (15, 113, 239, 228))
    capsule = s.cell(0, (77, 108, 177, 183))
    interior = s.closed_floor([(132, 169), (174, 148), (197, 160), (158, 181)])
    interior[..., :3] = (interior[..., :3] * .38).astype("uint8")
    # Front/rear curved roof leaves unfold about their long edges.
    roof_rear = terminal.masked(roof, x - 2 * y > -105)
    roof_front = terminal.masked(roof, x - 2 * y <= -105)
    front_door = terminal.masked(front, (x > 136) & (x < 161) & (y > 143) & (y < 176))
    front_frame = terminal.masked(front, front_door[..., 3] == 0)
    for p in range(s.record["frames"]):
        nodes = s.end(p, 25)
        if nodes is not None:
            s.phases.append(nodes)
            continue
        nodes = []
        if p >= 2:
            if p < 4:
                reach = [0, 0, .44, .88][p]
                center = np.array([126., 170.])
                polygon = (np.array([(15, 169), (126, 114), (239, 170), (126, 227)])
                           - center) * reach + center
                ground = s.closed_floor(polygon)
            else:
                ground = floor
            s.draw(nodes, ground, "continuous-foundation", p, "FIXED_UV_GROUND_PANELS_EXTEND")
        if p <= 6:
            drop = [0, 0, 2, 10, 23, 28, 36][p]
            # Vehicle retraction belongs to the existing MK sequence only.
            moving = terminal.move(capsule, dy=drop)
            moving = terminal.masked(moving, y < -.47 * x + 218)
            s.draw(nodes, moving, "retracting-construction-capsule", p,
                   "COMPLETE_CAPSULE_RETRACTS_INTO_FIXED_FOUNDATION", drop=drop)
        for name, component, start, end, drop, socket in [
            ("rear-wall", back, 5, 7, 43, 153),
            ("right-brace", right, 5, 8, 43, 176),
            ("front-frame", front_frame, 6, 9, 27, 195),
            ("left-foot", left_foot, 7, 10, 34, 177),
            ("rear-left-wall", left_wall, 9, 13, 56, 163),
            ("rear-machinery", machinery, 12, 22, 74, 161),
            ("left-cupola", dome, 14, 21, 47, 169),
        ]:
            if p >= start:
                dy = drop * (1 - fraction(p, start, end))
                s.draw(nodes, s.rise(component, dy, socket), name, p,
                       "COMPLETE_COMPONENT_RISES_FROM_OWN_FIXED_SOCKET", drop=dy)
        if p >= 9:
            for name, component, start, end, sign, pivot in [
                ("rear-roof-leaf", roof_rear, 9, 13, 1, (190, 132)),
                ("front-roof-leaf", roof_front, 12, 16, -1, (159, 146)),
            ]:
                if p >= start:
                    angle = sign * 78 * (1 - fraction(p, start, end))
                    s.draw(nodes, s.hinge(component, angle, pivot, axis=(2., -1.), fold=(.5, .25)),
                           name, p, "COMPLETE_CURVED_ROOF_LEAF_HINGES_INTO_PLACE", angle=angle)
        if p >= 11:
            angle = -83 * (1 - fraction(p, 11, 16))
            s.draw(nodes, s.hinge(front_door, angle, (148, 176), axis=(2., 1.), fold=(.5, -.25)),
                   "complete-front-door", p, "WHOLE_DOOR_HINGES_UP_FROM_THRESHOLD", angle=angle)
        if p >= 16:
            s.draw(nodes, floor_detail, "fixed-floor-utilities", p,
                   "RETAINED_GROUND_AND_SEATED_UTILITIES_KEEP_FIXED_REGISTRATION")
        if p >= 17:
            angle = 73 * (1 - fraction(p, 17, 24))
            s.draw(nodes, s.rotate(crane, angle, (49, 123)), "complete-crane-arm", p,
                   "WHOLE_ARM_ROTATES_UP_FROM_FIXED_BASE", angle=angle)
        if p >= 21:
            drop = 48 * (1 - fraction(p, 21, 25))
            s.draw(nodes, s.rise(mast, drop, 119), "roof-antenna", p,
                   "ANTENNA_EXTENDS_AFTER_ROOF_CLOSES", drop=drop)
        s.phases.append(nodes)
    return s.finish()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    parser.add_argument("--families", default="YAWEAP,YACNST,YAYARD")
    parser.add_argument("--theater", default="")
    args = parser.parse_args()
    args.output.mkdir(exist_ok=False)
    source = args.output / "authoring-source.py"
    shutil.copy2(__file__, source)
    rigs = {}
    for record in read(AUTHORITY)["families"]:
        if record["identity"] not in args.families.split(",") or (
            args.theater and record["theater"] != args.theater
        ):
            continue
        scene = Scene(record, args.output / record["key"], source)
        rigs[record["key"]] = {"YAWEAP": factory, "YACNST": construction_yard,
                               "YAYARD": shipyard}[record["identity"]](scene)
        print(record["key"], len(scene.violations), "geometry violations", flush=True)
    write(args.output / "rigs.json", rigs)


if __name__ == "__main__":
    main()
