"""Register crisp pump poses without palette-index displacement of stationary art."""
import copy
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from showcase_registration import extrude, independently_sample, sha
from showcase_owner import register_owner_material


def read(file):
    return json.loads(file.read_text())


def beam_axis(rgba):
    y, x = np.indices(rgba.shape[:2])
    rgb = rgba[..., :3].astype(float)
    gold = (rgb[..., 0] > rgb[..., 2] * 1.4) & (rgb[..., 1] > rgb[..., 2] * 1.2)
    mask = gold & (rgb[..., 0] > 60) & (x >= 18) & (y < 29)
    points = np.column_stack(np.where(mask)[::-1])
    assert len(points) >= 20
    center = points.mean(axis=0)
    _, _, vectors = np.linalg.svd(points-center, full_matrices=False)
    axis = vectors[0] * (1 if vectors[0, 0] > 0 else -1)
    return center, np.arctan2(axis[1], axis[0])


def rigid_beam(rgb, reference, target, density):
    """Rotate one authored pose; never smear material using individual palette cells."""
    origin, angle = beam_axis(reference)
    center, target_angle = beam_axis(target)
    delta = angle-target_angle
    rotation = np.array([[np.cos(delta), -np.sin(delta)], [np.sin(delta), np.cos(delta)]])
    y, x = np.indices(rgb.shape[:2])
    points = np.stack([(x+.5)/density-.5, (y+.5)/density-.5], axis=-1)
    source = (points-center) @ rotation.T + origin
    coords = np.stack([(source[..., 1]+.5)*density-.5, (source[..., 0]+.5)*density-.5])
    moved = np.stack([ndimage.map_coordinates(rgb[..., c], coords, order=3, mode='nearest')
                      for c in range(3)], axis=-1)
    return np.uint8(np.clip(np.rint(moved), 0, 255))


def main():
    base, output, evidence = map(Path, sys.argv[1:4])
    assert not output.exists() and not evidence.exists()
    guide = Path('.artifacts/m2-3/native-guides-v3')
    source = next(row for row in read(guide/'source.json')['sources'] if row['member'] == 'ctoild_a.shp')
    board_file = Path('.artifacts/m2-3/feedback-r7-v1/authoring/oil-motion-normal.png')
    board = Image.open(board_file).convert('RGB')
    assert board.size == (1536, 1024)
    plates = []
    crops = []
    for pose in range(8):
        left, top = pose % 4 * 384, pose // 4 * 512
        cell = np.array(board.crop((left, top, left+384, top+512)))
        mask = cell.max(axis=2) > 24
        labels, _ = ndimage.label(mask)
        sizes = np.bincount(labels.ravel()); sizes[0] = 0
        mask = labels == sizes.argmax()
        y, x = np.where(mask)
        rect = [int(x.min()), int(y.min()), int(x.max()+1), int(y.max()+1)]
        l, t, r, b = rect
        plates.append(extrude(cell[t:b, l:r], mask[t:b, l:r]))
        crops.append([left+l, top+t, r-l, b-t])
    catalog = read(base/'manifest.json')
    family = copy.deepcopy(catalog['families']['environment-ctoild'])
    output.mkdir(parents=True)
    records = []
    for entry in family['members']:
        original = base/entry['path']
        assert sha(original) == entry['sha256']
        file = output/entry['path']
        shutil.copytree(original.parent, file.parent)
        if entry['member'] != 'ctoild_a.shp':
            continue
        metadata = read(file)
        metadata['packRevision'] = output.name
        metadata.setdefault('authored', {})['r7Motion'] = dict(masterSha256=sha(board_file), crops=crops,
            method='Eight authored native key poses; bounded rigid beam rotation; no palette displacement or temporal crossfade',
            stationary='Accepted body and flag exact; animation support uses stable R6 canonical state material',
            native='Original frame geometry, alpha, owner data, masks, timing and shadows retained')
        for variant in metadata['variants']:
            density = variant['density']
            sampled = [independently_sample(plate, (61*density, 69*density)) for plate in plates]
            canonical = []
            for number in (0, 32):
                entry_frame = next(value for value in variant['frames'] if value['nativeFrame'] == number)
                image_file = original.parent/str(density)/entry_frame['page']/'base.png'
                x, y, w, h = entry_frame['contentRect']
                colors = np.array(Image.open(image_file).convert('RGBA'))[y:y+h, x:x+w, :3]
                native = source['frames'][number]
                indices = np.frombuffer((guide/'native'/native['indexFile']).read_bytes(), np.uint8).reshape(69, 61)
                valid = np.repeat(np.repeat((indices != 0) & (indices != 12), density, 0), density, 1)
                canonical.append(extrude(colors, valid))
            for page in variant['pages']:
                folder = file.parent/str(density)/page['id']
                pixels = np.array(Image.open(folder/'base.png').convert('RGBA'))
                before = pixels.copy()
                seen = set()
                for frame in variant['frames']:
                    if frame['page'] != page['id'] or tuple(frame['sampleRect']) in seen:
                        continue
                    seen.add(tuple(frame['sampleRect']))
                    number = frame['nativeFrame']
                    native = source['frames'][number]
                    assert native['origin'] == [75, 37] and native['size'] == [61, 69]
                    phase = number % 32
                    pose = ((phase+2)//4) % 8
                    reference = source['frames'][number//32*32+pose*4]
                    rgba = np.array(Image.frombytes('RGBA', (61, 69), (guide/'native'/native['file']).read_bytes()))
                    ref = np.array(Image.frombytes('RGBA', (61, 69), (guide/'native'/reference['file']).read_bytes()))
                    indices = np.frombuffer((guide/'native'/native['indexFile']).read_bytes(), np.uint8).reshape(69, 61)
                    rgb = sampled[pose].copy()
                    rotated = rigid_beam(rgb, ref, rgba, density)
                    yy, xx = np.indices((69*density, 61*density))
                    beam = (xx >= 5*density) & ((yy < 30*density) | ((xx < 24*density) & (yy < 53*density)))
                    crank = (xx >= 34*density) & (yy >= 21*density) & (yy < 57*density)
                    rgb[beam] = rotated[beam]
                    rgb = register_owner_material(rgb, rgba, indices, density)[0]
                    active = np.repeat(np.repeat((indices != 0) & (indices != 12), density, 0), density, 1)
                    rgb = extrude(rgb, active)
                    changed = (beam | crank) & active
                    x, y, w, h = frame['contentRect']
                    region = pixels[y:y+h, x:x+w]
                    assert region.shape[:2] == changed.shape
                    region[..., :3][active] = canonical[number//32][active]
                    region[..., :3][changed] = rgb[changed]
                    pixels[y-2:y+h+2, x-2:x+w+2, :3] = np.pad(region[..., :3], ((2, 2), (2, 2), (0, 0)), mode='edge')
                    records.append(dict(frame=number, density=density, pose=pose, nativeIndexSha256=native['indexSha256'],
                        motionRgbPixels=int(changed.sum())))
                assert np.array_equal(pixels[..., 3], before[..., 3])
                pixels[pixels[..., 3] == 0, :3] = 0
                Image.fromarray(pixels).save(folder/'base.png')
                page['baseSha256'] = sha(folder/'base.png')
                page['baseBytes'] = (folder/'base.png').stat().st_size
        file.write_text(json.dumps(metadata, separators=(',', ':'))+'\n')
        entry['sha256'] = sha(file)
    manifest = dict(catalog, revision=output.name, families={'environment-ctoild': family})
    (output/'manifest.json').write_text(json.dumps(manifest, separators=(',', ':'))+'\n')
    evidence.write_text(json.dumps(dict(status='EXPORTED_OIL_MOTION_PENDING_NATIVE_VISUAL_REVIEW',
        baseSha256=sha(base/'manifest.json'), masterSha256=sha(board_file), crops=crops,
        manifestSha256=sha(output/'manifest.json'), frames=records), indent=2)+'\n')
    print(json.dumps(dict(output=str(output), frames=len(records))))


if __name__ == '__main__':
    main()
