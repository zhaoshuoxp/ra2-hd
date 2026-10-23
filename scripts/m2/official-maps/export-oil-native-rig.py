"""Build oil materials from a clean fixed plate and retail component occlusion."""
import copy
import json
import runpy
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.interpolate import RBFInterpolator

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from showcase_registration import extrude, independently_sample, sha
from showcase_owner import register_owner_material

helpers = runpy.run_path(str(Path(__file__).with_name('export-gameplay-components.py')))
canvas = helpers['canvas']


def read(file):
    return json.loads(file.read_text())


def plate(image, mask):
    y, x = np.where(mask)
    l, t, r, b = int(x.min()), int(y.min()), int(x.max()+1), int(y.max()+1)
    return extrude(image[t:b, l:r, :3], mask[t:b, l:r]), [l, t, r, b]


def beam_mask(indices):
    """Retail tan/gold foreground excludes the red ladder palette entirely."""
    y, x = np.indices(indices.shape)
    warm = ((indices >= 64) & (indices <= 79)) | (indices == 96) | ((indices >= 112) & (indices <= 143))
    mask = warm & (x >= 5) & (x < 47) & (y < 50)
    # Fit only the uninterrupted upper beam runs; fixed warm metal below is excluded.
    points = []
    for column in range(20, 43):
        runs, count = ndimage.label(mask[:31, column])
        lengths = np.bincount(runs); lengths[0] = 0
        if count and lengths.max() >= 4:
            rows = np.where(runs == lengths.argmax())[0]
            points.append((column, rows.min()))
    assert len(points) >= 10
    slope, offset = np.polyfit(np.array(points)[:, 0], np.array(points)[:, 1], 1)
    top = slope*x+offset
    mask &= ((x >= 14) & (y >= top-2) & (y <= top+12)) | ((x < 17) & (y >= slope*12+offset-9) & (y <= slope*12+offset+23))
    labels, _ = ndimage.label(ndimage.binary_closing(mask), structure=np.ones((3, 3)))
    sizes = np.bincount(labels.ravel()); sizes[0] = 0
    assert sizes.max() > 70
    mask = ndimage.binary_fill_holes(labels == sizes.argmax())
    return mask & (indices != 0) & (indices != 12) & ~((indices >= 101) & (indices <= 111))


def beam_surface(image, mask, density):
    """Register head and straight beam independently, following the retail silhouette."""
    yy, xx = np.indices((69*density, 61*density))
    x, y = (xx+.5)/density-.5, (yy+.5)/density-.5
    top, bottom = np.zeros(61), np.zeros(61)
    for column in range(61):
        rows = np.where(mask[:, column])[0]
        if len(rows):
            top[column], bottom[column] = rows.min(), rows.max()+1
    valid = bottom > top
    top = np.interp(np.arange(61), np.where(valid)[0], top[valid])
    bottom = np.interp(np.arange(61), np.where(valid)[0], bottom[valid])
    columns = np.arange(20, 43)
    slope, offset = np.polyfit(columns, top[columns], 1)
    v = np.clip((y-(slope*x+offset))/9, 0, 1)
    sx = 116 + np.clip((x-14)/30, 0, 1)*222
    sy = 243-(sx-116)*.44+v*48
    head = x < 14
    sx[head] = 40+np.clip((x[head]-5)/9, 0, 1)*69
    hv = np.clip((y-(slope*12+offset-6))/27, 0, 1)
    sy[head] = 182+hv[head]*196
    return np.uint8(np.clip(np.stack([ndimage.map_coordinates(image[..., c], [sy, sx], order=3, mode='nearest')
                                    for c in range(3)], axis=-1), 0, 255))


def component(image, a, b, p, q, density, side, width=1):
    """Transform one authored rigid part between native bearing centers."""
    source_axis = np.array(b)-a; target_axis = np.array(q)-p
    scale = np.linalg.norm(source_axis)/np.linalg.norm(target_axis)
    angle = np.arctan2(source_axis[1], source_axis[0])-np.arctan2(target_axis[1], target_axis[0])
    rotate = np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])*scale
    yy, xx = np.indices((69*density, 61*density))
    points = np.stack([(xx+.5)/density-.5, (yy+.5)/density-.5], axis=-1)
    xy = (points-p)@rotate.T
    unit = source_axis/np.linalg.norm(source_axis)
    along = (xy@unit)[..., None]*unit
    xy = along+(xy-along)/width+a
    colors = np.stack([ndimage.map_coordinates(image[..., c], [xy[..., 1], xy[..., 0]], order=3, mode='constant')
                       for c in range(3)], axis=-1)
    alpha = ndimage.map_coordinates(image[..., 3]/255., [xy[..., 1], xy[..., 0]], order=1, mode='constant')
    alpha *= (xy[..., 0] < 887) if side == 'left' else (xy[..., 0] >= 887)
    return np.clip(colors, 0, 255), np.clip(alpha, 0, 1)


def fixed_canvas(image, state, density):
    """Align fixed bearing, tank, roof and floor landmarks on one shared canvas."""
    target = np.array([[82, 13 if state == 0 else 27], [65, 40 if state == 0 else 50],
        [98, 40 if state == 0 else 52], [104, 61], [124, 73], [114, 67],
        [122, 88], [54, 61], [33, 74], [54, 98], [82, 102], [29, 91], [83, 116], [133, 88]], float)
    source = np.array([[632, 34], [526, 214], [738, 215], [749, 336], [877, 444], [842, 396],
        [877, 515], [459, 337], [302, 419], [462, 560], [620, 600], [278, 507], [628, 678], [976, 509]], float)
    if state:
        source = np.array([[630, 710], [520, 850], [738, 898], [753, 896], [886, 1009], [849, 957],
            [886, 1074], [473, 921], [320, 991], [469, 1114], [635, 1156], [293, 1074], [636, 1235], [984, 1074]], float)
    valid = image[..., 3] > 180
    colors = extrude(image[..., :3], valid)
    yy, xx = np.indices((122*density, 166*density))
    xy = np.column_stack([(xx.ravel()+.5)/density-.5, (yy.ravel()+.5)/density-.5])
    warped = RBFInterpolator(target, source, kernel='thin_plate_spline', smoothing=0)(xy)
    result = np.stack([ndimage.map_coordinates(colors[..., c], [warped[:, 1], warped[:, 0]], order=3, mode='nearest')
                       for c in range(3)], axis=-1)
    return np.uint8(np.clip(result.reshape(122*density, 166*density, 3), 0, 255))



def main():
    base, output, evidence = map(Path, sys.argv[1:4])
    assert not output.exists() and not evidence.exists()
    guide = Path('.artifacts/m2-3/native-guides-v3')
    sources = {row['member']: row for row in read(guide/'source.json')['sources']}
    source = sources['ctoild_a.shp']
    native, rgba = [], []
    for frame in source['frames'][:64]:
        assert frame['origin'] == [75, 37] and frame['size'] == [61, 69]
        assert sha(guide/'native'/frame['indexFile']) == frame['indexSha256']
        assert sha(guide/'native'/frame['file']) == frame['rgbaSha256']
        native.append(np.frombuffer((guide/'native'/frame['indexFile']).read_bytes(), np.uint8).reshape(69, 61))
        rgba.append(np.frombuffer((guide/'native'/frame['file']).read_bytes(), np.uint8).reshape(69, 61, 4))
    native, rgba = np.stack(native), np.stack(rgba)
    art = Path('.artifacts/m2-3/feedback-r9-v1/authoring')
    fixed_file, link_file = art/'fixed-background-v2.png', art/'linkage.png'
    fixed_image = np.array(Image.open(fixed_file).convert('RGBA'))
    labels, _ = ndimage.label(fixed_image[..., 3] > 180, structure=np.ones((3, 3)))
    sizes = np.bincount(labels.ravel()); sizes[0] = 0
    subjects = sorted(np.argsort(sizes)[-2:], key=lambda label: np.where(labels == label)[0].min())
    fixed_plates = [plate(fixed_image, labels == label) for label in subjects]
    link_image = np.array(Image.open(link_file).convert('RGBA'))
    link_plate, link_box = plate(link_image, (link_image[..., 3] > 180) & (np.indices(link_image.shape[:2])[1] < 887))
    gold_file = Path('.artifacts/m2-3/feedback-r8-v1/authoring/gold-beam.png')
    gold_image = np.array(Image.open(gold_file).convert('RGBA').crop((0, 0, 384, 512)))
    gold_plate, gold_box = plate(gold_image, gold_image[..., 3] > 180)
    gold_image[..., :3] = extrude(gold_image[..., :3], gold_image[..., 3] > 180)
    masks = np.stack([beam_mask(frame) for frame in native])
    fixed_tank = []
    yy, xx = np.indices((69, 61))
    for state in range(2):
        frames = native[state*32:(state+1)*32]
        fixed_tank.append(np.all(frames == frames[0], axis=0) & (frames[0] >= 32) & (frames[0] <= 63) &
                          (xx >= 14) & (xx < 24) & (yy >= 26) & (yy < 47))
    # Crank/rod motion uses the actual current retail foreground lighting and shape.
    # It never imports an entire independently drawn pump pose or static axle copies.
    moving = []
    yy, xx = np.indices((69, 61))
    for state in range(2):
        frames = native[state*32:(state+1)*32]
        variable = np.any(frames != frames[0], axis=0)
        moving.extend(variable & (xx >= 34) & (xx < 54) & (yy >= 10) & (yy < 48) &
                      (frame != 0) & (frame != 12) & ~masks[state*32+k]
                      for k, frame in enumerate(frames))
    catalog = read(base/'manifest.json')
    family = copy.deepcopy(catalog['families']['environment-ctoild'])
    output.mkdir(parents=True)
    records = []
    for member in family['members']:
        old = base/member['path']; file = output/member['path']
        assert sha(old) == member['sha256']
        shutil.copytree(old.parent, file.parent)
        if member['member'] not in ('ctoild.shp', 'ctoild_a.shp'):
            continue
        metadata = read(file)
        metadata['packRevision'] = output.name
        metadata.setdefault('authored', {})['r9NativeRig'] = dict(
            fixedMasterSha256=sha(fixed_file), linkageMasterSha256=sha(link_file),
            beamMasterSha256=sha(gold_file), fixedCrops=[box for _, box in fixed_plates],
            beamCrop=gold_box, linkageCrop=link_box,
            method='One clean background per health state; single authored head/beam surface registered to retail silhouette; rigid silver rod and eccentric crank between retail bearing centers',
            registration='Body and active layer are cut from the exact same full-canvas field',
            native='Original alpha, owner/auxiliary data, canvas, trim, frame order, shadows and timing remain exact')
        for variant in metadata['variants']:
            d = variant['density']
            backgrounds = [fixed_canvas(fixed_image, state, d) for state in range(2)]
            stationary_refs = [register_owner_material(backgrounds[state][37*d:106*d, 75*d:136*d],
                                                       rgba[state*32], native[state*32], d)[0]
                               for state in range(2)]
            for page in variant['pages']:
                folder = file.parent/str(d)/page['id']; pixels = np.array(Image.open(folder/'base.png'))
                before = pixels.copy(); seen = set()
                for frame in variant['frames']:
                    if frame['page'] != page['id'] or tuple(frame['sampleRect']) in seen:
                        continue
                    seen.add(tuple(frame['sampleRect'])); number = frame['nativeFrame']
                    if member['member'] == 'ctoild.shp' and number not in (0, 1):
                        continue
                    if member['member'] == 'ctoild_a.shp' and number >= 64:
                        continue
                    src = sources[member['member']]['frames'][number]
                    state = number if member['member'] == 'ctoild.shp' else number//32
                    ox, oy = src['origin']; w, h = src['size']
                    colors = backgrounds[state][oy*d:(oy+h)*d, ox*d:(ox+w)*d].copy()
                    stationary = colors.copy()
                    if member['member'] == 'ctoild_a.shp':
                        beam = masks[number].repeat(d, 0).repeat(d, 1)
                        phase = number%32
                        upper = masks[phase] & (xx >= 30) & (yy < 32)
                        beam_right = np.where(upper)[1].max()
                        attach_x = int(beam_right-6)
                        rows = np.where(masks[phase][:, attach_x])[0]
                        p = np.array([float(attach_x), float(rows.max()+1)])
                        # Follow the highlighted bearing, excluding the rotating
                        # counterweight and the fixed motor silhouette farther right.
                        key_y = 24.5+7*np.sin(phase*np.pi/16)
                        warm = ((native[phase] >= 112) & (native[phase] <= 143)) | (native[phase] == 96) | ((native[phase] >= 64) & (native[phase] <= 79))
                        pins = warm & (xx >= 47) & (xx <= 52) & (np.abs(yy-key_y) <= 4) & ~masks[phase]
                        py, px = np.where(pins)
                        assert len(px)
                        weight = np.maximum(rgba[phase, py, px, 0].astype(float), 1)*np.exp(-((px-49.3)**2+(py-key_y)**2)/4)
                        q = np.array([np.average(px, weights=weight), np.average(py, weights=weight)])
                        # Select the actual underside attachment by following the
                        # native bright linkage edge, rather than the beam's outer tip.
                        choices = []
                        for column in range(int(beam_right)-10, int(beam_right)):
                            rows = np.where(masks[phase][:, column])[0]
                            if not len(rows):
                                continue
                            candidate = np.array([float(column), float(rows.max()+1)])
                            points = candidate+(q-candidate)*np.linspace(.05, .95, 48)[:, None]
                            ix, iy = np.rint(points).astype(int).T
                            values = native[phase, iy, ix]
                            valid = (values != 0) & (values != 12)
                            gray = (values >= 32) & (values <= 54)
                            score = valid.mean()+gray.mean()*.5-np.linalg.norm(candidate-p)*.01
                            choices.append((score, candidate))
                        p = max(choices, key=lambda value: value[0])[1]
                        # Native drive coverage outside the authored pieces must not
                        # reveal gold spill from the removed mechanism's fixed plate.
                        drive = moving[number].repeat(d, 0).repeat(d, 1)
                        neutral = colors.mean(axis=-1)
                        colors[drive] = np.stack([neutral*.78, neutral*.81, neutral*.87], axis=-1).astype(np.uint8)[drive]
                        crank, ca = component(link_image, np.array([1445., 486.]), np.array([1205., 633.]),
                                              np.array([49., 36.]), q, d, 'right')
                        rod, ra = component(link_image, np.array([547., 123.]), np.array([608., 778.]), p, q, d, 'left')
                        head_rows = np.where(masks[phase][:, 8:12])[0]
                        front_top = np.array([8., float(head_rows.max())])
                        front, fa = component(link_image, np.array([547., 123.]), np.array([608., 778.]),
                                              front_top, np.array([8., 65.]), d, 'left', width=.35)
                        colors = np.uint8(np.clip(colors*(1-fa[..., None])+front*fa[..., None], 0, 255))
                        colors = np.uint8(np.clip(colors*(1-ca[..., None])+crank*ca[..., None], 0, 255))
                        colors = np.uint8(np.clip(colors*(1-ra[..., None])+rod*ra[..., None], 0, 255))
                        moved = beam_surface(gold_image, masks[number], d)
                        colors[beam] = moved[beam]
                        protected = fixed_tank[state].repeat(d, 0).repeat(d, 1)
                        colors[protected] = stationary[protected]
                        indices, original = native[number], rgba[number]
                    else:
                        original = np.frombuffer((guide/'native'/src['file']).read_bytes(), np.uint8).reshape(h, w, 4)
                        indices = np.frombuffer((guide/'native'/src['indexFile']).read_bytes(), np.uint8).reshape(h, w)
                    colors = register_owner_material(colors, original, indices, d)[0]
                    if member['member'] == 'ctoild_a.shp':
                        colors[protected] = stationary_refs[state][protected]
                    active = ((indices != 0) & (indices != 12)).repeat(d, 0).repeat(d, 1)
                    colors = extrude(colors, active)
                    x, y, cw, ch = frame['contentRect']; region = pixels[y:y+ch, x:x+cw]
                    assert colors.shape[:2] == region.shape[:2]
                    region[..., :3][active] = colors[active]
                    pixels[y-2:y+ch+2, x-2:x+cw+2, :3] = np.pad(region[..., :3], ((2, 2), (2, 2), (0, 0)), mode='edge')
                    record = dict(member=member['member'], frame=number, density=d)
                    if member['member'] == 'ctoild_a.shp':
                        record.update(beamBearing=p.tolist(), crankPin=q.tolist(), fixedAxle=[49, 36],
                            frontRodTop=front_top.tolist(), frontRodFoot=[8, 65],
                            rodCoveredFraction=float((ra*active).sum()/max(ra.sum(), 1)),
                            crankCoveredFraction=float((ca*active).sum()/max(ca.sum(), 1)))
                    records.append(record)
                assert np.array_equal(before[..., 3], pixels[..., 3])
                pixels[pixels[..., 3] == 0, :3] = 0
                Image.fromarray(pixels).save(folder/'base.png')
                page['baseSha256'], page['baseBytes'] = sha(folder/'base.png'), (folder/'base.png').stat().st_size
        file.write_text(json.dumps(metadata, separators=(',', ':'))+'\n'); member['sha256'] = sha(file)
    (output/'manifest.json').write_text(json.dumps(dict(catalog, revision=output.name, families={'environment-ctoild': family}), separators=(',', ':'))+'\n')
    evidence.write_text(json.dumps(dict(status='EXPORTED_NATIVE_GUIDED_OIL_PENDING_VISUAL_REVIEW',
        baseSha256=sha(base/'manifest.json'), manifestSha256=sha(output/'manifest.json'), frames=records), indent=2)+'\n')
    print(json.dumps(dict(output=str(output), changedFrames=len(records))))


if __name__ == '__main__':
    main()
