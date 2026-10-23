"""Independently verify exported SHP states, original masks, owner indices, and page closure."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from showcase_contours import coverage
from showcase_body_reuse import accepted_body_frames

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('pack', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--prepared', type=Path, default=Path('.artifacts/m2-2/prepared-native-v2'))
parser.add_argument('--contract', type=Path, default=Path('desktop/environment-hd-contract.json'))
args = parser.parse_args()
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
prepared = args.prepared
source = {row['member']: row for row in json.loads((prepared / 'source.json').read_text())['sources']}
contract = json.loads(args.contract.read_text())
pack = json.loads((args.pack / 'manifest.json').read_text())
theater = contract.get('theater', 'TEMPERATE')
assert pack['schema'] == 'environment-shp-pack-v1' and pack['theater'] == theater
members = {}
for identity, family in pack['families'].items():
    expected = contract['families'][identity]
    assert family['familyHash'] == expected['familyHash']
    assert sorted(row['member'] for row in family['members']) == expected['members']
    for row in family['members']:
        previous = members.setdefault(row['member'], row)
        assert previous == row
counts = dict(families=len(pack['families']), members=len(members), densityFrames=0,
              pages=0, nativeEmpty=0, sharedFrames=0, nativePaletteMarkers=0,
              nativeToneFrames=0, nativeThinMetalFrames=0, authoredParticlePixels=0, authoredMuzzlePixels=0,
              authoredFixedColorPixels=0, structuralCoverageFrames=0, exactAcceptedBodyFrames=0)
decoded = {'2': 0, '4': 0}
fixed_payloads, fixed_declarations = {}, []
rubble_payloads, rubble_declarations = {}, []
for name, row in members.items():
    manifest_path = args.pack / row['path']
    assert sha(manifest_path) == row['sha256']
    manifest = json.loads(manifest_path.read_text())
    native, declared = source[name], contract['sources'][name]
    assert manifest['source'] == dict(member=name, sha256=native['sha256'],
        theater=theater, kind='resolved-shp-member')
    assert manifest['logical']['canvas'] == native['canvas'] == declared['canvas']
    frames = native['frames'][:declared['bodyFrames']]
    terrain_structural = manifest['color'].get('terrainStructuralCoverage')
    if terrain_structural:
        assert theater == 'NEWURBAN' and terrain_structural['sourceSha256'] == native['sha256']
        assert all(binding['kind'] == 'terrain' for binding in native['bindings'])
        assert terrain_structural['schema'] == 'source-pinned-terrain-contours-v1'
    structural = manifest['color'].get('structuralCoverage')
    if structural:
        assert structural['schema'] == 'native-structural-subpixel-coverage-v1'
        assert structural['toleranceNativePixels'] == .7
        assert structural['maximumContourAreaChangeFraction'] == .025
        assert structural['stairCornerCutNativePixels'] == .5
        assert structural['maximumShortStairRunNativePixels'] == 8
        assert structural['tinyContourAreaPreserved'] == 4
        assert structural['supersamplesPerOutputAxis'] == 8
        assert all(binding['kind'] == 'building' for binding in native['bindings'])
    reuse = accepted_body_frames(dict(acceptedNativeBodyFrames={name: manifest['color']['acceptedNativeBodyFrames']},
        nativeStructuralCoverage=structural), {name: native}) if manifest['color'].get('acceptedNativeBodyFrames') else {}

    particles = manifest['color'].get('nativeDetachedParticleRegistration')
    particle_plate = None
    if particles:
        assert name == 'civ2.shp' and particles['classification'] == 'AUTHORED_BRASS_NATIVE_SINGLE_PIXEL_COMPONENTS'
        assert particles['sourceSha256'] == native['sha256'] == 'a92dce1327c5b6f05e99a839f4beb5654796881ccade696a8076da1694f35b22'
        assert particles['paletteSha256'] == native['palette']['sha256']
        file = Path(particles['master'])
        assert sha(file) == particles['masterSha256']
        master = Image.open(file).convert('RGBA')
        assert list(master.size) == particles['boardSize']
        px, py, pw, ph = particles['masterRect']
        assert min(pw, ph) >= 4 and 0 <= px < px + pw <= master.width and 0 <= py < py + ph <= master.height
        crop = np.asarray(master.crop((px, py, px + pw, py + ph)))
        valid = crop[..., 3] > 240
        assert valid.any()
        nearest = ndimage.distance_transform_edt(~valid, return_distances=False, return_indices=True)
        material = crop[..., :3].copy()
        material[~valid] = material[tuple(nearest[:, ~valid])]
        particle_plate = Image.fromarray(material)
    muzzle = manifest['color'].get('nativeMuzzleRegistration')
    muzzle_plate = None
    if muzzle:
        assert name in ('civ2.shp', 'civ3.shp', 'civa.shp', 'civb.shp', 'civc.shp')
        assert muzzle['classification'] == 'AUTHORED_NATIVE_WHITE_MUZZLE_MATERIAL'
        assert muzzle['sourceSha256'] == native['sha256'] and muzzle['paletteSha256'] == native['palette']['sha256']
        assert muzzle['paletteIndex'] == 240 and muzzle['emissiveFloor'] == 235
        assert muzzle['fireStart'] == (84 if name == 'civ3.shp' else 86)
        file = Path(muzzle['master'])
        assert sha(file) == muzzle['masterSha256']
        px, py, pw, ph = muzzle['masterRect']
        master = Image.open(file).convert('RGBA')
        assert 0 <= px < px + pw <= master.width and 0 <= py < py + ph <= master.height
        crop = np.asarray(master.crop((px, py, px + pw, py + ph)))
        valid = crop[..., 3] > 240
        labels, count = ndimage.label(valid)
        sizes = np.bincount(labels.ravel())
        sizes[0] = 0
        selected = labels == sizes.argmax()
        for label, size in enumerate(sizes):
            if label and size >= max(50, sizes.max() * .005):
                selected |= labels == label
        ys, xs = np.where(selected)
        assert len(xs) > 100
        crop = crop[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        valid = crop[..., 3] > 240
        nearest = ndimage.distance_transform_edt(~valid, return_distances=False, return_indices=True)
        material = crop[..., :3].copy()
        material[~valid] = material[tuple(nearest[:, ~valid])]
        muzzle_plate = Image.fromarray(material)
    fixed_color = manifest['color'].get('nativeFixedColorRegistration')
    fixed_color_plate, fixed_color_gain = None, None
    if fixed_color:
        assert name == 'civb.shp'
        assert fixed_color['classification'] == 'AUTHORED_NATIVE_FIXED_RED_DETAIL_MATERIAL'
        assert fixed_color['sourceSha256'] == native['sha256'] == '1b25f54be563e8d07f2a2237578036471d5238f52dd250902f8b1a5bec88b2e2'
        assert fixed_color['paletteSha256'] == native['palette']['sha256']
        assert fixed_color['paletteIndex'] == 250 and fixed_color['nativeRgb'] == [188, 0, 0]
        assert fixed_color['fireStart'] == 86
        file = Path(fixed_color['master'])
        assert sha(file) == fixed_color['masterSha256']
        master = Image.open(file).convert('RGBA')
        assert list(master.size) == fixed_color['boardSize']
        px, py, pw, ph = fixed_color['masterRect']
        assert min(pw, ph) >= 4 and 0 <= px < px + pw <= master.width
        assert 0 <= py < py + ph <= master.height
        crop = np.asarray(master.crop((px, py, px + pw, py + ph)))
        assert (crop[..., 3] > 240).all()
        mean = crop[..., :3].mean((0, 1))
        assert mean[0] > 2 * max(mean[1:])
        fixed_color_gain = np.asarray(fixed_color['nativeRgb']) / np.maximum(mean, 1)
        fixed_color_plate = Image.fromarray(crop[..., :3])
    if manifest['color'].get('sharedNativeRubbleFrame'):
        rubble_declarations.append((name, manifest['color']['sharedNativeRubbleFrame']))
    assert len(manifest['logical']['frames']) == len(frames)
    assert [variant['density'] for variant in manifest['variants']] == [2, 4]
    for frame, logical in zip(frames, manifest['logical']['frames'], strict=True):
        assert logical == dict(nativeFrame=frame['slot'], trimOrigin=frame['origin'], trimSize=frame['size'],
            legacyRenderSize=[n + n % 2 for n in frame['size']], empty=frame['empty'])
    for variant in manifest['variants']:
        density = variant['density']
        assert 1 <= len(variant['pages']) <= 8
        assert len(variant['frames']) == len(frames)
        pages, used = {}, {}
        for page in variant['pages']:
            images = []
            for role in ['base', 'data']:
                file = manifest_path.parent / str(density) / page['id'] / f'{role}.png'
                assert sha(file) == page[role + 'Sha256'] and file.stat().st_size == page[role + 'Bytes']
                assert page[role] == f'{density}-{page["id"]}-{role}.png'
                image = Image.open(file)
                assert image.mode == 'RGBA' and list(image.size) == page['size']
                assert max(image.size) <= 2048
                images.append(np.asarray(image))
                decoded[str(density)] += image.width * image.height * 4
            pages[page['id']] = images
            used[page['id']] = np.zeros(images[0].shape[:2], bool)
            assert (images[1][..., 3] == 255).all() and not images[1][..., 2].any()
            counts['pages'] += 1
        for frame, entry in zip(frames, variant['frames'], strict=True):
            assert entry['nativeFrame'] == frame['slot']
            base, data = pages[entry['page']]
            x, y, rw, rh = entry['sampleRect']
            w, h = frame['size']
            assert [rw, rh] == [(n + n % 2) * density for n in frame['size']]
            assert entry['contentRect'] == [x, y, w * density, h * density]
            assert 0 <= x <= x + rw <= base.shape[1] and 0 <= y <= y + rh <= base.shape[0]
            expected_alpha = np.zeros((rh, rw), np.uint8)
            expected_owner = np.zeros((rh, rw), np.uint8)
            expected_shades = np.zeros((rh, rw), np.uint8)
            if w and h:
                file = prepared / 'native' / frame.get('indexFile', f'{name}-{frame["slot"]}.index')
                assert sha(file) == frame['indexSha256']
                indices = np.frombuffer(file.read_bytes(), np.uint8).reshape(h, w)
                if fixed_color and 86 <= frame['slot'] < 134:
                    ys, xs = np.where(indices == 250)
                    declaration = fixed_color['frames'].get(str(frame['slot']))
                    assert bool(declaration) == bool(len(xs))
                    if declaration:
                        assert declaration == dict(indexSha256=frame['indexSha256'],
                            pixels=[[int(x), int(y)] for x, y in zip(xs, ys)])
                        original = prepared / 'native' / frame['file']
                        assert sha(original) == frame['rgbaSha256']
                        colors = np.asarray(Image.frombytes('RGBA', (w, h), original.read_bytes()))
                        assert (colors[ys, xs, :3] == fixed_color['nativeRgb']).all()
                        sampled = np.asarray(fixed_color_plate.resize((density, density), Image.Resampling.LANCZOS))
                        expected = np.clip(sampled * fixed_color_gain, 0, 255).astype(np.uint8)
                        for px, py in declaration['pixels']:
                            actual = base[y + py * density:y + (py + 1) * density,
                                          x + px * density:x + (px + 1) * density, :3]
                            assert np.array_equal(actual, expected), (name, frame['slot'], 'authored fixed color')
                            counts['authoredFixedColorPixels'] += density * density
                if muzzle and muzzle['fireStart'] <= frame['slot'] < muzzle['fireStart'] + 48:
                    ys, xs = np.where(indices == 240)
                    declaration = muzzle['frames'].get(str(frame['slot']))
                    assert bool(declaration) == bool(len(xs))
                    if declaration:
                        assert declaration == dict(indexSha256=frame['indexSha256'],
                            pixels=[[int(x), int(y)] for x, y in zip(xs, ys)])
                        left, top, right, bottom = int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)
                        size = (right - left) * density, (bottom - top) * density
                        assert muzzle_plate.width >= size[0] and muzzle_plate.height >= size[1]
                        expected = np.asarray(muzzle_plate.resize(size, Image.Resampling.LANCZOS))
                        expected = (235 + expected.astype(np.float64) * (20 / 255)).astype(np.uint8)
                        mask = np.repeat(np.repeat(indices[top:bottom, left:right] == 240, density, 0), density, 1)
                        actual = base[y + top * density:y + bottom * density,
                                      x + left * density:x + right * density, :3]
                        assert np.array_equal(actual[mask], expected[mask]), (name, frame['slot'], 'authored muzzle')
                        counts['authoredMuzzlePixels'] += int(mask.sum())
                if particles and 86 <= frame['slot'] < 134:
                    labels, count = ndimage.label((indices != 0) & (indices != 12), structure=np.ones((3, 3)))
                    expected_pixels = []
                    for label in range(1, count + 1):
                        ys, xs = np.where(labels == label)
                        if len(xs) == 1 and indices[ys[0], xs[0]] in (179, 180):
                            expected_pixels.append([int(xs[0]), int(ys[0]), int(indices[ys[0], xs[0]])])
                    particle_frame = particles['frames'].get(str(frame['slot']))
                    assert bool(particle_frame) == bool(expected_pixels)
                    if particle_frame:
                        assert particle_frame == dict(indexSha256=frame['indexSha256'], pixels=expected_pixels)
                        expected_rgb = np.asarray(particle_plate.resize((density, density), Image.Resampling.LANCZOS))
                        for px, py, _ in expected_pixels:
                            actual = base[y + py * density:y + (py + 1) * density,
                                          x + px * density:x + (px + 1) * density, :3]
                            assert np.array_equal(actual, expected_rgb), (name, frame['slot'], 'authored particle')
                            counts['authoredParticlePixels'] += density * density
                native_indices = indices.copy()
                indices = np.repeat(np.repeat(indices, density, axis=0), density, axis=1)
                expected_alpha[:h * density, :w * density] = np.uint8(indices != 0) * 255
                markers = manifest['color'].get('nativePaletteMarkerFrames', {})
                if str(frame['slot']) in markers.get('frames', {}):
                    assert markers['sourceSha256'] == native['sha256']
                    marker_index, = markers['indices']
                    assert marker_index in (1, 6)
                    if marker_index == 6:
                        assert name == 'veins.tem'
                        assert native['sha256'] == 'dffd763ba9ee242bb4b36c64f98f6d922917d38f70bb6e62c1936f2eda40aa16'
                        assert markers.get('classification') == 'NATIVE_SINGLE_INDEX_OVERLAY_MARKERS'
                        assert set(map(int, markers['frames'])) == set(range(native['totalFrames'] // 2))
                        assert all(binding['kind'] == 'overlay' and binding['role'] == 'body'
                                   and binding['nativeRules'].get('IsVeins', '').lower() == 'true'
                                   for binding in native['bindings'])
                    assert markers['frames'][str(frame['slot'])] == frame['indexSha256']
                    assert marker_index in indices and set(indices.ravel()).issubset({0, marker_index})
                    if marker_index == 1:
                        assert all(binding['role'] == 'ACTIVE' and frame['slot'] > int(
                            binding['nativeArt']['LoopEnd']) for binding in native['bindings'])
                    original = prepared / 'native' / frame['file']
                    assert sha(original) == frame['rgbaSha256']
                    pixels = np.asarray(Image.frombytes('RGBA', (w, h), original.read_bytes()))
                    pixels = np.repeat(np.repeat(pixels, density, axis=0), density, axis=1)
                    active = indices != 0
                    assert np.array_equal(base[y:y + h * density, x:x + w * density, :3][active],
                                          pixels[..., :3][active])
                    counts['nativePaletteMarkers'] += 1
                is_rubble = frame['slot'] == 3 and any(binding['kind'] == 'building'
                    and binding['role'] == 'body' for binding in native['bindings']) and len(frames) >= 4
                if is_rubble:
                    assert declared['framePalettes']['3']['member'] == {
                        'TEMPERATE': 'isotem.pal', 'SNOW': 'isosno.pal', 'URBAN': 'isourb.pal',
                        'NEWURBAN': 'isoubn.pal', 'DESERT': 'isodes.pal', 'LUNAR': 'isolun.pal'}[theater]
                    assert declared['framePalettes']['3']['remapable'] is False
                    if 'runtimeUsed' in declared['framePalettes']['3']:
                        assert declared['framePalettes']['3']['runtimeUsed'] == (str(
                            native['nativeRules'].get('LeaveRubble', 'no')).lower() in ('yes', 'true', '1'))
                tone = manifest['color'].get('nativeFrameTone', {}).get(str(frame['slot']))
                if tone:
                    frame_palette = declared['framePalettes'][str(frame['slot'])]
                    assert is_rubble or not declared['remapable']
                    assert frame_palette['remapable'] is False
                    assert tone == dict(sourceSha256=native['sha256'],
                        indexSha256=frame['indexSha256'], paletteSha256=frame_palette['sha256'])
                    palette_file = prepared / 'native' / frame_palette['member']
                    if not palette_file.exists():
                        palette_file = prepared / 'native' / (frame_palette['sha256'] + '.pal')
                    assert sha(palette_file) == frame_palette['sha256']
                    palette = np.frombuffer(palette_file.read_bytes(), np.uint8).reshape(256, 3)
                    colors = (palette.astype(np.uint16) * 4).astype(np.uint8)[indices]
                    body = (indices != 0) & (indices != 12)
                    proof = variant['nativeFrameToneEvidence'][str(frame['slot'])]
                    native_mean = colors[body].mean(0)
                    output_mean = base[y:y + h * density, x:x + w * density, :3][body].mean(0)
                    input_mean = np.array(proof['inputMean'])
                    assert proof['strength'] == .75 and proof['bodyPixels'] == int(body.sum())
                    assert np.allclose(native_mean, proof['nativeMean'], atol=1e-6)
                    assert np.allclose(output_mean, proof['outputMean'], atol=1e-6)
                    assert np.allclose(.25 + .75 * native_mean / np.maximum(input_mean, 1), proof['gain'])
                    assert np.all(abs(output_mean - native_mean) <= abs(input_mean - native_mean) + 1.01)
                    counts['nativeToneFrames'] += 1
                if declared['remapable'] and not is_rubble:
                    owner = (indices >= 16) & (indices <= 31)
                    expected_owner[:h * density, :w * density] = np.uint8(owner) * 255
                    expected_shades[:h * density, :w * density][owner] = indices[owner] - 16
                if structural or terrain_structural:
                    geometric = coverage(native_indices != 0, density)
                    contact = indices == 12
                    if declared['remapable'] and not is_rubble:
                        native_owner = (native_indices >= 16) & (native_indices <= 31)
                        owner_mask = coverage(native_owner, density, linear_strips=True)
                        geometric = np.maximum(geometric, owner_mask)
                        owner_mask[contact] = 0
                        owner_mask[geometric == 0] = 0
                        expected_owner[:h * density, :w * density] = owner_mask
                        if native_owner.any():
                            nearest = ndimage.distance_transform_edt(~native_owner,
                                return_distances=False, return_indices=True)
                            shades = (native_indices[tuple(nearest)] - 16).repeat(density, 0).repeat(density, 1)
                            expected_shades[:h * density, :w * density] = np.where(owner_mask > 0, shades, 0)
                    geometric[contact] = 255
                    expected_alpha[:h * density, :w * density] = geometric
                    counts['structuralCoverageFrames'] += 1
                thin_metal = manifest['color'].get('nativeThinMetalRegistration')
                if thin_metal:
                    assert thin_metal['shadeGate'] == dict(nativeLuminanceThreshold=110,
                        exponent=1.6, authoredMetalExposure=1.5)
                    assert name == 'ctfncp.shp'
                    assert thin_metal['sourceSha256'] == native['sha256'] == '1d0d4d6dd112ef7e229ab9f690c23de5f57ff64d92c142f3a18d797e68dfb72f'
                    assert thin_metal['paletteSha256'] == native['palette']['sha256']
                    assert thin_metal['frames'][str(frame['slot'])] == frame['indexSha256']
                    assert not declared['remapable'] and not is_rubble
                    original = prepared / 'native' / frame['file']
                    assert sha(original) == frame['rgbaSha256']
                    colors = np.asarray(Image.frombytes('RGBA', (w, h), original.read_bytes()))
                    colors = np.repeat(np.repeat(colors, density, 0), density, 1)
                    bound = 255 * np.clip(colors[..., :3].mean(2) / 110, 0, 1) ** 1.6 * 1.5
                    body = (indices != 0) & (indices != 12)
                    output = base[y:y + h * density, x:x + w * density, :3]
                    assert (output[body] <= bound[body, None] + 1).all()
                    counts['nativeThinMetalFrames'] += 1
                contacts = indices == 12
                if contacts.any():
                    original = prepared / 'native' / frame['file']
                    assert sha(original) == frame['rgbaSha256']
                    if is_rubble:
                        palette_file = prepared / 'native' / declared['framePalettes']['3']['member']
                        if not palette_file.exists():
                            palette_file = prepared / 'native' / (declared['framePalettes']['3']['sha256'] + '.pal')
                        assert sha(palette_file) == declared['framePalettes']['3']['sha256']
                        palette = np.array(list(palette_file.read_bytes()), np.uint8).reshape(256, 3)
                        native_rgba = (palette.astype(np.uint16) * 4).astype(np.uint8)[indices]
                    else:
                        native_rgba = np.asarray(Image.frombytes('RGBA', (w, h), original.read_bytes()))
                        native_rgba = np.repeat(np.repeat(native_rgba, density, axis=0), density, axis=1)
                    assert np.array_equal(base[y:y + h * density, x:x + w * density, :3][contacts],
                                          native_rgba[..., :3][contacts])
            assert np.array_equal(base[y:y + rh, x:x + rw, 3], expected_alpha), (name, frame['slot'], 'alpha')
            assert np.array_equal(data[y:y + rh, x:x + rw, 0], expected_owner)
            assert np.array_equal(data[y:y + rh, x:x + rw, 1], expected_shades)
            fragments = manifest['color'].get('nativePreservedFragments')
            if fragments and frame['slot'] == fragments['nativeFrame']:
                assert fragments['schema'] == 'source-pinned-microscopic-rubble-fragments-v1'
                assert fragments['sourceSha256'] == native['sha256'] and fragments['indexSha256'] == frame['indexSha256']
                palette_descriptor = declared['framePalettes'][str(frame['slot'])]
                assert palette_descriptor['remapable'] is False and palette_descriptor['sha256'] == fragments['paletteSha256']
                raw = np.frombuffer((prepared / 'native' / frame['indexFile']).read_bytes(), np.uint8).reshape(h, w)
                outside = (raw != 0) & (raw != 12)
                left, top, right, bottom = fragments['authoredMainBounds']
                outside[top:bottom, left:right] = False
                ys, xs = np.where(outside)
                assert fragments['pixels'] == [[int(px), int(py), int(raw[py, px])] for px, py in zip(xs, ys)]
                assert 0 < len(xs) <= 8
                labels, count = ndimage.label(outside)
                assert max(np.bincount(labels.ravel())[1:]) <= 2
                palette_file = prepared / 'native' / (palette_descriptor['sha256'] + '.pal')
                assert sha(palette_file) == palette_descriptor['sha256']
                colors = np.frombuffer(palette_file.read_bytes(), np.uint8).reshape(256, 3).astype(np.uint16) * 4
                for px, py, value in fragments['pixels']:
                    region = base[y + py * density:y + (py + 1) * density, x + px * density:x + (px + 1) * density]
                    assert np.all(region[..., :3] == colors[value]) and np.all(region[..., 3] == 255)
            if (frame['slot'], density) in reuse.get(name, {}):
                expected_base, expected_data = reuse[name][frame['slot'], density]
                assert np.array_equal(base[y:y + rh, x:x + rw], expected_base), (name, frame['slot'], 'accepted base drift')
                assert np.array_equal(data[y:y + rh, x:x + rw], expected_data), (name, frame['slot'], 'accepted owner drift')
                counts['exactAcceptedBodyFrames'] += 1
            if frame['slot'] == 3:
                rubble_payloads[name, density] = (base[y:y + rh, x:x + rw].copy(), data[y:y + rh, x:x + rw].copy())
            used[entry['page']][y:y + rh, x:x + rw] = True
            counts['densityFrames'] += 1
            counts['nativeEmpty'] += int(frame['empty'])
            counts['sharedFrames'] += int('sharedWith' in entry)
            for part in manifest['color'].get('fixedNativeParts', []):
                if frame['slot'] in part['targets'].get(name, []):
                    canvas = np.zeros((*[v * density for v in reversed(native['canvas'])], 3), np.uint8)
                    ox, oy = frame['origin']
                    canvas[oy * density:(oy + h) * density, ox * density:(ox + w) * density] = (
                        base[y:y + h * density, x:x + w * density, :3])
                    index_canvas = np.zeros(tuple(reversed(native['canvas'])), np.uint8)
                    index_canvas[oy:oy + h, ox:ox + w] = indices[::density, ::density]
                    fixed_payloads[name, frame['slot'], density] = canvas, index_canvas
                    fixed_declarations.append((name, frame['slot'], density, part))
        for page_id, (base, data) in pages.items():
            outside = ~used[page_id]
            assert not base[..., 3][outside].any(), (name, page_id, 'opaque gutter')
            assert not data[..., :3][outside].any(), (name, page_id, 'owner gutter')
shared_rubble_frames = 0
for name, declaration in rubble_declarations:
    canonical = declaration['canonicalMember']
    assert declaration['sourceSha256'] == source[name]['sha256']
    assert declaration['canonicalSourceSha256'] == source[canonical]['sha256']
    assert source[name]['frames'][3]['indexSha256'] == source[canonical]['frames'][3]['indexSha256'] == declaration['indexSha256']
    assert source[name]['frames'][3]['size'] == source[canonical]['frames'][3]['size']
    assert contract['sources'][name]['framePalettes']['3'] == contract['sources'][canonical]['framePalettes']['3']
    assert contract['sources'][name]['framePalettes']['3']['sha256'] == declaration['paletteSha256']
    for density in [2, 4]:
        assert all(np.array_equal(actual, expected) for actual, expected in zip(
            rubble_payloads[name, density], rubble_payloads[canonical, density], strict=True)), (name, 'shared rubble drift')
        shared_rubble_frames += 1
counts['exactSharedRubbleDensityFrames'] = shared_rubble_frames
fixed_pixels = 0
for name, number, density, part in fixed_declarations:
    canonical = part['canonicalMember'], part['canonicalFrame'], density
    assert source[canonical[0]]['sha256'] == part['canonicalSourceSha256']
    target_rgb, target_index = fixed_payloads[name, number, density]
    canonical_rgb, canonical_index = fixed_payloads[canonical]
    assert source[name]['canvas'] == source[canonical[0]]['canvas']
    assert source[name]['palette'] == source[canonical[0]]['palette']
    region = np.zeros(target_index.shape, bool)
    x, y, w, h = part['nativeCanvasRect']
    region[y:y + h, x:x + w] = True
    equal = (target_index == canonical_index) & (canonical_index > 31) & region
    assert equal.any()
    mask = np.repeat(np.repeat(equal, density, axis=0), density, axis=1)
    assert np.array_equal(target_rgb[mask], canonical_rgb[mask]), (name, number, 'fixed native part drift')
    fixed_pixels += int(mask.sum())
counts['verifiedFixedPartPixels'] = fixed_pixels
report = dict(schema='m2-2-shp-independent-verification-v1', status='PASS',
    pack=str(args.pack), sha256=sha(args.pack / 'manifest.json'), counts=counts, decodedInputBytes=decoded,
    nativeShadows='Unmodified original frame dependencies',
    verification='Exact source/family/page closure, body slots, independent densities, native masks, native owner indices, contact patches and transparent gutters',
    runtimeAcceptance=False, wholeMapComplete=False)
args.output.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
