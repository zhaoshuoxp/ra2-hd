"""Author reusable source-pinned analytic Urban road boundary geometry."""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image
from showcase_road_geometry import fit_geometry, fit_strip
from showcase_urban_roads import source_regions

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
assert not args.output.exists()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
source = json.loads((args.source / 'source.json').read_text())
members = {}
for row in source['members']:
    name, index = row['member'], row['setIndex']
    assert index in [16, 17, 18, 23]
    path = args.source / f'{name}-native.png'
    native = np.asarray(Image.open(path).convert('RGBA'))
    active, mask, _ = source_regions(native)
    contours, models = (fit_strip(native, ramp=index == 23) if index in [18, 23]
                        else fit_geometry(mask, active))
    assert contours and models
    members[name] = dict(sourceSha256=row['native']['sha256'], nativePngSha256=sha(path),
        logical=list(native.shape[1::-1]), setIndex=index, contours=[p.tolist() for p in contours], models=models)
args.output.write_text(json.dumps(dict(schema='m2-4-urban-analytic-road-boundaries-v1',
    source=str(args.source / 'source.json'), sourceSha256=sha(args.source / 'source.json'),
    policy='SOURCE_PINNED_ANALYTIC_LINES_AND_PROJECTED_ARCS_V1', members=members), separators=(',', ':')) + '\n')
print(json.dumps(dict(members=len(members), modelCounts={
    kind: sum(m['kind'] == kind for row in members.values() for m in row['models'])
    for kind in sorted({m['kind'] for row in members.values() for m in row['models']})},
    file=str(args.output), sha256=sha(args.output))))
