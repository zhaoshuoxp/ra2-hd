"""Project one authored Lunar material across exact source ground contacts."""
import copy
import hashlib
import json
import os
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[2]
read = lambda p: json.loads(p.read_text())
encode = lambda value: (json.dumps(value, indent=2) + '\n').encode()
sha = lambda data: hashlib.sha256(data).hexdigest()
revision = 'yr-lunar-contact-material-r4'
pointer_file = root / '.local/terrain-lunar-selection.json'
contract_file = root / 'desktop/terrain-theater-hd-contracts.json'
prior = read(pointer_file)
assert prior['revision'] == 'yr-lunar-contact-material-r3'
old = root / '.local/terrain-packs/yr-lunar-complete-terrain-r2'
assert sha((old / 'manifest.json').read_bytes()) == 'b82ae2b6e0fabe387706e2c82ffdfce6c632d247d0b7a1d089be65814e64b5c6'
manifest = copy.deepcopy(read(old / 'manifest.json'))
manifest['revision'] = revision
source = read(root / '.local/source-art/yr-campaign-v1/lunar-terrain/source.json')
sources = {m['member']: m['native'] for m in source['members']}
prepared = root / '.artifacts/yr-campaign/lunar-native-r1/native'
authoring = root / '.local/source-art/yr-campaign-v1/lunar-terrain/contact-material-r3'
master_file = authoring / 'lunar-regolith-master.png'
master = np.array(Image.open(master_file).convert('RGB'), dtype=float)
assert min(master.shape[:2]) >= 1024


def periodic(image):
    """Remove opposite-edge discontinuity with a periodic Poisson decomposition."""
    height, width = image.shape[:2]
    boundary = np.zeros_like(image)
    boundary[0] += image[-1] - image[0]
    boundary[-1] += image[0] - image[-1]
    boundary[:, 0] += image[:, -1] - image[:, 0]
    boundary[:, -1] += image[:, 0] - image[:, -1]
    yy, xx = np.meshgrid(np.arange(height), np.arange(width), indexing='ij')
    denominator = 2 * np.cos(2 * np.pi * xx / width) + 2 * np.cos(2 * np.pi * yy / height) - 4
    denominator[0, 0] = 1
    smooth = np.fft.fft2(boundary, axes=(0, 1)) / denominator[..., None]
    smooth[0, 0] = 0
    return image - np.fft.ifft2(smooth, axes=(0, 1)).real


material = np.clip(periodic(master), 0, 255)
material_image = Image.fromarray(material.astype(np.uint8))
material_image.save(authoring / 'lunar-regolith-periodic.png')
native_clear, authored_clear = [], []
for member in manifest['groups'][0]['members']:
    native = sources[member['member']]['images'][0]
    rgba = np.frombuffer((prepared / native['file']).read_bytes(), np.uint8).reshape(*native['size'][::-1], 4)
    native_clear.append(rgba[..., :3][rgba[..., 3] > 0].mean(0))
variant = manifest['groups'][0]['variants'][1]
atlas = np.frombuffer((old / variant['file']).read_bytes(), np.uint8).reshape(*variant['size'][::-1], 4)
for x, y, width, height in variant['rects']:
    rgba = atlas[y:y+height, x:x+width]
    authored_clear.append(rgba[..., :3][rgba[..., 3] > 128].mean(0))
native_mean = np.mean(native_clear, axis=0)
target_mean = np.mean(authored_clear, axis=0)
material = np.clip(material + target_mean - material.mean((0, 1)), 0, 255)
material_image = Image.fromarray(material.astype(np.uint8))
pack = root / '.local/terrain-packs' / revision
assert not pack.exists()
pack.mkdir()
changed_groups = {'yr-lunar-v1-set00', 'yr-lunar-v1-set09', 'yr-lunar-v1-set43'}
records, retained = [], []
for group in manifest['groups']:
    for variant in group['variants']:
        payload = old / variant['file']
        assert sha(payload.read_bytes()) == variant['sha256']
        output = pack / variant['file']
        if group['id'] not in changed_groups:
            os.link(payload, output)
            retained.append({'file': variant['file'], 'sha256': variant['sha256']})
            continue
        density = variant['density']
        atlas = np.frombuffer(payload.read_bytes(), np.uint8).reshape(*variant['size'][::-1], 4).copy()
        # A 30 by 15 source-pixel period is invariant under every original
        # isometric tile translation and elevation step. No per-actor UV drift.
        tile = np.array(material_image.resize((30*density, 15*density), Image.Resampling.LANCZOS))
        frame = 0
        for member in group['members']:
            for native in sources[member['member']]['images']:
                x, y, width, height = variant['rects'][frame]
                frame += 1
                rgba = np.frombuffer((prepared / native['file']).read_bytes(), np.uint8).reshape(*native['size'][::-1], 4)
                assert [width, height] == [value*density for value in native['size']]
                yy, xx = np.mgrid[:height, :width]
                ox, oy = native['offset']
                rgb = tile[(yy + oy*density) % (15*density), (xx + ox*density) % (30*density)].astype(float)
                # Fit broad source lighting only. Original RGB supplies no
                # material detail; all visible detail comes from the HD master.
                sy, sx = np.mgrid[:rgba.shape[0], :rgba.shape[1]]
                sx = (sx+.5)/rgba.shape[1]; sy = (sy+.5)/rgba.shape[0]
                design = np.stack([np.ones_like(sx), sx, sy, sx*sy, sx*sx, sy*sy], axis=-1)
                mask = rgba[..., 3] > 0
                coefficients = np.linalg.lstsq(design[mask], rgba[..., :3][mask]/native_mean, rcond=None)[0]
                px = (xx+.5)/width; py = (yy+.5)/height
                basis = np.stack([np.ones_like(px), px, py, px*py, px*px, py*py], axis=-1)
                light = np.clip(basis @ coefficients, .62, 1.28)
                if group['id'] == 'yr-lunar-v1-set00':
                    light[:] = 1
                # Retain the original broad slope light with restrained contrast.
                # An independently brightened edge would draw a false rim around
                # every cell, so the material has no border-specific exposure.
                rgb *= 1 + (light-1)*.55
                alpha = atlas[y:y+height, x:x+width, 3].copy()
                atlas[y:y+height, x:x+width, :3] = np.clip(rgb, 0, 255).astype(np.uint8)
                # Retain exact original internal-contact coverage, including
                # native transparent cuts and surplus TMP rows.
                assert np.array_equal(alpha, rgba[..., 3].repeat(density, 0).repeat(density, 1))
                atlas[y-2:y+height+2, x-2:x+width+2] = np.pad(atlas[y:y+height, x:x+width], ((2, 2), (2, 2), (0, 0)), mode='edge')
                records.append({'member': member['member'], 'subTile': native['subTile'], 'density': density,
                    'originalRgbaSha256': native['rgbaSha256'], 'logicalSize': native['logical'],
                    'originalAlphaExact': True, 'sourceLightingPolynomial': coefficients.tolist()})
        assert frame == len(variant['rects'])
        output.write_bytes(atlas.tobytes())
        variant['sha256'] = sha(output.read_bytes())
    if group['id'] in changed_groups:
        group.pop('contourReconstruction', None)
        group['surfaceContinuation'] = {'schema': 'source-pinned-lunar-contact-material-v1',
            'masterSha256': sha(master_file.read_bytes()), 'projectedPeriod': [30, 15],
            'sourceGeometryAndAlphaUnchanged': True, 'independentDensitySampling': [2, 4]}
(pack / 'manifest.json').write_bytes(encode(manifest))
selected = {'schemaVersion': 1, 'revision': revision, 'sha256': sha((pack/'manifest.json').read_bytes())}
contract = read(contract_file)
assert contract['LUNAR'] == prior
pointer_file.write_bytes(encode(selected)); contract_file.write_bytes(encode({**contract, 'LUNAR': selected}))
receipt = {'schema': 'yr-lunar-contact-material-repair-v1', 'status': 'SELECTED_NATIVE_VISUAL_REVIEW_PENDING',
    'priorSelection': prior, 'selectedPack': selected, 'master': str(master_file.relative_to(root)),
    'masterSha256': sha(master_file.read_bytes()), 'prompt': str((authoring/'prompt.txt').relative_to(root)),
    'generationTool': 'built-in image_gen.imagegen', 'changedGroups': sorted(changed_groups),
    'retainedAtlases': retained, 'frames': records, 'originalGeometryDepthRulesUnchanged': True,
    'nativeMapsChanged': False, 'priorPayloadsChanged': 0, 'worldBudgetsChanged': False,
    'originalRgbUsedAsNewMaterialDetail': False, 'userVisualAcceptance': 'PENDING'}
receipt['replacedCandidate'] = {'revision': prior['revision'],
    'qualification': 'Native review identified false bright contact rims; candidate retained unmodified.'}
(root/'docs/yr-campaign-lunar-contact-material-20261108-r4.json').open('xb').write(encode(receipt))
print(json.dumps({'status': receipt['status'], 'selected': selected, 'densityFrames': len(records)}))
