"""Replan source-only guides around measured built-in output sizes before 4X production."""
import copy
import hashlib
import json
from pathlib import Path

from PIL import Image

art = Path('.artifacts/m2-4/desert-morocco-authoring-batch85-v1')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
work = read(art / 'worklist.json')
with (art / 'worklist-before-layout-v3.json').open('xb') as stream:
    stream.write((art / 'worklist.json').read_bytes())
old_jobs = read(art / 'imagegen-jobs-v1.json')
failed = art / 'cgmorr01-0-1-continuous-v1-master.png'
assert Image.open(failed).size == (1024, 1536)
diagnostic = dict(status='FIRST_PORTRAIT_PAIR_REJECTED_FOR_INSUFFICIENT_4X_CAPACITY',
    file=str(failed), sha256=sha(failed), actualSize=[1024, 1536], requestedSize=[1254, 1882],
    measuredCapacities={'cgmorr01.shp-000': 3.7433155080213902, 'cgmorr01.shp-001': 3.7433155080213902},
    transparentBackground='Alpha-zero background retains hidden RGB; this is not an opaque background failure.',
    useInSelectedResources=False, correction='Plan actual 1024x1536 or 1536x1024 canvases and provide larger subjects; preserve original gray-green facade colors without a warm recolor.',
    originalMapOrGameplayChanges=False)
assert read(art / 'mother-resolution-attempt-v1.json') == diagnostic
work['batches'] = []
jobs = []
for member in work['members']:
    name = member['member']
    shapes = [Image.open(art / f'{name}-{s:03d}-native.png').size for s in range(4)]
    capacity = lambda slots: min(960 / max(shapes[s][0] for s in slots),
        (1536 - 64 * len(slots)) / sum(shapes[s][1] for s in slots))
    layouts = [[0, 1], [2, 3]] if capacity([0, 1]) >= 4.4 and capacity([2, 3]) >= 4.4 else [[0, 3], [1], [2]]
    if any(len(slots) == 2 and capacity(slots) < 4.4 for slots in layouts):
        layouts = [[slot] for slot in range(4)]
    for slots in layouts:
        width, height = (1024, 1536) if len(slots) == 2 or shapes[slots[0]][1] >= shapes[slots[0]][0] else (1536, 1024)
        total_h = sum(shapes[s][1] for s in slots)
        usable_h = height - 64 * len(slots)
        scale = min((width - 64) / max(shapes[s][0] for s in slots), usable_h / total_h)
        assert scale >= 4.4, (name, slots, scale)
        job_id = name.replace('.shp', '') + '-' + '-'.join(map(str, slots)) + '-continuous-v3'
        board, top, keys, splits = Image.new('RGBA', (width, height)), 0, [], []
        for i, slot in enumerate(slots):
            key = f'{name}-{slot:03d}'
            sprite = Image.open(art / (key + '-native.png'))
            row_h = height - top if i == len(slots) - 1 else round(usable_h * sprite.height / total_h) + 64
            size = tuple(round(n * scale) for n in sprite.size)
            x, y = (width - size[0]) // 2, top + (row_h - size[1]) // 2
            board.alpha_composite(sprite.resize(size, Image.Resampling.NEAREST), (x, y))
            work['slots'][key].update(board=job_id + '-master.png', boardSize=[width, height],
                slotRect=[0, top, width, row_h], referenceRect=[x, y, *size], referenceCapacity=scale)
            keys.append(key)
            splits.append(row_h)
            top += row_h
        reference = art / (job_id + '-reference.png')
        board.save(reference)
        states = ', '.join(work['slots'][key]['state'] for key in keys)
        prompt = ('Use case: precise-object-edit. Create production Red Alert 2 HD building sprites. '
            f'Image 1 is ONLY the exact original geometry and palette reference for {name}: '
            f'{len(keys)} subjects vertically, states top to bottom: {states}. '
            'Completely redraw the pixelated material as clean continuous HD architecture. '
            'Keep EXACT original colors: the source gray-green or olive-gray facade, charcoal roofs, '
            'pale gray cornices and faded base colors stay as shown; do not recolor the building beige '
            'or brighten it into a warm studio render. Source pixel blocks are low-resolution artifacts, '
            'not wall texture. Draw coherent smooth plaster and stone planes, precise cornices and '
            'window edges, proper structural corners, restrained real material variation and readable '
            'state damage. Keep exact source isometric camera, silhouette, architecture, openings, '
            'window counts, roof equipment, upper-left illumination, damage holes and occupied '
            'fortifications. Rubble keeps the source flat fragment arrangement, footprint and source '
            'Desert ISO palette, with no invented standing structure. Do not add grounds, platforms, '
            'cast shadows, halos, glow, vignette, studio background, text, fire, smoke, borders, labels, '
            'checkerboard or extra objects. No pixel grid, chunky outlines, pebbled noise, decorative '
            'patterns, sharpened original pixels or ordinary interpolation as new material. '
            'Use true transparent alpha outside each cutout, with transparent margins and separation. '
            f'Deliver {width}x{height} RGBA, same aspect ratio and exact large subject extents as the reference. '
            + (f'Portrait sheet with proportional row heights {splits}; do not shrink either subject or squeeze into square.'
               if len(keys) == 2 else 'One subject filling the reference extent, with the same generous scale.'))
        jobs.append(dict(id=job_id, reference=str(reference.resolve()), referenceSha256=sha(reference),
            referenceRole='ORIGINAL_GEOMETRY_AND_PALETTE_ONLY', destination=str((art / (job_id + '-master.png')).resolve()),
            slots=keys, boardSize=[width, height], rowHeights=splits, minimumReferenceCapacity=scale,
            mode='BUILT_IN_IMAGEGEN', prompt=prompt))
        work['batches'].append(dict(name=job_id, group='desert-building', boardSize=[width, height],
            columns=1, rows=len(slots), slots=keys, status='ORIGINAL_GUIDES_ONLY'))
assert len(jobs) == 27 and len(work['slots']) == 40
(art / 'worklist.json').write_text(json.dumps(work, indent=2) + '\n')
with (art / 'imagegen-jobs-v3.json').open('x') as stream:
    stream.write(json.dumps(dict(schema=old_jobs['schema'], supersedes='imagegen-jobs-v1.json',
        worklistSha256=sha(art / 'worklist.json'), jobs=jobs), indent=2) + '\n')
print(json.dumps(dict(jobs=len(jobs), bodyStates=40, minimumReferenceCapacity=min(j['minimumReferenceCapacity'] for j in jobs),
    candidateOrSelectionChanged=False)))
