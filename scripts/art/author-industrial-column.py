"""Rotate three complete NAINDP columns around fixed lower bearings."""
import argparse
import copy
import shutil
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image

from buildup import read, sha, write
from painted_rig import over, place

heavy = SourceFileLoader('column_heavy', 'scripts/art/author-heavy-structure.py').load_module()
ROOT = Path('.artifacts/buildup-remaining-20261013-r74-v1')
PREVIOUS = ROOT / 'heavy-structure-r99-v1'
NAMES = ['press-rear', 'press-middle', 'press-front']
BEARINGS = [(160, 149), (146, 157), (132, 165)]
TIMING = [(1, 6), (3, 12), (5, 18)]


def project_face(s, pixels, source, destination):
    source, destination = np.asarray(source, float), np.asarray(destination, float)
    matrix = np.column_stack((destination[1]-destination[0], destination[3]-destination[0]))
    matrix = matrix @ np.linalg.inv(np.column_stack((source[1]-source[0], source[3]-source[0])))
    if abs(np.linalg.det(matrix)) < .005:
        return np.zeros_like(pixels)
    return heavy.base.transform(pixels, np.column_stack((matrix, destination[0]-matrix@source[0])), s.rig.canvas)


def column(s, nodes, index, phase, faces):
    begin, end = TIMING[index]
    t = heavy.fraction(phase, begin, end)
    angle = np.deg2rad(-45+135*t)
    bearing = np.asarray(BEARINGS[index], float)
    origin = bearing + [-8, 0]
    cross = np.array([10., 5.])
    # Orthographic projections of one rotating 3-D axis and its perpendicular
    # thickness axis. The transverse hinge stays fixed throughout the turn.
    axis = 67*np.array([.5*np.cos(angle), -.25*np.cos(angle)-np.sin(angle)])
    depth = np.array([8*np.sin(angle), -4*np.sin(angle)+16*np.cos(angle)])
    destinations = [
        [origin, origin+cross, origin+cross+axis, origin+axis],
        [origin+cross, origin+cross+depth, origin+cross+depth+axis, origin+cross+axis],
        [origin+axis, origin+cross+axis, origin+cross+depth+axis, origin+depth+axis],
    ]
    layer = np.zeros_like(s.full)
    for (source, pixels), destination in zip(faces, destinations):
        layer = over(project_face(s, pixels, source, destination), layer)
    # The first part of the swing is below the platform opening. This fixed
    # plane occludes the member; its length and UVs never extend or telescope.
    layer = heavy.terminal.masked(layer, s.yy <= bearing[1]-(s.xx-bearing[0])*.5+6)
    s.draw(nodes, layer, NAMES[index]+'-whole-column', phase,
        'WHOLE_COLUMN_ROTATES_UP_FROM_BELOW_AT_FIXED_LOWER_BEARING',
        bearing=bearing.tolist(), hingeAxis=cross.tolist(), length=67,
        angleDegrees=float(np.rad2deg(angle)), projectedAxis=axis.tolist(),
        startPhase=begin, settledPhase=end, fixedMaterialCoordinates=True)


def repair(s, previous):
    faces = []
    for i, name in enumerate(NAMES):
        bx, by = BEARINGS[i]
        origin = np.array([bx-8., by]); u = np.array([10., 5.]); v = np.array([8., -4.]); z = np.array([0., -67.])
        polygons = [[origin, origin+u, origin+u+z, origin+z],
            [origin+u, origin+u+v, origin+u+v+z, origin+u+z],
            [origin+z, origin+u+z, origin+u+v+z, origin+v+z]]
        settled = next(n for n in previous['phases'][[6, 10, 15][i]] if n['name'] == name)
        retained = place(Image.open(settled['image']), settled['box'], s.rig.canvas)
        faces.append([(poly, over(heavy.terminal.masked(retained, s.region(poly)),
            heavy.texture(s, poly, 2, shade))) for poly, shade in zip(polygons, [.9, .55, 1.2])])
    checks = []
    for phase, old in enumerate(previous['phases']):
        assert isinstance(old, list)
        nodes = []; emitted = set(); changed = []
        for node in old:
            index = next((i for i, name in enumerate(NAMES)
                if node['name'] == name or node['name'] in
                [name+'-linkage', name+'-folding-head', name+'-extending-casing']), None)
            if index is None or not TIMING[index][0] <= phase < TIMING[index][1]:
                nodes.append(copy.deepcopy(node)); continue
            changed.append(node['name'])
            if index not in emitted:
                column(s, nodes, index, phase, faces[index]); emitted.add(index)
        s.phases.append(nodes)
        unaffected = [n for n in nodes if not n['name'].endswith('-whole-column')]
        assert unaffected == [n for n in old if n['name'] not in changed]
        checks.append({'phase':phase, 'replacedNodes':changed,
            'otherNodesByteIdentical':True, 'retainedPhase':nodes == old})
    result = s.finish()
    result['columnRotation'] = {'method':'COMPLETE_MEMBER_FIXED_BEARING_UPWARD_ROTATION',
        'baseline':str(PREVIOUS/'selected-v1/authoring.json'), 'preservation':checks,
        'acceptedOtherMechanisms':'UNCHANGED', 'visualAcceptance':'PENDING_V34'}
    return result


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('output', type=Path)
    args = parser.parse_args(); args.output.mkdir(exist_ok=False)
    source = args.output/'authoring-source.py'; shutil.copy2(__file__, source)
    rigs = {}; previous = read(PREVIOUS/'selected-rigs-v1.json')
    for record in read(PREVIOUS/'selected-v1/authoring.json')['families']:
        if record['identity'] != 'NAINDP': continue
        s = heavy.Scene(record, args.output/record['key'])
        s.source.update(code=str(source), sha256=sha(source))
        rigs[record['key']] = repair(s, previous[record['key']])
        print(record['key'], 'only column nodes replaced', flush=True)
    write(args.output/'rigs.json', rigs)


if __name__ == '__main__': main()
