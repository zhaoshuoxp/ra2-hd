"""Prepare eight complete source-bound Urban families and original-only art guides."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def write(path, value):
    with path.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--batch', type=int, choices=[54, 55, 56], default=54)
parser.add_argument('--members', nargs='+')
parser.add_argument('--map-id', default='yr:hillbtwn.map')
parser.add_argument('--portrait-pairs', action='store_true')
args = parser.parse_args()
base = Path('.artifacts/m2-4/urban-civilians-native-batch49-v1')
root = Path(f'.artifacts/m2-4/urban-buildings-native-batch{args.batch}-v1')
art = Path(f'.artifacts/m2-4/urban-buildings-authoring-batch{args.batch}-v1')
members = args.members or ['cuurb02.shp', 'cuurb01.shp', 'cusin03s.shp', 'cusin03e.shp',
                           'cusanf15.shp', 'cusydn02.shp', 'cula15.shp', 'cula09.shp']
assert len(members) == len(set(members)) == 8
assert args.batch == 54 or args.portrait_pairs and args.members
guide = read(base / 'source.json')
guide['sources'] = [s for s in guide['sources'] if s['member'] in members]
assert len(guide['sources']) == len(members) == 8
inventory_file = Path('.artifacts/m2-4/inventory-urban-side-roads-v1/inventory.json')
inventory = read(inventory_file)
for source in guide['sources']:
    rows = [r for r in inventory['rows'] if r.get('theater') == 'URBAN'
            and r.get('source', {}).get('member') == source['member']]
    assert rows and all(not r.get('dependencies') for r in rows)
    assert all(r['source']['sha256'] == source['sha256'] for r in rows)
    assert all(b['role'] == 'body' for b in source['bindings'])
    assert any(args.map_id in b['mapIds'] for b in source['bindings'])
root.mkdir(exist_ok=False)
art.mkdir(exist_ok=False)
os.symlink((base / 'native').resolve(), root / 'native')
guide['scope'] = 'Eight complete single-member original Urban building families; all native body and shadow slots retained.'
write(root / 'source.json', guide)
current = read(Path('desktop/environment-urban-hd-contract.json'))
contract = dict(schema=current['schema'], theater='URBAN', preparedSourceSha256=sha(root / 'source.json'),
                sources={}, families={}, identities={'ra2': {}, 'yr': {}}, aliases={})
coverage = read(Path('.artifacts/m2-4/urban-building-rubble-authoring-batch52-v1/material-profile-v2.json'))['nativeStructuralCoverage']
profile = dict(schema='m2-4-urban-complete-building-material-profile-v1', nativeStructuralCoverage=coverage,
               nativeFrameTone={})
work = dict(schema='m2-2-shp-native-slot-worklist-v1', preparedSourceSha256=sha(root / 'source.json'),
            members=[], slots={}, batches=[], runtimeAcceptance='UNSELECTED_NEW_COMPLETE_BODY_ART_PENDING')
iso = 'b1f4c15b7b91130736b4dffeb189ca32621bf606afbc0b2d02eb5584b6921fe3'
assert sha(root / 'native' / (iso + '.pal')) == iso
for source in guide['sources']:
    name = source['member']
    assert source['hasShadow'] and source['totalFrames'] in [4, 8]
    assert sha(root / 'native' / source['nativeFile']) == source['sha256']
    count = source['totalFrames'] // 2
    descriptor = {k: copy.deepcopy(source[k]) for k in ['sha256', 'canvas', 'totalFrames', 'palette', 'hasShadow', 'remapable']}
    descriptor['bodyFrames'] = count
    if count == 4:
        descriptor['framePalettes'] = {'3': dict(member='isourb.pal', archive='ra2.mix/cache.mix',
            sha256=iso, role='rubble', remapable=False,
            runtimeUsed=str(source['nativeRules'].get('LeaveRubble', '')).lower() in ['true', 'yes', '1'])}
    contract['sources'][name] = descriptor
    identities = sorted({b['id'] for b in source['bindings']})
    assert len(identities) == 1
    family = 'urban-' + identities[0].lower()
    basis = dict(theater='URBAN', members={name: descriptor}, identities=identities)
    editions = sorted({b['edition'] for b in source['bindings']})
    contract['families'][family] = dict(members=[name], identities=identities, editions=editions,
        kinds=['building'], familyHash=hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest())
    for edition in editions:
        assert identities[0] not in current['identities'][edition]
        contract['identities'][edition][identities[0]] = family
    entries = []
    for frame in source['frames'][:count]:
        number = frame['slot']
        assert not frame['empty']
        indices_file = root / 'native' / frame['indexFile']
        assert sha(indices_file) == frame['indexSha256']
        indices = np.frombuffer(indices_file.read_bytes(), np.uint8).reshape(frame['size'][::-1])
        mask = (indices != 0) & (indices != 12)
        bounds = Image.fromarray(mask.astype(np.uint8) * 255).getbbox()
        palette = descriptor.get('framePalettes', {}).get(str(number), source['palette'])
        palette_file = root / 'native' / (palette['sha256'] + '.pal')
        assert sha(palette_file) == palette['sha256']
        colors = np.frombuffer(palette_file.read_bytes(), np.uint8).reshape(256, 3).astype(np.uint16) * 4
        rgba = np.zeros((*indices.shape, 4), np.uint8)
        rgba[..., :3] = colors[indices].astype(np.uint8)
        rgba[..., 3] = mask.astype(np.uint8) * 255
        key = f'{name}-{number:03d}'
        state = ['normal', 'damaged', 'occupied', 'rubble'][number]
        Image.fromarray(rgba).crop(bounds).save(art / (key + '-native.png'))
        work['slots'][key] = dict(member=name, nativeSlot=number, nativeBounds=list(bounds),
            kind='building', group='urban-building', state=state, nativeMetadata=frame, sourceSha256=source['sha256'])
        entries.append(dict(slot=number, key=key, status='AWAITING_AUTHORED_SLOT'))
        if number == 3:
            profile['nativeFrameTone'][name] = {'3': dict(sourceSha256=source['sha256'],
                indexSha256=frame['indexSha256'], paletteSha256=iso)}
    work['members'].append(dict(member=name, sourceSha256=source['sha256'], palette=source['palette'],
        bodyCount=count, totalNativeSlots=source['totalFrames'], slots=entries,
        shadowPolicy='Untouched original separate shadow slots; no generated shadow substitute'))
layouts = []
if args.portrait_pairs:
    assert all(source['totalFrames'] == 8 for source in guide['sources'])
    for name in members:
        for start in [0, 2]:
            layouts.append(([f'{name}-{s:03d}' for s in range(start, start + 2)], 1, 2))
else:
    for start in [0, 2]:
        layouts.append(([f'{n}-{s:03d}' for n in members[start:start + 2] for s in [0, 1]], 2, 2))
    for name in members[4:5]:
        layouts.append(([f'{name}-{s:03d}' for s in range(4)], 2, 2))
    for name in members[5:]:
        for start in [0, 2]:
            layouts.append(([f'{name}-{s:03d}' for s in range(start, start + 2)], 1, 2))
jobs = []
for number, (keys, columns, rows) in enumerate(layouts, 1):
    name = f'urban-buildings-1254-{columns}x{rows}-{number:02d}'
    width, height = 1254, 1882 if args.portrait_pairs else 1254
    cw, ch = width // columns, height // rows
    board = Image.new('RGBA', (width, height))
    capacities = []
    for index, key in enumerate(keys):
        sprite = Image.open(art / (key + '-native.png'))
        capacity = min((cw - 64) / sprite.width, (ch - 64) / sprite.height)
        assert capacity >= 4.2, (key, capacity)
        capacities.append(capacity)
        size = tuple(round(v * capacity) for v in sprite.size)
        left, top = index % columns * cw, index // columns * ch
        x, y = left + (cw - size[0]) // 2, top + (ch - size[1]) // 2
        board.alpha_composite(sprite.resize(size, Image.Resampling.NEAREST), (x, y))
        work['slots'][key].update(board=name + '-master.png', slotRect=[left, top, cw, ch],
                                 referenceRect=[x, y, *size], referenceCapacity=capacity)
    reference = art / (name + '-reference.png')
    board.save(reference)
    work['batches'].append(dict(name=name, group='urban-building', boardSize=[width, height],
        columns=columns, rows=rows, slots=keys, status='ORIGINAL_GUIDES_ONLY'))
    prompt = ('Use case: precise-object-edit. Asset type: reusable high-resolution Red Alert 2 Urban building sprites. '
        f'Image 1 is the exact original geometry and native color guide: {columns} columns and {rows} rows, '
        f'row-major cells: {", ".join(keys)}. Repaint each occupied cell with substantial independently authored '
        'fine material detail suitable for genuine 2X and 4X game sprites. Preserve EXACT original isometric '
        'perspective, architecture, object identity, silhouette, relative details, lighting from upper left, '
        'colors and state-specific damage or sandbag fortifications. Keep roof, walls, signs, glazing, metal '
        'and masonry coherent and readable at game scale, with restrained realistic surface detail. '
        'Retain each original civilian building or street facility identity exactly as drawn in that cell. Rubble remains the exact '
        'original flat debris arrangement, footprint, surviving fragments and actual Urban Iso colors. '
        'Do not invent standing replacement buildings, snow, new objects, decorative patterns, ground planes, '
        'cast shadows, fire, smoke, labels, borders, grid lines or checkerboards. No ordinary enlargement, '
        'sharpening, mosaic or interpolation presented as new detail. Preserve transparent margins and cell '
        'positions, fill each original guide subject at the same generous scale. True transparent background. '
        f'Output {width} by {height} pixels with this exact cell layout and aspect ratio. '
        + ('Portrait sheet, two vertically stacked subjects; preserve the full tall canvas rather than squeezing into a square.'
           if args.portrait_pairs else 'Square sheet.'))
    jobs.append(dict(id=name, reference=str(reference.resolve()), referenceSha256=sha(reference),
        destination=str((art / (name + '-master.png')).resolve()), slots=keys, cellLayout=[columns, rows],
        boardSize=[width, height], minimumReferenceCapacity=min(capacities), prompt=prompt))
assert len(work['slots']) == (32 if args.portrait_pairs else 24)
assert len(jobs) == (16 if args.portrait_pairs else 9)
write(root / 'contract.json', contract)
write(art / 'worklist.json', work)
write(art / 'material-profile-v1.json', profile)
write(art / 'imagegen-jobs-v1.json', dict(schema='m2-4-urban-building-imagegen-jobs-v1',
    worklistSha256=sha(art / 'worklist.json'), jobs=jobs))
print(json.dumps(dict(families=8, members=8, newStates=len(work['slots']),
                      densityFrames=len(work['slots']) * 2, mothers=len(jobs), selected=False)))
