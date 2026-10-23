"""Replace only the undersized occupied mother; retain the sufficient native rubble plate."""
import copy
import hashlib
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

root = Path('.artifacts/m2-4/urban-buildings-authoring-batch55-v1')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
jobs = read(root / 'imagegen-jobs-v3.json')
work = read(root / 'worklist.json')
overrides = read(root / 'slot-overrides.json')
old_file = root / 'slot-overrides-before-occupied-r1.json'
assert not old_file.exists()
shutil.copyfile(root / 'slot-overrides.json', old_file)
old_job = jobs['jobs'][3]
receipt = read(root / 'imagegen-receipt-04.json')
assert receipt['status'] == 'REWORK_REQUIRED'
old_master = Path(receipt['workspaceFile'])
image = Image.open(old_master).convert('RGBA')
alpha = np.array(image)[:, :, 3]
assert image.size == (1024, 1536)
cut = 930
assert not (alpha[cut - 2:cut + 3] > 180).any(), 'Rubble recrop requires an actual clear gutter'
board_cut = round(cut / image.height * old_job['boardSize'][1])
rubble_key = 'cuwash04.shp-003'
overrides[rubble_key]['slotRect'] = [0, board_cut, old_job['boardSize'][0], old_job['boardSize'][1] - board_cut]
key = 'cuwash04.shp-002'
sprite = Image.open(root / (key + '-native.png'))
size = 1254
scale = min((size - 64) / sprite.width, (size - 64) / sprite.height)
dimensions = tuple(round(v * scale) for v in sprite.size)
x, y = (size - dimensions[0]) // 2, (size - dimensions[1]) // 2
reference = root / 'urban-cuwash04-occupied-r1-reference.png'
assert not reference.exists()
board = Image.new('RGBA', (size, size))
board.alpha_composite(sprite.resize(dimensions, Image.Resampling.NEAREST), (x, y))
board.save(reference)
job = dict(id='urban-cuwash04-occupied-r1', reference=str(reference.resolve()),
    referenceSha256=sha(reference), destination=str((root / 'urban-cuwash04-occupied-r1-master.png').resolve()),
    slots=[key], cellLayout=[1, 1], boardSize=[size, size], minimumReferenceCapacity=scale,
    prompt='Use case: precise-object-edit. Reusable high-resolution RA2 Urban CAWASH04 occupied building sprite. '
    'Image 1 is the exact native architecture, colors, state and silhouette. One single large centered subject, '
    'truly transparent background. Repaint genuine fine sandstone, brick, glazing, metal, parapets, boarded windows '
    'and sandbags, preserving exact isometric projection, source colors, upper-left light, building proportions '
    'and all original occupied fortifications. Keep the full long thin vertical antenna at the original roof location. '
    'The original foreground fixtures and foundation remain exactly as drawn. Preserve transparent margin around '
    'the entire subject. No other state, no labels, no grid, no background or spotlight, no cast shadow, snow, '
    'new objects or decorative patterns. No ordinary enlargement, sharpening or interpolated pixels as new detail. '
    'Fill this 1254x1254 square at the same scale as the reference so the source supports genuine 4X material detail.')
overrides[key] = dict(board='urban-cuwash04-occupied-r1-master.png', boardSize=[size, size], occupied=1,
    slotRect=[0, 0, size, size], referenceRect=[x, y, *dimensions])
jobs = copy.deepcopy(jobs)
jobs['jobs'].append(job)
jobs['rework'] = dict(sourceReceipt='imagegen-receipt-04.json', rejectedSlot=key,
    preservedRubbleSlot=rubble_key, actualRawClearGutter=cut,
    policy='Only occupied state receives a new mother; original sufficient rubble pixels are unchanged and recropped through proven transparent gutter')
with (root / 'imagegen-jobs-v4.json').open('x') as stream:
    stream.write(json.dumps(jobs, indent=2) + '\n')
(root / 'slot-overrides.json').write_text(json.dumps(overrides, indent=2) + '\n')
print(json.dumps(dict(newMother=job['id'], referenceDensity=scale, unchangedRubbleRawSha256=sha(old_master))))
