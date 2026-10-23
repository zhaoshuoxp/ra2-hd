"""Reuse accepted tiny brass/white materials at exact native SSRV source pixels."""
import copy
import hashlib
import json
from pathlib import Path

import numpy as np
from scipy import ndimage

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
root = Path('.artifacts/m2-4/urban-actors-authoring-batch62-v1')
native = Path('.artifacts/m2-4/urban-actors-native-batch62-v1')
source = next(s for s in read(native / 'source.json')['sources'] if s['member'] == 'ssrv.shp')
contract = read(Path('desktop/environment-hd-contract.json'))
pack_file = Path('.local/environment-packs') / contract['selectedPack']['revision'] / 'manifest.json'
assert sha(pack_file) == contract['selectedPack']['sha256']
entry = next(e for f in read(pack_file)['families'].values() for e in f['members'] if e['member'] == 'civ2.shp')
donor_file = pack_file.parent / entry['path']
assert sha(donor_file) == entry['sha256']
donor = read(donor_file)
proof = root / 'native-color-proof-v1.json'
colors = read(proof)
assert colors['status'] == 'PASS_NATIVE_ACTOR_PALETTE_AND_ALL_32_VPL_ROWS'
assert all(row['sha256'] == source['palette']['sha256'] for row in colors['rows'])
declaration = dict(sourceSha256=source['sha256'], paletteSha256=source['palette']['sha256'],
    acceptedPackManifest=str(pack_file), acceptedPackManifestSha256=sha(pack_file),
    paletteProof=str(proof), paletteProofSha256=sha(proof), materials={}, frames={})
for role, field, frame_number, pixel in [('brass', 'nativeDetachedParticleRegistration', 86, [17, 9]),
                                       ('white', 'nativeMuzzleRegistration', 88, [6, 0])]:
    material = donor['color'][field]
    assert pixel in [p[:2] for p in material['frames'][str(frame_number)]['pixels']]
    variants = {}
    for variant in donor['variants']:
        density = variant['density']
        frame = next(f for f in variant['frames'] if f['nativeFrame'] == frame_number)
        page = next(p for p in variant['pages'] if p['id'] == frame['page'])
        file = donor_file.parent / str(density) / page['id'] / 'base.png'
        assert sha(file) == page['baseSha256']
        x, y, _, _ = frame['contentRect']
        variants[str(density)] = dict(file=str(file), sha256=sha(file),
            rect=[x + pixel[0] * density, y + pixel[1] * density, density, density])
    declaration['materials'][role] = dict(acceptedMemberManifest=str(donor_file),
        acceptedMemberManifestSha256=sha(donor_file), role=material['classification'],
        sourceFrame=frame_number, nativePixel=pixel, variants=variants)
for frame in source['frames'][:230]:
    n = frame['slot']
    if not (86 <= n < 134 or 182 <= n < 230):
        continue
    file = native / 'native' / frame['indexFile']
    assert sha(file) == frame['indexSha256']
    index = np.frombuffer(file.read_bytes(), np.uint8).reshape(frame['size'][::-1])
    labels, count = ndimage.label((index != 0) & (index != 12), np.ones((3, 3)))
    brass = []
    for label in range(1, count + 1):
        ys, xs = np.where(labels == label)
        if len(xs) == 1 and index[ys[0], xs[0]] in (179, 180):
            brass.append([int(xs[0]), int(ys[0]), int(index[ys[0], xs[0]])])
    ys, xs = np.where(index == 240)
    white = [[int(x), int(y), 240] for x, y in zip(xs, ys)]
    if brass or white:
        declaration['frames'][str(n)] = dict(indexSha256=frame['indexSha256'],
            points={role: points for role, points in [('brass', brass), ('white', white)] if points})
profile = copy.deepcopy(read(root / 'material-profile-v1.json'))
profile['nativeAcceptedSubpixelMaterials'] = {'ssrv.shp': declaration}
with (root / 'material-profile-v2.json').open('x') as stream:
    stream.write(json.dumps(profile, indent=2) + '\n')
print(json.dumps(dict(status='PINNED_ACCEPTED_MATERIALS_FOR_NATIVE_SSRV_PARTICLES',
    frames=len(declaration['frames']), pixels=sum(len(p) for f in declaration['frames'].values() for p in f['points'].values()),
    donorPackSha256=sha(pack_file), selectedResourcesChanged=False)))
