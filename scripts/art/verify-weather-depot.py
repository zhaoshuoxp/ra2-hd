"""Check world-fixed ground and complete, registered mechanical components."""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image

from buildup import read, sha, write


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('rigs', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    rows = []
    for key, rig in read(args.rigs).items():
        assert rig['newConstructionArt']
        assert not rig['physicalMotion']['wholeBuildingBoundsFit']
        phases = rig['phases']
        floor_name = 'fixed-empty-platform' if key.startswith('gaweat') else 'fixed-service-platform'
        floor_nodes = [next(n for n in phases[p] if n['name'] == floor_name) for p in range(4, 22)]
        assert len({n['sha256'] for n in floor_nodes}) == 1, (key, 'Ground pixels move')
        assert len({tuple(n['box']) for n in floor_nodes}) == 1, (key, 'Ground transform moves')
        for phase, nodes in enumerate(phases):
            for node in nodes:
                assert sha(node['image']) == node['sha256']
                pixels = np.array(Image.open(node['image']).convert('RGBA'))
                assert (pixels[..., 3] > 0).any()
        row = {'key': key, 'fixedGroundPhases': [4, 21],
            'fixedGroundImageSha256': floor_nodes[0]['sha256'], 'fixedGroundBox': floor_nodes[0]['box']}
        folder = Path(phases[22][0]['image']).parent
        late = np.array(Image.open(folder/'22-preview.png').convert('RGBA'))
        idle = np.array(Image.open(folder/'23-preview.png').convert('RGBA'))
        extra = int(((late[...,3] > 128) & (idle[...,3] < 8)).sum())
        assert extra == 0, (key, 'Late ground extends beyond completed coverage', extra)
        row['lateOpaqueOutsideIdlePixels'] = extra
        if key.startswith('gadept'):
            arms = [next(n for n in phases[p] if n['name'] == 'hinged-orange-linkage') for p in range(12, 22)]
            assert len({tuple(n['rigidPart']['hinge']) for n in arms}) == 1
            assert {n['rigidPart']['pose'] for n in arms} == set(range(6))
            assert all(n['rigidPart']['completeBearing'] for n in arms)
            assert min(n['box'][3]-n['box'][1] for n in arms) > 12, 'Edge-on boom loses side volume'
            support = [next(n for n in phases[p] if n['name'] == 'telescoping-complete-support')
                for p in range(11, 18)]
            movement = [n['rigidPart']['nativeTranslation'] for n in support]
            assert all(abs(y+x*.5) < 1e-8 for x,y in movement)
            assert movement[0][0] > movement[-1][0]
            row.update(hinge=arms[0]['rigidPart']['hinge'], independentArmPoses=6,
                supportDepthTranslations=movement, minimumBoomHeight=min(n['box'][3]-n['box'][1] for n in arms))
        else:
            globes = [next(n for n in phases[p] if n['name'] == 'rising-fixed-radius-globe') for p in range(9, 23)]
            assert {n['rigidPart']['radius'] for n in globes} == {24.5}
            assert {tuple(n['rigidPart']['nativeTranslation']) for n in globes} == {(0,0)}
            for i,start in enumerate([9,11,13,14]):
                assert all(not any(n['name'] == f'satellite-{i}' for n in phases[p]) for p in range(start))
            row.update(globeRadius=24.5, satelliteStartPhases=[9,11,13,14])
        rows.append(row)
    assert len(rows) == 4
    write(args.output, {'status': 'PASS_FIXED_GROUND_COMPLETE_MECHANISMS_AND_NATIVE_ORDER', 'rows': rows,
        'boundary': 'Component evidence; human visual acceptance remains pending.'})
    print('Four fixed-ground / complete-mechanism checks pass')


if __name__ == '__main__':
    main()
