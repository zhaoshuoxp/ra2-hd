"""Pin twelve complete source families, accepted linked loops and new rubble guides."""
import copy
import hashlib
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image

from newurban_batch89_io import ROOT, crop, logical, pin, read, sha, write

BASE = Path('.artifacts/m2-4')
GUIDE = BASE / 'newurban-native-v1'
PROOF = BASE / 'newurban-reuse-batch87-preflight-v1/building-state-audit-v1.json'
CROSS = BASE / 'newurban-building-reuse-batch89-v1/accepted-donor-audit-v1.json'
PRIOR = BASE / 'newurban-buildings-batch88-20261020'
acceptance = read(PRIOR / 'user-acceptance-20261020.json')
assert read('.local/environment-newurban-selection.json') == acceptance['candidate']
guide = read(GUIDE / 'source.json')
proof = read(PROOF)
cross = read(CROSS)
assert pin(GUIDE / 'source.json') == cross['guide']
rows = {row['member']: row for row in cross['rows']}
linked_proof = {row['member']: row for row in proof['rows']}
ids = ['CASTL05' + suffix for suffix in 'ABCDEFGH'] + ['CAMACH', 'CALA10', 'CAMORR04', 'CAHSE06']
chosen = [s for s in guide['sources'] if any(b['id'] in ids for b in s['bindings'])]
assert len(chosen) == 14
ROOT.mkdir(exist_ok=False)
os.symlink((GUIDE / 'native').resolve(), ROOT / 'native')
for name, file in [('baseline-contract.json', Path('desktop/environment-newurban-hd-contract.json')),
                   ('baseline-selector.json', Path('.local/environment-newurban-selection.json'))]:
    with (ROOT / name).open('xb') as stream:
        stream.write(file.read_bytes())
write(ROOT / 'source.json', dict(schema=guide['schema'], theater='NEWURBAN', originalGuide=pin(GUIDE / 'source.json'),
    sources=chosen, scope='Twelve complete linked families, including all eight stadium sections.'))
contract = dict(schema=read(ROOT / 'baseline-contract.json')['schema'], theater='NEWURBAN',
    preparedSourceSha256=sha(ROOT / 'source.json'), sources={}, families={}, identities={'ra2': {}, 'yr': {}}, aliases={})
contracts = {name: read(f'desktop/environment-{name}-hd-contract.json') for name in ['urban', 'desert']}
iso_file = ROOT / 'native' / (proof['targetRubblePalette']['sha256'] + '.pal')
assert sha(iso_file) == proof['targetRubblePalette']['sha256']
iso = np.fromfile(iso_file, np.uint8).reshape(256, 3).astype(np.uint16) * 4
records, originals, art = [], {str(iso_file): pin(iso_file)}, []
for source in chosen:
    name = source['member']
    identity, = {binding['id'] for binding in source['bindings']}
    assert identity in ids
    linked = all(binding['role'] != 'body' for binding in source['bindings'])
    theater = 'desert' if identity in ['CAMORR04', 'CAHSE06'] else 'urban'
    accepted = contracts[theater]
    family = accepted['identities']['yr'][identity]
    members = accepted['families'][family]['members']
    donor_name, = [m for m in members if m == name or m[2:] == name[2:]]
    descriptor = copy.deepcopy(accepted['sources'][donor_name])
    pack_root = Path('.local/environment-packs') / accepted['selectedPack']['revision']
    pack = read(pack_root / 'manifest.json')
    entry, = [e for e in pack['families'][family]['members'] if e['member'] == donor_name]
    donor_file = pack_root / entry['path']
    assert sha(donor_file) == entry['sha256']
    count = source['totalFrames'] // (2 if source['hasShadow'] else 1)
    assert descriptor['bodyFrames'] == count
    exact_slots = list(range(count)) if linked else next(c for c in rows[name]['candidates']
        if c['theater'] == theater)['exactSlots']
    if linked:
        assert len(linked_proof[name]['slots']) == count
        assert all(slot['status'] in ['ELIGIBLE_EXACT_RENDERED_BODY_DONOR', 'EXACT_NATIVE_EMPTY_REQUIRED']
            for slot in linked_proof[name]['slots'])
        assert not linked_proof[name]['distinctBodySlots']
    descriptor.update(sha256=source['sha256'], canvas=source['canvas'], totalFrames=source['totalFrames'],
        palette=source['palette'], hasShadow=source['hasShadow'], remapable=source['remapable'])
    descriptor['framePalettes'] = {str(i): dict(**source['palette'], role='linked' if linked else 'body',
        runtimeUsed=True, remapable=source['remapable']) for i in range(count)}
    if not linked:
        descriptor['framePalettes']['3'] = dict(member='isoubn.pal', archive='ra2md.mix/cachemd.mix',
            sha256=proof['targetRubblePalette']['sha256'], bytes=768, role='rubble', remapable=False, runtimeUsed=True)
    contract['sources'][name] = descriptor
    record = dict(member=name, identity=identity, linked=linked, bodySlots=count, exactAcceptedSlots=exact_slots,
        donorMember=donor_name, donorTheater=theater, donorMetadata=pin(donor_file),
        donorSource=contracts[theater]['sources'][donor_name], sourceKey=source['key'], sourceSha256=source['sha256'],
        proof=pin(PROOF if linked else CROSS), mapIds=sorted({m for b in source['bindings'] for m in b['mapIds']}))
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
        assert source['nativeRules'].get('LeaveRubble', '').lower() in ['yes', 'true', '1']
        if identity.startswith('CASTL05'):
            assert source['nativeRules'].get('CanBeOccupied', '').lower() != 'yes'
        frame = source['frames'][3]
        indices = np.fromfile(ROOT / 'native' / frame['indexFile'], np.uint8).reshape(frame['size'][::-1])
        bounds = Image.fromarray((indices != 0).astype(np.uint8) * 255).getbbox()
        rgba = np.dstack((iso[indices].astype(np.uint8), (indices != 0).astype(np.uint8) * 255))
        file = ROOT / (name + '-rubble-original-guide.png')
        Image.fromarray(rgba).crop(bounds).save(file)
        record.update(rubblePolicy='NEW_CONTINUOUS_AUTHORED_MATERIAL', rubbleBounds=list(bounds),
            rubbleGuide=pin(file), rubblePalette=proof['targetRubblePalette'])
        if identity in ['CAMORR04', 'CAHSE06']:
            comparison = next(c for c in rows[name]['candidates'] if c['theater'] == 'desert')['slots'][3]
            assert comparison['sameGeometry'] and comparison['differingIndices'] == 0
            record['rubblePolicy'] = 'ACCEPTED_SOURCE_IDENTICAL_STRUCTURE_ISO_PALETTE_ADAPTATION'
            record['rubblePaletteProof'] = comparison
            Image.fromarray(crop(donor_file, 3, 4)).save(ROOT / (name + '-accepted-rubble-4x.png'))
        else:
            art.append(record)
    records.append(record)
for identity in ids:
    group = [r for r in records if r['identity'] == identity]
    family = 'newurban-' + identity.lower()
    assert family not in read(ROOT / 'baseline-contract.json')['families']
    names = sorted(r['member'] for r in group)
    editions = sorted({b['edition'] for s in chosen if s['member'] in names for b in s['bindings']})
    basis = dict(theater='NEWURBAN', members={name: contract['sources'][name] for name in names}, identities=[identity])
    contract['families'][family] = dict(members=names, identities=[identity], kinds=['building'], editions=editions,
        familyHash=hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest())
    for edition in editions:
        contract['identities'][edition][identity] = family
write(ROOT / 'contract.json', contract)
jobs = []
for start in range(0, len(art), 2):
    subjects = art[start:start + 2]
    name = f'newurban-linked-batch89-rubble-1x{len(subjects)}-{start // 2 + 1:02d}'
    board = Image.new('RGBA', (1920, 1920))
    height = 1920 // len(subjects)
    for index, record in enumerate(subjects):
        sprite = Image.open(record['rubbleGuide']['file'])
        scale = min(1824 / sprite.width, (height - 96) / sprite.height)
        size = tuple(round(n * scale) for n in sprite.size)
        board.alpha_composite(sprite.resize(size, Image.Resampling.NEAREST),
            ((1920 - size[0]) // 2, index * height + (height - size[1]) // 2))
    file = ROOT / (name + '-reference.png')
    board.save(file)
    request = ('Use case: precise-object-edit. Asset type: production high-resolution RA2 NEWURBAN rubble sprites. '
        'Image 1 supplies ONLY the untouched low-resolution isometric footprint, actual Iso-palette colors and '
        'principal debris arrangement. Create one column, two entirely separate rows, top then bottom: '
        + ', '.join(r['identity'] for r in subjects) + '. Rebuild genuine continuous HD structure and smooth '
        'coherent broken concrete, masonry, metal and roof panels. Preserve original low surviving-wall height, '
        'flat footprint, defining wall/roof fragments, material identities, broad colors, isometric camera and '
        'upper-left light. The coarse source pixels are resolution artifacts, not many tiny stones. Use readable '
        'broad structural pieces with quiet fine material, restrained dust, clean naturally fractured edges and '
        'continuous silhouettes. Follow the accepted polished RA2 HD continuous-rubble style. Do not trace pixel '
        'stairs or square source-alpha holes. No gravel carpet, speckle, dense pebbles, mosaic, pixel art, heavy '
        'grain, sharpening, blur or interpolation as new detail. Do not invent standing buildings, tall piles, '
        'new ground, snow, vegetation, smoke, fire, external cast shadows, labels, text, checkerboards or frames. '
        'Each complete subject must fit independently in its own row with generous clear margins and at least '
        '160 transparent pixels between subjects; no touching fragments. Truly transparent background. Target '
        '1920 by 1920 with enough newly drawn detail for complete independent 2X and 4X exports.')
    jobs.append(dict(id=name, members=[r['member'] for r in subjects], originalReference=pin(file), request=request,
        destination=str(ROOT / (name + '-master-v1.png')), receiptFile=name + '-output-v1.json'))
d_source, = [s for s in chosen if s['member'] == 'cnstl05d.shp']
d_record, = [r for r in records if r['member'] == d_source['member']]
assert d_source['frames'][1]['indexSha256'] == d_source['frames'][2]['indexSha256']
Image.fromarray(crop(d_record['donorMetadata']['file'], 1, 4)).save(ROOT / 'stadium-d-accepted-damaged-4x.png')
frame = d_source['frames'][1]
pixels = np.fromfile(ROOT / 'native' / frame['file'], np.uint8).reshape(*frame['size'][::-1], 4)
Image.fromarray(pixels).resize(tuple(n * 4 for n in frame['size']), Image.Resampling.NEAREST).save(
    ROOT / 'stadium-d-original-damaged-4x.png')
write(ROOT / 'imagegen-jobs-v1.json', dict(status='PREPARED_TEN_NEW_RUBBLE_STUDIES', jobs=jobs,
    acceptedStyle=pin(BASE / 'newurban-rubble-continuous-r1-20261020/user-acceptance-20261020.json')))
write(ROOT / 'source-preparation-v1.json', dict(status='SOURCE_PINNED_TWELVE_COMPLETE_LINKED_FAMILIES',
    acceptedPrior=pin(PRIOR / 'user-acceptance-20261020.json'), priorDelivery=pin(PRIOR / 'delivery-checkpoint-v1.json'),
    guide=pin(GUIDE / 'source.json'), crossTheaterProof=pin(CROSS), linkedProof=pin(PROOF),
    records=records, originalFiles=list(originals.values()), completeFamilies=12, sourceMembers=14,
    exactAcceptedBodyStates=sum(len(r['exactAcceptedSlots']) for r in records),
    newRubbleStudies=10, sourceIdenticalPaletteAdaptations=2,
    stadiumDamagedDifference='Two identical D slots differ at 23 native indices; inspect and adapt only this bounded detail.',
    native='NOT_RUN', visual='NOT_GENERATED', windows='NOT_RUN', m24Complete=False))
print(json.dumps(dict(families=12, members=14, exactAcceptedBodyStates=sum(len(r['exactAcceptedSlots']) for r in records),
    newRubbleStudies=10, paletteAdaptations=2, motherJobs=len(jobs))))
