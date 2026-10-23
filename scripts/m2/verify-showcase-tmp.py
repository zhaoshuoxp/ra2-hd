"""Verify new terrain closure, native metadata/coverage and exact accepted atlas reuse."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from showcase_registration import matte, sha
from showcase_reconstruction import POLICY as CONTOUR_POLICY, verify_extra_alpha

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('revision')
parser.add_argument('--root', type=Path, default=Path('.artifacts/m2-2/authoring-tmp-v2'))
parser.add_argument('--prepared', type=Path, default=Path('.artifacts/m2-2/prepared-native-v2'))
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
        assert member['sourceHashes'] == {edition: source_member['sha256'] for edition in ['ra2', 'yr']}
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
            assert np.array_equal(np.pad(frame, ((2, 2), (2, 2), (0, 0)), mode='edge'),
                                  atlas[y - 2:y + h + 2, x - 2:x + w + 2])
            original = native[member['member']]['images'][index]
            file = prepared / 'native' / original['file']
            assert sha(file) == original['rgbaSha256']
            decoded = Image.frombytes('RGBA', tuple(original['logical']), file.read_bytes())
            expected = np.asarray(decoded.resize((w, h), Image.Resampling.NEAREST))
            if group.get('contourReconstruction') and original['nativeOffset'] > 0 and expected[..., 3].any():
                assert group['contourReconstruction'] == CONTOUR_POLICY
                assert recipe['materialProfile']['authoredSurfaceReconstruction'][member['member']] == native[member['member']]['sha256']
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
with (root / args.revision / 'validation.json').open('x') as stream:
    stream.write(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
