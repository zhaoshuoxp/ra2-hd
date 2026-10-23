"""Remove only baked stationary beam material from the user's R8 visual baseline."""
import copy
import json
import runpy
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from showcase_registration import extrude, independently_sample, register, sha

stationary = runpy.run_path(str(Path(__file__).with_name('export-oil-stationary.py')))
canvas = runpy.run_path(str(Path(__file__).with_name('export-gameplay-components.py')))['canvas']


def read(file):
    return json.loads(file.read_text())


def moving_masks(native):
    masks = []
    for state in range(2):
        frames = native[state*32:(state+1)*32]
        stable = np.all(frames == frames[0], axis=0)
        y, x = np.indices(stable.shape)
        gray = ((frames[0] >= 32) & (frames[0] <= 79)) | (frames[0] == 15)
        structures = ((x < 24) & (y < 49) & gray) | ((x >= 20) & (x < 31) & (y >= 30)) | (y >= 54)
        protected = stable & structures
        masks.extend(stationary['moving_parts'](frame) & ~protected for frame in frames)
    return np.stack(masks)


def visible_foregrounds():
    """Protect all Original beam faces, including bevels R8 classified as background."""
    file = Path('.artifacts/m2-3/feedback-r11-v1/oil-export-v7.json')
    assert sha(file) == 'c344e616ade4ea1bb89cc854d91cae68db70c75bcbf70e5b72135a07e07d89af'
    receipt = read(file)
    rows = {row['frame']: row for row in receipt['frames'] if row['density'] == 4}
    return np.stack([np.array(rows[n]['foreground'], bool) for n in range(64)])


def beam_footprints(image):
    """Bound the authored beam/head, excluding drive cranks, ladder and thin rod."""
    polygons = [
        [(627, 294), (650, 297), (671, 327), (807, 251), (829, 242), (843, 245),
         (858, 258), (865, 273), (865, 305), (850, 307), (834, 290), (784, 319),
         (784, 350), (764, 354), (753, 340), (675, 382), (659, 441), (650, 445),
         (631, 433), (620, 419), (615, 382), (617, 340)],
        [(650, 852), (665, 854), (682, 879), (839, 810), (856, 805), (870, 811),
         (881, 825), (883, 846), (881, 874), (866, 877), (852, 856), (800, 884),
         (802, 914), (786, 921), (779, 907), (682, 950), (670, 1019), (662, 1027),
         (649, 1013), (638, 991), (635, 943), (638, 891)],
    ]
    assert image.size == (1254, 1254), 'Coordinates refer to the immutable authored master'
    colors = np.asarray(image).astype(float)
    warm = (colors[..., 0] > colors[..., 2]*1.15+5) & (colors[..., 1] > colors[..., 2]*1.05+5)
    result = []
    for polygon in polygons:
        area = Image.new('L', image.size)
        ImageDraw.Draw(area).polygon(polygon, fill=255)
        candidate = warm & (np.array(area) > 0) & (colors[..., 3] > 180)
        labels, _ = ndimage.label(ndimage.binary_closing(candidate, iterations=3), structure=np.ones((3, 3)))
        sizes = np.bincount(labels.ravel()); sizes[0] = 0
        mask = ndimage.binary_fill_holes(labels == sizes.argmax())
        # Include the original beam's dark outline and antialiased sampling fringe.
        mask = ndimage.binary_dilation(mask, iterations=3)
        result.append(mask)
    return result


def background(density, sources, native, moving):
    guide = Path('.artifacts/m2-3/native-guides-v3')
    original_file = Path('.artifacts/m2-3/feedback-r6-v1/authoring/oil-master.png')
    donor_file = Path('.artifacts/m2-3/feedback-r12-v1/authoring/beam-removed.png')
    assert sha(original_file) == '89444f2328fe86a25542db3bc649942e0e618965a67b62bcee2fc591dce39e72'
    assert sha(donor_file) == 'ca2da854fced1438e4dfba197c0e6dea0a6d8730a521de1fbaf3342765298bf0'
    original, donor = [Image.open(file).convert('RGBA') for file in (original_file, donor_file)]
    assert original.size == donor.size
    source_masks = beam_footprints(original)
    result, registrations = [], []
    for state in range(2):
        body = canvas(sources['ctoild.shp'], state, guide)
        active = canvas(sources['ctoild_a.shp'], state*32, guide)
        composed = np.where((active != 0) & (active != 12), active, body)
        y, x = np.where((composed != 0) & (composed != 12))
        l, t, r, b = int(x.min()), int(y.min()), int(x.max()+1), int(y.max()+1)
        crop, _ = register(original, dict(slotRect=[0, state*768, 1536, 768]), [1536, 1536])
        sx, sy, sw, sh = crop
        pixels = np.array(donor.crop((sx, sy, sx+sw, sy+sh)))
        colors = extrude(pixels[..., :3], pixels[..., 3] > 180)
        full = np.zeros((122*density, 166*density, 3), np.uint8)
        full[t*density:b*density, l*density:r*density] = independently_sample(colors, ((r-l)*density, (b-t)*density))
        source_mask = np.uint8(source_masks[state][sy:sy+sh, sx:sx+sw])*255
        mask = np.zeros(full.shape[:2], bool)
        sampled = np.array(Image.fromarray(source_mask).resize(((r-l)*density, (b-t)*density), Image.Resampling.LANCZOS))
        mask[t*density:b*density, l*density:r*density] = sampled > 8
        colors, mask = full[37*density:106*density, 75*density:136*density], mask[37*density:106*density, 75*density:136*density]
        # R8 extrudes a frame-zero stationary canvas. Propagate its footprint through
        # that exact nearest-valid mapping instead of using a new authored crop.
        valid = (native[state*32] != 0) & (native[state*32] != 12) & ~moving[state*32]
        valid = np.repeat(np.repeat(valid, density, 0), density, 1)
        nearest = ndimage.distance_transform_edt(~valid, return_distances=False, return_indices=True)
        colors = extrude(colors, valid)
        mask[~valid] = mask[tuple(nearest[:, ~valid])]
        result.append((colors, mask))
        registrations.append(dict(state=state, sourceCrop=crop, nativeBounds=[l, t, r, b],
                                  stationaryFootprintPixels=int(mask.sum())))
    return result, registrations


def main():
    base, output, evidence = map(Path, sys.argv[1:4])
    assert not output.exists() and not evidence.exists()
    assert sha(base/'manifest.json') == '7c51c9dc0f93015afeda9c17641e5c1063695db760c299395c316fb167433fe9'
    guide = Path('.artifacts/m2-3/native-guides-v3')
    sources = {row['member']: row for row in read(guide/'source.json')['sources']}
    for frame in sources['ctoild_a.shp']['frames'][:64]:
        assert sha(guide/'native'/frame['indexFile']) == frame['indexSha256']
    native = np.stack([np.frombuffer((guide/'native'/f['indexFile']).read_bytes(), np.uint8).reshape(69, 61)
                       for f in sources['ctoild_a.shp']['frames'][:64]])
    moving = moving_masks(native)
    foreground = visible_foregrounds()
    catalog = read(base/'manifest.json')
    family = copy.deepcopy(catalog['families']['environment-ctoild'])
    output.mkdir(parents=True)
    records, registrations = [], []
    for member in family['members']:
        old, file = base/member['path'], output/member['path']
        assert sha(old) == member['sha256']
        shutil.copytree(old.parent, file.parent)
        if member['member'] != 'ctoild_a.shp':
            continue
        metadata = read(file)
        metadata['packRevision'] = output.name
        metadata.setdefault('authored', {})['r12StaticBeamRemoval'] = dict(
            baselineSha256=sha(old), donorSha256=sha(Path('.artifacts/m2-3/feedback-r12-v1/authoring/beam-removed.png')),
            method='Replace only the baked beam footprint in R8 stationary RGB; moving R8 beam and drive are byte-exact',
            geometry='R8 body, flag, native alpha/data, atlas registration and animation timing remain exact')
        for variant in metadata['variants']:
            density = variant['density']
            backgrounds, rows = background(density, sources, native, moving)
            registrations.append(dict(density=density, states=rows))
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
                    colors, footprint = backgrounds[number//32]
                    eligible = (native[number] != 0) & (native[number] != 12) & ~moving[number] & ~foreground[number]
                    eligible = np.repeat(np.repeat(eligible, density, 0), density, 1) & footprint
                    x, y, w, h = frame['contentRect']
                    region = pixels[y:y+h, x:x+w]
                    old_region = region.copy()
                    region[..., :3][eligible] = colors[eligible]
                    assert np.array_equal(region[~eligible], old_region[~eligible])
                    pixels[y-2:y+h+2, x-2:x+w+2, :3] = np.pad(region[..., :3], ((2, 2), (2, 2), (0, 0)), mode='edge')
                    records.append(dict(density=density, frame=number, changedRgbPixels=int(np.any(region[..., :3] != old_region[..., :3], axis=-1).sum()),
                                        movingRgbChanges=0, eligibleStationaryPixels=int(eligible.sum())))
                assert np.array_equal(before[..., 3], pixels[..., 3])
                pixels[pixels[..., 3] == 0, :3] = 0
                Image.fromarray(pixels).save(folder/'base.png')
                page['baseSha256'], page['baseBytes'] = sha(folder/'base.png'), (folder/'base.png').stat().st_size
        file.write_text(json.dumps(metadata, separators=(',', ':'))+'\n')
        member['sha256'] = sha(file)
    manifest = dict(catalog, revision=output.name, families={'environment-ctoild': family})
    (output/'manifest.json').write_text(json.dumps(manifest, separators=(',', ':'))+'\n')
    evidence.write_text(json.dumps(dict(status='EXPORTED_MINIMAL_STATIONARY_BEAM_REMOVAL_PENDING_REVIEW',
        baseline=str(base), baselineSha256=sha(base/'manifest.json'), manifestSha256=sha(output/'manifest.json'),
        sourceSize=[1254, 1254], registrations=registrations, frames=records), indent=2)+'\n')
    print(json.dumps(dict(output=str(output), frames=len(records), changedRgbPixels=sum(r['changedRgbPixels'] for r in records))))


if __name__ == '__main__':
    main()
