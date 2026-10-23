"""Verify immutable predecessors and unchanged native contracts for selected atlases."""
import hashlib
import json
from pathlib import Path

root = Path('.artifacts/unified-density')
old = json.loads((root / 'registered-v1.json').read_text())
new = json.loads((root / 'registered-v3.json').read_text())
sha = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
predecessors = {}
preserved = 0
for route, filename in old['routes'].items():
    if not route.startswith('/local-hd/') or not route.endswith('/manifest.json'):
        continue
    manifest = json.loads(Path(filename).read_text())
    assert sha(filename) == route.split('/')[2], filename
    if 'variants' not in manifest:
        continue
    predecessors[(manifest['source']['member'], manifest['source']['sha256'])] = manifest
    for variant in manifest['variants']:
        for page in variant['pages']:
            for role in ['base', 'data']:
                assert sha(Path(filename).parent / page[role]) == page[role + 'Sha256']
                preserved += 1

checked = []
for route, filename in new['routes'].items():
    if not route.startswith('/local-hd/') or not route.endswith('/manifest.json'):
        continue
    manifest = json.loads(Path(filename).read_text())
    if 'variants' not in manifest:
        continue
    key = (manifest['source']['member'], manifest['source']['sha256'])
    predecessor = predecessors[key]
    assert manifest['logical'] == predecessor['logical'], filename
    assert manifest['source'] == predecessor['source'], filename
    for variant in manifest['variants']:
        limit = 16 if key[0] == 'ngyard_d.shp' and variant['density'] == 4 else 8
        assert len(variant['pages']) <= limit, filename
        for page in variant['pages']:
            assert max(page['size']) <= 2048
            for role in ['base', 'data']:
                assert sha(Path(filename).parent / page[role]) == page[role + 'Sha256']
    checked.append({'member': key[0], 'file': filename,
                    'densities': [v['density'] for v in manifest['variants']]})

report = {'status': 'PASS', 'unchangedNativeContracts': len(checked),
          'preservedPredecessorAtlasFiles': preserved, 'manifests': checked}
(root / 'resource-verification.json').write_text(json.dumps(report, indent=2) + '\n')
print(report['status'], len(checked), preserved)
