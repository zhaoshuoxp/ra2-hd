"""Prepare six complete anchored-donor families and only seven new art studies."""
import copy
import hashlib
import os
from pathlib import Path

import numpy as np
from PIL import Image
from newurban_batch89_io import pin, read, sha, write

ROOT = Path('.artifacts/m2-4/newurban-anchored-buildings-batch91-20261020')
GUIDE = Path('.artifacts/m2-4/newurban-native-v1')
PRIOR = Path('.artifacts/m2-4/newurban-rock-crates-batch90-20261020')
PROOF = Path('.artifacts/m2-4/newurban-building-canvas-reuse-batch91-v1/accepted-anchor-donor-audit-v1.json')
acceptance = read(PRIOR / 'user-acceptance-20261020.json')
assert acceptance['status'] == 'USER_ACCEPTED_NEWURBAN_ROCKS_CRATES_BATCH90'
assert read('.local/environment-newurban-selection.json') == acceptance['candidate']
guide = read(GUIDE / 'source.json')
proof = read(PROOF)
assert pin(GUIDE / 'source.json') == proof['originalGuide']
ids = ['CANWY24', 'CATEXS06', 'CATEXS07', 'CAOILD', 'CAAIRP', 'CATHOSP', 'CAHOSP']
chosen = [source for source in guide['sources'] if any(binding['id'] in ids for binding in source['bindings'])]
assert len(chosen) == 12
ROOT.mkdir(exist_ok=False)
os.symlink((GUIDE / 'native').resolve(), ROOT / 'native')
for name, file in [('baseline-contract.json', Path('desktop/environment-newurban-hd-contract.json')),
                   ('baseline-selector.json', Path('.local/environment-newurban-selection.json'))]:
    with (ROOT / name).open('xb') as stream:
        stream.write(file.read_bytes())
write(ROOT / 'source.json', dict(schema=guide['schema'], theater='NEWURBAN', originalGuide=pin(GUIDE / 'source.json'),
    sources=chosen, scope='Six complete families, seven native identities and all linked animations.'))
contract = dict(schema=read(ROOT / 'baseline-contract.json')['schema'], theater='NEWURBAN',
    preparedSourceSha256=sha(ROOT / 'source.json'), sources={}, families={}, identities={'ra2': {}, 'yr': {}}, aliases={})
authorities = {theater: read(f'desktop/environment-{theater}-hd-contract.json') for theater in ['urban', 'desert']}
records, originals, art = [], {}, []
iso = dict(member='isoubn.pal', archive='ra2md.mix/cachemd.mix',
    sha256='1aa49468a9439a5cff3e5f66fae0678501e9dc3ef7a4d90f23127c38ad6e4676', bytes=768)
for source in chosen:
    name = source['member']
    source_ids = sorted({binding['id'] for binding in source['bindings']})
    identity = 'CATHOSP' if 'CATHOSP' in source_ids else source_ids[0]
    linked = not any(binding['role'] == 'body' for binding in source['bindings'])
    row, = [row for row in proof['rows'] if row['member'] == name]
    theater = 'desert' if name == 'cnairp_a.shp' else 'urban'
    donor, = [candidate for candidate in row['candidates'] if candidate['theater'] == theater]
    assert pin(Path(donor['acceptedMetadata']['file'])) == donor['acceptedMetadata']
    accepted = authorities[theater]
    descriptor = copy.deepcopy(accepted['sources'][donor['member']])
    count = source['totalFrames'] // (2 if source['hasShadow'] else 1)
    assert descriptor['bodyFrames'] == count
    if linked:
        assert donor['exactAnchoredSlots'] == list(range(count))
    elif name == 'cnhosp.shp':
        assert donor['exactAnchoredSlots'] == [1, 2]
    elif name == 'cnoild.shp':
        assert donor['exactAnchoredSlots'] == [0]
        for slot in [1, 2]:
            detail = donor['slots'][slot]
            assert detail['sameAnchoredTrim']
            assert detail['differingIndices'] == detail['differingRgb'] == detail['differingOwner'] == detail['differingAlpha'] == 1
            assert detail['differingIndex12'] == 0
    else:
        assert donor['exactAnchoredSlots'] == [0, 1, 2]
    descriptor.update(sha256=source['sha256'], canvas=source['canvas'], totalFrames=source['totalFrames'],
        palette=source['palette'], hasShadow=source['hasShadow'], remapable=source['remapable'])
    descriptor['framePalettes'] = {str(slot): dict(**source['palette'], role='linked' if linked else 'body',
        remapable=source['remapable'], runtimeUsed=True) for slot in range(count)}
    if not linked:
        descriptor['framePalettes']['3'] = dict(**iso, role='rubble', remapable=False, runtimeUsed=True)
    contract['sources'][name] = descriptor
    record = dict(member=name, identity=identity, identities=source_ids, linked=linked, bodySlots=count,
        sourceSha256=source['sha256'], donorMember=donor['member'], donorTheater=theater,
        donorMetadata=donor['acceptedMetadata'], exactAnchoredSlots=donor['exactAnchoredSlots'],
        proof=pin(PROOF), sourceKey=source['key'],
        mapIds=sorted({map_id for binding in source['bindings'] for map_id in binding['mapIds']}))
    for relative, digest in [(source['nativeFile'], source['sha256']),
                             (source['palette']['sha256'] + '.pal', source['palette']['sha256'])]:
        file = ROOT / 'native' / relative
        assert sha(file) == digest
        originals[str(file)] = pin(file)
    for frame in source['frames']:
        for key, digest_key in [('file', 'rgbaSha256'), ('indexFile', 'indexSha256')]:
            file = ROOT / 'native' / frame[key]
            assert sha(file) == frame[digest_key]
            originals[str(file)] = pin(file)
    if not linked:
        assert source['nativeRules']['LeaveRubble'].lower() in ['yes', 'true', '1']
        for slot in ([0, 3] if name == 'cnhosp.shp' else [3]):
            frame = source['frames'][slot]
            indices = np.fromfile(ROOT / 'native' / frame['indexFile'], np.uint8).reshape(frame['size'][::-1])
            palette_id = iso if slot == 3 else source['palette']
            palette_file = ROOT / 'native' / (palette_id['sha256'] + '.pal')
            assert sha(palette_file) == palette_id['sha256']
            originals[str(palette_file)] = pin(palette_file)
            palette = np.fromfile(palette_file, np.uint8).reshape(256, 3).astype(np.uint16) * 4
            body = (indices != 0) if slot == 3 else ((indices != 0) & (indices != 12))
            bounds = Image.fromarray(body.astype(np.uint8) * 255).getbbox()
            assert bounds
            rgba = np.dstack((palette[indices].astype(np.uint8), body.astype(np.uint8) * 255))
            file = ROOT / f'{name}-{slot}-original-guide.png'
            Image.fromarray(rgba).crop(bounds).save(file)
            study = dict(member=name, identity=identity, slot=slot, nativeBounds=list(bounds),
                nativeIndexSha256=frame['indexSha256'], palette=palette_id, originalGuide=pin(file),
                kind='rubble' if slot == 3 else 'normal-hospital')
            art.append(study)
    records.append(record)
for identity in ['CANWY24', 'CATEXS06', 'CATEXS07', 'CAOILD', 'CAAIRP', 'CATHOSP']:
    group = [record for record in records if record['identity'] == identity]
    family = 'newurban-' + identity.lower()
    names = sorted(record['member'] for record in group)
    family_ids = sorted({name for record in group for name in record['identities']})
    basis = dict(theater='NEWURBAN', members={name: contract['sources'][name] for name in names}, identities=family_ids)
    contract['families'][family] = dict(members=names, identities=family_ids, kinds=['building'], editions=['yr'],
        familyHash=hashlib.sha256(__import__('json').dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest())
    for name in family_ids:
        contract['identities']['yr'][name] = family
write(ROOT / 'contract.json', contract)
assert len(art) == 7
groups = [[study for study in art if study['slot'] == 0]]
rubble = [study for study in art if study['slot'] == 3]
groups += [rubble[start:start + 2] for start in range(0, len(rubble), 2)]
jobs = []
for number, subjects in enumerate(groups, 1):
    count = len(subjects)
    name = f'newurban-anchored-batch91-1x{count}-{number:02d}'
    board = Image.new('RGBA', (1920, 1920))
    height = 1920 // count
    for index, study in enumerate(subjects):
        sprite = Image.open(study['originalGuide']['file'])
        scale = min(1820 / sprite.width, (height - 96) / sprite.height)
        size = tuple(round(value * scale) for value in sprite.size)
        board.alpha_composite(sprite.resize(size, Image.Resampling.NEAREST),
            ((1920 - size[0]) // 2, index * height + (height - size[1]) // 2))
    file = ROOT / (name + '-reference.png')
    board.save(file)
    kind = subjects[0]['kind']
    detail = ('Rebuild this complete normal hospital as the same precise isometric architecture, with clean continuous '
        'roof planes, white and beige walls, dark window bands, straight parapets, steps and original medical markings. '
        'The original red owner-colored markings must have a clean neutral under-surface; the game will apply those '
        'colors at their exact source locations. Do not invent letters, numbers, new markings or additional facilities. '
        'Do not change the building proportions, original cropped silhouette or camera.' if kind == 'normal-hospital' else
        'Rebuild each low surviving rubble footprint with the same defining masonry, concrete, roof and metal fragments. '
        'Use broad readable broken structural pieces and smooth natural fractures, quiet fine material, restrained dust '
        'and continuous silhouettes. Keep the original low wall height, flat footprint and debris arrangement. '
        'Source pixels are resolution artifacts, not many individual stones; do not turn them into a gravel carpet.')
    request = ('Use case: precise-object-edit. Asset type: newly authored production high-resolution RA2 NEWURBAN '
        'environment sprites. Image 1 gives ONLY original low-resolution geometry and actual source palette. '
        f'One column and {count} completely separate row(s), top then bottom: '
        + ', '.join(f'{study["identity"]} / {study["kind"]}' for study in subjects) + '. ' + detail
        + ' Preserve broad native colors, native isometric camera, material identities and upper-left lighting. '
        'Create genuine independent HD detail, smooth straight or curved edges and continuous material surfaces. '
        'No pixel art, stepped outlines, square pixel holes, mosaic, dense grain, speckle, sharpening, blur or interpolation '
        'as new detail. Do not add ground, vegetation, snow, smoke, fire, external cast shadows, text, labels, frames or '
        'checkerboards. Keep each complete subject separate and centered, with clear transparent margins and no touching '
        'subjects. Truly transparent background. Use the available image area efficiently so each subject has at least '
        'four times its native source dimensions in both axes for independent 2X and 4X exports. Target 1920 by 1920.')
    jobs.append(dict(id=name, subjects=subjects, originalReference=pin(file), request=request,
        destination=str(ROOT / (name + '-master-v1.png')), receiptFile=name + '-output-v1.json'))
write(ROOT / 'imagegen-jobs-v1.json', dict(status='PREPARED_SEVEN_NEW_STUDIES_AND_EXACT_ANCHORED_REUSE', jobs=jobs))
write(ROOT / 'source-preparation-v1.json', dict(status='SOURCE_PINNED_SIX_COMPLETE_ANCHORED_BUILDING_FAMILIES',
    acceptedPrior=pin(PRIOR / 'user-acceptance-20261020.json'), priorHandoff=pin(PRIOR / 'resource-handoff-v1.json'),
    anchorProof=pin(PROOF), records=records, studies=art, originalFiles=list(originals.values()),
    completeFamilies=6, sourceMembers=12, newStudies=7,
    oilDifference='Two damaged slots each add one original owner index 30 at local [46,50]. Preserve accepted R16 body RGB and alpha; register only the corresponding owner shade on already-covered owner material. Keep all 64 mechanism and 16 flag slots exact.',
    airportPolicy='Reuse exact anchored Urban body material, the complete source-equivalent accepted Desert radar/light member and an exact accepted Urban flag. Urban tower has a blank underlying marking surface; do not import the superseded Desert displaced numerals.',
    native='NOT_RUN', visual='NOT_GENERATED', windows='NOT_RUN', m24Complete=False))
print(dict(families=6, members=12, studies=len(art), mothers=len(jobs)))
