"""Pin the remaining NewUrban road facility masters without changing selection."""
import hashlib
import json
from pathlib import Path


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


root = Path('.artifacts/m2-4/newurban-facilities-authoring-batch73-v1')
work_file = root / 'worklist.json'
work = json.loads(work_file.read_text())
assert len(work['members']) == len(work['slots']) == 19
jobs = []
for board in work['batches']:
    reference = root / (board['name'] + '-reference.png')
    prompt = ('Use case: precise-object-edit. Asset type: reusable Red Alert 2 Yuri Revenge NEWURBAN '
        'road facility sprite master. Input image is the exact original geometry, material and color guide. '
        f'Repaint {len(board["slots"])} occupied cells in precisely the same '
        f'{board["columns"]}-column by {board["rows"]}-row layout, left to right then top to bottom. '
        'Preserve each original sign, traffic light, street lamp and utility pole in its exact native '
        'isometric view, lean, dimensions and center. Preserve the poles, crossarms, mounting brackets, '
        'lamp shapes, traffic signal colors, sign front/back direction and original text or blank back. '
        'Retain each own original gray or brown metal, pale concrete, muted yellow and red/green detail '
        'and upper-left diffuse lighting. Add genuinely fine clean metal, paint, weathering, glass and '
        'wood detail inside those forms. Keep thin straight shafts straight and continuous, curved '
        'arms smooth, and small joints readable. Do not thicken, bend or redesign the facilities. '
        'No added or removed sign plates, cables, bulbs, bases, ground, plants, debris, extra objects '
        'or cast shadows. Do not copy enlarged pixel blocks or substitute interpolation, sharpening '
        'or blur for true material detail. Keep subjects entirely inside their own original cells '
        'with transparent margins and gutters. Leave every unused cell transparent. '
        'Genuinely transparent background; no checkerboard, labels, border or watermark. '
        'Output at least 1254 by 1254 pixels with enough real detail for independent 2X and 4X exports.')
    jobs.append(dict(id=board['name'], reference=str(reference.resolve()), referenceSha256=sha(reference),
        destination=str((root / (board['name'] + '-master.png')).resolve()), members=board['slots'],
        cellLayout=[board['columns'], board['rows']], boardSize=board['boardSize'], prompt=prompt))
with (root / 'imagegen-jobs.json').open('x') as stream:
    stream.write(json.dumps(dict(schema='m2-4-native-facilities-imagegen-jobs-v1',
        worklistSha256=sha(work_file), jobs=jobs), indent=2) + '\n')
print(json.dumps(dict(trees=0, facilities=19, jobs=len(jobs), selection='UNCHANGED')))
