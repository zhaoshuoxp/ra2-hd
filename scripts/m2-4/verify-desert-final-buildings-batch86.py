"""Check actual atlas reuse and airport temporal invariants, including rejecting wrong reuse scope."""
import copy
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path('scripts/m2').resolve()))
from showcase_body_reuse import accepted_body_frames

ROOT = Path('.artifacts/m2-4/desert-final-buildings-native-batch86-v1')
ART = Path('.artifacts/m2-4/desert-final-buildings-authoring-batch86-v1')
PACK = Path('.local/environment-packs/desert-m2-4-final-buildings-batch86-v2')
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
profile = read(ART / 'material-profile-v2.json')
sources = {row['member']: row for row in read(ROOT / 'source.json')['sources']}
manifest = read(PACK / 'manifest.json')
entries = {member['member']: member for family in manifest['families'].values() for member in family['members']}
reused = accepted_body_frames(profile, sources)
rejections = []
for case, mutate in [
    ('different-house-occupied-state-cannot-be-reused', lambda value: value['acceptedNativeBodyFrames']['cdhse06.shp'].update(slots=[0, 1, 2])),
    ('single-frame-body-cannot-pretend-to-be-animation', lambda value: value['acceptedNativeBodyFrames']['cgpark06.shp'].update(completeOriginalAnimation=True)),
    ('unverified-source-cannot-reuse-house-states', lambda value: value['acceptedNativeBodyFrames']['cdhse06.shp'].update(sourceSha256='0' * 64)),
    ('changed-proof-cannot-reuse-any-state', lambda value: value['acceptedNativeBodyFrames']['cdhse06.shp'].update(proofSha256='0' * 64)),
]:
    changed = copy.deepcopy(profile)
    mutate(changed)
    try:
        accepted_body_frames(changed, sources)
    except AssertionError:
        rejections.append(case)
    else:
        raise AssertionError(case)


def atlas(name, number, density):
    file = PACK / entries[name]['path']
    metadata = read(file)
    variant, = [item for item in metadata['variants'] if item['density'] == density]
    frame, = [item for item in variant['frames'] if item['nativeFrame'] == number]
    x, y, width, height = frame['sampleRect']
    images = []
    for role in ['base', 'data']:
        page = file.parent / str(density) / frame['page'] / (role + '.png')
        images.append(np.asarray(Image.open(page).convert('RGBA').crop((x, y, x + width, y + height))).copy())
    return images


def canvas(name, number, density):
    base, data = atlas(name, number, density)
    frame = sources[name]['frames'][number]
    x, y = [value * density for value in frame['origin']]
    width, height = [value * density for value in frame['size']]
    result = []
    for image in [base, data]:
        output = np.zeros((186 * density, 188 * density, 4), np.uint8)
        output[y:y + height, x:x + width] = image[:height, :width]
        result.append(output)
    return result


indices = []
for frame in sources['cdairp_a.shp']['frames'][:10]:
    original = np.zeros((186, 188), np.uint8)
    x, y = frame['origin']
    width, height = frame['size']
    original[y:y + height, x:x + width] = np.fromfile(ROOT / 'native' / frame['indexFile'], np.uint8).reshape(height, width)
    indices.append(original)
pedestal = (indices[0] != 0) & (indices[0] != 12)
pedestal[75:] = False
for frame in indices[1:]:
    pedestal &= frame == indices[0]
paving = (indices[0] != 0) & (indices[0] != 12)
paving[:100] = False
palette = np.fromfile(ROOT / 'native' / (sources['cdairp_a.shp']['palette']['sha256'] + '.pal'), np.uint8)
palette = palette.reshape(256, 3).astype(float) * 4
checks = []
for density in [2, 4]:
    for name, frames in reused.items():
        for (number, scale), expected in frames.items():
            if scale == density:
                assert all(np.array_equal(actual, donor) for actual, donor in zip(atlas(name, number, density), expected))
    frames = [canvas('cdairp_a.shp', number, density) for number in range(10)]
    fixed = np.repeat(np.repeat(pedestal, density, 0), density, 1)
    for base, data in frames:
        fixed &= (base[..., 3] == 255) & (data[..., 0] == 0)
    assert fixed.sum() > 20 * density ** 2
    for base, _ in frames[1:]:
        assert np.array_equal(base[..., :3][fixed], frames[0][0][..., :3][fixed])
    body, body_data = canvas('cdairp.shp', 0, density)
    base, data = frames[0]
    overlap = np.repeat(np.repeat(paving, density, 0), density, 1)
    overlap &= (base[..., 3] == 255) & (body[..., 3] == 255)
    overlap &= (data[..., 0] == 0) & (body_data[..., 0] == 0)
    overlap = ndimage.binary_erosion(overlap, iterations=density)
    assert overlap.sum() > 500 * density ** 2
    assert np.array_equal(body[..., :3][overlap], base[..., :3][overlap])
    common = np.repeat(np.repeat(paving, density, 0), density, 1)
    for base, data in frames:
        common &= (base[..., 3] == 255) & (data[..., 0] == 0)
    common = ndimage.binary_erosion(common, iterations=2 * density)
    assert common.sum() > 400 * density ** 2
    maximum_error = 0
    for number, (base, _) in enumerate(frames):
        valid = paving & (indices[number] != 0) & (indices[number] != 12)
        native_delta = (palette[indices[number]] - palette[indices[0]]) * valid[..., None]
        weights = ndimage.gaussian_filter(valid.astype(float), 1.25)
        light = ndimage.gaussian_filter(native_delta, (1.25, 1.25, 0)) / np.maximum(weights[..., None], .001)
        light[weights < .001] = 0
        light = np.stack([np.asarray(Image.fromarray(light[..., channel].astype(np.float32)).resize(
            (188 * density, 186 * density), Image.Resampling.BICUBIC)) for channel in range(3)], axis=-1)
        expected = np.clip(frames[0][0][..., :3].astype(float) + light, 0, 255)
        error = np.abs(base[..., :3].astype(float) - expected)
        maximum_error = max(maximum_error, float(error[common].max()))
    assert maximum_error <= 1.01, maximum_error
    checks.append(dict(density=density, fixedPedestalPixels=int(fixed.sum()),
        identicalBodyAndActivePavingPixels=int(overlap.sum()), stationaryPavingPixels=int(common.sum()),
        maximumIlluminationOnlyRgbError=maximum_error,
        bodyReuse='EXACT_DENSITY_SPECIFIC_ACCEPTED_BASE_AND_DATA',
        paving='ONE_FIXED_NEW_MATERIAL_WITH_ONLY_SMOOTH_NATIVE_PHASE_LIGHTING',
        clock='UNCHANGED_ORIGINAL_LOOP_START_0_END_9_RATE_50_AND_FLAG_16_PHASES'))
result = dict(status='PASS_ACCEPTED_REUSE_AND_NATIVE_AIRPORT_TEMPORAL_INVARIANTS',
    candidate=dict(revision=manifest['revision'], sha256=sha(PACK / 'manifest.json')),
    reusedDensityFrames=38, sourceBodySlots=49, densityFrames=98, rejectionCases=rejections,
    checks=checks, nativeRuntime='PENDING', userVisualAcceptance='PENDING', windows='NOT_RUN')
with (ART / 'temporal-and-reuse-verification-v1.json').open('x') as stream:
    stream.write(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
