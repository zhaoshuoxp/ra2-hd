"""Export the explicitly authorized two-source HD repair without changing original geometry or archives."""
import copy
import hashlib
import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_registration import capacity, register
from showcase_contours import coverage

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def write(p, value):
    with p.open('x') as f:
        f.write(json.dumps(value, indent=2) + '\n')


root = Path('.artifacts/m2-4/urban-placeholder-hd-repair-v1')
job_file = root / 'imagegen-job-v1.json'
job = read(job_file)
authorization = read(root / 'user-authorization.json')
assert authorization['status'] == 'USER_AUTHORIZED_HD_ONLY_PLACEHOLDER_REMOVAL_AND_FACILITY_RECONSTRUCTION'
assert sha(root / 'user-authorization.json') == job['authorizationSha256']
master_file = Path(job['destination'])
receipt = read(root / 'imagegen-receipt-v1.json')
assert sha(master_file) == receipt['workspaceSha256'] == receipt['rawSha256']
assert sha(Path(receipt['rawFile'])) == receipt['rawSha256']
master = Image.open(master_file).convert('RGBA')
assert sha(Path(job['reference'])) == job['referenceSha256']
original_root = Path('.artifacts/m2-4/urban-civilians-native-batch49-v1')
native = root / 'prepared'
native.mkdir()
os.symlink((original_root / 'native').resolve(), native / 'native')
write(native / 'source.json', dict(schema='m2-2-prepared-native-source-v1', theater='URBAN',
    sources=[row['source'] for row in job['rows']], scope='Two exact original sources; only generated HD visual masks repair their authorized developer boards.'))
current = read(Path('desktop/environment-urban-hd-contract.json'))
contract = dict(schema=current['schema'], theater='URBAN', preparedSourceSha256=sha(native / 'source.json'),
    sources={}, families={}, identities={'ra2': {}, 'yr': {}}, aliases={})
revision = 'urban-facility-placeholder-repair-m2-4-v1'
pack_root = Path('.local/environment-packs') / revision
pack_root.mkdir()
pack = dict(schema='environment-shp-pack-v1', theater='URBAN', editions=['ra2', 'yr'], revision=revision, families={})
allocations = {'2': 0, '4': 0}
sampling = []
for row in job['rows']:
    source, name = row['source'], row['member']
    assert name in ['culit01e.shp', 'cupol01s.shp']
    expected = {'culit01e.shp': 'ea549cfdd90dcb1229834d212f601f806d7714dd4a4b36dbceb53143c422498f',
        'cupol01s.shp': 'd5ee977d983278df1cef4ffb05469606cc393f2b2ddc141994d64d4705eeb419'}
    assert source['sha256'] == expected[name] and sha(native / 'native' / source['nativeFile']) == source['sha256']
    frame = source['frames'][0]
    assert source['totalFrames'] == 2 and source['hasShadow'] and frame['slot'] == 0
    width, height = frame['size']
    indices_file = native / 'native' / frame['indexFile']
    assert sha(indices_file) == frame['indexSha256']
    indices = np.frombuffer(indices_file.read_bytes(), np.uint8).reshape(height, width)
    assert not np.any((indices >= 16) & (indices <= 31)) and not (indices == 12).any()
    bx0, by0, bx1, by1 = row['placeholderRect']
    assert set(np.unique(indices[by0:by1, bx0:bx1])) == set(row['sourceBoardIndices'])
    bounds = row['restoredBodyBounds']
    rect, rgb = register(master, dict(slotRect=row['slotRect']), job['boardSize'])
    density_capacity = capacity(rect, bounds)
    assert density_capacity >= 4
    x, y, w, h = rect
    raw_crop = master.crop((x, y, x + w, y + h))
    crop_alpha = np.asarray(raw_crop)[:, :, 3]
    # Native source masks still govern the visible pre-existing facility; only the board region is reopened.
    # Generated alpha reconstructs the concealed facility rather than procedural line drawing.
    clean_alpha = Image.fromarray(np.where(crop_alpha > 180, crop_alpha, 0).astype(np.uint8))
    descriptor = {k: copy.deepcopy(source[k]) for k in ['sha256', 'canvas', 'totalFrames', 'palette', 'hasShadow', 'remapable']}
    descriptor['bodyFrames'] = 1
    contract['sources'][name] = descriptor
    family = 'urban-' + row['identity'].lower()
    assert family not in current['families']
    basis = dict(theater='URBAN', members={name: descriptor}, identities=[row['identity']])
    family_hash = hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    contract['families'][family] = dict(members=[name], identities=[row['identity']], editions=['ra2', 'yr'],
        kinds=['building'], familyHash=family_hash)
    for edition in ['ra2', 'yr']:
        assert row['identity'] not in current['identities'][edition]
        contract['identities'][edition][row['identity']] = family
    declaration = dict(schema='user-authorized-source-pinned-placeholder-visual-repair-v1',
        sourceSha256=source['sha256'], nativeFrame=0, indexSha256=frame['indexSha256'],
        placeholderRect=row['placeholderRect'], sourceBoardIndices=row['sourceBoardIndices'], restoredBodyBounds=bounds,
        motherFile=str(master_file), motherSha256=sha(master_file), motherRect=rect, availableDensity=density_capacity,
        authorizationFile=str(root / 'user-authorization.json'), authorizationSha256=sha(root / 'user-authorization.json'),
        outsideRepairCoverage='Exact unchanged native structural subpixel coverage',
        insideRepairCoverage='Independent native-size sampling of generated clean-facility alpha, confined to restored facility bounds',
        shadows='Both original separate shadow dependencies remain unchanged', sourceFilesChanged=False,
        originalFallbackChanged=False, gameplayGeometryChanged=False)
    member_root = pack_root / 'members' / name.replace('.', '-')
    member_root.mkdir(parents=True)
    logical = dict(nativeFrame=0, trimOrigin=frame['origin'], trimSize=frame['size'],
        legacyRenderSize=[n + n % 2 for n in frame['size']], empty=False)
    metadata = dict(schemaVersion=2, packId='environment-' + name.replace('.', '-'), packRevision=revision,
        source=dict(member=name, sha256=source['sha256'], theater='URBAN', kind='resolved-shp-member'),
        logical=dict(canvas=source['canvas'], frames=[logical]),
        color=dict(representation='authored-sRGB-RGBA8-plus-RGBA8-data', authorizedVisualRepair=declaration), variants=[])
    left, top, right, bottom = bounds
    for density in [2, 4]:
        rw, rh = [n * density for n in logical['legacyRenderSize']]
        pixels = np.zeros((rh, rw, 4), np.uint8)
        # Both requested densities sample the full-resolution generated mother independently.
        material = np.array(Image.fromarray(rgb).resize(((right - left) * density, (bottom - top) * density), Image.Resampling.LANCZOS))
        pixels[top * density:bottom * density, left * density:right * density, :3] = material
        pixels[:height * density, :width * density, 3] = coverage(indices != 0, density)
        generated_alpha = np.array(clean_alpha.resize(((right - left) * density, (bottom - top) * density), Image.Resampling.LANCZOS))
        fresh = np.zeros((height * density, width * density), np.uint8)
        fresh[top * density:bottom * density, left * density:right * density] = generated_alpha
        pixels[by0 * density:by1 * density, bx0 * density:bx1 * density, 3] = fresh[
            by0 * density:by1 * density, bx0 * density:bx1 * density]
        pixels[:, :, :3][pixels[:, :, 3] == 0] = 0
        page_width, page_height = max(256, rw + 4), rh + 4
        base = np.zeros((page_height, page_width, 4), np.uint8)
        data = np.zeros_like(base)
        data[:, :, 3] = 255
        base[2:rh + 2, 2:rw + 2] = pixels
        target = member_root / str(density) / 'p0'
        target.mkdir(parents=True)
        page = dict(id='p0', size=[page_width, page_height])
        for role, image in [('base', base), ('data', data)]:
            file = target / (role + '.png')
            Image.fromarray(image).save(file)
            page.update({role: f'{density}-p0-{role}.png', role + 'Sha256': sha(file), role + 'Bytes': file.stat().st_size})
        metadata['variants'].append(dict(density=density, pages=[page], frames=[dict(nativeFrame=0, page='p0',
            sampleRect=[2, 2, rw, rh], contentRect=[2, 2, width * density, height * density])]))
        allocations[str(density)] += page_width * page_height * 8
    manifest_file = member_root / 'manifest.json'
    write(manifest_file, metadata)
    pack['families'][family] = dict(familyHash=family_hash,
        members=[dict(member=name, sha256=sha(manifest_file), path=str(manifest_file.relative_to(pack_root)))])
    sampling.append(dict(member=name, sourceRect=rect, restoredBodyBounds=bounds, availableDensity=density_capacity,
        rawMotherSha256=sha(master_file), placeholderRect=row['placeholderRect']))
write(pack_root / 'manifest.json', pack)
write(native / 'contract.json', contract)
write(root / 'export-v1.json', dict(status='UNSELECTED_SOURCE_PINNED_VISUAL_REPAIR_EXPORTED_INDEPENDENT_VERIFICATION_PENDING',
    revision=revision, pack=dict(schemaVersion=1, revision=revision, sha256=sha(pack_root / 'manifest.json')),
    families=2, members=2, sourceBodyFrames=2, densityFrames=4, decodedInputBytes=allocations,
    sampling=sampling, originalSourcesChanged=False, originalShadowsChanged=False,
    originalFallbackChanged=False, selectedResourcesChanged=False, windows='NOT_RUN', m24Complete=False))
print(json.dumps(dict(pack=revision, families=2, densityFrames=4, allocations=allocations, sampling=sampling)))
