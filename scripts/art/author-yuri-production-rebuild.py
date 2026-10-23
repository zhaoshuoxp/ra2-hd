"""Complete production mechanisms, without destructive native-frame clipping.

The user authorized artwork-boundary support for these three MK families only.
Native metadata, frame counts and world-space anchors remain unchanged.
"""
import argparse
import shutil
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import label

from buildup import read, sha, write
from painted_rig import over, place, bounds

prior = SourceFileLoader('production_prior', 'scripts/art/author-yuri-production.py').load_module()
terminal, fraction = prior.terminal, prior.fraction
BATCH = prior.ROOT / 'yuri-production-rebuild-r113-v1'


def clean_cell(path, box=None):
    image = Image.open(path).convert('RGBA')
    if box:
        image = image.crop(box)
    rgba = np.array(image)
    labels, count = label(rgba[..., 3] >= 230)
    sizes = np.bincount(labels.ravel()); sizes[0] = 0
    assert count
    rgba[..., 3] = np.where(labels == sizes.argmax(), 255, 0)
    rgba[rgba[..., 3] == 0] = 0
    result = Image.fromarray(rgba)
    return result.crop(result.getbbox())


class Scene(prior.Scene):
    def __init__(self, record, output, source):
        super().__init__(record, output, source)
        self.source.update(rebuildCode=str(source), rebuildCodeSha256=sha(source))
        self.clipping = []
        self.kits = {}
        cells = {
            'factory': [(0, 60, 558, 515), (550, 65, 1125, 515), (1200, 0, 1536, 525),
                        (0, 520, 335, 1024), (335, 530, 1200, 1024), (1210, 590, 1536, 1024)],
            'yard': [(30, 30, 578, 520), (550, 65, 1100, 505), (1130, 15, 1536, 510),
                     (10, 530, 830, 1024), (755, 560, 1210, 985), (1200, 525, 1536, 1024)],
        }
        for name, boxes in cells.items():
            path = BATCH / (name + '-components-v1.png')
            self.kits[name] = [clean_cell(path, box) for box in boxes]
            self.source[name + 'Kit'] = {'path': str(path), 'sha256': sha(path)}

    def complete(self, kit, cell, box):
        return place(self.kits[kit][cell], box, self.rig.canvas)

    def draw(self, nodes, layer, name, phase, method, **details):
        if not layer[..., 3].any():
            return
        # Preserve all artwork. Report incompatible legacy bounds instead of
        # silently deleting pieces of complete mechanisms.
        frame = self.rig.logical[phase]
        x, y = frame['trimOrigin']; w, h = frame['trimSize']
        outside = layer[..., 3].copy()
        outside[y*4:(y+h)*4, x*4:(x+w)*4] = 0
        if (outside >= 8).any():
            self.clipping.append({'phase': phase, 'component': name,
                                  'opaquePixelsPreviouslyClipped': int((outside >= 8).sum()),
                                  'bounds': bounds(outside >= 8)})
        if not self.owner_allowed[phase]:
            layer = prior.base.neutral(layer)
        nodes.append(self.rig.save(layer, name, phase, {'method': method, **details}))
        self.checks.append({'phase': phase, 'name': name, 'method': method, **details})

    def end(self, phase, settled):
        if phase == self.record['frames'] - 1:
            return self.terminal(phase)
        if phase >= settled:
            nodes = []
            self.draw(nodes, self.full, 'complete-retained-body', phase, 'EXACT_RETAINED_FINISHED_ART')
            return nodes
        return None

    def finish(self):
        result = super().finish()
        result['authoredBoundsReview'] = {'status': 'AUTHORIZED_YURI_PRODUCTION_ARTWORK_BOUNDS',
                                        'nativeClippingRemoved': self.clipping,
                                        'deletedOpaquePixels': 0}
        result['constructionArtworkBounds'] = 'yuri-production-v1'
        return result

    def rise_aperture(self, layer, drop, vertices):
        # Only the physical aperture hides a rising body. The polygon describes
        # its front edge in world coordinates; there is no sprite-rectangle crop.
        return terminal.masked(terminal.move(layer, dy=drop), self.region(vertices))


def factory(s):
    x, y = s.xx, s.yy
    floor = s.complete('factory', 4, (63, 126, 262, 228))
    # Completed visible surfaces remain registered. Independently painted bodies
    # supply the formerly occluded connections underneath those surfaces.
    support_left = s.complete('factory', 2, (72, 88, 117, 178))
    support_right = s.complete('factory', 3, (145, 84, 178, 143))
    left_mask = s.region([(77, 87), (111, 87), (113, 122), (100, 155), (88, 178), (71, 170)])
    right_mask = s.region([(148, 83), (165, 83), (170, 123), (178, 140), (157, 142), (148, 124)])
    support_left = terminal.masked(s.full, left_mask)
    support_right = terminal.masked(s.full, right_mask)
    mast_mask = s.region([(111, 67), (139, 67), (140, 110), (156, 118), (154, 125),
                          (128, 122), (102, 140), (98, 136), (121, 118)])
    mast = terminal.masked(s.full, mast_mask)
    arch = s.complete('factory', 0, (157, 142, 244, 216))
    arch_mask = s.region([(163, 161), (176, 154), (195, 150), (211, 153), (211, 141),
                          (220, 142), (226, 170), (244, 193), (238, 197), (216, 182),
                          (208, 164), (182, 173), (177, 183), (185, 198), (199, 212),
                          (192, 216), (171, 204), (157, 179)])
    arch = terminal.masked(s.full, arch_mask)
    door = terminal.masked(s.full, s.region([(175, 179), (211, 164), (223, 195), (187, 214)]))
    ramp = terminal.masked(s.full, s.region([(186, 212), (223, 194), (255, 209), (219, 226)]))
    # Intact nested vaulted bodies translate along the longitudinal isometric
    # axis. No diagonal slices of a finished roof are moved independently.
    shell = s.complete('factory', 1, (84, 125, 163, 180))
    shell_mask = s.region([(99, 130), (128, 123), (199, 151), (211, 164),
                           (188, 188), (184, 204), (100, 171)]) & ~mast_mask & ~left_mask
    seated_shell = terminal.masked(s.full, shell_mask & ~arch_mask)
    for p in range(s.record['frames']):
        nodes = s.end(p, 22)
        if nodes is not None:
            s.phases.append(nodes); continue
        nodes = []
        reach = fraction(p, 0, 12)
        rear_pad = s.closed_floor([(100, 137), (123, 148), (100, 160), (78, 149)])
        s.draw(nodes, rear_pad, 'fixed-rear-pad', p, 'FIXED_REAR_FOUNDATION')
        if p >= 3:
            rear_polygon = np.array([(142, 126), (180, 145), (110, 180), (72, 160)], dtype=float)
            rear_polygon = (rear_polygon-[112, 151])*fraction(p, 2, 7)+[112, 151]
            s.draw(nodes, s.closed_floor(rear_polygon), 'connected-rear-platform', p,
                   'FIXED_UV_REAR_PLATFORM_CLOSES_BOTH_SUPPORT_SOCKETS')
        if p >= 2:
            # The complete outer portal is built away from the rear shelter,
            # then moves along the retail view axis toward its final threshold.
            travel = 29 * (1 - fraction(p, 8, 13))
            dx, dy = -travel * .65, travel * .5
            front_floor = s.closed_floor([(165, 188), (216, 165), (242, 195), (198, 216)])
            gray = front_floor[..., :3].mean(axis=-1)
            front_floor[..., :3] = np.stack([gray*.92, gray*.96, gray], axis=-1).astype('uint8')
            s.draw(nodes, terminal.move(front_floor, dx=dx, dy=dy), 'front-platform', p,
                   'COMPLETE_PLATFORM_RETURNS_WITH_PORTAL', travel=travel)
        if p >= 3:
            aperture = [(62, 0), (270, 0), (270, 230), (63, 170)]
            # Expose connected floor panels along the hangar's length at fixed UV.
            ground = s.closed_floor([(100, 137), (124 + 104*reach, 149 + 41*reach),
                                     (101 + 93*reach, 162 + 54*reach), (73, 163)])
            s.draw(nodes, ground, 'extending-platform', p,
                   'CONTINUOUS_FIXED_UV_FOUNDATION')
        for i, (part, start, end, drop, plane) in enumerate([
            (support_right, 1, 8, 55, [(0, 0), (272, 0), (272, 187), (140, 145), (0, 75)]),
            (support_left, 2, 9, 74, [(0, 0), (272, 0), (272, 87), (70, 185), (0, 220)])]):
            if p >= start:
                d = drop * (1-fraction(p, start, end))
                s.draw(nodes, s.rise_aperture(part, d, plane), 'rear-support-' + str(i), p,
                       'COMPLETE_SUPPORT_EMERGES_FROM_OWN_SOCKET', drop=d)
        if p >= 4:
            extension = fraction(p, 12, 21)
            drop = 24*(1-fraction(p, 4, 8))
            assembled = s.blank()
            for i in range(5):
                distance = i * 12 * extension
                moving = terminal.move(shell, dx=distance, dy=distance*.5 + drop)
                moving = terminal.masked(moving, y <= .5*x + 125)
                assembled = over(moving, assembled)
            seating = fraction(p, 18, 21)
            if seating:
                # The final courses cover their open end rims at seating.
                # Blend only their independently painted exterior into the
                # exact retained skin; the whole roof keeps complete coverage.
                first = assembled.astype(float)
                last = seated_shell.astype(float)
                alpha = first[..., 3]*(1-seating) + last[..., 3]*seating
                rgb = first[..., :3]*first[..., 3,None]*(1-seating) + last[..., :3]*last[..., 3,None]*seating
                rgb = np.divide(rgb, alpha[...,None], out=np.zeros_like(rgb), where=alpha[...,None]>0)
                assembled = np.concatenate([rgb, alpha[...,None]], axis=-1).round().clip(0,255).astype('uint8')
            s.draw(nodes, assembled, 'complete-telescoping-roof', p,
                   'COMPLETE_NESTED_VAULTS_TRANSLATE_AND_SEAT', extension=extension, seating=seating)
        if p >= 2:
            s.draw(nodes, terminal.move(arch, dx=dx, dy=dy), 'complete-front-portal', p,
                   'CONNECTED_PORTAL_AND_BOTH_FEET_TRANSLATE_AS_ONE', travel=travel)
        if p >= 12:
            drop = 32*(1-fraction(p, 12, 16))
            moving = terminal.move(door, dy=drop)
            moving = terminal.masked(moving, y <= -.5*x + 307)
            s.draw(nodes, moving, 'complete-shutter', p, 'SHUTTER_RISES_THROUGH_THRESHOLD', drop=drop)
        if p >= 14:
            angle = -78*(1-fraction(p, 14, 18))
            s.draw(nodes, s.hinge(ramp, angle, (204, 201), axis=(2., -1.), fold=(.7, .35), ground=True),
                   'whole-ramp', p, 'RIGID_RAMP_FOLDS_OUT', angle=angle)
        if p >= 15:
            drop = 44*(1-fraction(p, 15, 21))
            s.draw(nodes, s.rise(mast, drop, 140), 'complete-mast', p, 'MAST_EXTENDS_AFTER_ROOF', drop=drop)
        if p >= 19:
            stable = ~shell_mask & ~mast_mask & ~left_mask & ~right_mask & ~arch_mask
            s.draw(nodes, terminal.masked(s.full, stable), 'retained-perimeter', p,
                   'SEATED_PERIMETER_AND_SERVICES')
        s.phases.append(nodes)
    return s.finish()


def construction_yard(s):
    x, y = s.xx, s.yy
    floor = s.cell(3, (15, 113, 239, 228))
    floor = over(floor, s.closed_floor([(126, 114), (239, 170), (126, 228), (15, 170)]))
    capsule = s.cell(0, (76, 108, 178, 192))
    # Complete construction-specific parts back the matching visible final art.
    front_poly = [(122, 131), (141, 129), (166, 143), (182, 176), (161, 195), (140, 185), (123, 165)]
    right_poly = [(200, 119), (221, 116), (238, 168), (218, 177), (199, 152)]
    roof_poly = [(140, 133), (160, 122), (169, 119), (192, 120), (202, 140), (173, 158), (158, 149)]
    left_poly = [(83, 97), (103, 98), (106, 134), (99, 150), (83, 165), (77, 151)]
    machinery_poly = [(109, 77), (151, 78), (153, 145), (118, 165), (100, 150), (102, 119)]
    dome_poly = [(52, 119), (79, 120), (88, 145), (78, 162), (53, 170), (47, 151)]
    foot_poly = [(26, 130), (51, 131), (59, 155), (37, 177), (25, 168)]
    crane_poly = [(38, 96), (83, 96), (83, 118), (54, 130), (40, 123)]
    mast_poly = [(177, 69), (202, 69), (205, 116), (186, 125), (177, 113)]
    back_poly = [(151, 108), (184, 94), (184, 125), (163, 137), (150, 125)]
    polys = [crane_poly, mast_poly, front_poly, right_poly, roof_poly, left_poly,
             machinery_poly, dome_poly, foot_poly, back_poly]
    parts, remainder = s.split(polys)
    crane, mast, front, right, roof, left, machinery, dome, foot, back = parts
    door_mask = s.region([(129, 143), (155, 153), (155, 181), (129, 167)])
    door = terminal.masked(front, door_mask)
    portal = terminal.masked(front, ~door_mask)
    right = right
    left = left
    closed_roof = s.complete('yard', 1, (140, 119, 204, 159))
    left_leaf = terminal.masked(closed_roof, x + 2*y < 441)
    right_leaf = terminal.masked(closed_roof, x + 2*y >= 441)
    rear_wall = s.panel([(154, 110), (184, 95), (184, 145), (154, 160)])
    tone = rear_wall[..., :3].mean(axis=-1)
    rear_wall[..., :3] = np.stack([np.minimum(220, tone*1.6+35), tone*.10, tone*.07], axis=-1).astype('uint8')
    back = over(back, rear_wall)
    # One connected roof leaf is hinged about its true supporting edge.
    # The opposite leaf is covered by the full lower shell during the overlap.
    for p in range(s.record['frames']):
        nodes = s.end(p, 25)
        if nodes is not None:
            s.phases.append(nodes); continue
        nodes = []
        if p >= 2:
            extent = fraction(p, 1, 4)
            polygon = (np.array([(15, 169), (126, 114), (239, 170), (126, 228)])
                       - [126, 170])*extent + [126, 170]
            s.draw(nodes, terminal.masked(floor, s.region(polygon)), 'continuous-foundation', p,
                   'FULL_FIXED_UV_PLATFORM_REVEALED_FROM_CENTER')
        if p <= 6:
            drop = [0, 0, 4, 14, 28, 36, 48][p]
            aperture = [(0, 0), (256, 0), (256, 98), (0, 221)]
            moving = s.rise_aperture(capsule, drop, aperture)
            s.draw(nodes, moving, 'complete-retracting-capsule', p,
                   'WHOLE_CAPSULE_RETRACTS_THROUGH_PLATFORM', drop=drop)
        for name, component, start, end, drop, plane in [
            ('rear-wall', back, 5, 8, 43, (-.5, 231)),
            ('right-wall', right, 5, 8, 48, (-.5, 285)),
            ('entrance-portal', portal, 6, 9, 57, (.5, 115)),
            ('left-foot', foot, 8, 11, 38, (-.5, 194)),
            ('left-wall', left, 9, 13, 62, (-.5, 207)),
            ('industrial-pipe-block', machinery, 14, 22, 87, (-.5, 224)),
            ('left-cupola', dome, 16, 22, 55, (-.5, 198)),
        ]:
            if p >= start:
                dy = drop*(1-fraction(p, start, end))
                moving = terminal.move(component, dy=dy)
                moving = terminal.masked(moving, y <= plane[0]*x + plane[1])
                s.draw(nodes, moving, name, p, 'COMPLETE_CONNECTED_MECHANISM_RISES_FROM_SOCKET', drop=dy)
        for name, leaf, start, end, sign, pivot in [
            ('rear-roof-leaf', left_leaf, 9, 13, 1, (161, 128)),
            ('front-roof-leaf', right_leaf, 12, 16, -1, (190, 139)),
        ]:
            if p >= start:
                if p >= 22:
                    target = terminal.masked(roof, x+2*y < 441 if sign == 1 else x+2*y >= 441)
                    t = fraction(p, 21, 24)
                    a = leaf[..., 3].astype(float)*(1-t) + target[..., 3].astype(float)*t
                    rgb = leaf[..., :3].astype(float)*leaf[..., 3,None]*(1-t) + target[..., :3].astype(float)*target[..., 3,None]*t
                    rgb = np.divide(rgb, a[...,None], out=np.zeros_like(rgb), where=a[...,None]>0)
                    leaf = np.concatenate([rgb, a[...,None]], axis=-1).round().clip(0,255).astype('uint8')
                angle = sign*83*(1-fraction(p, start, end))
                s.draw(nodes, s.hinge(leaf, angle, pivot, axis=(2., -1.), fold=(.5, .25)),
                       name, p, 'CONNECTED_ROOF_LEAF_HINGES_ABOUT_LONGITUDINAL_EDGE', angle=angle)
        if p >= 11:
            angle = -83*(1-fraction(p, 11, 16))
            s.draw(nodes, s.hinge(door, angle, (142, 174), axis=(2., 1.), fold=(.5, -.25)),
                   'complete-door', p, 'WHOLE_DOOR_HINGES_UP', angle=angle)
        if p >= 17:
            angle = 73*(1-fraction(p, 17, 24))
            s.draw(nodes, s.rotate(crane, angle, (49, 123)), 'whole-crane', p,
                   'CRANE_UNFOLDS_ABOUT_FIXED_ATTACHMENT', angle=angle)
        if p >= 20:
            d = 48*(1-fraction(p, 20, 24))
            s.draw(nodes, s.rise(mast, d, 122), 'complete-mast', p, 'MAST_RISES_FROM_REAR_ROOF', drop=d)
        if p >= 22:
            s.draw(nodes, remainder, 'retained-services', p, 'SEATED_RETAINED_SERVICES')
        s.phases.append(nodes)
    return s.finish()


def shipyard(s):
    x, y = s.xx, s.yy
    # Three fixed diamond landmarks define the central deck and the tower socket.
    # Its front edge is V-shaped in the image, not a horizontal crop line.
    tower_poly = [(123, 44), (188, 44), (195, 128), (157, 146), (119, 130)]
    antenna_poly = [(141, 44), (168, 44), (167, 85), (161, 91), (143, 88)]
    badge_polys = [[(127, 137), (141, 140), (139, 155), (122, 164), (116, 159)],
                   [(175, 140), (185, 137), (199, 158), (193, 165), (181, 156)]]
    parts, dock = s.split([tower_poly, *badge_polys])
    tower, left, right = parts
    antennas = terminal.masked(tower, s.region(antenna_poly))
    body = terminal.masked(tower, y >= 99)
    dome = terminal.masked(tower, (y >= 87) & (y < 110))
    # The platform keeps its retained perimeter, supporting walls and dock legs.
    # Reconstruct only the newly exposed top face, in the exact tower socket.
    hidden = np.array(Image.open(BATCH / 'registered-empty-dock-v1.png').convert('RGBA'))
    hidden[..., 3] = np.where(hidden[..., 3] >= 230, 255, 0)
    hidden[hidden[..., 3] == 0] = 0
    # A closed, registered replacement covers the entire exposed upper deck,
    # including surfaces formerly hidden by badges, without moving the dock.
    deck_window = s.region([(155, 109), (201, 132), (204, 165), (156, 173), (114, 166), (113, 131)])
    deck = over(dock, terminal.masked(hidden, deck_window))
    for p in range(s.record['frames']):
        nodes = s.end(p, 23)
        if nodes is not None:
            s.phases.append(nodes); continue
        nodes = []
        s.draw(nodes, deck, 'complete-fixed-dock', p, 'EXACT_FIXED_DOCK_AND_CENTERED_TOWER_SOCKET')
        if p >= 10:
            drop = 34*(1-fraction(p, 10, 20))
            moving = terminal.move(body, dy=drop)
            visible = (y <= np.minimum(.5*x + 72.5, -.5*x + 229.5))
            s.draw(nodes, terminal.masked(moving, visible), 'whole-centered-tower', p,
                   'RIGID_VERTICAL_RISE_AT_FIXED_PLATFORM_CENTER', drop=drop, center=[157, 132])
        if p >= 15:
            dome_drop = 23*(1-fraction(p, 15, 21))
            s.draw(nodes, s.rise(dome, dome_drop, 110), 'whole-dome', p,
                   'DOME_RISES_FROM_SEATED_CYLINDER', drop=dome_drop)
        if p >= 18:
            for i, badge in enumerate([left, right]):
                drop = 17*(1-fraction(p, 18, 22))
                s.draw(nodes, s.rise(badge, drop, 165), 'complete-badge-' + str(i), p,
                       'COMPLETE_CURVED_BADGE_EXTENDS', drop=drop)
        if p >= 20:
            d = 40*(1-fraction(p, 20, 23))
            s.draw(nodes, s.rise(antennas, d, 91), 'complete-antennas', p,
                   'ANTENNAS_EXTEND_AFTER_TOWER_SEATS', drop=d)
        s.phases.append(nodes)
    return s.finish()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--theater', default='')
    parser.add_argument('--family', default='')
    args = parser.parse_args()
    args.output.mkdir(exist_ok=False)
    source = args.output / 'authoring-source.py'
    shutil.copy2(__file__, source)
    rigs = {}
    for record in read(prior.AUTHORITY)['families']:
        if args.theater and record['theater'] != args.theater:
            continue
        if args.family and record['identity'] != args.family:
            continue
        s = Scene(record, args.output / record['key'], source)
        rigs[record['key']] = {'YAWEAP': factory, 'YACNST': construction_yard, 'YAYARD': shipyard}[record['identity']](s)
        print(record['key'], len(s.clipping), 'legacy-bound incompatibilities; zero deleted pixels', flush=True)
    write(args.output / 'rigs.json', rigs)


if __name__ == '__main__':
    main()
