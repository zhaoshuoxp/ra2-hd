"""Prepare eight original-only reference boards for ten genuinely different body states."""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path('.artifacts/m2-4/desert-final-buildings-native-batch86-v1')
ART = Path('.artifacts/m2-4/desert-final-buildings-authoring-batch86-v1')
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
guide = read(ROOT / 'source.json')
contract = read(ROOT / 'contract.json')
sources = {source['member']: source for source in guide['sources']}
slots, jobs = {}, []
layouts = [('cdairp.shp', [0], (1536, 1024)), ('cdairp.shp', [1], (1536, 1024)),
           ('cdairp.shp', [2, 3], (1024, 1536)),
           ('cdhse06.shp', [2, 3], (1024, 1536))]
layouts += [('cgegyp02.shp', [slot], (1536, 1024)) for slot in range(4)]
for member, numbers, size in layouts:
    source = sources[member]
    sprites = []
    for number in numbers:
        frame = source['frames'][number]
        indices = np.fromfile(ROOT / 'native' / frame['indexFile'], np.uint8).reshape(frame['size'][::-1])
        mask = (indices != 0) & (indices != 12)
        bounds = Image.fromarray(mask.astype(np.uint8) * 255).getbbox()
        assert bounds
        key = f'{member}-{number:03d}'
        image = Image.open(ART / (key + '-original-only.png')).convert('RGBA').crop(bounds)
        sprites.append((key, image, bounds, frame))
    width, height = size
    available_height = height - 64 * len(numbers)
    scale = min((width - 64) / max(image.width for _, image, _, _ in sprites),
                available_height / sum(image.height for _, image, _, _ in sprites))
    assert scale >= 4.4
    job_id = member.split('.')[0] + '-' + '-'.join(map(str, numbers)) + '-continuous-v1'
    board, top = Image.new('RGBA', size), 0
    row_heights, keys = [], []
    total_height = sum(image.height for _, image, _, _ in sprites)
    for index, (key, image, bounds, frame) in enumerate(sprites):
        row_height = height - top if index == len(sprites) - 1 else round(available_height * image.height / total_height) + 64
        enlarged = image.resize(tuple(round(value * scale) for value in image.size), Image.Resampling.NEAREST)
        x, y = (width - enlarged.width) // 2, top + (row_height - enlarged.height) // 2
        board.alpha_composite(enlarged, (x, y))
        number = frame['slot']
        state = ['normal', 'damaged', 'occupied', 'rubble'][number]
        if member == 'cdairp.shp' and number == 2:
            state = 'preserved original slot 2; original airport has no garrison state'
        slots[key] = dict(member=member, nativeSlot=number, nativeBounds=list(bounds),
            kind='building', group='desert-final-building', state=state, nativeMetadata=frame,
            sourceSha256=source['sha256'], board=job_id + '-master.png', boardSize=list(size),
            slotRect=[0, top, width, row_height], referenceRect=[x, y, enlarged.width, enlarged.height],
            referenceCapacity=scale)
        keys.append(key)
        row_heights.append(row_height)
        top += row_height
    reference = ART / (job_id + '-reference.png')
    board.save(reference)
    states = '; '.join(slots[key]['state'] for key in keys)
    prompt = ('Use case: precise-object-edit. Red Alert 2 HD reusable building sprite production. '
        f'Image 1 is ONLY the exact original geometry and palette guide for {member}. '
        f'{len(keys)} subject(s), top to bottom: {states}. '
        'Redraw as genuinely new continuous HD material, not enlarged or sharpened original pixels. '
        'Match the exact source identity, architecture, subject extents, isometric camera and upper-left light. '
        'Retain each pictured original hue, brightness relationship and contrast; no uniform warm recoloring. '
        'Use coherent large material planes, smooth precise structural edges and restrained readable detail. '
        'Preserve original roof, wall, opening, mechanical mount, damage and fortification arrangements. '
        'Damage is structural broken masonry or metal, never vegetation, moss or noisy dots. '
        'Rubble is the low source footprint in the provided Desert ISO palette, without a new standing structure. '
        'Do not add ground outside the exact footprint, cast shadows, fire, smoke, scenery, text, labels, frames, '
        'halos, glow, vignettes, checkerboards, pixel grids, repeated speckled texture or invented objects. '
        'True transparent RGBA outside every separate subject. '
        f'Output {width} by {height}, preserving the reference aspect ratio and large subject sizes. '
        f'Proportional row heights {row_heights}; keep transparent margins and gutters. ')
    if member == 'cgegyp02.shp':
        prompt += ('This is an Egyptian stepped pyramid: the regular architectural tiers are intentional. '
            'Keep the same tier count and geometry with long clean straight isometric slab edges and broad coherent '
            'sandstone faces. Eliminate low-resolution stair-step aliasing and pixel grain without smoothing away '
            'the actual stepped architecture. Preserve each source damaged breach and occupied addition exactly. ')
    if member == 'cdairp.shp':
        prompt += ('Airport body only. The rotating dish/pad mechanism and flag are separate original members. '
            'Do not add a dish, machinery or a flag that is absent from this exact body guide. ')
    jobs.append(dict(id=job_id, reference=str(reference.resolve()), referenceSha256=sha(reference),
        referenceRole='ORIGINAL_GEOMETRY_AND_PALETTE_ONLY_NOT_HD',
        destination=str((ART / (job_id + '-master.png')).resolve()), slots=keys,
        boardSize=list(size), rowHeights=row_heights, minimumReferenceCapacity=scale,
        mode='BUILT_IN_IMAGEGEN', prompt=prompt))
assert len(jobs) == 8 and len(slots) == 10
for name, value in [('body-worklist-v1.json', dict(schema='m2-4-body-authoring-preparation-v1',
    preparedSourceSha256=sha(ROOT / 'source.json'), slots=slots, status='TEN_NEW_BODY_STATES_ONLY_NOT_COMPLETE_FAMILY_EXPORT')),
    ('body-imagegen-jobs-v1.json', dict(schema='m2-4-desert-final-building-body-jobs-v1', jobs=jobs,
        policy='Original guides only until generated mothers pass measured 4X capacity. Airport active frames and exact accepted reuse are separate complete-family dependencies.'))]:
    with (ART / name).open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')
print(json.dumps(dict(boards=8, newBodyStates=10, minimumReferenceCapacity=min(job['minimumReferenceCapacity'] for job in jobs),
    selected=False, coverageAdded=0)))
