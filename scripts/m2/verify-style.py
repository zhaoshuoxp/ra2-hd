"""Validate the selected style export against native masks and retained roads."""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

root = Path('.artifacts/m2-1/authoring-v7')
pointer = json.loads(Path('.local/terrain-selection.json').read_text())
pack = Path('.local/terrain-packs') / pointer['revision']
manifest_bytes = (pack / 'manifest.json').read_bytes()
assert hashlib.sha256(manifest_bytes).hexdigest() == pointer['sha256']
manifest = json.loads(manifest_bytes)
sources = json.loads((root / 'export-input.json').read_text())['groups']
native_root = Path('.artifacts/m2-1/inventory/native')
checks = []
for group, source in zip(manifest['groups'], sources):
    assert group['id'] == source['id']
    for variant in group['variants']:
        raw = (pack / variant['file']).read_bytes()
        assert hashlib.sha256(raw).hexdigest() == variant['sha256']
        atlas = Image.frombytes('RGBA', tuple(variant['size']), raw)
        index = 0
        for member in source['members']:
            for image in member['images']:
                native = Image.frombytes('RGBA', tuple(image['logical']),
                    (native_root / f"{member['nativeName']}-{image['subTile']}.rgba").read_bytes())
                x, y, w, h = variant['rects'][index]
                actual = np.asarray(atlas.crop((x, y, x + w, y + h)))
                expected = np.asarray(native.resize((w, h), Image.Resampling.NEAREST))
                assert np.array_equal(actual[:, :, 3], expected[:, :, 3])
                if member['nativeOffsets'][image['subTile']] <= 0:
                    covered = expected[:, :, 3] > 0
                    assert np.array_equal(actual[covered], expected[covered])
                checks.append([member['member'], image['subTile'], variant['density']])
                index += 1
        assert index == len(variant['rects'])
old_root = Path('.local/terrain-packs/temperate-m2-1-representative-v4')
old = json.loads((old_root / 'manifest.json').read_text())
road = next(g for g in manifest['groups'] if g['id'] == 'road-representative')
retained = next(g for g in old['groups'] if g['id'] == road['id'])
assert road == retained
for variant in road['variants']:
    assert (pack / variant['file']).read_bytes() == (old_root / variant['file']).read_bytes()
assert len(checks) == 352
result = dict(status='PASS', pointer=pointer, nativeAlphaImageDensityPairs=len(checks),
              nativePlaceholderPixels='EXACT', retainedV4Roads='EXACT_BYTES_AND_METADATA',
              artDirection='PENDING_ACTUAL_RUNTIME_AND_USER_REVIEW')
(root / pointer['revision'] / 'validation.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
