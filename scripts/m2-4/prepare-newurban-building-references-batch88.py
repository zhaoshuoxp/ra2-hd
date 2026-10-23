"""Prepare source-pinned rubble guides while preserving native state and review gates."""
import copy
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

BASE = Path('.artifacts/m2-4')
ROOT = BASE / 'newurban-building-references-batch88-v1'
GUIDE = BASE / 'newurban-native-v1'
PROOF = BASE / 'newurban-reuse-batch87-preflight-v1/building-state-audit-v1.json'
PRIOR = BASE / 'newurban-buildings-batch87-20261020'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)


def write(file, value):
    with file.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


proof = read(PROOF)
assert sha(GUIDE / 'source.json') == proof['sourceSha256']
accepted = read(Path(proof['acceptedContract']))
assert sha(Path(proof['acceptedContract'])) == proof['acceptedContractSha256']
gaps = read(PRIOR / 'inventory-reconciliation-v1.json')
missing = {row['member'] for row in gaps['remainingGaps'] if row['kind'] == 'building'}
selected = Path('.local/environment-newurban-selection.json')
selector_before = pin(selected)
assert read(selected) == read(PRIOR / 'coverage-and-native-closure-v1.json')['candidate']
chosen = []
for row in proof['rows']:
    families = row.get('donorFamilies', [])
    if (row['member'] not in missing or row.get('exactBodySlots') != [0, 1, 2]
            or row.get('distinctBodySlots') != [3] or len(families) != 1):
        continue
    if (not all(binding['role'] == 'body' for binding in row['bindings'])
            or len(accepted['families'][families[0]]['members']) != 1
            or any(binding['id'].startswith('CASTL05') for binding in row['bindings'])):
        continue
    chosen.append(row)
assert len(chosen) == 39
guide = read(GUIDE / 'source.json')
sources = {source['key']: source for source in guide['sources']}
iso_file = GUIDE / 'native' / (proof['targetRubblePalette']['sha256'] + '.pal')
assert sha(iso_file) == proof['targetRubblePalette']['sha256']
palette = np.frombuffer(iso_file.read_bytes(), np.uint8).reshape(256, 3).astype(np.uint16) * 4
ROOT.mkdir(exist_ok=False)
records, references, originals = [], [], {str(iso_file): pin(iso_file)}
pack_root = Path('.local/environment-packs') / accepted['selectedPack']['revision']
assert sha(pack_root / 'manifest.json') == accepted['selectedPack']['sha256']
pack = read(pack_root / 'manifest.json')
prior_sources = read(BASE / 'newurban-building-rubble-native-batch87-v1/source.json')['sources']
shared, = [source for source in prior_sources if source['member'] == 'cnnewy06.shp']
for row in chosen:
    source = sources[row['nativeKey']]
    assert source['totalFrames'] == 8 and source['hasShadow']
    for relative, digest in [(source['nativeFile'], source['sha256']),
                             (source['palette']['sha256'] + '.pal', source['palette']['sha256'])]:
        file = GUIDE / 'native' / relative
        assert sha(file) == digest
        originals[str(file)] = pin(file)
    for frame in source['frames']:
        for key, hash_key in [('file', 'rgbaSha256'), ('indexFile', 'indexSha256')]:
            file = GUIDE / 'native' / frame[key]
            assert sha(file) == frame[hash_key]
            originals[str(file)] = pin(file)
    donor, = pack['families'][row['donorFamilies'][0]]['members']
    donor_file = pack_root / donor['path']
    assert sha(donor_file) == donor['sha256']
    frame = source['frames'][3]
    indices = np.fromfile(GUIDE / 'native' / frame['indexFile'], np.uint8).reshape(frame['size'][::-1])
    mask = (indices != 0) & (indices != 12)
    bounds = Image.fromarray(mask.astype(np.uint8) * 255).getbbox()
    assert bounds
    identity, = sorted({binding['id'] for binding in source['bindings']})
    record = dict(member=source['member'], identity=identity, sourceKey=source['key'],
        sourceSha256=source['sha256'], acceptedBodySlots=[0, 1, 2], donorMetadata=pin(donor_file),
        sourcePalette=source['palette'], rubblePalette=proof['targetRubblePalette'],
        bodyProof=pin(PROOF), nativeBodySlots=4, originalShadowSlots=4,
        mapIds=sorted({name for binding in source['bindings'] for name in binding['mapIds']}))
    if not row['slots'][3]['runtimeUsed']:
        assert source['member'] == 'cnfarm02.shp'
        assert source['sha256'] == row['donorSourceSha256']
        assert row['slots'][3]['sameGeometry'] and row['slots'][3]['differingNativeIndices'] == 0
        record.update(rubble='NATIVE_UNUSED_SOURCE_IDENTICAL_SLOT_PRESERVATION', newRubbleArtRequired=False,
            reason='Original LeaveRubble remains disabled. Preserve the complete source slot without inventing a visible destruction state.')
    elif source['member'] == 'cnnewy07.shp':
        assert frame['size'] == shared['frames'][3]['size']
        assert frame['indexSha256'] == shared['frames'][3]['indexSha256']
        record.update(rubble='SOURCE_EXACT_BATCH87_RUBBLE_REUSE_VISUAL_GATE_PENDING', newRubbleArtRequired=False,
            sourceIdenticalRubble=dict(member=shared['member'], sourceSha256=shared['sha256'],
                indexSha256=frame['indexSha256'], paletteSha256=proof['targetRubblePalette']['sha256'],
                policy='Reuse the identical density payload only after the pending Batch87 visual gate; keep each native origin and shadow.'))
    else:
        assert row['slots'][3]['runtimeUsed']
        rgba = np.zeros((*indices.shape, 4), np.uint8)
        rgba[..., :3] = palette[indices].astype(np.uint8)
        rgba[..., 3] = mask.astype(np.uint8) * 255
        file = ROOT / f'{source["member"]}-rubble-original-guide.png'
        Image.fromarray(rgba).crop(bounds).save(file)
        record.update(rubble='NEW_MATERIAL_REQUIRED', newRubbleArtRequired=True,
            originalGuide=pin(file), originalBounds=list(bounds))
        references.append(record)
    records.append(record)
assert len(references) == 37
jobs = []
for start in range(0, len(references), 2):
    rows = references[start:start + 2]
    name = f'newurban-rubble-batch88-1x{len(rows)}-{start // 2 + 1:02d}'
    board = Image.new('RGBA', (1920, 1920))
    height = 1920 // len(rows)
    for index, row in enumerate(rows):
        sprite = Image.open(row['originalGuide']['file'])
        capacity = min(1824 / sprite.width, (height - 96) / sprite.height)
        size = tuple(round(value * capacity) for value in sprite.size)
        left, top = (1920 - size[0]) // 2, index * height + (height - size[1]) // 2
        board.alpha_composite(sprite.resize(size, Image.Resampling.NEAREST), (left, top))
        row['referencePlacement'] = dict(board=name + '-reference.png', slotRect=[0, index * height, 1920, height],
            referenceRect=[left, top, *size], capacity=capacity)
    file = ROOT / (name + '-reference.png')
    board.save(file)
    layout = 'two equal rows, top to bottom' if len(rows) == 2 else 'one centered subject'
    prompt = ('Use case: precise-object-edit. Asset type: genuinely new high-resolution Red Alert 2 NEWURBAN rubble. '
        'Image 1 is only the untouched low-resolution geometry, debris arrangement and actual Iso-palette color guide. '
        f'One column, {layout}: ' + ', '.join(row['identity'] for row in rows) + '. '
        'Repaint distinct coherent masonry, concrete, brick, exposed steel, fractured roof sheets and restrained dust. '
        'Preserve exact flat isometric footprint, low height profile, major surviving wall and debris positions, material '
        'identities, broad source colors and upper-left light. Follow accepted RA2 HD material style. Original coarse '
        'pixels and stair steps are resolution artifacts: replace them with continuous contours, smooth structural edges '
        'and readable fine surfaces. No block mosaic, speckle, repeated pebbles, excessive grain, thick outlines, '
        'sharpening, interpolation or blur as new detail. Do not invent a standing building, tall pile, vegetation, '
        'snow, smoke, fire, decorative pattern or external cast shadow. Keep each sprite centered within its own cell '
        'with generous transparent margins and gutter. Truly transparent background; no painted ground plane, labels, '
        'text, checkerboard or frame. Target 1920 by 1920; enough independent new detail for complete 2X and 4X exports.')
    jobs.append(dict(id=name, reference=pin(file), destination=str(ROOT / (name + '-master.png')),
        members=[row['member'] for row in rows], layout=[1, len(rows)], prompt=prompt,
        status='BUILTIN_GENERATION_NOT_RUN_OR_HD_COVERAGE'))
write(ROOT / 'source.json', dict(schema=guide['schema'], theater='NEWURBAN',
    sources=[copy.deepcopy(sources[row['nativeKey']]) for row in chosen], originalGuide=pin(GUIDE / 'source.json'),
    scope='Unselected future complete families. References are low-resolution source controls, not HD resources.'))
write(ROOT / 'source-preparation-v1.json', dict(status='PASS_39_SOURCE_GROUPS_117_ACCEPTED_BODY_STATES_PREPARED_ONLY',
    priorClosure=pin(PRIOR / 'coverage-and-native-closure-v1.json'), scopeProof=pin(PROOF), records=records,
    completeFamilyCandidates=39, acceptedBodyStateCandidates=117, newRubbleStudiesRequired=37,
    sourceExactRubbleReusePendingBatch87=1, nativeUnusedRubbleSlots=1,
    originalFiles=list(originals.values()), generationJobs=jobs,
    runtimeAcceptance='NOT_SELECTED_NOT_BUILT_NOT_NATIVE_TESTED', newHdFamiliesClaimed=0,
    visualAcceptance='NO_NEW_ART_CREATED_BATCH87_GATE_REMAINS_PENDING', windows='NOT_RUN', m24Complete=False))
assert pin(selected) == selector_before
print(json.dumps(dict(sourceGroups=39, acceptedBodyStates=117, newRubbleGuides=37,
    futureBuiltinJobs=len(jobs), selectorUnchanged=True, newHdCoverage=0)))
