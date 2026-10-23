"""Measure original color/form retention and visible within-cell HD variation."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--theater', choices=['NEWURBAN', 'DESERT'], required=True)
args = parser.parse_args()
theater = args.theater.lower()
batch = 69 if theater == 'newurban' else 70
root = Path(f'.artifacts/m2-4/{theater}-ground-transitions-authoring-batch{batch}-v1')
revision = f'{theater}-m2-4-ground-transitions-batch{batch}-v1'
pack = Path('.local/terrain-packs') / revision
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
manifest = read(pack / 'manifest.json')
source = read(root / 'source.json')
by_name = {row['member']: row['native'] for row in source['members']}
profile = read(root / 'material-profile.json')
assert set(profile['nativeTheaterGroundForms']) == set(by_name)
records = []
for group in manifest['groups']:
    if not group['id'].startswith(f'm2-4-{theater}-ground-'):
        continue
    assert all(member['member'] in by_name for member in group['members'])
    images = [(member, image) for member in group['members'] for image in member['images']]
    for variant in group['variants']:
        file = pack / variant['file']
        assert sha(file) == variant['sha256']
        atlas = np.asarray(Image.frombytes('RGBA', tuple(variant['size']), file.read_bytes()))
        density = variant['density']
        for (member, image), rect in zip(images, variant['rects'], strict=True):
            name = member['member']
            x, y, w, h = rect
            pixels = atlas[y:y+h, x:x+w, :3].astype(float)
            native = np.asarray(Image.open(root / f'{name}-native.png').convert('RGBA'))
            height, width = native.shape[:2]
            assert [w, h] == [width * density, height * density]
            cells = pixels.reshape(height, density, width, density, 3)
            means = cells.mean(axis=(1, 3))
            inside = ndimage.binary_erosion(native[..., 3] > 0, iterations=2)
            assert inside.sum() > 100
            expected = native[..., :3].astype(float)
            correlations = [float(np.corrcoef(expected[..., channel][inside], means[..., channel][inside])[0, 1])
                for channel in range(3) if expected[..., channel][inside].std() >= 2]
            assert correlations
            correlation = float(np.mean(correlations))
            variation = float(np.sqrt(cells.var(axis=(1, 3))[inside].mean()))
            error = float(np.abs(means[inside] - expected[inside]).mean())
            record = dict(member=name, sourceSha256=by_name[name]['sha256'], density=density,
                sourceColorCorrelation=correlation, withinNativeCellVariation=variation,
                meanAbsoluteNativeColorDifference=error,
                policy=profile['nativeTheaterGroundForms'][name]['region'])
            records.append(record)
assert len(records) == 304
passed = all(row['sourceColorCorrelation'] >= .94 and row['withinNativeCellVariation'] >= .3 for row in records)
report = dict(status='PASS_SOURCE_FORMS_AND_AUTHORED_VARIATION' if passed else 'REJECT_FORM_OR_DETAIL',
    theater=args.theater, revision=revision, packSha256=sha(pack / 'manifest.json'),
    members=152, densityPairs=len(records), minimumCorrelation=min(row['sourceColorCorrelation'] for row in records),
    minimumVariation=min(row['withinNativeCellVariation'] for row in records), records=records,
    boundary='Color/form correlation and visible within-cell variation are quality metrics, not user visual acceptance. Genuine authorship additionally requires all pinned built-in mother receipts and independent sampling proofs.')
with (root / 'form-quality-v1.json').open('x') as stream:
    stream.write(json.dumps(report, indent=2) + '\n')
print(json.dumps({key: value for key, value in report.items() if key not in ['records', 'boundary']}))
raise SystemExit(0 if passed else 1)
