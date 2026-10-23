"""Prepare complete original-pose linked families, preserving the accepted guard flag."""
import copy
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def write(path, value):
    with path.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


base = Path('.artifacts/m2-4')
native = base / 'urban-linked-native-batch61-v1'
art = base / 'urban-linked-authoring-batch61-v1'
art.mkdir()
guide = read(native / 'source.json')
sources = {s['member']: s for s in guide['sources']}
preflight = read(Path('docs/m2-4-urban-linked-batch61-preflight-20261016.json'))
current = read(Path('desktop/environment-urban-hd-contract.json'))
assert len(current['families']) == 278
assert read(Path('docs/m2-4-urban-buildings-batch60-20261016.json'))['visual'] == 'USER_ACCEPTED'
contract = dict(schema=current['schema'], theater='URBAN', preparedSourceSha256=sha(native / 'source.json'),
    sources={}, families={}, identities={'ra2': {}, 'yr': {}}, aliases={})
coverage = read(base / 'urban-buildings-authoring-batch60-v1/material-profile-v1.json')['nativeStructuralCoverage']
profile = dict(nativeStructuralCoverage=coverage, nativeFrameTone={}, acceptedNativeBodyFrames={})
iso = 'b1f4c15b7b91130736b4dffeb189ca32621bf606afbc0b2d02eb5584b6921fe3'
for name, source in sources.items():
    descriptor = {k: copy.deepcopy(source[k]) for k in
        ['sha256', 'canvas', 'totalFrames', 'palette', 'hasShadow', 'remapable']}
    descriptor['bodyFrames'] = source['totalFrames'] // 2
    if all(b['role'] == 'body' for b in source['bindings']) and descriptor['bodyFrames'] == 4:
        descriptor['framePalettes'] = {'3': dict(member='isourb.pal', archive='ra2.mix/cache.mix', sha256=iso,
            role='rubble', remapable=False, runtimeUsed=str(source['nativeRules'].get('LeaveRubble', '')).lower() in ['yes', 'true', '1'])}
        profile['nativeFrameTone'][name] = {'3': dict(sourceSha256=source['sha256'],
            indexSha256=source['frames'][3]['indexSha256'], paletteSha256=iso)}
    contract['sources'][name] = descriptor
for row in preflight['rows']:
    identity, name = row['identity'], row['bodyMember']
    family = 'urban-' + identity.lower()
    members = sorted({r['member'] for r in row['completeMembers']})
    editions = sorted({b['edition'] for b in sources[name]['bindings']})
    basis = dict(theater='URBAN', members={m: contract['sources'][m] for m in members}, identities=[identity])
    contract['families'][family] = dict(members=members, identities=[identity], editions=editions, kinds=['building'],
        familyHash=hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest())
    for edition in editions:
        assert identity not in current['identities'][edition]
        contract['identities'][edition][identity] = family
proof_file = native / 'snow-body-reuse-v1.json'
proof = read(proof_file)
snow_file = Path(proof['acceptedContract'])
assert sha(snow_file) == proof['acceptedContractSha256']
snow = read(snow_file)
snow_root = Path('.local/environment-packs') / snow['selectedPack']['revision']
assert sha(snow_root / 'manifest.json') == snow['selectedPack']['sha256']
pack = read(snow_root / 'manifest.json')
row, = [r for r in proof['rows'] if r['member'] == 'cugrd1_a.shp']
assert row['status'] == 'ALL_BODY_SLOTS_MATCH_FAMILY_CLOSURE_STILL_REQUIRED'
entry, = [m for m in pack['families']['snow-cagard01']['members'] if m['member'] == row['donorMember']]
manifest_file = snow_root / entry['path']
assert sha(manifest_file) == entry['sha256']
assert read(manifest_file)['color']['structuralCoverage'] == coverage
profile['acceptedNativeBodyFrames']['cugrd1_a.shp'] = dict(sourceSha256=sources['cugrd1_a.shp']['sha256'],
    donorMember=row['donorMember'], manifestFile=str(manifest_file), manifestSha256=sha(manifest_file),
    slots=list(range(9)), completeOriginalAnimation=True, proofFile=str(proof_file), proofSha256=sha(proof_file))
work = dict(schema='m2-2-shp-native-slot-worklist-v1', preparedSourceSha256=sha(native / 'source.json'),
    members=[], slots={}, batches=[], runtimeAcceptance='UNSELECTED_COMPLETE_LINKED_ART_PENDING')
duplicates, unique_by_member = [], {}
for name, source in sources.items():
    count = source['totalFrames'] // 2
    entries, unique = [], []
    for frame in source['frames'][:count]:
        number = frame['slot']
        assert not frame['empty']
        key = f'{name}-{number:03d}'
        assert sha(native / 'native' / frame['indexFile']) == frame['indexSha256']
        indices = np.frombuffer((native / 'native' / frame['indexFile']).read_bytes(), np.uint8).reshape(frame['size'][::-1])
        mask = (indices != 0) & (indices != 12)
        bounds = Image.fromarray(mask.astype(np.uint8) * 255).getbbox()
        assert bounds
        palette = contract['sources'][name].get('framePalettes', {}).get(str(number), source['palette'])
        colors = np.frombuffer((native / 'native' / (palette['sha256'] + '.pal')).read_bytes(), np.uint8).reshape(256, 3).astype(np.uint16) * 4
        rgba = np.zeros((*indices.shape, 4), np.uint8)
        rgba[:, :, :3], rgba[:, :, 3] = colors[indices].astype(np.uint8), mask.astype(np.uint8) * 255
        Image.fromarray(rgba).crop(bounds).save(art / (key + '-native.png'))
        work['slots'][key] = dict(member=name, nativeSlot=number, nativeBounds=list(bounds), nativeMetadata=frame,
            sourceSha256=source['sha256'], kind='building', group='urban-linked')
        prior = next((f for f in source['frames'][:number] if all(f[k] == frame[k] for k in
            ['origin', 'size', 'indexSha256', 'rgbaSha256', 'empty'])), None)
        entry = dict(slot=number, key=key, status='AWAITING_AUTHORED_SLOT')
        if name in profile['acceptedNativeBodyFrames']:
            entry['status'] = 'ACCEPTED_COMPLETE_ORIGINAL_ANIMATION_REUSE'
        elif prior:
            entry.update(status='EXACT_NATIVE_DUPLICATE', canonical=prior['slot'])
            duplicates.append(dict(member=name, retainedSlot=number, canonical=prior['slot'],
                sourceSha256=source['sha256'], indexSha256=frame['indexSha256'], rgbaSha256=frame['rgbaSha256']))
        else:
            unique.append(key)
        entries.append(entry)
    unique_by_member[name] = unique
    work['members'].append(dict(member=name, sourceSha256=source['sha256'], palette=source['palette'],
        bodyCount=count, totalNativeSlots=source['totalFrames'], slots=entries,
        shadowPolicy='All original native shadow slots remain untouched'))
layouts = []
for member, keys in unique_by_member.items():
    cursor = 0
    while cursor < len(keys):
        options = []
        for count in range(1, min(8, len(keys) - cursor) + 1):
            subjects = [Image.open(art / (key + '-native.png')) for key in keys[cursor:cursor + count]]
            for width, height in [(1254, 1254), (1536, 1024), (1024, 1536)]:
                for columns in range(1, 5):
                    rows = (count + columns - 1) // columns
                    if rows > 4 or columns * rows != count:
                        continue
                    capacity = min(min((width // columns - 24) / im.width,
                        (height // rows - 24) / im.height) for im in subjects)
                    if capacity >= 4.5:
                        options.append((count, capacity, columns, rows, width, height))
        assert options, (member, keys[cursor])
        count, capacity, columns, rows, width, height = max(options)
        layouts.append((keys[cursor:cursor + count], columns, rows, width, height, capacity))
        cursor += count
jobs = []
for number, (keys, columns, rows, width, height, available) in enumerate(layouts, 1):
    cw, ch = width // columns, height // rows
    board = Image.new('RGBA', (width, height))
    stem = f'urban-linked-batch61-{number:02d}'
    for i, key in enumerate(keys):
        im = Image.open(art / (key + '-native.png'))
        scale = min((cw - 24) / im.width, (ch - 24) / im.height)
        size = tuple(round(v * scale) for v in im.size)
        left, top = i % columns * cw, i // columns * ch
        x, y = left + (cw - size[0]) // 2, top + (ch - size[1]) // 2
        board.alpha_composite(im.resize(size, Image.Resampling.NEAREST), (x, y))
        work['slots'][key].update(board=stem + '-master.png', boardSize=[width, height],
            slotRect=[left, top, cw, ch], referenceRect=[x, y, *size], referenceCapacity=scale)
    reference = art / (stem + '-reference.png')
    board.save(reference)
    prompt = ('Use case: precise-object-edit. Asset type: original-frame-faithful Red Alert 2 Urban building/animation sprites. '
        f'Edit target: this exact native reference, {columns} columns by {rows} rows, row-major frames {", ".join(keys)}. '
        'Repaint each shown original pose with resolved metal, masonry, glazing, roofing and mechanical detail for real 2X and 4X artwork. '
        'These are consecutive original source poses or body states, not new designs. Match the exact silhouette, full visible anatomy, '
        'original palette colors, isometric projection, pose, light, surviving fragments, openings and frame-specific damage. '
        'Keep all shared architecture/materials coherent across cells; preserve each original moving part and occlusion. '
        'Keep all original signs, screens, structures and thin members exactly as visible, without extra equipment or decorations. '
        'Retain any original energy colors at their shown original locations; do not spread glow or add effects. '
        'No snow, redesign, invented ground, cast shadows, label, border, grid, background, checkerboard, fire or smoke. '
        'Do not replace native damage with a new destruction layout. Do not simulate detail by enlargement, sharpening or noisy repeated patterns. '
        'Fill each cell at the exact full reference subject scale and position, preserving transparent outer margins and empty gutters. '
        f'Output a genuinely transparent {width} by {height} sprite sheet with exactly this cell arrangement. '
        'Do not shrink, crop, merge, reorder or connect the subjects.')
    jobs.append(dict(id=stem, slots=keys, boardSize=[width, height], cellLayout=[columns, rows],
        reference=str(reference.resolve()), referenceSha256=sha(reference),
        destination=str((art / (stem + '-master.png')).resolve()), minimumReferenceCapacity=available, prompt=prompt))
    work['batches'].append(dict(name=stem, group='urban-linked', boardSize=[width, height],
        columns=columns, rows=rows, slots=keys, status='ORIGINAL_GUIDES_ONLY'))
for duplicate in duplicates:
    canonical = work['slots'][f"{duplicate['member']}-{duplicate['canonical']:03d}"]
    work['slots'][f"{duplicate['member']}-{duplicate['retainedSlot']:03d}"].update({k: copy.deepcopy(canonical[k]) for k in
        ['board', 'boardSize', 'slotRect', 'referenceRect', 'referenceCapacity']})
assert len(work['slots']) == 223 and len(duplicates) == 25
assert sum(len(keys) for keys in unique_by_member.values()) == 189
write(native / 'contract.json', contract)
write(art / 'worklist.json', work)
write(art / 'material-profile-v1.json', profile)
write(art / 'imagegen-jobs-v1.json', dict(schema='m2-4-urban-linked-imagegen-jobs-v1', jobs=jobs))
write(art / 'exact-native-duplicates-v1.json', dict(status='PASS_EXACT_ORIGINAL_DUPLICATE_SLOTS_RETAINED', rows=duplicates))
write(art / 'authoring-preflight-v1.json', dict(status='UNSELECTED_COMPLETE_ORIGINAL_POSE_GUIDES_READY',
    completeFamilies=6, members=13, originalBodySlots=223, untouchedShadows=223, densityFrames=446,
    exactNativeDuplicates=25, reusedAcceptedFlagSlots=9, distinctNewMaterials=189, mothers=len(jobs),
    minimumReferenceCapacity=min(j['minimumReferenceCapacity'] for j in jobs), selectedResourcesChanged=False))
print(json.dumps(dict(families=6, members=13, sourceSlots=223, reusedAcceptedFlagSlots=9,
    distinctNewMaterials=189, mothers=len(jobs))))
