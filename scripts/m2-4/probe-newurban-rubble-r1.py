"""Inspect actual-density repaint registration before completing the grouped correction."""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

from newurban_rubble_r1_materials import register_rubble, registered_material_alpha
from showcase_registration import capacity, register

ROOT = Path('.artifacts/m2-4/newurban-rubble-continuous-r1-20261020')
GUIDE = Path('.artifacts/m2-4/newurban-building-rubble-native-batch87-v1')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
sources = {s['member']: s for s in read(GUIDE / 'source.json')['sources']}
work = read(ROOT / 'worklist.json')
contract = read(GUIDE / 'contract.json')
out = ROOT / 'probe-v2'
out.mkdir(exist_ok=False)
records = []
for job in read(ROOT / 'imagegen-jobs-v1.json')['jobs']:
    master_file = Path(job['destination'])
    if not master_file.is_file():
        continue
    master = Image.open(master_file).convert('RGBA')
    for key in job['members']:
        info = work['slots'][key]
        source = sources[info['member']]
        frame = source['frames'][3]
        rect, plate = register(master, info, job['boardSize'], isolated=len(job['members']) == 1)
        available = capacity(rect, info['nativeBounds'])
        assert available >= 4
        indices = np.fromfile(GUIDE / 'native' / frame['indexFile'], np.uint8).reshape(frame['size'][::-1])
        palette_file = GUIDE / 'native' / (contract['sources'][source['member']]['framePalettes']['3']['sha256'] + '.pal')
        palette = np.fromfile(palette_file, np.uint8).reshape(256, 3).astype(np.uint16) * 4
        for density in [2, 4]:
            rgba, evidence = register_rubble(plate, indices, info['nativeBounds'], density, palette,
                registered_material_alpha(master, rect))
            evidence['nativeAlphaAreaRatio'] = float(rgba[..., 3].sum() / 255 / density ** 2 / (indices != 0).sum())
            background = Image.new('RGBA', tuple(rgba.shape[1::-1]), (24, 31, 38, 255))
            background.alpha_composite(Image.fromarray(rgba))
            file = out / f'{key}-{density}x-r1.png'
            background.convert('RGB').save(file)
            records.append(dict(key=key, density=density, file=str(file), sha256=sha(file),
                masterSha256=sha(master_file), motherDensity=available, **evidence))
with (out / 'registration-v1.json').open('x') as stream:
    stream.write(json.dumps(dict(status='UNSELECTED_ACTUAL_DENSITY_MATERIAL_PROBE', records=records,
        userVisualAcceptance=False, m24Complete=False), indent=2) + '\n')
print(json.dumps(dict(probeFrames=len(records), minimumMotherDensity=min(row['motherDensity'] for row in records))))
