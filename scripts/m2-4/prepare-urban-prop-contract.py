"""Pin all remaining Urban terrain props as an unselected production-only contract."""
import hashlib
import json
from pathlib import Path

root = Path('.artifacts/m2-4/urban-props-native-batch47-v1')
authoring = Path('.artifacts/m2-4/urban-props-authoring-batch47-v1')
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
guide = read(root / 'source.json')
work = read(authoring / 'worklist.json')
current = read(Path('desktop/environment-urban-hd-contract.json'))
assert len(guide['sources']) == 25
contract = dict(schema=current['schema'], theater='URBAN', preparedSourceSha256=sha(root / 'source.json'),
    sources={}, families={}, identities={'ra2': {}, 'yr': {}}, aliases={})
profile = dict(schema='m2-4-urban-prop-material-profile-v1', nativeFrameTone={})
for source in guide['sources']:
    member = source['member']
    identity = member.split('.')[0].upper()
    assert member not in current['sources']
    assert source['totalFrames'] in (2, 22) and source['hasShadow'] and not source['remapable']
    body_count = source['totalFrames'] // 2
    assert sha(root / 'native' / source['nativeFile']) == source['sha256']
    assert sha(root / 'native' / (source['palette']['sha256'] + '.pal')) == source['palette']['sha256']
    for frame in source['frames']:
        assert sha(root / 'native' / frame['indexFile']) == frame['indexSha256']
        assert sha(root / 'native' / frame['file']) == frame['rgbaSha256']
    descriptor = dict(sha256=source['sha256'], canvas=source['canvas'], totalFrames=source['totalFrames'], bodyFrames=body_count,
        palette=source['palette'], hasShadow=True, remapable=False,
        framePalettes={str(i): dict(**source['palette'], role='body', runtimeUsed=True, remapable=False) for i in range(body_count)})
    contract['sources'][member] = descriptor
    family = 'urban-' + identity.lower()
    basis = dict(theater='URBAN', members={member: descriptor}, identities=[identity])
    editions = sorted({binding['edition'] for binding in source['bindings']})
    assert all(binding['id'] == identity and binding['kind'] == 'terrain' for binding in source['bindings'])
    contract['families'][family] = dict(members=[member], identities=[identity], kinds=['terrain'], editions=editions,
        familyHash=hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest())
    for edition in editions: contract['identities'][edition][identity] = family
    profile['nativeFrameTone'][member] = {str(i): dict(sourceSha256=source['sha256'],
        indexSha256=source['frames'][i]['indexSha256'], paletteSha256=source['palette']['sha256']) for i in range(body_count)}
jobs = []
for batch in work['batches']:
    reference = (authoring / (batch['name'] + '-reference.png')).resolve()
    prompt = (f'Use case: precise-object-edit. Asset type: reusable high-resolution Red Alert 2 URBAN terrain sprites. '
        f'Image 1 is the exact original geometry and color reference, {batch["columns"]} columns by {batch["rows"]} rows. '
        'Repaint genuine fine metal, stone, painted enamel and wood material detail while retaining every original silhouette, '
        'thin support, arm angle, branch opening, base position, isometric viewpoint and lighting. '
        'Occupied slots are left-to-right then top-to-bottom: ' + ', '.join(batch['slots']) + '. '
        'Keep each object in its own cell, centered with transparent margins and gutters; unused cells remain completely empty. '
        'Mineral-spawner machines are the same bronze and pinkish copper apparatus repeated through its native 11-frame spark cycle. '
        'Their machinery must be identical in size, anatomy and surface shading across all phases; change only original small yellow '
        'spark positions near the base as shown. Preserve the original rounded caps, ring rims, slender center pipe and left housing. '
        'Street lamps and traffic fixtures keep exactly their original bends, arm directions, lamp and signal counts, lights, brackets '
        'and blue-gray or dark brown metal colors. Keep red/yellow/green traffic bulbs in the exact source locations. '
        'Road signs keep the native front or back view: worn red-brown fronts with faint original lettering, plain dark brown or olive '
        'backs with NO invented writing or symbols. Wooden poles retain crossbars, insulators and exact diagonal perspective. '
        'Gravestones retain their irregular group of four gray-beige slabs and no invented inscriptions. '
        'Use restrained continuously shaded detailed game-sprite materials matching the accepted Urban direction, smooth edges and '
        'fine bevels, subtle weathering only. The coarse pixels are geometry and hue guides, not surface detail. No pixel-art blocks, '
        'mosaic, sharpening or interpolated upscale as detail. Do not redesign objects or add snow, ground, grass, cast shadows, '
        'extra lamps, extra signs, borders, labels, checkerboard or background. Genuinely transparent background. '
        'Target 1920 by 1920 pixels, fill most of each cell without touching its boundary, sufficient genuine detail for 2X and 4X exports.')
    jobs.append(dict(id=batch['name'], reference=str(reference), referenceSha256=sha(reference),
        destination=str((authoring / (batch['name'] + '-master.png')).resolve()), members=batch['slots'],
        cellLayout=[batch['columns'],batch['rows']], boardSize=batch['boardSize'], prompt=prompt))
for file, value in [(root / 'contract.json', contract), (authoring / 'material-profile-v1.json', profile),
                    (authoring / 'imagegen-jobs-v1.json', dict(schema='m2-4-urban-prop-imagegen-jobs-v1',
                     worklistSha256=sha(authoring / 'worklist.json'), jobs=jobs))]:
    with file.open('x') as stream: stream.write(json.dumps(value, indent=2) + '\n')
print(json.dumps(dict(families=25, boards=len(jobs), selected=False)))
