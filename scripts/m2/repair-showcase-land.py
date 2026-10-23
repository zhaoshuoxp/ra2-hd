"""Register a complete shore group to retail land colors; retain accepted water exactly."""
import argparse
import copy
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from showcase_materials import register_shore_land, register_contacts, water_mask
from showcase_registration import extrude, sha

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('base', type=Path)
parser.add_argument('destination', type=Path)
parser.add_argument('evidence', type=Path)
args = parser.parse_args()
layout_root = Path('.artifacts/m2-2/authoring-feedback-r5/tmp')
layout = json.loads((layout_root / 'layout.json').read_text())
prepared = json.loads((layout_root / 'source.json').read_text())
sources = {m['member']: m for m in prepared['members']}
base = json.loads((args.base / 'manifest.json').read_text())
manifest = copy.deepcopy(base)
manifest['revision'] = args.destination.name
args.destination.mkdir(exist_ok=False)
args.evidence.mkdir(exist_ok=False)
checks = []
for group in manifest['groups']:
    for variant in group['variants']:
        file = args.base / variant['file']
        assert sha(file) == variant['sha256']
        if group['id'] != 'm2-2-shore':
            shutil.copy2(file, args.destination / variant['file'])
            continue
        density = variant['density']
        before = np.frombuffer(file.read_bytes(), np.uint8).reshape(*variant['size'][::-1], 4)
        after = before.copy()
        i = 0
        for member in group['members']:
            name = member['member']
            info = layout[name]
            whole = np.zeros((info['bounds'][3] * density, info['bounds'][2] * density, 3), np.uint8)
            declarations = []
            for metadata in member['images']:
                x, y, w, h = variant['rects'][i]
                i += 1
                part = next((p for p in info['parts'] if p['subTile'] == metadata['subTile']), None)
                image = next(p for p in sources[name]['native']['images'] if p['subTile'] == metadata['subTile'])
                declarations.append((metadata, image, part, [x, y, w, h]))
                if part:
                    px, py = [n * density for n in part['rect'][:2]]
                    frame = before[y:y + h, x:x + w]
                    active = frame[..., 3] > 0
                    whole[py:py + h, px:px + w][active] = frame[..., :3][active]
            native = np.asarray(Image.open(layout_root / f'{name}-native.png').convert('RGBA'))
            registered, _ = register_shore_land(whole, native, density)
            for metadata, source, part, (x, y, w, h) in declarations:
                previous = before[y:y + h, x:x + w]
                if source['nativeOffset'] <= 0:
                    checks.append(dict(member=name, subTile=metadata['subTile'], density=density, placeholderExact=True))
                    continue
                raw = Path('.artifacts/m2-2/prepared-native-v2/native') / source['file']
                assert sha(raw) == source['rgbaSha256']
                retail = np.asarray(Image.frombytes('RGBA', tuple(metadata['logical']), raw.read_bytes()))
                protected = ndimage.binary_dilation(ndimage.binary_fill_holes(water_mask(retail)), iterations=1)
                land = (retail[..., 3] > 0) & ~protected
                land = np.repeat(np.repeat(land, density, 0), density, 1)
                px, py = [n * density for n in part['rect'][:2]]
                rgb = registered[py:py + h, px:px + w]
                rgb = register_contacts(rgb, retail, density)
                result = previous.copy()
                result[..., :3][land] = rgb[land]
                result[..., :3] = extrude(result[..., :3], result[..., 3] > 0)
                # Authoritative accepted samples include the shallow transition
                # and a native-pixel guard around its boundary.
                visible = previous[..., 3] > 0
                assert np.array_equal(result[visible & ~land], previous[visible & ~land])
                assert np.array_equal(result[..., 3], previous[..., 3])
                padded = np.pad(result, ((2, 2), (2, 2), (0, 0)), mode='edge')
                after[y - 2:y + h + 2, x - 2:x + w + 2] = padded
                checks.append(dict(member=name, subTile=metadata['subTile'], density=density,
                                   changedLandPixels=int(np.any(result != previous, axis=2).sum()),
                                   protectedVisiblePixels=int((visible & ~land).sum()), waterExact=True, alphaExact=True))
        target = args.destination / variant['file']
        target.write_bytes(after.tobytes())
        variant['sha256'] = sha(target)
        Image.fromarray(after).save(args.evidence / f"shore-{density}x-atlas.png")
(args.destination / 'manifest.json').write_text(json.dumps(manifest, separators=(',', ':')) + '\n')
receipt = dict(schema='m2-2-shore-land-registration-v1', status='PASS',
               base=dict(path=str(args.base), sha256=sha(args.base / 'manifest.json')),
               pack=dict(schemaVersion=1, revision=args.destination.name, sha256=sha(args.destination / 'manifest.json')),
               changedGroups=['m2-2-shore'], exactPreservedGroups=[g['id'] for g in base['groups'] if g['id'] != 'm2-2-shore'],
               policy='Complete reusable shore group; native land material guide, bounded independent authored detail; accepted water and geometry exact',
               checks=checks)
(args.evidence / 'recipe.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({key: receipt[key] for key in ['status', 'pack', 'changedGroups', 'exactPreservedGroups']}))
