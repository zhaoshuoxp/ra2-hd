"""Prove exact accepted sea pixels, bounded joins and unchanged authored cliff RGB."""
import argparse
import json
from pathlib import Path
import sys

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_coastal_sea import (
    load_coastal_sea, coastal_sea_pixels, coastal_sea_weight, disconnected_coastal_water)
from showcase_registration import sha

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('authoring', type=Path)
parser.add_argument('revision')
parser.add_argument('prior_revision')
parser.add_argument('--receipt', type=Path, help='Retain an independent immutable revalidation receipt')
args = parser.parse_args()
read = lambda file: json.loads(file.read_text())
source = read(args.authoring / 'source.json')
layout = read(args.authoring / 'layout.json')
recipe = read(args.authoring / args.revision / 'recipe.json')
specification = read(Path(read(args.authoring / 'preparation.json')['recipe']))
prepared = Path(specification['originalGuides']['directory'])
assert sha(prepared / 'source.json') == source['preparedSourceSha256']
masks, water = load_coastal_sea(recipe['materialProfile'], source, args.authoring)
assert masks
packs = [Path('.local/terrain-packs') / revision for revision in [args.prior_revision, args.revision]]
manifests = [read(pack / 'manifest.json') for pack in packs]
assert sha(packs[1] / 'manifest.json') == recipe['pack']['sha256']
wanted = set(masks)
selected = [[group for group in manifest['groups']
             if any(member['member'] in wanted for member in group['members'])] for manifest in manifests]
assert all({member['member'] for group in groups for member in group['members']} == wanted for groups in selected)


def frames(pack, groups, density):
    result = {}
    for group in groups:
        variant, = [variant for variant in group['variants'] if variant['density'] == density]
        assert sha(pack / variant['file']) == variant['sha256']
        atlas = np.memmap(pack / variant['file'], dtype=np.uint8, mode='r', shape=(*variant['size'][::-1], 4))
        cursor = 0
        for member in group['members']:
            for image in member['images']:
                x, y, width, height = variant['rects'][cursor]
                result[(member['member'], image['subTile'])] = dict(metadata=image,
                    sourceHashes=member['sourceHashes'], pixels=atlas[y:y+height, x:x+width].copy())
                cursor += 1
    return result


records = []
sources = {member['member']: member['native'] for member in source['members']}
for density in [2, 4]:
    before, after = [frames(pack, groups, density) for pack, groups in zip(packs, selected, strict=True)]
    assert set(before) == set(after)
    for name, mask in masks.items():
        weight = coastal_sea_weight(mask, density)
        accepted = coastal_sea_pixels(water, weight.shape, density)
        counts = dict(unchangedBodyPixels=0, exactAcceptedSeaPixels=0, antialiasedJoinPixels=0)
        for part in layout[name]['parts']:
            key = (name, part['subTile'])
            old, new = before[key], after[key]
            assert old['metadata'] == new['metadata'] and old['sourceHashes'] == new['sourceHashes']
            assert np.array_equal(old['pixels'][..., 3], new['pixels'][..., 3])
            original = next(image for image in sources[name]['images'] if image['subTile'] == part['subTile'])
            if original['nativeOffset'] <= 0:
                assert np.array_equal(old['pixels'], new['pixels'])
                continue
            x, y, width, height = [value*density for value in part['rect']]
            w = weight[y:y+height, x:x+width]
            sea = accepted[y:y+height, x:x+width]
            # The original member mask also excludes transparent portions of
            # overlapping subtiles from material-color credit.
            guide = prepared / 'native' / original['file']
            assert sha(guide) == original['rgbaSha256']
            native = np.frombuffer(guide.read_bytes(), np.uint8).reshape(*original['logical'][::-1], 4)
            active = (native[..., 3] > 0).repeat(density, 0).repeat(density, 1)
            expected = np.uint8(np.clip(np.rint(old['pixels'][..., :3]*(1-w[..., None]) + sea*w[..., None]), 0, 255))
            assert np.array_equal(new['pixels'][..., :3][active], expected[active])
            counts['unchangedBodyPixels'] += int((active & (w == 0)).sum())
            counts['exactAcceptedSeaPixels'] += int((active & (w == 1)).sum())
            counts['antialiasedJoinPixels'] += int((active & (w > 0) & (w < 1)).sum())
        assert counts['unchangedBodyPixels'] and counts['exactAcceptedSeaPixels']
        disconnected = False
        if not counts['antialiasedJoinPixels']:
            assert source['theater'] == 'NEWURBAN' and set(masks) == {'cliffc05.ubn', 'cliffc06.ubn'}
            assert sources[name]['setIndex'] == 85 and disconnected_coastal_water(mask), \
                'A continuous original body/water contact requires antialiased join samples'
            disconnected = True
        records.append(dict(member=name, density=density, **counts, originalAlphaAndMetadataExact=True))
        if disconnected:
            records[-1]['sourceBodyAndWaterSeparatedByTransparentGap'] = True
document = dict(schema='yr-source-bound-coastal-sea-pixel-lineage-v1',
    status='PASS_EXACT_ACCEPTED_SEA_PIXELS_SOURCE_BOUND_JOINS_AND_UNCHANGED_BODY',
    priorPackSha256=sha(packs[0] / 'manifest.json'), packSha256=sha(packs[1] / 'manifest.json'), records=records,
    sourceRgbUsedAsOutputTexture=False, originalGeometryAndAlphaChanged=False, userVisualAcceptance='PENDING')
target = args.receipt or args.authoring / args.revision / 'coastal-sea-lineage.json'
with target.open('x') as output:
    output.write(json.dumps(document, indent=2) + '\n')
print(json.dumps(dict(status=document['status'], memberDensityCases=len(records))))
