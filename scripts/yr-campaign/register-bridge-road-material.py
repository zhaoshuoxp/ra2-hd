"""Register the selected Newurban road material on its matching high bridge."""
import copy
import hashlib
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

root = Path(__file__).resolve().parents[2]
read = lambda p: json.loads(p.read_text())
encode = lambda value: (json.dumps(value, indent=2) + '\n').encode()
sha = lambda data: hashlib.sha256(data).hexdigest()
contract_file = root / 'desktop/environment-newurban-hd-contract.json'
pointer_file = root / '.local/environment-newurban-selection.json'
contract, prior = read(contract_file), read(pointer_file)
assert contract['selectedPack'] == prior
source = root / '.local/environment-packs' / prior['revision']
assert sha((source / 'manifest.json').read_bytes()) == prior['sha256']
manifest = read(source / 'manifest.json')
family = 'newurban-bridge-high-concrete'
entry, = manifest['families'][family]['members']
old_metadata = source / entry['path']
assert sha(old_metadata.read_bytes()) == entry['sha256']
metadata = read(old_metadata)
terrain_pointer = read(root / '.local/terrain-newurban-selection.json')
terrain_root = root / '.local/terrain-packs' / terrain_pointer['revision']
assert sha((terrain_root / 'manifest.json').read_bytes()) == terrain_pointer['sha256']
terrain = read(terrain_root / 'manifest.json')
revision = 'yr-newurban-bridge-road-material-r7'
destination = root / '.local/environment-packs' / revision
destination.mkdir()
for file in source.rglob('*'):
    if not file.is_file() or file == source / 'manifest.json':
        continue
    target = destination / file.relative_to(source)
    target.parent.mkdir(parents=True, exist_ok=True)
    os.link(file, target)
member_dir = destination / 'members/bridge-ubn-road-r7'
member_dir.mkdir(parents=True)
records = []
for variant in metadata['variants']:
    density = variant['density']
    templates = {}
    for name in ['proad01.ubn', 'proad02.ubn']:
        group = next(g for g in terrain['groups'] if any(m['member'] == name for m in g['members']))
        v, = [v for v in group['variants'] if v['density'] == density]
        payload = (terrain_root / v['file']).read_bytes()
        assert sha(payload) == v['sha256']
        atlas = np.frombuffer(payload, np.uint8).reshape(*v['size'][::-1], 4)
        canvas = Image.new('RGBA', (120 * density, 60 * density))
        cursor = 0
        for member in group['members']:
            if member['member'] == name:
                for image, rect in zip(member['images'], v['rects'][cursor:cursor+len(member['images'])]):
                    x, y, w, h = rect
                    ox, oy = image['origin']
                    ox += 60 if name == 'proad01.ubn' else 0
                    canvas.alpha_composite(Image.fromarray(atlas[y:y+h, x:x+w]), (ox*density, oy*density))
                break
            cursor += len(member['images'])
        template = np.array(canvas)
        rgb = template[..., :3].astype(float)
        asphalt = (template[..., 3] > 0) & (rgb.max(2) < 100) & (np.ptp(rgb, axis=2) < 20)
        assert asphalt.sum() > density*density*200
        nearest = ndimage.distance_transform_edt(~asphalt, return_distances=False, return_indices=True)
        templates[name] = rgb[tuple(nearest)]
    for page in variant['pages']:
        old = old_metadata.parent / str(density) / page['id']
        base_bytes, data_bytes = (old / 'base.png').read_bytes(), (old / 'data.png').read_bytes()
        assert sha(base_bytes) == page['baseSha256'] and sha(data_bytes) == page['dataSha256']
        atlas = np.array(Image.open(old / 'base.png').convert('RGBA'))
        for frame in variant['frames']:
            if frame['page'] != page['id']:
                continue
            slot = frame['nativeFrame']
            x, y, w, h = frame['contentRect']
            pixels = atlas[y:y+h, x:x+w]
            previous = pixels.copy()
            rgb = pixels[..., :3].astype(float)
            marks = (rgb[..., 0] >= rgb[..., 1]) & (rgb[..., 0] < rgb[..., 1]*1.25) & (rgb[..., 1] > 100) & (rgb[..., 2] < 80)
            my, mx = np.where(marks)
            assert len(mx) >= 20
            slope = .5 if slot < 9 else -.5
            distance = (my/density + slope*mx/density)/np.sqrt(1.25)
            lo, hi = np.quantile(distance, [.02, .98])
            yy, xx = np.indices(pixels.shape[:2])
            band_distance = (yy/density + slope*xx/density)/np.sqrt(1.25)
            corridor = (band_distance >= lo-1) & (band_distance <= hi+1)
            weight = np.clip((140-rgb.max(2))/25, 0, 1) * np.clip((50-np.ptp(rgb, axis=2))/20, 0, 1)
            weight *= np.clip((rgb.mean(2)-20)/20, 0, 1) * corridor * (pixels[..., 3] > 0)
            ox, oy = metadata['logical']['frames'][slot]['trimOrigin']
            px, py = (xx+.5)/density+ox, (yy+.5)/density+oy
            if slot < 9:
                cross, along = px-2*py+2, (px+2*py-150)%60+88
                sx, sy = (cross+along)/2, (along-cross)/4
                template = templates['proad01.ubn']
            else:
                cross, along = px+2*py-92, (px-2*py+62)%60-30
                sx, sy = (cross+along)/2, (cross-along)/4
                template = templates['proad02.ubn']
            sampled = np.stack([ndimage.map_coordinates(template[..., c], [sy*density-.5, sx*density-.5], order=1, mode='nearest') for c in range(3)], axis=-1)
            pixels[..., :3] = np.uint8(np.clip(rgb*(1-weight[..., None])+sampled*weight[..., None], 0, 255))
            np.testing.assert_array_equal(pixels[..., 3], previous[..., 3])
            np.testing.assert_array_equal(pixels[weight == 0], previous[weight == 0])
            records.append({'density': density, 'frame': slot, 'materialPixels': int((weight > 0).sum()),
                'alphaExact': True, 'outsideMaterialMaskExact': True})
        target = member_dir / str(density) / page['id']
        target.mkdir(parents=True)
        Image.fromarray(atlas).save(target / 'base.png')
        (target / 'data.png').write_bytes(data_bytes)
        page.update(baseSha256=sha((target / 'base.png').read_bytes()), baseBytes=(target / 'base.png').stat().st_size)
metadata['packId'], metadata['packRevision'] = revision, '1'
metadata['color']['sharedContactMaterial'] = {'schema': 'selected-road-material-registration-v2',
    'roadTerrainPack': terrain_pointer, 'members': ['proad01.ubn', 'proad02.ubn'],
    'replacedStaleRoadMaterial': metadata['color']['sharedContactMaterial'],
    'newRasterArtwork': 0, 'paintGeometryAndLaneMarks': 'RETAINED', 'nativeShadows': 'RETAINED'}
(member_dir / 'manifest.json').write_bytes(encode(metadata))
manifest['revision'] = revision
entry.update(path=str((member_dir / 'manifest.json').relative_to(destination)), sha256=sha(encode(metadata)))
(destination / 'manifest.json').write_bytes(encode(manifest))
after = {'schemaVersion': 1, 'revision': revision, 'sha256': sha(encode(manifest))}
contract['selectedPack'] = after
contract_file.write_bytes(encode(contract))
pointer_file.write_bytes(encode(after))
receipt = {'schema': 'yr-newurban-bridge-selected-road-material-v1', 'status': 'SELECTED_NATIVE_REVIEW_PENDING',
    'before': prior, 'after': after, 'terrain': terrain_pointer, 'family': family,
    'source': copy.deepcopy(metadata['source']), 'densityFrames': records, 'newRasterArtwork': 0,
    'originalMapsGeometryAlphaShadowsAndTimingChanged': 0, 'oldPackFilesChanged': 0,
    'otherEnvironmentFamilyDeclarationsChanged': 0, 'userVisualAcceptance': 'PENDING'}
(root / 'docs/yr-campaign-bridge-road-material-20261108.json').open('xb').write(encode(receipt))
print(json.dumps({'selected': after, 'densityFrames': len(records)}))
