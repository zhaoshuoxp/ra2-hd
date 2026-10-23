"""Independently check every original SSRV tiny effect against accepted density pixels."""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
root = Path('.artifacts/m2-4/urban-actors-authoring-batch62-v1')
native = Path('.artifacts/m2-4/urban-actors-native-batch62-v1')
source = next(s for s in read(native / 'source.json')['sources'] if s['member'] == 'ssrv.shp')
pack_root = Path('.local/environment-packs/urban-environment-m2-4-actors-batch62-v1')
pack = read(pack_root / 'manifest.json')
entry, = pack['families']['urban-ssrv']['members']
assert sha(pack_root / entry['path']) == entry['sha256']
metadata = read(pack_root / entry['path'])
decl = metadata['color']['nativeAcceptedSubpixelMaterials']
assert decl['sourceSha256'] == source['sha256']
proof = read(Path(decl['paletteProof']))
assert sha(Path(decl['paletteProof'])) == decl['paletteProofSha256']
assert all(row['sha256'] == source['palette']['sha256'] for row in proof['rows'])
materials = {}
for role, donor in decl['materials'].items():
    assert sha(Path(donor['acceptedMemberManifest'])) == donor['acceptedMemberManifestSha256']
    for density in [2, 4]:
        part = donor['variants'][str(density)]
        assert sha(Path(part['file'])) == part['sha256']
        x, y, w, h = part['rect']
        assert w == h == density
        materials[role, density] = np.asarray(Image.open(part['file']).convert('RGBA'))[y:y+h, x:x+w]
expected, count = {}, 0
for frame in source['frames'][:230]:
    number = frame['slot']
    if not (86 <= number < 134 or 182 <= number < 230):
        continue
    file = native / 'native' / frame['indexFile']
    assert sha(file) == frame['indexSha256']
    indices = np.frombuffer(file.read_bytes(), np.uint8).reshape(frame['size'][::-1])
    labels, n = ndimage.label((indices != 0) & (indices != 12), np.ones((3, 3)))
    brass = []
    for label in range(1, n+1):
        ys, xs = np.where(labels == label)
        if len(xs) == 1 and indices[ys[0], xs[0]] in (179, 180):
            brass.append([int(xs[0]), int(ys[0]), int(indices[ys[0], xs[0]])])
    ys, xs = np.where(indices == 240)
    white = [[int(x), int(y), 240] for x, y in zip(xs, ys)]
    points = {role: values for role, values in [('brass', brass), ('white', white)] if values}
    if points:
        expected[str(number)] = dict(indexSha256=frame['indexSha256'], points=points)
        count += sum(len(values) for values in points.values())
assert decl['frames'] == expected
verified = 0
for variant in metadata['variants']:
    density = variant['density']
    pages = {}
    for page in variant['pages']:
        file = pack_root / Path(entry['path']).parent / str(density) / page['id'] / 'base.png'
        assert sha(file) == page['baseSha256']
        pages[page['id']] = np.asarray(Image.open(file).convert('RGBA'))
    for frame in variant['frames']:
        points = expected.get(str(frame['nativeFrame']), {}).get('points', {})
        x, y, _, _ = frame['contentRect']
        page = pages[frame['page']]
        for role, pixels in points.items():
            for px, py, _ in pixels:
                actual = page[y+py*density:y+(py+1)*density, x+px*density:x+(px+1)*density]
                assert np.array_equal(actual, materials[role, density])
                verified += density*density
result = dict(status='PASS_ALL_NATIVE_TINY_EFFECTS_EXACT_ACCEPTED_DENSITY_PIXELS', frames=len(expected),
    nativePixels=count, verifiedDensityPixels=verified, packSha256=sha(pack_root / 'manifest.json'),
    policy='All original brass and white effect source positions, source hashes and fixed palette entries retained; no new particles or sequence changes.')
with (root / 'subpixel-verification-v1.json').open('x') as stream:
    stream.write(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
