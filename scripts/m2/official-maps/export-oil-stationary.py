"""Keep common oil structures fixed and retain R7 material only on native moving parts."""
import copy
import json
import runpy
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from showcase_registration import extrude, independently_sample, sha

rigid_beam = runpy.run_path(str(Path(__file__).with_name('export-oil-motion.py')))['rigid_beam']


def read(file):
    return json.loads(file.read_text())


def walking_beam(indices):
    """Follow the native foreground, rather than rectangular motion regions."""
    y, x = np.indices(indices.shape)
    gold = ((indices >= 96) & (indices <= 143)) | ((indices >= 64) & (indices <= 79))
    candidate = gold & (x >= 5) & (x < 47) & (y < 50)
    connected = ndimage.binary_closing(candidate)
    labels, _ = ndimage.label(connected, structure=np.ones((3, 3)))
    sizes = np.bincount(labels.ravel()); sizes[0] = 0
    assert sizes.max() > 80, 'Native walking beam is missing'
    beam = labels == sizes.argmax()
    holes, _ = ndimage.label(ndimage.binary_fill_holes(beam) & ~beam)
    hole_sizes = np.bincount(holes.ravel()); hole_sizes[0] = 0
    beam |= (holes != 0) & (hole_sizes[holes] <= 8)
    beam &= (indices < 176) & ~((indices >= 16) & (indices <= 31))
    return beam


def moving_parts(indices):
    y, x = np.indices(indices.shape)
    beam = walking_beam(indices)
    # The drive assembly keeps its coherent authored pose. A constant palette cell
    # inside a rotating part is not proof that its material must remain stationary.
    crank = (x >= 34) & (y >= 21) & (y < 54)
    return (beam | crank) & (indices != 0) & (indices != 12)


def main():
    base, output, evidence = map(Path, sys.argv[1:4])
    assert not output.exists() and not evidence.exists()
    guide = Path('.artifacts/m2-3/native-guides-v3')
    source = next(row for row in read(guide/'source.json')['sources'] if row['member'] == 'ctoild_a.shp')
    reference = Path('.local/environment-packs/environment-m2-3-gameplay-feedback-complete-v19')
    assert sha(reference/'manifest.json') == 'cc005ffa9de8c7beed81018540c8bd541b17a3b77f568f977ca28d8f8aa34c2e'
    for frame in source['frames'][:64]:
        assert sha(guide/'native'/frame['indexFile']) == frame['indexSha256']
        assert sha(guide/'native'/frame['file']) == frame['rgbaSha256']
    native = np.stack([np.frombuffer((guide/'native'/frame['indexFile']).read_bytes(), np.uint8)
                       .reshape(69, 61) for frame in source['frames'][:64]])
    master = Path('.artifacts/m2-3/feedback-r8-v1/authoring/gold-beam.png')
    board = Image.open(master).convert('RGBA')
    plates = []
    for pose in range(8):
        left, top = pose%4*384, pose//4*512
        pixels = np.array(board.crop((left, top, left+384, top+512)))
        colors = pixels[..., :3]
        labels, _ = ndimage.label(pixels[..., 3] > 200, structure=np.ones((3, 3)))
        sizes = np.bincount(labels.ravel()); sizes[0] = 0
        valid = labels == sizes.argmax()
        y, x = np.where(valid)
        box = [int(x.min()), int(y.min()), int(x.max()+1), int(y.max()+1)]
        l, t, r, b = box
        plates.append(extrude(colors[t:b, l:r], valid[t:b, l:r]))
    masks, fixed = [], []
    for state in range(2):
        frames = native[state*32:(state+1)*32]
        stable = np.all(frames == frames[0], axis=0)
        y, x = np.indices(stable.shape)
        gray = ((frames[0] >= 32) & (frames[0] <= 79)) | (frames[0] == 15)
        structures = ((x < 24) & (y < 49) & gray) | ((x >= 20) & (x < 31) & (y >= 30)) | (y >= 54)
        protected = stable & structures
        masks.extend(moving_parts(frame) & ~protected for frame in frames)
        fixed.append(stable & (frames[0] != 0) & (frames[0] != 12))
    catalog = read(base/'manifest.json')
    family = copy.deepcopy(catalog['families']['environment-ctoild'])
    output.mkdir(parents=True)
    records = []
    for member in family['members']:
        old = base/member['path']
        assert sha(old) == member['sha256']
        file = output/member['path']
        shutil.copytree(old.parent, file.parent)
        if member['member'] != 'ctoild_a.shp':
            continue
        metadata = read(file)
        canonical_metadata = read(reference/member['path'])
        metadata['packRevision'] = output.name
        metadata.setdefault('authored', {})['r8Stationary'] = dict(
            referenceSha256=sha(reference/member['path']), motionSourceSha256=sha(old),
            masterSha256=sha(master),
            method='Isolated authored walking-beam material; native foreground segmentation; one common composed material per health state',
            fixed='Tower, supports and floor are never rotated or sampled from successive authored poses')
        for variant in metadata['variants']:
            density = variant['density']
            old_variant = next(row for row in canonical_metadata['variants'] if row['density'] == density)
            canonical = []
            beam_materials = []
            for pose in range(8):
                target = walking_beam(native[pose*4])
                y, x = np.where(target)
                l, t, r, b = int(x.min()), int(y.min()), int(x.max()+1), int(y.max()+1)
                colors = np.zeros((69*density, 61*density, 3), np.uint8)
                colors[t*density:b*density, l*density:r*density] = independently_sample(plates[pose], ((r-l)*density, (b-t)*density))
                valid = np.zeros(colors.shape[:2], bool)
                valid[t*density:b*density, l*density:r*density] = True
                beam_materials.append(extrude(colors, valid))
            for state in range(2):
                frame = next(row for row in old_variant['frames'] if row['nativeFrame'] == state*32)
                pixels = np.array(Image.open((reference/member['path']).parent/str(density)/frame['page']/'base.png'))
                x, y, w, h = frame['contentRect']
                colors = pixels[y:y+h, x:x+w, :3]
                valid = (native[state*32] != 0) & (native[state*32] != 12) & ~masks[state*32]
                valid = np.repeat(np.repeat(valid, density, 0), density, 1)
                canonical.append(extrude(colors, valid))
            for page in variant['pages']:
                folder = file.parent/str(density)/page['id']
                pixels = np.array(Image.open(folder/'base.png'))
                before = pixels.copy()
                seen = set()
                for frame in variant['frames']:
                    if frame['page'] != page['id'] or tuple(frame['sampleRect']) in seen:
                        continue
                    seen.add(tuple(frame['sampleRect']))
                    number = frame['nativeFrame']
                    state = number//32
                    active = (native[number] != 0) & (native[number] != 12)
                    stationary = active & ~masks[number]
                    stationary = np.repeat(np.repeat(stationary, density, 0), density, 1)
                    x, y, w, h = frame['contentRect']
                    region = pixels[y:y+h, x:x+w]
                    region[..., :3][stationary] = canonical[state][stationary]
                    pose = ((number%32+2)//4)%8
                    ref_frame = source['frames'][pose*4]
                    target_frame = source['frames'][number]
                    ref_rgba = np.frombuffer((guide/'native'/ref_frame['file']).read_bytes(), np.uint8).reshape(69, 61, 4)
                    target_rgba = np.frombuffer((guide/'native'/target_frame['file']).read_bytes(), np.uint8).reshape(69, 61, 4)
                    material = rigid_beam(beam_materials[pose], ref_rgba, target_rgba, density)
                    beam = walking_beam(native[number]) & masks[number]
                    beam = np.repeat(np.repeat(beam, density, 0), density, 1)
                    region[..., :3][beam] = material[beam]
                    pixels[y-2:y+h+2, x-2:x+w+2, :3] = np.pad(region[..., :3], ((2, 2), (2, 2), (0, 0)), mode='edge')
                    records.append(dict(frame=number, density=density, stationaryPixels=int(stationary.sum()),
                                        movingNativePixels=int(masks[number].sum())))
                assert np.array_equal(before[..., 3], pixels[..., 3])
                pixels[pixels[..., 3] == 0, :3] = 0
                Image.fromarray(pixels).save(folder/'base.png')
                page['baseSha256'], page['baseBytes'] = sha(folder/'base.png'), (folder/'base.png').stat().st_size
        file.write_text(json.dumps(metadata, separators=(',', ':'))+'\n')
        member['sha256'] = sha(file)
    manifest = dict(catalog, revision=output.name, families={'environment-ctoild': family})
    (output/'manifest.json').write_text(json.dumps(manifest, separators=(',', ':'))+'\n')
    evidence.write_text(json.dumps(dict(status='EXPORTED_STATIONARY_OIL_PENDING_INDEPENDENT_AND_NATIVE_REVIEW',
        baseSha256=sha(base/'manifest.json'), referenceSha256=sha(reference/'manifest.json'),
        manifestSha256=sha(output/'manifest.json'), stationaryNativeCells=[int(mask.sum()) for mask in fixed],
        frames=records), indent=2)+'\n')
    print(json.dumps(dict(output=str(output), frames=len(records))))


if __name__ == '__main__':
    main()
