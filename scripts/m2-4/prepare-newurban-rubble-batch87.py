"""Prepare twenty complete NewUrban buildings with exact accepted body-state reuse."""
import copy
import hashlib
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image

BASE = Path('.artifacts/m2-4')
PREFLIGHT = BASE / 'newurban-reuse-batch87-preflight-v1'
ROOT = BASE / 'newurban-building-rubble-native-batch87-v1'
ART = BASE / 'newurban-building-rubble-authoring-batch87-v1'
GUIDE = BASE / 'newurban-native-v1'
PROOF = PREFLIGHT / 'building-state-audit-v1.json'
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
pin = lambda path: dict(file=str(path), sha256=sha(path), bytes=path.stat().st_size)


def write(path, value):
    with path.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


proof = read(PROOF)
assert proof['status'] == 'PASS_READ_ONLY_RENDERED_BODY_COMPARISON_NOT_FAMILY_COVERAGE'
assert sha(Path(proof['sourceFile'])) == proof['sourceSha256']
chosen = [row for row in proof['rows'] if row.get('exactBodySlots') == [0, 1, 2]
          and row.get('distinctBodySlots') == [3]
          and all(binding['role'] == 'body' for binding in row['bindings'])][:20]
assert len(chosen) == 20 and all(row['slots'][3]['runtimeUsed'] for row in chosen)
original = read(GUIDE / 'source.json')
sources = [source for source in original['sources'] if source['key'] in {row['nativeKey'] for row in chosen}]
assert len(sources) == 20
ROOT.mkdir(exist_ok=False)
ART.mkdir(exist_ok=False)
os.symlink((GUIDE / 'native').resolve(), ROOT / 'native')
guide = dict(schema=original['schema'], theater='NEWURBAN', sources=sources,
    inventoryFile=original['inventoryFile'], inventorySha256=original['inventorySha256'],
    originalGuide=pin(GUIDE / 'source.json'),
    scope='Twenty complete original building families: exact accepted slots 0/1/2 and newly authored NewUrban rubble slot 3.')
write(ROOT / 'source.json', guide)
old = read(Path(proof['acceptedContract']))
assert sha(Path(proof['acceptedContract'])) == proof['acceptedContractSha256']
donor_root = Path('.local/environment-packs') / old['selectedPack']['revision']
assert sha(donor_root / 'manifest.json') == old['selectedPack']['sha256']
donor_pack = read(donor_root / 'manifest.json')
current = read(Path('desktop/environment-newurban-hd-contract.json'))
contract = dict(schema=current['schema'], theater='NEWURBAN', preparedSourceSha256=sha(ROOT / 'source.json'),
    sources={}, families={}, identities={'ra2': {}, 'yr': {}}, aliases={})
profile = dict(schema='m2-4-newurban-rubble-exact-reuse-profile-v1', acceptedNativeBodyFrames={}, nativeFrameTone={})
work = dict(schema='m2-2-shp-native-slot-worklist-v1', preparedSourceSha256=sha(ROOT / 'source.json'),
    members=[], slots={}, batches=[], runtimeAcceptance='UNSELECTED_EXACT_ACCEPTED_BODY_REUSE_AND_NEW_RUBBLE')
iso_hash = proof['targetRubblePalette']['sha256']
iso_file = ROOT / 'native' / (iso_hash + '.pal')
assert sha(iso_file) == iso_hash
colors = np.frombuffer(iso_file.read_bytes(), np.uint8).reshape(256, 3).astype(np.uint16) * 4
rubble_keys, reuse = [], []
for source in sources:
    name = source['member']
    row, = [row for row in chosen if row['member'] == name]
    identity, = sorted({binding['id'] for binding in source['bindings']})
    assert source['totalFrames'] == 8 and source['hasShadow'] and source['remapable']
    donor_family, = row['donorFamilies']
    assert old['families'][donor_family]['members'] == [row['donorMember']]
    donor, = donor_pack['families'][donor_family]['members']
    donor_manifest = donor_root / donor['path']
    assert sha(donor_manifest) == donor['sha256']
    structural = read(donor_manifest)['color']['structuralCoverage']
    assert profile.get('nativeStructuralCoverage', structural) == structural
    profile['nativeStructuralCoverage'] = structural
    profile['acceptedNativeBodyFrames'][name] = dict(sourceSha256=source['sha256'], donorMember=row['donorMember'],
        manifestFile=str(donor_manifest), manifestSha256=donor['sha256'],
        proofFile=str(PROOF), proofSha256=sha(PROOF), slots=[0, 1, 2])
    descriptor = copy.deepcopy(old['sources'][row['donorMember']])
    assert descriptor['bodyFrames'] == 4
    descriptor.update(sha256=source['sha256'], canvas=source['canvas'], totalFrames=8,
        palette=source['palette'], hasShadow=True, remapable=source['remapable'])
    descriptor['framePalettes'] = {str(slot): dict(**source['palette'], role='body', runtimeUsed=True,
        remapable=source['remapable']) for slot in range(3)}
    descriptor['framePalettes']['3'] = dict(member='isoubn.pal', archive='ra2md.mix/cachemd.mix',
        sha256=iso_hash, bytes=768, role='rubble', runtimeUsed=True, remapable=False)
    contract['sources'][name] = descriptor
    family = 'newurban-' + identity.lower()
    basis = dict(theater='NEWURBAN', members={name: descriptor}, identities=[identity])
    editions = sorted({binding['edition'] for binding in source['bindings']})
    contract['families'][family] = dict(members=[name], identities=[identity], kinds=['building'], editions=editions,
        familyHash=hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest())
    for edition in editions:
        contract['identities'][edition][identity] = family
    profile['nativeFrameTone'][name] = {'3': dict(sourceSha256=source['sha256'],
        indexSha256=source['frames'][3]['indexSha256'], paletteSha256=iso_hash)}
    membership = []
    for frame in source['frames'][:4]:
        slot = frame['slot']
        key = f'{name}-{slot:03d}'
        assert sha(ROOT / 'native' / frame['indexFile']) == frame['indexSha256']
        indices = np.frombuffer((ROOT / 'native' / frame['indexFile']).read_bytes(), np.uint8).reshape(frame['size'][::-1])
        mask = (indices != 0) & (indices != 12)
        bounds = Image.fromarray(mask.astype(np.uint8) * 255).getbbox()
        assert bounds
        work['slots'][key] = dict(member=name, nativeSlot=slot, nativeBounds=list(bounds), kind='building',
            group='newurban-rubble', state=['normal', 'damaged', 'occupied', 'rubble'][slot],
            nativeMetadata=frame, sourceSha256=source['sha256'])
        membership.append(dict(slot=slot, key=key, status='EXACT_ACCEPTED_BODY_REUSE' if slot < 3 else 'AWAITING_AUTHORED_SLOT'))
        if slot == 3:
            rgba = np.zeros((*indices.shape, 4), np.uint8)
            rgba[..., :3] = colors[indices].astype(np.uint8)
            rgba[..., 3] = mask.astype(np.uint8) * 255
            Image.fromarray(rgba).crop(bounds).save(ART / (key + '-native.png'))
            rubble_keys.append(key)
    work['members'].append(dict(member=name, sourceSha256=source['sha256'], palette=source['palette'],
        bodyCount=4, totalNativeSlots=8, slots=membership,
        shadowPolicy='Untouched actual NewUrban original shadows, including differences from donor shadows.'))
    reuse.append(dict(member=name, donorMember=row['donorMember'], donorFamily=donor_family,
        exactAcceptedSlots=[0, 1, 2], donorMetadata=pin(donor_manifest), originalShadowSlots=row['shadowSlots']))

jobs = []
for start in range(0, len(rubble_keys), 2):
    keys = rubble_keys[start:start + 2]
    name = f'newurban-rubble-1x2-{start // 2 + 1:02d}'
    board = Image.new('RGBA', (1920, 1920))
    cell_height = 960
    for index, key in enumerate(keys):
        sprite = Image.open(ART / (key + '-native.png'))
        capacity = min(1824 / sprite.width, (cell_height - 96) / sprite.height)
        size = tuple(round(value * capacity) for value in sprite.size)
        x, y = (1920 - size[0]) // 2, index * cell_height + (cell_height - size[1]) // 2
        board.alpha_composite(sprite.resize(size, Image.Resampling.NEAREST), (x, y))
        work['slots'][key].update(board=name + '-master.png', slotRect=[0, index * cell_height, 1920, cell_height],
            referenceRect=[x, y, *size], referenceCapacity=capacity)
    reference = ART / (name + '-reference.png')
    board.save(reference)
    work['batches'].append(dict(name=name, group='newurban-rubble', boardSize=[1920, 1920],
        columns=1, rows=2, slots=keys, status='UNTOUCHED_NEWURBAN_ISO_PALETTE_REFERENCE_ONLY'))
    prompt = ('Use case: precise-object-edit. Asset type: reusable high-resolution Red Alert 2 NEWURBAN building rubble sprites. '
        'Image 1 is only the untouched original low-resolution geometry, debris arrangement and actual NewUrban Iso-palette color reference. '
        'Repaint this reference as two genuinely new high-resolution sprites, one column and two equal rows, top to bottom: '
        + ', '.join(keys) + '. Preserve each exact flat isometric footprint, low height profile, principal surviving wall fragments, '
        'pit and debris positions, broad colors, material identities and upper-left lighting. Use the accepted RA2 HD style: '
        'coherent fractured masonry, fine concrete and brick, exposed structural steel, bent roof sheets and restrained dust. '
        'Original coarse pixels are resolution artifacts, not physical square stones or material grain. Replace them with smooth '
        'continuous contours, crisp fine structural edges and readable surfaces. Avoid speckle, repeated pebbles, thick outlines, '
        'blocky tessellation, heavy sharpening, interpolated pixels or blur as substitute detail. Keep both designs distinct; '
        'do not invent a new building, tall pile, vegetation, fire, smoke, snow or decorative pattern. Each sprite stays centered '
        'in its own equal half of a 1920 by 1920 sheet, separated by generous transparent gutter and outer margins. '
        'No extra ground plane, external cast shadow, labels, text, frame, checkerboard or painted background. Truly transparent '
        'background. Sufficient independent new detail for complete 2X and 4X exports. Preserve original geometry and source colors.')
    jobs.append(dict(id=name, reference=str(reference.resolve()), referenceSha256=sha(reference),
        destination=str((ART / (name + '-master.png')).resolve()), members=keys,
        cellLayout=[1, 2], boardSize=[1920, 1920], prompt=prompt))
write(ROOT / 'contract.json', contract)
write(ART / 'worklist.json', work)
write(ART / 'material-profile-v1.json', profile)
write(ART / 'imagegen-jobs-v1.json', dict(schema='m2-4-newurban-rubble-imagegen-jobs-v1',
    worklistSha256=sha(ART / 'worklist.json'), jobs=jobs))
write(ART / 'source-and-reuse-v1.json', dict(status='PASS_SOURCE_PREPARATION_ONLY_EXPORT_AND_NATIVE_PENDING',
    proof=pin(PROOF), guide=pin(ROOT / 'source.json'), contract=pin(ROOT / 'contract.json'),
    sourceGroups=20, exactAcceptedBodyStates=60, newRubbleStates=20, originalShadowFrames=80,
    reuse=reuse, selectionChanged=False, coverageAdded=0, windows='NOT_RUN'))
audit_file = PREFLIGHT / 'urban-current-v1.json'
audit = read(audit_file)
families = {'urban-capark04', 'urban-capark05', 'urban-capark06', 'urban-camisc06'}
audit['qualified'] = [row for row in audit['qualified'] if row['donorFamily'] in families]
assert len(audit['qualified']) == 4
audit['parentAudit'] = pin(audit_file)
audit['donorFamilyAllowlist'] = sorted(families)
audit['rejected'] = []
write(PREFLIGHT / 'four-complete-families-audit-v1.json', audit)
print(json.dumps(dict(families=20, exactAcceptedBodyStates=60, newRubbleStates=20,
    imagegenBoards=len(jobs), completeReuseFamilies=4, selected=False)))
