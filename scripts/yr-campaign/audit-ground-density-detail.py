"""Observe native-pixel replication in the new independent flat terrain exports."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('revision')
parser.add_argument('output', type=Path)
args = parser.parse_args()
root = Path('.local/terrain-packs')/args.revision
raw = (root/'manifest.json').read_bytes()
manifest = json.loads(raw)
rows = []
for group in manifest['groups']:
    if not group['id'].startswith('yr-newurban-ground-fixes-'):
        continue
    variants = {variant['density']: variant for variant in group['variants']}
    atlases = {density: np.memmap(root/variant['file'], dtype=np.uint8, mode='r',
        shape=(variant['size'][1], variant['size'][0], 4)) for density, variant in variants.items()}
    for index, member in enumerate(group['members']):
        assert len(member['images']) == 1 and member['images'][0]['logical'] == [60, 30]
        samples = {}
        for density in [2, 4]:
            x, y, width, height = variants[density]['rects'][index]
            samples[density] = np.asarray(atlases[density][y:y+height, x:x+width])
        active = samples[4][..., 3] > 0
        repeated = samples[2][..., :3].repeat(2, 0).repeat(2, 1)
        same = np.all(repeated == samples[4][..., :3], axis=2)
        blocks = samples[4][..., :3].reshape(30, 4, 60, 4, 3)
        native_active = active.reshape(30, 4, 60, 4).all((1, 3))
        constant = (blocks.max((1, 3)) == blocks.min((1, 3))).all(2) & native_active
        rows.append(dict(member=member['member'], sameAsRepeated2xFraction=float(same[active].mean()),
            constantNative4x4Fraction=float(constant[native_active].mean())))
assert len(rows) == 12
passed = all(row['constantNative4x4Fraction'] < .01 for row in rows)
assert not args.output.exists()
args.output.mkdir(parents=True)
(args.output/'report.json').write_text(json.dumps(dict(schema='yr-density-detail-replication-audit-v1',
    status='PASS_NATIVE_PIXEL_BORDER_REMOVED_INDEPENDENT_HD_DENSITY_DETAIL' if passed else 'FAIL_NATIVE_PIXEL_REPLICATION_REQUIRES_REVIEW',
    pack=dict(revision=args.revision, sha256=hashlib.sha256(raw).hexdigest()), rows=rows,
    scope='Direct actual-atlas observations for this twelve-member flat-material batch. Flat colors can repeat; native RGB restoration, material fidelity and actual scene contacts require their separate evidence.',
    sourceAlphaAndGeometryChanged=False, runtimeSelectionsChanged=0), indent=2)+'\n')
print(json.dumps(dict(passed=passed, rows=rows)))
raise SystemExit(0 if passed else 1)
