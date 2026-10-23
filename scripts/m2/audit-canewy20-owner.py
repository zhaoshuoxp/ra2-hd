"""Independently bound R9 material differences and retain every native category."""
import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
from showcase_registration import sha

parser = argparse.ArgumentParser(description=__doc__)
for name in ['base', 'fixed', 'output']:
    parser.add_argument(name, type=Path)
args = parser.parse_args()
old = json.loads((args.base / 'manifest.json').read_text())
new = json.loads((args.fixed / 'manifest.json').read_text())
assert set(old['families']) == set(new['families'])
preserved = [f for f in old['families'] if old['families'][f] == new['families'][f]]
assert len(preserved) == 97
assert set(old['families']) - set(preserved) == {'environment-ctnewy20'}
for family in preserved:
    for member in old['families'][family]['members']:
        assert (args.base / member['path']).read_bytes() == (args.fixed / member['path']).read_bytes()
        for file in (args.base / member['path']).parent.rglob('*.png'):
            assert file.read_bytes() == (args.fixed / file.relative_to(args.base)).read_bytes()
record = old['families']['environment-ctnewy20']['members'][0]
files = [root / record['path'] for root in [args.base, args.fixed]]
before, after = [json.loads(f.read_text()) for f in files]
assert before['source'] == after['source'] and before['logical'] == after['logical']
prep = Path('.artifacts/m2-2/prepared-native-v2')
native = next(s for s in json.loads((prep / 'source.json').read_text())['sources']
              if s['member'] == 'ctnewy20.shp')
changes, exact_pages, exact_frames = [], 0, 0
for a, b in zip(before['variants'], after['variants'], strict=True):
    density = a['density']
    assert a['frames'] == b['frames']
    pages = {}
    for p, q in zip(a['pages'], b['pages'], strict=True):
        assert p['id'] == q['id'] and p['size'] == q['size']
        relative = Path(str(density)) / p['id']
        data = [(f.parent / relative / 'data.png').read_bytes() for f in files]
        assert data[0] == data[1]
        exact_pages += 1
        images = [np.asarray(Image.open(f.parent / relative / 'base.png')) for f in files]
        assert np.array_equal(images[0][..., 3], images[1][..., 3])
        pages[p['id']] = images
    for entry in a['frames']:
        x, y, rw, rh = entry['sampleRect']
        frames = [p[y:y + rh, x:x + rw] for p in pages[entry['page']]]
        diff = (frames[0][..., :3] != frames[1][..., :3]).any(axis=2)
        if not diff.any():
            exact_frames += 1
            continue
        slot = entry['nativeFrame']
        assert slot == 2, 'Only occupied material may change'
        w, h = native['frames'][slot]['size']
        indices = np.frombuffer((prep / 'native' / f'ctnewy20.shp-{slot}.index').read_bytes(),
                               np.uint8).reshape(h, w)
        owner = (indices >= 16) & (indices <= 31)
        allowed = (indices != 0) & (indices != 12) & ~owner & (distance_transform_edt(~owner) <= 6)
        expected = np.zeros((rh, rw), bool)
        expected[:h * density, :w * density] = allowed.repeat(density, 0).repeat(density, 1)
        assert not diff[~expected].any(), 'Owner/contact/transparent/distant material changed'
        rgb = frames[0][..., :3].astype(float)
        red = (rgb[..., 0] - rgb[..., 1:].max(axis=2)) / np.maximum(rgb[..., 0], 1)
        assert (red[diff] >= .22 - 1e-7).all(), 'Non-red authored material changed'
        changes.append(dict(density=density, slot=slot, changedPixels=int(diff.sum())))
assert len(changes) == 2
report = dict(schema='m2-2-canewy20-independent-material-audit-v1', status='PASS',
    baseSha256=sha(args.base / 'manifest.json'), fixedSha256=sha(args.fixed / 'manifest.json'),
    preservedFamilies=97, exactDataPages=exact_pages, exactOtherFrames=exact_frames, changes=changes,
    preserved='All other families/page bytes, all data and alpha, exact owner weights and 16 shades, native source/geometry/frame mapping, neutral/damaged-unoccupied/rubble states and contact pixels.')
args.output.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
