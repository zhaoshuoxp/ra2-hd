"""Split large families into sufficient-resolution source-state mother jobs."""
from pathlib import Path
import numpy as np
from PIL import Image
from newurban_batch89_io import pin, read, write

ROOT = Path('.artifacts/m2-4/newurban-remaining-actors-batch97-20261021')
GUIDE = ROOT / 'native'
source = {s['member']: s for s in read(ROOT / 'source-v1.json')['sources']}
prior = read(ROOT / 'mother-jobs-v1.json')
split = {'cgslab.shp', 'cnla05.shp', 'cgla06.shp', 'cnla01.shp', 'cnsanf18.shp'}
jobs = [job for job in prior['jobs'] if job['subjects'][0]['member'] not in split]
iso = np.fromfile(GUIDE / '1aa49468a9439a5cff3e5f66fae0678501e9dc3ef7a4d90f23127c38ad6e4676.pal', np.uint8).reshape(256, 3).astype(np.uint16) * 4
for name in sorted(split):
    row = source[name]
    for slots in [[0, 1], [2, 3]]:
        width, height = 2048, 1024
        board = Image.new('RGBA', (width, height))
        subjects = []
        for cell, slot in enumerate(slots):
            frame = row['frames'][slot]
            indices = np.fromfile(GUIDE / frame['indexFile'], np.uint8).reshape(frame['size'][::-1])
            palette = iso if slot == 3 else np.fromfile(GUIDE / (row['palette']['sha256'] + '.pal'), np.uint8).reshape(256, 3).astype(np.uint16) * 4
            active = (indices != 0) & ((indices != 12) if slot != 3 else True)
            ys, xs = np.where(active)
            bounds = [int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)]
            x0, y0, x1, y1 = bounds
            image = Image.fromarray(np.dstack((palette[indices], active.astype(np.uint8) * 255)).astype(np.uint8)).crop((x0, y0, x1, y1))
            scale = min(936 / image.width, 936 / image.height)
            image = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.NEAREST)
            board.alpha_composite(image, (cell * 1024 + (1024 - image.width) // 2, (1024 - image.height) // 2))
            subjects.append(dict(member=name, slot=slot, nativeBounds=bounds,
                nativeIndex=pin(GUIDE / frame['indexFile']), cell=[cell * 1024, 0, 1024, 1024],
                palette='isoubn.pal' if slot == 3 else row['palette']['member']))
        stem = name.replace('.', '-') + '-slots' + ''.join(map(str, slots))
        file = ROOT / (stem + '-original-reference-v1.png')
        assert not file.exists()
        board.save(file)
        jobs.append(dict(id=stem, destination=str(ROOT / (stem + '-mother-v1.png')),
            subjects=subjects, originalReference=pin(file), acceptedStructuralReference=None,
            layout=[2048, 1024], policy='Two independent large states; actual cropped source capacity must reach 4X on both axes.'))
write(ROOT / 'mother-jobs-v2.json', dict(**{k: v for k, v in prior.items() if k != 'jobs'},
    jobs=jobs, parent=pin(ROOT / 'mother-jobs-v1.json'),
    qualification='Large state pairs preserve true mother resolution; unused four-state proposals remain unselected.'))
print(dict(jobs=len(jobs), splitFamilies=len(split)))
