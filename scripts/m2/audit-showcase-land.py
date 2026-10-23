"""Independently verify shore-only RGB changes and exact accepted water/geometry."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from showcase_materials import water_mask
from showcase_registration import sha

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('base', type=Path)
parser.add_argument('candidate', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
before = json.loads((args.base / 'manifest.json').read_text())
after = json.loads((args.candidate / 'manifest.json').read_text())
source = json.loads(Path('.artifacts/m2-2/authoring-feedback-r5/tmp/source.json').read_text())
native = {m['member']: m['native'] for m in source['members']}
report = dict(schema='m2-2-land-pixel-audit-v1', status='RUNNING', groups=[], checks=[])
assert len(before['groups']) == len(after['groups']) == 8
for old, new in zip(before['groups'], after['groups']):
    assert old['id'] == new['id'] and old['members'] == new['members']
    if old['id'] != 'm2-2-shore':
        assert old == new
        for v in old['variants']:
            assert sha(args.base / v['file']) == sha(args.candidate / v['file']) == v['sha256']
        report['groups'].append(dict(id=old['id'], status='EXACT_REUSE'))
        continue
    images = [(m['member'], image) for m in old['members'] for image in m['images']]
    for a, b in zip(old['variants'], new['variants']):
        assert a['density'] == b['density'] and a['rects'] == b['rects'] and a['size'] == b['size']
        density = a['density']
        atlases = []
        for folder, variant in [(args.base, a), (args.candidate, b)]:
            file = folder / variant['file']
            assert sha(file) == variant['sha256']
            atlases.append(np.frombuffer(file.read_bytes(), np.uint8).reshape(*variant['size'][::-1], 4))
        for (name, metadata), (x, y, w, h) in zip(images, a['rects']):
            previous, candidate = [atlas[y:y + h, x:x + w] for atlas in atlases]
            guide = next(i for i in native[name]['images'] if i['subTile'] == metadata['subTile'])
            raw = Path('.artifacts/m2-2/prepared-native-v2/native') / guide['file']
            assert sha(raw) == guide['rgbaSha256']
            retail = np.asarray(Image.frombytes('RGBA', tuple(metadata['logical']), raw.read_bytes()))
            alpha = np.repeat(np.repeat(retail[..., 3], density, 0), density, 1)
            assert np.array_equal(candidate[..., 3], alpha)
            protected = ndimage.binary_dilation(ndimage.binary_fill_holes(water_mask(retail)), iterations=1)
            protected = np.repeat(np.repeat(protected, density, 0), density, 1) & (alpha > 0)
            assert np.array_equal(candidate[protected], previous[protected])
            if guide['nativeOffset'] <= 0:
                assert np.array_equal(candidate, previous)
            assert np.array_equal(np.pad(candidate, ((2, 2), (2, 2), (0, 0)), mode='edge'),
                                  atlases[1][y - 2:y + h + 2, x - 2:x + w + 2])
            report['checks'].append(dict(member=name, subTile=metadata['subTile'], density=density,
                protectedWaterPixels=int(protected.sum()), acceptedWaterExact=True, nativeAlphaExact=True,
                nativePlaceholderExact=guide['nativeOffset'] <= 0,
                changedVisibleLandPixels=int((np.any(previous != candidate, 2) & (alpha > 0)).sum())))
    report['groups'].append(dict(id=old['id'], status='COMPLETE_LAND_MATERIAL_CORRECTION'))
report.update(status='PASS', baseSha256=sha(args.base / 'manifest.json'), candidateSha256=sha(args.candidate / 'manifest.json'),
              exactNativeMetadata=True, independentlySampledDensities=[2, 4])
args.output.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({k: report[k] for k in ['status', 'groups', 'exactNativeMetadata']}))
