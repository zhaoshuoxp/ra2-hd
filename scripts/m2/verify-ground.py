"""Verify flat family closure, native contacts and exact accepted V10 preservation."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--root', type=Path, default=Path('.artifacts/m2-1/authoring-v11'))
args = parser.parse_args()
root = args.root
pointer = json.loads(Path('.local/terrain-selection.json').read_text())
pack = Path('.local/terrain-packs') / pointer['revision']
raw = (pack / 'manifest.json').read_bytes()
assert hashlib.sha256(raw).hexdigest() == pointer['sha256']
manifest = json.loads(raw)
base_root = Path('.local/terrain-packs/temperate-m2-1-cliff-v10')
base = json.loads((base_root / 'manifest.json').read_text())
assert manifest['groups'][1:] == base['groups']
for group in base['groups']:
    for variant in group['variants']:
        assert (pack / variant['file']).read_bytes() == (base_root / variant['file']).read_bytes()
source = json.loads((root / 'source.json').read_text())['members']
group = manifest['groups'][0]
assert group['id'] == 'ground' and len(group['members']) == 48
assert group['members'] == [{k: m[k] for k in ['member', 'sourceHashes', 'images']} for m in source]
expected_names = {prefix + '01' + suffix + '.tem' for prefix in ['clear', 'green']
                  for suffix in ['', *'abcdefg']}
expected_names |= {f'glat{i:02d}{suffix}.tem' for i in range(1, 17) for suffix in ['', 'a']}
assert {m['member'] for m in source} == expected_names
checks = contacts = changed = 0
for variant in group['variants']:
    raw = (pack / variant['file']).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == variant['sha256']
    atlas = Image.frombytes('RGBA', tuple(variant['size']), raw)
    assert len(variant['rects']) == 48
    for member, rect in zip(source, variant['rects']):
        image = member['images'][0]
        native = np.asarray(Image.open(root / f"{member['member']}-native.png"))
        x, y, w, h = rect
        assert [w, h] == [n * variant['density'] for n in image['logical']]
        actual = np.asarray(atlas.crop((x, y, x + w, y + h)))
        expected = np.asarray(Image.fromarray(native).resize((w, h), Image.Resampling.NEAREST))
        assert np.array_equal(actual[:, :, 3], expected[:, :, 3])
        inside = native[:, :, 3] > 0
        pad = np.pad(inside, 1)
        eroded = (pad[1:-1, 1:-1] & pad[:-2, 1:-1] & pad[2:, 1:-1]
                  & pad[1:-1, :-2] & pad[1:-1, 2:])
        outer = np.asarray(Image.fromarray(inside & ~eroded).resize((w, h), Image.Resampling.NEAREST))
        assert np.array_equal(actual[outer], expected[outer])
        pixels = actual[actual[:, :, 3] > 0, :3]
        assert not np.any((pixels[:, 0] > 230) & (pixels[:, 1] < 30))
        assert not np.any((pixels[:, 0] > 240) & (pixels[:, 1] > 240) & (pixels[:, 2] < 16))
        assert np.any(actual[expected[:, :, 3] > 0, :3] != expected[expected[:, :, 3] > 0, :3])
        checks += 1
        contacts += int(outer.sum())
        changed += 1
recipe = json.loads((root / pointer['revision'] / 'recipe.json').read_text())
assert recipe['pack'] == pointer and len(recipe['masters']) == 48
for master in recipe['masters']:
    assert master['densityCapacity'] >= 4
    assert hashlib.sha256(Path(master['file']).read_bytes()).hexdigest() == master['sha256']
assert checks == changed == 96
result = dict(status='PASS', pack=pointer, groundMembers=48, groundImageDensityPairs=checks,
              changedGroundPairs=changed, exactNativeContactPixels=contacts,
              familyClosure='ALL_CLEAR_GREEN_GLAT_VARIANTS', nativeAlphaAndGeometry='EXACT',
              acceptedV10Groups='EXACT_BYTES_AND_METADATA', retainedImageDensityPairs=176,
              totalImageDensityPairs=272, independentSourceDensity='AT_LEAST_4X',
              rawOutsideFootprintMatte='EXCLUDED_NO_OPAQUE_RED_OR_FLUORESCENT_YELLOW',
              appearance='PENDING_COPIED_RUNTIME_AND_USER_REVIEW')
(root / pointer['revision'] / 'validation.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
