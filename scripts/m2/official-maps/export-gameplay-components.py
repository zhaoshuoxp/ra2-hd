"""Register complete neutral-building families against composed native poses."""
import copy
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.spatial import cKDTree

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from showcase_registration import extrude, independently_sample, register, sha
from showcase_owner import register_owner_material


def read(file):
    return json.loads(file.read_text())


def canvas(source, number, guide):
    frame = source['frames'][number]
    w, h = source['canvas']
    result = np.zeros((h, w), np.uint8)
    if not frame['empty']:
        file = guide / 'native' / frame.get('indexFile', f"{source['member']}-{number}.index")
        assert sha(file) == frame['indexSha256']
        x, y = frame['origin']
        fw, fh = frame['size']
        result[y:y+fh, x:x+fw] = np.frombuffer(file.read_bytes(), np.uint8).reshape(fh, fw)
    return result


def warp_pose(colors, reference, target, density):
    """Move material only where the retail pose changes; stationary pixels are exact."""
    h, w = target.shape
    ys, xs = np.indices((h, w))
    qx, qy = xs.astype(float), ys.astype(float)
    moving = (reference != target) & (target != 0) & (target != 12)
    for index in np.unique(target[moving]):
        source_y, source_x = np.where(reference == index)
        ty, tx = np.where(moving & (target == index))
        if not len(source_x):
            continue
        distance, nearest = cKDTree(np.column_stack([source_x, source_y])).query(np.column_stack([tx, ty]))
        near = distance <= 12
        qx[ty[near], tx[near]], qy[ty[near], tx[near]] = source_x[nearest[near]], source_y[nearest[near]]
    # A smooth material displacement avoids creating fresh native-size color blocks.
    dx = ndimage.gaussian_filter(qx-xs, .55)
    dy = ndimage.gaussian_filter(qy-ys, .55)
    xx, yy = np.meshgrid((np.arange(w*density)+.5)/density-.5, (np.arange(h*density)+.5)/density-.5)
    coords = np.array([yy, xx])
    wx = ndimage.map_coordinates(dx, coords, order=1, mode='nearest')
    wy = ndimage.map_coordinates(dy, coords, order=1, mode='nearest')
    sample = np.array([(yy+wy+.5)*density-.5, (xx+wx+.5)*density-.5])
    result = np.stack([ndimage.map_coordinates(colors[..., c], sample, order=1, mode='nearest')
                       for c in range(3)], axis=-1).astype(np.uint8)
    stationary = np.repeat(np.repeat(reference == target, density, 0), density, 1)
    result[stationary] = colors[stationary]
    return result


def main():
    base, output, evidence = map(Path, sys.argv[1:4])
    assert not output.exists() and not evidence.exists()
    authoring = Path('.artifacts/m2-3/feedback-r6-v1/authoring')
    guide = Path('.artifacts/m2-3/native-guides-v3')
    sources = {row['member']: row for row in read(guide/'source.json')['sources']}
    catalog = read(base/'manifest.json')
    contract = read(Path('desktop/environment-hd-contract.json'))
    output.mkdir(parents=True)
    result = {**catalog, 'revision': output.name, 'families': {}}
    receipts = []
    oil = Image.open(authoring/'oil-master.png').convert('RGBA')
    radar = Image.open(authoring/'airport-master.png').convert('RGBA')
    work = read(Path('.artifacts/m2-3/feedback-r4-v1/material-export-input-v3/worklist.json'))
    overrides = read(Path('.artifacts/m2-3/feedback-r4-v1/material-export-input-v3/slot-overrides.json'))
    airport_slot = {**work['slots']['ctairp.shp-000'], **overrides['ctairp.shp-000']}
    _, airport_plate = register(Image.open(airport_slot['board']).convert('RGBA'), airport_slot,
                                airport_slot['boardSize'], isolated=True)
    airport_native = canvas(sources['ctairp.shp'], 0, guide)
    airport_native = np.where(canvas(sources['ctairp_a.shp'], 0, guide) != 0,
        canvas(sources['ctairp_a.shp'], 0, guide), airport_native)
    for family in ['environment-ctairp', 'environment-ctoild']:
        record = copy.deepcopy(catalog['families'][family])
        for entry in record['members']:
            name = entry['member']
            src, old_file, file = sources[name], base/entry['path'], output/entry['path']
            assert sha(old_file) == entry['sha256']
            shutil.copytree(old_file.parent, file.parent)
            metadata = read(old_file)
            metadata['packRevision'] = output.name
            changed = name in ['ctairp_a.shp', 'ctoild.shp', 'ctoild_a.shp']
            if changed:
                metadata['color']['composedNativeRegistration'] = dict(schema='composed-native-material-v1',
                    sourceSha256=src['sha256'], oilMasterSha256=sha(authoring/'oil-master.png'),
                    radarMasterSha256=sha(authoring/'airport-master.png'),
                    geometry='Exact existing native frame masks, canvas, trim, frame order and owner data',
                    motion='Material displacement follows the original palette-index pose changes',
                    airport='One rotating dish; stationary apron and cargo reuse the accepted body master')
            for variant in metadata['variants']:
                d = variant['density']
                references = {}
                if name.startswith('ctoild') and changed:
                    for state, bf, af in [(0, 0, 0), (1, 1, 32)]:
                        a, b = canvas(sources['ctoild.shp'], bf, guide), canvas(sources['ctoild_a.shp'], af, guide)
                        native = np.where((b != 0) & (b != 12), b, a)
                        covered = (native != 0) & (native != 12)
                        ys, xs = np.where(covered)
                        bounds = [int(xs.min()), int(ys.min()), int(xs.max()+1), int(ys.max()+1)]
                        _, plate = register(oil, dict(slotRect=[0, state*768, 1536, 768]), [1536, 1536])
                        l, t, r, bottom = bounds
                        rgb = np.zeros((native.shape[0]*d, native.shape[1]*d, 3), np.uint8)
                        rgb[t*d:bottom*d, l*d:r*d] = independently_sample(plate, ((r-l)*d, (bottom-t)*d))
                        references[state] = native, rgb
                if name == 'ctairp_a.shp':
                    # Reuse the original body master before its component mask cuts holes.
                    l, t, r, bottom = airport_slot['nativeBounds']
                    rgb = np.zeros((172*d, 172*d, 3), np.uint8)
                    ox, oy = sources['ctairp.shp']['frames'][0]['origin']
                    rgb[(oy+t)*d:(oy+bottom)*d, (ox+l)*d:(ox+r)*d] = independently_sample(
                        airport_plate, ((r-l)*d, (bottom-t)*d))
                    references[0] = airport_native, rgb
                for page in variant['pages']:
                    folder = file.parent/str(d)/page['id']
                    pixels = np.array(Image.open(folder/'base.png').convert('RGBA'))
                    before = pixels.copy()
                    seen = set()
                    for frame in variant['frames']:
                        if frame['page'] != page['id'] or tuple(frame['sampleRect']) in seen:
                            continue
                        seen.add(tuple(frame['sampleRect']))
                        number = frame['nativeFrame']
                        original = src['frames'][number]
                        if not changed or original['empty'] or name == 'ctairp_a.shp' and number >= 10:
                            continue
                        if name == 'ctoild.shp' and number >= 3:
                            continue
                        x, y, w, h = frame['contentRect']
                        fw, fh = original['size']
                        ox, oy = original['origin']
                        target = canvas(src, number, guide)
                        state = int(number >= 32) if name == 'ctoild_a.shp' else int(number in [1, 2])
                        reference, rgb = references[state if name.startswith('ctoild') else 0]
                        if name == 'ctairp_a.shp':
                            moved = rgb.copy()
                            # Native alpha carries each dish angle. Its own generated cell
                            # supplies material without palette-index displacement artifacts.
                            _, plate = register(radar, dict(slotRect=[number%5*307, number//5*768, 307, 768]), [1536, 1536])
                            moved[28*d:72*d, 6*d:40*d] = independently_sample(plate, (34*d, 44*d))
                        elif name.endswith('_a.shp'):
                            moved = warp_pose(rgb, reference, target, d)
                        else:
                            moved = rgb
                        cropped = moved[oy*d:(oy+fh)*d, ox*d:(ox+fw)*d].copy()
                        native_file = guide/'native'/original['file']
                        rgba = np.array(Image.frombytes('RGBA', (fw, fh), native_file.read_bytes()))
                        index = target[oy:oy+fh, ox:ox+fw]
                        cropped = register_owner_material(cropped, rgba, index, d)[0]
                        active = np.repeat(np.repeat((index != 0) & (index != 12), d, 0), d, 1)
                        region = pixels[y:y+h, x:x+w]
                        assert region.shape[:2] == active.shape
                        cropped = extrude(cropped, active)
                        contact = np.repeat(np.repeat(index == 12, d, 0), d, 1)
                        region[..., :3][~contact] = cropped[~contact]
                        # Refresh color gutters without changing alpha or owner data.
                        padded = np.pad(region[..., :3], ((2, 2), (2, 2), (0, 0)), mode='edge')
                        pixels[y-2:y+h+2, x-2:x+w+2, :3] = padded
                        receipts.append(dict(member=name, frame=number, density=d, nativeIndexSha256=original['indexSha256'],
                            changedRgbPixels=int(np.any(region[..., :3] != before[y:y+h, x:x+w, :3], axis=-1).sum())))
                    assert np.array_equal(pixels[..., 3], before[..., 3])
                    pixels[pixels[..., 3] == 0, :3] = 0
                    Image.fromarray(pixels).save(folder/'base.png')
                    page['baseSha256'], page['baseBytes'] = sha(folder/'base.png'), (folder/'base.png').stat().st_size
            file.write_text(json.dumps(metadata, separators=(',', ':'))+'\n')
            entry['sha256'] = sha(file)
        result['families'][family] = record
    (output/'manifest.json').write_text(json.dumps(result, separators=(',', ':'))+'\n')
    evidence.write_text(json.dumps(dict(status='EXPORTED_NATIVE_REGISTRATION_PENDING_VISUAL_AND_RUNTIME',
        baseSha256=sha(base/'manifest.json'), manifestSha256=sha(output/'manifest.json'), frames=receipts,
        alphaAndOwnerData='EXACT_PRESERVED', logicalGeometry='EXACT_PRESERVED', flags='EXACT_PRESERVED'), indent=2)+'\n')
    print(json.dumps(dict(families=2, frames=len(receipts), output=str(output))))


if __name__ == '__main__':
    main()
