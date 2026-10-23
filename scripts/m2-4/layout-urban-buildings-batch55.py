"""Give tall original states proportional rows without reducing authored 4X capacity."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--batch', type=int, choices=[55, 56], default=55)
args = parser.parse_args()
root = Path(f'.artifacts/m2-4/urban-buildings-authoring-batch{args.batch}-v1')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
jobs = read(root / 'imagegen-jobs-v1.json')
work = read(root / 'worklist.json')
updated, overrides = [], {}
for index, old in enumerate(jobs['jobs']):
    job = copy.deepcopy(old)
    if index == 0 and args.batch == 55:
        updated.append(job)
        continue
    keys = job['slots']
    assert len(keys) == 2
    sprites = [Image.open(root / (key + '-native.png')) for key in keys]
    width, height = job['boardSize']
    margin = 16
    scale = min((width - margin * 2) / max(s.width for s in sprites),
                (height - margin * 2) / sum(s.height for s in sprites))
    cut = round((height - margin * 2) * sprites[0].height / sum(s.height for s in sprites)) + margin
    board = Image.new('RGBA', (width, height))
    job['id'] += '-layout-v3'
    for key, sprite, top, bottom in zip(keys, sprites, [0, cut], [cut, height]):
        size = tuple(round(v * scale) for v in sprite.size)
        assert size[0] <= width - margin and size[1] <= bottom - top - margin
        x, y = (width - size[0]) // 2, top + (bottom - top - size[1]) // 2
        board.alpha_composite(sprite.resize(size, Image.Resampling.NEAREST), (x, y))
        overrides[key] = dict(board=job['id'] + '-master.png', boardSize=[width, height], occupied=2,
            slotRect=[0, top, width, bottom - top], referenceRect=[x, y, *size])
    reference = root / (job['id'] + '-reference.png')
    assert not reference.exists()
    board.save(reference)
    job.update(reference=str(reference.resolve()), referenceSha256=sha(reference),
        destination=str((root / (job['id'] + '-master.png')).resolve()),
        minimumReferenceCapacity=scale, rowBoundary=cut)
    job['prompt'] += (f' The two rows have proportional UNEQUAL heights. The dividing line is at '
        f'y={cut} of {height} pixels ({cut / height:.1%} from the top). Match the reference subject scale, '
        'centering, exact native architecture, damage gaps and transparent gutters in each proportional row. '
        'Do not move the divider to the middle or shrink the subjects. Keep the tall portrait canvas.')
    updated.append(job)
assert len(updated) == 16 and len(overrides) == (30 if args.batch == 55 else 32)
for name, value in [('slot-overrides.json', overrides), ('imagegen-jobs-v3.json', dict(jobs, jobs=updated,
    layoutPolicy=('Proportional original-state rows; first already-generated exact original guide retained'
                  if args.batch == 55 else 'Proportional original-state rows for all eight stadium sections'),
    priorJobsSha256=sha(root / 'imagegen-jobs-v1.json')))]:
    with (root / name).open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')
print(json.dumps(dict(mothers=16, adaptedReferences=15 if args.batch == 55 else 16,
    minimumReferenceDensity=min(j['minimumReferenceCapacity'] for j in updated))))
