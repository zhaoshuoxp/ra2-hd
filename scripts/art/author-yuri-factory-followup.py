"""Factory floor contours and curved telescope registration, V49."""
import argparse
import shutil
from pathlib import Path
from importlib.machinery import SourceFileLoader
import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation
from buildup import native_indices, read, write
from painted_rig import over, project_rgba, vector_coverage
prior = SourceFileLoader('factory_prior', 'scripts/art/author-yuri-original-production.py').load_module()
terminal, fraction = prior.terminal, prior.fraction
BATCH = prior.ROOT/'yuri-factory-followup-r115-v1'

class Scene(prior.Scene):
    def native_floor(self, p):
        idx = native_indices(self.rig.raw, p)
        yy, xx = np.mgrid[:idx.shape[0], :idx.shape[1]]
        u, v = xx+2*yy, xx-2*yy
        if p == 0:
            mask = (idx > 0) & (idx != 1)
        else:
            mask = (idx > 0) & (idx != 1) & (v >= -246) & (v <= -157) & (u >= 374)
            mask &= ~((idx >= 16) & (idx < 32))
        cover = vector_coverage(mask)
        if not hasattr(self, 'floor_uv'):
            self.closed_floor([(1,1),(2,1),(2,2),(1,2)])
        face = self.floor_uv.copy()
        face[...,3] = cover
        edge = terminal.move(face, dy=1.25)
        edge[...,:3] = (edge[...,:3]*.48).astype('uint8')
        return over(face,edge)

    def finish(self):
        result = super().finish()
        result['originalPhaseReconstruction']['source'] = str(BATCH)
        result['originalPhaseReconstruction']['floorCoverage'] = 'NATIVE_ALPHA_GEOMETRY_HD_FIXED_UV'
        result['originalPhaseReconstruction']['roofCourseGeometry'] = 'COMPLETE_CLOSED_SLEEVES_RIGID_REGISTERED_TRANSLATION'
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
    red_rim = (s.full[..., 0].astype(float) > s.full[..., 1].astype(float)*2) & (s.full[..., 0] > 70) & arch_mask
    arch_mask = binary_dilation(red_rim, iterations=8) & arch_mask
    arch = terminal.masked(s.full, arch_mask)
    left_foot, right_foot = [terminal.masked(s.full, m) for m in [left_foot_mask, right_foot_mask]]
    shutter = terminal.masked(s.full, s.region([(175, 179), (211, 163), (224, 195), (187, 215)]))
    ramp = terminal.masked(s.full, s.region([(186, 212), (224, 193), (256, 208), (219, 227)]))
    early_front = s.part('front-module', (141, 147, 221, 210))
    bare = s.part('short-shell', (99, 129, 147, 165))
    # Register the complete arch once: both ends share the same rigid travel.
    bare = project_rgba(Image.fromarray(bare), [[.25, 0, 0], [-.025, .25, 11]], s.rig.canvas)
    cap_mask = ((x-174.5)/9)**2 + ((y-155)/6.5)**2 <= 1
    cap = terminal.masked(s.full, cap_mask)
    shell_drops = [0, 0, 0, 0, 22, 18, 14, 10, 6, 3, 1, 0]+[0]*13
    extension = [0]*9 + [0, .02, .05, .09, .14, .21, .29, .38, .47, .57, .68, .79, .88, .95, 1, 1]
    for p in range(s.record['frames']):
        nodes = s.end(p, 23)
        if nodes is not None:
            s.phases.append(nodes); continue
        nodes = []
        if p >= 22:
            s.draw(nodes, terminal.masked(s.full, ~mast_mask), 'seated-complete-shell', p,
                   'COMPLETE_HULL_SEATS_BEFORE_LAST_ANTENNA_EXTENSION')
            drop = 46*(1-fraction(p, 15, 23))
            s.draw(nodes, s.rise(mast, drop, 142), 'late-rear-mast', p,
                   'NATIVE_LATE_ANTENNA_EXTENSION', drop=drop)
            s.phases.append(nodes); continue
        s.draw(nodes, s.native_floor(p), 'measured-native-foundation', p,
               'ORIGINAL_ALPHA_CONTOUR_WITH_WORLD_FIXED_HD_MATERIAL', critical=p == 0)
        for name, part, start, end, height, line in [
            ('left-rear-support', left, 1, 10, 55, (-.5, 222)),
            ('right-rear-support', right, 2, 12, 52, (.5, 66)),
        ]:
            if p >= start:
                drop = height*(1-fraction(p, start, end))
                part_top = np.where(part[..., 3] >= 8)[0].min()/4
                drop = max(drop, s.rig.logical[p]['trimOrigin'][1]-part_top)
                moving = terminal.move(part, dy=drop)
                moving = terminal.masked(moving, y <= line[0]*x+line[1])
                s.draw(nodes, moving, name, p, 'CONNECTED_REAR_SUPPORT_RISE', drop=drop)
        if p >= 2:
            angle = -10*(1-fraction(p, 3, 18))
            drop = 25*(1-fraction(p, 2, 10))
            moving = terminal.move(s.rotate(left_brace, angle, (100, 135)), dy=drop)
            moving = terminal.masked(moving, y <= -.5*x+224)
            s.draw(nodes, moving, 'left-rear-brace', p, 'REAR_BRACE_UNFOLDS_OUTWARD_FROM_FIXED_UPPER_ATTACHMENT', angle=angle, drop=drop)
        if p >= 4:
            e = extension[p]
            # The open front of the compact rear bay reaches the retained door
            # at (+65,+18), with no endpoint shear or sprite-frame recentering.
            backing = terminal.move(bare, dx=65*e, dy=18*e+shell_drops[p])
            if p < 11:
                backing = terminal.masked(backing, y <= -.5*x+220)
            s.draw(nodes, backing, 'whole-vault-front-and-interior', p,
                   'WHOLE_REGISTERED_ARCH_REACHES_RETAINED_FRONT_THRESHOLD', travel=[65*e, 18*e])
            for i in range(4):
                dx, dy = 65*e*i/4, 18*e*i/4+shell_drops[p]
                moving = terminal.move(bare, dx=dx, dy=dy)
                if p < 11:
                    moving = terminal.masked(moving, y <= -.5*x+220)
                s.draw(nodes, moving, 'whole-telescoping-vault-course-'+str(i), p,
                       'COMPLETE_CURVED_SLEEVE_RIGID_REGISTERED_TRANSLATION', travel=[dx,dy], extension=e)
            # The front course occludes those behind it, preserving complete
            # dark arch interiors and side walls throughout the extension.
            s.draw(nodes, backing, 'whole-front-vault-course', p,
                   'COMPLETE_FRONT_SLEEVE_IN_NATIVE_DEPTH_ORDER', extension=e)
            moving = terminal.move(cap, dx=-51*(1-e), dy=-22*(1-e)+shell_drops[p])
            if p < 11:
                moving = terminal.masked(moving, y <= -.5*x+220)
            s.draw(nodes, moving, 'whole-gold-roof-cap', p,
                   'GOLD_CAP_RIGID_TRACK_FROM_NATIVE_REAR_TO_FINAL_SEAT', travel=[-51*(1-e),-22*(1-e)])
        if 2 <= p <= 22:
            # The Original early frame has slender posts and a bare red arch.
            travel = fraction(p, 8, 13)
            moving = terminal.move(early_front, dx=17*travel, dy=-6*travel)
            if p < 3:
                moving = s.hinge(moving, 38, (172, 196), axis=(2., -1.), fold=(.5, .25))
            s.draw(nodes, moving, 'slender-opening-portal', p, 'ORIGINAL_UNDEVELOPED_FRONT_FRAME')
        if p >= 14:
            for name, part, pivot in [('left-folding-buttress', left_foot, (188, 210)),
                                      ('right-folding-buttress', right_foot, (238, 194))]:
                angle = 78*(1-fraction(p, 14, 22))
                s.draw(nodes, s.hinge(part, angle, pivot, axis=(2., -1.), fold=(.5, .25)),
                       name, p, 'BUTTRESS_UNFOLDS_AFTER_THIN_FRONT_FRAME', angle=angle)
        if p >= 18:
            s.draw(nodes, arch, 'seated-front-rim', p, 'RETAINED_FINAL_FRONT_RIM')
        if p >= 12:
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
        if p >= 10:
            near_wall = terminal.masked(s.full, s.region([(98, 148), (184, 177), (185, 207), (106, 182), (93, 169)]) & ~left_mask)
            drop = 27*(1-fraction(p, 10, 18))
            near_wall = terminal.masked(terminal.move(near_wall, dy=drop), y <= .43*x+127)
            s.draw(nodes, near_wall, 'connected-near-wall-and-pipes', p,
                   'SIDE_WALL_AND_PIPE_BANK_RISE_UNDER_EXTENDING_VAULT', drop=drop)
        if p >= 18:
            remainder = ~(roof_mask | left_mask | right_mask | mast_mask | arch_mask |
                          left_foot_mask | right_foot_mask)
            s.draw(nodes, terminal.masked(s.full, remainder), 'retained-perimeter-services', p,
                   'PERIMETER_SERVICES_SEAT_AFTER_STRUCTURES')
        s.phases.append(nodes)
    return s.finish()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--theater', default='')
    args = parser.parse_args()
    args.output.mkdir(exist_ok=False)
    source = args.output/'authoring-source.py'
    shutil.copy2(__file__, source)
    rigs = {}
    for record in read(BATCH/'accepted-authoring-v1.json')['families']:
        if record['identity'] != 'YAWEAP' or (args.theater and record['theater'] != args.theater):
            continue
        scene = Scene(record, args.output/record['key'], source)
        rigs[record['key']] = factory(scene)
        print(record['key'], len(rigs[record['key']]['phases']), flush=True)
    write(args.output/'rigs.json', rigs)
if __name__ == '__main__':
    main()
