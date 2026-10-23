"""Verify bounded seam corrections against the fully accepted V12C remainder."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('revision')
args = parser.parse_args()
root = Path('.artifacts/m2-1/authoring-seams-v13')
production = Path('.artifacts/m2-1/authoring-production-v3')
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
read = lambda p: json.loads(Path(p).read_text())
recipe = read(root / args.revision / 'recipe.json')
parent_root = Path(recipe['parent']['root'])
pack = Path('.local/terrain-packs') / args.revision
assert sha(pack / 'manifest.json') == recipe['pack']['sha256']
assert sha(parent_root / 'manifest.json') == recipe['parent']['sha256']
actual, parent = read(pack / 'manifest.json'), read(parent_root / 'manifest.json')
source = read(production / 'source.json')
members = {m['member']: m for g in source['groups'] for m in g['members']}
assert len(members) == 305
affected = set(recipe['affectedMembers'])
assert affected == {m['member'] for m in members.values() if m['setIndex'] in [9, 43]} | {
    f'proad{i:02}.tem' for i in range(16, 22)}
assert len(affected) == 122
assert {k: v for k, v in actual.items() if k not in ['groups', 'revision']} == {
    k: v for k, v in parent.items() if k not in ['groups', 'revision']}
pairs = unchanged = changed = placeholders = contact_only = contacts = 0
changed_members = set()
for group, previous in zip(actual['groups'], parent['groups']):
    assert {k: v for k, v in group.items() if k != 'variants'} == {k: v for k, v in previous.items() if k != 'variants'}
    assert group['members'] == [{k: m[k] for k in ['member', 'sourceHashes', 'images']}
                                for m in source['groups'][actual['groups'].index(group)]['members']]
    for variant, old in zip(group['variants'], previous['variants']):
        assert {k: v for k, v in variant.items() if k != 'sha256'} == {k: v for k, v in old.items() if k != 'sha256'}
        file, before = pack / variant['file'], parent_root / old['file']
        assert sha(file) == variant['sha256'] and sha(before) == old['sha256']
        assert file.stat().st_size == np.prod(variant['size']) * 4
        pixels = np.asarray(Image.frombytes('RGBA', tuple(variant['size']), file.read_bytes()))
        baseline = np.asarray(Image.frombytes('RGBA', tuple(old['size']), before.read_bytes()))
        if group['id'] == 'ground':
            assert file.read_bytes() == before.read_bytes()
        index = 0
        for member in group['members']:
            name = member['member']
            for image in member['images']:
                x, y, w, h = variant['rects'][index]
                index += 1
                frame = pixels[y:y + h, x:x + w]
                prior = baseline[y:y + h, x:x + w]
                assert np.array_equal(pixels[y - 2:y + h + 2, x - 2:x + w + 2],
                                      np.pad(frame, ((2, 2), (2, 2), (0, 0)), mode='edge'))
                density = variant['density']
                assert [w, h] == [n * density for n in image['logical']]
                raw = Path('.artifacts/m2-1/inventory/native') / f"{members[name]['nativeName']}-{image['subTile']}.rgba"
                original = Image.frombytes('RGBA', tuple(image['logical']), raw.read_bytes())
                native = np.asarray(original.resize((w, h), Image.Resampling.NEAREST))
                assert np.array_equal(frame[:, :, 3], native[:, :, 3]), (name, image['subTile'], density)
                pairs += 1
                if members[name]['nativeOffsets'][image['subTile']] <= 0:
                    assert np.array_equal(frame, native)
                    placeholders += 1
                if name not in affected or members[name]['nativeOffsets'][image['subTile']] <= 0:
                    assert np.array_equal(frame, prior), (name, image['subTile'], density)
                if np.array_equal(frame, prior):
                    unchanged += 1
                else:
                    assert name in affected
                    changed += 1
                    changed_members.add(name)
                if name.startswith(('slope', 'rmpfx')) and name in affected and members[name]['nativeOffsets'][image['subTile']] > 0:
                    valid = np.asarray(original)[:, :, 3] > 0
                    ring = valid & ~ndimage.binary_erosion(valid)
                    mask = np.asarray(Image.fromarray(ring).resize((w, h), Image.Resampling.NEAREST))
                    assert np.array_equal(frame[mask], native[mask]), (name, image['subTile'], density)
                    contacts += int(mask.sum())
                    if not ndimage.binary_erosion(valid).any():
                        assert np.array_equal(frame, prior)
                        contact_only += 1
                if name.startswith('rmpfx'):
                    colors = np.asarray(original)[:, :, :3].astype(float)
                    support = (colors[:, :, 1] - colors[:, :, 2] < 22) & (np.abs(colors[:, :, 0] - colors[:, :, 1]) < 22)
                    support &= np.asarray(original)[:, :, 3] > 0
                    support = ndimage.binary_dilation(support, iterations=4)
                    support = np.asarray(Image.fromarray(support).resize((w, h), Image.Resampling.NEAREST))
                    colors = prior[:, :, :3].astype(float)
                    mask = ((colors[:, :, 1] - colors[:, :, 2] < 25)
                            & (np.abs(colors[:, :, 0] - colors[:, :, 1]) < 25)
                            & (native[:, :, 3] > 0) & support)
                    assert np.array_equal(frame[mask], prior[mask])
                rgb = frame[:, :, :3]
                matte = ((rgb[:, :, 0] > 230) & (rgb[:, :, 1] < 30))
                matte |= (rgb[:, :, 0] > 240) & (rgb[:, :, 1] > 240) & (rgb[:, :, 2] < 16)
                matte |= (rgb[:, :, 0] < 40) & (rgb[:, :, 1] > 240) & (rgb[:, :, 2] < 40)
                matte &= frame[:, :, 3] > 0
                assert np.array_equal(frame[matte], native[matte])
assert pairs == 1484 and unchanged + changed == pairs and placeholders == 126 and contact_only == 8
assert changed == recipe['changedPairs'] and unchanged == recipe['exactPreservedPairs']
generation = read(recipe['generation']['file'])
assert sha(recipe['generation']['file']) == recipe['generation']['sha256']
for entry in generation['entries']:
    for item in [entry['master'], entry['prompt'], *entry['references']]:
        assert sha(item['file']) == item['sha256']
for item in recipe['roadCalibration']:
    assert sha(item['source']['file']) == item['source']['sha256']
    assert item['source']['densityCapacity'] >= 4
assert all(p['densityCapacity'] >= 4 for p in recipe['projections'])
result = dict(status='PASS', pack=recipe['pack'], parent=recipe['parent'], members=305, images=742,
              imageDensityPairs=pairs, changedPairs=changed, exactV12CPreservedPairs=unchanged,
              changedMembers=sorted(changed_members), changedMemberCount=len(changed_members),
              groundAtlases='BYTE_IDENTICAL', unaffectedFramesAndGutters='EXACT_V12C',
              nativeMetadataAlphaGeometry='EXACT', nativePlaceholders=placeholders,
              slopeNativeContactOnlyPairs=contact_only, exactSlopeNativeContactPixels=contacts,
              completeTwoPixelGutters='EXACT', newOpaqueFluorescentMatte='NONE',
              atlasBytes=recipe['atlasBytes'], visualAcceptance='PENDING_COPIED_NATIVE_REVIEW')
(root / args.revision / 'validation.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({k: v for k, v in result.items() if k != 'changedMembers'}, indent=2))
