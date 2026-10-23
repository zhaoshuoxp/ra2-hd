"""Prepare two hash-distinct original editions without collapsing same-named building sources."""
import copy
import hashlib
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p))


def write(file, value):
    with file.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


base = Path('.artifacts/m2-4')
audit_file = Path('docs/m2-4-urban-remaining-after-batch56-20261016.json')
groups = [g for g in read(audit_file)['groups'] if g['category'] == 'EDITION_SOURCE_VARIANT']
guide_file = base / 'urban-civilians-native-batch49-v1/source.json'
guide = read(guide_file)
names = ['cgpars11.shp', 'cgwash01.shp', 'cgwash14.shp', 'cgwash15.shp']
iso = 'b1f4c15b7b91130736b4dffeb189ca32621bf606afbc0b2d02eb5584b6921fe3'
coverage = read(base / 'urban-buildings-authoring-batch56-v1/material-profile-v1.json')['nativeStructuralCoverage']
selected = read(Path('desktop/environment-urban-hd-contract.json'))
assert len(selected['families']) == 238
assert read(Path('docs/m2-4-urban-city-flags-batch57-20261016.json'))['visual'] == 'USER_ACCEPTED'
production = dict(schema='m2-4-urban-edition-building-preflight-v1',
    status='UNSELECTED_EXACT_SOURCE_PREPARATION_ONLY', sourceAudit=pin(audit_file), originalGuide=pin(guide_file),
    currentSelectedEnvironment=selected['selectedPack'], currentFamilies=238, editions={},
    completeNewSourceGroups=8, sourceBodyStates=32, expectedDensityFrames=64,
    newlyAuthoredSourceStates=23, identicalSourceStatesSharedAcrossEditions=9,
    remainingUrbanSourceGroups=55, coverageAdded=0, originalMapsChanged=False, windows='NOT_RUN', m24Complete=False)
all_jobs, by_edition = {}, {}
for edition in ['ra2', 'yr']:
    root = base / f'urban-edition-buildings-native-batch58-{edition}-v1'
    art = base / f'urban-edition-buildings-authoring-batch58-{edition}-v1'
    root.mkdir(exist_ok=False)
    art.mkdir(exist_ok=False)
    os.symlink((guide_file.parent / 'native').resolve(), root / 'native')
    sources = []
    for name in names:
        group, = [g for g in groups if g['member'] == name and {r['edition'] for r in g['editionRows']} == {edition}]
        source, = [copy.deepcopy(s) for s in guide['sources'] if s['member'] == name and s['sha256'] == group['sha256']]
        source['bindings'] = [b for b in source['bindings'] if b['edition'] == edition]
        assert source['bindings'] and source['totalFrames'] == 8 and source['hasShadow']
        assert sha(root / 'native' / source['nativeFile']) == source['sha256']
        for frame in source['frames']:
            assert sha(root / 'native' / frame['file']) == frame['rgbaSha256']
            assert sha(root / 'native' / frame['indexFile']) == frame['indexSha256']
        sources.append(source)
    native = dict(schema=guide['schema'], theater='URBAN', inventoryFile=str(audit_file),
        inventorySha256=sha(audit_file), sources=sources,
        scope=f'Four exact {edition.upper()} original variants; other edition remains separate.')
    write(root / 'source.json', native)
    contract = dict(schema=selected['schema'], theater='URBAN', preparedSourceSha256=sha(root / 'source.json'),
        sources={}, families={}, identities={'ra2': {}, 'yr': {}}, aliases={})
    profile = dict(nativeStructuralCoverage=coverage, nativeFrameTone={})
    work = dict(schema='m2-2-shp-native-slot-worklist-v1', preparedSourceSha256=sha(root / 'source.json'),
        members=[], slots={}, batches=[], runtimeAcceptance='UNSELECTED_EXACT_EDITION_ART_PENDING')
    jobs, shared = [], []
    for source in sources:
        name = source['member']
        identity, = {b['id'] for b in source['bindings']}
        family = f'urban-{identity.lower()}-{edition}'
        assert identity not in selected['identities'][edition]
        descriptor = {k: copy.deepcopy(source[k]) for k in
            ['sha256', 'canvas', 'totalFrames', 'palette', 'hasShadow', 'remapable']}
        descriptor.update(bodyFrames=4, framePalettes={'3': dict(member='isourb.pal',
            archive='ra2.mix/cache.mix', sha256=iso, role='rubble', remapable=False, runtimeUsed=True)})
        assert str(source['nativeRules']['LeaveRubble']).lower() in ['yes', 'true', '1']
        contract['sources'][name] = descriptor
        basis = dict(theater='URBAN', edition=edition, members={name: descriptor}, identities=[identity])
        declaration = dict(members=[name], identities=[identity], editions=[edition], kinds=['building'],
            familyHash=hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest())
        if edition == 'yr':
            declaration['sourceOverrides'] = {name: copy.deepcopy(descriptor)}
        contract['families'][family] = declaration
        contract['identities'][edition][identity] = family
        entries = []
        for frame in source['frames'][:4]:
            number = frame['slot']
            key = f'{name}-{number:03d}'
            palette = descriptor.get('framePalettes', {}).get(str(number), descriptor['palette'])
            palette_file = root / 'native' / (palette['sha256'] + '.pal')
            assert sha(palette_file) == palette['sha256']
            colors = np.frombuffer(palette_file.read_bytes(), np.uint8).reshape(256, 3).astype(np.uint16) * 4
            indices = np.frombuffer((root / 'native' / frame['indexFile']).read_bytes(), np.uint8).reshape(frame['size'][::-1])
            mask = (indices != 0) & (indices != 12)
            bounds = Image.fromarray(mask.astype(np.uint8) * 255).getbbox()
            assert bounds
            rgba = np.zeros((*indices.shape, 4), np.uint8)
            rgba[..., :3] = colors[indices].astype(np.uint8)
            rgba[..., 3] = mask.astype(np.uint8) * 255
            Image.fromarray(rgba).crop(bounds).save(art / (key + '-native.png'))
            work['slots'][key] = dict(member=name, nativeSlot=number, nativeBounds=list(bounds),
                kind='building', group='urban-edition-building', state=['normal', 'damaged', 'occupied', 'rubble'][number],
                nativeMetadata=frame, sourceSha256=source['sha256'])
            entries.append(dict(slot=number, key=key, status='AWAITING_AUTHORED_SLOT'))
            if number == 3:
                profile['nativeFrameTone'][name] = {'3': dict(sourceSha256=source['sha256'],
                    indexSha256=frame['indexSha256'], paletteSha256=iso)}
        work['members'].append(dict(member=name, sourceSha256=source['sha256'], palette=source['palette'],
            bodyCount=4, totalNativeSlots=8, slots=entries, shadowPolicy='All four original edition-specific shadows retained'))
        if edition == 'yr' and name != 'cgwash01.shp':
            donor_source = next(s for s in by_edition['ra2']['sources'] if s['member'] == name)
            for number in range(3):
                a, b = donor_source['frames'][number], source['frames'][number]
                assert a['indexSha256'] == b['indexSha256'] and a['rgbaSha256'] == b['rgbaSha256'] and a['size'] == b['size']
                key = f'{name}-{number:03d}'
                donor_info = by_edition['ra2']['work']['slots'][key]
                assert donor_info['nativeBounds'] == work['slots'][key]['nativeBounds']
                work['slots'][key].update({k: copy.deepcopy(donor_info[k]) for k in
                    ['board', 'boardSize', 'slotRect', 'referenceRect', 'referenceCapacity']})
                shared.append(dict(key=key, donorEdition='ra2', recipientEdition='yr',
                    donorSourceSha256=donor_source['sha256'], recipientSourceSha256=source['sha256'],
                    indexSha256=a['indexSha256'], rgbaSha256=a['rgbaSha256'], trimSize=a['size'],
                    originalCanvasPreserved=source['canvas'], originalOriginPreserved=b['origin'],
                    donorOrigin=a['origin'], donorBoard=donor_info['board'],
                    policy='Share the same new mother pixels only; independently export each original canvas, trim and shadow. Both editions remain visually pending.'))
            layouts = [[3]]
        elif name == 'cgpars11.shp':
            layouts = [[i] for i in range(4)]
        else:
            layouts = [[0, 1], [2, 3]]
        for numbers in layouts:
            keys = [f'{name}-{i:03d}' for i in numbers]
            width, height = (1880, 1254) if len(keys) == 1 else (1254, 1880)
            sprites = [Image.open(art / (key + '-native.png')) for key in keys]
            scale = min((width - 48) / max(s.width for s in sprites),
                (height - 48) / sum(s.height for s in sprites))
            assert scale >= 4.6, (edition, keys, scale)
            board = Image.new('RGBA', (width, height))
            boundary = round((height - 48) * sprites[0].height / sum(s.height for s in sprites)) + 24 if len(keys) == 2 else height
            board_id = f'{edition}-' + name.replace('.', '-') + '-' + '-'.join(map(str, numbers))
            tops, bottoms = ([0], [height]) if len(keys) == 1 else ([0, boundary], [boundary, height])
            for key, sprite, top, bottom in zip(keys, sprites, tops, bottoms):
                size = tuple(round(v * scale) for v in sprite.size)
                x, y = (width - size[0]) // 2, top + (bottom - top - size[1]) // 2
                board.alpha_composite(sprite.resize(size, Image.Resampling.NEAREST), (x, y))
                work['slots'][key].update(board=board_id + '-master.png', boardSize=[width, height],
                    slotRect=[0, top, width, bottom - top], referenceRect=[x, y, *size], referenceCapacity=scale)
            reference = art / (board_id + '-reference.png')
            board.save(reference)
            prompt = ('Use case: precise-object-edit. Asset type: reusable Red Alert 2 Urban building sprites. '
                f'Edit target: this exact original {edition.upper()} guide, {identity}, states {numbers}, '
                f'one column and {len(keys)} proportional rows. Repaint the original architecture and damage '
                'with genuinely resolved masonry, glazing, roofing and metal detail for independent 2X and 4X sprites. '
                'Preserve exact native isometric perspective, silhouette, original colors, upper-left light, '
                'roof and wall divisions, openings, sandbags, surviving rubble fragments and flat debris layout. '
                'Keep restrained readable material detail. Do not redesign, add snow, grounds, cast shadows, '
                'fire, smoke, decorative patterns, text, grids, frames or checkerboards. Do not use enlargement, '
                'sharpening or interpolation as newly authored detail. Preserve source placement, full subject '
                'scale, transparent gutters and generous outer transparency. '
                f'Output a true transparent {width} by {height} sprite sheet in the exact reference aspect ratio. '
                + (f'The proportional row boundary is y={boundary}/{height}; do not center the divider or shrink the subjects.'
                    if len(keys) == 2 else 'One full large subject, filling the same reference extent; do not shrink it.'))
            job = dict(id=board_id, reference=str(reference.resolve()), referenceSha256=sha(reference),
                destination=str((art / (board_id + '-master.png')).resolve()), slots=keys,
                cellLayout=[1, len(keys)], boardSize=[width, height], minimumReferenceCapacity=scale, prompt=prompt)
            if len(keys) == 2:
                job['rowBoundary'] = boundary
            jobs.append(job)
            work['batches'].append(dict(name=board_id, group='urban-edition-building', boardSize=[width, height],
                columns=1, rows=len(keys), slots=keys, status='ORIGINAL_GUIDES_ONLY'))
    if shared:
        for board in {r['donorBoard'] for r in shared}:
            donor_batch, = [b for b in by_edition['ra2']['work']['batches'] if b['name'] + '-master.png' == board]
            copied = copy.deepcopy(donor_batch)
            copied['slots'] = [r['key'] for r in shared if r['donorBoard'] == board]
            copied['status'] = 'SAME_BATCH_EXACT_SOURCE_MOTHER_REUSE_PENDING'
            work['batches'].append(copied)
    assert len(work['slots']) == 16
    write(root / 'contract.json', contract)
    write(art / 'worklist.json', work)
    write(art / 'material-profile-v1.json', profile)
    write(art / 'imagegen-jobs-v1.json', dict(schema='m2-4-urban-exact-edition-building-jobs-v1', jobs=jobs))
    write(art / 'same-batch-native-frame-reuse-v1.json', dict(status='PASS_ORIGINAL_TRIM_PIXELS_IDENTICAL_NOT_USER_ACCEPTANCE',
        rows=shared, reusedSourceFrames=len(shared), originalGeometryUnchanged=True))
    production['editions'][edition] = dict(nativeRoot=str(root), authoringRoot=str(art),
        preparedSource=pin(root / 'source.json'), sourceContract=pin(root / 'contract.json'),
        worklist=pin(art / 'worklist.json'), newMothers=len(jobs), sharedOriginalFrames=len(shared))
    by_edition[edition] = dict(sources=sources, work=work, art=art)
    all_jobs[edition] = jobs
assert sum(len(jobs) for jobs in all_jobs.values()) == 15
output = base / 'urban-edition-buildings-batch58-preflight-v1.json'
write(output, production)
print(json.dumps(dict(status=production['status'], newMothers=15, newSourceStates=23,
    sharedIdenticalStates=9, densityFrames=64, selectedFamiliesUnchanged=238)))
