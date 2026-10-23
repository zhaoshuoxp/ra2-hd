"""Export complete authored SHP slots with fixed native masks and independent densities."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from showcase_registration import capacity, independently_sample, register, sha
from showcase_materials import (register_bridge, register_frame_tone, register_minerals,
                                register_thin_metal, register_tree_tone)
from showcase_owner import register_owner_material
from showcase_atlas import page_width
from showcase_contours import register_contours
from showcase_components import accepted_flag_components, accepted_outpost_motion, flag_frame_material
from showcase_body_reuse import accepted_body_frames
from showcase_airport import RegisteredAirport

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('revision')
parser.add_argument('--root', type=Path, default=Path('.artifacts/m2-2/authoring-shp-v1'))
parser.add_argument('--families', nargs='+')
parser.add_argument('--material-profile', type=Path)
parser.add_argument('--prepared', type=Path, default=Path('.artifacts/m2-2/prepared-native-v2'))
parser.add_argument('--contract', type=Path, default=Path('desktop/environment-hd-contract.json'))
parser.add_argument('--schema', default='m2-2-shp-export-v1')
parser.add_argument('--source-hash-paths', action='store_true',
                    help='Namespace new payload folders by exact source hash for same-named edition variants')
args = parser.parse_args()
root = args.root
profile = json.loads(args.material_profile.read_text()) if args.material_profile else {}
coverage_policy = profile.get('nativeStructuralCoverage')
terrain_contours = profile.get('nativeTerrainStructuralCoverage', {})
if coverage_policy:
    assert coverage_policy['schema'] == 'native-structural-subpixel-coverage-v1'
    assert coverage_policy['toleranceNativePixels'] == .7 and coverage_policy['maximumContourAreaChangeFraction'] == .025
swatch = np.asarray(Image.open(profile['bridgeSwatch']).convert('RGB')) if profile.get('bridgeSwatch') else None
work = json.loads((root / 'worklist.json').read_text())
prepared = args.prepared
assert work['preparedSourceSha256'] == sha(prepared / 'source.json')
native = {source['member']: source for source in json.loads((prepared / 'source.json').read_text())['sources']
          if source['format'] == 'shp'}
accepted_components, component_evidence = accepted_flag_components(profile, native, prepared)
motion_components, motion_evidence = accepted_outpost_motion(profile, native, prepared)
assert not accepted_components.keys() & motion_components.keys()
accepted_components.update(motion_components)
component_evidence.update(motion_evidence)
body_reuse = accepted_body_frames(profile, native)
airport = RegisteredAirport(profile, native, prepared)
contract = json.loads(args.contract.read_text())
theater = contract.get('theater', 'TEMPERATE')
shared_rubble = profile.get('sharedNativeRubbleFrames', {})
for name, declaration in shared_rubble.items():
    canonical = declaration['canonicalMember']
    assert canonical != name and canonical not in shared_rubble
    assert native[name]['sha256'] == declaration['sourceSha256']
    assert native[canonical]['sha256'] == declaration['canonicalSourceSha256']
    a, b = native[name]['frames'][3], native[canonical]['frames'][3]
    assert a['indexSha256'] == b['indexSha256'] == declaration['indexSha256']
    assert a['size'] == b['size']
    assert contract['sources'][name]['framePalettes']['3'] == contract['sources'][canonical]['framePalettes']['3']
    assert contract['sources'][name]['framePalettes']['3']['remapable'] is False
    assert contract['sources'][name]['framePalettes']['3']['sha256'] == declaration['paletteSha256']
    for frame in [a, b]:
        assert sha(prepared / 'native' / frame['indexFile']) == declaration['indexSha256']

wanted = args.families or list(contract['families'])
assert wanted and len(wanted) == len(set(wanted)) and all(family in contract['families'] for family in wanted)
required = {name for family in wanted for name in contract['families'][family]['members']}
marker_frames = profile.get('nativePaletteMarkerFrames', {})
marker_keys = set()
for name, declaration in marker_frames.items():
    source = native[name]
    assert declaration['sourceSha256'] == source['sha256']
    marker_index, = declaration['indices']
    assert marker_index in (1, 6)
    if marker_index == 6:
        assert name == 'veins.tem'
        assert source['sha256'] == 'dffd763ba9ee242bb4b36c64f98f6d922917d38f70bb6e62c1936f2eda40aa16'
        assert declaration.get('classification') == 'NATIVE_SINGLE_INDEX_OVERLAY_MARKERS'
        assert set(map(int, declaration['frames'])) == set(range(source['totalFrames'] // 2))
        assert all(binding['kind'] == 'overlay' and binding['role'] == 'body'
                   and binding['nativeRules'].get('IsVeins', '').lower() == 'true'
                   for binding in source['bindings'])
    for number, expected_hash in declaration['frames'].items():
        frame = source['frames'][int(number)]
        assert frame['indexSha256'] == expected_hash
        file = prepared / 'native' / frame.get('indexFile', f'{name}-{number}.index')
        assert sha(file) == expected_hash
        indices = np.frombuffer(file.read_bytes(), np.uint8)
        assert marker_index in indices and set(indices).issubset({0, marker_index})
        if marker_index == 1:
            assert all(binding['role'] == 'ACTIVE' and int(number) > int(
                binding['nativeArt']['LoopEnd']) for binding in source['bindings'])
        marker_keys.add(f'{name}-{int(number):03d}')
slots = {key: info for key, info in work['slots'].items() if info['member'] in required}
batches = {batch['name'] + '-master.png': batch for batch in work['batches']}
overrides = json.loads((root / 'slot-overrides.json').read_text()) if (root / 'slot-overrides.json').exists() else {}
override_fields = {'alphaCutoff', 'board', 'boardSize', 'occupied', 'referenceRect', 'slotRect'}
for key, override in overrides.items():
    assert set(override).issubset(override_fields), (key, 'Unknown slot override fields',
                                                  sorted(set(override) - override_fields))
masters, plates, sampling = {}, {}, []
for key, original_info in slots.items():
    if (key in marker_keys or original_info['member'] in accepted_components
            or airport.owns(original_info['member'], original_info['nativeSlot'])):
        continue
    if original_info['nativeSlot'] == 3 and original_info['member'] in shared_rubble:
        continue
    if (original_info['nativeSlot'], 2) in body_reuse.get(original_info['member'], {}):
        continue
    info = {**original_info, **overrides.get(key, {})}
    file = root / info['board']
    assert file.exists(), f'Missing substantial authored state: {key}'
    if file not in masters:
        masters[file] = Image.open(file).convert('RGBA')
    batch = batches.get(info['board'])
    assert batch or 'occupied' in info, (key, 'Replacement boards require an explicit cell count')
    size = info.get('boardSize', batch['boardSize'] if batch else None)
    assert size
    occupied = info.get('occupied', len(batch['slots']) if batch else 1)
    rect, plate = register(masters[file], info, size, isolated=occupied == 1)
    available = capacity(rect, info['nativeBounds'])
    assert available >= 4, (key, available)
    plates[key] = plate
    sampling.append(dict(key=key, master=str(file), sha256=sha(file), sourceRect=rect,
                         nativeBounds=info['nativeBounds'], availableDensity=available))

particle_materials, particle_declarations = {}, {}
for name, declaration in profile.get('nativeDetachedParticleRegistration', {}).items():
    if name not in required:
        continue
    assert name == 'civ2.shp' and declaration['classification'] == 'AUTHORED_BRASS_NATIVE_SINGLE_PIXEL_COMPONENTS'
    assert declaration['sourceSha256'] == native[name]['sha256'] == 'a92dce1327c5b6f05e99a839f4beb5654796881ccade696a8076da1694f35b22'
    assert declaration['paletteSha256'] == native[name]['palette']['sha256']
    file = Path(declaration['master'])
    assert sha(file) == declaration['masterSha256']
    master = Image.open(file).convert('RGBA')
    assert list(master.size) == declaration['boardSize']
    rect, plate = register(master, dict(slotRect=[0, 0, *master.size], alphaCutoff=240),
                           master.size, isolated=True)
    assert min(plate.shape[:2]) >= 4
    particle_declarations[name] = {**declaration, 'masterRect': rect}
    particle_materials[name] = {density: independently_sample(plate, (density, density))
                                for density in [2, 4]}

muzzle_materials = {}
for name, declaration in profile.get('nativeMuzzleRegistration', {}).items():
    if name not in required:
        continue
    assert name in ('civ2.shp', 'civ3.shp', 'civa.shp', 'civb.shp', 'civc.shp')
    assert declaration['classification'] == 'AUTHORED_NATIVE_WHITE_MUZZLE_MATERIAL'
    assert declaration['sourceSha256'] == native[name]['sha256']
    assert declaration['paletteSha256'] == native[name]['palette']['sha256']
    assert declaration['paletteIndex'] == 240 and declaration['emissiveFloor'] == 235
    assert declaration['fireStart'] == (84 if name == 'civ3.shp' else 86)
    file = Path(declaration['master'])
    assert sha(file) == declaration['masterSha256']
    x, y, width, height = declaration['masterRect']
    master = Image.open(file).convert('RGBA')
    rect, plate = register(master, dict(slotRect=[x, y, width, height], alphaCutoff=240), master.size)
    muzzle_materials[name] = plate

accepted_subpixels, subpixel_evidence = {}, {}
for name, declaration in profile.get('nativeAcceptedSubpixelMaterials', {}).items():
    if name not in required:
        continue
    allowed = {'civsf.shp': '8f1bcf34f8acba998dad7077c1a51defff35e31c31082e743de47ebefd30bd8e',
               'civsfm.shp': 'fc8b75a2b7b10da6405e8692ad91ebcf884cb366dff93e5e0c49b14dae181dee',
               'civstm.shp': 'b5099d3c6de60ae44f16a8682a6564e5f0da0dcaacbfe800bbf2c7fba53ece71',
               'ssrv.shp': '1fa2284d5696988daba0acc1dc99209051f4bdf293f8de7680c49e11bb0f6ffa'}
    assert theater == ('URBAN' if name == 'ssrv.shp' else 'SNOW')
    assert native[name]['sha256'] == declaration['sourceSha256'] == allowed[name]
    assert declaration['paletteSha256'] == native[name]['palette']['sha256']
    pack_path, proof_path = Path(declaration['acceptedPackManifest']), Path(declaration['paletteProof'])
    assert sha(pack_path) == declaration['acceptedPackManifestSha256']
    assert sha(proof_path) == declaration['paletteProofSha256']
    accepted_pack = json.loads(pack_path.read_text())
    proof = json.loads(proof_path.read_text())['rows']
    temperate_palette = next(row for row in proof if row['member'] == 'unittem.pal')
    target_palette = next(row for row in proof if row['member'] == ('uniturb.pal' if theater == 'URBAN' else 'unitsno.pal'))
    assert target_palette['sha256'] == declaration['paletteSha256']
    assert temperate_palette['colors'] == target_palette['colors']
    accepted_subpixels[name] = {}
    for role, material in declaration['materials'].items():
        assert role in ('brass', 'white', 'red')
        path = Path(material['acceptedMemberManifest'])
        assert sha(path) == material['acceptedMemberManifestSha256']
        assert any(entry['sha256'] == material['acceptedMemberManifestSha256']
                   and (pack_path.parent / entry['path']).resolve() == path.resolve()
                   for family in accepted_pack['families'].values() for entry in family['members'])
        metadata = json.loads(path.read_text())
        assert metadata['source']['member'] == ('civb.shp' if role == 'red' else 'civ2.shp')
        field = {'brass': 'nativeDetachedParticleRegistration', 'white': 'nativeMuzzleRegistration',
                 'red': 'nativeFixedColorRegistration'}[role]
        accepted = metadata['color'][field]
        assert accepted['classification'] == material['role']
        witness = accepted['frames'][str(material['sourceFrame'])]['pixels']
        assert material['nativePixel'] in [point[:2] for point in witness]
        accepted_subpixels[name][role] = {}
        for density in (2, 4):
            entry = material['variants'][str(density)]
            image_path = Path(entry['file'])
            assert sha(image_path) == entry['sha256']
            variant = next(v for v in metadata['variants'] if v['density'] == density)
            frame = next(f for f in variant['frames'] if f['nativeFrame'] == material['sourceFrame'])
            page = next(p for p in variant['pages'] if p['id'] == frame['page'])
            assert page['baseSha256'] == entry['sha256']
            px, py = material['nativePixel']
            x, y, _, _ = frame['contentRect']
            assert entry['rect'] == [x + px * density, y + py * density, density, density]
            pixels = np.asarray(Image.open(image_path).convert('RGBA'))
            x, y, width, height = entry['rect']
            crop = pixels[y:y + height, x:x + width]
            assert crop.shape == (density, density, 4) and (crop[..., 3] == 255).all()
            accepted_subpixels[name][role][density] = crop[..., :3].copy()
    subpixel_evidence[name] = declaration

fixed_color_materials = {}
for name, declaration in profile.get('nativeFixedColorRegistration', {}).items():
    if name not in required:
        continue
    assert name == 'civb.shp'
    assert declaration['classification'] == 'AUTHORED_NATIVE_FIXED_RED_DETAIL_MATERIAL'
    assert declaration['sourceSha256'] == native[name]['sha256'] == '1b25f54be563e8d07f2a2237578036471d5238f52dd250902f8b1a5bec88b2e2'
    assert declaration['paletteSha256'] == native[name]['palette']['sha256']
    assert declaration['paletteIndex'] == 250 and declaration['nativeRgb'] == [188, 0, 0]
    assert declaration['fireStart'] == 86
    file = Path(declaration['master'])
    assert sha(file) == declaration['masterSha256']
    master = Image.open(file).convert('RGBA')
    assert list(master.size) == declaration['boardSize']
    x, y, width, height = declaration['masterRect']
    assert min(width, height) >= 4 and 0 <= x < x + width <= master.width
    assert 0 <= y < y + height <= master.height
    crop = np.asarray(master.crop((x, y, x + width, y + height)))
    assert (crop[..., 3] > 240).all()
    mean = crop[..., :3].mean((0, 1))
    assert mean[0] > 2 * max(mean[1:])
    gain = np.asarray(declaration['nativeRgb']) / np.maximum(mean, 1)
    fixed_color_materials[name] = {
        density: np.clip(independently_sample(crop[..., :3], (density, density)) * gain, 0, 255).astype(np.uint8)
        for density in [2, 4]}


def logical_frame(frame):
    return dict(nativeFrame=frame['slot'], trimOrigin=frame['origin'], trimSize=frame['size'],
                legacyRenderSize=[n + n % 2 for n in frame['size']], empty=frame['empty'])


fixed_parts = profile.get('fixedNativeParts', [])
fixed_canvases, fixed_indices = {}, {}
frame_tones = profile.get('nativeFrameTone', {})
tone_evidence = {}
stationary_terrain_rgb = {}


def native_canvas(name, number):
    key = name, number
    if key not in fixed_indices:
        source = native[name]
        frame = source['frames'][number]
        width, height = frame['size']
        file = prepared / 'native' / frame['indexFile']
        assert sha(file) == frame['indexSha256']
        indices = np.frombuffer(file.read_bytes(), np.uint8).reshape(height, width)
        canvas = np.zeros(tuple(reversed(source['canvas'])), np.uint8)
        x, y = frame['origin']
        canvas[y:y + height, x:x + width] = indices
        fixed_indices[key] = canvas
    return fixed_indices[key]


def register_fixed_parts(rgb, name, frame, density):
    for part in fixed_parts:
        if frame['slot'] not in part['targets'].get(name, []):
            continue
        canonical, number = part['canonicalMember'], part['canonicalFrame']
        source = native[canonical]
        assert source['sha256'] == part['canonicalSourceSha256']
        assert native[name]['canvas'] == source['canvas']
        assert native[name]['palette'] == source['palette']
        assert str(frame['slot']) not in contract['sources'][name].get('framePalettes', {})
        key = f'{canonical}-{number:03d}'
        selected = {**work['slots'][key], **overrides.get(key, {})}
        assert sha(root / selected['board']) == part['canonicalMasterSha256']
        if name == canonical and frame['slot'] == number:
            continue
        identity = key, density
        if identity not in fixed_canvases:
            canonical_frame = source['frames'][number]
            left, top, right, bottom = work['slots'][key]['nativeBounds']
            ox, oy = canonical_frame['origin']
            width, height = canonical_frame['size']
            rgb_frame = np.zeros((height * density, width * density, 3), np.uint8)
            rgb_frame[top * density:bottom * density, left * density:right * density] = independently_sample(
                plates[key], ((right - left) * density, (bottom - top) * density))
            if profile.get('nativeOwnerMaterialRegistration') and contract['sources'][canonical]['remapable']:
                rgba_file = prepared / 'native' / canonical_frame['file']
                assert sha(rgba_file) == canonical_frame['rgbaSha256']
                rgba = np.asarray(Image.frombytes('RGBA', (width, height), rgba_file.read_bytes()))
                index = native_canvas(canonical, number)[oy:oy + height, ox:ox + width]
                rgb_frame = register_owner_material(rgb_frame, rgba, index, density)[0]
            canvas = np.zeros((*[v * density for v in reversed(source['canvas'])], 3), np.uint8)
            canvas[oy * density:(oy + height) * density, ox * density:(ox + width) * density] = rgb_frame
            fixed_canvases[identity] = canvas
        original, target = native_canvas(canonical, number), native_canvas(name, frame['slot'])
        mask = (original == target) & (original > 31)
        stable_frames = part.get('stableNativeFrames')
        if stable_frames:
            assert canonical == name and name in {'caoild_a.shp', 'caairp_a.shp'}
            assert part.get('includeNativeOwnerAndFixedPalette') is True
            allowed_ranges = [list(range(32)), list(range(32, 64))] if name == 'caoild_a.shp' else [list(range(10))]
            assert stable_frames in allowed_ranges
            assert number == stable_frames[0] and part['targets'][name] == stable_frames
            mask = (original == target) & (original != 0) & (original != 12)
            for candidate in stable_frames:
                mask &= native_canvas(name, candidate) == original
        x, y, width, height = part['nativeCanvasRect']
        region = np.zeros(mask.shape, bool)
        region[y:y + height, x:x + width] = True
        mask &= region
        assert mask.any(), ('No exact fixed native region', name, frame['slot'])
        ox, oy = frame['origin']
        width, height = frame['size']
        mask = np.repeat(np.repeat(mask[oy:oy + height, ox:ox + width], density, 0), density, 1)
        canonical_rgb = fixed_canvases[identity][oy * density:(oy + height) * density,
                                               ox * density:(ox + width) * density]
        rgb[mask] = canonical_rgb[mask]
    return rgb


def pixels(name, slot, density):
    reused = body_reuse.get(name, {}).get((slot['slot'], density))
    if reused is not None:
        return tuple(image.copy() for image in reused)
    if slot['slot'] == 3 and name in shared_rubble:
        canonical = shared_rubble[name]['canonicalMember']
        canonical_member, = [row for row in work['members'] if row['member'] == canonical]
        canonical_slot, = [row for row in canonical_member['slots'] if row['slot'] == 3]
        result = pixels(canonical, canonical_slot, density)
        tone_evidence[name, 3, density] = dict(tone_evidence[canonical, 3, density])
        return result
    frame = native[name]['frames'][slot['slot']]
    width, height = frame['size']
    logical = logical_frame(frame)
    rw, rh = [n * density for n in logical['legacyRenderSize']]
    base, data = np.zeros((rh, rw, 4), np.uint8), np.zeros((rh, rw, 4), np.uint8)
    data[..., 3] = 255
    if frame['empty']:
        return base, data
    file = prepared / 'native' / frame.get('indexFile', f'{name}-{frame["slot"]}.index')
    assert sha(file) == frame['indexSha256']
    index = np.frombuffer(file.read_bytes(), np.uint8).reshape(height, width)
    enlarged = np.repeat(np.repeat(index, density, 0), density, 1)
    active, body = enlarged != 0, (enlarged != 0) & (enlarged != 12)
    base[:height * density, :width * density, 3] = active.astype(np.uint8) * 255
    key = slot.get('key')
    marker = f'{name}-{frame["slot"]:03d}' in marker_keys
    if name in accepted_components:
        base[:height * density, :width * density, :3] = flag_frame_material(accepted_components[name], frame, density)
    elif airport.owns(name, frame['slot']):
        base[:height * density, :width * density, :3] = airport.frame_rgb(frame, density)
    elif key and not marker:
        info = work['slots'][key]
        left, top, right, bottom = info['nativeBounds']
        sampled = independently_sample(plates[key], ((right - left) * density, (bottom - top) * density))
        base[top * density:bottom * density, left * density:right * density, :3] = sampled
    else:
        assert marker or slot['status'] == 'EXACT_NATIVE_CONTACT_ONLY'
        assert marker or not body.any()
    # Index 12 is a native negligible contact/shadow patch, never authored body.
    ground = enlarged == 12
    original_file = prepared / 'native' / frame['file']
    assert sha(original_file) == frame['rgbaSha256']
    frame_palette = contract['sources'][name].get('framePalettes', {}).get(str(frame['slot']))
    if frame_palette:
        palette_file = prepared / 'native' / frame_palette['member']
        if not palette_file.exists():
            palette_file = prepared / 'native' / (frame_palette['sha256'] + '.pal')
        assert sha(palette_file) == frame_palette['sha256']
        palette = np.frombuffer(palette_file.read_bytes(), np.uint8).reshape(256, 3) * 4
        original = palette[enlarged]
    else:
        original = np.asarray(Image.frombytes('RGBA', (width, height), original_file.read_bytes()).resize(
            (width * density, height * density), Image.Resampling.NEAREST))
    rgb = base[:height * density, :width * density, :3]
    if marker:
        rgb[:] = original[..., :3]
    original_native = np.asarray(Image.frombytes('RGBA', (width, height), original_file.read_bytes()))
    thin_metal = profile.get('nativeThinMetalRegistration', {}).get(name)
    if thin_metal:
        assert thin_metal['shadeGate'] == dict(nativeLuminanceThreshold=110, exponent=1.6,
                                              authoredMetalExposure=1.5)
        assert name == 'ctfncp.shp' and native[name]['sha256'] == thin_metal['sourceSha256']
        assert native[name]['sha256'] == '1d0d4d6dd112ef7e229ab9f690c23de5f57ff64d92c142f3a18d797e68dfb72f'
        assert native[name]['palette']['sha256'] == thin_metal['paletteSha256']
        assert thin_metal['frames'][str(frame['slot'])] == frame['indexSha256']
        assert not contract['sources'][name]['remapable'] and not frame_palette
        rgb[:] = register_thin_metal(rgb, original_native, index, density)
    if profile.get('mineralRegistration') and name.startswith(('tib', 'gem')):
        rgb[:] = register_minerals(rgb, original_native, density)
    if swatch is not None and name.startswith('lobrdb'):
        rgb[:] = register_bridge(rgb, original_native, index, density, swatch, profile['bridgeAsphaltMean'],
                                 continuous=profile.get('bridgeContinuousAsphalt', False))
    if profile.get('tree14NativeTone') and name == 'tree14.tem' or name in profile.get('nativeTreeToneMembers', []):
        rgb[:] = register_tree_tone(rgb, original_native, index, density,
                                   strength=profile.get('nativeTreeToneStrength', .75))
    tone = frame_tones.get(name, {}).get(str(frame['slot']))
    if tone:
        assert frame_palette and frame_palette['remapable'] is False
        assert tone == dict(sourceSha256=native[name]['sha256'],
                            indexSha256=frame['indexSha256'], paletteSha256=frame_palette['sha256'])
        rgb[:], proof = register_frame_tone(rgb, original[::density, ::density], index, density)
        tone_evidence[name, frame['slot'], density] = proof
    if name not in accepted_components and profile.get('nativeOwnerMaterialRegistration') and (frame_palette or contract['sources'][name])['remapable']:
        rgb[:] = register_owner_material(rgb, original_native, index, density)[0]
    stationary = profile.get('nativeStationaryTerrainFrames', {}).get(name)
    if stationary:
        allowed = {
            'tibtre02.urb': '0a9218d1c55745b98c7cfe6ca4e02cf730ea00c40bae43eac0b298e6045df47c',
            'tibtre03.urb': '0a9218d1c55745b98c7cfe6ca4e02cf730ea00c40bae43eac0b298e6045df47c',
        }
        assert native[name]['sha256'] == stationary['sourceSha256'] == allowed[name]
        assert stationary['frames'] == {str(i): native[name]['frames'][i]['indexSha256'] for i in range(11)}
        assert stationary['paletteSha256'] == native[name]['palette']['sha256']
        assert stationary['policy'] == 'Exact native indices stable across all 11 frames; preserve authored sparks elsewhere'
        assert frame['slot'] in range(11) and frame_palette['remapable'] is False
        canonical = native[name]['frames'][0]
        assert all(other['origin'] == canonical['origin'] and other['size'] == canonical['size']
                   for other in native[name]['frames'][:11])
        x, y = frame['origin']
        reference = native_canvas(name, 0)
        stable = (reference != 0) & (reference != 12)
        for number in range(1, 11):
            stable &= native_canvas(name, number) == reference
        stable = np.repeat(np.repeat(stable[y:y + height, x:x + width], density, 0), density, 1)
        identity = name, density
        if frame['slot'] == 0:
            assert identity not in stationary_terrain_rgb
            stationary_terrain_rgb[identity] = rgb.copy()
        else:
            rgb[stable] = stationary_terrain_rgb[identity][stable]
    if fixed_parts:
        rgb[:] = register_fixed_parts(rgb, name, frame, density)
    rgb[:] = airport.fixed_body_paving(rgb, name, frame, density)
    reused = subpixel_evidence.get(name, {}).get('frames', {}).get(str(frame['slot']))
    if reused:
        assert (86 <= frame['slot'] < 134 or name == 'ssrv.shp' and 182 <= frame['slot'] < 230)
        assert reused['indexSha256'] == frame['indexSha256']
        for role, points in reused['points'].items():
            for px, py, expected_index in points:
                assert index[py, px] == expected_index
                assert expected_index in ({179, 180, 184} if role == 'brass' else {240} if role == 'white' else {250})
                if role == 'brass':
                    region = index[max(0, py - 1):py + 2, max(0, px - 1):px + 2]
                    assert int(((region != 0) & (region != 12)).sum()) == 1
                rgb[py * density:(py + 1) * density, px * density:(px + 1) * density] = accepted_subpixels[name][role][density]
    particles = particle_declarations.get(name, {}).get('frames', {}).get(str(frame['slot']))
    if particles:
        assert 86 <= frame['slot'] < 134 and particles['indexSha256'] == frame['indexSha256']
        for px, py, expected_index in particles['pixels']:
            assert expected_index in (179, 180) and index[py, px] == expected_index
            region = index[max(0, py - 1):py + 2, max(0, px - 1):px + 2]
            assert int(((region != 0) & (region != 12)).sum()) == 1
            rgb[py * density:(py + 1) * density, px * density:(px + 1) * density] = particle_materials[name][density]
    muzzle = profile.get('nativeMuzzleRegistration', {}).get(name, {})
    muzzle_frame = muzzle.get('frames', {}).get(str(frame['slot']))
    if muzzle_frame:
        assert muzzle['fireStart'] <= frame['slot'] < muzzle['fireStart'] + 48
        assert muzzle_frame['indexSha256'] == frame['indexSha256']
        ys, xs = np.where(index == 240)
        assert muzzle_frame['pixels'] == [[int(x), int(y)] for x, y in zip(xs, ys)]
        left, top, right, bottom = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
        material = independently_sample(muzzle_materials[name],
                                       (int(right - left) * density, int(bottom - top) * density))
        material = (235 + material.astype(np.float64) * (20 / 255)).astype(np.uint8)
        mask = enlarged[top * density:bottom * density, left * density:right * density] == 240
        rgb[top * density:bottom * density, left * density:right * density][mask] = material[mask]
    fixed_color = profile.get('nativeFixedColorRegistration', {}).get(name, {})
    if fixed_color and 86 <= frame['slot'] < 134:
        ys, xs = np.where(index == 250)
        declaration = fixed_color['frames'].get(str(frame['slot']))
        assert bool(declaration) == bool(len(xs))
        if declaration:
            assert declaration == dict(indexSha256=frame['indexSha256'],
                                       pixels=[[int(x), int(y)] for x, y in zip(xs, ys)])
            assert (original_native[ys, xs, :3] == fixed_color['nativeRgb']).all()
            for px, py in declaration['pixels']:
                rgb[py * density:(py + 1) * density, px * density:(px + 1) * density] = fixed_color_materials[name][density]
    fragments = profile.get('nativePreservedFragments', {}).get(name)
    if fragments and frame['slot'] == fragments['nativeFrame']:
        assert fragments['schema'] == 'source-pinned-microscopic-rubble-fragments-v1'
        assert fragments['sourceSha256'] == native[name]['sha256']
        assert fragments['indexSha256'] == frame['indexSha256']
        assert frame_palette and frame_palette['remapable'] is False
        assert fragments['paletteSha256'] == frame_palette['sha256']
        left, top, right, bottom = fragments['authoredMainBounds']
        assert work['slots'][key]['nativeBounds'] == [left, top, right, bottom]
        detached = (index != 0) & (index != 12)
        detached[top:bottom, left:right] = False
        ys, xs = np.where(detached)
        assert fragments['pixels'] == [[int(x), int(y), int(index[y, x])] for x, y in zip(xs, ys)]
        assert 0 < len(xs) <= 8
        for px, py, value in fragments['pixels']:
            local = detached[max(0, py - 1):py + 2, max(0, px - 1):px + 2]
            assert local.sum() <= 2
            rgb[py * density:(py + 1) * density, px * density:(px + 1) * density] = palette[value]
    base[:height * density, :width * density, :3][ground] = original[..., :3][ground]
    if (frame_palette or contract['sources'][name])['remapable']:
        owner = (enlarged >= 16) & (enlarged <= 31) & body
        data[:height * density, :width * density, 0][owner] = 255
        data[:height * density, :width * density, 1][owner] = enlarged[owner] - 16
    base[..., :3][base[..., 3] == 0] = 0
    if (coverage_policy or name in terrain_contours) and not marker:
        if name in terrain_contours:
            assert not coverage_policy and theater == 'NEWURBAN'
            assert terrain_contours[name]['schema'] == 'source-pinned-terrain-contours-v1'
            assert terrain_contours[name]['sourceSha256'] == native[name]['sha256']
            assert all(binding['kind'] == 'terrain' for binding in native[name]['bindings'])
        else:
            assert all(binding['kind'] == 'building' for binding in native[name]['bindings'])
        base, data = register_contours(base, data, index, density,
            (frame_palette or contract['sources'][name])['remapable'])
        if tone:
            tone_evidence[name, frame['slot'], density]['outputMean'] = rgb[body].mean(0).tolist()
    base = airport.freeze_registered_pedestal(base, name, frame, density)
    return base, data


destination = Path('.local/environment-packs') / args.revision
destination.mkdir(parents=True, exist_ok=False)
evidence = root / args.revision
evidence.mkdir(exist_ok=False)
pack = dict(schema='environment-shp-pack-v1', theater=theater, editions=['ra2', 'yr'],
            revision=args.revision, families={})
member_records, allocation = {}, {'2': 0, '4': 0}
for member in work['members']:
    name = member['member']
    if name not in required:
        continue
    pinned = contract['sources'][name]
    assert pinned['sha256'] == native[name]['sha256'] == member['sourceSha256']
    logical = [logical_frame(frame) for frame in native[name]['frames'][:member['bodyCount']]]
    stem = name.replace('.', '-')
    if args.source_hash_paths:
        stem += '-' + pinned['sha256']
    folder = destination / 'members' / stem
    folder.mkdir(parents=True)
    hd = dict(schemaVersion=2, packId='environment-' + stem.replace('_', '-'), packRevision=args.revision,
              source=dict(member=name, sha256=pinned['sha256'], theater=theater, kind='resolved-shp-member'),
              logical=dict(canvas=native[name]['canvas'], frames=logical),
              color=dict(representation='authored-sRGB-RGBA8-plus-RGBA8-data'), variants=[])
    if coverage_policy:
        hd['color']['structuralCoverage'] = coverage_policy
    if name in terrain_contours:
        hd['color']['terrainStructuralCoverage'] = terrain_contours[name]
    if name in component_evidence:
        hd['color']['acceptedNativeComponentMaterial'] = component_evidence[name]
    if name in shared_rubble:
        hd['color']['sharedNativeRubbleFrame'] = shared_rubble[name]
    if name in body_reuse:
        hd['color']['acceptedNativeBodyFrames'] = profile['acceptedNativeBodyFrames'][name]
    if airport.declaration and name in {'cdairp.shp', 'cdairp_a.shp'}:
        hd['color']['nativeDesertAirportMotion'] = airport.declaration
    if name in profile.get('nativePreservedFragments', {}):
        hd['color']['nativePreservedFragments'] = profile['nativePreservedFragments'][name]
    if name in marker_frames:
        hd['color']['nativePaletteMarkerFrames'] = marker_frames[name]
    if name in profile.get('nativeThinMetalRegistration', {}):
        hd['color']['nativeThinMetalRegistration'] = profile['nativeThinMetalRegistration'][name]
    if name in particle_declarations:
        hd['color']['nativeDetachedParticleRegistration'] = particle_declarations[name]
    if name in subpixel_evidence:
        hd['color']['nativeAcceptedSubpixelMaterials'] = subpixel_evidence[name]
    if name in muzzle_materials:
        hd['color']['nativeMuzzleRegistration'] = profile['nativeMuzzleRegistration'][name]
    if name in fixed_color_materials:
        hd['color']['nativeFixedColorRegistration'] = profile['nativeFixedColorRegistration'][name]
    reused_parts = [part for part in fixed_parts if name in part['targets']]
    if reused_parts:
        hd['color']['fixedNativeParts'] = reused_parts
    if name in profile.get('nativeStationaryTerrainFrames', {}):
        hd['color']['nativeStationaryTerrainFrames'] = profile['nativeStationaryTerrainFrames'][name]
    if (name.startswith(('wb01x', 'wb04x')) or name in profile.get('waterfallMembers', [])) and profile.get('waterfallOpacity'):
        hd['color']['visualOpacity'] = profile['waterfallOpacity']
    for density in [2, 4]:
        images, declarations, pages = {}, [], []
        width = page_width(logical, member['slots'], density)
        x, y, row, page_index = 2, 2, 0, 0
        placements = []
        def flush():
            # A wrapped next row may already lie beyond this page's boundary.
            height = max([4, *[py + images[entry][0].shape[0] + 2
                               for entry, (_, py) in placements]])
            base, data = np.zeros((height, width, 4), np.uint8), np.zeros((height, width, 4), np.uint8)
            data[..., 3] = 255
            for entry, (px, py) in placements:
                b, d = images[entry]
                bh, bw = b.shape[:2]
                if bw and bh:
                    padded = np.pad(b, ((2, 2), (2, 2), (0, 0)), mode='edge')
                    padded[..., 3] = 0
                    padded[2:bh + 2, 2:bw + 2] = b
                    base[py - 2:py + bh + 2, px - 2:px + bw + 2] = padded
                    data[py:py + bh, px:px + bw] = d
            page_id = f'p{page_index}'
            target = folder / str(density) / page_id
            target.mkdir(parents=True)
            page = dict(id=page_id, size=[width, height])
            for role, pixels_array in [('base', base), ('data', data)]:
                file = target / f'{role}.png'
                Image.fromarray(pixels_array).save(file)
                page[role] = f'{density}-{page_id}-{role}.png'
                page[role + 'Sha256'] = sha(file)
                page[role + 'Bytes'] = file.stat().st_size
            pages.append(page)
            allocation[str(density)] += width * height * 8
        for slot in member['slots']:
            n = slot['slot']
            frame = logical[n]
            if slot['status'] == 'EXACT_NATIVE_DUPLICATE':
                canonical = declarations[slot['canonical']]
                declarations.append({**canonical, 'nativeFrame': n, 'sharedWith': slot['canonical']})
                continue
            images[n] = pixels(name, slot, density)
            rw, rh = [v * density for v in frame['legacyRenderSize']]
            if x + rw + 2 > width:
                x, y, row = 2, y + row + 4, 0
            if y + rh + 2 > 2048:
                flush()
                x, y, row, page_index, placements = 2, 2, 0, page_index + 1, []
            assert rw + 4 <= width and rh + 4 <= 2048
            declarations.append(dict(nativeFrame=n, page=f'p{page_index}', sampleRect=[x, y, rw, rh],
                                     contentRect=[x, y, *[v * density for v in frame['trimSize']]]))
            placements.append((n, (x, y)))
            x += rw + 4
            row = max(row, rh)
        flush()
        assert len(pages) <= 8 and len(declarations) == member['bodyCount']
        variant = dict(density=density, pages=pages, frames=declarations)
        proofs = {str(number): proof for (member_name, number, d), proof in tone_evidence.items()
                  if member_name == name and d == density}
        if proofs:
            hd['color']['nativeFrameTone'] = frame_tones[name]
            variant['nativeFrameToneEvidence'] = proofs
        hd['variants'].append(variant)
    file = folder / 'manifest.json'
    file.write_text(json.dumps(hd, separators=(',', ':')) + '\n')
    member_records[name] = dict(member=name, sha256=sha(file), path=f'members/{stem}/manifest.json')
for family in wanted:
    declared = contract['families'][family]
    pack['families'][family] = dict(familyHash=declared['familyHash'],
                                  members=[member_records[name] for name in declared['members']])
(destination / 'manifest.json').write_text(json.dumps(pack, separators=(',', ':')) + '\n')
pointer = dict(schemaVersion=1, revision=args.revision, sha256=sha(destination / 'manifest.json'))
recipe = dict(schema=args.schema, pack=pointer, families=wanted, members=len(required),
              memberPathPolicy='original-member-and-source-sha256' if args.source_hash_paths else 'original-member',
              independentDensities=[2, 4], actualSampling=sampling,
              nativePolicy='Exact native body-slot coverage, geometry and frame order; native separate shadows are unchanged',
              emptyDuplicateContactSlots='Explicit native empty, byte-identical duplicate and index-12 contact-only policies',
              ownerPolicy='Pinned native owner-index regions and shade identity; Original palette behavior retained',
              decodedInputBytes=allocation, runtimeAcceptance=False, wholeMapComplete=False)
recipe['materialProfile'] = profile
recipe['preservedNativePaletteMarkers'] = sorted(marker_keys & set(slots))
(evidence / 'recipe.json').write_text(json.dumps(recipe, indent=2) + '\n')
print(json.dumps(dict(pack=pointer, families=len(wanted), members=len(required), decodedInputBytes=allocation)))
