"""Repair three opening mechanisms without changing other selected components."""
import argparse
import copy
import shutil
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image

from buildup import read, sha, write
from painted_rig import bounds, place

motion = SourceFileLoader('infrastructure_motion', 'scripts/art/author-infrastructure-motion.py').load_module()
base, terminal = motion.base, motion.terminal
SOURCE = None


def emit(s, nodes, layer, name, phase, method, **details):
    s.emit(nodes, layer, name, phase, method, source=SOURCE, **details)


def refinery(s):
    shell = motion.source_layer(s, 23, 'sliding-curved-casing')
    front = terminal.polygon(shell.shape, [(98,171),(98,151),(108,132),(124,118),
        (136,120),(153,130),(154,164),(124,173)])
    connector = terminal.polygon(shell.shape, [(92,104),(112,99),(151,117),(151,143),
        (139,143),(137,123),(92,114)])
    fixed = terminal.masked(shell, connector)
    arch = terminal.masked(shell, front & ~connector)
    # Divide at the curved rib seam. Both solid nested sides keep their UVs and scale.
    axial = np.zeros_like(s.xx)
    for _ in range(12):
        height = 167-s.yy+.5*axial
        axial -= (100+.012*height**2+axial-s.xx)/(1+.012*height)
    halves = [terminal.masked(arch, axial < 12), terminal.masked(arch, axial >= 12)]
    for p, old in enumerate(s.record['componentRig']['phases']):
        nodes = []
        for node in old:
            if node['name'] != 'sliding-curved-casing':
                nodes.append(copy.deepcopy(node))
                continue
            extent = {11:.16, 12:.38, 13:.62, 14:.83}.get(p, 1.)
            drop = {11:24,12:16,13:10,14:5,15:1}.get(p,0)
            rear = terminal.masked(shell,~front & ~connector)
            rear = terminal.masked(terminal.move(rear,dy=drop),s.yy<=170)
            emit(s,nodes,rear,'preserved-rear-curved-casing',p,
                 'PREVIOUS_REAR_CASING_UNCHANGED')
            emit(s,nodes,fixed,'fixed-front-roof-connector',p,'STATIONARY_CONNECTOR_OVER_TELESCOPING_ARCH')
            for i in [1,0]:
                shift = (1 if i == 0 else -1)*8*(1-extent)
                delta = np.array([1., .5])*shift
                delta[1] += drop
                layer = terminal.masked(terminal.move(halves[i],dx=delta[0],dy=delta[1]),s.yy<=170)
                emit(s, nodes, layer,
                     f'telescoping-curved-shell-{i}',p,
                     'FIXED_SCALE_NESTED_ARCH_SIDE_EXTENDS_FROM_CENTER',
                     translation=delta.tolist(),extension=extent,segment=i)
        s.phases.append(nodes)
    return s.finish()


def yard(s):
    housing = base.mask(s.full, [(180,72),(188,64),(196,61),(198,55),(205,53),(211,55),
        (214,65),(221,72),(228,83),(233,94),(237,106),(233,117),(225,127),
        (217,130),(204,127),(198,117),(189,109),(183,100),(180,89)])
    gold = (housing[...,0] > housing[...,1]*1.08) & (housing[...,1] > housing[...,2]*1.5)
    gold &= (housing[...,1] > 70) & (s.xx > 218) & (s.yy > 96)
    housing = terminal.masked(housing, ~gold)
    top = bounds(housing[...,3] >= 8)[1]/4
    for p, old in enumerate(s.record['componentRig']['phases']):
        nodes = []
        for node in old:
            if node['name'] != 'pivoting-crane-housing':
                nodes.append(copy.deepcopy(node))
                continue
            drop = max(0., s.rig.logical[p]['trimOrigin'][1]-top+.25)
            layer = motion.rise(s, housing, drop, ground=132.75)
            emit(s, nodes, layer, 'vertical-crane-housing', p,
                 'COMPLETE_FIXED_SCALE_HOUSING_RISES_VERTICALLY_FROM_MAST_SOCKET',
                 translation=[0, drop], rotationDegrees=0, socketY=132.75)
        s.phases.append(nodes)
    return s.finish()


def lid_panel(s, surface, edge, angle):
    """Project a solid triangular cover rotating about its outer ground edge."""
    center = np.array([125., 142.])
    ring = np.array([[106.,142.],[125.,132.],[145.,142.],[125.,152.]])
    a, b = ring[edge], ring[(edge+1)%4]
    midpoint = (a+b)/2
    tangent = b-a
    inward = center-midpoint
    radians = np.deg2rad(angle)
    moved = midpoint + inward*np.cos(radians) + np.array([0., -np.linalg.norm(inward)*np.sin(radians)])
    src = np.column_stack((tangent, center-a))
    dst = np.column_stack((tangent, moved-a))
    matrix = dst @ np.linalg.inv(src)
    card = base.mask(surface, [a.tolist(), b.tolist(), center.tolist()])
    return base.transform(card, np.column_stack((matrix, a-matrix@a)), s.rig.canvas)


def barracks(s):
    # Retain the existing statue, plinth, foundations and closing sequence exactly.
    surface = place(motion.intermediate_surfaces(SURFACE_FILE)[1], (103,131,147,154), s.rig.canvas)
    for p, old in enumerate(s.record['componentRig']['phases']):
        nodes = []
        opening = {3:0, 4:30, 5:65, 6:110}.get(p, 110)
        for node in old:
            if node['name'].startswith(('rear-opening-wall-', 'front-opening-wall-')) and p < 7:
                # These outer wall cards unfold from the floor while the inner cover opens.
                i = int(node['name'].rsplit('-', 1)[1])
                panel = motion.source_layer(s, 6, node['name'])
                fraction = {4:.3, 5:.65, 6:1.}[p]
                # A rigid downward offset hides the wall in its fixed ground socket.
                drop = (1-fraction)*17
                layer = motion.rise(s, panel, drop, ground=153.75)
                emit(s,nodes,layer,node['name'],p,'OUTER_WALL_RISES_FROM_GROUND_DURING_COVER_OPENING',
                     translation=[0,drop], openingDegrees=opening, panel=i)
            else:
                nodes.append(copy.deepcopy(node))
            if node['name'] == 'fixed-barracks-slab' and p == 3:
                for i in range(4):
                    emit(s,nodes,lid_panel(s,surface,i,0),'closed-well-cover-'+str(i),p,
                         'COMPLETE_CLOSED_WELL_BEFORE_OPENING',openingDegrees=0)
            if node['name'] == 'open-statue-well' and 4 <= p <= 15:
                for i in range(4):
                    emit(s,nodes,lid_panel(s,surface,i,opening),'opening-well-cover-'+str(i),p,
                         'SOLID_COVER_ROTATES_ABOUT_FIXED_OUTER_HINGE_BEFORE_STATUE',
                         openingDegrees=opening, hingeEdge=i)
        s.phases.append(nodes)
    return s.finish()


def main():
    global SOURCE, SURFACE_FILE
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['authoring', 'assets', 'surface', 'output']:
        parser.add_argument(name, type=Path)
    parser.add_argument('--diagnostic', action='store_true')
    args = parser.parse_args()
    args.output.mkdir(exist_ok=False)
    snapshot = args.output/'authoring-source.py'
    shutil.copy2(__file__, snapshot)
    SOURCE = {'code':str(snapshot), 'sha256':sha(snapshot), 'material':'RETAINED_HD_RIGID_COMPONENTS_AND_EXISTING_EMPTY_PLINTH',
              'surfaceImage':str(args.surface), 'surfaceSha256':sha(args.surface)}
    SURFACE_FILE = args.surface
    methods = {'GAREFN':refinery, 'GAYARD':yard, 'NAHAND':barracks}
    rigs = {}
    for record in read(args.authoring)['families']:
        if record['identity'] not in methods or record['theater'] not in ['TEMPERATE','SNOW']:
            continue
        reference = args.assets/('reference-'+record['theater'].lower()+'-v1/report.json')
        scene = base.Scene(record,args.assets,reference,args.output/record['key'],args.diagnostic)
        rigs[record['key']] = methods[record['identity']](scene)
        print(record['key'], 'corrected', flush=True)
    assert len(rigs) == 6
    write(args.output/'rigs.json', rigs)


if __name__ == '__main__':
    main()
