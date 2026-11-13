"""Prove composed terrain retains accepted density pixels and bounded AA joins."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_urban_ground import load_urban_ground, partition_weights, render_urban_ground

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('authoring', type=Path)
parser.add_argument('revision')
parser.add_argument('--receipt', type=Path, help='Write a separate immutable revalidation receipt.')
args = parser.parse_args()
read = lambda path: json.loads(path.read_text())
authoring = args.authoring
source, profile = read(authoring / 'source.json'), read(authoring / 'material-profile.json')
geometry, materials, records = load_urban_ground(profile, source, authoring)
assert materials['schema'] == 'accepted-native-density-regions-v1' and not materials.get('contourGuard')
pack = Path('.local/terrain-packs') / args.revision
manifest = read(pack / 'manifest.json')
wanted = {member['member'] for member in source['members']}
groups = [group for group in manifest['groups'] if any(member['member'] in wanted for member in group['members'])]
proof = []
for group in groups:
    for variant in group['variants']:
        density = variant['density']
        atlas = np.memmap(pack / variant['file'], dtype=np.uint8, mode='r',
            shape=(variant['size'][1], variant['size'][0], 4))
        offset = 0
        for member in group['members']:
            name = member['member']
            assert len(member['images']) == 1
            x, y, width, height = variant['rects'][offset]
            offset += 1
            pixels = np.asarray(atlas[y:y+height, x:x+width])
            native = np.asarray(Image.open(authoring / (name+'-native.png')).convert('RGBA'))
            expected_alpha = native[..., 3].repeat(density, 0).repeat(density, 1)
            assert np.array_equal(pixels[..., 3], expected_alpha)
            active = expected_alpha > 0
            matches = []
            for role, samples in materials['members'][name].items():
                rgba = samples[density]
                matches.append(np.all(pixels[..., :3] == rgba[..., :3], axis=2) & active)
            inherited = np.any(matches, axis=0)
            mixed = active & ~inherited
            analytic = geometry[name]['kind'] == 'polynomial-material-partition'
            if analytic:
                expected = render_urban_ground(geometry[name], materials['members'][name], density)
                assert np.array_equal(pixels[..., :3][active], expected[active])
                weights = partition_weights(geometry[name], density)
                contributors = sum((weight > 0).astype(np.uint8) for weight in weights.values())
                assert np.all(contributors[mixed] >= 2), 'Every new RGB must blend actual accepted material pixels'
                if 'asphalt' in weights:
                    sample = materials['members'][name]['asphalt'][density]
                    red, green, blue = np.moveaxis(sample[..., :3].astype(int), -1, 0)
                    paint = (red > 100) & (green > 85) & (red-blue > 45) & (green-blue > 35)
                    assert not np.any(paint & active & (weights['asphalt'] > 0)), 'Asphalt continuation introduced foreign road paint'
                    curb = (red > 150) & (green > 150) & (blue > 140)
                    assert not np.any(curb & active & (weights['asphalt'] > 0)), 'Asphalt continuation introduced neighboring curb material'
            else:
                neighbors = sum(ndimage.binary_dilation(match, iterations=2).astype(np.uint8) for match in matches)
                assert np.all(neighbors[mixed] >= 2), 'New RGB may only antialias a join between accepted regions'
            proof.append(dict(member=name, density=density, visiblePixels=int(active.sum()),
                exactAcceptedMaterialRgbPixels=int(inherited.sum()),
                antialiasedJoinPixels=int(mixed.sum()), originalAlphaExact=True,
                joinProof='EXACT_INDEPENDENT_ANALYTIC_SUBPIXEL_MATERIAL_BLEND' if analytic
                    else 'WITHIN_TWO_HD_PIXELS_OF_TWO_ACCEPTED_INTERIORS'))
assert len(proof) == len(wanted)*2
document = dict(schema='yr-accepted-ground-pixel-lineage-v1',
    status='PASS_EXACT_ACCEPTED_DENSITY_RGB_INTERIORS_AND_BOUNDED_ANTIALIASED_JOINS',
    packSha256=hashlib.sha256((pack/'manifest.json').read_bytes()).hexdigest(),
    acceptedRegions=len(records), proofs=proof, originalNativeRgbUsedAsOutputDetail=False,
    sourceGeometryDepthRules='UNCHANGED', userVisualAcceptance='PENDING', nativeRuntime='PENDING',
    qualification='Accepted material samples are checked against their original raw atlas bytes and any declared fixed-scale UV mapping. Every visible output RGB copies an accepted-density sample or antialiases a declared join. This proves pixel provenance; original-design fidelity and native context remain separate checks.')
output = args.receipt or authoring / args.revision / 'accepted-pixel-lineage.json'
with output.open('x') as file:
    file.write(json.dumps(document, indent=2)+'\n')
print(json.dumps(dict(status=document['status'], densitySamples=len(proof), acceptedRegions=len(records))))
