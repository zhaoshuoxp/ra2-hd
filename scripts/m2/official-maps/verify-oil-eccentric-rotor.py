"""Check component coverage, stable exposed background and bounded oil-only changes."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

parser = argparse.ArgumentParser(description=__doc__)
for name in ('before', 'after', 'export', 'output'):
    parser.add_argument(name, type=Path)
a = parser.parse_args()
assert not a.output.exists()
a.output.mkdir()
load = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
receipt = load(a.export)
masks = np.load(receipt['coverageFile'])
prior_masks = np.load('.artifacts/m2-3/feedback-r14-v1/oil-export-v1.npz')
assert sha(Path(receipt['coverageFile'])) == receipt['coverageSha256']


def frames(root, member, density):
    folder = root/'members'/member
    metadata = load(folder/'manifest.json')
    variant = next(v for v in metadata['variants'] if v['density'] == density)
    pages = {p['id']: np.array(Image.open(folder/str(density)/p['id']/'base.png')) for p in variant['pages']}
    result = {}
    for f in variant['frames']:
        x, y, w, h = f['contentRect']
        result[f['nativeFrame']] = pages[f['page']][y:y+h, x:x+w]
    return result, metadata, variant


for member in ('ctoild-shp', 'ctoild_f-shp'):
    before, after = [r/'members'/member for r in (a.before, a.after)]
    paths = {p.relative_to(before) for p in before.rglob('*') if p.is_file()}
    assert paths == {p.relative_to(after) for p in after.rglob('*') if p.is_file()}
    assert all(sha(before/p) == sha(after/p) for p in paths)
report = dict(status='RUNNING', visualAcceptance='PENDING_R15', cases=[],
    unchanged=['body and flag bytes', 'owner and auxiliary atlas bytes', 'logical frames and canvas',
               'original shadow source', 'application animation timing'],
    coverageChange='Only moving HD components and their revealed background within unchanged logical frames; retail picking/collision/shadow source stays exact')
for d in (2, 4):
    old, om, ov = frames(a.before, 'ctoild_a-shp', d)
    new, nm, nv = frames(a.after, 'ctoild_a-shp', d)
    body, _, _ = frames(a.after, 'ctoild-shp', d)
    assert ov['frames'] == nv['frames'] and set(new) == set(range(64))
    for key in ('source', 'logical', 'color', 'sampler'):
        assert om.get(key) == nm.get(key), key
    for before, after in zip(ov['pages'], nv['pages']):
        assert before['size'] == after['size']
        p = Path('members/ctoild_a-shp')/str(d)/before['id']/'data.png'
        assert sha(a.before/p) == sha(a.after/p), 'owner/auxiliary bytes changed'
    for state in (0, 1):
        numbers = list(range(state*32, state*32+32))
        old_missing, new_missing, changed, alpha_changes = 0, 0, 0, 0
        fixed_seen = np.zeros((69*d, 61*d), bool)
        fixed_rgba = np.zeros((69*d, 61*d, 4), np.uint8)
        for n in numbers:
            assert np.array_equal(masks[f'beam_{d}_{n}'], prior_masks[f'beam_{d}_{n}']), (d, n, 'accepted beam coverage changed')
            beam_core = masks[f'beam_{d}_{n}'] > .99999
            assert np.array_equal(old[n][beam_core], new[n][beam_core]), (d, n, 'accepted beam material changed')
            allowed = masks[f'allowed_{d}_{n}'] | prior_masks[f'allowed_{d}_{n}']
            protected = masks[f'pipe_{d}_{n}']
            motion = masks[f'coverage_{d}_{n}']
            core = motion > .99
            assert np.array_equal(old[n][~allowed], new[n][~allowed]), (d, n, 'out of scope')
            assert np.array_equal(old[n][protected], new[n][protected]), (d, n, 'foreground pipe or owner')
            old_missing += int((core & (old[n][..., 3] < 250)).sum())
            new_missing += int((core & (new[n][..., 3] < 250)).sum())
            assert (new[n][..., 3][core] >= 250).all(), (d, n, 'moving component clipped')
            # A single complete beam must have no detached paint fragments.
            beam = masks[f'beam_{d}_{n}'] > .5
            labels, count = ndimage.label(beam, np.ones((3, 3)))
            sizes = np.bincount(labels.ravel())[1:]
            assert count == 1 or sizes[sizes.argsort()[:-1]].sum() <= 3, (d, n, 'detached beam fragments')
            fixed = masks[f'sweep_{d}_{n}'] & (motion == 0)
            common = fixed & fixed_seen
            assert np.array_equal(new[n][common], fixed_rgba[common]), (d, n, 'exposed background moves')
            fixed_rgba[fixed] = new[n][fixed]; fixed_seen |= fixed
            changed += int(np.any(old[n] != new[n], axis=2).sum())
            alpha_changes += int((old[n][..., 3] != new[n][..., 3]).sum())
        assert new_missing == 0, 'New moving component coverage must be complete'
        report['cases'].append(dict(density=d, state='damaged' if state else 'normal', phases=32,
            oldClippedMovingCoreSamples=old_missing, newClippedMovingCoreSamples=new_missing,
            changedPixels=changed, changedCoveragePixels=alpha_changes, fixedBackgroundMovingPixels=0,
            fixedBackgroundSamples=int(fixed_seen.sum())))
        for half in (0, 1):
            board = Image.new('RGBA', (664*4, 488*4), (28, 28, 28, 255))
            for cell, n in enumerate(numbers[half*16:(half+1)*16]):
                canvas = Image.new('RGBA', (166*d, 122*d))
                canvas.alpha_composite(Image.fromarray(body[state]), (29*d, (12 if state == 0 else 26)*d))
                canvas.alpha_composite(Image.fromarray(new[n]), (75*d, 37*d))
                if d == 2:
                    canvas = canvas.resize((664, 488), Image.Resampling.NEAREST)
                ox, oy = cell%4*664, cell//4*488
                board.alpha_composite(canvas, (ox, oy))
                ImageDraw.Draw(board).text((ox+12, oy+12), f"R15 | {d}X | {'damaged' if state else 'normal'} | {n%32}", font_size=24, fill='white')
            board.save(a.output/f"oil-{'damaged' if state else 'normal'}-{d}x-half{half}.png")
        for n in (state*32+8, state*32+24):
            comparison = Image.new('RGBA', (1328, 488), (28, 28, 28, 255))
            for column, values in enumerate((old, new)):
                canvas = Image.new('RGBA', (166*d, 122*d))
                canvas.alpha_composite(Image.fromarray(body[state]), (29*d, (12 if state == 0 else 26)*d))
                canvas.alpha_composite(Image.fromarray(values[n]), (75*d, 37*d))
                if d == 2: canvas = canvas.resize((664, 488), Image.Resampling.NEAREST)
                comparison.alpha_composite(canvas, (column*664, 0))
                ImageDraw.Draw(comparison).text((column*664+12, 12), f"{'R14' if column == 0 else 'R15'} | {d}X | phase {n}", font_size=24, fill='white')
            comparison.save(a.output/f'comparison-{d}x-{n}.png')
rows = [r for r in receipt['frames'] if r['density'] == 4 and r['frame'] < 32]
transforms = np.array([r['anchors']['crankTransform'] for r in rows])
centers = np.array([r['anchors']['fixedAxle'] for r in rows])
angles = np.unwrap([r['anchors']['crankAngle'] for r in rows])
assert np.allclose(centers, [49, 36])
assert np.allclose(np.linalg.det(transforms), np.linalg.det(transforms[0]), atol=1e-14)
assert np.allclose(np.linalg.svd(transforms, compute_uv=False), np.linalg.svd(transforms[0], compute_uv=False))
assert np.allclose(np.diff(angles), 2*np.pi/32)
projection = np.array([[.85, 0], [.42, -1]])
pins = np.array([r['anchors']['crankPin'] for r in rows])
radii = np.linalg.norm((pins-centers) @ np.linalg.inv(projection).T, axis=1)
assert np.allclose(radii, 7.9)
old_rows = load(Path('.artifacts/m2-3/feedback-r13-v1/oil-export-v4.json'))['frames']
old_radii = [np.linalg.norm(np.array(r['anchors']['crankPin'])-[49,36]) for r in old_rows if r['density'] == 4 and r['frame'] < 32]
assert max(old_radii)/min(old_radii) > 3
report['mechanism'] = dict(fixedCenter=[49,36], modelCrankRadius=7.9, phases=32,
    fullRevolution=True, projectedAffineAreaRange=[float(v) for v in [min(np.linalg.det(transforms)),max(np.linalg.det(transforms))]],
    invariantTransformSingularValues=True, acceptedR13BeamCoverageAndOpaqueMaterial='EXACT_128_FRAMES',
    negativeControlR13LinearScaleRatio=max(old_radii)/min(old_radii),
    negativeControlR13AreaRatio=(max(old_radii)/min(old_radii))**2,
    reference='Untouched Original full cycle; posterior rod joint is separate from beam shaft spacer')
import runpy
rotor_module = runpy.run_path('scripts/m2/official-maps/export-oil-eccentric-rotor.py')
y, x = np.where(rotor_module['rotor'][..., 3] > 128)
source_points = np.column_stack([x, y])-rotor_module['SHAFT']
bounds, centroids = [], []
for n in range(32):
    _, pin, transform = rotor_module['crank'](None, n, 4)
    transformed = source_points @ transform.T + [49,36]
    bounds.append([transformed[:,0].min(), transformed[:,0].max(), transformed[:,1].min(), transformed[:,1].max()])
    centroids.append(transformed.mean(axis=0))
bounds = np.array(bounds)
assert bounds[:,0].min() > -.5 and bounds[:,1].max() < 60.5
assert bounds[:,2].min() > -.5 and bounds[:,3].max() < 68.5
centroid_radius = np.linalg.norm((np.array(centroids)-[49,36]) @ np.linalg.inv(projection).T, axis=1)
assert np.allclose(centroid_radius, centroid_radius[0]) and centroid_radius[0] > 7
report['mechanism']['largeEccentricCounterweight'] = dict(sourceOpaquePixels=len(x),
    modelMassCentroidRadius=float(centroid_radius[0]), fullCycleInsideLogicalCanvas=True,
    silhouetteBounds=[float(bounds[:,0].min()),float(bounds[:,1].max()),float(bounds[:,2].min()),float(bounds[:,3].max())])
report['status'] = 'PASS_LARGE_ECCENTRIC_ROTOR_FULL_ROTATION_ACCEPTED_BEAM_AND_PRESERVATION'
(a.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report))
