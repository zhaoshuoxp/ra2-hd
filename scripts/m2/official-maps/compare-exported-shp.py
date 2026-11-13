"""Prove that a scoped authored correction preserves every other frame and native mask."""
import argparse
import copy
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('before', type=Path)
parser.add_argument('after', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--member', required=True)
parser.add_argument('--allowed-native-frames', nargs='+', type=int, required=True)
parser.add_argument('--owner-data-only', action='store_true',
                    help='Permit changes only inside source-qualified ownership regions and their antialiasing')
parser.add_argument('--prepared', type=Path)
parser.add_argument('--preserve-all-alpha', action='store_true')
args = parser.parse_args()
assert not args.output.exists(), 'Preserve previous comparison receipts'
allowed = set(args.allowed_native_frames)
files = []
for pack in (args.before, args.after):
    declared = json.loads((pack / 'manifest.json').read_text())
    members = {member['path'] for family in declared['families'].values() for member in family['members']
               if member['member'] == args.member}
    member, = members
    files.append(pack / member)
roots = [file.parent for file in files]
manifests = [json.loads(file.read_text()) for file in files]
for key in ('source', 'logical', 'color', 'sampler'):
    if key in manifests[0] or key in manifests[1]:
        old, new = manifests[0].get(key), copy.deepcopy(manifests[1].get(key))
        if args.owner_data_only and key == 'color':
            for registration in ['authoredRegionRegistration', 'curvedArchRegistration']:
                if not old.get(registration):
                    continue
                original, current = old[registration], new[registration]
                current.pop('nativeOwnership', None)
                if current.get('schema') == 'source-pinned-owned-authored-regions-v3':
                    current['schema'] = original['schema']
                    for before, after in zip(original['regions'], current['regions']):
                        for admission in ['nativeOwnerPixels', 'nativeOwnerMaskSha256', 'paletteSha256']:
                            if admission not in before:
                                after.pop(admission, None)
        assert old == new, key
native = None
if args.owner_data_only:
    assert args.prepared
    native, = [row for row in json.loads((args.prepared / 'source.json').read_text())['sources']
               if row['member'] == args.member]
    assert native['remapable'] and native['sha256'] == manifests[0]['source']['sha256']
pages = {}


def pixels(which, density, entry, channel):
    key = (which, density, entry['page'], channel)
    if key not in pages:
        file = roots[which] / str(density) / entry['page'] / f'{channel}.png'
        pages[key] = Image.open(file).convert('RGBA')
    x, y, width, height = entry['contentRect']
    return np.asarray(pages[key].crop((x, y, x + width, y + height)))


records = []
for density in (2, 4):
    variants = [next(v for v in manifest['variants'] if v['density'] == density)
                for manifest in manifests]
    frames = [{entry['nativeFrame']: entry for entry in variant['frames']} for variant in variants]
    assert frames[0].keys() == frames[1].keys()
    assert allowed.issubset(frames[0])
    changed, unchanged, pixel_records = [], [], []
    for number, old in frames[0].items():
        new = frames[1][number]
        body = [pixels(which, density, entry, 'base') for which, entry in enumerate((old, new))]
        data = [pixels(which, density, entry, 'data') for which, entry in enumerate((old, new))]
        alpha_changed = body[0][..., 3] != body[1][..., 3]
        same = np.array_equal(body[0], body[1])
        if args.owner_data_only:
            frame = native['frames'][number]
            index_file = args.prepared / 'native' / frame['indexFile']
            assert hashlib.sha256(index_file.read_bytes()).hexdigest() == frame['indexSha256']
            indices = np.frombuffer(index_file.read_bytes(), np.uint8).reshape(frame['size'][::-1])
            owner = ((indices >= 16) & (indices < 32)).repeat(density, 0).repeat(density, 1)
            area = data[1][..., 0] > 0
            area[:owner.shape[0], :owner.shape[1]] |= owner
            body_changed = np.any(body[0] != body[1], axis=2)
            assert not np.any(body_changed & ~area), (density, number, 'fixed material or silhouette changed')
            assert not body_changed.any() or number in allowed, (density, number, 'undeclared ownership material change')
            if args.preserve_all_alpha:
                assert not alpha_changed.any(), (density, number, 'accepted alpha must remain exact')
            assert np.array_equal(data[0][..., 2:], data[1][..., 2:]), (density, number, 'auxiliary data')
            owner_changed = np.any(data[0][..., :2] != data[1][..., :2], axis=2)
            assert not owner_changed.any() or number in allowed, (density, number, 'undeclared owner-data change')
            assert not np.any(owner_changed & ~area), (density, number, 'changed data outside qualified ownership')
            (changed if owner_changed.any() else unchanged).append(number)
            pixel_records.append(dict(nativeFrame=number, rgbaChangedPixels=int(body_changed.sum()),
                alphaChangedPixels=int(alpha_changed.sum()), ownershipDataChangedPixels=int(owner_changed.sum()),
                allFixedPixelsIdentical=True, nativeIndexSha256=frame['indexSha256']))
        else:
            assert not alpha_changed.any(), (density, number, 'native alpha')
            assert np.array_equal(data[0], data[1]), (density, number, 'native owner and auxiliary data')
            assert same or number in allowed, (density, number, 'undeclared body change')
            (unchanged if same else changed).append(number)
    records.append(dict(density=density, changedNativeFrames=changed,
                        unchangedNativeFrames=unchanged, pixels=pixel_records,
                        allAlphaIdentical=all(not row['alphaChangedPixels'] for row in pixel_records),
                        **(dict(allFixedPixelsIdentical=True) if args.owner_data_only
                           else dict(allAlphaAndDataIdentical=True))))
receipt = dict(schema='m2-3-scoped-shp-comparison-v1', status='PASS', member=args.member,
               before=str(args.before), after=str(args.after),
               manifestSha256=[hashlib.sha256(file.read_bytes()).hexdigest() for file in files],
               allowedNativeFrames=sorted(allowed), densities=records,
               ownerDataOnly=args.owner_data_only,
               policy='Ownership-only mode preserves fixed materials and allows only original ownership regions/antialiasing; other mode preserves all native alpha and auxiliary data.')
args.output.write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(dict(status='PASS', changes={r['density']: r['changedNativeFrames'] for r in records})))
