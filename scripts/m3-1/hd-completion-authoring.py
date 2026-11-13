"""Prepare M2-style original-pose guides and complete SHP family declarations."""
import hashlib
import json
import math
from pathlib import Path
import sys
from PIL import Image

base = Path(sys.argv[1]).resolve()
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
source_file = base / 'source/source.json'
source = read(source_file)
native = {s['member']: s for s in source['sources'] if s['format'] == 'shp'}
work_file = base / 'authoring-shp/worklist.json'
work = read(work_file)
contract = dict(schema='environment-shp-source-contract-v1', theater='URBAN', sources={}, families={}, identities={'ra2': {}, 'yr': {}}, aliases={})
for name, member in native.items():
    descriptor = {k: member[k] for k in ['sha256', 'canvas', 'totalFrames', 'bodyFrames', 'palette', 'hasShadow', 'remapable']}
    if member.get('framePalettes'):
        descriptor['framePalettes'] = member['framePalettes']
    contract['sources'][name] = descriptor
    identity = member['identity']
    family = 'campaign-sov01-' + identity.lower()
    basis = dict(theater='URBAN', members={name: descriptor}, identities=[identity])
    digest = hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    contract['families'][family] = dict(members=[name], identities=[identity], editions=['ra2'], kinds=[member['bindings'][0]['kind']],
        familyHash=digest, sourceScope={'campaignSourceSha256s': [source['missionSha256']]})
    contract['identities']['ra2'][identity] = family
with (base / 'new-shp-contract.json').open('x') as f:
    json.dump(contract, f, indent=2); f.write('\n')

jobs = []
plans = [('pentagon-a-normal-occupied', ['cuwa2a.shp-000', 'cuwa2a.shp-002'], [3072, 1536], 2, 1),
         ('pentagon-b-normal-damage', ['cuwa2b.shp-000', 'cuwa2b.shp-001'], [3072, 1024], 2, 1),
         ('pentagon-b-occupied-rubble', ['cuwa2b.shp-002', 'cuwa2b.shp-003'], [3072, 1024], 2, 1)]
bridge = [f'bridgb.urb-{i:03d}' for i in range(18)]
for i in range(0, 18, 4):
    keys = bridge[i:i + 4]
    plans.append((f'wood-bridge-{i // 4 + 1:02d}', keys, [3072, 1536] if len(keys) == 4 else [3072, 1024], 2, math.ceil(len(keys) / 2)))
for name, keys, size, columns, rows in plans:
    board = Image.new('RGBA', size)
    cw, ch = size[0] // columns, size[1] // rows
    for i, key in enumerate(keys):
        slot = work['slots'][key]
        member = native[slot['member']]
        frame = member['frames'][slot['nativeSlot']]
        image = Image.open(base / 'source/native' / frame['png']).convert('RGBA')
        # All transparent padding is native. Only the reference guide is enlarged.
        scale = min((cw - 64) / image.width, (ch - 64) / image.height)
        dimensions = tuple(round(n * scale) for n in image.size)
        x, y = i % columns * cw, i // columns * ch
        left, top = x + (cw - dimensions[0]) // 2, y + (ch - dimensions[1]) // 2
        board.alpha_composite(image.resize(dimensions, Image.Resampling.NEAREST), (left, top))
        slot.update(board=name + '-master.png', boardSize=size, slotRect=[x, y, cw, ch], referenceRect=[left, top, *dimensions], referenceCapacity=scale,
            rejectFluorescentFringe=True)
    reference = base / 'authoring-shp' / (name + '-reference.png')
    board.save(reference)
    work['batches'].append(dict(name=name, group='building' if name.startswith('pentagon') else 'overlay', boardSize=size, columns=columns, rows=rows,
        slots=keys, status='ORIGINAL_REFERENCE_READY'))
    prompt = ('Use case: precise-object-edit. Asset type: full-resolution original-frame-faithful isometric strategy game sprite sheet. '
        f'Edit target is this exact {size[0]} by {size[1]} transparent native guide, {columns} columns by {rows} rows, '
        f'row-major original states {", ".join(keys)}. Repaint only the shown original poses with genuine resolved surface detail, '
        'matching the original perspective, anatomy, colors, light, openings, thin members, damage, holes and occlusion. '
        'Retain every individual subject at the exact shown original position and scale. '
        + ('Resolve coherent brick, stone, roofing, glazing, columns and rubble in the adjacent accepted Pentagon finish. '
           'The sliced building wings and pre-existing rubble are intentional source geometry; do not build a complete Pentagon or fill missing wings. '
           'Native red occupied bands remain only in their original locations. ' if name.startswith('pentagon') else
           'Resolve weathered timber planks, beams, metal bolts, broken members and surviving railings. '
           'These are fixed original bridge phases, not redesigned bridges. Keep the sparse posts, cables, empty holes and frame-specific broken edges. '
           'Do not add road surfaces, concrete, stone piers, water, ground or supports that are absent from the exact source. ')
        + 'Do not introduce shadows, base platforms, labels, text, borders, grids, checkerboard, fire, smoke or colored edge halos. '
        'No enlargement/sharpening as a substitute for material detail. Preserve genuinely transparent background and gutters. '
        f'Output a high-resolution {size[0]} by {size[1]} image with this exact layout; fill the reference subject sizes, never shrink, crop, merge or reorder cells.')
    jobs.append(dict(id=name, reference=str(reference), referenceSha256=sha(reference), slots=keys,
        destination=str(base / 'authoring-shp' / (name + '-master.png')), prompt=prompt, status='AWAITING_BUILT_IN_IMAGEGEN'))
work['preparedSourceSha256'] = sha(source_file)
work_file.write_text(json.dumps(work, indent=2) + '\n')
with (base / 'authoring-jobs-v1.json').open('x') as f:
    json.dump(dict(schema='m3-1-native-gap-authoring-jobs-v1', jobs=jobs,
        earlierCandidate='The first square Pentagon A sheet is retained; only its sufficiently resolved damaged/rubble slots remain eligible.'), f, indent=2); f.write('\n')
print(json.dumps(dict(completeShpFamilies=3, nativeBodyFrames=26, remainingImagegenBoards=len(jobs), worklist=str(work_file))))
