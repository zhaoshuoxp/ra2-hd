"""Prepare every remaining NewUrban rock and both stock crate families together."""
import copy
import hashlib
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image

from newurban_batch89_io import pin, read, sha, write

ROOT = Path('.artifacts/m2-4/newurban-rock-crates-batch90-20261020')
PRIOR = Path('.artifacts/m2-4/newurban-linked-buildings-batch89-20261020')
GUIDE = Path('.artifacts/m2-4/newurban-native-v1')
acceptance = read(PRIOR / 'user-acceptance-20261020.json')
assert acceptance['status'] == 'USER_ACCEPTED_NEWURBAN_LINKED_BUILDINGS_BATCH89'
assert read('.local/environment-newurban-selection.json') == acceptance['candidate']
remaining = read(PRIOR / 'inventory-reconciliation-v1.json')['remainingGaps']
gaps = [g for g in remaining if g['kind'] == 'overlay' and g['identities'][0] not in ['GAFWLL', 'CAFNCP']]
assert len(gaps) == 10
guide = read(GUIDE / 'source.json')
chosen = [next(s for s in guide['sources'] if s['member'] == g['member'] and s['sha256'] == g['sha256']) for g in gaps]
ROOT.mkdir(exist_ok=False)
os.symlink((GUIDE / 'native').resolve(), ROOT / 'native')
for name, file in [('baseline-contract.json', Path('desktop/environment-newurban-hd-contract.json')),
                   ('baseline-selector.json', Path('.local/environment-newurban-selection.json'))]:
    with (ROOT / name).open('xb') as stream:
        stream.write(file.read_bytes())
write(ROOT / 'source.json', dict(schema=guide['schema'], theater='NEWURBAN', originalGuide=pin(GUIDE / 'source.json'),
    sources=chosen, scope='Eight original placed rock sources and the complete stock land/water crate families.'))
contract = dict(schema=read(ROOT / 'baseline-contract.json')['schema'], theater='NEWURBAN',
    preparedSourceSha256=sha(ROOT / 'source.json'), sources={}, families={}, identities={'ra2': {}, 'yr': {}}, aliases={})
records, originals = [], {}
for source in chosen:
    name = source['member']
    identity, = {b['id'] for b in source['bindings']}
    assert source['hasShadow'] and not source['remapable'] and source['totalFrames'] == 2
    assert source['palette']['member'] == 'isoubn.pal'
    descriptor = dict(sha256=source['sha256'], canvas=source['canvas'], totalFrames=2, bodyFrames=1,
        palette=source['palette'], hasShadow=True, remapable=False)
    contract['sources'][name] = descriptor
    family = 'newurban-' + identity.lower()
    basis = dict(theater='NEWURBAN', members={name: descriptor}, identities=[identity])
    editions = sorted({b['edition'] for b in source['bindings']})
    contract['families'][family] = dict(members=[name], identities=[identity], kinds=['overlay'], editions=editions,
        familyHash=hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest())
    for edition in editions:
        contract['identities'][edition][identity] = family
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
    frame = source['frames'][0]
    indices = np.fromfile(ROOT / 'native' / frame['indexFile'], np.uint8).reshape(frame['size'][::-1])
    palette = np.fromfile(ROOT / 'native' / (source['palette']['sha256'] + '.pal'), np.uint8)
    palette = palette.reshape(256, 3).astype(np.uint16) * 4
    bounds = Image.fromarray((indices != 0).astype(np.uint8) * 255).getbbox()
    assert bounds
    rgba = np.dstack((palette[indices].astype(np.uint8), (indices != 0).astype(np.uint8) * 255))
    file = ROOT / (name + '-original-guide.png')
    Image.fromarray(rgba).crop(bounds).save(file)
    records.append(dict(member=name, identity=identity, family=family, sourceSha256=source['sha256'],
        sourceKey=source['key'], originalGuide=pin(file), originalBounds=list(bounds),
        mapIds=sorted({m for b in source['bindings'] for m in b['mapIds']}),
        palette=source['palette'], nativeShadowSlots=[1], nativeRules=source['nativeRules']))
write(ROOT / 'contract.json', contract)
jobs = []
for start in range(0, len(records), 2):
    subjects = records[start:start + 2]
    name = f'newurban-rock-crates-batch90-1x2-{start // 2 + 1:02d}'
    board = Image.new('RGBA', (1920, 1920))
    for index, record in enumerate(subjects):
        sprite = Image.open(record['originalGuide']['file'])
        scale = min(1700 / sprite.width, 760 / sprite.height)
        size = tuple(round(n * scale) for n in sprite.size)
        board.alpha_composite(sprite.resize(size, Image.Resampling.NEAREST),
            ((1920 - size[0]) // 2, index * 960 + (960 - size[1]) // 2))
    file = ROOT / (name + '-reference.png')
    board.save(file)
    crates = subjects[0]['identity'] == 'CRATE'
    material = ('Rebuild the pictured upright wooden supply crate with its exact unmarked tan lid, dark wood faces and narrow timber braces, '
        'and the pictured floating crate with the same wooden box, black rubber flotation ring and brown retaining ropes. '
        'Use broad smooth wood boards, clean straight banding, readable continuous silhouettes and restrained '
        'fine material. Do not add any emblem, text or symbols.' if crates else
        'Rebuild the pictured natural rock forms as coherent solid stone masses with the same major facets, '
        'clefts, rounded weathered corners, resting angle and original warm tan/golden-ochre/orange-brown color relationships. '
        'Use broad quiet stone faces, a few fine natural cracks and smooth continuous outlines. The source '
        'pixels must not become individual pebbles, stones, square facets or a rough granular crust.')
    request = ('Use case: precise-object-edit. Asset type: newly authored production high-resolution RA2 NEWURBAN '
        'environment sprites. Image 1 provides ONLY the untouched low-resolution geometry and actual source '
        'palette. One column, two completely separate rows, top then bottom: '
        + ', '.join(r['identity'] for r in subjects) + '. ' + material + ' Preserve the exact native isometric '
        'camera, silhouette proportions, low height profile, defining structure, broad source colors and '
        'upper-left lighting. The coarse source pixels are low-resolution artifacts, not physical surface '
        'details. Create genuinely new continuous HD structure, smooth straight or curved edges and clean '
        'material surfaces. No pixel art, mosaic, dense gravel, high-contrast grain, speckle, tiny stippled '
        'highlights, sharpening, blur or interpolation as new detail. No new ground patch, grass, snow, water '
        'surface, external cast shadow, scenery, extra objects, text, labels, frames or checkerboard. Keep each '
        'complete subject centered in its own row with generous transparent margins and at least 160 clear '
        'pixels between subjects; do not touch or overlap. Truly transparent background. Target 1920 by 1920 '
        'with independent detail for complete 2X and 4X exports.')
    jobs.append(dict(id=name, members=[r['member'] for r in subjects], originalReference=pin(file), request=request,
        destination=str(ROOT / (name + '-master-v1.png')), receiptFile=name + '-output-v1.json'))
write(ROOT / 'imagegen-jobs-v1.json', dict(status='PREPARED_TEN_NEW_CONTINUOUS_ROCK_AND_CRATE_SPRITES', jobs=jobs,
    visualPolicy='Do not carry low-resolution source grains, stair steps or square holes into new HD structure.'))
write(ROOT / 'source-preparation-v1.json', dict(status='SOURCE_PINNED_TEN_COMPLETE_ROCK_AND_CRATE_FAMILIES',
    acceptedPrior=pin(PRIOR / 'user-acceptance-20261020.json'), priorHandoff=pin(PRIOR / 'resource-handoff-v1.json'),
    source=pin(ROOT / 'source.json'), records=records, originalFiles=list(originals.values()),
    completeFamilies=10, members=10, originalShadowSlots=10, newArtStudies=10,
    reuse='Prior donor audit shows no exact native SHA/palette match for these sources; retain accepted material style and rebuild only actual NewUrban variants.',
    native='NOT_RUN', visual='NOT_GENERATED', windows='NOT_RUN', m24Complete=False))
print(dict(families=10, members=10, jobs=len(jobs)))
