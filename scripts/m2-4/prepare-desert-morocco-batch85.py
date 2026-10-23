"""Prepare all ten remaining Moroccan buildings with complete original states and HD-capacity guides."""
import copy
import hashlib
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image

base = Path('.artifacts/m2-4')
root = base / 'desert-morocco-native-batch85-v1'
art = base / 'desert-morocco-authoring-batch85-v1'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)


def write(file, value):
    with file.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


prior = base / 'legacy-faction-reuse-batch84-20261020/coverage-and-native-closure-v1.json'
closure = next(t for t in read(prior)['theaters'] if t['theater'] == 'DESERT')
groups = [g for g in closure['remainingGaps'] if g['member'].startswith('cgmorr')]
assert len(groups) == 10 and len(closure['remainingGaps']) == 14
guide_file = base / 'desert-native-v1/source.json'
guide = read(guide_file)
native_dir = guide_file.parent / 'native'
sources = {s['member']: s for s in guide['sources']}
inventory_file = base / 'accepted-faction-routing-batches79-80-20261019/inventory-current-v1/inventory.json'
inventory = read(inventory_file)
selected = read(Path('desktop/environment-desert-hd-contract.json'))
iso = '5d6e40fcd11a592a31494c635d93c21796cfe86a2743f0258b1f7d0aff850795'
assert sha(native_dir / (iso + '.pal')) == iso
root.mkdir(exist_ok=False)
art.mkdir(exist_ok=False)
os.symlink(native_dir.resolve(), root / 'native')
prepared = dict(schema=guide['schema'], theater='DESERT', inventoryFile=str(inventory_file),
    inventorySha256=sha(inventory_file), sources=[copy.deepcopy(sources[g['member']]) for g in groups],
    scope='Ten complete original Moroccan building families; no source, selection or coverage change.')
write(root / 'source.json', prepared)
contract = dict(schema=selected['schema'], theater='DESERT', preparedSourceSha256=sha(root / 'source.json'),
    sources={}, families={}, identities={'ra2': {}, 'yr': {}}, aliases={})
work = dict(schema='m2-2-shp-native-slot-worklist-v1', preparedSourceSha256=sha(root / 'source.json'),
    members=[], slots={}, batches=[], runtimeAcceptance='UNSELECTED_FULL_ARTWORK_AND_NATIVE_VALIDATION_PENDING')
profile = dict(schema='m2-4-desert-complete-building-material-profile-v1',
    nativeStructuralCoverage=dict(schema='native-structural-subpixel-coverage-v1',
        toleranceNativePixels=.7, maximumContourAreaChangeFraction=.025), nativeFrameTone={})
records = []
for group in sorted(groups, key=lambda g: g['member']):
    source = sources[group['member']]
    name, identity = source['member'], group['identities'][0]
    assert source['sha256'] == group['sha256'] and source['hasShadow'] and source['totalFrames'] == 8
    assert sha(native_dir / source['nativeFile']) == source['sha256']
    rows = [r for r in inventory['rows'] if r.get('theater') == 'DESERT'
        and r.get('source', {}).get('member') == name]
    assert rows and all(not r['dependencies'] for r in rows)
    assert all(b['role'] == 'body' and b['id'] == identity for b in source['bindings'])
    descriptor = {k: copy.deepcopy(source[k]) for k in ['sha256', 'canvas', 'totalFrames', 'palette', 'hasShadow', 'remapable']}
    descriptor['bodyFrames'] = 4
    descriptor['framePalettes'] = {'3': dict(member='isodes.pal', archive='ra2md.mix/cachemd.mix',
        sha256=iso, role='rubble', remapable=False, runtimeUsed=str(source['nativeRules'].get('LeaveRubble', '')).lower() in ['yes', 'true', '1'])}
    contract['sources'][name] = descriptor
    family = 'desert-' + identity.lower()
    contract['families'][family] = dict(members=[name], identities=[identity], editions=['yr'], kinds=['building'])
    contract['families'][family]['familyHash'] = hashlib.sha256(json.dumps(dict(theater='DESERT',
        members={name: descriptor}, identities=[identity]), separators=(',', ':'), sort_keys=True).encode()).hexdigest()
    contract['identities']['yr'][identity] = family
    slots, duplicates = [], []
    for frame in source['frames']:
        for file_key, hash_key in [('file', 'rgbaSha256'), ('indexFile', 'indexSha256')]:
            assert sha(native_dir / frame[file_key]) == frame[hash_key]
        if frame['slot'] >= 4:
            continue
        slot = frame['slot']
        indices = np.fromfile(native_dir / frame['indexFile'], np.uint8).reshape(*frame['size'][::-1])
        bounds = Image.fromarray((indices != 0).astype(np.uint8) * 255).getbbox()
        palette = descriptor.get('framePalettes', {}).get(str(slot), source['palette'])
        colors = np.fromfile(native_dir / (palette['sha256'] + '.pal'), np.uint8).reshape(256, 3).astype(np.uint16) * 4
        rgba = np.zeros((*indices.shape, 4), np.uint8)
        rgba[..., :3], rgba[..., 3] = colors[indices].astype(np.uint8), (indices != 0) * 255
        key = f'{name}-{slot:03d}'
        Image.fromarray(rgba).crop(bounds).save(art / (key + '-native.png'))
        work['slots'][key] = dict(member=name, nativeSlot=slot, nativeBounds=list(bounds), kind='building',
            group='desert-building', state=['normal', 'damaged', 'occupied', 'rubble'][slot],
            nativeMetadata=frame, sourceSha256=source['sha256'], rejectFluorescentFringe=True)
        slots.append(dict(slot=slot, key=key, status='AWAITING_NEW_CONTINUOUS_HD_MATERIAL'))
        earlier = next((f for f in source['frames'][:slot] if all(f[k] == frame[k] for k in
            ['origin', 'size', 'empty', 'rgbaSha256', 'indexSha256'])), None)
        if earlier:
            duplicates.append(dict(slot=slot, canonicalSlot=earlier['slot']))
    profile['nativeFrameTone'][name] = {'3': dict(sourceSha256=source['sha256'],
        indexSha256=source['frames'][3]['indexSha256'], paletteSha256=iso)}
    work['members'].append(dict(member=name, sourceSha256=source['sha256'], palette=source['palette'],
        bodyCount=4, totalNativeSlots=8, slots=slots,
        shadowPolicy='Untouched original separate shadow slots; no generated shadow substitute'))
    records.append(dict(identity=identity, member=name, sourceSha256=source['sha256'],
        canvas=source['canvas'], bodyFrames=4, shadowFrames=4, exactWithinSourceDuplicates=duplicates,
        canOccupy=str(source['nativeRules'].get('CanBeOccupied', '')).lower() in ['yes', 'true', '1'],
        leaveRubble=descriptor['framePalettes']['3']['runtimeUsed'], maps=group['maps']))

jobs = []
for record in records:
    name = record['member']
    shapes = [Image.open(art / f'{name}-{slot:03d}-native.png').size for slot in range(4)]
    standard_pair_capacity = min(1190 / max(w for w, _ in shapes[:2]), 1754 / sum(h for _, h in shapes[:2]))
    layouts = [[0, 1], [2, 3]] if standard_pair_capacity >= 4.4 else [[0, 3], [1], [2]]
    for slots in layouts:
        width, height = 1254, 1882 if len(slots) == 2 else 1254
        total_h = sum(shapes[s][1] for s in slots)
        usable_h = height - 64 * len(slots)
        scale = min((width - 64) / max(shapes[s][0] for s in slots), usable_h / total_h)
        assert scale >= 4.4, (name, slots, scale)
        job_id = name.replace('.shp', '') + '-' + '-'.join(map(str, slots)) + '-continuous-v1'
        board, top = Image.new('RGBA', (width, height)), 0
        keys, split = [], []
        for i, slot in enumerate(slots):
            key = f'{name}-{slot:03d}'
            sprite = Image.open(art / (key + '-native.png'))
            row_h = height - top if i == len(slots) - 1 else round(usable_h * sprite.height / total_h) + 64
            piece_size = tuple(round(n * scale) for n in sprite.size)
            x, y = (width - piece_size[0]) // 2, top + (row_h - piece_size[1]) // 2
            assert x >= 24 and y >= top + 24 and y + piece_size[1] <= top + row_h - 24
            board.alpha_composite(sprite.resize(piece_size, Image.Resampling.NEAREST), (x, y))
            work['slots'][key].update(board=job_id + '-master.png', boardSize=[width, height],
                slotRect=[0, top, width, row_h], referenceRect=[x, y, *piece_size], referenceCapacity=scale)
            keys.append(key)
            split.append(row_h)
            top += row_h
        reference = art / (job_id + '-reference.png')
        board.save(reference)
        states = ', '.join(work['slots'][key]['state'] for key in keys)
        prompt = (f'Use case: precise-object-edit. Asset type: high-resolution Red Alert 2 Desert Moroccan building sprites. '
            f'Image 1 is an ORIGINAL GEOMETRY AND COLOR REFERENCE ONLY for {record["identity"]}: '
            f'{len(keys)} vertically stacked subjects, top to bottom states: {states}. '
            'Redraw each original subject with genuinely new, continuous HD architecture and material. '
            'The chunky source pixel grid is an artifact of low resolution, NEVER an intended texture. '
            'Use broad clean plaster and stone planes, smooth precise wall edges, coherent straight cornices, '
            'proper rounded domes or arches where the original has them, readable windows and railings, '
            'and restrained physically meaningful material detail. Eliminate speckled grain, pixel staircases, '
            'crunchy outlines, random dots, regular decorative textures and repeated mosaic pixels. '
            'Preserve EXACT original identity, warm Desert palette, geometry, silhouette, isometric camera, '
            'roof and wall layout, relative scale, illumination from upper left, original state-specific '
            'damage openings, occupied fortifications and rubble arrangement. Rubble is the original low '
            'fragment/debris footprint in the provided correct Desert ISO colors, without any new standing '
            'building or new ground. Draw each subject as large as its guide, retaining transparent margins '
            'and transparent separation. Do not add surroundings, platforms, cast shadows, fire, smoke, '
            'text, labels, borders, grid lines, checkerboards or extra objects. No ordinary enlargement, '
            'sharpening, interpolation or copied native RGB mosaic as HD detail. '
            f'Output true transparent RGBA at {width} by {height} pixels. '
            + (f'Portrait 2:3 sheet; preserve the reference proportional row heights {split}, full canvas and large subjects, without squeezing into a square.'
               if len(keys) == 2 else 'Square sheet with one full-size subject.'))
        jobs.append(dict(id=job_id, family='desert-' + record['identity'].lower(),
            reference=str(reference.resolve()), referenceSha256=sha(reference), referenceRole='ORIGINAL_GEOMETRY_AND_PALETTE_ONLY',
            destination=str((art / (job_id + '-master.png')).resolve()), slots=keys, boardSize=[width, height],
            rowHeights=split, minimumReferenceCapacity=scale, mode='BUILT_IN_IMAGEGEN', prompt=prompt))
        work['batches'].append(dict(name=job_id, group='desert-building', boardSize=[width, height],
            columns=1, rows=len(slots), slots=keys, status='ORIGINAL_GUIDES_ONLY'))
assert len(work['slots']) == 40 and len(jobs) == 22
write(root / 'contract.json', contract)
write(art / 'worklist.json', work)
write(art / 'material-profile-v1.json', profile)
write(art / 'imagegen-jobs-v1.json', dict(schema='m2-4-desert-morocco-imagegen-jobs-v1',
    worklistSha256=sha(art / 'worklist.json'), jobs=jobs))
urban = read(Path('desktop/environment-urban-hd-contract.json'))
bench = sources['cgpark06.shp']
assert urban['sources']['cgpark06.shp']['sha256'] == bench['sha256']
preflight = dict(status='TEN_COMPLETE_ORIGINAL_FAMILIES_PREPARED_NEW_ART_PENDING_NO_COVERAGE_DELTA',
    priorClosure=pin(prior), originalGuide=pin(guide_file), preparedSource=pin(root / 'source.json'),
    currentSelectedPack=selected['selectedPack'], families=10, sourceBodyFrames=40, originalShadowFrames=40,
    expectedDensityFrames=80, plannedMothers=22, minimumReferenceCapacity=min(j['minimumReferenceCapacity'] for j in jobs),
    sourceOnlyReferencesNotNewHD=True, records=records, selectedResourcesChanged=False, coverageAdded=0,
    nextIndependentFamilies=[g for g in closure['remainingGaps'] if not g['member'].startswith('cgmorr')],
    acceptedBenchCandidate=dict(identity='CAPARK06', member='cgpark06.shp', sha256=bench['sha256'],
        authority='Urban complete source hash matches; fixed-palette, complete-family and native binding proof still required.'),
    windows='NOT_RUN', m24Complete=False)
write(base / 'desert-morocco-batch85-preflight-v1.json', preflight)
print(json.dumps(dict(families=10, originalBodyFrames=40, densityFramesPending=80,
    mothers=len(jobs), minimumReferenceCapacity=preflight['minimumReferenceCapacity'], coverageAdded=0)))
