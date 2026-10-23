"""Retain native and accepted structural guides for the final NewUrban buildings."""
import copy
import os
from pathlib import Path

import numpy as np
from PIL import Image
from newurban_batch89_io import crop, pin, read, write

ROOT = Path('.artifacts/m2-4/newurban-remaining-actors-batch97-20261021')
GUIDE = Path('.artifacts/m2-4/newurban-native-v1')
screen = read(ROOT / 'reuse-screen-v3.json')
guide = read(GUIDE / 'source.json')
sources = {s['member']: s for s in guide['sources']}
chosen = [r for r in screen['rows'] if r['kind'] == 'building']
identities = {identity for r in chosen for identity in r['identities']}
complete = [s for s in guide['sources'] if any(b['id'] in identities for b in s['bindings'])]
assert len(chosen) == 13 and len(complete) == 14
if not (ROOT / 'native').exists():
    os.symlink((GUIDE / 'native').resolve(), ROOT / 'native')
for name, path in [('baseline-contract.json', 'desktop/environment-newurban-hd-contract.json'),
                   ('baseline-selector.json', '.local/environment-newurban-selection.json')]:
    with (ROOT / name).open('xb') as stream:
        stream.write(Path(path).read_bytes())
write(ROOT / 'source-v1.json', dict(schema=guide['schema'], theater='NEWURBAN',
    originalGuide=pin(GUIDE / 'source.json'), sources=complete))
jobs = []
iso = np.fromfile(GUIDE / 'native/1aa49468a9439a5cff3e5f66fae0678501e9dc3ef7a4d90f23127c38ad6e4676.pal', np.uint8).reshape(256, 3).astype(np.uint16) * 4
for row in chosen:
    source = sources[row['member']]
    count = row['bodyFrames']
    groups = [[0], [1], [3]] if source['member'] == 'cnnewy04.shp' else [list(range(count))]
    for slots in groups:
        width = height = 2048
        columns = 1 if len(slots) == 1 else 2
        rows = (len(slots) + columns - 1) // columns
        cell_width, cell_height = width // columns, height // rows
        board = Image.new('RGBA', (width, height))
        accepted_board = Image.new('RGBA', board.size)
        subjects = []
        for index, slot in enumerate(slots):
            frame = source['frames'][slot]
            indices = np.fromfile(GUIDE / 'native' / frame['indexFile'], np.uint8).reshape(frame['size'][::-1])
            palette = iso if slot == 3 else np.fromfile(GUIDE / 'native' / (source['palette']['sha256'] + '.pal'), np.uint8).reshape(256, 3).astype(np.uint16) * 4
            pixels = np.dstack((palette[indices], (indices != 0).astype(np.uint8) * 255)).astype(np.uint8)
            active = (indices != 0) & (indices != 12 if slot != 3 else True)
            yy, xx = np.where(active)
            bounds = [int(xx.min()), int(yy.min()), int(xx.max() + 1), int(yy.max() + 1)]
            left, top, right, bottom = bounds
            sample = Image.fromarray(pixels[top:bottom, left:right])
            scale = min((cell_width - 96) / sample.width, (cell_height - 96) / sample.height)
            sample = sample.resize((round(sample.width * scale), round(sample.height * scale)), Image.Resampling.NEAREST)
            cx, cy = (index % columns) * cell_width, (index // columns) * cell_height
            pos = (cx + (cell_width - sample.width) // 2, cy + (cell_height - sample.height) // 2)
            board.alpha_composite(sample, pos)
            if row['acceptedCandidates']:
                metadata = Path(row['acceptedCandidates'][0]['members'][0]['metadata']['file'])
                accepted = Image.fromarray(crop(metadata, slot, 4))
                accepted.thumbnail((cell_width - 96, cell_height - 96), Image.Resampling.LANCZOS)
                accepted_board.alpha_composite(accepted,
                    (cx + (cell_width - accepted.width) // 2, cy + (cell_height - accepted.height) // 2))
            subjects.append(dict(member=source['member'], slot=slot, nativeBounds=bounds,
                nativeIndex=pin(GUIDE / 'native' / frame['indexFile']),
                cell=[cx, cy, cell_width, cell_height], palette='isoubn.pal' if slot == 3 else source['palette']['member']))
        stem = source['member'].replace('.', '-') + ('-slot' + str(slots[0]) if len(groups) > 1 else '')
        reference = ROOT / (stem + '-original-reference-v1.png')
        assert not reference.exists()
        board.save(reference)
        accepted_reference = None
        if row['acceptedCandidates']:
            accepted_reference = ROOT / (stem + '-accepted-snow-reference-v1.png')
            accepted_board.save(accepted_reference)
        request = dict(
            promptVersion='m2-4-final-building-family-v1',
            role=row['name'], source=source['member'], subjects=subjects,
            originalReference=pin(reference),
            acceptedStructuralReference=pin(accepted_reference) if accepted_reference else None,
            originalRgbUsedAsNewDetail=False,
            outputLayout='2048 square transparent sheet; preserve the input cells, order, isometric camera, proportions, state anatomy and lighting; each object fills its cell with a clear margin.',
            material='Continuous sculpted surfaces and coherent fine material detail at true HD resolution; smooth lines and antialiased contours. Native pixel stair steps, quantization flecks and granular stippling are reference artifacts, not surface texture.',
            preservation='Native canvas, trims, source bytes, owner regions, original shadows, collision, timing, object restrictions and original maps remain authoritative and unchanged.')
        jobs.append(dict(id=stem, request=request, destination=str(ROOT / (stem + '-mother-v1.png')),
            subjects=subjects, originalReference=pin(reference),
            acceptedStructuralReference=pin(accepted_reference) if accepted_reference else None))
write(ROOT / 'mother-jobs-v1.json', dict(schema='m2-4-batch97-mother-jobs-v1',
    status='PREPARED_NOT_AUTHORED', source=pin(ROOT / 'source-v1.json'),
    selectedBuildingFamilies=13, linkedMembers=1, inheritedStructures=4, jobs=jobs,
    statueDamagedAndUnusedOccupiedShareOriginalBytes=bool(np.array_equal(
        np.fromfile(GUIDE / 'native' / sources['cnnewy04.shp']['frames'][1]['indexFile'], np.uint8),
        np.fromfile(GUIDE / 'native' / sources['cnnewy04.shp']['frames'][2]['indexFile'], np.uint8))),
    originalRgbUsedAsNewDetail=False, windows='NOT_RUN', m24Complete=False))
print(dict(families=13, members=14, motherJobs=len(jobs), acceptedStructures=4))
