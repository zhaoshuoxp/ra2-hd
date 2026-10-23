"""Check canonical foundations, authored part envelopes and rigid transforms."""
import argparse
from pathlib import Path
import numpy as np
from PIL import Image
from buildup import read, sha, write
from painted_rig import place

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
    count = 0
    for phase, nodes in enumerate(rig['phases']):
        x, y = logical['frames'][phase]['trimOrigin']
        w, h = logical['frames'][phase]['trimSize']
        for node in nodes:
            assert sha(node['image']) == node['sha256']
            layer = place(Image.open(node['image']), node['box'], raw['canvas'])
            outside = layer[..., 3].copy()
            outside[y*4:(y+h)*4, x*4:(x+w)*4] = 0
            assert not outside.any(), (key, phase, node['name'])
            count += 1
    purifier = record['identity'] == 'GAOREP'
    start, end = (3, 23) if purifier else (4, 22)
    name = 'fixed-empty-foundation' if purifier else 'fixed-connected-circular-foundations'
    floors = [next(n for n in rig['phases'][i] if n['name'] == name) for i in range(start, end)]
    assert all(n == floors[0] for n in floors), 'Foundation UV, alpha or placement changed'
    for part in rig['rigidAnatomy']['parts']:
        if 'transform' in part:
            matrix = np.array(part['transform'])[:, :2]
            values = np.linalg.svd(matrix, compute_uv=False)
            assert np.isclose(values[0], values[1]) and np.linalg.det(matrix) > 0
    assert rig['retainedIdleCompletion']['frame'] == 24
    assert all('retainPredecessor' not in n for n in rig['phases'])
    rows.append({'key': key, 'checkedPartEnvelopes': count,
                 'canonicalFoundationPhases': list(range(start, end)),
                 'status': 'PASS_FIXED_WORLD_FOUNDATION_AND_COMPONENT_GEOMETRY'})
write(args.output, {'status': 'PASS_ORE_SATELLITE_WORLD_GEOMETRY',
                    'rigsSha256': sha(args.rigs), 'rows': rows,
                    'boundary': 'Static geometry checks do not establish user visual acceptance.'})
print('Four independent construction-world checks passed')
