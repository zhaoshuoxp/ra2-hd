"""Register one rigid beam surface to complete retail foreground and occlusion."""
import copy
import json
import runpy
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.stats import theilslopes

h = runpy.run_path(str(Path(__file__).with_name('export-oil-native-rig.py')))
sha, extrude = h['sha'], h['extrude']


def foreground(indices, accepted, front_top, fixed):
    y, x = np.indices(indices.shape)
    warm = ((indices >= 64) & (indices <= 79)) | ((indices >= 96) & (indices <= 143))
    warm |= ((indices >= 160) & (indices <= 166)) | ((indices >= 176) & (indices <= 191))
    candidate = warm & (x >= 4) & (x < 47) & (y < 64)
    candidate &= (x >= 18) | (y <= front_top[1]+1)
    tops = []
    # Fit the straight bar, excluding its curved rear end. A robust estimate
    # tolerates retail bevel pixels replacing isolated warm-color samples.
    for column in range(20, 35):
        previous = np.where(accepted[:, column])[0].min()
        rows = np.where(candidate[:, column] & (np.abs(np.arange(69)-previous) <= 5))[0]
        assert len(rows)
        tops.append(rows.min())
    slope, offset, _, _ = theilslopes(tops, np.arange(20, 35))
    top = slope*x+offset
    candidate &= ((x < 18) & (y > top-8)) | ((x >= 18) & (y >= top-2) & (y <= top+12))
    # Retail gray bevel samples separate some warm highlight strips. Include
    # those samples before component selection, within the fitted top edge only.
    bevel = (indices >= 32) & (indices <= 63)
    bevel &= (ndimage.distance_transform_edt(~candidate) <= 1.5) & (x >= 14) & (x < 47)
    bevel &= (y >= top-2) & (y <= top+4)
    candidate |= bevel
    labels, _ = ndimage.label(candidate, np.ones((3, 3)))
    sizes = np.bincount(labels.ravel()); sizes[0] = 0
    mask = labels == sizes.argmax()
    mask &= ~(fixed & (x < 10) & (y > 35))
    return mask, [float(slope), float(offset)]


def surface(master, line, density, indices):
    yy, xx = np.indices((69*density, 61*density))
    points = np.stack([(xx+.5)/density-.5, (yy+.5)/density-.5], axis=-1)
    slope, offset = line
    p = np.array([14., slope*14+offset]); q = np.array([44., slope*44+offset])
    a, b = np.array([116., 231.]), np.array([338., 145.])
    source, target = b-a, q-p
    angle = np.arctan2(source[1], source[0])-np.arctan2(target[1], target[0])
    scale = np.linalg.norm(source)/np.linalg.norm(target)
    rotation = np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])*scale
    xy = (points-p)@rotation.T+a
    rgb = np.stack([ndimage.map_coordinates(master[..., c], [xy[..., 1], xy[..., 0]], order=3, mode='nearest')
                    for c in range(3)], axis=-1)
    rgb = np.uint8(np.clip(rgb, 0, 255))
    side = ((indices >= 160) & (indices <= 166)).repeat(density, 0).repeat(density, 1)
    rgb[side] = np.maximum(rgb[side]*.58, [68, 55, 32]).astype(np.uint8)
    return rgb


def main():
    base, output, evidence = map(Path, sys.argv[1:4])
    assert not output.exists() and not evidence.exists()
    guide = Path('.artifacts/m2-3/native-guides-v3')
    source = next(s for s in json.loads((guide/'source.json').read_text())['sources'] if s['member'] == 'ctoild_a.shp')
    indices, rgba = [], []
    for f in source['frames'][:64]:
        assert sha(guide/'native'/f['indexFile']) == f['indexSha256']
        assert sha(guide/'native'/f['file']) == f['rgbaSha256']
        indices.append(np.frombuffer((guide/'native'/f['indexFile']).read_bytes(), np.uint8).reshape(69, 61))
        rgba.append(np.frombuffer((guide/'native'/f['file']).read_bytes(), np.uint8).reshape(69, 61, 4))
    indices, rgba = np.stack(indices), np.stack(rgba)
    accepted = np.stack([h['beam_mask'](i) for i in indices])
    rig = json.loads(Path('.artifacts/m2-3/feedback-r9-v1/oil-export-v11.json').read_text())
    pins = {(r['density'], r['frame']): r for r in rig['frames'] if r['member'] == 'ctoild_a.shp'}
    master_file = Path('.artifacts/m2-3/feedback-r8-v1/authoring/gold-beam.png')
    master = np.array(Image.open(master_file).convert('RGBA').crop((0, 0, 384, 512)))
    valid = master[..., 3] > 180
    safe = extrude(master[..., :3], valid & (master[..., :3].mean(axis=2) >= 80))
    edge = ~valid | ((ndimage.distance_transform_edt(valid) <= 10) & (master[..., :3].mean(axis=2) < 70))
    master[..., :3][edge] = safe[edge]
    fixed_file = Path('.artifacts/m2-3/feedback-r9-v1/authoring/fixed-background-v2.png')
    link_file = Path('.artifacts/m2-3/feedback-r9-v1/authoring/linkage.png')
    fixed_image = np.array(Image.open(fixed_file).convert('RGBA'))
    link = np.array(Image.open(link_file).convert('RGBA'))
    y, x = np.indices((69, 61))
    masks, lines, tanks, moving = [], [], [], []
    for state in (0, 1):
        native = indices[state*32:(state+1)*32]
        fixed = np.all(native == native[0], axis=0)
        tanks.append(fixed & (native[0] >= 32) & (native[0] <= 63) & (x >= 14) & (x < 24) & (y >= 26) & (y < 47))
        for n in range(state*32, (state+1)*32):
            mask, line = foreground(indices[n], accepted[n], pins[(4, n)]['frontRodTop'], fixed)
            masks.append(mask); lines.append(line)
            moving.append(~fixed & (x >= 34) & (x < 54) & (y >= 10) & (y < 48) &
                (indices[n] != 0) & (indices[n] != 12) & ~accepted[n])
    catalog = json.loads((base/'manifest.json').read_text())
    family = copy.deepcopy(catalog['families']['environment-ctoild'])
    output.mkdir(parents=True); records = []
    for member in family['members']:
        old = base/member['path']; file = output/member['path']
        assert sha(old) == member['sha256']
        shutil.copytree(old.parent, file.parent)
        if member['member'] != 'ctoild_a.shp':
            continue
        metadata = json.loads(file.read_text()); metadata['packRevision'] = output.name
        metadata['authored']['r11Foreground'] = dict(baseSha256=sha(old), beamMasterSha256=sha(master_file),
            fixedMasterSha256=sha(fixed_file), linkageMasterSha256=sha(link_file),
            method='Complete retail foreground with rigid canonical surface and original gray/owner occlusion; no palette expansion or column fill',
            rig='All R9 bearing and front-rod coordinates reused exactly')
        for variant in metadata['variants']:
            d = variant['density']
            backgrounds = [h['fixed_canvas'](fixed_image, state, d)[37*d:106*d, 75*d:136*d] for state in (0, 1)]
            refs = [h['register_owner_material'](backgrounds[state], rgba[state*32], indices[state*32], d)[0] for state in (0, 1)]
            for page in variant['pages']:
                folder = file.parent/str(d)/page['id']; pixels = np.array(Image.open(folder/'base.png'))
                before = pixels.copy(); seen = set()
                for f in variant['frames']:
                    if f['page'] != page['id'] or tuple(f['sampleRect']) in seen:
                        continue
                    seen.add(tuple(f['sampleRect'])); n = f['nativeFrame']; state = n//32
                    r = pins[(d, n)]; background = backgrounds[state].copy()
                    drive = moving[n].repeat(d, 0).repeat(d, 1); gray = background.mean(axis=2)
                    background[drive] = np.stack([gray*.78, gray*.81, gray*.87], axis=-1).astype(np.uint8)[drive]
                    cr, ca = h['component'](link, np.array([1445., 486.]), np.array([1205., 633.]), np.array([49., 36.]), np.array(r['crankPin']), d, 'right')
                    rod, ra = h['component'](link, np.array([547., 123.]), np.array([608., 778.]), np.array(r['beamBearing']), np.array(r['crankPin']), d, 'left')
                    front, fa = h['component'](link, np.array([547., 123.]), np.array([608., 778.]), np.array(r['frontRodTop']), np.array([8., 65.]), d, 'left', width=.35)
                    for rgb, alpha in ((front, fa), (cr, ca), (rod, ra)):
                        background = np.uint8(np.clip(background*(1-alpha[..., None])+rgb*alpha[..., None], 0, 255))
                    protected = tanks[state].repeat(d, 0).repeat(d, 1)
                    background = h['register_owner_material'](background, rgba[n], indices[n], d)[0]
                    background[protected] = refs[state][protected]
                    xx, yy, w, height = f['contentRect']; region = pixels[yy:yy+height, xx:xx+w]
                    active = region[..., 3] > 0; previous = region.copy()
                    old_mask = accepted[n].repeat(d, 0).repeat(d, 1)
                    native_active = ((indices[n] != 0) & (indices[n] != 12)).repeat(d, 0).repeat(d, 1)
                    check = active & native_active & ~old_mask
                    assert np.array_equal(previous[..., :3][check], background[check]), (d, n, 'R9 unmodified background reconstruction')
                    field = background.copy(); beam = masks[n].repeat(d, 0).repeat(d, 1)
                    rgb = surface(master, lines[n], d, indices[n])
                    # A source bolt/outline clipped by the retail silhouette
                    # must not become an isolated black edge block. Extend the
                    # neighboring sampled metal inside that silhouette only.
                    boundary = ndimage.distance_transform_edt(beam) <= 1.5*d
                    native_rgb = rgba[n, ..., :3].astype(int)
                    bright = (native_rgb[..., 0] >= 190) & (native_rgb[..., 1] >= 150)
                    bright &= native_rgb[..., 0]-native_rgb[..., 2] >= 15
                    bright = bright.repeat(d, 0).repeat(d, 1)
                    cut = beam & boundary & (rgb.mean(axis=2) < np.where(bright, 80, 45))
                    safe_rgb = extrude(rgb, beam & (rgb.mean(axis=2) >= 80))
                    rgb[cut] = safe_rgb[cut]
                    # Smooth the internal foreground boundary at native scale;
                    # the retail alpha, ownership and external footprint remain
                    # byte-identical. Coverage never paints outside the mask.
                    coverage = ndimage.gaussian_filter(beam.astype(float), .40*d)
                    coverage = np.clip((coverage-.20)/.60, 0, 1)
                    # Retain thin retail glints when subpixel edge filtering
                    # would otherwise erase them against a dark back layer.
                    coverage[beam & bright] = np.maximum(coverage[beam & bright], .75)
                    blended = np.uint8(np.clip(background*(1-coverage[..., None])+rgb*coverage[..., None], 0, 255))
                    field[beam] = blended[beam]
                    field = h['register_owner_material'](field, rgba[n], indices[n], d)[0]
                    # Equal palette indices are not equal layer identities:
                    # the moving bevel can share the tank's white index. Keep
                    # the accepted fixed canvas wherever it is actually visible.
                    visible_tank = protected & ~beam
                    field[visible_tank] = refs[state][visible_tank]
                    allowed = (old_mask | beam) & active & ~visible_tank
                    region[..., :3][allowed] = field[allowed]
                    assert np.array_equal(previous[~allowed], region[~allowed])
                    pixels[yy-2:yy+height+2, xx-2:xx+w+2, :3] = np.pad(region[..., :3], ((2, 2), (2, 2), (0, 0)), mode='edge')
                    record = {**r, 'foreground': masks[n].astype(int).tolist(), 'line': lines[n],
                              'allowed': (accepted[n] | masks[n]).astype(int).tolist(),
                              'foregroundNativeCells': int(masks[n].sum()),
                              'repairedEdgeTexels': int(cut.sum()),
                              'changedPixels': int(np.any(previous != region, axis=2).sum())}
                    records.append(record)
                assert np.array_equal(before[..., 3], pixels[..., 3])
                pixels[pixels[..., 3] == 0, :3] = 0
                Image.fromarray(pixels).save(folder/'base.png')
                page['baseSha256'], page['baseBytes'] = sha(folder/'base.png'), (folder/'base.png').stat().st_size
        file.write_text(json.dumps(metadata, separators=(',', ':'))+'\n'); member['sha256'] = sha(file)
    (output/'manifest.json').write_text(json.dumps(dict(catalog, revision=output.name, families={'environment-ctoild': family}), separators=(',', ':'))+'\n')
    evidence.write_text(json.dumps(dict(status='EXPORTED_RETAIL_FOREGROUND_AND_RIGID_SURFACE', base=str(base.resolve()),
        baseSha256=sha(base/'manifest.json'), manifestSha256=sha(output/'manifest.json'), frames=records), separators=(',', ':'))+'\n')
    print(json.dumps(dict(output=str(output), changedFrames=len(records))))


if __name__ == '__main__':
    main()
