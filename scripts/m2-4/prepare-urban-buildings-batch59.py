"""Prepare sixteen complete Urban families without modifying original maps or sources."""
import copy
import hashlib
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def write(file, value):
    with file.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


base = Path('.artifacts/m2-4')
root = base / 'urban-buildings-native-batch59-v1'
art = base / 'urban-buildings-authoring-batch59-v1'
guide_file = base / 'urban-civilians-native-batch49-v1/source.json'
audit_file = Path('docs/m2-4-urban-remaining-after-batch56-20261016.json')
identities = 'CALIT01E CAPOL01S CAPARK04 CAPARK05 CAPARK06 CARUS02A CARUS02B CARUS02G CAMISC06 CATEXS02 CAPARS04 CAPARS05 CAPARS12 CALA07 CALA08 CALA14'.split()
current = read(Path('desktop/environment-urban-hd-contract.json'))
assert len(current['families']) == 246
assert read(Path('docs/m2-4-urban-edition-buildings-batch58-20261016.json'))['visual'] == 'USER_ACCEPTED'
guide = read(guide_file)
sources = [copy.deepcopy(next(s for s in guide['sources'] if {b['id'] for b in s['bindings']} == {identity})) for identity in identities]
assert len(sources) == 16 and len({s['member'] for s in sources}) == 16
inventory = read(base / 'inventory-urban-side-roads-v1/inventory.json')
root.mkdir(exist_ok=False)
art.mkdir(exist_ok=False)
os.symlink((guide_file.parent / 'native').resolve(), root / 'native')
for source in sources:
    rows = [r for r in inventory['rows'] if r.get('theater') == 'URBAN' and r.get('source', {}).get('member') == source['member']]
    assert rows and all(not r.get('dependencies') and r['source']['sha256'] == source['sha256'] for r in rows)
    assert source['hasShadow'] and all(b['role'] == 'body' for b in source['bindings'])
write(root / 'source.json', dict(schema=guide['schema'], theater='URBAN', sources=sources,
    inventoryFile=str(audit_file), inventorySha256=sha(audit_file),
    scope='Sixteen complete original single-member Urban building families, including all body and shadow slots.'))
contract = dict(schema=current['schema'], theater='URBAN', preparedSourceSha256=sha(root / 'source.json'),
    sources={}, families={}, identities={'ra2': {}, 'yr': {}}, aliases={})
profile = dict(schema='m2-4-urban-complete-building-material-profile-v1',
    nativeStructuralCoverage=read(base / 'urban-buildings-authoring-batch56-v1/material-profile-v1.json')['nativeStructuralCoverage'], nativeFrameTone={})
work = dict(schema='m2-2-shp-native-slot-worklist-v1', preparedSourceSha256=sha(root / 'source.json'),
    members=[], slots={}, batches=[], runtimeAcceptance='UNSELECTED_NEW_COMPLETE_BODY_ART_PENDING')
iso = 'b1f4c15b7b91130736b4dffeb189ca32621bf606afbc0b2d02eb5584b6921fe3'
duplicates, layouts = [], []
small = []
for source, identity in zip(sources, identities):
    name = source['member']
    count = source['totalFrames'] // 2
    assert count in [1, 3, 4] and sha(root / 'native' / source['nativeFile']) == source['sha256']
    descriptor = {k: copy.deepcopy(source[k]) for k in ['sha256', 'canvas', 'totalFrames', 'palette', 'hasShadow', 'remapable']}
    descriptor['bodyFrames'] = count
    if count == 4:
        descriptor['framePalettes'] = {'3': dict(member='isourb.pal', archive='ra2.mix/cache.mix', sha256=iso,
            role='rubble', remapable=False, runtimeUsed=str(source['nativeRules'].get('LeaveRubble', '')).lower() in ['yes', 'true', '1'])}
    contract['sources'][name] = descriptor
    family = 'urban-' + identity.lower()
    editions = sorted({b['edition'] for b in source['bindings']})
    basis = dict(theater='URBAN', members={name: descriptor}, identities=[identity])
    contract['families'][family] = dict(members=[name], identities=[identity], editions=editions, kinds=['building'],
        familyHash=hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest())
    for edition in editions:
        assert identity not in current['identities'][edition]
        contract['identities'][edition][identity] = family
    entries, unique = [], []
    for frame in source['frames'][:count]:
        number = frame['slot']
        assert not frame['empty']
        assert sha(root / 'native' / frame['indexFile']) == frame['indexSha256']
        assert sha(root / 'native' / frame['file']) == frame['rgbaSha256']
        indices = np.frombuffer((root / 'native' / frame['indexFile']).read_bytes(), np.uint8).reshape(frame['size'][::-1])
        mask = (indices != 0) & (indices != 12)
        bounds = Image.fromarray(mask.astype(np.uint8) * 255).getbbox()
        palette = descriptor.get('framePalettes', {}).get(str(number), descriptor['palette'])
        palette_file = root / 'native' / (palette['sha256'] + '.pal')
        assert sha(palette_file) == palette['sha256']
        colors = np.frombuffer(palette_file.read_bytes(), np.uint8).reshape(256, 3).astype(np.uint16) * 4
        rgba = np.zeros((*indices.shape, 4), np.uint8)
        rgba[..., :3] = colors[indices].astype(np.uint8)
        rgba[..., 3] = mask.astype(np.uint8) * 255
        key = f'{name}-{number:03d}'
        Image.fromarray(rgba).crop(bounds).save(art / (key + '-native.png'))
        work['slots'][key] = dict(member=name, nativeSlot=number, nativeBounds=list(bounds), kind='building',
            group='urban-building', state=['normal', 'damaged', 'occupied', 'rubble'][number],
            nativeMetadata=frame, sourceSha256=source['sha256'])
        prior = next((f for f in source['frames'][:number] if all(f[k] == frame[k] for k in
            ['origin', 'size', 'indexSha256', 'rgbaSha256', 'empty'])), None)
        entry = dict(slot=number, key=key, status='AWAITING_AUTHORED_SLOT')
        if prior:
            entry.update(status='EXACT_NATIVE_DUPLICATE', canonical=prior['slot'])
            duplicates.append(dict(member=name, sourceSha256=source['sha256'], retainedSlot=number,
                canonicalSlot=prior['slot'], indexSha256=frame['indexSha256'], rgbaSha256=frame['rgbaSha256'],
                originalOrigin=frame['origin'], originalSize=frame['size']))
        else:
            unique.append(key)
        entries.append(entry)
        if number == 3:
            profile['nativeFrameTone'][name] = {'3': dict(sourceSha256=source['sha256'],
                indexSha256=frame['indexSha256'], paletteSha256=iso)}
    work['members'].append(dict(member=name, sourceSha256=source['sha256'], palette=source['palette'], bodyCount=count,
        totalNativeSlots=source['totalFrames'], slots=entries, shadowPolicy='Retain all original separate shadow slots unchanged'))
    if count == 1 or identity == 'CAMISC06':
        assert len(unique) == 1
        small.extend(unique)
    else:
        for start in range(0, len(unique), 2):
            layouts.append((unique[start:start + 2], 2 if count == 3 else 1, 1 if count == 3 else 2))
layouts.insert(0, (small, 2, 3))
jobs = []
for number, (keys, columns, rows) in enumerate(layouts, 1):
    if len(keys) == 1:
        columns = rows = 1
    width, height = (1880, 1254) if rows == 1 else (1254, 1880)
    cw, ch = width // columns, height // rows
    board = Image.new('RGBA', (width, height))
    capacities = []
    name = f'urban-buildings-batch59-{number:02d}'
    for index, key in enumerate(keys):
        sprite = Image.open(art / (key + '-native.png'))
        scale = min((cw - 48) / sprite.width, (ch - 48) / sprite.height)
        assert scale >= 5.0, (key, scale)
        size = tuple(round(v * scale) for v in sprite.size)
        left, top = index % columns * cw, index // columns * ch
        x, y = left + (cw - size[0]) // 2, top + (ch - size[1]) // 2
        board.alpha_composite(sprite.resize(size, Image.Resampling.NEAREST), (x, y))
        work['slots'][key].update(board=name + '-master.png', boardSize=[width, height], slotRect=[left, top, cw, ch],
            referenceRect=[x, y, *size], referenceCapacity=scale)
        capacities.append(scale)
    reference = art / (name + '-reference.png')
    board.save(reference)
    work['batches'].append(dict(name=name, group='urban-building', boardSize=[width, height],
        columns=columns, rows=rows, slots=keys, status='ORIGINAL_GUIDES_ONLY'))
    prompt = ('Use case: precise-object-edit. Asset type: reusable Red Alert 2 Urban high-resolution game sprites. '
        f'Edit target: this exact original guide with {columns} columns and {rows} rows, row-major subjects {", ".join(keys)}. '
        'Repaint the complete original architecture or street facility in each cell with genuinely resolved masonry, '
        'roofing, glazing, painted metal, fabric and state-specific damage for independently detailed 2X and 4X sprites. '
        'Preserve the original silhouette, native isometric perspective, architecture, original colors and upper-left light. '
        'Do not redesign, exaggerate wear, add patterns, snow, new ground, cast shadows, fire, smoke, text, frames or checkerboards. '
        'Preserve all surviving rubble fragments, sandbags, flags and small detached source elements where shown. '
        'Rubble must remain its original low flat debris arrangement in its original Iso colors. '
        'Use restrained coherent material detail, not sharpening or ordinary enlargement as new detail. '
        'Keep all subjects large at the exact reference positions and scale, with completely transparent gutters at every '
        f'equal cell divider and outer margins. True transparent {width} by {height} canvas, exact reference aspect ratio. '
        'Do not shrink the subjects. Each equal cell is independent; do not connect objects across cells.')
    jobs.append(dict(id=name, reference=str(reference.resolve()), referenceSha256=sha(reference),
        destination=str((art / (name + '-master.png')).resolve()), slots=keys, cellLayout=[columns, rows],
        boardSize=[width, height], minimumReferenceCapacity=min(capacities), prompt=prompt))
for duplicate in duplicates:
    name, number, canonical = duplicate['member'], duplicate['retainedSlot'], duplicate['canonicalSlot']
    donor = work['slots'][f'{name}-{canonical:03d}']
    work['slots'][f'{name}-{number:03d}'].update({k: copy.deepcopy(donor[k]) for k in
        ['board', 'boardSize', 'slotRect', 'referenceRect', 'referenceCapacity']})
assert len(work['slots']) == 45 and len(duplicates) == 4 and len(jobs) == 19
write(root / 'contract.json', contract)
write(art / 'worklist.json', work)
write(art / 'material-profile-v1.json', profile)
write(art / 'imagegen-jobs-v1.json', dict(schema='m2-4-urban-building-imagegen-jobs-v1', jobs=jobs))
write(art / 'native-exact-duplicates-v1.json', dict(status='PASS_FOUR_EXACT_NATIVE_DUPLICATES_ALL_SLOTS_PRESERVED', rows=duplicates))
write(base / 'urban-buildings-batch59-preflight-v1.json', dict(status='UNSELECTED_ORIGINAL_GUIDES_READY', families=16,
    sourceBodySlots=45, uniqueNewMaterials=41, originalShadows=45, expectedDensityFrames=90, mothers=19,
    preparedSource=dict(file=str(root / 'source.json'), sha256=sha(root / 'source.json')),
    sourceAudit=dict(file=str(audit_file), sha256=sha(audit_file)), priorSelectedPack=current['selectedPack'],
    priorFamilies=246, selectedResourcesChanged=False, originalMapsChanged=False, windows='NOT_RUN', m24Complete=False))
print(json.dumps(dict(families=16, sourceBodySlots=45, uniqueNewMaterials=41, mothers=len(jobs), selected=False)))
