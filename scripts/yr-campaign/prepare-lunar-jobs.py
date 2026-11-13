"""Pin native Lunar terrain sheets and faithful built-in image generation jobs."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('root', type=Path)
args = parser.parse_args()
read = lambda file: json.loads(file.read_text())
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
root = args.root.resolve()
source = read(root / 'source.json')
assert source['theater'] == 'LUNAR' and len(source['members']) == 196
source['editions'] = ['yr']
(root / 'source.json').write_text(json.dumps(source, indent=2) + '\n')
batches = read(root / 'batches.json')
layout = read(root / 'layout.json')
jobs = []
for batch in batches:
    reference = root / (batch['name'] + '-reference.png')
    prompt = (
        "Use case: precise-object-edit. Create a faithful clean HD redraw of the exact original Yuri's Revenge "
        'LUNAR terrain sheet in the reference. Asset group: ' + batch['setName'] + '. '
        f"Preserve exactly {batch['columns']} columns and {batch['rows']} rows, with {len(batch['members'])} separate subjects "
        'in the same left-to-right, top-to-bottom order. Preserve every silhouette, proportion, isometric angle, '
        'material boundary, shade region, crater placement, crevasse contour and elevation direction visible in each subject. '
        'Use the original cool blue-gray lunar palette and original light direction. Reconstruct smooth cohesive materials, '
        'clean continuous crater rims and rock contours, restrained broad tonal variation and crisp antialiased edges. '
        'The intended result is clean authored RTS terrain. Remove the reference pixel grain, blocky color patches and '
        'sampling jaggies. Do not copy or enlarge its pixel texture, add gritty noise, use blur/sharpening, or redesign the forms. '
        'Keep flat diamond ground surfaces flat; preserve raised slopes only where the original shows them. '
        'Keep each subject centered in its own existing cell with wide transparent gutters. Keep empty cells transparent. '
        'No background, cast shadows outside the original silhouette, checkerboard, labels or borders. '
        f"Use the full {batch['boardSize'][0]} by {batch['boardSize'][1]} canvas with enough real detail for independent 2X and 4X exports. "
        'Keep neighboring lunar materials consistent across the sheet.'
    )
    jobs.append(dict(id=batch['name'], reference=str(reference), referenceSha256=sha(reference),
        destination=str(root / (batch['name'] + '-master-r1.png')), members=batch['members'],
        setIndex=batch['setIndex'], setName=batch['setName'], columns=batch['columns'], rows=batch['rows'],
        boardSize=batch['boardSize'], prompt=prompt, status='FAITHFUL_RECONSTRUCTION_AUTHORIZED_ARTWORK_PENDING'))
    for name in batch['members']:
        layout[name].update(board=batch['name'] + '-master-r1.png', boardSize=batch['boardSize'], occupied=len(batch['members']))
    batch['status'] = 'FAITHFUL_RECONSTRUCTION_AUTHORIZED_ARTWORK_PENDING'
(root / 'batches.json').write_text(json.dumps(batches, indent=2) + '\n')
(root / 'layout.json').write_text(json.dumps(layout, indent=2) + '\n')
(root / 'imagegen-jobs.json').write_text(json.dumps(dict(schema='yr-lunar-terrain-imagegen-jobs-v1',
    sourceSha256=sha(root / 'source.json'), layoutSha256=sha(root / 'layout.json'),
    authorization='docs/campaign-art/yr-v1/authorization.json', jobs=jobs,
    userVisualAcceptance='PENDING'), indent=2) + '\n')
print(json.dumps(dict(theater='LUNAR', members=len(source['members']), jobs=len(jobs), root=str(root))))
