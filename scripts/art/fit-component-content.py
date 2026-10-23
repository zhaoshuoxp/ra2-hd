"""Fit complete authored parts to retained native content bounds, without clipping."""
import argparse
import copy
from pathlib import Path

from buildup import read, write


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('authoring', type=Path)
    parser.add_argument('rigs', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    authoring, rigs = read(args.authoring), read(args.rigs)
    for key, rig in rigs.items():
        record = next(r for r in authoring['families'] if r['key'] == key)
        m = record['newMember']
        frames = read(Path('.local/hd-packs') / m['packId'] / m['revision'] / 'manifest.json')['logical']['frames']
        master = None
        if 'foundationSource' in rig:
            relevant = frames[rig['foundationStableFrom']:]
            common = [max(f['trimOrigin'][0] for f in relevant), max(f['trimOrigin'][1] for f in relevant),
                      min(f['trimOrigin'][0]+f['trimSize'][0] for f in relevant),
                      min(f['trimOrigin'][1]+f['trimSize'][1] for f in relevant)]
            master = copy.deepcopy(rig['foundationSource'])
            b = master['box']
            master['box'] = [max(b[0], common[0]), max(b[1], common[1]),
                             min(b[2], common[2]), min(b[3], common[3])]
            assert max(abs(x-y) for x,y in zip(b, master['box'])) <= 2
            rig['foundationSource'] = master
        for phase, nodes in enumerate(rig['phases']):
            if isinstance(nodes, dict):
                continue
            f = frames[phase]
            rect = [*f['trimOrigin'], f['trimOrigin'][0]+f['trimSize'][0],
                    f['trimOrigin'][1]+f['trimSize'][1]]
            for index, node in enumerate(nodes):
                if node['name'] == 'foundation' and phase >= rig['foundationStableFrom']:
                    assert master
                    nodes[index] = master
                else:
                    b = node['box']
                    fitted = [max(b[0], rect[0]), max(b[1], rect[1]), min(b[2], rect[2]), min(b[3], rect[3])]
                    assert max(abs(x-y) for x,y in zip(b, fitted)) <= 3, (key, phase, b, fitted)
                    assert fitted[2] > fitted[0] and fitted[3] > fitted[1]
                    node['box'] = fitted
        rig['contentRegistration'] = 'Complete source RGBA reprojected to native content; immutable floor uses common extent'
    write(args.output, rigs)
    print('Complete component alpha preserved; native atlas padding stays transparent')


if __name__ == '__main__':
    main()
