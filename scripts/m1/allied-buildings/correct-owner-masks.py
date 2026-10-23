"""Create immutable data-only corrections; preserve each authored base PNG byte."""
import json
import shutil
import argparse
import numpy as np
from PIL import Image
from production_common import ROOT, row_for, owner_data, sha

sources = {'GAWALL': 'full-exports-v1', 'GAPILE': 'full-exports-v3',
           'GAOREP': 'full-exports-v5', 'GATECH': 'full-exports-v1',
           'GAPILL': 'full-exports-v1', 'GTGCAN': 'full-exports-v1', 'NASAM': 'full-exports-v1'}
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--identities', nargs='+', required=True, choices=sources)
parser.add_argument('--receipt', required=True)
args = parser.parse_args()
assert not (ROOT / args.receipt).exists()
receipt = []
for identity in args.identities:
    revision = sources[identity]
    for theater in ('TEMPERATE', 'SNOW'):
        name = identity if theater == 'TEMPERATE' else identity + '-SNOW'
        source = ROOT / revision / name
        target = ROOT / 'mask-exports-v2' / name
        shutil.copytree(source, target)
        row = row_for(identity, theater)
        review = json.loads((source / 'candidate-review.json').read_text())
        removed = 0
        for frame in review['frames']:
            member = next(m for m in row['members'] if m['source']['member'] == frame['member'])
            export = frame['exports'][0]
            data, count = owner_data(row, member, Image.open(source / export['base']).convert('RGBA'))
            data.save(target / export['data'])
            assert sha(source / export['base']) == sha(target / export['base'])
            removed += frame['remapPixels'] - count
            frame['remapPixels'] = count
        review['dataCorrection'] = {'sourceReviewSha256': sha(source / 'candidate-review.json'),
            'allBasePngBytesPreserved': True, 'removedWarmOrNativeNeutralMaskPixels': removed,
            'reason': 'Exclude authored orange emission, rust and source-neutral member lamps'}
        (target / 'candidate-review.json').write_text(json.dumps(review, indent=2) + '\n')
        receipt.append({'identity': identity, 'theater': theater, **review['dataCorrection']})
    if identity in ('GTGCAN', 'NASAM'):
        source = ROOT / 'turret-exports-v1' / identity
        target = ROOT / 'turret-exports-v2' / identity
        shutil.copytree(source, target)
        manifest = json.loads((source / 'manifest.json').read_text())
        for heading in manifest['headings']:
            rgba = np.array(Image.open(source / heading['base']))
            rgb = rgba[..., :3].astype(float)
            mask = np.frombuffer((source / heading['mask']).read_bytes(), np.uint8).reshape(rgba.shape[:2]).copy()
            warm = (rgb[..., 1] > rgb[..., 0] * .25) & (rgb[..., 1] > rgb[..., 2] * 1.3)
            mask[warm] = 0
            (target / heading['mask']).write_bytes(mask.tobytes())
            heading['maskSha256'] = sha(target / heading['mask'])
            assert sha(target / heading['base']) == heading['baseSha256']
        manifest['dataCorrectionSourceSha256'] = sha(source / 'manifest.json')
        manifest['dataCorrection'] = 'Exclude warm neutral metal; all base PNG bytes and native pivots preserved'
        (target / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
(ROOT / args.receipt).write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt, indent=2))
