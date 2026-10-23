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
prior_masks = np.load('.artifacts/m2-3/feedback-r15-v1/oil-export-v2.npz')
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
report = dict(status='RUNNING', visualAcceptance='PENDING_R16', cases=[],
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
                ImageDraw.Draw(board).text((ox+12, oy+12), f"R16 | {d}X | {'damaged' if state else 'normal'} | {n%32}", font_size=24, fill='white')
            board.save(a.output/f"oil-{'damaged' if state else 'normal'}-{d}x-half{half}.png")
        for n in (state*32+8, state*32+24):
            comparison = Image.new('RGBA', (1328, 488), (28, 28, 28, 255))
            for column, values in enumerate((old, new)):
                canvas = Image.new('RGBA', (166*d, 122*d))
                canvas.alpha_composite(Image.fromarray(body[state]), (29*d, (12 if state == 0 else 26)*d))
                canvas.alpha_composite(Image.fromarray(values[n]), (75*d, 37*d))
                if d == 2: canvas = canvas.resize((664, 488), Image.Resampling.NEAREST)
                comparison.alpha_composite(canvas, (column*664, 0))
                ImageDraw.Draw(comparison).text((column*664+12, 12), f"{'R15' if column == 0 else 'R16'} | {d}X | phase {n}", font_size=24, fill='white')
            comparison.save(a.output/f'comparison-{d}x-{n}.png')
import runpy
rig = runpy.run_path('scripts/m2/official-maps/export-oil-paired-drive.py')
rows = [r for r in receipt['frames'] if r['density'] == 4 and r['frame'] < 32]
centers = np.array([r['anchors']['nearFixedAxle'] for r in rows])
far_centers = np.array([r['anchors']['farFixedAxle'] for r in rows])
pins = np.array([r['anchors']['nearCrankPin'] for r in rows])
far_pins = np.array([r['anchors']['farCrankPin'] for r in rows])
transforms = np.array([r['anchors']['crankTransform'] for r in rows])
assert np.allclose(centers, centers[0]) and np.allclose(far_centers, far_centers[0])
assert np.allclose(pins-far_pins, rig['SEPARATION'])
assert np.allclose(np.linalg.svd(transforms, compute_uv=False), np.linalg.svd(transforms[0], compute_uv=False))
assert all(r['anchors']['rotorCount'] == r['anchors']['rearRodCount'] == 2 for r in rows)
assert all(r['anchors']['rodWidth'] == 4.2 for r in rows)
errors = np.linalg.norm(pins[rig['REFERENCE_PHASES']]-rig['REFERENCE_PINS'], axis=1)
assert errors.max() < 1.5, errors
# Validate both full rigid silhouettes before clipping to the atlas canvas.
y,x = np.where(rig['rgba'][...,3] > 128)
source = np.column_stack([x,y])-rig['SHAFT']
bounds=[]
for r in rows:
    for center in (r['anchors']['nearFixedAxle'], r['anchors']['farFixedAxle']):
        xy = source @ np.array(r['anchors']['crankTransform']).T+center
        low = xy.min(axis=0)-rig['THICKNESS']; high=xy.max(axis=0)
        bounds.append([*low,*high])
        assert (low > [-.5,-.5]).all() and (high < [60.5,68.5]).all(), (r['frame'],low,high)
report['mechanism'] = dict(rotors=2, rearConnectingRods=2, projectedRodEyeWidth=4.2,
    constantShafts=True, constantSideSeparation=True, invariantRigidTransforms=True,
    constantCameraExtrusion=True, farSideOcclusion=True, fullCycleBounds=np.array(bounds).tolist(),
    originalMeasuredPhases=rig['REFERENCE_PHASES'].tolist(), referencePinErrors=errors.tolist(),
    originalLandmarkUncertaintyNativePixels=2, originalReference='Native untouched ctoild_a.shp',
    negativeControlR15=dict(rotors=1, rearConnectingRods=1, rodWidth=2.1,
        rejected='Wrong one-sided anatomy and baked perspective; fails required two-sided counts'))
report['status'] = 'PASS_PAIRED_DRIVE_REFERENCE_REGISTRATION_BEAM_AND_PRESERVATION'
(a.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(dict(status=report['status'], cases=report['cases'], maxReferenceError=float(errors.max()))))
