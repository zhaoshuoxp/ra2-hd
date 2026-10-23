"""Prepare source-identical accepted bodies and four new complete national-flag cycles."""
import copy
import hashlib
import json
import os
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p))


def write(path, value):
    with path.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


base = Path('.artifacts/m2-4')
root = base / 'urban-city-flags-native-batch57-v1'
art = base / 'urban-city-flags-authoring-batch57-v1'
library = base / 'urban-library-city-native-batch57-v1'
inventory_file = base / 'inventory-urban-side-roads-v1/inventory.json'
inventory = read(inventory_file)
city = [f'cucity{i:02d}.shp' for i in range(1, 5)]
flags = ['cufrfgl', 'cuukfgl', 'cuskfgl', 'culbfgl']
map_sha = 'c3f4f1c670fe69ba74e35aeee38a30f5d4d04a50dd4a15ddbbb7c443d029056a'
palette_sha = '79e668c9bd08bc5eed811df19de2af418cf8b434b97abf1fe2d65809321507e0'
palette = dict(member='liburb.pal', archive='ra2.mix/cache.mix', sha256=palette_sha, bytes=768)
rows = [copy.deepcopy(r) for r in inventory['rows'] if r.get('theater') == 'URBAN'
        and r.get('source', {}).get('member') in city]
assert len(rows) == 8
for row in rows:
    assert all(map_id.endswith('mp29u4.map@c3f4f1c670fe') for map_id in row['usage'])
    row['palette'] = copy.deepcopy(palette)
root.mkdir(exist_ok=False)
art.mkdir(exist_ok=False)
derived = root / 'library-native-input.json'
write(derived, dict(schema='m2-4-derived-library-color-source-input-v1', baseline=pin(inventory_file),
    originalMapSha256=map_sha, originalMapsModified=False,
    policy='Fresh decode in the byte-identical approved original library palette; no old Unit RGBA relabeling', rows=rows))
subprocess.run(['bun', 'scripts/m2/official-maps/prepare.ts', str(derived), str(library), 'URBAN'], check=True)
raw_root = base / 'urban-native-v2'
raw = read(raw_root / 'source.json')
selected = [(library, s) for s in read(library / 'source.json')['sources']]
for stem in flags:
    for name in [stem + '.shp', stem + '_a.shp']:
        source, = [s for s in raw['sources'] if s['member'] == name]
        selected.append((raw_root, source))
assert len(selected) == 12
(root / 'native').mkdir()
linked = {}
for source_root, source in selected:
    folder = Path(source['nativeFile']).parts[0]
    linked[folder] = source_root / 'native' / folder
    linked[source['palette']['sha256'] + '.pal'] = source_root / 'native' / (source['palette']['sha256'] + '.pal')
for name, source in linked.items():
    os.symlink(source.resolve(), root / 'native' / name)
write(root / 'source.json', dict(schema=raw['schema'], theater='URBAN', inventoryFile=str(derived),
    inventorySha256=sha(derived), sources=[s for _, s in selected], status='SOURCE_BOUND_LIBRARY_CITIES_AND_COMPLETE_FLAGS'))
sources = {s['member']: s for _, s in selected}
current = read(Path('desktop/environment-urban-hd-contract.json'))
contract = dict(schema=current['schema'], theater='URBAN', preparedSourceSha256=sha(root / 'source.json'),
    sources={}, families={}, identities={'ra2': {}, 'yr': {}}, aliases={})
for name, source in sources.items():
    assert sha(root / 'native' / source['nativeFile']) == source['sha256']
    descriptor = {key: copy.deepcopy(source[key]) for key in
        ['sha256', 'canvas', 'totalFrames', 'palette', 'hasShadow', 'remapable']}
    descriptor['bodyFrames'] = source['totalFrames'] // (2 if source['hasShadow'] else 1)
    contract['sources'][name] = descriptor
for name in city + [stem + '.shp' for stem in flags]:
    source = sources[name]
    identity, = {b['id'] for b in source['bindings'] if b['role'] == 'body'}
    family = 'urban-' + identity.lower()
    members = sorted([name] if name in city else [name, name.replace('.shp', '_a.shp')])
    editions = sorted({b['edition'] for b in source['bindings']})
    scope = dict(officialMapSha256s=[map_sha], visualAdaptationStatus='APPLIED_SOURCE_PINNED_ORIGINAL_LIBRARY_PALETTE') if name in city else None
    basis = dict(theater='URBAN', members={n: contract['sources'][n] for n in members}, identities=[identity])
    if scope:
        basis['sourceScope'] = scope
    declaration = dict(members=members, identities=[identity], editions=editions, kinds=['building'],
        familyHash=hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest())
    if scope:
        declaration['sourceScope'] = scope
    contract['families'][family] = declaration
    for edition in editions:
        assert identity not in current['identities'][edition]
        contract['identities'][edition][identity] = family
write(root / 'contract.json', contract)
donors = {}
for theater, filename in [('SNOW', 'desktop/environment-snow-hd-contract.json'), ('TEMPERATE', 'desktop/environment-hd-contract.json')]:
    source_contract = read(Path(filename))
    pack_root = Path('.local/environment-packs') / source_contract['selectedPack']['revision']
    assert sha(pack_root / 'manifest.json') == source_contract['selectedPack']['sha256']
    donors[theater] = source_contract, pack_root, read(pack_root / 'manifest.json')
proof = dict(status='PASS_READ_ONLY_RENDERED_BODY_COMPARISON_NOT_FAMILY_COVERAGE', rows=[],
    equalityBasis='Whole original SHP SHA-256, complete palette SHA-256 and exact native logical metadata; independently decoded current indices/RGBA verified.',
    originalMapsChanged=False, newArtStates=64, acceptedSourceStatesReused=24)
reuse = {}
coverage = None
for name in city + [stem + '.shp' for stem in flags]:
    source = sources[name]
    old_contract, pack_root, pack = donors['SNOW' if name in city else 'TEMPERATE']
    old_name = name[0] + 'a' + name[2:] if name in city else 'ctusfgl.shp'
    old_descriptor = old_contract['sources'][old_name]
    assert source['sha256'] == old_descriptor['sha256']
    assert source['palette']['sha256'] == old_descriptor['palette']['sha256']
    family, = [f for f, d in old_contract['families'].items() if old_name in d['members']]
    entry, = [m for m in pack['families'][family]['members'] if m['member'] == old_name]
    manifest_file = pack_root / entry['path']
    assert sha(manifest_file) == entry['sha256']
    manifest = read(manifest_file)
    assert manifest['source']['sha256'] == source['sha256'] and manifest['logical']['canvas'] == source['canvas']
    if coverage is None:
        coverage = manifest['color']['structuralCoverage']
    assert manifest['color']['structuralCoverage'] == coverage
    slots = []
    for number in range(3):
        frame = source['frames'][number]
        logical = dict(nativeFrame=number, trimOrigin=frame['origin'], trimSize=frame['size'],
            legacyRenderSize=[v + v % 2 for v in frame['size']], empty=frame['empty'])
        assert manifest['logical']['frames'][number] == logical
        assert sha(root / 'native' / frame['indexFile']) == frame['indexSha256']
        assert sha(root / 'native' / frame['file']) == frame['rgbaSha256']
        slots.append(dict(slot=number, status='ELIGIBLE_EXACT_RENDERED_BODY_DONOR', sameGeometry=True,
            differingNativeIndices=0, paletteSha256=source['palette']['sha256'], nativeIndexSha256=frame['indexSha256']))
    proof['rows'].append(dict(member=name, sourceSha256=source['sha256'], donorMember=old_name,
        donorSourceSha256=old_descriptor['sha256'], slots=slots, donorContract=old_contract['selectedPack']))
    reuse[name] = dict(sourceSha256=source['sha256'], donorMember=old_name,
        manifestFile=str(manifest_file), manifestSha256=sha(manifest_file), slots=[0, 1, 2])
proof_file = art / 'accepted-body-proof-v1.json'
write(proof_file, proof)
for declaration in reuse.values():
    declaration.update(proofFile=str(proof_file), proofSha256=sha(proof_file))
write(art / 'material-profile-v1.json', dict(nativeStructuralCoverage=coverage, acceptedNativeBodyFrames=reuse))
work = dict(schema='m2-2-shp-native-slot-worklist-v1', preparedSourceSha256=sha(root / 'source.json'),
    members=[], slots={}, batches=[], runtimeAcceptance='UNSELECTED_COMPLETE_FAMILY_PRODUCTION_PENDING')
jobs = []
for name, source in sources.items():
    count = contract['sources'][name]['bodyFrames']
    entries = []
    for frame in source['frames'][:count]:
        number = frame['slot']
        key = f'{name}-{number:03d}'
        indices = np.frombuffer((root / 'native' / frame['indexFile']).read_bytes(), np.uint8).reshape(frame['size'][::-1])
        mask = (indices != 0) & (indices != 12)
        bounds = Image.fromarray(mask.astype(np.uint8) * 255).getbbox()
        assert bounds
        work['slots'][key] = dict(member=name, nativeSlot=number, nativeBounds=list(bounds), kind='building',
            group='urban-city-flags', nativeMetadata=frame, sourceSha256=source['sha256'])
        entries.append(dict(slot=number, key=key, status='ACCEPTED_EXACT_BODY_REUSE' if name in reuse else 'AWAITING_AUTHORED_SLOT'))
    work['members'].append(dict(member=name, sourceSha256=source['sha256'], palette=source['palette'], bodyCount=count,
        totalNativeSlots=source['totalFrames'], slots=entries, shadowPolicy='Untouched original separate shadow slots'))
    if name in reuse:
        continue
    assert name.endswith('_a.shp') and count == 16
    board_name = name.replace('.', '-') + '-all-phases'
    board = Image.new('RGBA', (1254, 1254))
    cell = 313
    capacities = []
    for number, frame in enumerate(source['frames'][:count]):
        key = f'{name}-{number:03d}';info = work['slots'][key]
        indices = np.frombuffer((root / 'native' / frame['indexFile']).read_bytes(), np.uint8).reshape(frame['size'][::-1])
        rgba = np.frombuffer((root / 'native' / frame['file']).read_bytes(), np.uint8).reshape((*indices.shape, 4)).copy()
        rgba[..., 3] = ((indices != 0) & (indices != 12)).astype(np.uint8) * 255
        sprite = Image.fromarray(rgba).crop(info['nativeBounds'])
        scale = min((cell - 40) / sprite.width, (cell - 40) / sprite.height)
        assert scale * 1023 / 1254 >= 4.2
        capacities.append(scale)
        size = tuple(round(v * scale) for v in sprite.size)
        left, top = number % 4 * cell, number // 4 * cell
        x, y = left + (cell - size[0]) // 2, top + (cell - size[1]) // 2
        board.alpha_composite(sprite.resize(size, Image.Resampling.NEAREST), (x, y))
        info.update(board=board_name + '-master.png', slotRect=[left, top, cell, cell], referenceRect=[x, y, *size])
    reference = art / (board_name + '-reference.png');board.save(reference)
    nationality = {'cufrfgl_a.shp': 'French blue-white-red tricolor', 'cuukfgl_a.shp': 'British Union Jack',
        'cuskfgl_a.shp': 'South Korean Taegeukgi', 'culbfgl_a.shp': 'original solid green Libyan national flag'}[name]
    prompt = (f'Use case: precise-object-edit. Repaint this exact original Red Alert 2 {nationality} waving flag animation. '
        'A square 4 by 4 sheet contains all 16 original flutter phases, row-major. Preserve the exact original flag pattern, '
        'colors, silhouette, cloth folds, attachment point, lighting, apparent size and placement in EVERY corresponding cell. '
        'Add genuinely resolved fine woven cloth and clean printed national symbols suitable for independent 2X and 4X game sprites. '
        'Keep the original small isometric cloth planes and all phase-specific occlusion, with restrained material detail and '
        'smooth edges. Do not redesign the flags, change national patterns, add poles, grounds, shadows, extra subjects, '
        'text, checkerboards, grid lines or borders. No simple enlargement, sharpening, pixel blocks or interpolation as detail. '
        'Keep transparent gutters between all 16 cells and generous outer transparent margins. Preserve exactly 4 columns and '
        '4 rows; output one square transparent sprite sheet matching the reference positions.')
    if name == 'culbfgl_a.shp':
        prompt += (' Solid green cloth only: no emblem, crescent, star, text or stripes. '
            'Retain the exact dark green of the supplied original. Do not use the modern Libyan tricolor.')
    job = dict(id=board_name, reference=str(reference.resolve()), referenceSha256=sha(reference),
        destination=str((art / (board_name + '-master.png')).resolve()), slots=[e['key'] for e in entries],
        cellLayout=[4, 4], boardSize=[1254, 1254], minimumReferenceCapacity=min(capacities), prompt=prompt)
    jobs.append(job)
    work['batches'].append(dict(name=board_name, group='urban-city-flags', boardSize=[1254, 1254], columns=4, rows=4,
        slots=job['slots'], status='ORIGINAL_FLAG_GUIDES_ONLY'))
assert len(work['slots']) == 88 and len(jobs) == 4
write(art / 'worklist.json', work)
write(art / 'imagegen-jobs-v1.json', dict(schema='m2-4-complete-urban-flags-v1', jobs=jobs,
    acceptedBodySourceStatesReused=24, newlyAuthoredFlagSourceStates=64, totalDensityFrames=176))
write(root / 'production-preflight-v1.json', dict(status='UNSELECTED_EIGHT_COMPLETE_FAMILIES_PREPARED',
    acceptedBodies=pin(proof_file), source=pin(root / 'source.json'), contract=pin(root / 'contract.json'),
    cityAcceptance=pin(base / 'snow-batch24-user-acceptance-20261013-v1.json'),
    newMothersRequired=4, newFlagFrames=64, reusedBodyStates=24, sourceGroupsCoveredOnlyAfterNativeClosure=8,
    windows='NOT_RUN', m24Complete=False))
print(json.dumps(dict(families=8, members=12, sourceStates=88, reused=24, newFlagFrames=64, mothers=4, selected=False)))
