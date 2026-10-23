"""Reconstruct rejected production mechanisms against measured Original MK poses."""
import argparse
import shutil
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation, label

from buildup import read, sha, write
from painted_rig import over, place, bounds

old = SourceFileLoader('production_rejected', 'scripts/art/author-yuri-production-rebuild.py').load_module()
terminal, fraction = old.terminal, old.fraction
ROOT = old.prior.ROOT
BATCH = ROOT / 'yuri-original-reconstruction-r114-v1'


def master(file):
    """Keep every substantial disconnected part, including skids and platforms."""
    rgba = np.array(Image.open(file).convert('RGBA'))
    ids, count = label(rgba[..., 3] >= 96)
    sizes = np.bincount(ids.ravel())
    keep_ids = np.flatnonzero(sizes >= 12)
    keep_ids = keep_ids[keep_ids != 0]
    keep = binary_dilation(np.isin(ids, keep_ids), iterations=1)
    rgba[~keep] = 0
    image = Image.fromarray(rgba)
    return image.crop(image.getbbox())


class Scene(old.Scene):
    def __init__(self, record, output, source):
        super().__init__(record, output, source)
        self.native_crops = []
        self.masters = {}
        for name in ['capsule', 'rear-shell', 'capless-shell', 'flat-tower', 'front-module', 'short-shell']:
            file = BATCH / (name+('-v2.png' if name == 'short-shell' else '-v1.png'))
            self.masters[name] = master(file)
            self.source[name] = {'file': str(file), 'sha256': sha(file)}

    def part(self, name, box):
        return place(self.masters[name], box, self.rig.canvas)

    def draw(self, nodes, layer, name, phase, method, **details):
        if not layer[..., 3].any():
            return
        original = layer
        layer = old.prior.base.parts.clipped(self.rig, original, phase)
        lost = (original[..., 3] >= 8) & (layer[..., 3] == 0)
        self.native_crops.append({'phase': phase, 'component': name,
                                  'opaquePixelsOutsideNativeFrame': int(lost.sum()),
                                  'critical': bool(details.get('critical')),
                                  'fullBounds': bounds(original[..., 3] >= 8)})
        if not layer[..., 3].any():
            return
        if not self.owner_allowed[phase]:
            layer = old.prior.base.neutral(layer)
        nodes.append(self.rig.save(layer, name, phase, {'method': method, **details}))
        self.checks.append({'phase': phase, 'name': name, 'method': method, **details})

    def finish(self):
        result = super().finish()
        result.pop('constructionArtworkBounds', None)
        result['authoredBoundsReview'] = {'status': 'ORIGINAL_NATIVE_GEOMETRY',
                                        'nativeBoundaryChecks': self.native_crops}
        result['originalPhaseReconstruction'] = {'source': str(BATCH),
            'openingSourceAndFootageCheckedSeparately': True,
            'sharedMastersAcrossPhases': True,
            'rendererArtworkBounds': False}
        return result


def factory(s):
    x, y = s.xx, s.yy
    left_mask = s.region([(70, 87), (113, 87), (114, 124), (105, 145), (89, 179), (67, 170)])
    right_mask = s.region([(146, 82), (166, 82), (171, 122), (180, 143), (156, 145), (146, 124)])
    mast_mask = s.region([(109, 66), (141, 66), (144, 109), (172, 135), (169, 146),
                          (127, 124), (101, 142), (97, 137), (119, 116)])
    left, right = [terminal.masked(s.full, mask) for mask in [left_mask, right_mask]]
    left_brace_mask = s.region([(66, 142), (102, 128), (107, 145), (92, 180), (67, 175)])
    left_brace = terminal.masked(left, left_brace_mask)
    left = terminal.masked(left, ~left_brace_mask)
    mast = terminal.masked(s.full, mast_mask)
    roof_mask = s.region([(98, 129), (128, 121), (201, 150), (214, 165),
                          (187, 189), (184, 203), (98, 173)]) & ~left_mask & ~mast_mask
    arch_mask = s.region([(161, 161), (176, 153), (196, 149), (213, 154), (214, 165),
                          (196, 162), (179, 171), (172, 182), (161, 179)])
    left_foot_mask = s.region([(157, 172), (174, 165), (181, 192), (200, 213),
                               (192, 217), (170, 206), (156, 183)])
    right_foot_mask = s.region([(209, 139), (221, 141), (226, 170), (246, 194),
                                (238, 199), (216, 183), (206, 163)])
    arch = terminal.masked(s.full, arch_mask)
    left_foot, right_foot = [terminal.masked(s.full, m) for m in [left_foot_mask, right_foot_mask]]
    shutter = terminal.masked(s.full, s.region([(175, 179), (211, 163), (224, 195), (187, 215)]))
    ramp = terminal.masked(s.full, s.region([(186, 212), (224, 193), (256, 208), (219, 227)]))
    early_front = s.part('front-module', (141, 147, 221, 210))
    # Short full curved sleeves overlap, rather than stretching a long bay.
    bare = s.part('short-shell', (99, 129, 147, 165))
    original_cap = s.part('rear-shell', (98, 123, 145, 159))
    cap = terminal.masked(original_cap, s.region([(117, 130), (129, 126), (135, 131),
                                                 (136, 137), (128, 140), (117, 136)]))
    capped = over(cap, bare)
    seated_roof = terminal.masked(s.full, roof_mask & ~arch_mask)
    shell_drops = [0, 0, 0, 0, 30, 25, 19, 14, 9, 5, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    extension = [0]*12 + [.04, .11, .22, .35, .49, .64, .78, .9, 1, 1, 1, 1, 1]
    for p in range(s.record['frames']):
        nodes = s.end(p, 23)
        if nodes is not None:
            s.phases.append(nodes); continue
        nodes = []
        if p >= 21:
            s.draw(nodes, terminal.masked(s.full, ~mast_mask), 'seated-complete-shell', p,
                   'COMPLETE_HULL_SEATS_BEFORE_LAST_ANTENNA_EXTENSION')
            drop = 46*(1-fraction(p, 15, 23))
            s.draw(nodes, s.rise(mast, drop, 142), 'late-rear-mast', p,
                   'NATIVE_LATE_ANTENNA_EXTENSION', drop=drop)
            s.phases.append(nodes); continue
        reach = fraction(p, 1, 13)
        rear = s.closed_floor([(100, 137), (123, 149), (100, 162), (77, 150)])
        s.draw(nodes, rear, 'rear-foundation', p, 'FIXED_ORIGINAL_REAR_FOUNDATION')
        if p >= 3:
            rear_base = s.closed_floor([(103, 135), (173, 150), (119, 181), (73, 160)])
            s.draw(nodes, rear_base, 'connected-rear-chassis', p, 'REAR_CHASSIS_PRESENT_BEHIND_ROOF')
            floor = s.closed_floor([(102, 140), (124+102*reach, 149+43*reach),
                                     (101+94*reach, 163+49*reach), (73, 163)])
            s.draw(nodes, floor, 'longitudinal-floor', p, 'NATIVE_UPPER_LEFT_TO_LOWER_RIGHT_CONNECTION')
        for name, part, start, end, height, line in [
            ('left-rear-support', left, 1, 12, 69, (-.5, 222)),
            ('right-rear-support', right, 2, 12, 52, (.5, 66)),
        ]:
            if p >= start:
                drop = height*(1-fraction(p, start, end))
                moving = terminal.move(part, dy=drop)
                moving = terminal.masked(moving, y <= line[0]*x+line[1])
                s.draw(nodes, moving, name, p, 'CONNECTED_REAR_SUPPORT_RISE', drop=drop)
        if p >= 2:
            angle = -18*(1-fraction(p, 3, 18))
            drop = 55*(1-fraction(p, 2, 10))
            moving = terminal.move(s.rotate(left_brace, angle, (100, 135)), dy=drop)
            moving = terminal.masked(moving, y <= -.5*x+224)
            s.draw(nodes, moving, 'left-rear-brace', p, 'REAR_BRACE_UNFOLDS_OUTWARD_FROM_FIXED_UPPER_ATTACHMENT', angle=angle, drop=drop)
        if p >= 4:
            # Every course is a whole closed curved body. It translates by
            # (+12,+6), preserving material scale and the native view axis.
            for i in range(5):
                distance = i*12*extension[p]
                moving = terminal.move(capped if i == 4 else bare,
                                       dx=distance, dy=distance*.5+shell_drops[p])
                if p < 11:
                    aperture = y <= np.minimum(.5*x+99, -.5*x+230)
                    moving = terminal.masked(moving, aperture)
                s.draw(nodes, moving, 'rear-vault-course-'+str(i), p,
                       'WHOLE_NATIVE_SCALE_VAULT_TELESCOPES_DIAGONALLY',
                       travel=[distance, distance*.5], rearModuleSize=[48, 36], critical=True)
        if 2 <= p <= 22:
            # The Original early frame has slender posts and a bare red arch.
            travel = fraction(p, 8, 13)
            moving = terminal.move(early_front, dx=17*travel, dy=-6*travel)
            if p < 3:
                moving = s.hinge(moving, 38, (172, 196), axis=(2., -1.), fold=(.5, .25))
            s.draw(nodes, moving, 'slender-opening-portal', p, 'ORIGINAL_UNDEVELOPED_FRONT_FRAME')
        if p >= 11:
            for name, part, pivot in [('left-folding-buttress', left_foot, (171, 177)),
                                      ('right-folding-buttress', right_foot, (213, 160))]:
                angle = -78*(1-fraction(p, 11, 22))
                s.draw(nodes, s.hinge(part, angle, pivot, axis=(2., -1.), fold=(.5, .25)),
                       name, p, 'BUTTRESS_UNFOLDS_AFTER_THIN_FRONT_FRAME', angle=angle)
        if p >= 12:
            s.draw(nodes, arch, 'seated-front-rim', p, 'RETAINED_FINAL_FRONT_RIM')
            drop = 36*(1-fraction(p, 14, 21))
            moving = terminal.move(shutter, dy=drop)
            s.draw(nodes, terminal.masked(moving, y <= -.5*x+307), 'shutter', p,
                   'SHUTTER_RISES_AFTER_FRONT_FRAME', drop=drop)
        if p >= 15:
            angle = 78*(1-fraction(p, 15, 19))
            s.draw(nodes, s.hinge(ramp, angle, (204, 201), axis=(2., -1.), fold=(.7, .35), ground=True),
                   'loading-ramp', p, 'COMPLETE_LOADING_RAMP_FOLDS_OUT', angle=angle, critical=True)
        if p >= 15:
            drop = 46*(1-fraction(p, 15, 23))
            s.draw(nodes, s.rise(mast, drop, 142), 'rear-antenna-and-cross-beams', p,
                   'REAR_BEAMS_AND_MAST_EXTEND_AFTER_ROOF', drop=drop)
        if p >= 16:
            near_wall = terminal.masked(s.full, s.region([(98, 151), (180, 166), (187, 187),
                                                         (118, 183), (90, 166)]) & ~left_mask)
            s.draw(nodes, near_wall, 'connected-near-wall-and-pipes', p,
                   'SIDE_WALL_AND_PIPE_BANK_SEAT_UNDER_EXTENDING_VAULT')
        if p >= 18:
            remainder = ~(roof_mask | left_mask | right_mask | mast_mask | arch_mask |
                          left_foot_mask | right_foot_mask)
            s.draw(nodes, terminal.masked(s.full, remainder), 'retained-perimeter-services', p,
                   'PERIMETER_SERVICES_SEAT_AFTER_STRUCTURES')
        if p >= 21:
            # The telescope has finished moving; the seated exterior occupies
            # its canonical location before the completion marker.
            s.draw(nodes, seated_roof, 'seated-exterior', p, 'RETAINED_SEATED_ROOF_SKIN')
        s.phases.append(nodes)
    return s.finish()


def construction_yard(s):
    # Retain the later roof/arm work while replacing the incomplete opening
    # capsule and its native retraction poses with one complete new master.
    old.construction_yard(s)
    saved = s.phases
    s.phases = []
    body = s.part('capsule', (76, 108, 177, 185))
    nose_mask = (s.xx-2*s.yy < -216) & (s.xx < 119)
    nose, core = terminal.masked(body, nose_mask), terminal.masked(body, ~nose_mask)
    floor = s.cell(3, (15, 113, 239, 228))
    floor = over(floor, s.closed_floor([(126, 114), (239, 170), (126, 228), (15, 170)]))
    for p in range(7):
        nodes = []
        if p >= 2:
            extent = fraction(p, 1, 4)
            polygon = (np.array([(15, 169), (126, 114), (239, 170), (126, 228)])-[126, 170])*extent+[126, 170]
            s.draw(nodes, terminal.masked(floor, s.region(polygon)), 'opening-foundation', p,
                   'ORIGINAL_FOUNDATION_UNFOLDS_UNDER_COMPLETE_CAPSULE')
        drop = [0, 1, 4, 8, 12, 18, 28][p]
        angle = [0, 12, 28, 44, 61, 75, 85][p]
        front = s.hinge(nose, angle, (106, 161), axis=(2., 1.), fold=(.4, -.4))
        capsule = terminal.move(over(front, core), dy=drop)
        if p >= 2:
            capsule = terminal.masked(capsule, s.yy <= -.48*s.xx+222)
        s.draw(nodes, capsule, 'complete-opening-capsule', p,
               'COMPLETE_HULL_SKIDS_AND_NOSE_RETRACT_THROUGH_NATIVE_FOUNDATION',
               drop=drop, noseAngle=angle, critical=p == 0)
        # A low gold rear hatch rises edge-on in the next Original frame.
        if 1 <= p <= 4:
            fin = s.panel([(162, 110), (169, 113), (169, 124), (162, 121)], material=0, depth=.5)
            fin = terminal.move(fin, dy=drop*.65)
            s.draw(nodes, fin, 'rear-roof-flap', p, 'GOLD_REAR_FLAP_RISES_IN_ORIGINAL_PHASE')
        s.phases.append(nodes)
    s.phases.extend(saved[7:])
    return s.finish()


def shipyard(s):
    x, y = s.xx, s.yy
    tower_mask = s.region([(123, 44), (188, 44), (195, 128), (157, 146), (119, 130)])
    badge_masks = [s.region([(127, 137), (141, 140), (139, 155), (122, 164), (116, 159)]),
                   s.region([(175, 140), (185, 137), (199, 158), (193, 165), (181, 156)])]
    tower = terminal.masked(s.full, tower_mask)
    crane_mask = s.region([(196, 103), (270, 103), (270, 157), (222, 159), (198, 145)]) | s.region([(251, 128), (271, 128), (271, 169), (251, 169)])
    crane = terminal.masked(s.full, crane_mask)
    dock = terminal.masked(s.full, ~(tower_mask | badge_masks[0] | badge_masks[1] | crane_mask))
    hidden = np.array(Image.open(old.BATCH/'registered-empty-dock-v1.png').convert('RGBA'))
    hidden[hidden[..., 3] < 96] = 0
    deck_window = s.region([(155, 109), (201, 132), (204, 165), (156, 173), (114, 166), (113, 131)])
    deck = over(dock, terminal.masked(hidden, deck_window))
    upper_deck_mask = s.region([(155, 108), (202, 132), (202, 145), (156, 169), (113, 146), (113, 131)])
    upper_deck, lower_deck = terminal.masked(deck, upper_deck_mask), terminal.masked(deck, ~upper_deck_mask)
    flat = s.part('flat-tower', (128, 94, 186, 151))
    cap_mask = y < 123
    cap, cylinder = terminal.masked(flat, cap_mask), terminal.masked(flat, ~cap_mask)
    # Native cap tops (zero-based phases 11..23): 127,122,117,112,
    # 108,103,98,94...; the native disk is calibrated +6 px in X
    # against the retained HD platform's central socket.
    drops = {10: 38, 11: 33, 12: 28, 13: 23, 14: 18, 15: 14,
             16: 9, 17: 4, 18: 0, 19: 0, 20: 0, 21: 0, 22: 0, 23: 0}
    antenna = terminal.masked(tower, s.region([(141, 44), (168, 44), (168, 86), (161, 94), (142, 91)]))
    # The retained mast starts at native Y=51 before clipping. Match the
    # Original visible tops 85/74/61 with full-body drops 34/23/10, keeping
    # the feet seated in the flat cap before the terminal hemisphere rises.
    outer_frame = terminal.masked(tower, y >= 116)
    deck_lift = [14, 14, 13, 12, 11, 9, 8, 7, 7, 6]+[6]*15
    native_crane_top = [123, 123, 122, 122, 121, 120, 119, 118, 117, 116, 115, 114, 113, 113, 112, 112, 112, 112, 112, 112, 112, 112, 112, 112, 112]
    for p in range(s.record['frames']):
        if p == s.record['frames']-1:
            s.phases.append(s.terminal(p)); continue
        nodes = []
        frame_deck = over(lower_deck, terminal.move(upper_deck, dy=deck_lift[p]))
        s.draw(nodes, frame_deck, 'complete-native-dock', p, 'WHOLE_UPPER_PLATFORM_LIFTS_IN_ORIGINAL_PHASES', platformDrop=deck_lift[p])
        crane_top = np.where(crane[..., 3] >= 8)[0].min()/4
        crane_drop = max(native_crane_top[p]-112, s.rig.logical[p]['trimOrigin'][1]-crane_top)
        s.draw(nodes, terminal.move(crane, dy=crane_drop), 'complete-moving-crane', p,
               'ORIGINAL_CRANE_HEAD_RISE_WITHOUT_FRAME_CROP', drop=crane_drop, critical=True)
        if p >= 11:
            d = drops[p]
            moving = terminal.move(cylinder, dy=d)
            aperture = y <= np.minimum(.5*x+66.5, -.5*x+223.5)
            s.draw(nodes, terminal.masked(moving, aperture), 'whole-cylinder-side', p,
                   'DARK_CYLINDER_RISES_THROUGH_DECK_SOCKET', drop=d)
            # Never cut the crown into horizontal slices: the complete flat
            # cap and its red rim travel together above the rising cylinder.
            s.draw(nodes, terminal.move(cap, dy=d), 'complete-flat-crown', p,
                   'WHOLE_FLAT_DISK_AND_RED_RIM_RISE_IN_ORIGINAL_ORDER', drop=d, critical=True)
            # The deck lip occludes the bottom of the mechanism; its full
            # flat disk remains above that physical edge.
            s.draw(nodes, terminal.masked(frame_deck, ~aperture), 'front-deck-lip', p,
                   'FOREGROUND_DECK_OCCLUDES_RISING_CYLINDER')
            if p >= 15:
                frame_drop = 30*(1-fraction(p, 15, 20))
                moving = terminal.move(outer_frame, dy=frame_drop)
                s.draw(nodes, terminal.masked(moving, aperture), 'outer-brass-frame', p,
                       'OUTER_FRAME_EMERGES_AFTER_DARK_CYLINDER', drop=frame_drop)
        if p >= 18:
            for i, mask in enumerate(badge_masks):
                drop = 17*(1-fraction(p, 18, 23))
                s.draw(nodes, s.rise(terminal.masked(s.full, mask), drop, 166), 'curved-dock-badge-'+str(i), p,
                       'BADGES_EXTEND_AFTER_TOWER_SEATS', drop=drop)
        if p >= 21:
            d = [34, 23, 10][p-21]
            s.draw(nodes, s.rise(antenna, d, 112), 'late-antennas', p,
                   'ANTENNAS_EXTEND_LATE_OVER_FLAT_NATIVE_CROWN', drop=d, critical=True)
        s.phases.append(nodes)
    return s.finish()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--theater', default='')
    parser.add_argument('--family', default='')
    args = parser.parse_args()
    args.output.mkdir(exist_ok=False)
    source = args.output/'authoring-source.py'
    shutil.copy2(__file__, source)
    rigs = {}
    for record in read(old.prior.AUTHORITY)['families']:
        if args.theater and record['theater'] != args.theater:
            continue
        if args.family and record['identity'] != args.family:
            continue
        scene = Scene(record, args.output/record['key'], source)
        rig = {'YAWEAP': factory, 'YACNST': construction_yard, 'YAYARD': shipyard}[record['identity']](scene)
        rigs[record['key']] = rig
        critical = [c for c in scene.native_crops if c['critical'] and c['opaquePixelsOutsideNativeFrame']]
        print(record['key'], len(critical), 'critical boundary mismatches', flush=True)
    write(args.output/'rigs.json', rigs)


if __name__ == '__main__':
    main()
