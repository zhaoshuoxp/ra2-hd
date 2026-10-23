"""Check real exported fine detail, native contacts and source-pinned illumination repairs."""
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
args = parser.parse_args()
names, corrections = set(), {}
for root in args.stage:
    recipe = read(root / 'recipe.json')
    corrections.update(recipe['nativeMaterialCorrections'])
    names.update(recipe['nativeMaterialCorrections'])
assert len(names) == 110
before, after = fragments(args.base, names), fragments(args.candidate, names)
assert before.keys() == after.keys() and len(after) == 220
rows = []
for key, original in before.items():
    name, subtile, density = key
    updated = after[key]
    assert np.array_equal(original[..., 3], updated[..., 3])
    active = updated[..., 3] > 0
    # Contact ownership is a native pixel ring. A display-pixel distance at
    # diagonal corners also includes the second native ring's authored fade.
    native_active = active[::density, ::density]
    native_contacts = native_active & ~ndimage.binary_erosion(native_active)
    contacts = native_contacts.repeat(density, 0).repeat(density, 1)
    distance = ndimage.distance_transform_edt(np.pad(active, 1))[1:-1, 1:-1]
    assert np.array_equal(original[contacts], updated[contacts]), name
    interior = distance > 3 * density
    unclipped = ((original[..., :3] > 3) & (original[..., :3] < 252)
                 & (updated[..., :3] > 3) & (updated[..., :3] < 252)).all(2)
    safe = interior & unclipped
    delta = updated[..., :3].astype(np.int16) - original[..., :3].astype(np.int16)
    correction = corrections[name]['nativeSnowPlanarPhotometry']
    degree = correction.get('degree', 1)
    assert degree in (1, 2)
    # A declared degree-N illumination has zero order-N+1 differences. Check
    # the real exported local detail independently of the fitting code.
    order = degree + 1
    samples, mismatches = 0, 0
    for axis in [0, 1]:
        shape = list(safe.shape)
        shape[axis] -= order
        mask = np.ones(shape, dtype=bool)
        for offset in range(order + 1):
            section = [slice(None)] * 2
            section[axis] = slice(offset, offset + shape[axis])
            mask &= safe[tuple(section)]
        values = np.abs(np.diff(delta, n=order, axis=axis)[mask])
        samples += values.size
        mismatches += int((values > 2 ** order).sum())
    assert samples and mismatches / samples <= .01, (key, samples, mismatches)
    rows.append(dict(member=name, subTile=subtile, density=density, exactContactPixels=int(contacts.sum()),
                     detailChecks=samples, quantizationOutliers=mismatches,
                     illuminationDegree=degree, differenceOrder=order,
                     sourceSha256=correction['sourceSha256']))
report = dict(schema='m2-4-snow-relief-photometry-independent-audit-v1',
    status='PASS_NATIVE_ALPHA_CONTACTS_AND_GENERATED_LOCAL_DETAIL_RETAINED',
    baseManifestSha256=sha(args.base / 'manifest.json'), candidateManifestSha256=sha(args.candidate / 'manifest.json'),
    members=len(names), densityPairs=len(rows), rows=rows, userAccepted=False,
    policy='Correct only declared source-pinned polynomial illumination. No blur, enlargement, native pixel texture or new mother art.')
with args.output.open('x') as stream:
    stream.write(json.dumps(report, indent=2) + '\n')
print(json.dumps(dict(status=report['status'], members=len(names), densityPairs=len(rows),
    detailChecks=sum(row['detailChecks'] for row in rows))))
