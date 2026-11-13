"""Verify source closure, geometry, palettes, owner data and independent HD states."""
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from pyramid_art import read_spec as pyramid_spec
from owner_paint import owner_paint_declaration, owner_red_candidates, limit_owner_region

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_body_reuse import accepted_body_frames

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('stage', type=Path)
args = parser.parse_args()
stage = args.stage.resolve()
read = lambda file: json.loads(file.read_text())
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
original, preparation = read(stage / 'prepared/source.json'), read(stage / 'preparation.json')
assert original['edition'] == 'yr'
for item in preparation.get('stages', [dict(preparation=preparation)]):
    receipt = item['preparation']
    recipe_file = Path(receipt['recipe'])
    assert sha(recipe_file) == receipt['recipeSha256']
    recipe = read(recipe_file)
    if 'baseRecipe' in recipe:
        reference = recipe['baseRecipe']
        base_file = Path(reference['file'])
        assert sha(base_file) == reference['sha256']
        inherited = read(base_file)
        assert 'baseRecipe' not in inherited, 'Keep recipe inheritance one level deep'
        recipe = {**inherited, **recipe}
    assert sha(Path(recipe['source'])) == recipe['sourceJsonSha256']
    assert sha(Path(recipe['authorization']['file'])) == recipe['authorization']['sha256']
    pinned = read(Path(recipe['source']))
    assert pinned['missionSha256'] == original['missionSha256']
    for source in pinned['sources']:
        assert sha(Path(recipe['source']).parent / 'native' / source['member']) == source['sha256']
        for frame in source['frames']:
            assert sha(Path(recipe['source']).parent / 'native' / f"{source['member']}-{frame['slot']}.index") == frame['indexSha256']
contract, pack = read(stage / 'contract.json'), read(stage / 'pack/manifest.json')
identity, family = next(iter(pack['families'].items()))
declared = contract['families'][identity]
assert declared['familyHash'] == family['familyHash']
assert sorted(row['member'] for row in family['members']) == declared['members']
sources = {source['member']: source for source in original['sources']}
profile = read(stage / 'material-profile.json')
accepted = accepted_body_frames(profile, sources)
architectures = profile.get('sourcePinnedPyramid', {})
for name, declaration in architectures.items():
    pyramid_spec(declaration, sources[name])
counts = dict(families=1, members=len(family['members']), densityFrames=0, pages=0, ownerStates=0,
    neutralStates=0, unusedMarkerDensityFrames=0, nativeSeparateShadowFrames=0, preservedAcceptedDensityFrames=0)
allocation = {2: 0, 4: 0}
for member in family['members']:
    source = sources[member['member']]
    for frame in source['frames']:
        assert sha(stage / 'prepared/native' / frame['indexFile']) == frame['indexSha256']
        assert sha(stage / 'prepared/native' / frame['file']) == frame['rgbaSha256']
    if source['hasShadow']:
        assert source['totalFrames'] == source['bodyFrames'] * 2
        counts['nativeSeparateShadowFrames'] += source['bodyFrames']
    metadata_file = stage / 'pack' / member['path']
    assert sha(metadata_file) == member['sha256']
    metadata = read(metadata_file)
    assert re.fullmatch(r'[a-z0-9-]+', metadata['packId'])
    assert re.fullmatch(r'[a-zA-Z0-9.-]+', metadata['packRevision'])
    if source['member'] in profile.get('sourcePinnedAuthoredScenery', {}):
        declaration = profile['sourcePinnedAuthoredScenery'][source['member']]
        assert metadata['color']['authoredScenery']['declaration'] == declaration
        assert declaration['sourceSha256'] == source['sha256']
        assert declaration['paletteSha256'] == source['palette']['sha256']
        assert declaration['indexSha256'] == source['frames'][0]['indexSha256']
        assert source['bodyFrames'] == 1 and source['totalFrames'] == 2 and not source['remapable']
        allowed = ['terrain']
        if source['identity'] in ['TROCK03', 'SROCK05'] and source.get('nativeObjectType') == 4:
            allowed.append('overlay')
        assert all(binding['kind'] in allowed for binding in source['bindings'])
        assert metadata['color']['authoredScenery']['inspection']['independentDensityCapacity'] >= 4
    if member['member'] in architectures:
        assert metadata['color']['authoredBody']['architecture']['file'] == architectures[member['member']]['file']
        assert metadata['color']['authoredBody']['architecture']['sha256'] == architectures[member['member']]['sha256']
    assert metadata['source'] == dict(member=source['member'], sha256=source['sha256'],
        theater=original['theater'], kind='resolved-shp-member')
    assert metadata['logical']['canvas'] == source['canvas']
    assert metadata['logical']['frames'] == [dict(nativeFrame=frame['slot'], trimOrigin=frame['origin'],
        trimSize=frame['size'], legacyRenderSize=[value + value % 2 for value in frame['size']], empty=frame['empty'])
        for frame in source['frames'][:source['bodyFrames']]]
    assert [variant['density'] for variant in metadata['variants']] == [2, 4]
    for variant in metadata['variants']:
        density = variant['density']
        assert len(variant['pages']) <= 8
        assert [frame['nativeFrame'] for frame in variant['frames']] == list(range(source['bodyFrames']))
        for page in variant['pages']:
            images = {}
            for role in ['base', 'data']:
                file = metadata_file.parent / str(density) / page['id'] / (role + '.png')
                assert sha(file) == page[role + 'Sha256'] and file.stat().st_size == page[role + 'Bytes']
                images[role] = Image.open(file).convert('RGBA')
                assert list(images[role].size) == page['size'] and max(page['size']) <= 2048
            data = np.array(images['data'])
            rectangles = []
            for frame in [row for row in variant['frames'] if row['page'] == page['id']]:
                slot = frame['nativeFrame']
                native, geometry = source['frames'][slot], metadata['logical']['frames'][slot]
                x, y, width, height = frame['sampleRect']
                assert [width, height] == [value * density for value in geometry['legacyRenderSize']]
                assert frame['contentRect'] == [x, y, *[value * density for value in geometry['trimSize']]]
                assert min(x, y) >= 2 and x + width + 2 <= page['size'][0] and y + height + 2 <= page['size'][1]
                for a, b, w, h, previous_slot in rectangles:
                    if x + width <= a or a + w <= x or y + height <= b or b + h <= y:
                        continue
                    previous = source['frames'][previous_slot]
                    assert (x, y, width, height) == (a, b, w, h), 'Only a complete identical sample can be shared'
                    assert all(native[key] == previous[key] for key in ['size', 'empty', 'indexSha256'])
                    current_palette = source.get('framePalettes', {}).get(str(slot), source['palette'])
                    previous_palette = source.get('framePalettes', {}).get(str(previous_slot), source['palette'])
                    assert current_palette == previous_palette, 'Shared samples need identical original materials'
                rectangles.append((x, y, width, height, slot))
                crop = images['base'].crop((x, y, x + width, y + height))
                full = Image.open(stage / f'frames-{density}x' / source['member'] / f'{slot:03d}.png').convert('RGBA')
                assert list(full.size) == [value * density for value in source['canvas']]
                left, top = [value * density for value in geometry['trimOrigin']]
                assert full.crop((left, top, left + width, top + height)).tobytes() == crop.tobytes()
                alpha = np.array(crop.getchannel('A'))
                indices = np.frombuffer((stage / 'prepared/native' / native['indexFile']).read_bytes(), np.uint8)
                pal = source.get('framePalettes', {}).get(str(slot), source['palette'])
                owner = pal.get('remapable', source['remapable']) and np.any((indices >= 16) & (indices <= 31))
                mask = data[y:y + height, x:x + width, 0]
                owner_paint = profile.get('sourcePinnedAuthoredOwnerPaint', {}).get(source['member'])
                if owner_paint:
                    declaration = owner_paint if owner_paint['schema'] == 'yr-source-pinned-owner-region-v2' else {
                        key: owner_paint[key] for key in ['schema', 'maximumNeutralChannelFraction']}
                    assert owner_paint == owner_paint_declaration(source, declaration)
                    assert metadata['color']['authoredBody']['ownerPaint'] == owner_paint
                    assert not ((mask > 0) & ~owner_red_candidates(np.array(crop), owner_paint)).any()
                    assert np.array_equal(mask > 0, limit_owner_region(mask > 0,
                        indices.reshape(native['size'][::-1]), density, owner_paint))
                retained = accepted.get(source['member'], {}).get((slot, density))
                if retained is not None:
                    assert np.array_equal(np.array(crop), retained[0])
                    assert np.array_equal(data[y:y + height, x:x + width], retained[1])
                    counts['preservedAcceptedDensityFrames'] += 1
                else:
                    material = data[y:y + height, x:x + width]
                    assert set(material[..., 0].ravel()).issubset({0, 255}) and not material[..., 2].any()
                    assert np.all(material[..., 3] == 255) and material[..., 1].max() <= 15
                assert bool(alpha.any()) != native['empty'], 'Retain the original visible/empty display state'
                if owner:
                    assert mask.any()
                    counts['ownerStates'] += 1
                else:
                    assert not mask.any()
                    counts['neutralStates'] += 1
                markers = metadata['color']['authoredBody'].get('unusedMarkers')
                if markers and str(slot) in markers['frames']:
                    assert source['bindingRole'] == 'ACTIVE' and int(source['nativeArt']['LoopCount']) == -1
                    assert slot >= int(source['nativeArt']['LoopEnd']) and set(indices).issubset({0, 1})
                    counts['unusedMarkerDensityFrames'] += 1
                elif retained is None:
                    assert ((alpha > 0) & (alpha < 255)).any(), 'Authored contours require actual antialias coverage'
                counts['densityFrames'] += 1
            allocation[density] += page['size'][0] * page['size'][1] * 8
            counts['pages'] += 1
audit = read(stage / 'sampling-audit.json')
assert {int(key): value for key, value in audit['unpooledRgbaBytes'].items()} == allocation
assert all(row['independentDensityCapacity'] >= 4 for row in audit['frames'])
assert counts['densityFrames'] == sum(source['bodyFrames'] * 2 for source in sources.values())
report = dict(status='PASS', sha256=sha(stage / 'pack/manifest.json'), counts=counts,
    independentDensities=[2, 4], unpooledRgbaBytes=allocation, nativeGeometryAndStateTimingUnchanged=True,
    nativeSeparateShadowsUnchanged=True, userVisualAcceptance='PENDING', nativeRuntime='PENDING')
(stage / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
