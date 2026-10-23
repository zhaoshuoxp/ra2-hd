"""Pin all remaining Urban trees as an unselected production-only contract."""
import hashlib
import json
from pathlib import Path

root = Path('.artifacts/m2-4/urban-tree-native-batch46-v1')
authoring = Path('.artifacts/m2-4/urban-tree-authoring-batch46-v1')
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
guide = read(root / 'source.json')
work = read(authoring / 'worklist.json')
current = read(Path('desktop/environment-urban-hd-contract.json'))
assert len(guide['sources']) == 23
contract = dict(schema=current['schema'], theater='URBAN', preparedSourceSha256=sha(root / 'source.json'),
    sources={}, families={}, identities={'ra2': {}, 'yr': {}}, aliases={})
profile = dict(schema='m2-4-urban-tree-material-profile-v1', nativeFrameTone={})
for source in guide['sources']:
    member = source['member']
    identity = member.split('.')[0].upper()
    assert identity not in ['TREE01', 'TREE05', 'TREE11'] and member not in current['sources']
    assert source['totalFrames'] == 2 and source['hasShadow'] and not source['remapable']
    assert sha(root / 'native' / source['nativeFile']) == source['sha256']
    assert sha(root / 'native' / (source['palette']['sha256'] + '.pal')) == source['palette']['sha256']
    for frame in source['frames']:
        assert sha(root / 'native' / frame['indexFile']) == frame['indexSha256']
        assert sha(root / 'native' / frame['file']) == frame['rgbaSha256']
    descriptor = dict(sha256=source['sha256'], canvas=source['canvas'], totalFrames=2, bodyFrames=1,
        palette=source['palette'], hasShadow=True, remapable=False,
        framePalettes={'0': dict(**source['palette'], role='body', runtimeUsed=True, remapable=False)})
    contract['sources'][member] = descriptor
    family = 'urban-' + identity.lower()
    basis = dict(theater='URBAN', members={member: descriptor}, identities=[identity])
    editions = sorted({binding['edition'] for binding in source['bindings']})
    assert all(binding['id'] == identity and binding['kind'] == 'terrain' for binding in source['bindings'])
    contract['families'][family] = dict(members=[member], identities=[identity], kinds=['terrain'], editions=editions,
        familyHash=hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest())
    for edition in editions: contract['identities'][edition][identity] = family
    profile['nativeFrameTone'][member] = {'0': dict(sourceSha256=source['sha256'],
        indexSha256=source['frames'][0]['indexSha256'], paletteSha256=source['palette']['sha256'])}
jobs = []
for batch in work['batches']:
    reference = (authoring / (batch['name'] + '-reference.png')).resolve()
    prompt = (f'Use case: precise-object-edit. Asset type: reusable high-resolution Red Alert 2 URBAN tree sprites. '
        f'Image 1 is the exact original geometry and color reference, {batch["columns"]} columns by {batch["rows"]} rows. '
        f'Repaint fine authored bark, branch and leaf detail while retaining each original tree species, complete crown silhouette, '
        f'branch openings, trunk position, isometric viewpoint and lighting. Occupied slots are left-to-right then top-to-bottom: '
        + ', '.join(batch['slots']) + '. '
        'Keep each tree in its own cell, centered and isolated with wide transparent margins and gutters; unused cells remain empty. '
        'Preserve the original colors separately for every tree: exact warm ochre, brown, olive, yellow-green or dark green canopy '
        'regions as shown. Do not turn autumn or dry trees uniformly green, do not brighten saturated leaves, and do not add snow. '
        'Use the same restrained, continuously shaded detailed game-sprite material as the accepted Urban tree direction. '
        'Resolve individual fine leaves, needles, small branches and bark grooves without a repetitive texture pattern. '
        'The coarse original pixels are shape and hue guidance only; no pixel-art, square blocks, mosaic, blur, sharpened upscale '
        'or interpolation as detail. No ground plane, pot, new roots, stones, grass, cast shadow, extra trees, labels, borders, '
        'text, checkerboard or background. Genuinely transparent background. Target 1920 by 1920 pixels with genuine detail '
        'sufficient for separate 2X and 4X exports. Maintain the original sparse and dense foliage anatomy, never replace the species.')
    jobs.append(dict(id=batch['name'], reference=str(reference), referenceSha256=sha(reference),
        destination=str((authoring / (batch['name'] + '-master.png')).resolve()), members=batch['slots'],
        cellLayout=[batch['columns'],batch['rows']], boardSize=batch['boardSize'], prompt=prompt))
for file, value in [(root / 'contract.json', contract), (authoring / 'material-profile-v1.json', profile),
                    (authoring / 'imagegen-jobs-v1.json', dict(schema='m2-4-urban-tree-imagegen-jobs-v1',
                     worklistSha256=sha(authoring / 'worklist.json'), jobs=jobs))]:
    with file.open('x') as stream: stream.write(json.dumps(value, indent=2) + '\n')
print(json.dumps(dict(families=23, boards=len(jobs), selected=False)))
