"""Prepare complete 2X/4X source-state guides with capacity-aware layouts for all sixteen remaining buildings."""
import copy
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def write(p, value):
    with p.open('x') as f:
        f.write(json.dumps(value, indent=2) + '\n')


base = Path('.artifacts/m2-4')
native = base / 'urban-buildings-native-batch60-v1'
art = base / 'urban-buildings-authoring-batch60-v1'
art.mkdir()
guide = read(native / 'source.json')
current = read(Path('desktop/environment-urban-hd-contract.json'))
assert len(current['families']) == 262 and len(guide['sources']) == 16
assert read(native / 'snow-body-reuse-v1.json')['eligibleVisibleSlots'] == 0
contract = dict(schema=current['schema'], theater='URBAN', preparedSourceSha256=sha(native / 'source.json'),
    sources={}, families={}, identities={'ra2': {}, 'yr': {}}, aliases={})
profile = dict(schema='m2-4-urban-complete-building-material-profile-v1',
    nativeStructuralCoverage=read(base / 'urban-buildings-authoring-batch56-v1/material-profile-v1.json')['nativeStructuralCoverage'], nativeFrameTone={})
work = dict(schema='m2-2-shp-native-slot-worklist-v1', preparedSourceSha256=sha(native / 'source.json'),
    members=[], slots={}, batches=[], runtimeAcceptance='UNSELECTED_COMPLETE_NEW_BUILDING_ART_PENDING')
iso = 'b1f4c15b7b91130736b4dffeb189ca32621bf606afbc0b2d02eb5584b6921fe3'
duplicates, layouts = [], []
for source in guide['sources']:
    name = source['member']
    identity, = {b['id'] for b in source['bindings']}
    assert source['totalFrames'] == 8 and source['hasShadow']
    assert sha(native / 'native' / source['nativeFile']) == source['sha256']
    descriptor = {k: copy.deepcopy(source[k]) for k in ['sha256', 'canvas', 'totalFrames', 'palette', 'hasShadow', 'remapable']}
    descriptor.update(bodyFrames=4, framePalettes={'3': dict(member='isourb.pal', archive='ra2.mix/cache.mix', sha256=iso,
        role='rubble', remapable=False, runtimeUsed=str(source['nativeRules'].get('LeaveRubble', '')).lower() in ['yes', 'true', '1'])})
    assert descriptor['framePalettes']['3']['runtimeUsed']
    contract['sources'][name] = descriptor
    family = 'urban-' + identity.lower()
    basis = dict(theater='URBAN', members={name: descriptor}, identities=[identity])
    editions = sorted({b['edition'] for b in source['bindings']})
    contract['families'][family] = dict(members=[name], identities=[identity], editions=editions, kinds=['building'],
        familyHash=hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest())
    for edition in editions:
        assert identity not in current['identities'][edition]
        contract['identities'][edition][identity] = family
    entries, unique = [], []
    for frame in source['frames'][:4]:
        slot = frame['slot']
        assert not frame['empty']
        assert sha(native / 'native' / frame['indexFile']) == frame['indexSha256']
        indices = np.frombuffer((native / 'native' / frame['indexFile']).read_bytes(), np.uint8).reshape(frame['size'][::-1])
        mask = (indices != 0) & (indices != 12)
        bounds = Image.fromarray(mask.astype(np.uint8) * 255).getbbox()
        palette = descriptor['framePalettes'].get(str(slot), descriptor['palette'])
        palette_file = native / 'native' / (palette['sha256'] + '.pal')
        assert sha(palette_file) == palette['sha256']
        colors = np.frombuffer(palette_file.read_bytes(), np.uint8).reshape(256, 3).astype(np.uint16) * 4
        rgba = np.zeros((*indices.shape, 4), np.uint8)
        rgba[:, :, :3] = colors[indices].astype(np.uint8)
        rgba[:, :, 3] = mask.astype(np.uint8) * 255
        key = f'{name}-{slot:03d}'
        Image.fromarray(rgba).crop(bounds).save(art / (key + '-native.png'))
        work['slots'][key] = dict(member=name, nativeSlot=slot, nativeBounds=list(bounds), nativeMetadata=frame,
            sourceSha256=source['sha256'], kind='building', group='urban-building',
            state=['normal', 'damaged', 'occupied', 'rubble'][slot])
        prior = next((f for f in source['frames'][:slot] if all(f[k] == frame[k] for k in
            ['origin', 'size', 'indexSha256', 'rgbaSha256', 'empty'])), None)
        entry = dict(slot=slot, key=key, status='AWAITING_AUTHORED_SLOT')
        if prior:
            entry.update(status='EXACT_NATIVE_DUPLICATE', canonical=prior['slot'])
            duplicates.append(dict(member=name, retainedSlot=slot, canonical=prior['slot'],
                sourceSha256=source['sha256'], indexSha256=frame['indexSha256'], rgbaSha256=frame['rgbaSha256']))
        else:
            unique.append(key)
        entries.append(entry)
    profile['nativeFrameTone'][name] = {'3': dict(sourceSha256=source['sha256'],
        indexSha256=source['frames'][3]['indexSha256'], paletteSha256=iso)}
    work['members'].append(dict(member=name, sourceSha256=source['sha256'], palette=source['palette'],
        bodyCount=4, totalNativeSlots=8, slots=entries, shadowPolicy='All four untouched original shadow slots retained'))
    cursor = 0
    while cursor < len(unique):
        pair = unique[cursor:cursor + 2]
        candidates = []
        if len(pair) == 2:
            for columns, rows, width, height in [(1, 2, 1254, 1880), (2, 1, 1880, 1254)]:
                sprites = [Image.open(art / (key + '-native.png')) for key in pair]
                capacities = [min((width // columns - 48) / im.width, (height // rows - 48) / im.height) for im in sprites]
                candidates.append((min(capacities), columns, rows, width, height))
        best = max(candidates) if candidates else None
        if best and best[0] >= 5.0:
            _, columns, rows, width, height = best
            layouts.append((pair, columns, rows, width, height))
            cursor += 2
        else:
            key = unique[cursor]
            im = Image.open(art / (key + '-native.png'))
            single_options = [(min((w - 48) / im.width, (h - 48) / im.height), w, h)
                for w, h in [(1254, 1880), (1880, 1254)]]
            available, width, height = max(single_options)
            assert available >= 5.0, (key, im.size, single_options)
            layouts.append(([key], 1, 1, width, height))
            cursor += 1
jobs = []
for number, (keys, columns, rows, width, height) in enumerate(layouts, 1):
    cw, ch = width // columns, height // rows
    board = Image.new('RGBA', (width, height))
    name = f'urban-buildings-batch60-{number:02d}'
    capacities = []
    for i, key in enumerate(keys):
        im = Image.open(art / (key + '-native.png'))
        scale = min((cw - 48) / im.width, (ch - 48) / im.height)
        size = tuple(round(v * scale) for v in im.size)
        left, top = i % columns * cw, i // columns * ch
        x, y = left + (cw - size[0]) // 2, top + (ch - size[1]) // 2
        board.alpha_composite(im.resize(size, Image.Resampling.NEAREST), (x, y))
        capacities.append(scale)
        work['slots'][key].update(board=name + '-master.png', boardSize=[width, height],
            slotRect=[left, top, cw, ch], referenceRect=[x, y, *size], referenceCapacity=scale)
    reference = art / (name + '-reference.png')
    board.save(reference)
    prompt = ('Use case: precise-object-edit. Asset type: reusable high-resolution Red Alert 2 Urban building sprites. '
        f'Edit target: this exact original native guide, {columns} columns and {rows} rows, row-major states {", ".join(keys)}. '
        'Repaint each original architecture and damage state with genuinely resolved masonry, roofing, metal, glazing '
        'and structural details for independently authored 2X and 4X game sprites. Keep exact original native isometric '
        'view, silhouette, height-to-width proportions, building divisions, surviving fragments, openings and state-specific '
        'sandbag fortifications. Preserve original colors and upper-left light with restrained coherent material detail. '
        'Rubble remains its exact original low debris arrangement, surviving structural fragments and actual Iso colors. '
        'Retain all source fragments, thin members, rooftop features and original signs as shown. Do not redesign, '
        'shorten tall buildings, invent snow, decorative patterns, extra objects, replacement buildings, ground planes, '
        'cast shadows, fire, smoke, glow, labels, grid, borders or checkerboards. Do not substitute enlargement or sharpening '
        'for new material detail. Preserve full subject scale and position in every equal reference cell, with fully '
        'transparent gutters and generous outer margins. '
        f'Output a true transparent {width} by {height} sprite sheet with the exact reference aspect ratio. '
        'Do not shrink subjects or connect separate cells.')
    jobs.append(dict(id=name, slots=keys, boardSize=[width, height], cellLayout=[columns, rows],
        reference=str(reference.resolve()), referenceSha256=sha(reference),
        destination=str((art / (name + '-master.png')).resolve()), minimumReferenceCapacity=min(capacities), prompt=prompt))
    work['batches'].append(dict(name=name, group='urban-building', boardSize=[width, height], columns=columns,
        rows=rows, slots=keys, status='ORIGINAL_GUIDES_ONLY'))
for duplicate in duplicates:
    old = work['slots'][f"{duplicate['member']}-{duplicate['canonical']:03d}"]
    work['slots'][f"{duplicate['member']}-{duplicate['retainedSlot']:03d}"].update({k: copy.deepcopy(old[k]) for k in
        ['board', 'boardSize', 'slotRect', 'referenceRect', 'referenceCapacity']})
assert len(work['slots']) == 64 and len(duplicates) == 1
write(native / 'contract.json', contract)
write(art / 'worklist.json', work)
write(art / 'material-profile-v1.json', profile)
write(art / 'imagegen-jobs-v1.json', dict(schema='m2-4-urban-building-imagegen-jobs-v1', jobs=jobs))
write(art / 'exact-native-duplicates-v1.json', dict(status='PASS_EXACT_ORIGINAL_DUPLICATE_RETAINED', rows=duplicates))
write(base / 'urban-buildings-batch60-authoring-preflight-v1.json', dict(status='UNSELECTED_COMPLETE_ORIGINAL_GUIDES_READY',
    families=16, sourceBodySlots=64, distinctNewMaterials=63, densityFrames=128, mothers=len(jobs),
    minimumReferenceCapacity=min(j['minimumReferenceCapacity'] for j in jobs), originalShadows=64,
    currentSelectedPack=current['selectedPack'], selectedResourcesChanged=False, technicalCoverageAdded=0,
    windows='NOT_RUN', m24Complete=False))
print(json.dumps(dict(families=16, sourceBodySlots=64, mothers=len(jobs),
    minimumReferenceCapacity=min(j['minimumReferenceCapacity'] for j in jobs), selected=False)))
