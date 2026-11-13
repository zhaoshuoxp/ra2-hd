"""Independently check exported animation pages, native geometry and source/shadow closure."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('stage', type=Path)
args = parser.parse_args()
stage = args.stage.resolve()
read = lambda file: json.loads(file.read_text())
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
source, = read(stage / 'prepared/source.json')['sources']
prepared = read(stage / 'preparation.json')
assert sha(Path(prepared['recipe'])) == prepared['recipeSha256']
recipe = read(Path(prepared['recipe']))
source_file = Path(recipe['source'])
assert sha(source_file) == recipe['sourceJsonSha256']
assert sha(source_file.parent / 'native' / source['member']) == source['sha256']
assert source['bindingRole'] == 'DESTROY_ANIMATION' and source['parentRules']['DestroyAnim'] == source['identity']
assert len(source['frames']) == source['totalFrames'] == 174 and source['bodyFrames'] == 87
for frame in source['frames']:
    assert sha(stage / 'prepared/native' / frame['indexFile']) == frame['indexSha256']
    assert sha(stage / 'prepared/native' / frame['file']) == frame['rgbaSha256']
    native_index = source_file.parent / 'native' / (source['member'] + '-' + str(frame['slot']) + '.index')
    assert sha(native_index) == frame['indexSha256']
pack = read(stage / 'pack/manifest.json')
family, = pack['families'].values()
member, = family['members']
metadata_file = stage / 'pack' / member['path']
assert sha(metadata_file) == member['sha256']
manifest = read(metadata_file)
assert manifest['source']['sha256'] == source['sha256'] and manifest['source']['member'] == source['member']
assert manifest['logical']['canvas'] == source['canvas'] == [260, 238]
assert len(manifest['logical']['frames']) == 87
assert sorted(variant['density'] for variant in manifest['variants']) == [2, 4]
counts = dict(families=1, members=1, densityFrames=0, pages=0, nativeShadowFrames=87, nativeBodyShadePixels=0)
for frame, logical in zip(source['frames'][:87], manifest['logical']['frames'], strict=True):
    assert logical == dict(nativeFrame=frame['slot'], trimOrigin=frame['origin'], trimSize=frame['size'],
        legacyRenderSize=[value + value % 2 for value in frame['size']], empty=frame['empty'])
    indices = (stage / 'prepared/native' / frame['indexFile']).read_bytes()
    assert not any(16 <= value <= 31 for value in indices)
    counts['nativeBodyShadePixels'] += indices.count(12)
allocations = {}
for variant in manifest['variants']:
    density = variant['density']
    assert [row['nativeFrame'] for row in variant['frames']] == list(range(87))
    assert len(variant['pages']) <= (8 if density == 2 else 17)
    allocations[str(density)] = 0
    for page in variant['pages']:
        images = {}
        for role in ['base', 'data']:
            file = metadata_file.parent / str(density) / page['id'] / (role + '.png')
            assert sha(file) == page[role + 'Sha256'] and file.stat().st_size == page[role + 'Bytes']
            images[role] = Image.open(file).convert('RGBA')
            assert list(images[role].size) == page['size'] and max(page['size']) <= 2048
        data = np.array(images['data'])
        assert not data[..., :3].any() and np.all(data[..., 3] == 255)
        rectangles = []
        for frame in [row for row in variant['frames'] if row['page'] == page['id']]:
            slot = frame['nativeFrame']
            logical = manifest['logical']['frames'][slot]
            x, y, width, height = frame['sampleRect']
            assert [width, height] == [value * density for value in logical['legacyRenderSize']]
            assert frame['contentRect'] == [x, y, *[value * density for value in logical['trimSize']]]
            assert min(x, y) >= 2 and x + width + 2 <= page['size'][0] and y + height + 2 <= page['size'][1]
            assert all(x + width <= a or a + w <= x or y + height <= b or b + h <= y for a, b, w, h in rectangles)
            rectangles.append((x, y, width, height))
            crop = images['base'].crop((x, y, x + width, y + height))
            full = Image.open(stage / f'frames-{density}x/{slot:03d}.png').convert('RGBA')
            assert list(full.size) == [value * density for value in source['canvas']]
            left, top = [value * density for value in logical['trimOrigin']]
            assert full.crop((left, top, left + width, top + height)).tobytes() == crop.tobytes()
            alpha = np.array(crop.getchannel('A'))
            assert alpha.any() and ((alpha > 0) & (alpha < 255)).any()
            counts['densityFrames'] += 1
        allocations[str(density)] += page['size'][0] * page['size'][1] * 8
        counts['pages'] += 1
assert counts['densityFrames'] == 174
audit = read(stage / 'sampling-audit.json')
assert audit['unpooledRgbaBytes'] == allocations
assert len(audit['frames']) == 87 and min(row['independentDensityCapacity'] for row in audit['frames']) >= 4
report = dict(status='PASS', sha256=sha(stage / 'pack/manifest.json'), counts=counts,
    independentDensities=[2, 4], unpooledRgbaBytes=allocations,
    nativeGeometryAndStateTimingUnchanged=True, nativeSeparateShadowsUnchanged=True,
    userVisualAcceptance='PENDING', nativeRuntime='PENDING')
(stage / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
