"""Independently check fixed world texels, native envelopes and rigid part transforms."""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image

from buildup import read, sha, write
from painted_rig import place


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('rigs', 'authority', 'output'):
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    authority, rigs = read(args.authority), read(args.rigs)
    rows = []
    for key, rig in rigs.items():
        record = next(r for r in authority['families'] if r['key'] == key)
        raw = read(record['nativeSource'])
        binding = record['newMember']
        logical = read(Path('.local/hd-packs') / binding['packId'] / binding['revision'] / 'manifest.json')['logical']
        for phase, nodes in enumerate(rig['phases']):
            x, y = logical['frames'][phase]['trimOrigin']
            w, h = logical['frames'][phase]['trimSize']
            for node in nodes:
                assert sha(node['image']) == node['sha256']
                array = place(Image.open(node['image']), node['box'], raw['canvas'])
                outside = array[..., 3].copy()
                outside[y*4:(y+h)*4, x*4:(x+w)*4] = 0
                assert not outside.any(), (key, phase, node['name'])
        if key.startswith('gacnst'):
            floors = [next(n for n in rig['phases'][i] if n['name'] == 'fixed-complete-foundation-and-deck')
                      for i in range(8, 21)]
            assert all(n == floors[0] for n in floors)
            rows.append({'key': key, 'fixedFoundationPhases': list(range(8, 21)),
                         'status': 'EXACT_CANONICAL_WORLD_NODE_HASH_BOX_AND_PIXELS'})
        else:
            floors = [next(n for n in rig['phases'][i] if n['name'] == 'world-fixed-foundation')
                      for i in range(13, 23)]
            assert all(n == floors[0] for n in floors)
            previous = None
            checked = 0
            for phase in range(13):
                n = next(n for n in rig['phases'][phase] if n['name'] == 'world-fixed-foundation')
                current = place(Image.open(n['image']), n['box'], raw['canvas'])
                if previous is not None:
                    # Changing native deployment edges legitimately change alpha.
                    # Compare texels with the same opacity, away from those edges.
                    shared = (previous[..., 3] >= 250) & (previous[..., 3] == current[..., 3])
                    assert shared.sum() > 500
                    assert np.array_equal(previous[shared], current[shared]), (key, phase)
                    checked += int(shared.sum())
                previous = current
            for name, start, end in [('fixed-authored-open-tower', 8, 23),
                                     ('front-auxiliary-cylinder', 5, 23),
                                     ('fixed-unlit-entrance-interior', 13, 21)]:
                parts = [next(n for n in rig['phases'][i] if n['name'] == name) for i in range(start, end)]
                assert len({(n['sha256'], tuple(n['box'])) for n in parts}) == 1
            rows.append({'key': key, 'fixedFoundationPhases': list(range(13, 23)),
                         'sharedDeployingGroundTexels': checked,
                         'status': 'EXACT_WORLD_RGBA_FOUNDATION_OPEN_TOWER_AND_AUXILIARY_CYLINDER'})
        for part in rig['rigidAnatomy']['parts']:
            if 'transform' in part:
                assert part['singularValueRatio'] == 1 and not part['mirrored']
    write(args.output, {'status': 'PASS_FIXED_WORLD_GROUND_NATIVE_ENVELOPES_AND_RIGID_PARTS',
                       'rigsSha256': sha(args.rigs), 'rows': rows,
                       'visualAcceptance': 'PENDING', 'windowsRuntime': 'NOT_RUN'})
    print(len(rows), 'world registrations verified')


if __name__ == '__main__':
    main()
