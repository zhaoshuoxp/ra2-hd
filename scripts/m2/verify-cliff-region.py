"""Check native geometry/masks, source density and acknowledged road preservation."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--authoring-root', type=Path, default=Path('.artifacts/m2-1/authoring-v8'))
parser.add_argument('--detail-base-pack', type=Path)
args = parser.parse_args()
root = args.authoring_root
pointer = json.loads(Path('.local/terrain-selection.json').read_text())
pack = Path('.local/terrain-packs') / pointer['revision']
data = (pack / 'manifest.json').read_bytes()
assert hashlib.sha256(data).hexdigest() == pointer['sha256']
manifest = json.loads(data)
region = json.loads((root / 'region.json').read_text())
members = {m['member']: m for m in region['members']}
elevation = next(g for g in manifest['groups'] if g['id'] == 'elevation-representative')
assert len(elevation['members']) == 13
assert set(m['member'] for m in elevation['members']) == set(m for m in members if m.startswith(('cliff', 'ramp')))
old_root = Path('.local/terrain-packs/temperate-m2-1-representative-v4')
old = json.loads((old_root / 'manifest.json').read_text())
road = next(g for g in manifest['groups'] if g['id'] == 'road-representative')
assert road == next(g for g in old['groups'] if g['id'] == road['id'])
assert len(manifest['groups']) == 2
for variant in road['variants']:
    assert (pack / variant['file']).read_bytes() == (old_root / variant['file']).read_bytes()
checks = placeholders = 0
changed_detail_pairs = unchanged_grass_pairs = 0
base_manifest = json.loads((args.detail_base_pack / 'manifest.json').read_text()) if args.detail_base_pack else None
for group in manifest['groups']:
    for variant in group['variants']:
        raw = (pack / variant['file']).read_bytes()
        assert hashlib.sha256(raw).hexdigest() == variant['sha256']
        atlas = Image.frombytes('RGBA', tuple(variant['size']), raw)
        base_atlas = None
        if base_manifest:
            base_group = next(g for g in base_manifest['groups'] if g['id'] == group['id'])
            base_variant = next(v for v in base_group['variants'] if v['density'] == variant['density'])
            assert group['members'] == base_group['members']
            assert variant['size'] == base_variant['size'] and variant['rects'] == base_variant['rects']
            base_atlas = Image.frombytes('RGBA', tuple(base_variant['size']),
                                        (args.detail_base_pack / base_variant['file']).read_bytes())
        index = 0
        for member in group['members']:
            source = members.get(member['member'])
            if source:
                assert member['images'] == source['images'] and member['sourceHashes'] == source['sourceHashes']
            for image in member['images']:
                name = source['nativeName'] if source else member['member'].capitalize()
                path = Path('.artifacts/m2-1/inventory/native') / f"{name}-{image['subTile']}.rgba"
                native = Image.frombytes('RGBA', tuple(image['logical']), path.read_bytes())
                x, y, w, h = variant['rects'][index]
                assert [w, h] == [n * variant['density'] for n in image['logical']]
                actual = np.asarray(atlas.crop((x, y, x + w, y + h)))
                expected = np.asarray(native.resize((w, h), Image.Resampling.NEAREST))
                assert np.array_equal(actual[:, :, 3], expected[:, :, 3])
                if source and source['nativeOffsets'][image['subTile']] <= 0:
                    covered = expected[:, :, 3] > 0
                    assert np.array_equal(actual[covered], expected[covered])
                    placeholders += 1
                if base_atlas and source and source['nativeOffsets'][image['subTile']] > 0:
                    previous = np.asarray(base_atlas.crop((x, y, x + w, y + h)))
                    covered = expected[:, :, 3] > 0
                    if member['member'] == 'cliff34.tem':
                        assert np.array_equal(actual[covered], previous[covered])
                        unchanged_grass_pairs += 1
                    else:
                        assert np.any(actual[covered, :3] != previous[covered, :3])
                        changed_detail_pairs += 1
                checks += 1
                index += 1
        assert index == len(variant['rects'])
export_root = root / pointer['revision']
recipe_file = export_root / 'recipe.json' if export_root.exists() else root / 'recipe.json'
recipe = json.loads(recipe_file.read_text())
assert recipe['pack'] == pointer
for master in recipe['masters']:
    assert master['densityCapacity'] >= 4
    assert hashlib.sha256(Path(master['file']).read_bytes()).hexdigest() == master['sha256']
assert checks == 176
result = dict(status='PASS', pack=pointer, nativeAlphaImageDensityPairs=checks,
              originalPlaceholderPairs=placeholders, nativeGeometry='EXACT',
              acknowledgedV4Roads='EXACT_BYTES_AND_METADATA', authoredMembers=13,
              sourceCapacity='INDEPENDENT_AT_LEAST_4X', ground='ORIGINAL',
              userAppearance='PENDING_RUNTIME_REVIEW')
if base_manifest:
    assert changed_detail_pairs == 104 and unchanged_grass_pairs == 2
    result['detailCorrection'] = dict(changedSurfacePairs=changed_detail_pairs,
                                      exactGrassOnlyBoundaryPairs=unchanged_grass_pairs,
                                      baseRevision=base_manifest['revision'])
(recipe_file.parent / 'validation.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
