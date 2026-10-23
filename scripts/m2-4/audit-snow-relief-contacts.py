"""Check exported Snow contact pixels and byte-exact generated mother provenance."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from scipy import ndimage


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fragments(root, names):
    result = {}
    for group in read(root / 'manifest.json')['groups']:
        if not any(member['member'] in names for member in group['members']):
            continue
        for variant in group['variants']:
            file = root / variant['file']
            assert sha(file) == variant['sha256']
            pixels = np.frombuffer(file.read_bytes(), np.uint8).reshape(*variant['size'][::-1], 4)
            offset = 0
            for member in group['members']:
                for image in member['images']:
                    x, y, width, height = variant['rects'][offset]
                    if member['member'] in names:
                        result[member['member'], image['subTile'], variant['density']] = pixels[y:y + height, x:x + width]
                    offset += 1
    return result


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base', type=Path, required=True)
parser.add_argument('--candidate', type=Path, required=True)
parser.add_argument('--stage', type=Path, action='append', required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--diffuse-contacts', action='store_true')
args = parser.parse_args()
names, masters = set(), {}
for stage in args.stage:
    recipe = read(stage / 'recipe.json')
    corrections = recipe['nativeMaterialCorrections']
    for name, correction in corrections.items():
        light = correction['nativeSnowContinuousLight']
        assert light['nativeFieldSigma'] == 1.2 and light['detailSigmaLogical'] == 1.4
        assert light['detailStrength'] == .5
        if args.diffuse_contacts:
            contact = correction['nativeSnowDiffuseContacts']
            assert contact['sourceSha256'] == light['sourceSha256'] and contact['nativeFieldSigma'] == 1.2
        names.add(name)
    for master in recipe['masters']:
        file = Path(master['master'])
        assert sha(file) == master['sha256'] and master['capacity'] >= 4
        provenance = read(file.with_name(file.name.replace('-master.png', '-imagegen.json')))
        assert provenance['tool'] == 'Builtin imagegen' and provenance['masterSha256'] == master['sha256']
        assert sha(Path(provenance['reference'])) == provenance['referenceSha256']
        masters[str(file)] = dict(file=str(file), sha256=master['sha256'])
assert len(names) == 110 and len(masters) == 12
before, after = fragments(args.base, names), fragments(args.candidate, names)
assert before.keys() == after.keys() and len(after) == 220
rows = []
for key, original in before.items():
    updated = after[key]
    assert np.array_equal(original[..., 3], updated[..., 3])
    density = key[2]
    active = updated[..., 3] > 0
    native_active = active[::density, ::density]
    ring = native_active & ~ndimage.binary_erosion(native_active)
    contacts = ring.repeat(density, 0).repeat(density, 1)
    if args.diffuse_contacts:
        distance = ndimage.distance_transform_edt(np.pad(native_active, 1))[1:-1, 1:-1]
        # Two diagonal native neighbors can span more than one Euclidean pixel.
        # Include the bilinear contact sampler's fringe in the bounded support.
        deep = (distance > 5).repeat(density, 0).repeat(density, 1)
        assert np.array_equal(original[deep], updated[deep]), key
        changed_contacts = int(np.any(original[contacts] != updated[contacts], axis=1).sum())
        assert changed_contacts > 0, key
    else:
        assert np.array_equal(original[contacts], updated[contacts]), key
        changed_contacts = 0
    interior = ndimage.binary_erosion(native_active, iterations=3).repeat(density, 0).repeat(density, 1)
    changed = int((np.any(original[..., :3] != updated[..., :3], axis=2) & interior).sum())
    assert args.diffuse_contacts or changed > 0, key
    rows.append(dict(member=key[0], subTile=key[1], density=density,
                     nativeContactPixels=int(contacts.sum()), changedContactColors=changed_contacts,
                     changedInteriorPixels=changed))
report = dict(schema='m2-4-snow-continuous-light-contact-provenance-audit-v1',
    status=('PASS_NATIVE_ALPHA_BOUNDED_CONTACT_COLOR_AND_EXACT_INTERIOR' if args.diffuse_contacts else
            'PASS_NATIVE_ALPHA_CONTACTS_AND_GENERATED_MOTHER_PROVENANCE'),
    baseManifestSha256=sha(args.base / 'manifest.json'),
    candidateManifestSha256=sha(args.candidate / 'manifest.json'),
    members=len(names), densityPairs=len(rows), masters=list(masters.values()), rows=rows,
    scope=('Original alpha/contact geometry; only boundary RGB changes, deep generated interior stays exact.'
           if args.diffuse_contacts else 'Exact pixel contact and provenance audit.'),
    userAccepted=False)
with args.output.open('x') as stream:
    stream.write(json.dumps(report, indent=2) + '\n')
print(json.dumps(dict(status=report['status'], members=len(names), densityPairs=len(rows), masters=len(masters))))
