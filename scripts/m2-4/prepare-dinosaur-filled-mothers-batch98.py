"""Fill compatible pose cells before opening another measured-capacity mother."""
import copy
from pathlib import Path
from PIL import Image
from newurban_batch89_io import pin, read, write

ROOT = Path('.artifacts/m2-4/newurban-final-actors-batch98-20261021')
work = read(ROOT / 'pose-worklist-v1.json')
parent = read(ROOT / 'mother-jobs-v2.json')
prototype = next(j for j in parent['jobs'] if j['member'] == 'dnoa.shp')
remaining = {key: p for key, p in work['poses'].items() if p['member'] == 'dnoa.shp'}
jobs, slots = [], {}
while remaining:
    candidates = []
    for columns in range(1, 7):
        for rows in range(1, 7):
            fits = []
            for key, pose in remaining.items():
                left, top, right, bottom = pose['nativeBounds']
                scale = min((2048 // columns - 48) / (right - left), (2048 // rows - 48) / (bottom - top))
                if scale >= 8.0:
                    fits.append(key)
            fits.sort(key=lambda key: (-(remaining[key]['nativeBounds'][2] - remaining[key]['nativeBounds'][0])
                * (remaining[key]['nativeBounds'][3] - remaining[key]['nativeBounds'][1]), remaining[key]['slot']))
            selected = fits[:columns * rows]
            if selected:
                candidates.append((len(selected), len(selected) / (columns * rows), -columns * rows, columns, rows, selected))
    _, _, _, columns, rows, selected = max(candidates)
    selected.sort(key=lambda key: remaining[key]['slot'])
    stem = f'dnoa-filled-{len(jobs) + 1:02d}'
    board = Image.new('RGBA', (2048, 2048))
    subjects = []
    for cell, key in enumerate(selected):
        pose = copy.deepcopy(remaining.pop(key))
        original = Image.open(ROOT / (key + '-native-reference.png')).convert('RGBA')
        x, y = cell % columns * 2048 // columns, cell // columns * 2048 // rows
        cw = (cell % columns + 1) * 2048 // columns - x
        ch = (cell // columns + 1) * 2048 // rows - y
        scale = min((cw - 48) / original.width, (ch - 48) / original.height)
        assert scale >= 8.0
        size = tuple(round(n * scale) for n in original.size)
        pos = (x + (cw - size[0]) // 2, y + (ch - size[1]) // 2)
        board.alpha_composite(original.resize(size, Image.Resampling.NEAREST), pos)
        pose.update(board=stem + '-mother-v1.png', cell=[x, y, cw, ch])
        slots[key] = pose
        subjects.append(dict(key=key, slot=pose['slot'], cell=pose['cell'], nativeBounds=pose['nativeBounds'],
            referenceRect=[*pos, *size], referenceCapacity=scale))
    reference = ROOT / (stem + '-reference-v1.png')
    board.save(reference)
    prompt = prototype['prompt'].replace('3 columns, 3 rows and 9 occupied cells',
        f'{columns} columns, {rows} rows and {len(selected)} occupied cells')
    prompt += (' One consistent animal across all poses: muted olive-gray/brown skin, pale underside, smooth coherent '
        'anatomy and subtle broad scales. Avoid dotted or granular mottling. Preserve every individual pose, including '
        'fallen, rolling and crouching states. Keep each complete tail and all transparent gutters. The original guide '
        'is low resolution; rebuild the continuous contours instead of copying its raster blocks.')
    jobs.append(dict(id=stem, member='dnoa.shp', reference=pin(reference),
        destination=str(ROOT / (stem + '-mother-v1.png')), columns=columns, rows=rows,
        occupied=len(selected), subjects=subjects, prompt=prompt))
assert len(slots) == 212
write(ROOT / 'dinosaur-filled-worklist-v3.json', dict(status='PREPARED_NOT_AUTHORED', poses=slots,
    parent=pin(ROOT / 'pose-worklist-v1.json'), rejectedSample=pin(ROOT / 'dinosaur-mother-capacity-v1.json'),
    predictedOutputEdge=1254, minimumReferenceCapacity=8.0, coverageAdded=0))
write(ROOT / 'dinosaur-filled-jobs-v3.json', dict(status='PREPARED_NOT_AUTHORED', jobs=jobs))
print(dict(nativePoses=len(slots), mothers=len(jobs), occupied=[j['occupied'] for j in jobs]))
