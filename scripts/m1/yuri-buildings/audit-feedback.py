"""Incremental C retention, authored construction coverage and motion audit."""
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from production_common import ROOT, row_for, indices, sha

root = ROOT / sys.argv[1]
selected = json.loads((root / 'selected-exports.json').read_text())
functional = {'YAPOWR', 'YAREFN', 'YAPPET'}
results = []
for identity, revision in selected.items():
    for theater in ('TEMPERATE', 'SNOW'):
        row = row_for(identity, theater)
        build_names = {m['source']['member'] for m in row['members'] if 'BUILDUP' in m['roles']}
        for density in (2, 4):
            name = f'{identity}-{theater}-{density}x'
            folder = ROOT / revision / name
            receipt = json.loads((folder / 'candidate-review.json').read_text())
            baseline = ROOT / sys.argv[1] / 'baseline-exports' / name
            previous = json.loads((baseline / 'candidate-review.json').read_text())
            old = {(f['member'], f['nativeFrame']): f for f in previous['frames']}
            retained = covered = 0
            for frame in receipt['frames']:
                key = frame['member'], frame['nativeFrame']
                native = next(m for m in row['members'] if m['source']['member'] == frame['member'])
                if frame['member'] in build_names and (indices(native, frame['nativeFrame']) > 1).any():
                    assert frame['base'], (name, key, 'Missing native construction material')
                    assert np.array(Image.open(folder / frame['base']))[..., 3].max() > 127, (name, key, 'Empty authored construction')
                    covered += 1
                if identity not in functional and frame['member'] not in build_names:
                    assert frame['native'] == old[key]['native']
                    for role in ('base', 'data'):
                        if frame[role] is None:
                            assert old[key][role] is None
                        else:
                            assert Image.open(folder / frame[role]).tobytes() == Image.open(baseline / old[key][role]).tobytes(), (name, key, role, 'Unrelated operating pixels changed')
                    retained += 1
            for motion in receipt.get('constructionMotion', []):
                assert motion['wallTranslation'] == motion['foundationTranslation'] == [0, 0]
                assert motion['wholeBuildingScale'] == [1, 1]
            if identity == 'YAREFN':
                compact = [r for r in receipt['registrations'] if Path(r['source']).name in ('keys-raw.png', 'chassis-middle-raw.png')]
                assert len(compact) == 5
                for registration in compact:
                    sx, sy = registration['scale']
                    assert abs(sx - sy) < .002, 'Compact yaw key stretched independently along its axes'
            results.append({'identity': identity, 'theater': theater, 'density': density,
                'candidateHash': sha(folder / 'candidate-review.json'), 'retainedOperatingSlots': retained,
                'coveredConstructionSlots': covered, 'nativeGeometryUnchanged': True})
report = {'status': 'PASS_INCREMENTAL_RETENTION_CONSTRUCTION_AND_MOTION', 'cells': results,
    'boundary': 'Pixel retention and native construction material presence are technical checks. Mechanical appearance requires captured native playback and user review.'}
target = root / 'incremental-export-audit.json'
assert not target.exists()
target.write_text(json.dumps(report, indent=2) + '\n')
print(report['status'], len(results), 'cells', sum(r['retainedOperatingSlots'] for r in results), 'retained operating slots')
