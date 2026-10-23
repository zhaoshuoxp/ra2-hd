"""Inspect every exported retail phase and independently fixed tank material."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('pack', type=Path)
parser.add_argument('export', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
assert not args.output.exists()
args.output.mkdir()
guide = Path('.artifacts/m2-3/native-guides-v3')
sources = {r['member']: r for r in json.loads((guide/'source.json').read_text())['sources']}
source = sources['ctoild_a.shp']
native = np.stack([np.frombuffer((guide/'native'/f['indexFile']).read_bytes(), np.uint8).reshape(69, 61)
                   for f in source['frames'][:64]])
export = json.loads(args.export.read_text())
report = dict(status='RUNNING', cases=[], visualAcceptance='PENDING', nativeTimingChanges=False)


def frames(member, density):
    root = args.pack/'members'/member.replace('.', '-')
    m = json.loads((root/'manifest.json').read_text())
    variant = next(v for v in m['variants'] if v['density'] == density)
    pages = {p['id']: np.array(Image.open(root/str(density)/p['id']/'base.png')) for p in variant['pages']}
    return {f['nativeFrame']: pages[f['page']][f['contentRect'][1]:f['contentRect'][1]+f['contentRect'][3],
        f['contentRect'][0]:f['contentRect'][0]+f['contentRect'][2]].copy() for f in variant['frames']}


for density in (2, 4):
    body, anim = frames('ctoild.shp', density), frames('ctoild_a.shp', density)
    for state in (0, 1):
        numbers = range(state*32, (state+1)*32)
        indices = native[list(numbers)]
        y, x = np.indices((69, 61))
        tank = (x >= 14) & (x < 24) & (y >= 26) & (y < 47)
        tank &= np.all(indices == indices[0], axis=0) & (indices[0] >= 32) & (indices[0] <= 63)
        fixed = tank.repeat(density, 0).repeat(density, 1)
        records = [r for r in export['frames'] if r['member'] == 'ctoild_a.shp' and r['density'] == density and r['frame'] in numbers]
        assert len(records) == 32
        if all('foreground' in r for r in records):
            # Identical palette colors do not establish identical layer identity.
            # Exclude the Original moving bevel wherever it occludes the tank.
            occluded = np.any(np.stack([r['foreground'] for r in records]), axis=0)
            fixed &= ~occluded.repeat(density, 0).repeat(density, 1)
        visible = np.all(np.stack([anim[n][..., 3] > 0 for n in numbers]), axis=0)
        fixed &= visible
        changed = np.any(np.stack([anim[n][..., :3] for n in numbers]) != anim[state*32][..., :3], axis=(0, 3)) & fixed
        row = dict(density=density, state='normal' if not state else 'damaged',
            nativePhases=32, fixedTankPixels=int(fixed.sum()), changedFixedTankPixels=int(changed.sum()))
        report['cases'].append(row)
        assert fixed.sum() > 40 and not changed.any(), row
        assert all(r['fixedAxle'] == [49, 36] and r['frontRodFoot'] == [8, 65] for r in records)
        assert min(r['rodCoveredFraction'] for r in records) > .60
        points = np.array([r['crankPin'] for r in records])
        row['maxCyclicCrankPinStep'] = float(np.linalg.norm(points-np.roll(points, 1, axis=0), axis=1).max())
        row['minimumNativeRodCoverage'] = min(r['rodCoveredFraction'] for r in records)
        assert row['maxCyclicCrankPinStep'] < 3
        # All 32 phases are included, not just the eight historical key poses.
        for sheet in range(2):
            board = Image.new('RGBA', (4*664, 4*488), (28, 28, 28, 255))
            for cell, number in enumerate(list(numbers)[sheet*16:(sheet+1)*16]):
                c = Image.new('RGBA', (166*density, 122*density))
                c.alpha_composite(Image.fromarray(body[state]), tuple(v*density for v in sources['ctoild.shp']['frames'][state]['origin']))
                c.alpha_composite(Image.fromarray(anim[number]), (75*density, 37*density))
                c = c.resize((664, 488), Image.Resampling.NEAREST)
                board.alpha_composite(c, (cell%4*664, cell//4*488))
                ImageDraw.Draw(board).text((cell%4*664+12, cell//4*488+12), f'{density}X | {row["state"]} | phase {number%32}', fill='white', font_size=24)
            board.save(args.output/f'oil-{row["state"]}-{density}x-phases-{sheet+1}.png')
report['status'] = 'PASS_ALL_PHASES_FIXED_TANK_AND_NATIVE_BEARING_CONTINUITY'
(args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report))
