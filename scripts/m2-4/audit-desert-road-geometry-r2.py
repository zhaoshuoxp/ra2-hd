"""Verify road alpha, native metadata, sample gutters and unaffected payloads."""
import hashlib
import json
from pathlib import Path
import numpy as np

root = Path('.artifacts/m2-4/desert-road-geometry-r2-20261019')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
receipt = read(root/'export-and-preservation-v5.json')
old_root = Path('.local/terrain-packs')/receipt['baseline']['revision']
new_root = Path('.local/terrain-packs')/receipt['candidate']['revision']
old, new = read(old_root/'manifest.json'), read(new_root/'manifest.json')
assert sha(new_root/'manifest.json') == receipt['candidate']['sha256']
assert read(Path('.local/terrain-desert-selection.json')) == receipt['candidate']
alpha_rects = exact_rects = exact_files = 0
for old_group, new_group in zip(old['groups'], new['groups'], strict=True):
    assert old_group['members'] == new_group['members']
    for before, after in zip(old_group['variants'], new_group['variants'], strict=True):
        assert before['rects'] == after['rects'] and before['size'] == after['size']
        assert sha(new_root/after['file']) == after['sha256']
        if old_group['id'] not in receipt['changedGroups']:
            assert sha(old_root/before['file']) == sha(new_root/after['file'])
            exact_files += 1
            continue
        old_pixels = np.fromfile(old_root/before['file'], np.uint8).reshape(*reversed(before['size']), 4)
        new_pixels = np.fromfile(new_root/after['file'], np.uint8).reshape(old_pixels.shape)
        for x, y, w, h in before['rects']:
            a, b = old_pixels[y:y+h, x:x+w], new_pixels[y:y+h, x:x+w]
            np.testing.assert_array_equal(a[..., 3], b[..., 3])
            alpha_rects += 1
            exact_rects += int(np.array_equal(a, b))
            np.testing.assert_array_equal(new_pixels[y-2:y+h+2, x-2:x+w+2],
                np.pad(b, ((2, 2), (2, 2), (0, 0)), mode='edge'))
assert alpha_rects == 392 and exact_files == 38
result = dict(status='PASS_STATIC_NATIVE_METADATA_ALPHA_GUTTERS_AND_UNAFFECTED_PAYLOADS',
    candidate=receipt['candidate'], exactAlphaRects=alpha_rects,
    exactUnchangedBodyRects=exact_rects, otherPayloadFilesExact=exact_files,
    sourceMapsModified=False, visualAcceptance='PENDING', windows='NOT_RUN', m24Complete=False)
(root/'independent-static-audit-v5.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps(result))
