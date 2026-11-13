"""Verify new terrain closure, native metadata/coverage and exact accepted atlas reuse."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from showcase_registration import extrude, matte, sha
from showcase_shore import load_shore, render_shore
from showcase_coastal_beach import load_coastal_beach
from showcase_accepted_roads import load_accepted_roads, render_accepted_road
from showcase_coastal_sea import load_coastal_sea, coastal_sea_pixels, coastal_sea_weight
from showcase_snow_scope import admit_snow_scope
from showcase_snow_road_contacts import load as load_snow_road_ports
from showcase_snow_road_contacts import load_material_light as load_snow_road_light
from showcase_snow_road_material import load_earth_material
from showcase_temperate_road_contacts import load as load_temperate_roads
from showcase_reconstruction import (POLICY as CONTOUR_POLICY, COHERENT_POLICY, ROCK_POLICY, SNOW_GROUND_POLICY,
                                    coherent_extra_alpha, native_member_mask, verify_extra_alpha)

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('revision')
parser.add_argument('--root', type=Path, default=Path('.artifacts/m2-2/authoring-tmp-v2'))
parser.add_argument('--prepared', type=Path, default=Path('.artifacts/m2-2/prepared-native-v2'))
parser.add_argument('--receipt', type=Path, help='Retain a separate immutable revalidation receipt')
args = parser.parse_args()
root, pack = args.root, Path('.local/terrain-packs') / args.revision
recipe = json.loads((root / args.revision / 'recipe.json').read_text())
assert recipe['pack']['sha256'] == sha(pack / 'manifest.json')
manifest = json.loads((pack / 'manifest.json').read_text())
base_root = Path('.local/terrain-packs') / recipe['acceptedBase']['revision']
assert sha(base_root / 'manifest.json') == recipe['acceptedBase']['sha256']
base = json.loads((base_root / 'manifest.json').read_text())
replaced = recipe.get('authorizedReplacementGroups', [])
if replaced:
    ids = {group['id'] for group in replaced}
    assert len(ids) == len(replaced)
    assert [dict(id=group['id'], members=[member['member'] for member in group['members']],
                 variants=group['variants']) for group in base['groups'] if group['id'] in ids] == replaced
    base['groups'] = [group for group in base['groups'] if group['id'] not in ids]
base_count = len(base['groups'])
assert manifest['groups'][:base_count] == base['groups']
for group in base['groups']:
    for variant in group['variants']:
        assert sha(base_root / variant['file']) == sha(pack / variant['file']) == variant['sha256']
source = json.loads((root / 'source.json').read_text())
snow_ground = recipe.get('materialProfile', {}).get('sourcePinnedSnowRampGroundContacts')
if snow_ground:
    assert source['theater'] == 'SNOW' and source['editions'] == ['yr']
    assert recipe['materialProfile'].get('sourcePinnedSnowRampContours')
    assert recipe['materialProfile'].get('authoredSurfaceReconstruction')
if source['theater'] == 'SNOW' and recipe.get('materialProfile', {}).get('authoredSurfaceReconstruction'):
    profile = recipe['materialProfile']
    contract, contour_key, _ = admit_snow_scope(profile, source)
    if snow_ground:
        ground_contract = json.loads((Path(__file__).resolve().parents[2] / 'docs/campaign-art/yr-v1'
            / 'terrain-snow-large-ramps-ground-contact-contract-r2.json').read_text())
        assert ground_contract['schema'] == 'yr-source-pinned-snow-large-ramp-ground-contacts-v1'
        assert ground_contract['setIndex'] == 77
        assert contour_key == 'sourcePinnedSnowRampContours' and ground_contract['members'] == contract['members']
        assert ground_contract['palette'] == contract['palette'] and ground_contract['policy'] == SNOW_GROUND_POLICY
        assert snow_ground == dict(policy=SNOW_GROUND_POLICY, members=contract['members'])
shore_geometry, shore_plates, shore_water, shore_land, _ = load_shore(recipe.get('materialProfile', {}), source, root)
coastal_masks, coastal_water = load_coastal_sea(recipe.get('materialProfile', {}), source, root)
load_coastal_beach(recipe.get('materialProfile', {}), source, root)
accepted_road_geometry, accepted_road_materials, _ = load_accepted_roads(recipe.get('materialProfile', {}), source, root)
snow_road_ports = load_snow_road_ports(recipe.get('materialProfile', {}), source, root)
load_snow_road_light(recipe.get('materialProfile', {}), source)
load_earth_material(recipe.get('materialProfile', {}), source)
load_temperate_roads(recipe.get('materialProfile', {}), source, root)
shore_outputs = {}
accepted_road_outputs = {}
source_editions = source.get('editions', ['ra2', 'yr'])
assert source_editions and len(set(source_editions)) == len(source_editions)
assert set(source_editions) <= {'ra2', 'yr'}
if source['theater'] == 'LUNAR':
    assert source_editions == ['yr']
    assert manifest.get('schema') == base.get('schema') == 'tmp-terrain-hd-v1'
    assert manifest.get('theater') == base.get('theater') == 'LUNAR'
    assert manifest.get('editions') == base.get('editions') == ['yr']
    assert recipe['materialProfile']['lunarSourceBinding'] == dict(schema='yr-lunar-native-terrain-v1',
        preparedSourceSha256=source['preparedSourceSha256'],
        paletteSha256='cdcbb615ede0d3e289adb0a16ef2b2b420eecd122de413bcc745a5f94939876a')
native = {member['member']: member['native'] for member in source['members']}
prepared = args.prepared
assert sha(prepared / 'source.json') == source['preparedSourceSha256']
metadata_keys = ['member', 'subTile', 'grid', 'block', 'logical', 'offset', 'origin', 'height',
                 'terrainType', 'rampType', 'extra', 'hasExtraData', 'hasZData', 'radar']
pairs, placeholders, empty, changed, atlas_bytes = 0, 0, 0, 0, {'2': 0, '4': 0}
native_bright_pixels = 0
seen = set()
for group in manifest['groups'][base_count:]:
    assert sorted(variant['density'] for variant in group['variants']) == [2, 4]
    for member in group['members']:
        assert member['member'] not in seen
        seen.add(member['member'])
        source_member = native[member['member']]
        assert member['sourceHashes'] == {edition: source_member['sha256'] for edition in source_editions}
        assert member['images'] == [{key: image[key] for key in metadata_keys} for image in source_member['images']]
    images = [(member, index, image) for member in group['members'] for index, image in enumerate(member['images'])]
    for variant in group['variants']:
        file = pack / variant['file']
        assert sha(file) == variant['sha256'] and file.stat().st_size == np.prod(variant['size']) * 4
        atlas = np.asarray(Image.frombytes('RGBA', tuple(variant['size']), file.read_bytes()))
        density = variant['density']
        atlas_bytes[str(density)] += file.stat().st_size
        assert len(variant['rects']) == len(images)
        for (member, index, image), (x, y, w, h) in zip(images, variant['rects']):
            assert [w, h] == [n * density for n in image['logical']]
            assert x >= 2 and y >= 2 and x + w + 2 <= atlas.shape[1] and y + h + 2 <= atlas.shape[0]
            frame = atlas[y:y + h, x:x + w]
            if member['member'] in accepted_road_geometry and native[member['member']]['images'][index]['nativeOffset'] > 0:
                name = member['member']
                key = (name, density)
                if key not in accepted_road_outputs:
                    accepted_road_outputs[key] = render_accepted_road(accepted_road_geometry[name], accepted_road_materials, density)
                info = json.loads((root / 'layout.json').read_text())[name]
                part = next(p for p in info['parts'] if p['subTile'] == image['subTile'])
                sx, sy, sw, sh = [value*density for value in part['rect']]
                sample = accepted_road_outputs[key][sy:sy+sh, sx:sx+sw]
                expected_rgb = (sample if accepted_road_geometry[name]['retainTransparentMainRgb']
                    else extrude(sample, frame[..., 3] > 0))
                assert np.array_equal(frame[..., :3], expected_rgb), 'Road RGB differs from its pinned accepted materials and source geometry'
            if member['member'] in shore_geometry:
                name = member['member']
                key = (name, density)
                if key not in shore_outputs:
                    shore_outputs[key] = render_shore(shore_geometry[name], shore_plates[name], shore_water, density, shore_land)
                info = json.loads((root / 'layout.json').read_text())[name]
                part = next(part for part in info['parts'] if part['subTile'] == image['subTile'])
                sx, sy, sw, sh = [value*density for value in part['rect']]
                expected_rgb = extrude(shore_outputs[key][sy:sy+sh, sx:sx+sw], frame[..., 3] > 0)
                assert np.array_equal(frame[..., :3], expected_rgb), 'Shore material differs from source-pinned vector render'
            assert np.array_equal(np.pad(frame, ((2, 2), (2, 2), (0, 0)), mode='edge'),
                                  atlas[y - 2:y + h + 2, x - 2:x + w + 2])
            original = native[member['member']]['images'][index]
            file = prepared / 'native' / original['file']
            assert sha(file) == original['rgbaSha256']
            decoded = Image.frombytes('RGBA', tuple(original['logical']), file.read_bytes())
            expected = np.asarray(decoded.resize((w, h), Image.Resampling.NEAREST))
            if member['member'] in coastal_masks and original['nativeOffset'] > 0:
                name = member['member']
                mask = coastal_masks[name]
                weight = coastal_sea_weight(mask, density)
                pixels = coastal_sea_pixels(coastal_water, weight.shape, density)
                info = json.loads((root / 'layout.json').read_text())[name]
                rx, ry, rw, rh = next(part['rect'] for part in info['parts']
                                     if part['subTile'] == original['subTile'])
                pure = weight[ry*density:(ry+rh)*density, rx*density:(rx+rw)*density] == 1
                pure &= expected[..., 3] > 0
                sea = pixels[ry*density:(ry+rh)*density, rx*density:(rx+rw)*density]
                assert np.array_equal(frame[..., :3][pure], sea[pure]), 'Coastal water differs from its accepted density'
            if group.get('contourReconstruction') and original['nativeOffset'] > 0 and expected[..., 3].any():
                assert group['contourReconstruction'] == CONTOUR_POLICY
                assert recipe['materialProfile']['authoredSurfaceReconstruction'][member['member']] == native[member['member']]['sha256']
                if group.get('coherentMemberExtraContours'):
                    assert group['coherentMemberExtraContours'] == COHERENT_POLICY
                    assert recipe['materialProfile']['continuousAuthoredRgb'][member['member']] == native[member['member']]['sha256']
                    info = json.loads((root / 'layout.json').read_text())[member['member']]
                    rect = next(part['rect'] for part in info['parts'] if part['subTile'] == original['subTile'])
                    mask = native_member_mask(native[member['member']], info, prepared)
                    rock = recipe['materialProfile'].get('sourcePinnedExposedRockContours', {})
                    if rock:
                        assert source['theater'] == 'NEWURBAN' and source_editions == ['yr']
                        contract = json.loads((Path(__file__).resolve().parents[2] / 'docs/campaign-art/yr-v1'
                            / 'terrain-newurban-natural-ramp-rock-contour-contract-r1.json').read_text())
                        assert rock == contract['rockMembers']
                        assert recipe['materialProfile']['continuousAuthoredRgb'] == contract['members']
                        assert group['sourcePinnedExposedRockContours'] == dict(policy=ROCK_POLICY, members=rock)
                        assert all(native[name]['sha256'] == pin and native[name]['setIndex'] == 115
                                   for name, pin in rock.items())
                        assert all(native[name]['palette']['sha256'] == contract['palette']['sha256'] for name in rock)
                    else:
                        assert 'sourcePinnedExposedRockContours' not in group
                    assert group.get('sourcePinnedSnowRampGroundContacts') == snow_ground
                    assert np.array_equal(frame[..., 3], coherent_extra_alpha(np.asarray(decoded), original, density,
                        mask, rect, exposed_rock=member['member'] in rock, snow_ground=bool(snow_ground)))
                else:
                    verify_extra_alpha(frame[..., 3], np.asarray(decoded), original, density)
            else:
                assert np.array_equal(frame[..., 3], expected[..., 3])
            pairs += 1
            if original['nativeOffset'] <= 0:
                assert np.array_equal(frame, expected)
                placeholders += 1
            elif not expected[..., 3].any():
                assert np.array_equal(frame, expected)
                empty += 1
            else:
                active = expected[..., 3] > 0
                assert not np.array_equal(frame[active], expected[active]), 'Substantial source was not authored'
                bright = matte(frame[..., :3]) & active
                assert not (bright & ~matte(expected[..., :3])).any(), 'New opaque fluorescent matte'
                native_bright_pixels += int(bright.sum())
                changed += 1
assert len(seen) == recipe['newMembers'] and pairs == recipe['newImages'] * 2
assert atlas_bytes == recipe['newAtlasBytes']
for master in recipe['masters']:
    assert sha(master['master']) == master['sha256'] and master['capacity'] >= 4
    if master['member'] in snow_road_ports:
        assert master['sha256'] == snow_road_ports[master['member']]['masterSha256']
profile = recipe.get('materialProfile', {})
for declaration in {**profile.get('nativeUrbanReefMaterials', {}),
                    **profile.get('nativeTheaterReefMaterials', {})}.values():
    assert sha(declaration['master']) == declaration['masterSha256']
    assert sha(declaration['audit']) == declaration['auditSha256']
    assert sha(declaration['bodyMask']['file']) == declaration['bodyMask']['sha256']
    audit = json.loads(Path(declaration['audit']).read_text())
    assert audit['status'] == 'PASS' and audit['rawSha256'] == declaration['masterSha256']
result = dict(status='PASS_NEW_COMPLETE_GROUPS_NATIVE_METADATA_ALPHA_GUTTERS_AND_ACCEPTED_REUSE',
              pack=recipe['pack'], newMembers=len(seen), independentDensityPairs=pairs,
              exactNativePlaceholderPairs=placeholders, exactNativeEmptyPairs=empty, authoredPairs=changed,
              nativeBrightMaterialPixels=native_bright_pixels,
              replacedCompleteGroups=len(replaced),
              newAtlasBytes=atlas_bytes, copiedAcceptedGroups=base_count, runtimeAcceptance=False)
with (args.receipt or root / args.revision / 'validation.json').open('x') as stream:
    stream.write(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
