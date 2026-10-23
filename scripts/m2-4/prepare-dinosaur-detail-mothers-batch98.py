"""Use measured built-in output capacity to prepare genuinely sufficient 4X mothers."""
import copy
from collections import defaultdict
from pathlib import Path
from PIL import Image
from newurban_batch89_io import pin, read, write

ROOT = Path('.artifacts/m2-4/newurban-final-actors-batch98-20261021')
work = read(ROOT / 'pose-worklist-v1.json')
old = read(ROOT / 'mother-jobs-v2.json')
prototype = next(j for j in old['jobs'] if j['member'] == 'dnoa.shp')
grouped = defaultdict(list)
for key, pose in work['poses'].items():
    if pose['member'] != 'dnoa.shp':
        continue
    left, top, right, bottom = pose['nativeBounds']
    width, height = right - left, bottom - top
    layouts = [(columns * rows, min((2048 // columns - 48) / width, (2048 // rows - 48) / height), columns, rows)
        for columns in range(1, 7) for rows in range(1, 7)]
    choices = [layout for layout in layouts if layout[1] >= 8.0]
    count, scale, columns, rows = max(choices)
    grouped[columns, rows].append(key)
jobs, slots = [], {}
for (columns, rows), keys in grouped.items():
    for start in range(0, len(keys), columns * rows):
        selected = keys[start:start + columns * rows]
        stem = f'dnoa-detail-{columns}x{rows}-{start // (columns * rows) + 1:02d}'
        board = Image.new('RGBA', (2048, 2048))
        subjects = []
        for cell, key in enumerate(selected):
            pose = copy.deepcopy(work['poses'][key])
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
        prompt += (' These are production animation poses of one consistent animal. Keep the original muted olive-gray/brown '
            'skin and pale underside, short forearms and long tail. Fine skin detail must follow smooth continuous anatomy; '
            'do not add bumpy granular stippling. Keep the exact input layout and each pose centered in its own cell.')
        jobs.append(dict(id=stem, member='dnoa.shp', reference=pin(reference),
            destination=str(ROOT / (stem + '-mother-v1.png')), columns=columns, rows=rows,
            occupied=len(selected), subjects=subjects, prompt=prompt))
write(ROOT / 'dinosaur-detail-worklist-v2.json', dict(status='PREPARED_NOT_AUTHORED', poses=slots,
    parent=pin(ROOT / 'pose-worklist-v1.json'), rejectedSample=pin(ROOT / 'dinosaur-mother-capacity-v1.json'),
    predictedOutputEdge=1254, minimumReferenceCapacity=8.0,
    qualification='The output size is measured from actual built-in results, not assumed from the requested resolution. Every retained crop still needs independent 4X-capacity verification.'))
write(ROOT / 'dinosaur-detail-jobs-v2.json', dict(status='PREPARED_NOT_AUTHORED', jobs=jobs))
print(dict(nativePoses=len(slots), mothers=len(jobs), layouts={f'{c}x{r}': len(keys) for (c, r), keys in grouped.items()}))
