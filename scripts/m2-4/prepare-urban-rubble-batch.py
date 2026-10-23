"""Prepare complete Urban civilian families with exact accepted body-state reuse."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import numpy as np
from PIL import Image

read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
write = lambda path, value: path.write_text(json.dumps(value, indent=2) + '\n')
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--batch', type=int, default=49)
parser.add_argument('--count', type=int, default=12)
parser.add_argument('--queue', type=Path)
args = parser.parse_args()
assert args.batch >= 49 and 1 <= args.count <= 49
base = Path('.artifacts/m2-4/urban-civilians-native-batch49-v1')
proof_file = base / 'temperate-body-reuse-v2.json'
proof = read(proof_file)
wanted = {row['member'] for row in read(args.queue)['rows'] if len(row['donorMembers']) == 1} if args.queue else None
chosen = [row for row in proof['rows'] if row.get('slots') and (wanted is None or row['member'] in wanted)][:args.count]
assert len(chosen) == args.count and all(all(slot['status'] == 'ELIGIBLE_EXACT_RENDERED_BODY_DONOR'
    for slot in row['slots'][:3]) for row in chosen)
root = Path(f'.artifacts/m2-4/urban-building-rubble-native-batch{args.batch}-v1')
authoring = Path(f'.artifacts/m2-4/urban-building-rubble-authoring-batch{args.batch}-v1')
root.mkdir(exist_ok=False); authoring.mkdir(exist_ok=False)
guide = read(base / 'source.json')
guide['sources'] = [source for source in guide['sources'] if source['member'] in {row['member'] for row in chosen}]
assert len(guide['sources']) == args.count
guide['scope'] = f'{args.count} unselected complete civilian families; reuse proven body slots 0/1/2 and author actual Urban rubble slot 3.'
write(root / 'source.json', guide)
os.symlink((base / 'native').resolve(), root / 'native')
old = read(Path('desktop/environment-hd-contract.json'))
old_root = Path('.local/environment-packs') / old['selectedPack']['revision']
old_pack = read(old_root / 'manifest.json')
assert sha(old_root / 'manifest.json') == old['selectedPack']['sha256']
current = read(Path('desktop/environment-urban-hd-contract.json'))
contract = dict(schema=current['schema'], theater='URBAN', preparedSourceSha256=sha(root / 'source.json'),
    sources={}, families={}, identities={'ra2': {}, 'yr': {}}, aliases={})
profile = dict(schema='m2-4-urban-rubble-reuse-material-profile-v1', acceptedNativeBodyFrames={}, nativeFrameTone={})
work = dict(schema='m2-2-shp-native-slot-worklist-v1', preparedSourceSha256=sha(root / 'source.json'),
    members=[], slots={}, batches=[], runtimeAcceptance='UNSELECTED_SOURCE_PROVEN_BODY_REUSE_AND_NEW_RUBBLE')
rubble_keys = []
iso_hash = 'b1f4c15b7b91130736b4dffeb189ca32621bf606afbc0b2d02eb5584b6921fe3'
iso_file = root / 'native' / (iso_hash + '.pal')
assert sha(iso_file) == iso_hash
palette = np.frombuffer(iso_file.read_bytes(), np.uint8).reshape(256, 3).astype(np.uint16) * 4
for source in guide['sources']:
    name = source['member']; row, = [row for row in chosen if row['member'] == name]
    identity, = sorted({binding['id'] for binding in source['bindings']})
    assert source['totalFrames'] == 8 and source['hasShadow']
    donor_family, = [family for family, item in old['families'].items() if row['donorMember'] in item['members']]
    assert old['families'][donor_family]['members'] == [row['donorMember']]
    donor, = old_pack['families'][donor_family]['members']
    donor_manifest = old_root / donor['path']
    assert sha(donor_manifest) == donor['sha256']
    structural = read(donor_manifest)['color']['structuralCoverage']
    assert profile.get('nativeStructuralCoverage', structural) == structural
    profile['nativeStructuralCoverage'] = structural
    profile['acceptedNativeBodyFrames'][name] = dict(sourceSha256=source['sha256'],
        donorMember=row['donorMember'], manifestFile=str(donor_manifest), manifestSha256=donor['sha256'],
        proofFile=str(proof_file), proofSha256=sha(proof_file), slots=[0, 1, 2])
    descriptor = copy.deepcopy(old['sources'][row['donorMember']])
    assert descriptor['bodyFrames'] == 4
    descriptor.update(sha256=source['sha256'], canvas=source['canvas'], totalFrames=8,
        palette=source['palette'], hasShadow=True, remapable=source['remapable'])
    for number in range(3):
        descriptor['framePalettes'][str(number)] = dict(**source['palette'], role='body', runtimeUsed=True,
            remapable=source['remapable'])
    descriptor['framePalettes']['3'] = dict(member='isourb.pal', archive='ra2.mix/cache.mix',
        sha256=iso_hash, bytes=768, role='rubble', runtimeUsed=str(source['nativeRules'].get('LeaveRubble', 'no')).lower()
        in ('yes', 'true', '1'), remapable=False)
    contract['sources'][name] = descriptor
    family = 'urban-' + identity.lower()
    basis = dict(theater='URBAN', members={name: descriptor}, identities=[identity])
    editions = sorted({binding['edition'] for binding in source['bindings']})
    contract['families'][family] = dict(members=[name], identities=[identity], kinds=['building'], editions=editions,
        familyHash=hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest())
    for edition in editions: contract['identities'][edition][identity] = family
    unused_rubble = not descriptor['framePalettes']['3']['runtimeUsed']
    if unused_rubble:
        assert source['sha256'] == row['donorSourceSha256']
        assert row['slots'][3]['sameGeometry'] and row['slots'][3]['differingNativeIndices'] == 0
        profile['acceptedNativeBodyFrames'][name].update(slots=[0, 1, 2, 3], sourceIdenticalUnusedRubble=True)
    else:
        profile['nativeFrameTone'][name] = {'3': dict(sourceSha256=source['sha256'],
            indexSha256=source['frames'][3]['indexSha256'], paletteSha256=iso_hash)}
    membership = []
    for frame in source['frames'][:4]:
        key = f'{name}-{frame["slot"]:03d}'
        indices = np.frombuffer((root / 'native' / frame['indexFile']).read_bytes(), np.uint8).reshape(frame['size'][::-1])
        assert sha(root / 'native' / frame['indexFile']) == frame['indexSha256']
        mask = (indices != 0) & (indices != 12)
        bounds = Image.fromarray(mask.astype(np.uint8) * 255).getbbox()
        info = dict(member=name, nativeSlot=frame['slot'], nativeBounds=list(bounds), kind='building',
            group='urban-rubble', state=['normal', 'damaged', 'occupied', 'rubble'][frame['slot']],
            nativeMetadata=frame, sourceSha256=source['sha256'])
        work['slots'][key] = info
        membership.append(dict(slot=frame['slot'], key=key,
            status='EXACT_ACCEPTED_BODY_REUSE' if frame['slot'] < 3 or unused_rubble else 'AWAITING_AUTHORED_SLOT'))
        if frame['slot'] == 3 and not unused_rubble:
            rgba = np.zeros((*indices.shape, 4), np.uint8)
            rgba[..., :3] = palette[indices].astype(np.uint8); rgba[..., 3] = mask.astype(np.uint8) * 255
            Image.fromarray(rgba).crop(bounds).save(authoring / (key + '-native.png'))
            rubble_keys.append(key)
    work['members'].append(dict(member=name, sourceSha256=source['sha256'], palette=source['palette'],
        bodyCount=4, totalNativeSlots=8, slots=membership,
        shadowPolicy='Untouched native separate shadows; no generated shadow substitute'))
jobs = []
for start in range(0, len(rubble_keys), 2):
    keys = rubble_keys[start:start + 2]; board = Image.new('RGBA', (1920, 1920)); name = f'urban-rubble-1x2-{start // 2 + 1:02d}'
    cell_height = 1920 // len(keys)
    for index, key in enumerate(keys):
        sprite = Image.open(authoring / (key + '-native.png'))
        capacity = min(1824 / sprite.width, (cell_height - 96) / sprite.height)
        size = tuple(round(value * capacity) for value in sprite.size)
        x, y = (1920 - size[0]) // 2, index * cell_height + (cell_height - size[1]) // 2
        board.alpha_composite(sprite.resize(size, Image.Resampling.NEAREST), (x, y))
        work['slots'][key].update(board=name + '-master.png', slotRect=[0, index * cell_height, 1920, cell_height],
            referenceRect=[x, y, *size], referenceCapacity=capacity)
    reference = authoring / (name + '-reference.png'); board.save(reference)
    batch = dict(name=name, group='urban-rubble', boardSize=[1920, 1920], columns=1, rows=len(keys),
        slots=keys, status='ORIGINAL_URBAN_ISO_PALETTE_GUIDES_ONLY')
    work['batches'].append(batch)
    prompt = ('Use case: precise-object-edit. Asset type: reusable high-resolution Red Alert 2 URBAN building rubble sprites. '
        'Image 1 is the untouched original shape, debris arrangement and actual Urban Iso-palette color reference. '
        'One column and two equal rows, top to bottom: ' + ', '.join(keys) + '. '
        'Repaint genuine fine masonry, broken concrete, brick, exposed steel, burnt roof sheets and dusty soil detail inside '
        'each EXACT original low flat isometric rubble footprint. Preserve each individual collapsed building identity, '
        'surviving wall shapes, major debris and pit locations, height profile, native perspective, source colors and upper-left light. '
        'Keep rubble restrained and readable, with coherent structural fragments and subtle surface detail, matching accepted RA2 HD art. '
        'Do not invent new standing buildings, tall piles, objects, snow, decorative patterns or regular repeated stones. '
        'No ordinary pixel enlargement, mosaic, sharpening, blur or interpolated pixels as new detail. '
        'Each subject stays centered in its own half of the sheet with transparent margins and a clear middle gutter. '
        'No ground plane extending beyond its original footprint, external cast shadows, new vegetation, fire, smoke, labels, '
        'text, frame, checkerboard or background. Truly transparent background. Target 1920 by 1920 pixels; '
        'produce enough independently authored detail for complete 2X and 4X exports. Preserve all distinct material color regions.')
    if len(keys) == 1:
        prompt = prompt.replace('One column and two equal rows, top to bottom:', 'One single centered subject only:')
        prompt = prompt.replace('Each subject stays centered in its own half of the sheet with transparent margins and a clear middle gutter.',
                                'Keep the one subject centered with generous transparent margins.')
    jobs.append(dict(id=name, reference=str(reference.resolve()), referenceSha256=sha(reference),
        destination=str((authoring / (name + '-master.png')).resolve()), members=keys,
        cellLayout=[1, len(keys)], boardSize=[1920, 1920], prompt=prompt))
write(root / 'contract.json', contract); write(authoring / 'worklist.json', work)
write(authoring / 'material-profile-v1.json', profile)
write(authoring / 'imagegen-jobs-v1.json', dict(schema='m2-4-urban-rubble-imagegen-jobs-v1',
    worklistSha256=sha(authoring / 'worklist.json'), jobs=jobs))
print(json.dumps(dict(families=args.count, exactAcceptedBodyStates=3 * args.count, newRubbleStates=len(rubble_keys), boards=len(jobs), selected=False)))
