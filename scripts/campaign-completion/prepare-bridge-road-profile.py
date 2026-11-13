"""Fit native bridge paint and retain the selected land-road material authority."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
parser.add_argument('terrain', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
original, terrain = [json.loads(p.read_text()) for p in [args.source, args.terrain]]
assert original['mission'] == 'all08u.map' and terrain['theater'] == 'URBAN'
group = next(g for g in terrain['groups'] if any(m['member'] == 'proad01.urb' for m in g['members']))
variant = next(v for v in group['variants'] if v['density'] == 4)
atlas_file = args.terrain.parent / variant['file']; assert sha(atlas_file) == variant['sha256']
atlas = np.fromfile(atlas_file, np.uint8).reshape((variant['size'][1], variant['size'][0], 4))
colors = []
for x, y, width, height in variant['rects'][:12]:
    colors.append(atlas[y:y + height, x:x + width].reshape(-1, 4))
colors = np.concatenate(colors); rgb = colors[:, :3].astype(float); active = colors[:, 3] > 250
asphalt = active & (rgb.mean(1) > 8) & (rgb.mean(1) < 85) & (rgb.max(1) - rgb.min(1) < 25)
yellow = active & (rgb[:, 0] > 90) & (rgb[:, 1] > 80) & (rgb[:, 0] > rgb[:, 2] * 1.5) & (rgb[:, 1] > rgb[:, 2] * 1.4)
white = active & (rgb.mean(1) > 115) & (rgb.max(1) - rgb.min(1) < 25)
pigments = {name: rgb[mask].mean(0).tolist() for name, mask in [('asphalt', asphalt), ('yellow', yellow), ('white', white)]}


def guide(number):
    source = original['sources'][number - 1]; frame = source['frames'][1]
    file = args.source.parent / 'native' / frame['png']
    p = np.asarray(Image.open(file).convert('RGBA')); q = p[:, :, :3].astype(float)
    y, x = np.indices(p.shape[:2]); x = x + .5 + frame['origin'][0]; y = y + .5 + frame['origin'][1]
    u, v = (x - 90) / 60 + (y - 49) / 30, -(x - 90) / 60 + (y - 49) / 30
    along, across = (u, v) if number <= 9 or 19 <= number <= 22 else (v, u)
    yellow = (q[:, :, 0] > 90) & (q[:, :, 1] > 80) & (q[:, :, 0] > q[:, :, 2] * 1.5)
    yellow &= (q[:, :, 1] > q[:, :, 2] * 1.4) & (p[:, :, 3] > 0)
    white = (q.mean(2) > 115) & (q.max(2) - q.min(2) < 25) & (p[:, :, 3] > 0)
    return source, along, across, yellow, white, dict(member=source['member'], sourceSha256=source['sha256'],
        nativeFrame=1, indexSha256=frame['indexSha256'], pngSha256=sha(file))


directions, authorities = {}, []
for axis, number in [('x', 1), ('y', 10)]:
    source, a, c, yellow, white, authority = guide(number); authorities.append(authority)
    yellow_lines = []
    for lo, hi in [(-2, -.7), (-.3, .046), (.046, .4), (.7, 2)]:
        mask = yellow & (c >= lo) & (c < hi); assert mask.sum() >= 20
        yellow_lines.append(dict(center=float(c[mask].mean()), width=float(mask.sum() / 900)))
    whites = []
    for lo, hi in [(-1, -.3), (.3, 1)]:
        mask = white & (c >= lo) & (c < hi); assert mask.sum() >= 20
        period = 1 / 3
        phase = float(np.angle(np.exp(a[mask] * 2j * np.pi / period).mean()) * period / (2 * np.pi))
        whites.append(dict(center=float(c[mask].mean()), width=.035, period=period, phase=phase, length=.215))
    directions[axis] = dict(yellow=yellow_lines, white=whites,
        center=(yellow_lines[1]['center'] + yellow_lines[2]['center']) / 2)

ends = {}
for number, axis, entry in [(19, 'x', False), (21, 'x', True), (23, 'y', True), (25, 'y', False)]:
    source, along, across, yellow, _, authority = guide(number); authorities.append(authority)
    mask = yellow & (np.abs(across) < .8); points = []
    for lo in np.arange(-.6, .6, .1):
        m = mask & (along >= lo) & (along < lo + .1)
        if m.sum() >= 3: points.append([float(along[m].mean()), float(across[m].mean()), int(m.sum())])
    points = np.asarray(points); assert len(points) >= 6
    center = directions[axis]['center']; fits = []
    for hinge in np.linspace(0, .35, 141) if entry else np.linspace(-.35, 0, 141):
        basis = np.maximum(0, hinge - points[:, 0] if entry else points[:, 0] - hinge)
        slope = np.sum(basis * (points[:, 1] - center) * points[:, 2]) / np.sum(basis * basis * points[:, 2])
        if not 0 < slope < 2: continue
        error = np.average((center + slope * basis - points[:, 1]) ** 2, weights=points[:, 2])
        fits.append((error, float(hinge), float(slope)))
    error, hinge, slope = min(fits); assert error < .003
    ends[source['member']] = dict(entry=entry, hinge=hinge, slope=slope,
        nativeBinCenters=points.tolist(), rmsAcross=float(np.sqrt(error)))

profile = dict(schema='source-pinned-bridge-road-paint-v1', sourceJsonSha256=sha(args.source),
    terrain=dict(manifestSha256=sha(args.terrain), revision=terrain['revision'], group=group['id'],
                 atlas=str(atlas_file.resolve()), atlasSha256=variant['sha256'], density=4,
                 nativeMembers=[m['member'] for m in group['members'][:4]]),
    pigments=pigments, directions=directions, ends=ends, authorities=authorities,
    policy='Native paint centers, three-dash cadence and bridge-end rise are fitted as continuous geometry. Land-road RGB supplies broad material/paint pigment authority only; no low-resolution source texture, source noise or source pixel cells are painted into HD output.')
args.output.write_text(json.dumps(profile, indent=2) + '\n')
print(json.dumps(dict(output=str(args.output),directions=directions,ends=ends,pigments=pigments)))
