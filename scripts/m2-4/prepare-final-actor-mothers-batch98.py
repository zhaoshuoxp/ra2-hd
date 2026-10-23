"""Prepare native pose references; exact repeated poses share authored material only."""
import copy
import hashlib
import os
from pathlib import Path

import numpy as np
from PIL import Image
from newurban_batch89_io import pin, read, write

ROOT = Path('.artifacts/m2-4/newurban-final-actors-batch98-20261021')
GUIDE = Path('.artifacts/m2-4/newurban-native-v1')
guide = read(GUIDE / 'source.json')
sources = [copy.deepcopy(s) for s in guide['sources'] if s['member'] in ['civ1.shp', 'dnoa.shp', 'ggfwll.shp']]
assert len(sources) == 3
os.symlink((GUIDE / 'native').resolve(), ROOT / 'native')
write(ROOT / 'source-v1.json', dict(schema=guide['schema'], theater='NEWURBAN', sources=sources,
    originalGuide=pin(GUIDE / 'source.json'), status='ORIGINAL_INPUTS_NOT_COVERAGE'))
for name, file in [('baseline-contract.json', 'desktop/environment-newurban-hd-contract.json'),
                   ('baseline-selector.json', '.local/environment-newurban-selection.json')]:
    with (ROOT / name).open('xb') as stream:
        stream.write(Path(file).read_bytes())
jobs, poses = [], {}
audit = read(ROOT / 'original-sequences-and-smudges-v1.json')
for source in sources:
    name = source['member']
    if name == 'ggfwll.shp':
        continue
    actor = next(a for a in audit['actors'] if a['member'] == name)
    palette = np.fromfile(ROOT / 'native' / (source['palette']['sha256'] + '.pal'), np.uint8).reshape(256, 3).astype(np.uint16) * 4
    unique = {}
    groups = {'ordinary': [], 'wide': []}
    for slot in actor['declaredSequenceFrames']:
        frame = source['frames'][slot]
        file = ROOT / 'native' / frame['indexFile']
        assert pin(file)['sha256'] == frame['indexSha256']
        indices = np.fromfile(file, np.uint8).reshape(frame['size'][::-1])
        body = (indices != 0) & (indices != 12)
        bounds = Image.fromarray(body.astype(np.uint8) * 255).getbbox()
        assert bounds
        key = (tuple(frame['size']), frame['indexSha256'], source['palette']['sha256'])
        canonical = unique.setdefault(key, f'{name}-{slot:03d}')
        pose_key = f'{name}-{slot:03d}'
        poses[pose_key] = dict(member=name, slot=slot, canonical=canonical, nativeBounds=list(bounds),
            sourceFrame=frame, nativeIndex=pin(file))
        if canonical != pose_key:
            continue
        left, top, right, bottom = bounds
        kind = 'wide' if name == 'dnoa.shp' and max(right - left, bottom - top) > 149 else 'ordinary'
        groups[kind].append(pose_key)
        pixels = np.dstack((palette[indices], body.astype(np.uint8) * 255)).astype(np.uint8)
        Image.fromarray(pixels).crop(bounds).save(ROOT / (pose_key + '-native-reference.png'))
    for kind, keys in groups.items():
        columns, rows = (6, 6) if name == 'civ1.shp' else (2, 3) if kind == 'wide' else (3, 3)
        per_sheet = columns * rows
        for start in range(0, len(keys), per_sheet):
            selected = keys[start:start + per_sheet]
            board = Image.new('RGBA', (2048, 2048))
            stem = f'{name.replace(".", "-")}-{kind}-{start // per_sheet + 1:02d}'
            subjects = []
            for cell, key in enumerate(selected):
                image = Image.open(ROOT / (key + '-native-reference.png')).convert('RGBA')
                x, y = cell % columns * 2048 // columns, cell // columns * 2048 // rows
                cw = (cell % columns + 1) * 2048 // columns - x
                ch = (cell // columns + 1) * 2048 // rows - y
                scale = min((cw - 48) / image.width, (ch - 48) / image.height)
                assert scale >= 4.2
                size = tuple(round(n * scale) for n in image.size)
                pos = (x + (cw - size[0]) // 2, y + (ch - size[1]) // 2)
                board.alpha_composite(image.resize(size, Image.Resampling.NEAREST), pos)
                poses[key].update(board=stem + '-mother-v1.png', cell=[x, y, cw, ch])
                subjects.append(dict(key=key, slot=poses[key]['slot'], cell=[x, y, cw, ch],
                    nativeBounds=poses[key]['nativeBounds'], referenceRect=[*pos, *size], referenceCapacity=scale))
            reference = ROOT / (stem + '-reference-v1.png')
            board.save(reference)
            identity = 'CIV1 red-haired civilian woman, warm yellow/tan sleeveless top, tan trousers and white shoes' if name == 'civ1.shp' else 'DNOA original brown Tyrannosaurus with pale underside, large head, short forearms, two powerful hind legs and long rigid tapered tail'
            prompt = (f'Use case: precise-object-edit. Asset type: original-pose-faithful Red Alert 2 HD sprite atlas. '
                f'Edit target: exact supplied 2048 square guide with {columns} columns, {rows} rows and {len(selected)} occupied cells, row-major. '
                f'Redraw {identity}. Every occupied cell retains its OWN exact original facing, pose, limb locations, head angle, body proportions, '
                'motion phase and state, including fallen/death poses where shown. Keep all occupied and empty cells in place, with the same scale and margins. '
                'Resolve continuous smooth geometry, clear coherent material, antialiased silhouette and upper-left illumination. '
                'Native square blocks and coarse flecks are low-resolution artifacts: eliminate them, do not trace enlarged pixels or add granular noise. '
                'Keep original fixed colors, silhouette character and anatomy. Maintain consistent subject identity and costume across all frames. '
                'The guide is authoritative for each pose, including unusual bent/fallen states. Never substitute a standing figure for a prone/fallen pose. '
                'No ground plane, shadow, text, labels, grid, borders, watermark, new props or extra figures. Transparent background. '
                'Export at the full 2048 square resolution; figures should occupy the same generous fraction of their own cells as the supplied guide.')
            jobs.append(dict(id=stem, member=name, reference=pin(reference), destination=str(ROOT / (stem + '-mother-v1.png')),
                columns=columns, rows=rows, occupied=len(selected), subjects=subjects, prompt=prompt))
write(ROOT / 'pose-worklist-v1.json', dict(status='PREPARED_NOT_AUTHORED', poses=poses,
    source=pin(ROOT / 'source-v1.json'), sequenceAudit=pin(ROOT / 'original-sequences-and-smudges-v1.json'),
    compatibilityPolicy='DNOA slots 212-423 are never selected by the untouched TrexSequence and retain uncredited original compatibility data. NoShadow remains unchanged. Every declared body phase is required.',
    wallPolicy='Reuse accepted Yuri fortress-wall material after exact source, all used colors and complete 48-state validation.',
    coverageAdded=0, windows='NOT_RUN', m24Complete=False))
write(ROOT / 'mother-jobs-v1.json', dict(status='PREPARED_NOT_AUTHORED', jobs=jobs))
print(dict(declaredFrames=len(poses), distinctPoses=sum(p['canonical'] == key for key, p in poses.items()),
    mothers=len(jobs), civilianJobs=sum(j['member'] == 'civ1.shp' for j in jobs),
    dinosaurJobs=sum(j['member'] == 'dnoa.shp' for j in jobs)))
