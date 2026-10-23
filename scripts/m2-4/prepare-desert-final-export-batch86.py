"""Bind only proven accepted states and new body mothers into a complete source-slot worklist."""
import copy
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path('.artifacts/m2-4/desert-final-buildings-native-batch86-v1')
ART = Path('.artifacts/m2-4/desert-final-buildings-authoring-batch86-v1')
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()


def write(path, value):
    with path.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


source = {row['member']: row for row in read(ROOT / 'source.json')['sources']}
contract = read(ROOT / 'contract.json')
preflight = read(ART / 'source-and-reuse-preflight-v1.json')
proof = dict(status='PASS_READ_ONLY_RENDERED_BODY_COMPARISON_NOT_FAMILY_COVERAGE', rows=[],
    scope='Exact accepted bench, airport flag, and mobile-home normal/damaged states only. Other house states and all airport body/active material require new art.')
reuse = {}
donor_guides = {}
for file in [Path('.artifacts/m2-4/urban-civilians-native-batch49-v1/source.json'),
             Path('.artifacts/m2-4/urban-building-rubble-native-batch52-v1/source.json')]:
    for row in read(file)['sources']:
        donor_guides[row['member']] = row, file.parent
for candidate in preflight['acceptedReuseCandidates']:
    name = candidate['member']
    native = source[name]
    donor, folder = donor_guides[candidate['donorMember']]
    count = native['totalFrames'] // (2 if native['hasShadow'] else 1)
    donor_count = donor['totalFrames'] // (2 if donor['hasShadow'] else 1)
    assert native['canvas'] == donor['canvas'] and count == donor_count
    assert native['palette']['sha256'] == donor['palette']['sha256']
    slots = []
    for number, frame in enumerate(native['frames'][:count]):
        other = donor['frames'][number]
        geometry = all(frame[key] == other[key] for key in ['origin', 'size', 'empty'])
        different = None
        if geometry:
            target = np.fromfile(ROOT / 'native' / frame['indexFile'], np.uint8)
            original = np.fromfile(folder / 'native' / other['indexFile'], np.uint8)
            assert sha(ROOT / 'native' / frame['indexFile']) == frame['indexSha256']
            assert sha(folder / 'native' / other['indexFile']) == other['indexSha256']
            different = int(np.count_nonzero(target != original))
        slots.append(dict(slot=number, sameGeometry=geometry, differingNativeIndices=different,
            nativeIndexSha256=frame['indexSha256'], paletteSha256=native['palette']['sha256'],
            status='ELIGIBLE_EXACT_RENDERED_BODY_DONOR' if geometry and different == 0
            else 'DIFFERENT_ORIGINAL_STATE_NEW_MATERIAL_REQUIRED'))
    proof['rows'].append(dict(member=name, sourceSha256=native['sha256'], donorMember=donor['member'],
        donorSourceSha256=donor['sha256'], targetBodyFrames=count, donorBodyFrames=donor_count, slots=slots))
    declaration = dict(sourceSha256=native['sha256'], donorMember=donor['member'],
        manifestFile=candidate['donorMetadata']['file'], manifestSha256=candidate['donorMetadata']['sha256'])
    if name == 'cdairp_f.shp':
        declaration.update(completeOriginalAnimation=True, slots=list(range(16)))
    elif name == 'cgpark06.shp':
        declaration.update(completeSingleFrameBody=True, slots=[0])
    else:
        assert name == 'cdhse06.shp'
        declaration.update(sourceIdenticalNormalDamagedOnly=True, slots=[0, 1])
    reuse[name] = declaration
proof_file = ART / 'accepted-state-reuse-proof-v1.json'
write(proof_file, proof)
for declaration in reuse.values():
    declaration.update(proofFile=str(proof_file), proofSha256=sha(proof_file))

body = read(ART / 'body-worklist-v1.json')
overrides = read(ART / 'body-slot-overrides-v1.json')
work = dict(schema='m2-2-shp-native-slot-worklist-v1', preparedSourceSha256=sha(ROOT / 'source.json'),
    members=[], slots=copy.deepcopy(body['slots']), batches=[],
    runtimeAcceptance='UNSELECTED_FULL_FAMILY_EXPORT_AND_NATIVE_PENDING')
work['slots']['cdairp.shp-000'].update(overrides['cdairp.shp-000'])
for name, native in source.items():
    count = native['totalFrames'] // (2 if native['hasShadow'] else 1)
    slots = []
    for frame in native['frames'][:count]:
        number, key = frame['slot'], f'{name}-{frame["slot"]:03d}'
        if frame['empty']:
            slots.append(dict(slot=number, status='EXACT_NATIVE_EMPTY'))
            continue
        reused = number in reuse.get(name, {}).get('slots', [])
        indices = np.fromfile(ROOT / 'native' / frame['indexFile'], np.uint8).reshape(frame['size'][::-1])
        marker = set(indices.ravel()).issubset({0, 1})
        bounds = Image.fromarray(((indices != 0) & (indices != 12)).astype(np.uint8) * 255).getbbox()
        assert bounds
        info = work['slots'].setdefault(key, dict(member=name, nativeSlot=number,
            sourceSha256=native['sha256'], nativeMetadata=frame, nativeBounds=list(bounds),
            kind='building', group='desert-final-building'))
        info['occupied'] = 1 if name == 'cdairp.shp' and number == 0 else info.get('occupied',
            sum(item['board'] == info.get('board') for item in body['slots'].values()))
        if marker or reused or name == 'cdairp_a.shp':
            info['componentRegistrationOnly'] = True
        slots.append(dict(slot=number, key=key, status='ACCEPTED_EXACT_SOURCE_STATE' if reused
            else 'EXACT_NATIVE_PALETTE_MARKER' if marker else 'NEW_CONTINUOUS_HD_MATERIAL'))
    work['members'].append(dict(member=name, sourceSha256=native['sha256'], palette=native['palette'],
        bodyCount=count, totalNativeSlots=native['totalFrames'], slots=slots,
        shadowPolicy='Untouched original separate shadow slots and index-12 contact; no generated shadow'))
for board in sorted({item['board'] for item in work['slots'].values() if 'board' in item}):
    items = [key for key, item in work['slots'].items() if item.get('board') == board]
    work['batches'].append(dict(name=board.removesuffix('-master.png'), group='desert-final-building',
        boardSize=work['slots'][items[0]]['boardSize'], columns=1, rows=len(items), slots=items,
        status='NEW_BODY_MOTHER_REQUIRES_FINAL_REGISTRATION_QA'))
structural = read(Path('.artifacts/m2-4/urban-building-rubble-authoring-batch52-v1/material-profile-v2.json'))['nativeStructuralCoverage']
profile = dict(schema='m2-4-desert-final-buildings-material-v1', nativeStructuralCoverage=structural,
    acceptedNativeBodyFrames=reuse, nativeOwnerMaterialRegistration=True, nativeFrameTone={},
    nativePaletteMarkerFrames={})
for name in ['cdairp.shp', 'cdhse06.shp', 'cgegyp02.shp']:
    profile['nativeFrameTone'][name] = {'3': dict(sourceSha256=source[name]['sha256'],
        indexSha256=source[name]['frames'][3]['indexSha256'],
        paletteSha256=contract['sources'][name]['framePalettes']['3']['sha256'])}
active = source['cdairp_a.shp']
markers = {str(frame['slot']): frame['indexSha256'] for frame in active['frames'][:20]
    if not frame['empty'] and set(np.fromfile(ROOT / 'native' / frame['indexFile'], np.uint8)).issubset({0, 1})}
assert set(map(int, markers)) == {10, 11, 12, 13, 16, 17, 19}
profile['nativePaletteMarkerFrames']['cdairp_a.shp'] = dict(sourceSha256=active['sha256'], indices=[1], frames=markers)
assert sum(member['bodyCount'] for member in work['members']) == 49
assert len(work['slots']) == 46 and len(body['slots']) == 10
write(ART / 'worklist.json', work)
write(ART / 'material-profile-v1.json', profile)
print(json.dumps(dict(sourceBodySlots=49, substantialAndMarkerSlots=len(work['slots']),
    acceptedBodySlots=19, newBodyStates=10, newRadarPhases=10, markerSlots=7, emptySlots=3,
    sourceSelectionChanged=False)))
