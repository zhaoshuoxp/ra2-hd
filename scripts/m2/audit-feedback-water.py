"""Measure sea material changes and verify preservation outside the registered water region."""
import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image
from showcase_materials import water_mask, contact_weight

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('base', type=Path)
parser.add_argument('candidate', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
root = Path('.artifacts/m2-2/authoring-tmp-v2')
layout = json.loads((root / 'layout.json').read_text())
base = json.loads((args.base / 'manifest.json').read_text())
candidate = json.loads((args.candidate / 'manifest.json').read_text())
prepared = Path('.artifacts/m2-2/prepared-native-v2')
sources = {s['member']: s for s in json.loads((prepared / 'source.json').read_text())['sources'] if s['format'] == 'tmp'}
results = []
for group, changed_group in zip(base['groups'], candidate['groups'], strict=True):
    if group == changed_group:
        continue
    for old_variant, new_variant in zip(group['variants'], changed_group['variants'], strict=True):
        density = old_variant['density']
        before = np.asarray(Image.frombytes('RGBA', tuple(old_variant['size']), (args.base / old_variant['file']).read_bytes()))
        after = np.asarray(Image.frombytes('RGBA', tuple(new_variant['size']), (args.candidate / new_variant['file']).read_bytes()))
        nonwater, changed, skipped, index, old_levels, new_levels = 0, 0, 0, 0, [], []
        for member in group['members']:
            name = member['member']
            mask = water_mask(np.asarray(Image.open(root / (name + '-native.png'))), name.startswith('water'))
            for image in member['images']:
                x, y, width, height = old_variant['rects'][index]
                index += 1
                a, b = before[y:y + height, x:x + width], after[y:y + height, x:x + width]
                parts = [p for p in layout[name]['parts'] if p['subTile'] == image['subTile']]
                if not parts:
                    assert np.array_equal(a, b)
                    skipped += 1
                    continue
                px, py, pw, ph = parts[0]['rect']
                region = np.repeat(np.repeat(mask[py:py + ph, px:px + pw], density, 0), density, 1)
                source = next(frame for frame in sources[name]['images'] if frame['subTile'] == image['subTile'])
                native = np.asarray(Image.frombytes('RGBA', tuple(source['logical']), (prepared / 'native' / source['file']).read_bytes()))
                region |= contact_weight(native, density) > 0
                region &= a[..., 3] > 0
                assert region.shape == a.shape[:2]
                diff = np.any(a != b, 2) & (a[..., 3] > 0)
                nonwater += int((diff & ~region).sum())
                changed += int(diff.sum())
                if name.startswith('water') and region.any():
                    old_levels.extend(a[..., :3][region].mean(1))
                    new_levels.extend(b[..., :3][region].mean(1))
        row = dict(group=group['id'], density=density, changedPixels=changed,
                   changedActiveNonWaterInteriorPixels=nonwater, exactNativePlaceholderFrames=skipped)
        if old_levels:
            row['seaLuminance'] = {label: dict(mean=float(np.mean(values)), std=float(np.std(values)),
                                               p99=float(np.percentile(values, 99)))
                                   for label, values in [('r4', old_levels), ('r5', new_levels)]}
        results.append(row)
record = dict(status='PASS_EXACT_LAND_INTERIORS_AND_NATIVE_CONTACTS' if all(r['changedActiveNonWaterInteriorPixels'] == 0 for r in results) else 'FAIL', rows=results)
args.output.write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(record))
assert record['status'].startswith('PASS')
