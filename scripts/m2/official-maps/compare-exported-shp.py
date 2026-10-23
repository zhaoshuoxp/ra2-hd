"""Prove that a scoped authored correction preserves every other frame and native mask."""
import argparse
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
args = parser.parse_args()
assert not args.output.exists(), 'Preserve previous comparison receipts'
allowed = set(args.allowed_native_frames)
folder = args.member.replace('.', '-')
roots = [root / 'members' / folder for root in (args.before, args.after)]
files = [root / 'manifest.json' for root in roots]
manifests = [json.loads(file.read_text()) for file in files]
for key in ('source', 'logical', 'color', 'sampler'):
    if key in manifests[0] or key in manifests[1]:
        assert manifests[0].get(key) == manifests[1].get(key), key
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
    changed, unchanged = [], []
    for number, old in frames[0].items():
        new = frames[1][number]
        body = [pixels(which, density, entry, 'base') for which, entry in enumerate((old, new))]
        data = [pixels(which, density, entry, 'data') for which, entry in enumerate((old, new))]
        assert np.array_equal(body[0][..., 3], body[1][..., 3]), (density, number, 'native alpha')
        assert np.array_equal(data[0], data[1]), (density, number, 'native owner and auxiliary data')
        same = np.array_equal(body[0], body[1])
        assert same or number in allowed, (density, number, 'undeclared body change')
        (unchanged if same else changed).append(number)
    records.append(dict(density=density, changedNativeFrames=changed,
                        unchangedNativeFrames=unchanged, allAlphaAndDataIdentical=True))
receipt = dict(schema='m2-3-scoped-shp-comparison-v1', status='PASS', member=args.member,
               before=str(args.before), after=str(args.after),
               manifestSha256=[hashlib.sha256(file.read_bytes()).hexdigest() for file in files],
               allowedNativeFrames=sorted(allowed), densities=records,
               policy='Reuse prior static pose evidence only for byte-identical body frames')
args.output.write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(dict(status='PASS', changes={r['density']: r['changedNativeFrames'] for r in records})))
