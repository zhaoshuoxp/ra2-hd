"""Check representative capture invariants, source identities and export coverage."""
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image

root = Path('.artifacts/m1-6a')
runtime = root / 'runtime-candidate-v2'
report = json.loads((runtime / 'result.json').read_text())
exports = json.loads((root / 'exports-v1/report.json').read_text())
assert report['status'] == 'PASS_DIAGNOSTIC_RENDER_REVIEW'
assert len(report['samples']) == 24
assert report['cleanup']['released']
assert all(s['logical'] == [1600, 900] and s['glError'] == 0 for s in report['samples'])
assert exports['activityInvariant'] == {'outsideMaskChangedPixels': 0, 'alphaChangedPixels': 0}
rows = []
for mode in ['1080p', '4k']:
    ratio = (1080 if mode == '1080p' else 2160) / 900
    for state in ['normal', 'active-09', 'damaged', 'buildup-12']:
        samples = [s for s in report['samples'] if s['mode'] == mode and s['name'] == state]
        for sample in samples[1:]:
            for key in ['tick', 'logical', 'camera', 'points', 'models']:
                assert sample[key] == samples[0][key], (mode, state, key)
            a = np.asarray(Image.open(runtime / samples[0]['filename']))
            b = np.asarray(Image.open(runtime / sample['filename']))
            diff = np.any(a != b, axis=2)
            # Original and HD share the same native projected rectangle. Allow
            # two logical pixels around its edges for production-C coverage.
            x0, y0, x1, y1 = [round(v * ratio) for v in (490, 357, 612, 459)]
            outside = diff.copy()
            outside[y0:y1, x0:x1] = False
            assert not outside.any(), (mode, state, 'unexpected changes outside NAPOWR')
            assert diff.sum() > 200, 'Candidate failed to change the source appearance'
            rows.append({'state': state, 'mode': mode, 'density': sample['density'],
                         'changedPixels': int(diff.sum()), 'outsidePixels': int(outside.sum())})
for sample in exports['samples']:
    assert not sample['upsampling'] and sample['nativeEquivalentDensity'] > 4
    for export in sample['exports']:
        pixels = np.asarray(Image.open(root / 'exports-v1' / export['file']))
        data = np.asarray(Image.open(root / 'exports-v1' / export['data']))
        assert pixels.shape == data.shape
        assert data[:, :, 1].max() <= 15
        assert not data[:, :, 2].any() and (data[:, :, 3] == 255).all()
        assert not data[:, :, 0][pixels[:, :, 3] == 0].any()
        assert len(export['shadeValues']) >= 10
provenance = {'tool': 'built-in image_gen', 'paidApiFallback': False, 'outputs': [],
              'references': ['references-v1/normal-reference.png', 'references-v1/damaged-reference.png',
                             'references-v1/buildup-12-reference.png', 'references-v1/active-09-reference.png',
                             'runtime-original-v1/normal-4k.png'],
              'referenceRoles': 'Original NAPOWR architecture/state controls; authored normal master locks subsequent state edits.'}
for name in ['normal', 'damaged', 'buildup', 'active']:
    provenance['outputs'].append({key: {'path': str(path.relative_to(root)), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
                                  for key, path in [('raw', root / 'art-v1' / f'{name}-raw.png'),
                                                    ('prompt', root / 'art-v1' / f'{name}-prompt.txt')]})
(root / 'art-v1/provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
result = {'status': 'PASS_REPRESENTATIVE_INVARIANTS', 'pairs': rows,
          'shadesAndCoverage': 'PASS', 'geometryCameraTick': 'PASS', 'activityStructure': 'PASS',
          'scope': 'Representative review only; full-family and desktop gameplay remain NOT RUN'}
(root / 'review-v1/evidence-check.json').write_text(json.dumps(result, indent=2) + '\n')
print(result['status'], len(rows), 'paired captures')
