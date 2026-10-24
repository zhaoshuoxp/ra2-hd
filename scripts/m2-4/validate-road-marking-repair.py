"""Independently check exported road atlases against every baseline frame."""
import argparse
import copy
import hashlib
import json
from pathlib import Path

import numpy as np

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('export', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
sha = lambda data: hashlib.sha256(data).hexdigest()
root = Path('.local/terrain-packs')
results = []
for exported in json.loads(args.export.read_text()):
    theater = exported['theater']
    manifests = []
    for pointer in [exported['baseline'], exported['candidate']]:
        encoded = (root / pointer['revision'] / 'manifest.json').read_bytes()
        assert sha(encoded) == pointer['sha256']
        manifests.append(json.loads(encoded))
    baseline, candidate = manifests
    original_shape, new_shape = copy.deepcopy(baseline), copy.deepcopy(candidate)
    for manifest in [original_shape, new_shape]:
        manifest.pop('revision')
        for group in manifest['groups']:
            for variant in group['variants']:
                variant.pop('sha256')
    assert original_shape == new_shape, f'{theater}: Native metadata or atlas layout changed'
    updates = {(member['member'], frame['slot'], frame['density']): frame['rgbaSha256']
        for member in exported['members'] for frame in member['frames']}
    allowed = {'proad03', 'proadc13', 'proadc14'}
    if theater in ['urban', 'newurban']:
        allowed.update({'proad04', 'proad05', 'proad06', 'proad07', 'proad08', 'proad09',
            'prslpe01', 'prslpe02', 'rough01', 'rough02', 'rough03', 'rough06'})
    if theater == 'urban':
        allowed.add('proad14')
    assert all(member.split('.')[0] in allowed for member, _, _ in updates)
    if theater == 'snow':
        assert exported['baseline'] == exported['candidate'] and not updates
    frames = changed_frames = preserved_frames = files = changed_files = 0
    crop_field_frames = empty_frames = 0
    for old_group, new_group in zip(baseline['groups'], candidate['groups'], strict=True):
        for old_variant, new_variant in zip(old_group['variants'], new_group['variants'], strict=True):
            images = []
            for pointer, variant in [(exported['baseline'], old_variant), (exported['candidate'], new_variant)]:
                file = root / pointer['revision'] / variant['file']
                assert sha(file.read_bytes()) == variant['sha256'], file
                width, height = variant['size']
                assert file.stat().st_size == width * height * 4
                images.append(np.memmap(file, dtype=np.uint8, mode='r', shape=(height, width, 4)))
            files += 1
            changed_files += old_variant['sha256'] != new_variant['sha256']
            index = 0
            for member in old_group['members']:
                for slot, metadata in enumerate(member['images']):
                    x, y, width, height = old_variant['rects'][index]
                    old, new = [image[y:y + height, x:x + width] for image in images]
                    density = new_variant['density']
                    assert [width, height] == [value * density for value in metadata['logical']]
                    np.testing.assert_array_equal(old[..., 3], new[..., 3])
                    key = member['member'], slot, density
                    if key in updates:
                        assert sha(new.tobytes()) == updates[key], key
                        assert np.any(new != old), key
                        changed_frames += 1
                    else:
                        np.testing.assert_array_equal(old, new)
                        preserved_frames += 1
                        if member['member'].startswith('rough') and theater not in ['urban', 'newurban']:
                            crop_field_frames += 1
                    empty_frames += not old[..., 3].any()
                    frames += 1
                    index += 1
            assert index == len(old_variant['rects'])
            del images
    assert changed_frames == len(updates)
    results.append(dict(theater=theater, baseline=exported['baseline'], candidate=exported['candidate'],
        atlasFiles=files, changedFiles=changed_files, frames=frames, changedFrames=changed_frames,
        preservedFrames=preserved_frames, preservedCropFieldFrames=crop_field_frames,
        emptyFrames=empty_frames, nativeMetadata='EXACT', alpha='EXACT', atlasLayout='EXACT', status='PASS'))
args.output.write_text(json.dumps(dict(status='PASS', theaters=results), indent=2) + '\n')
for result in results:
    print(json.dumps(result))
