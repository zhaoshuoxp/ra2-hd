"""Independently verify scoped motion, physical contacts and unchanged construction parts."""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image

from buildup import read, sha, write
from painted_rig import place

parser = argparse.ArgumentParser(description=__doc__)
for name in ('rigs', 'baseline', 'output'):
    parser.add_argument(name, type=Path)
args = parser.parse_args()
rigs, baseline = read(args.rigs), read(args.baseline)
rows = []
for key, rig in rigs.items():
    record = next(r for r in baseline['families'] if r['key'] == key)
    canvas = read(record['nativeSource'])['canvas']
    prior = record['componentRig']
    repair = rig['mechanicalMotionRepair']
    changed = set(repair['changedPhases'])
    binding = record['newMember']
    logical = read(Path('.local/hd-packs') / binding['packId'] / binding['revision'] / 'manifest.json')['logical']
    checked_nodes = 0
    for phase, nodes in enumerate(rig['phases']):
        if phase not in changed:
            assert nodes == {'retainPredecessor': True}
            continue
        old_nodes = prior['phases'][phase]
        for old in old_nodes:
            if old['name'] == repair['replacedNode']:
                continue
            current = next(n for n in nodes if n['name'] == old['name'])
            if current != old:
                assert record['identity'] == 'GAOREP' and old['name'] == 'deploying-left-arm' and phase < 22
                before = place(Image.open(old['image']), old['box'], canvas)
                after = place(Image.open(current['image']), current['box'], canvas)
                y, x = np.mgrid[:before.shape[0], :before.shape[1]] / 4
                allowed = (x >= 20) & (x < 40) & (y >= 118)
                assert np.array_equal(before[~allowed], after[~allowed]), 'Contact cleanup escaped pipe area'
                rgb = before[..., :3].astype(float)
                owner = (rgb[..., 0] > rgb[..., 1] * 1.5) & (rgb[..., 0] > rgb[..., 2] * 1.5)
                assert np.array_equal(before[owner], after[owner]), 'Owner bracket changed'
        x, y = logical['frames'][phase]['trimOrigin']
        w, h = logical['frames'][phase]['trimSize']
        for node in nodes:
            assert sha(node['image']) == node['sha256']
            rgba = place(Image.open(node['image']), node['box'], canvas)
            outside = rgba[..., 3].copy()
            outside[y*4:(y+h)*4, x*4:(x+w)*4] = 0
            assert not outside.any(), (key, phase, node['name'], 'Outside native envelope')
            checked_nodes += 1
    if record['identity'] == 'GACNST':
        fronts = [next(n for n in rig['phases'][p] if n['name'] == 'fixed-garage-mouth') for p in range(18, 27)]
        assert len({(n['sha256'], tuple(n['box'])) for n in fronts}) == 1
        for index in range(4):
            parts = [next(n for n in rig['phases'][p] if n['name'] == f'depth-sleeve-{index}') for p in range(18, 27)]
            assert len({n['sha256'] for n in parts}) == 1, 'Sleeve texture or physical shape deformed'
            for n in parts:
                dx, dy = n['rigidPart']['nativeTranslation']
                assert np.isclose(dy, -dx / 2), 'Wrong camera-depth direction'
            assert parts[0]['box'] != parts[-1]['box'] or index == 0, 'Sleeve never moved'
    elif record['identity'] == 'GAWEAP':
        panels = [next(n for n in rig['phases'][p] if n['name'] == 'inward-folding-roof-panels') for p in [21, 22]]
        assert all(n['rigidPart']['hinge'] == [104, 148] for n in panels)
        assert all(n['rigidPart']['longitudinalAxis'] == [90, 32] for n in panels)
        assert panels[0]['rigidPart']['projectedCrossSection'] != panels[1]['rigidPart']['projectedCrossSection']
        assert all('REVEAL' not in n['rigidPart']['method'] for n in panels)
    else:
        pipes = [next(n for n in rig['phases'][p] if n['name'] == 'traveling-circular-pipe-and-endcap') for p in range(15, 23)]
        assert len({n['rigidPart']['tubeRadius'] for n in pipes}) == 1
        endpoints = np.array([n['rigidPart']['endcapCenter'] for n in pipes])
        assert np.ptp(endpoints[:, 0]) > 70 and np.ptp(endpoints[:, 1]) > 20
        assert len({n['rigidPart']['materialAngularTravel'] for n in pipes}) == 8
        # Measure a rendered transverse section away from the exposed cap.
        for node in pipes:
            meta = node['rigidPart']
            theta = (meta['startAngle'] + meta['endAngle']) / 2
            center = np.array(meta['pipeCenter']) + np.array(meta['pipeRadii']) * [np.cos(theta), np.sin(theta)]
            tangent = np.array([-meta['pipeRadii'][0] * np.sin(theta), meta['pipeRadii'][1] * np.cos(theta)])
            normal = np.array([-tangent[1], tangent[0]]) / np.linalg.norm(tangent)
            rgba = place(Image.open(node['image']), node['box'], canvas)
            offsets = np.arange(-5, 5, .125)
            points = (center + offsets[:, None] * normal) * 4
            x = np.clip(points[:, 0].astype(int), 0, rgba.shape[1] - 1)
            y = np.clip(points[:, 1].astype(int), 0, rgba.shape[0] - 1)
            diameter = (rgba[y, x, 3] >= 128).sum() * .125
            assert 4.75 <= diameter <= 6.5, (key, 'Tube section deformed', diameter)
    rows.append({'key': key, 'changedPhases': sorted(changed), 'checkedPartEnvelopes': checked_nodes,
                 'status': 'PASS_MECHANICAL_MOTION_AND_SCOPED_PART_PRESERVATION'})
write(args.output, {'status': 'PASS_SIX_INDEPENDENT_MECHANICAL_MOTION_CHECKS', 'rigsSha256': sha(args.rigs),
                    'rows': rows, 'boundary': 'Actual native playback and human visual acceptance remain separate.'})
print('Six independent motion and scoped preservation checks passed')
