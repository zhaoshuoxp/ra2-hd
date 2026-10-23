"""Independently verify complete production coverage and exact accepted/native pixels."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('revision')
parser.add_argument('--root', type=Path, default=Path('.artifacts/m2-1/authoring-production-v3'))
args = parser.parse_args()
root = args.root
source = json.loads((root / 'source.json').read_text())
layout = json.loads((root / 'layout.json').read_text())
pack = Path('.local/terrain-packs') / args.revision
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
manifest = json.loads((pack / 'manifest.json').read_text())
recipe = json.loads((root / args.revision / 'recipe.json').read_text())
assert recipe['pack']['sha256'] == sha(pack / 'manifest.json')
base_root = Path(source['acceptedBase']['root'])
assert sha(base_root / 'manifest.json') == source['acceptedBase']['sha256']
base = json.loads((base_root / 'manifest.json').read_text())


def frames(directory, document):
    result = {}
    for group in document['groups']:
        for variant in group['variants']:
            file = directory / variant['file']
            assert sha(file) == variant['sha256']
            assert file.stat().st_size == np.prod(variant['size']) * 4
            atlas = np.asarray(Image.frombytes('RGBA', tuple(variant['size']), file.read_bytes()))
            images = [(m, i) for m in group['members'] for i in m['images']]
            assert len(variant['rects']) == len(images)
            for (member, image), (x, y, w, h) in zip(images, variant['rects']):
                assert [w, h] == [n * variant['density'] for n in image['logical']]
                assert x >= 2 and y >= 2 and x + w + 2 <= atlas.shape[1] and y + h + 2 <= atlas.shape[0]
                frame = atlas[y:y + h, x:x + w].copy()
                padded = np.pad(frame, ((2, 2), (2, 2), (0, 0)), mode='edge')
                assert np.array_equal(padded, atlas[y - 2:y + h + 2, x - 2:x + w + 2])
                result[(member['member'], image['subTile'], variant['density'])] = frame
    return result


actual = frames(pack, manifest)
# Historical accepted atlas gutter conventions are retained only as source;
# the complete production atlas is independently checked above.
accepted = {}
for group in base['groups']:
    for variant in group['variants']:
        assert sha(base_root / variant['file']) == variant['sha256']
        atlas = np.asarray(Image.frombytes('RGBA', tuple(variant['size']), (base_root / variant['file']).read_bytes()))
        rows = [(m, i) for m in group['members'] for i in m['images']]
        for (m, i), (x, y, w, h) in zip(rows, variant['rects']):
            accepted[(m['member'], i['subTile'], variant['density'])] = atlas[y:y + h, x:x + w].copy()
assert len(actual) == 1484 and len(accepted) == 272
for key, pixels in accepted.items():
    assert np.array_equal(actual[key], pixels), key
for produced, native in zip(manifest['groups'], source['groups']):
    assert produced['id'] == native['id']
    assert produced['members'] == [{k: m[k] for k in ['member', 'sourceHashes', 'images']} for m in native['members']]
assert [len(g['members']) for g in manifest['groups']] == [88, 49, 168]
assert [sum(len(m['images']) for m in g['members']) for g in manifest['groups']] == [88, 313, 341]
alpha_checks = placeholders = changed = contacts = overlap_contacts = retained_native_markers = contact_only_pairs = 0
for member in [m for g in source['groups'] for m in g['members']]:
    name = member['member']
    if not member['accepted']:
        assembly = np.asarray(Image.open(root / f'{name}-native.png').convert('RGBA'))
        inside = assembly[:, :, 3] > 0
        outside_ring = inside & ~ndimage.binary_erosion(inside)
    for image in member['images']:
        raw = Path('.artifacts/m2-1/inventory/native') / f"{member['nativeName']}-{image['subTile']}.rgba"
        native = Image.frombytes('RGBA', tuple(image['logical']), raw.read_bytes())
        for density in [2, 4]:
            key = (name, image['subTile'], density)
            pixels = actual[key]
            expected = np.asarray(native.resize(tuple(n * density for n in native.size), Image.Resampling.NEAREST))
            assert np.array_equal(pixels[:, :, 3], expected[:, :, 3]), key
            alpha_checks += 1
            if member['nativeOffsets'][image['subTile']] <= 0:
                assert np.array_equal(pixels, expected), key
                placeholders += 1
            elif not member['accepted']:
                if np.array_equal(pixels[expected[:, :, 3] > 0], expected[expected[:, :, 3] > 0]):
                    assert not ndimage.binary_erosion(assembly[:, :, 3] > 0).any(), key
                    contact_only_pairs += 1
                else:
                    changed += 1
                rgb = pixels[:, :, :3]
                marker = ((rgb[:, :, 0] > 230) & (rgb[:, :, 1] < 30))
                marker |= (rgb[:, :, 0] > 240) & (rgb[:, :, 1] > 240) & (rgb[:, :, 2] < 16)
                marker |= (rgb[:, :, 0] < 40) & (rgb[:, :, 1] > 240) & (rgb[:, :, 2] < 40)
                marker &= expected[:, :, 3] > 0
                assert np.array_equal(pixels[marker], expected[marker]), key
                retained_native_markers += int(marker.sum())
                x, y, w, h = next(p['rect'] for p in layout[name]['parts'] if p['subTile'] == image['subTile'])
                same_native = (assembly[y:y + h, x:x + w, :3] == np.asarray(native)[:, :, :3]).all(2)
                ring = outside_ring[y:y + h, x:x + w] & (np.asarray(native)[:, :, 3] > 0)
                visible = ring & same_native
                mask = np.asarray(Image.fromarray(visible).resize(pixels.shape[1::-1], Image.Resampling.NEAREST))
                assert np.array_equal(pixels[mask], expected[mask]), key
                contacts += int(mask.sum())
                overlap_contacts += int((ring & ~same_native).sum()) * density * density
assert alpha_checks == 1484 and placeholders == 126 and changed == 1100 and contact_only_pairs == 8
assert len(recipe['masters']) == 236 and min(p['densityCapacity'] for p in recipe['masters']) >= 4
for item in recipe['masters']:
    assert sha(item['file']) == item['sha256']
generation = json.loads((root / 'generation-provenance.json').read_text())
assert len(generation['entries']) == 41
for entry in [*generation['entries'], *generation.get('studies', [])]:
    for record in [entry.get('master', entry), entry['prompt'], *entry['references']]:
        assert sha(record['file']) == record['sha256']
result = dict(status='PASS', pack=recipe['pack'], members=305, images=742, imageDensityPairs=alpha_checks,
              exactAcceptedPairs=272, exactNativePlaceholderPairs=placeholders, changedAuthoredPairs=changed,
              exactNativeContactOnlyPairs=contact_only_pairs,
              exactVisibleNativeContactPixels=contacts, occludedNativeOverlapContactPixels=overlap_contacts,
              nativeMetadataAlphaGeometry='EXACT', completeTwoPixelGutters='EXACT',
              generatedBoards=41, newMembers=236, minimumSourceCapacity=min(p['densityCapacity'] for p in recipe['masters']),
              newOpaqueFluorescentMatte='NONE', exactRetainedNativeMarkerPixels=retained_native_markers,
              atlasBytes=recipe['atlasBytes'], appearance='PENDING_COPIED_RUNTIME_REVIEW')
(root / args.revision / 'validation.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
