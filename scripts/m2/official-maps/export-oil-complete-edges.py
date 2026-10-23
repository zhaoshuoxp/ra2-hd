"""Register the complete authored walking beam without palette-based foreground cuts."""
import copy
import json
import runpy
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.interpolate import CubicSpline, RBFInterpolator

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from showcase_registration import extrude, independently_sample, register, sha

rig = runpy.run_path(str(Path(__file__).with_name('export-oil-native-rig.py')))
previous = runpy.run_path(str(Path(__file__).with_name('export-oil-static-beam.py')))
SOURCE_POINTS = np.array([[70, 184], [116, 233], [320, 144], [348, 196],
                          [116, 294], [88, 381], [39, 290]], float)
# Anatomical correspondences measured on the untouched retail frames. These
# include the horse head at x=0, which the earlier palette mask truncated at x=5.
KEY_POINTS = {
    0: [[6.5, 18], [14, 21], [38, 9], [44, 19], [14.5, 29.5], [10.5, 42], [5, 30]],
    4: [[10, 8], [15, 17], [40, 13], [44, 23], [16, 24], [14, 37], [6.5, 26]],
    8: [[13, 5], [17, 15], [40, 14], [44, 24], [18, 22], [10.5, 36], [6.5, 25]],
    20: [[2, 29], [11, 28], [37, 5], [43, 15], [14, 37], [13, 48], [3.5, 38]],
    24: [[1.5, 34], [10.5, 34], [35.5, 4], [42.5, 13], [14.5, 42], [15, 50], [4, 42]],
}


def load(file):
    return json.loads(file.read_text())


def landmarks():
    keys = [KEY_POINTS[k] for k in (0, 4, 8, 4, 0, 20, 24, 20, 0)]
    return CubicSpline(np.arange(0, 33, 4), keys, bc_type='periodic')(np.arange(32))


def source_material():
    file = Path('.artifacts/m2-3/feedback-r8-v1/authoring/gold-beam.png')
    assert sha(file) == 'c2df994d6465b1200c184a6aaa493f25ef5c0257dc91326d5ca7027dc646fdd3'
    master = np.array(Image.open(file).convert('RGBA').crop((0, 0, 384, 512)))
    labels, _ = ndimage.label(master[..., 3] > 180, np.ones((3, 3)))
    sizes = np.bincount(labels.ravel()); sizes[0] = 0
    valid = ndimage.binary_fill_holes(labels == sizes.argmax())
    return extrude(master[..., :3], valid), ndimage.gaussian_filter(valid.astype(float), .6)


def registered_component(master, coverage, target, density):
    yy, xx = np.indices((69*density, 61*density))
    points = np.column_stack([(xx.ravel()+.5)/density-.5, (yy.ravel()+.5)/density-.5])
    xy = RBFInterpolator(target, SOURCE_POINTS, kernel='thin_plate_spline', smoothing=0)(points)
    # The straight bar is affine, while the projected curved horse head follows
    # its retail landmarks. Do not bend a straight machined edge with the head.
    matrix = np.column_stack([target[[1, 2, 4]], np.ones(3)])
    affine = np.linalg.solve(matrix, SOURCE_POINTS[[1, 2, 4]])
    straight = np.column_stack([points, np.ones(len(points))]) @ affine
    mix = np.clip((points[:, 0]-max(target[1, 0], target[4, 0]))/3, 0, 1)[:, None]
    xy = (xy*(1-mix)+straight*mix).reshape(69*density, 61*density, 2)
    rgb = np.stack([ndimage.map_coordinates(master[..., c], [xy[..., 1], xy[..., 0]],
                                          order=3, mode='nearest') for c in range(3)], axis=-1)
    alpha = ndimage.map_coordinates(coverage, [xy[..., 1], xy[..., 0]], order=1, mode='constant')
    # Reject inverse-warp extrapolation below the physical head; it is not art.
    alpha[(yy+.5)/density > target[5, 1]+1] = 0
    return np.uint8(np.clip(rgb, 0, 255)), alpha


def fixed_backgrounds(sources, density):
    guide = Path('.artifacts/m2-3/native-guides-v3')
    donor_file = Path('.artifacts/m2-3/feedback-r13-v1/authoring/fixed-drive.png')
    assert sha(donor_file) == 'de8722347e4e3f7837cedde9d2137e879a90e5e812ee0519bd176899e5bb57a9'
    original = Image.open('.artifacts/m2-3/feedback-r6-v1/authoring/oil-master.png').convert('RGBA')
    donor = Image.open(donor_file).convert('RGBA')
    assert original.size == donor.size == (1254, 1254)
    result = []
    d = density
    for state in range(2):
        body = previous['canvas'](sources['ctoild.shp'], state, guide)
        active = previous['canvas'](sources['ctoild_a.shp'], state*32, guide)
        composed = np.where((active != 0) & (active != 12), active, body)
        y, x = np.where((composed != 0) & (composed != 12))
        l, t, r, b = x.min(), y.min(), x.max()+1, y.max()+1
        crop, _ = register(original, dict(slotRect=[0, state*768, 1536, 768]), [1536, 1536])
        sx, sy, sw, sh = crop
        p = np.array(donor.crop((sx, sy, sx+sw, sy+sh)))
        full = np.zeros((122*d, 166*d, 4), np.uint8)
        full[t*d:b*d, l*d:r*d, :3] = independently_sample(extrude(p[..., :3], p[..., 3] > 180), ((r-l)*d, (b-t)*d))
        full[t*d:b*d, l*d:r*d, 3] = np.array(Image.fromarray(p[..., 3]).resize(((r-l)*d, (b-t)*d), Image.Resampling.LANCZOS))
        background = full[37*d:106*d, 75*d:136*d].copy()
        yy, xx = np.indices(background.shape[:2])
        # The old complete master put the drive axle at (44,44), whereas the
        # native active layer and accepted moving poses use (49,36). Register
        # only this isolated stationary housing; tower and support stay put.
        shifted = np.stack([ndimage.map_coordinates(background[..., c], [yy+8*d, xx-5*d],
                            order=1, mode='nearest') for c in range(4)], axis=-1)
        motor = (xx >= 34*d) & (yy >= 18*d) & (yy < 54*d)
        background[motor] = shifted[motor]
        result.append(background)
    return result


def motion_layers(master, coverage, target, pin, link, density):
    rgb, beam_alpha = registered_component(master, coverage, target, density)
    matrix = np.column_stack([target[[1, 2, 4]], np.ones(3)])
    affine = np.linalg.solve(matrix, SOURCE_POINTS[[1, 2, 4]])
    bearing = np.linalg.solve(affine[:2].T, np.array([334., 206.])-affine[2])
    # Attach the front rod to the actual projected horse head, not its bounding
    # box tip. The fixed foot remains at the original (8,65) registration.
    rows = np.where(beam_alpha[:, 8*density:9*density].max(axis=1) > .9)[0]
    front_top = np.array([8., (rows.max()+.5)/density-.5])
    specifications = [
        ([547., 123.], [608., 778.], front_top, [8., 65.], 'left', .25),
        ([1445., 486.], [1205., 633.], [49., 36.], pin, 'right', 1),
        ([547., 123.], [608., 778.], bearing, pin, 'left', 2.8),
    ]
    layers = [rig['component'](link, np.array(a), np.array(b), np.array(p), np.array(q), density, side, width)
              for a, b, p, q, side, width in specifications]
    layers.append((rgb, beam_alpha))
    return layers, dict(beamBearing=bearing.tolist(), crankPin=pin.tolist(), frontRodTop=front_top.tolist())


def over(base, rgb, alpha):
    ba = base[..., 3]/255.
    out_alpha = alpha+ba*(1-alpha)
    out_rgb = (rgb*alpha[..., None]+base[..., :3]*ba[..., None]*(1-alpha[..., None])) / np.maximum(out_alpha[..., None], 1e-8)
    return np.dstack([np.uint8(np.clip(np.rint(out_rgb), 0, 255)), np.uint8(np.clip(np.rint(out_alpha*255), 0, 255))])


def main():
    base, output, evidence = map(Path, sys.argv[1:4])
    assert not output.exists() and not evidence.exists()
    assert sha(base/'manifest.json') == '8cc194f147d6d5b25736ec49a0c5e1fa6c665c2e9f869dc2ad15903b2cf0c8c6'
    guide = Path('.artifacts/m2-3/native-guides-v3')
    sources = {r['member']: r for r in load(guide/'source.json')['sources']}
    for frame in sources['ctoild_a.shp']['frames'][:64]:
        assert sha(guide/'native'/frame['indexFile']) == frame['indexSha256']
    native = np.stack([np.frombuffer((guide/'native'/f['indexFile']).read_bytes(), np.uint8).reshape(69, 61)
                       for f in sources['ctoild_a.shp']['frames'][:64]])
    master, coverage = source_material()
    positions = landmarks()
    y, x = np.indices((69, 61))
    pins = {r['frame']: np.array(r['crankPin']) for r in load(Path('.artifacts/m2-3/feedback-r9-v1/oil-export-v11.json'))['frames']
            if r['member'] == 'ctoild_a.shp' and r['density'] == 4}
    link_file = Path('.artifacts/m2-3/feedback-r9-v1/authoring/linkage.png')
    link = np.array(Image.open(link_file).convert('RGBA'))
    link[..., :3] = extrude(link[..., :3], link[..., 3] > 180)
    pipes, sweeps = [], []
    for state in range(2):
        frames = native[state*32:(state+1)*32]
        stable = np.all(frames == frames[0], axis=0)
        pipes.append(stable & (x < 7) & (y >= 38))
        sweep = ndimage.binary_dilation(~stable, iterations=1) & (y < 54)
        sweep |= (x >= 34) & (y >= 18) & (y < 54)
        sweeps.append(sweep)
    catalog = load(base/'manifest.json')
    family = copy.deepcopy(catalog['families']['environment-ctoild'])
    output.mkdir(parents=True)
    records, masks = [], {}
    for member in family['members']:
        old, file = base/member['path'], output/member['path']
        assert sha(old) == member['sha256']
        shutil.copytree(old.parent, file.parent)
        if member['member'] != 'ctoild_a.shp':
            continue
        metadata = load(file)
        metadata['packRevision'] = output.name
        metadata.setdefault('authored', {})['r13CompleteEdges'] = dict(
            baselineSha256=sha(old), beamMasterSha256=sha(Path('.artifacts/m2-3/feedback-r8-v1/authoring/gold-beam.png')),
            method='Complete authored moving layers and transparent coverage; retail landmark head and affine straight bar; clean fixed plate within the old motion sweep',
            fixedDriveMasterSha256=sha(Path('.artifacts/m2-3/feedback-r13-v1/authoring/fixed-drive.png')),
            linkageMasterSha256=sha(link_file),
            preserved='Body/flag, owner data, logical frame geometry, original shadow source, timing, fixed material outside the motion sweep and all other families')
        for variant in metadata['variants']:
            d = variant['density']
            backgrounds = fixed_backgrounds(sources, d)
            components = [motion_layers(master, coverage, p, pins[n], link, d) for n, p in enumerate(positions)]
            for page in variant['pages']:
                folder = file.parent/str(d)/page['id']
                pixels = np.array(Image.open(folder/'base.png'))
                before = pixels.copy(); seen = set()
                for frame in variant['frames']:
                    if frame['page'] != page['id'] or tuple(frame['sampleRect']) in seen:
                        continue
                    seen.add(tuple(frame['sampleRect']))
                    n = frame['nativeFrame']; state = n//32
                    layers, anchors = components[n%32]
                    pipe = pipes[state].repeat(d, 0).repeat(d, 1)
                    owner = ((native[n] >= 16) & (native[n] <= 31)).repeat(d, 0).repeat(d, 1)
                    protected = pipe | owner
                    sweep = sweeps[state].repeat(d, 0).repeat(d, 1) & ~protected
                    xx, yy, w, h = frame['contentRect']
                    region = pixels[yy:yy+h, xx:xx+w]; original = region.copy()
                    field = region.copy(); field[sweep] = backgrounds[state][sweep]
                    allowed = sweep.copy(); motion = np.zeros(field.shape[:2], float)
                    for layer_rgb, layer_alpha in layers:
                        alpha = layer_alpha.copy(); alpha[protected] = 0
                        allowed |= alpha > 0
                        field = over(field, layer_rgb, alpha)
                        motion = 1-(1-motion)*(1-alpha)
                    region[allowed] = field[allowed]
                    assert np.array_equal(region[~allowed], original[~allowed])
                    # Native frame coordinates and dimensions remain exact. Coverage
                    # gutters now follow complete HD edges rather than retail cuts.
                    pixels[yy-2:yy+h+2, xx-2:xx+w+2, :3] = np.pad(region[..., :3], ((2, 2), (2, 2), (0, 0)), mode='edge')
                    core = motion > .99
                    masks[f'allowed_{d}_{n}'] = allowed
                    masks[f'coverage_{d}_{n}'] = motion.astype(np.float32)
                    masks[f'beam_{d}_{n}'] = layers[-1][1].astype(np.float32)
                    masks[f'pipe_{d}_{n}'] = protected
                    masks[f'sweep_{d}_{n}'] = sweep
                    records.append(dict(density=d, frame=n, changedRgbPixels=int(np.any(region[..., :3] != original[..., :3], axis=2).sum()),
                        changedAlphaPixels=int((region[..., 3] != original[..., 3]).sum()),
                        oldClippedCorePixels=int((core & (original[..., 3] < 250)).sum()),
                        clippedCorePixels=int((core & (region[..., 3] < 250)).sum()),
                        completeForegroundPixels=int((motion > .5).sum()), anchors=anchors,
                        landmarks=positions[n%32].tolist()))
                pixels[pixels[..., 3] == 0, :3] = 0
                Image.fromarray(pixels).save(folder/'base.png')
                page['baseSha256'], page['baseBytes'] = sha(folder/'base.png'), (folder/'base.png').stat().st_size
        file.write_text(json.dumps(metadata, separators=(',', ':'))+'\n')
        member['sha256'] = sha(file)
    (output/'manifest.json').write_text(json.dumps(dict(catalog, revision=output.name, families={'environment-ctoild': family}), separators=(',', ':'))+'\n')
    mask_file = evidence.with_suffix('.npz'); np.savez_compressed(mask_file, **masks)
    result = dict(status='EXPORTED_COMPLETE_COMPONENT_PENDING_VISUAL_AND_NATIVE_CHECKS', baseline=str(base),
        baselineSha256=sha(base/'manifest.json'), manifestSha256=sha(output/'manifest.json'),
        coverageFile=str(mask_file), coverageSha256=sha(mask_file), frames=records)
    evidence.write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps(dict(output=str(output), frames=len(records), clippedCore=sum(r['clippedCorePixels'] for r in records), oldClippedCore=sum(r['oldClippedCorePixels'] for r in records))))


if __name__ == '__main__':
    main()
