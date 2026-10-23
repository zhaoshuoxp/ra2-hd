"""Independently verify the two exact source exceptions and reject any other alpha relaxation."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_contours import coverage

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('pack', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
root = Path('.artifacts/m2-4/urban-placeholder-hd-repair-v1')
prepared = root / 'prepared'
contract = read(prepared / 'contract.json')
sources = {s['member']: s for s in read(prepared / 'source.json')['sources']}
expected = {
    'culit01e.shp': dict(sha256='ea549cfdd90dcb1229834d212f601f806d7714dd4a4b36dbceb53143c422498f',
        rectangle=[0, 3, 46, 16], indices=[126, 239], retainedBounds=[15, 0, 25, 34], restoredBounds=[15, 0, 25, 34]),
    'cupol01s.shp': dict(sha256='d5ee977d983278df1cef4ffb05469606cc393f2b2ddc141994d64d4705eeb419',
        rectangle=[0, 40, 60, 60], indices=[79, 239], retainedBounds=[19, 0, 41, 40], restoredBounds=[19, 0, 41, 60]),
}
pack = read(args.pack / 'manifest.json')
assert pack['schema'] == 'environment-shp-pack-v1' and pack['theater'] == 'URBAN'
assert set(pack['families']) == set(contract['families']) == {'urban-calit01e', 'urban-capol01s'}
checks, payloads, allocations = [], {}, {'2': 0, '4': 0}
for family, group in pack['families'].items():
    declared = contract['families'][family]
    assert group['familyHash'] == declared['familyHash']
    entry, = group['members']
    name = entry['member']
    spec, source = expected[name], sources[name]
    assert declared['members'] == [name] and set(declared['editions']) == {'ra2', 'yr'}
    metadata_file = args.pack / entry['path']
    assert metadata_file.resolve().is_relative_to(args.pack.resolve()) and sha(metadata_file) == entry['sha256']
    metadata = read(metadata_file)
    assert metadata['source'] == dict(member=name, sha256=spec['sha256'], theater='URBAN', kind='resolved-shp-member')
    assert source['sha256'] == spec['sha256'] == sha(prepared / 'native' / source['nativeFile'])
    assert metadata['logical']['canvas'] == source['canvas']
    frame = source['frames'][0]
    logical, = metadata['logical']['frames']
    assert logical == dict(nativeFrame=0, trimOrigin=frame['origin'], trimSize=frame['size'],
        legacyRenderSize=[v + v % 2 for v in frame['size']], empty=False)
    repair = metadata['color']['authorizedVisualRepair']
    assert repair['schema'] == 'user-authorized-source-pinned-placeholder-visual-repair-v1'
    assert repair['sourceSha256'] == spec['sha256'] and repair['nativeFrame'] == 0
    assert repair['placeholderRect'] == spec['rectangle'] and repair['restoredBodyBounds'] == spec['restoredBounds']
    assert repair['sourceBoardIndices'] == spec['indices'] and repair['indexSha256'] == frame['indexSha256']
    assert sha(Path(repair['authorizationFile'])) == repair['authorizationSha256']
    assert read(Path(repair['authorizationFile']))['status'] == 'USER_AUTHORIZED_HD_ONLY_PLACEHOLDER_REMOVAL_AND_FACILITY_RECONSTRUCTION'
    assert sha(Path(repair['motherFile'])) == repair['motherSha256']
    assert repair['availableDensity'] >= 4 and not any(repair[k] for k in
        ['sourceFilesChanged', 'originalFallbackChanged', 'gameplayGeometryChanged'])
    assert sha(prepared / 'native' / frame['indexFile']) == frame['indexSha256']
    width, height = frame['size']
    indices = np.frombuffer((prepared / 'native' / frame['indexFile']).read_bytes(), np.uint8).reshape(height, width)
    bx0, by0, bx1, by1 = spec['rectangle']
    assert set(np.unique(indices[by0:by1, bx0:bx1])) == set(spec['indices'])
    visible = indices != 0
    visible[by0:by1, bx0:bx1] = False
    assert list(Image.fromarray(visible.astype(np.uint8)).getbbox()) == spec['retainedBounds']
    shadow = source['frames'][1]
    for f in source['frames']:
        assert sha(prepared / 'native' / f['indexFile']) == f['indexSha256']
        assert sha(prepared / 'native' / f['file']) == f['rgbaSha256']
    assert source['hasShadow'] and source['totalFrames'] == 2
    assert [v['density'] for v in metadata['variants']] == [2, 4]
    for variant in metadata['variants']:
        density = variant['density']
        page, = variant['pages']
        rendered, = variant['frames']
        assert rendered['nativeFrame'] == 0 and rendered['page'] == page['id']
        rw, rh = [n * density for n in logical['legacyRenderSize']]
        assert rendered['sampleRect'] == [2, 2, rw, rh]
        assert rendered['contentRect'] == [2, 2, width * density, height * density]
        layers = {}
        for role in ['base', 'data']:
            file = metadata_file.parent / str(density) / page['id'] / (role + '.png')
            assert sha(file) == page[role + 'Sha256'] and file.stat().st_size == page[role + 'Bytes']
            image = Image.open(file)
            assert image.mode == 'RGBA' and list(image.size) == page['size']
            layers[role] = np.array(image)
            payloads[str(file.relative_to(args.pack))] = sha(file)
        base, data = layers['base'], layers['data']
        assert (data[:, :, :3] == 0).all() and (data[:, :, 3] == 255).all()
        alpha = base[2:2 + height * density, 2:2 + width * density, 3]
        original = coverage(indices != 0, density)
        region = np.zeros(alpha.shape, bool)
        region[by0 * density:by1 * density, bx0 * density:bx1 * density] = True
        assert np.array_equal(alpha[~region], original[~region]), 'Original visible facility alpha changed outside the authorized board rectangle'
        left, top, right, bottom = spec['restoredBounds']
        allowed = np.zeros(alpha.shape, bool)
        allowed[top * density:bottom * density, left * density:right * density] = True
        assert not alpha[region & ~allowed].any(), 'Former placeholder board pixels reappeared outside the restored facility'
        repaired = alpha[by0 * density:by1 * density, bx0 * density:bx1 * density]
        fraction = float((repaired > 100).mean())
        assert 0 < fraction < .2, 'A broad sign-shaped surface remains instead of a slender reconstructed facility'
        assert (repaired > 100).any(axis=1).all(), 'A reconstructed shaft row is missing'
        labels, count = ndimage.label(alpha > 100, np.ones((3, 3)))
        areas = np.bincount(labels.ravel())
        areas[0] = 0
        assert areas.max() / (alpha > 100).sum() >= .8, 'Repaired top and shaft are disconnected'
        assert (base[:, :, :3][base[:, :, 3] == 0] == 0).all()
        outside = base[:, :, 3].copy()
        outside[2:2 + rh, 2:2 + rw] = 0
        assert not outside.any()
        checks.append(dict(family=family, member=name, sourceSha256=spec['sha256'], density=density,
            repairedBoardActiveFraction=fraction, connectedMainFraction=float(areas.max() / (alpha > 100).sum()),
            nativeAlphaOutsideRepairUnchanged=True, originalShadowIndexSha256=shadow['indexSha256'],
            originalShadowRgbaSha256=shadow['rgbaSha256']))
        allocations[str(density)] += page['size'][0] * page['size'][1] * 8
    payloads[str(metadata_file.relative_to(args.pack))] = sha(metadata_file)
assert len(checks) == 4 and len(payloads) == 10
report = dict(status='PASS_TWO_EXACT_USER_AUTHORIZED_FACILITY_REPAIRS', pack=str(args.pack),
    packSha256=sha(args.pack / 'manifest.json'), cases=checks, payloadHashes=payloads, families=2,
    densityFrames=4, decodedInputBytes=allocations, originalSourcesChanged=False, originalShadowsChanged=False,
    originalFallbackChanged=False, runtime='NOT_RUN', visual='PENDING_GROUPED_REVIEW', windows='NOT_RUN', m24Complete=False)
with args.output.open('x') as f:
    f.write(json.dumps(report, indent=2) + '\n')
print(json.dumps(dict(status=report['status'], densityFrames=4, allocations=allocations)))
