"""Prepare complete native-pose infantry guides without selecting unfinished artwork."""
import copy
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
base = Path('.artifacts/m2-4')
native = base / 'urban-actors-native-batch62-v1'
root = base / 'urban-actors-authoring-batch62-v1'
root.mkdir()
source_file = native / 'source.json'
sources = [s for s in read(source_file)['sources'] if s['format'] == 'shp']
current = read(Path('desktop/environment-urban-hd-contract.json'))
contract = dict(schema=current['schema'], theater='URBAN', preparedSourceSha256=sha(source_file),
    sources={}, families={}, identities={'ra2': {}, 'yr': {}}, aliases={})
work = dict(schema='m2-2-shp-native-slot-worklist-v1', preparedSourceSha256=sha(source_file),
    members=[], slots={}, batches=[], runtimeAcceptance='UNSELECTED_COMPLETE_ACTOR_ART_PENDING')
jobs = []
descriptions = {'civbbp.shp': 'the original civilian baseball player, baseball cap and original uniform colors',
    'pres.shp': 'the original President civilian, original suit, shirt, tie, hair and shoes',
    'ssrv.shp': 'the original Secret Service agent, original suit, hair, sunglasses and small pistol where shown'}
for source in sources:
    name, count = source['member'], source['totalFrames'] // 2
    descriptor = {k: copy.deepcopy(source[k]) for k in ['sha256', 'canvas', 'totalFrames', 'palette', 'hasShadow', 'remapable']}
    descriptor['bodyFrames'] = count
    contract['sources'][name] = descriptor
    identity = source['bindings'][0]['id']
    family = 'urban-' + identity.lower()
    basis = dict(theater='URBAN', members={name: descriptor}, identities=[identity])
    editions = sorted({b['edition'] for b in source['bindings']})
    contract['families'][family] = dict(members=[name], identities=[identity], editions=editions, kinds=['infantry'],
        familyHash=hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest())
    for edition in editions:
        assert identity not in current['identities'][edition]
        contract['identities'][edition][identity] = family
    member = dict(member=name, sourceSha256=source['sha256'], palette=source['palette'], bodyCount=count,
        totalNativeSlots=source['totalFrames'], slots=[], shadowPolicy='Untouched original native shadow members and frame indices')
    keys = []
    for frame in source['frames'][:count]:
        number, size = frame['slot'], frame['size']
        key = f'{name}-{number:03d}'
        index_file, rgba_file = native / 'native' / frame['indexFile'], native / 'native' / frame['file']
        assert sha(index_file) == frame['indexSha256'] and sha(rgba_file) == frame['rgbaSha256']
        index = np.frombuffer(index_file.read_bytes(), np.uint8).reshape(size[::-1])
        mask = (index != 0) & (index != 12)
        bounds = Image.fromarray(mask.astype(np.uint8) * 255).getbbox()
        assert bounds
        image = Image.frombytes('RGBA', tuple(size), rgba_file.read_bytes())
        rgba = np.array(image)
        rgba[..., 3] = mask.astype(np.uint8) * 255
        Image.fromarray(rgba).crop(bounds).save(root / (key + '-native.png'))
        work['slots'][key] = dict(member=name, nativeSlot=number, nativeBounds=list(bounds), nativeMetadata=frame,
            sourceSha256=source['sha256'], kind='infantry', group='urban-actors')
        member['slots'].append(dict(slot=number, key=key, status='AWAITING_AUTHORED_SLOT'))
        keys.append(key)
    work['members'].append(member)
    for start in range(0, count, 25):
        selected = keys[start:start + 25]
        columns, rows, width, height = 5, 5, 1536, 1536
        cw, ch = width // columns, height // rows
        board = Image.new('RGBA', (width, height))
        stem = f'urban-actors-batch62-{len(jobs) + 1:02d}'
        for cell, key in enumerate(selected):
            image = Image.open(root / (key + '-native.png')).convert('RGBA')
            scale = min((cw - 36) / image.width, (ch - 36) / image.height)
            assert scale >= 4.5
            size = tuple(round(n * scale) for n in image.size)
            left, top = cell % columns * cw, cell // columns * ch
            x, y = left + (cw - size[0]) // 2, top + (ch - size[1]) // 2
            board.alpha_composite(image.resize(size, Image.Resampling.NEAREST), (x, y))
            work['slots'][key].update(board=stem + '-master.png', boardSize=[width, height],
                slotRect=[left, top, cw, ch], referenceRect=[x, y, *size], referenceCapacity=scale)
        reference = root / (stem + '-reference.png')
        board.save(reference)
        prompt = ('Use case: precise-object-edit. Asset type: original-pose-faithful Red Alert 2 civilian sprite atlas. '
            f'Edit target: the exact supplied 5-column by 5-row native guide, {len(selected)} occupied cells in row-major order; '
            'unoccupied cells stay transparent. Primary request: repaint each source pose with genuinely resolved high-definition '
            f'fabric, hands, face, hair, footwear and small equipment detail for {descriptions[name]}. '
            'Every figure keeps its own exact original pose, facing, body proportions, limb positions, visible equipment, damage/death state '
            'and cell center. Use consistent anatomy and costume across all cells. Resolve smooth edges and clear material detail, '
            'not enlarged pixel blocks, interpolation or sharpening. Match the original fixed colors and upper-left light exactly; '
            'do not recolor clothes, invent weapons, add accessories or change identity. Maintain each guide figure scale; do not shrink '
            'or enlarge any pose. No extra figures, duplicate poses, missing limbs, ground, cast shadows, labels, text, outlines or halos. '
            'Keep every cell independent with empty transparent gutters, no strokes crossing cell boundaries. '
            'Use a genuinely transparent background and a square 1536 by 1536 composition. The game will retain source shadows separately.')
        prompt_file = root / (stem + '-prompt.txt')
        prompt_file.write_text(prompt + '\n')
        jobs.append(dict(id=stem, identity=identity, member=name, reference=str(reference.resolve()),
            referenceSha256=sha(reference), destination=str((root / (stem + '-master.png')).resolve()),
            boardSize=[width, height], columns=columns, rows=rows, occupied=len(selected), members=selected,
            prompt=prompt, promptFile=str(prompt_file)))
        work['batches'].append(dict(name=stem, boardSize=[width, height], slots=selected, columns=columns, rows=rows))
assert len(work['slots']) == 602 and len(jobs) == 26
for file, value in [(root / 'worklist.json', work), (root / 'imagegen-jobs-v1.json', jobs),
        (native / 'infantry-contract.json', contract),
        (root / 'material-profile-v1.json', dict(nativeOwnerMaterialRegistration=True))]:
    with file.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')
print(json.dumps(dict(status='COMPLETE_NATIVE_POSE_GUIDES_READY_NOT_HD_COVERAGE', families=3, poses=602,
    mothers=len(jobs), selectedResourcesChanged=False)))
